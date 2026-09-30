/**
 * Data retention sweep (docs/runbooks/DATA_RETENTION.md).
 *
 * One daily job, `runDataRetention`, runs these tasks in isolation (one
 * failing task never stops the others) and records the outcome in
 * `jobRuns/dataRetention_{YYYY-MM-DD}` (platform/jobs.ts):
 *
 *   expireStaffInvites     pending staff invites 7 days past expiry → `expired`
 *                          (code hash KEPT so redeeming the lapsed code says
 *                          "expired", not "invalid"; audited; doc kept)
 *   expireOrganizerCodes   issued organizer codes past expiry → `expired`
 *                          (code hash removed, audited; the doc is kept)
 *   rateLimits             buckets whose window ended > 1 h ago → deleted
 *   commandReceipts        idempotency receipts older than 30 days → deleted
 *   notifications          read inbox entries older than 180 days, and any
 *                          entry older than 365 days → deleted
 *   kycDocuments           Storage `kyc/{uid}/` of applications rejected
 *                          > 180 days ago → deleted, unless a legal hold on
 *                          the user is active (then skipped and counted).
 *                          Resumes from a cursor in `jobState/` each run and
 *                          starts a new cycle when it reaches the end.
 *
 * NEVER deleted here: auditEvents (append-only, ≥ 8 years), ledgerEntries,
 * payments, refunds, paymentEvents, settlements, bookings, tickets — financial
 * and accounting records follow their statutory periods, not this sweep.
 *
 * Every task is bounded (`pageSize` per read, `maxPerTask` per run) and
 * idempotent: it selects only what is still eligible, so a re-run or an
 * overlapping run does nothing twice, and a backlog larger than one run's
 * budget simply continues the next day (`more: true` in the summary).
 */

import * as functions from "firebase-functions/v1";
import { FieldPath, FieldValue, type DocumentSnapshot, type Query } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { writeAudit } from "./audit";
import { requireAdmin } from "./auth";
import { callable, docId, obj, oneOf, optStr, requestId, str } from "./callable";
import { COLLECTIONS, Timestamp, app, db, serverNow } from "./firestore";
import { runJob, type JobSummary } from "./jobs";
import { HOLD_SUBJECTS, isUnderLegalHold, setLegalHold as setLegalHoldSvc } from "./legalHolds";
import { logError } from "./log";
import { raiseRiskAlert } from "../commerce/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

export const RETENTION = {
  /** A rate-limit bucket is deletable this long after its window ended. */
  rateLimitGraceMs: 60 * 60 * 1000,
  /**
   * Receipts only need to outlive the client retry horizon (seconds to
   * minutes). Money idempotency does NOT depend on them: payments and refunds
   * are keyed by their own deterministic ids (`paymentId`, `cxl_/evc_/…`
   * refund ids, provider receipt = our id) and webhooks by `paymentEvents`,
   * none of which this job touches.
   */
  commandReceiptDays: 30,
  readNotificationDays: 180,
  /** Unread entries are kept this long, then go too (inbox hygiene). */
  anyNotificationDays: 365,
  /** Staff invites stay `pending` (re-issuable from listStaff) this long past expiry. */
  staffInviteGraceDays: 7,
  /** Organizer codes can be re-issued from any non-redeemed state; no grace. */
  organizerCodeGraceDays: 0,
  /** KYC files of rejected applicants (no relationship was formed). */
  kycRejectedDays: 180,
  pageSize: 300,
  maxPerTask: 3000,
  /** Rejected applications examined per run for the KYC purge. */
  kycMaxScan: 2000,
} as const;

/**
 * Deletes everything under `prefix`, returning the object count. When given,
 * `beforeEachDelete` runs immediately before every page of deletes and may
 * throw to stop (the KYC purge re-checks the legal hold there); a
 * LegalHoldAppearedError is re-thrown carrying how many objects were already
 * deleted.
 */
export type StorageDeleter = (prefix: string, beforeEachDelete?: () => Promise<void>) => Promise<number>;

/** Deletes every object under `prefix` in the default bucket; returns the count. */
export const deleteStoragePrefix: StorageDeleter = async (prefix, beforeEachDelete) => {
  const bucket = getStorage(app()).bucket();
  let deleted = 0;
  for (;;) {
    const [files] = await bucket.getFiles({ prefix, maxResults: 500 });
    if (files.length === 0) return deleted;
    try {
      await beforeEachDelete?.();
    } catch (e) {
      if (e instanceof LegalHoldAppearedError) throw new LegalHoldAppearedError(deleted);
      throw e;
    }
    await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })));
    deleted += files.length;
  }
};

export interface RetentionOptions {
  now?: Date;
  deleteStorage?: StorageDeleter;
  maxPerTask?: number;
  pageSize?: number;
  /** Override RETENTION.kycMaxScan (tests). */
  kycMaxScan?: number;
}

