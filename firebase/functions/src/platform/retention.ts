/**
 * Data retention sweep (docs/runbooks/DATA_RETENTION.md).
 *
 * One daily job, `runDataRetention`, runs these tasks in isolation (one
 * failing task never stops the others) and records the outcome in
 * `jobRuns/dataRetention_{YYYY-MM-DD}` (platform/jobs.ts):
 *
 *   expireStaffInvites     pending staff invites 7 days past expiry → `expired`
 *                          (code hash removed, audited; the doc is kept)
 *   expireOrganizerCodes   issued organizer codes past expiry → `expired`
 *                          (code hash removed, audited; the doc is kept)
 *   rateLimits             buckets whose window ended > 1 h ago → deleted
 *   commandReceipts        idempotency receipts older than 30 days → deleted
 *   notifications          read inbox entries older than 180 days, and any
 *                          entry older than 365 days → deleted
 *   kycDocuments           Storage `kyc/{uid}/` of applications rejected
 *                          > 180 days ago → deleted, unless a legal hold on
 *                          the user is active (then skipped and counted)
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
import { FieldValue, type DocumentSnapshot, type Query } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { writeAudit } from "./audit";
import { requireAdmin } from "./auth";
import { callable, docId, obj, oneOf, optStr, requestId, str } from "./callable";
import { COLLECTIONS, Timestamp, app, db, serverNow } from "./firestore";
import { runJob, type JobSummary } from "./jobs";
import { HOLD_SUBJECTS, isUnderLegalHold, setLegalHold as setLegalHoldSvc } from "./legalHolds";

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

export type StorageDeleter = (prefix: string) => Promise<number>;

/** Deletes every object under `prefix` in the default bucket; returns the count. */
export const deleteStoragePrefix: StorageDeleter = async (prefix) => {
  const bucket = getStorage(app()).bucket();
  let deleted = 0;
  for (;;) {
    const [files] = await bucket.getFiles({ prefix, maxResults: 500 });
    if (files.length === 0) return deleted;
    await Promise.all(files.map((f) => f.delete({ ignoreNotFound: true })));
    deleted += files.length;
  }
};

export interface RetentionOptions {
  now?: Date;
  deleteStorage?: StorageDeleter;
  maxPerTask?: number;
  pageSize?: number;
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
          codeHash: FieldValue.delete(),
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

async function purgeRejectedKyc(now: Date, deleter: StorageDeleter, max: number, pageSize: number) {
  const cutoff = ago(now, RETENTION.kycRejectedDays * DAY_MS);
  let purged = 0;
  let files = 0;
  let held = 0;
  let scanned = 0;
  const failures: string[] = [];
  let cursor: DocumentSnapshot | null = null;
  for (;;) {
    if (scanned >= RETENTION.kycMaxScan || purged >= max) break;
    let q = db()
      .collection(COLLECTIONS.organizerApplications)
      .where("status", "==", "rejected")
      .where("decidedAt", "<", cutoff)
      .orderBy("decidedAt")
      .limit(pageSize);
    if (cursor) q = q.startAfter(cursor);
    const snap = await q.get();
    if (snap.empty) break;
    scanned += snap.size;
    cursor = snap.docs[snap.docs.length - 1]!;
    for (const d of snap.docs) {
      if (d.data().kycPurgedAt) continue;
      const uid = d.id;
      if (await isUnderLegalHold("user", uid)) {
        held++;
        continue;
      }
      try {
        const n = await deleter(`kyc/${uid}/`);
        files += n;
        await db().runTransaction(async (tx) => {
          const cur = await tx.get(d.ref);
          if (!cur.exists || cur.data()?.kycPurgedAt) return;
          const t = serverNow();
          tx.update(d.ref, { kycPurgedAt: t, kycFilesDeleted: n, updatedAt: t });
          writeAudit(tx, {
            action: "retention.kyc-purged",
            actorUid: "system",
            actorRole: "system",
            resourceType: "organizerApplication",
            resourceId: uid,
            after: { filesDeleted: n, rejectedAt: (cur.data()?.decidedAt as Timestamp | undefined)?.toDate().toISOString() ?? null },
            reason: `KYC documents of a rejected application deleted after ${RETENTION.kycRejectedDays} days.`,
            source: "scheduler",
          });
        });
        purged++;
      } catch (e) {
        failures.push(`${uid}: ${String((e as Error)?.message ?? e).slice(0, 120)}`);
      }
    }
    if (snap.size < pageSize) break;
  }
  if (failures.length) throw new Error(`KYC purge failed for ${failures.length} application(s): ${failures.slice(0, 5).join("; ")}`);
  return { purged, files, held, scanned, more: scanned >= RETENTION.kycMaxScan };
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
    kycDocuments: () => purgeRejectedKyc(now, deleter, max, page),
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