const ago = (now: Date, ms: number) => Timestamp.fromMillis(now.getTime() - ms);

/** Deletes everything `query` matches, page by page, up to `max` docs. */
async function deleteMatching(query: Query, max: number, pageSize: number): Promise<{ deleted: number; more: boolean }> {
  let deleted = 0;
  for (;;) {
    const room = max - deleted;
    if (room <= 0) return { deleted, more: true };
    const snap = await query.limit(Math.min(pageSize, room)).get();
    if (snap.empty) return { deleted, more: false };
    const batch = db().batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
    deleted += snap.size;
    if (snap.size < Math.min(pageSize, room)) return { deleted, more: false };
  }
}

/**
 * Marks expired access codes `expired`, one transaction per document (it
 * re-checks eligibility, so a concurrent redeem/re-issue always wins).
 */
async function expireCodes(opts: {
  collection: string;
  liveStatus: string;
  cutoff: Timestamp;
  max: number;
  pageSize: number;
  audit: (d: DocumentSnapshot) => { action: string; resourceType: string; orgId: string | null };
  /**
   * Keep the (peppered HMAC) code hash on the expired doc so a later redeem
   * of the real-but-lapsed code can answer "expired" instead of "invalid".
   * An `expired` doc is never matched for redemption, so the hash grants
   * nothing. Needed where the doc can't be found by the redeemer's uid
   * (staff invites are found by phone + hash); organizer activations are
   * keyed by the applicant's uid, so theirs is removed.
   */
  keepCodeHash?: boolean;
}): Promise<{ expired: number; skipped: number; more: boolean }> {
  let expired = 0;
  let skipped = 0;
  const seen = new Set<string>();
  const col = db().collection(opts.collection);
  for (;;) {
    if (expired + skipped >= opts.max) return { expired, skipped, more: true };
    const snap = await col
      .where("status", "==", opts.liveStatus)
      .where("expiresAt", "<", opts.cutoff)
      .limit(opts.pageSize)
      .get();
    const fresh = snap.docs.filter((d) => !seen.has(d.id));
    if (fresh.length === 0) return { expired, skipped, more: false };
    for (const d of fresh) {
      seen.add(d.id);
      const done = await db().runTransaction(async (tx) => {
        const cur = await tx.get(d.ref);
        const data = cur.data();
        const exp = data?.expiresAt as Timestamp | undefined;
        if (!data || data.status !== opts.liveStatus || !exp || exp.toMillis() >= opts.cutoff.toMillis()) return false;
        const now = serverNow();
        tx.update(d.ref, {
          status: "expired",
          ...(opts.keepCodeHash ? {} : { codeHash: FieldValue.delete() }),
          expiredAt: now,
          updatedAt: now,
          version: FieldValue.increment(1),
        });
        const a = opts.audit(cur);
        writeAudit(tx, {
          action: a.action,
          actorUid: "system",
          actorRole: "system",
          resourceType: a.resourceType,
          resourceId: d.id,
          orgId: a.orgId,
          before: { status: opts.liveStatus },
          after: { status: "expired", expiresAt: exp.toDate().toISOString() },
          reason: "Code expired unredeemed (retention sweep).",
          source: "scheduler",
        });
        return true;
      });
      if (done) expired++;
      else skipped++;
    }
    if (snap.size < opts.pageSize) return { expired, skipped, more: false };
  }
}

/** Server-only job state (rules: the catch-all denies every client read/write). */
export const JOB_STATE = "jobState";
/** Where the KYC purge resumes: the last application it examined. */
export const KYC_CURSOR_DOC = "dataRetention_kycCursor";

/** Thrown by the per-page hold check inside a Storage deletion. */
export class LegalHoldAppearedError extends Error {
  constructor(public readonly deletedBeforeStop: number) {
    super("A legal hold was placed while the deletion was in progress.");
  }
}

/**
 * Purges KYC files of applications rejected more than `kycRejectedDays` ago.
 *
 * Walks the rejected applications in (decidedAt, id) order from a persisted
 * cursor (`jobState/dataRetention_kycCursor`), so already-purged or held
 * applications at the old end never eat the per-run scan budget: each run
 * continues where the last one stopped. When a run reaches the end of the
 * eligible set, the cursor is cleared and the next run starts a new cycle
 * from the oldest, which is how an application whose legal hold has since
 * been released is eventually purged. Uses the (status, decidedAt) index
 * (its entries are already ordered by document id, so the id tie-break needs
 * nothing more).
 *
 * The legal hold is checked before the deletion starts, again immediately
 * before every page of Storage deletes, and once more inside the transaction
 * that records the purge. A hold that appears after files were already deleted
 * is never recorded silently: it raises a high-severity risk alert and an
 * ERROR log.
 */
async function purgeRejectedKyc(now: Date, deleter: StorageDeleter, max: number, pageSize: number, maxScan: number = RETENTION.kycMaxScan) {
  const cutoff = ago(now, RETENTION.kycRejectedDays * DAY_MS);
  const counts = {
    purged: 0,
    files: 0,
    held: 0,
    alreadyPurged: 0,
    /** Hold placed mid-deletion: deletion stopped, nothing recorded as purged. */
    stoppedByHold: 0,
    /** Files deleted, then the hold was found at record time (alerted). */
    purgedDespiteHold: 0,
    scanned: 0,
    failed: 0,
  };
  const failures: string[] = [];
  const cursorRef = db().collection(JOB_STATE).doc(KYC_CURSOR_DOC);
  const saved = (await cursorRef.get()).data();
  let after: { decidedAt: Timestamp; id: string } | null =
    saved?.decidedAt instanceof Timestamp && typeof saved.id === "string" ? { decidedAt: saved.decidedAt, id: saved.id } : null;
  const resumedFromCursor = after !== null;
  let reachedEnd = false;

  scan: for (;;) {
    const room = maxScan - counts.scanned;
    if (room <= 0 || counts.purged >= max) break;
    const want = Math.min(pageSize, room);
    let q = db()
      .collection(COLLECTIONS.organizerApplications)
      .where("status", "==", "rejected")
      .where("decidedAt", "<", cutoff)
      .orderBy("decidedAt")
      .orderBy(FieldPath.documentId())
      .limit(want);
    if (after) q = q.startAfter(after.decidedAt, after.id);
    const snap = await q.get();
    for (const d of snap.docs) {
      if (counts.purged >= max) break scan; // cursor stays on the last examined
      counts.scanned++;
      after = { decidedAt: d.data().decidedAt as Timestamp, id: d.id };
      if (d.data().kycPurgedAt) {
        counts.alreadyPurged++;
        continue;
      }
      const uid = d.id;
      if (await isUnderLegalHold("user", uid)) {
        counts.held++;
        continue;
      }
      try {
        const n = await deleter(`kyc/${uid}/`, async () => {
          if (await isUnderLegalHold("user", uid)) throw new LegalHoldAppearedError(0);
        });
        const heldAtRecord = await db().runTransaction(async (tx) => {
          const cur = await tx.get(d.ref);
          const heldNow = await isUnderLegalHold("user", uid, tx);
          if (!cur.exists || cur.data()?.kycPurgedAt) return null;
          const t = serverNow();
          tx.update(d.ref, { kycPurgedAt: t, kycFilesDeleted: n, ...(heldNow ? { kycPurgedDespiteHold: true } : {}), updatedAt: t });
          writeAudit(tx, {
            action: "retention.kyc-purged",
            actorUid: "system",
            actorRole: "system",
            resourceType: "organizerApplication",
            resourceId: uid,
            after: {
              filesDeleted: n,
              rejectedAt: (cur.data()?.decidedAt as Timestamp | undefined)?.toDate().toISOString() ?? null,
              ...(heldNow ? { legalHoldActiveAtRecord: true } : {}),
            },
            reason: heldNow
              ? "KYC documents deleted; a legal hold was placed on the user while the deletion ran (risk alert raised)."
              : `KYC documents of a rejected application deleted after ${RETENTION.kycRejectedDays} days.`,
            source: "scheduler",
          });
          if (heldNow) {
            raiseRiskAlert(tx, `kyc-purged-under-hold_${uid}`, {
              kind: "kyc-purged-under-hold",
              severity: "high",
              summary: "KYC documents were deleted by retention while a legal hold was being placed on the user. Check what the hold needed.",
              detail: { uid, filesDeleted: n },
            });
          }
          return heldNow;
        });
        if (heldAtRecord === null) continue;
        counts.files += n;
        counts.purged++;
        if (heldAtRecord) {
          counts.purgedDespiteHold++;
          logError({ event: "retention.kyc-purged-under-hold", job: "dataRetention", uid, filesDeleted: n });
        }
      } catch (e) {
        if (e instanceof LegalHoldAppearedError) {
          counts.stoppedByHold++;
          if (e.deletedBeforeStop > 0) {
            // Some files are already gone: never silent.
            await db().runTransaction(async (tx) => {
              raiseRiskAlert(tx, `kyc-purged-under-hold_${uid}`, {
                kind: "kyc-purged-under-hold",
                severity: "high",
                summary: "A legal hold was placed while retention was deleting this user's KYC documents; some were already deleted.",
                detail: { uid, filesDeleted: e.deletedBeforeStop, partial: true },
              });
            });
            logError({ event: "retention.kyc-purged-under-hold", job: "dataRetention", uid, filesDeleted: e.deletedBeforeStop, partial: true });
          }
          continue;
        }
        counts.failed++;
        failures.push(`${uid}: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
      }
    }
    if (snap.size < want) {
      reachedEnd = true;
      break;
    }
  }

  // Persist where to continue; at the end of the eligible set, start over.
  await cursorRef.set(
    reachedEnd || !after
      ? { decidedAt: null, id: null, cycleCompletedAt: serverNow(), updatedAt: serverNow() }
      : { decidedAt: after.decidedAt, id: after.id, updatedAt: serverNow() },
    { merge: true }
  );
  if (failures.length) throw new Error(`KYC purge failed for ${failures.length} application(s): ${failures.slice(0, 5).join("; ")}`);
  return { ...counts, resumedFromCursor, cycleComplete: reachedEnd, more: !reachedEnd };
}

/** The whole sweep. Exported for tests and for a manual run from a shell. */
export async function runRetention(opts: RetentionOptions = {}): Promise<JobSummary> {
  const now = opts.now ?? new Date();
  const max = opts.maxPerTask ?? RETENTION.maxPerTask;
  const page = opts.pageSize ?? RETENTION.pageSize;
  const deleter = opts.deleteStorage ?? deleteStoragePrefix;
  const col = (name: string) => db().collection(name);

  return runJob("dataRetention", {
    expireStaffInvites: () =>
      expireCodes({
        collection: COLLECTIONS.staffInvites,
        liveStatus: "pending",
        cutoff: ago(now, RETENTION.staffInviteGraceDays * DAY_MS),
        max,
        pageSize: page,
        audit: (d) => ({ action: "staff.invite-expired", resourceType: "staffInvite", orgId: (d.data()?.orgId as string | undefined) ?? null }),
        keepCodeHash: true,
      }),
    expireOrganizerCodes: () =>
      expireCodes({
        collection: COLLECTIONS.organizerActivations,
        liveStatus: "issued",
        cutoff: ago(now, RETENTION.organizerCodeGraceDays * DAY_MS),
        max,
        pageSize: page,
        audit: (d) => ({ action: "organizer.code-expired", resourceType: "organizerActivation", orgId: (d.data()?.orgId as string | undefined) ?? null }),
      }),
    rateLimits: () => deleteMatching(col(COLLECTIONS.rateLimits).where("expiresAt", "<", ago(now, RETENTION.rateLimitGraceMs)), max, page),
    commandReceipts: async () => {
      // Receipts carry `createdAt` (catalog/identity/governance/agreements)
      // or `at` (reserveSeat/cancelBooking/decideRefund/settlement/check-in).
      const cutoff = ago(now, RETENTION.commandReceiptDays * DAY_MS);
      const a = await deleteMatching(col(COLLECTIONS.commandReceipts).where("createdAt", "<", cutoff), max, page);
      const b = await deleteMatching(col(COLLECTIONS.commandReceipts).where("at", "<", cutoff), Math.max(0, max - a.deleted), page);
      return { deleted: a.deleted + b.deleted, more: a.more || b.more };
    },
    notifications: async () => {
      const read = await deleteMatching(
        col(COLLECTIONS.userNotifications).where("read", "==", true).where("createdAt", "<", ago(now, RETENTION.readNotificationDays * DAY_MS)),
        max,
        page
      );
      const old = await deleteMatching(
        col(COLLECTIONS.userNotifications).where("createdAt", "<", ago(now, RETENTION.anyNotificationDays * DAY_MS)),
        Math.max(0, max - read.deleted),
        page
      );
      return { readDeleted: read.deleted, expiredDeleted: old.deleted, more: read.more || old.more };
    },
    kycDocuments: () => purgeRejectedKyc(now, deleter, max, page, opts.kycMaxScan ?? RETENTION.kycMaxScan),
  });
}

/* --------------------------------------------------------------- functions */

/**
 * Daily at 03:17 IST (off-peak, off the top of the hour). Not retried: the
 * next run is a day away and everything it does is idempotent; a failure is
 * visible in jobRuns, in the `job.failed` log and as a failed execution.
 */
export const runDataRetention = functions
  .region("asia-south1")
  .runWith({ timeoutSeconds: 540, memory: "512MB" })
  .pubsub.schedule("17 3 * * *")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    await runRetention();
  });

/** Console: place or release a legal hold (platform-owner / super-admin). */
export const setLegalHold = callable(async (data, context) => {
  const admin = requireAdmin(context, "legal-holds.manage");
  const d = obj(data);
  return setLegalHoldSvc(admin, {
    requestId: requestId(d.requestId),
    subjectType: oneOf(d.subjectType, "subjectType", HOLD_SUBJECTS),
    subjectId: docId(d.subjectId, "subjectId"),
    action: oneOf(d.action, "action", ["place", "release"] as const),
    reason: str(d.reason, "Reason", 10, 1000),
    reference: optStr(d.reference, "reference", 200),
  });
});
