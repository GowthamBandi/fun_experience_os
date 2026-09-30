/**
 * Operations hardening: data retention (+ legal holds), job bookkeeping,
 * new rate limits, push-token hygiene, bounded reminders and log hygiene.
 * Runs against the Firestore emulator (Storage is replaced by an injected
 * deleter, since the suite runs with --only firestore,auth).
 */

import { adminCtx, call, callCode, commerce, db, phoneCtx, rid, Timestamp, uniq } from "./commerce-helpers";
import * as catalog from "../src/catalog";
import { runRetention, setLegalHold, RETENTION } from "../src/platform/retention";
import { runJob, jobRunId } from "../src/platform/jobs";
import { LIMITS } from "../src/platform/rateLimit";
import { sanitize } from "../src/platform/log";
import { MAX_PUSH_TOKENS, registerPushTokenService, unregisterPushTokenService } from "../src/identity/push";
import { updateMyProfile } from "../src/identity/profile";
import { redeemOrganizerCode } from "../src/identity/organizer";
import { ORGANIZER_CODE_LENGTH } from "../src/governance/organizerOnboarding";
import { sendEventReminders } from "../src/commerce/reminders";
import { DomainError } from "../src/platform/errors";

jest.setTimeout(180_000);

const DAY = 24 * 3_600_000;
const ts = (msFromNow: number) => Timestamp.fromMillis(Date.now() + msFromNow);
const get = async (path: string) => (await db().doc(path).get()).data();
const exists = async (path: string) => (await db().doc(path).get()).exists;
/** A unique, valid-looking mobile per actor so no other suite's phone lookup can match it. */
const phoneActor = (uid: string) => ({ uid, phone: `+917${String(Math.floor(Math.random() * 1e9)).padStart(9, "0")}`, platformRole: null });

async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof DomainError ? e.code : `UNEXPECTED:${(e as Error).message}`;
  }
}

async function auditsFor(resourceId: string, action: string) {
  const s = await db().collection("auditEvents").where("resourceId", "==", resourceId).get();
  return s.docs.map((d) => d.data()).filter((a) => a.action === action);
}

/* ================================================================ retention */

describe("runRetention", () => {
  test("expires lapsed codes (keeps docs, audits), deletes stale rate limits / receipts / notifications, purges rejected KYC unless held; idempotent", async () => {
    const t = uniq("ret");
    const w = {
      rlOld: `rl-old-${t}`,
      rlLive: `rl-live-${t}`,
      rcOldCreated: `rc-old-c-${t}`,
      rcOldAt: `rc-old-a-${t}`,
      rcNew: `rc-new-${t}`,
      nReadOld: `n-read-old-${t}`,
      nUnread200: `n-unread-200-${t}`,
      nUnread400: `n-unread-400-${t}`,
      nReadNew: `n-read-new-${t}`,
      invOld: `inv-old-${t}`,
      invGrace: `inv-grace-${t}`,
      invRedeemed: `inv-redeemed-${t}`,
      actExpired: `act-exp-${t}`,
      actLive: `act-live-${t}`,
      kycOld: `kyc-old-${t}`,
      kycHeld: `kyc-held-${t}`,
      kycRecent: `kyc-recent-${t}`,
      kycApproved: `kyc-approved-${t}`,
    };
    const f = db();
    await Promise.all([
      f.doc(`rateLimits/${w.rlOld}`).set({ count: 3, windowStart: ts(-3 * DAY), expiresAt: ts(-2 * DAY) }),
      f.doc(`rateLimits/${w.rlLive}`).set({ count: 3, windowStart: ts(-60_000), expiresAt: ts(3_600_000) }),
      f.doc(`commandReceipts/${w.rcOldCreated}`).set({ action: "x", actorUid: "u", result: {}, createdAt: ts(-40 * DAY) }),
      f.doc(`commandReceipts/${w.rcOldAt}`).set({ command: "reserveSeat", actorUid: "u", result: {}, at: ts(-31 * DAY) }),
      f.doc(`commandReceipts/${w.rcNew}`).set({ action: "x", actorUid: "u", result: {}, createdAt: ts(-2 * DAY) }),
      f.doc(`userNotifications/${w.nReadOld}`).set({ recipientUid: "u", kind: "event-reminder", read: true, createdAt: ts(-200 * DAY) }),
      f.doc(`userNotifications/${w.nUnread200}`).set({ recipientUid: "u", kind: "event-reminder", read: false, createdAt: ts(-200 * DAY) }),
      f.doc(`userNotifications/${w.nUnread400}`).set({ recipientUid: "u", kind: "event-reminder", read: false, createdAt: ts(-400 * DAY) }),
      f.doc(`userNotifications/${w.nReadNew}`).set({ recipientUid: "u", kind: "event-reminder", read: true, createdAt: ts(-10 * DAY) }),
      f.doc(`staffInvites/${w.invOld}`).set({ orgId: "org-r", status: "pending", codeHash: "h".repeat(64), expiresAt: ts(-10 * DAY) }),
      f.doc(`staffInvites/${w.invGrace}`).set({ orgId: "org-r", status: "pending", codeHash: "h".repeat(64), expiresAt: ts(-2 * DAY) }),
      f.doc(`staffInvites/${w.invRedeemed}`).set({ orgId: "org-r", status: "redeemed", expiresAt: ts(-30 * DAY) }),
      f.doc(`organizerActivations/${w.actExpired}`).set({ orgId: "org-a", status: "issued", codeHash: "h".repeat(64), expiresAt: ts(-60_000), version: 0 }),
      f.doc(`organizerActivations/${w.actLive}`).set({ orgId: "org-b", status: "issued", codeHash: "h".repeat(64), expiresAt: ts(5 * DAY), version: 0 }),
      f.doc(`organizerApplications/${w.kycOld}`).set({ status: "rejected", decidedAt: ts(-200 * DAY) }),
      f.doc(`organizerApplications/${w.kycHeld}`).set({ status: "rejected", decidedAt: ts(-300 * DAY) }),
      f.doc(`organizerApplications/${w.kycRecent}`).set({ status: "rejected", decidedAt: ts(-20 * DAY) }),
      f.doc(`organizerApplications/${w.kycApproved}`).set({ status: "approved", decidedAt: ts(-400 * DAY) }),
      f.doc(`legalHolds/user_${w.kycHeld}`).set({ subjectType: "user", subjectId: w.kycHeld, status: "active", reason: "Consumer complaint pending" }),
    ]);

    const deletedPrefixes: string[] = [];
    const deleteStorage = async (prefix: string) => {
      deletedPrefixes.push(prefix);
      return 2;
    };
    const summary = await runRetention({ deleteStorage });
    expect(summary.status).toBe("ok");

    // Codes: expired and scrubbed, never deleted; audited once.
    const inv = (await get(`staffInvites/${w.invOld}`))!;
    expect(inv.status).toBe("expired");
    expect(inv).not.toHaveProperty("codeHash");
    expect((await get(`staffInvites/${w.invGrace}`))!.status).toBe("pending"); // inside the re-issue grace
    expect((await get(`staffInvites/${w.invRedeemed}`))!.status).toBe("redeemed");
    const act = (await get(`organizerActivations/${w.actExpired}`))!;
    expect(act).toMatchObject({ status: "expired", version: 1 });
    expect(act).not.toHaveProperty("codeHash");
    expect((await get(`organizerActivations/${w.actLive}`))!.status).toBe("issued");
    expect(await auditsFor(w.invOld, "staff.invite-expired")).toHaveLength(1);
    expect(await auditsFor(w.actExpired, "organizer.code-expired")).toHaveLength(1);

    // Deletions.
    expect(await exists(`rateLimits/${w.rlOld}`)).toBe(false);
    expect(await exists(`rateLimits/${w.rlLive}`)).toBe(true);
    expect(await exists(`commandReceipts/${w.rcOldCreated}`)).toBe(false);
    expect(await exists(`commandReceipts/${w.rcOldAt}`)).toBe(false);
    expect(await exists(`commandReceipts/${w.rcNew}`)).toBe(true);
    expect(await exists(`userNotifications/${w.nReadOld}`)).toBe(false);
    expect(await exists(`userNotifications/${w.nUnread200}`)).toBe(true); // unread kept until 365 d
    expect(await exists(`userNotifications/${w.nUnread400}`)).toBe(false);
    expect(await exists(`userNotifications/${w.nReadNew}`)).toBe(true);

    // KYC: old rejected purged; held skipped; recent and approved untouched.
    expect(deletedPrefixes).toContain(`kyc/${w.kycOld}/`);
    expect(deletedPrefixes).not.toContain(`kyc/${w.kycHeld}/`);
    expect(deletedPrefixes).not.toContain(`kyc/${w.kycRecent}/`);
    expect(deletedPrefixes).not.toContain(`kyc/${w.kycApproved}/`);
    expect((await get(`organizerApplications/${w.kycOld}`))!.kycPurgedAt).toBeInstanceOf(Timestamp);
    expect((await get(`organizerApplications/${w.kycHeld}`))!.kycPurgedAt).toBeUndefined();
    expect(await auditsFor(w.kycOld, "retention.kyc-purged")).toHaveLength(1);
    expect((summary.steps.kycDocuments as { held: number }).held).toBeGreaterThanOrEqual(1);

    // Summary document.
    const run = (await get(`jobRuns/${jobRunId("dataRetention")}`))!;
    expect(run).toMatchObject({ job: "dataRetention", lastStatus: "ok" });
    expect(run.runs).toBeGreaterThanOrEqual(1);

    // Idempotent: a second run changes nothing it already did.
    deletedPrefixes.length = 0;
    const again = await runRetention({ deleteStorage });
    expect(again.status).toBe("ok");
    expect(deletedPrefixes).not.toContain(`kyc/${w.kycOld}/`);
    expect(await auditsFor(w.invOld, "staff.invite-expired")).toHaveLength(1);
    expect(await auditsFor(w.actExpired, "organizer.code-expired")).toHaveLength(1);
    expect(await auditsFor(w.kycOld, "retention.kyc-purged")).toHaveLength(1);

    // Releasing the hold lets the next run purge.
    await db().doc(`legalHolds/user_${w.kycHeld}`).update({ status: "released" });
    await runRetention({ deleteStorage });
    expect(deletedPrefixes).toContain(`kyc/${w.kycHeld}/`);
  });

  test("audit events are never deleted, however old", async () => {
    const id = uniq("audit-old");
    await db().doc(`auditEvents/${id}`).set({ action: "x", at: ts(-3000 * DAY), createdAt: ts(-3000 * DAY) });
    await runRetention({ deleteStorage: async () => 0 });
    expect(await exists(`auditEvents/${id}`)).toBe(true);
  });

  test("a failing task is recorded and surfaced, and the other tasks still run", async () => {
    const t = uniq("fail");
    await db().doc(`organizerApplications/${t}`).set({ status: "rejected", decidedAt: ts(-500 * DAY) });
    await db().doc(`rateLimits/${t}`).set({ count: 1, expiresAt: ts(-5 * DAY) });
    const before = (await get(`jobRuns/${jobRunId("dataRetention")}`))?.failures ?? 0;
    await expect(
      runRetention({
        deleteStorage: async () => {
          throw new Error("storage unavailable");
        },
      })
    ).rejects.toThrow(/kycDocuments/);
    expect(await exists(`rateLimits/${t}`)).toBe(false);
    const run = (await get(`jobRuns/${jobRunId("dataRetention")}`))!;
    expect(run.lastStatus).toBe("failed");
    expect(run.failures).toBe(before + 1);
    expect(run.lastErrors[0].step).toBe("kycDocuments");
    // Not marked purged, so tomorrow's run retries it.
    expect((await get(`organizerApplications/${t}`))!.kycPurgedAt).toBeUndefined();
    // Clean up so later runs in this suite don't keep failing on it.
    await db().doc(`organizerApplications/${t}`).delete();
  });

  test("retention windows are the documented ones", () => {
    expect(RETENTION).toMatchObject({
      commandReceiptDays: 30,
      readNotificationDays: 180,
      anyNotificationDays: 365,
      staffInviteGraceDays: 7,
      kycRejectedDays: 180,
    });
  });
});

/* ============================================================== legal holds */

describe("setLegalHold", () => {
  test("admins place and release holds with audit; replay-safe; conflicts and non-admins refused", async () => {
    const subjectId = uniq("held-user");
    const admin = adminCtx("admin-hold-1");
    const placeRid = rid();
    const place = { requestId: placeRid, subjectType: "user", subjectId, action: "place", reason: "Chargeback dispute CB-1042 open", reference: "CB-1042" };
    const placed = await call(setLegalHold, place, admin);
    expect(placed).toMatchObject({ holdId: `user_${subjectId}`, status: "active", replayed: false });
    expect(await call(setLegalHold, place, admin)).toMatchObject({ status: "active", replayed: true });
    expect(await get(`legalHolds/user_${subjectId}`)).toMatchObject({ status: "active", placedBy: "admin-hold-1", reference: "CB-1042" });

    expect(await callCode(setLegalHold, { ...place, requestId: rid() }, admin)).toBe("CONFLICT");
    expect(await callCode(setLegalHold, { ...place, requestId: rid() }, phoneCtx("cust-hold"))).toBe("NOT_PERMITTED");
    expect(await callCode(setLegalHold, { ...place, requestId: rid(), reason: "short" }, admin)).toBe("INVALID_INPUT");
    expect(await callCode(setLegalHold, { ...place, requestId: rid(), subjectType: "organizer" }, admin)).toBe("INVALID_INPUT");

    const released = await call(setLegalHold, { ...place, requestId: rid(), action: "release", reason: "Dispute closed in our favour" }, adminCtx("admin-hold-2"));
    expect(released).toMatchObject({ status: "released", version: 1 });
    expect(await callCode(setLegalHold, { ...place, requestId: rid(), action: "release", reason: "Dispute closed again" }, admin)).toBe("PRECONDITION");

    const audits = await db().collection("auditEvents").where("resourceId", "==", `user_${subjectId}`).get();
    expect(audits.docs.map((d) => d.data().action).sort()).toEqual(["legal-hold.placed", "legal-hold.released"]);
  });
});

/* ================================================================= jobs */

describe("runJob", () => {
  test("isolates steps, records the day's summary and rethrows on failure", async () => {
    const job = uniq("testJob");
    let ranSecond = false;
    await expect(
      runJob(job, {
        first: async () => {
          throw new Error("boom for +919812345678");
        },
        second: async () => {
          ranSecond = true;
          return { done: 3 };
        },
      })
    ).rejects.toThrow(/first: boom/);
    expect(ranSecond).toBe(true);
    const doc = (await get(`jobRuns/${jobRunId(job)}`))!;
    expect(doc).toMatchObject({ job, runs: 1, failures: 1, lastStatus: "failed", lastSteps: { second: { done: 3 }, first: { failed: true } } });
    expect(JSON.stringify(doc.lastErrors)).not.toContain("9812345678");
    const ok = await runJob(job, { only: async () => 7 });
    expect(ok.status).toBe("ok");
    const after = (await get(`jobRuns/${jobRunId(job)}`))!;
    expect(after).toMatchObject({ runs: 2, failures: 1, lastStatus: "ok", lastErrors: [] });
    expect(after.lastSteps).toEqual({ only: { count: 7 } });
  });
});

/* ============================================================ rate limits */

describe("new rate limits", () => {
  test("requestRefund: limited per uid before any lookup", async () => {
    const ctx = phoneCtx(uniq("refund-spam"));
    const input = () => ({ requestId: rid(), orgId: "org-nope", bookingId: "booking-nope", amountMinor: 100, reason: "Venue flooded" });
    const codes: string[] = [];
    for (let i = 0; i < 21; i++) codes.push(await callCode(commerce.requestRefund, input(), ctx));
    expect(codes.slice(0, 20)).not.toContain("RATE_LIMITED");
    expect(codes[20]).toBe("RATE_LIMITED");
  });

  test("submitEvent / submitExperience share one governance-submission budget", async () => {
    const ctx = phoneCtx(uniq("submit-spam"));
    const n = LIMITS.catalogSubmit.limit;
    const codes: string[] = [];
    for (let i = 0; i < n; i++) {
      const fn = i % 2 ? catalog.submitEvent : catalog.submitExperience;
      codes.push(await callCode(fn, { requestId: rid(), orgId: "org-nope", eventId: "event-nope", experienceId: "exp-nope" }, ctx));
    }
    expect(codes).not.toContain("RATE_LIMITED");
    expect(await callCode(catalog.submitEvent, { requestId: rid(), orgId: "org-nope", eventId: "event-nope" }, ctx)).toBe("RATE_LIMITED");
  });

  test("updateMyProfile and push-token registration are limited per uid", async () => {
    const uid = uniq("profile-spam");
    const cmd = { displayName: "Asha", bio: null, birthDate: "1990-01-01", gender: "woman" as const };
    for (let i = 0; i < LIMITS.profileUpdate.limit; i++) await updateMyProfile(cmd, phoneActor(uid));
    expect(await codeOf(updateMyProfile(cmd, phoneActor(uid)))).toBe("RATE_LIMITED");

    const pushUid = uniq("push-spam");
    for (let i = 0; i < LIMITS.pushToken.limit; i++) await registerPushTokenService(pushUid, { token: `tok-${i}-${"x".repeat(30)}`, platform: "android" });
    expect(await codeOf(registerPushTokenService(pushUid, { token: "z".repeat(40), platform: "android" }))).toBe("RATE_LIMITED");
    expect(await codeOf(unregisterPushTokenService(pushUid, { token: "z".repeat(40) }))).toBe("RATE_LIMITED");
  });
});

/* ============================================================ push tokens */

describe("push token hygiene", () => {
  test(`keeps the ${MAX_PUSH_TOKENS} most recent tokens; re-registering moves a token to the end; unregister removes it`, async () => {
    const uid = uniq("push-cap");
    const tok = (i: number) => `device-${String(i).padStart(2, "0")}-${"t".repeat(30)}`;
    for (let i = 0; i < 12; i++) await registerPushTokenService(uid, { token: tok(i), platform: "ios" });
    let tokens = (await get(`users/${uid}`))!.pushTokens as string[];
    expect(tokens).toHaveLength(MAX_PUSH_TOKENS);
    expect(tokens[0]).toBe(tok(2));
    expect(tokens[MAX_PUSH_TOKENS - 1]).toBe(tok(11));

    await registerPushTokenService(uid, { token: tok(5), platform: "ios" });
    tokens = (await get(`users/${uid}`))!.pushTokens as string[];
    expect(tokens).toHaveLength(MAX_PUSH_TOKENS);
    expect(tokens[MAX_PUSH_TOKENS - 1]).toBe(tok(5));
    expect(tokens.filter((t) => t === tok(5))).toHaveLength(1);

    await unregisterPushTokenService(uid, { token: tok(5) });
    await unregisterPushTokenService(uid, { token: tok(5) }); // idempotent
    tokens = (await get(`users/${uid}`))!.pushTokens as string[];
    expect(tokens).not.toContain(tok(5));
    expect(tokens).toHaveLength(MAX_PUSH_TOKENS - 1);
  });
});

/* ======================================================= expired org code */

test("an organizer code expired by the retention sweep reports 'expired', not 'invalid'", async () => {
  const uid = uniq("org-expired");
  await db().doc(`organizerActivations/${uid}`).set({ orgId: "org-x", status: "expired", attempts: 0, version: 1 });
  const err = await redeemOrganizerCode({ code: "A".repeat(ORGANIZER_CODE_LENGTH) }, phoneActor(uid)).catch((e) => e);
  expect(err).toBeInstanceOf(DomainError);
  expect((err as DomainError).code).toBe("PRECONDITION");
  expect((err as DomainError).operatorMessage).toMatch(/expired/);
});

/* ============================================================== reminders */

test("sendEventReminders is bounded per run and resumes where it stopped", async () => {
  const eventId = uniq("ev-rem");
  const custs = [uniq("rem-a"), uniq("rem-b"), uniq("rem-c")];
  await db().doc(`events/${eventId}`).set({ status: "published", title: "Night trek", startsAt: ts(90 * 60_000), orgId: "org-rem" });
  await Promise.all(
    custs.map((c, i) => db().doc(`bookings/${eventId}-b${i}`).set({ eventId, status: "confirmed", customerUid: c, orgId: "org-rem" }))
  );
  const reminderExists = async (c: string) => exists(`userNotifications/event-reminder:${eventId}-2h:${c}`);
  const first = await sendEventReminders({ maxSends: 1 });
  expect(first.truncated).toBe(true);
  expect(first.sent).toBe(1);
  // Keep running with a small budget until this event is covered.
  for (let i = 0; i < 20 && !(await Promise.all(custs.map(reminderExists))).every(Boolean); i++) await sendEventReminders({ maxSends: 50 });
  expect((await Promise.all(custs.map(reminderExists))).every(Boolean)).toBe(true);
  const n = await db().doc(`userNotifications/event-reminder:${eventId}-2h:${custs[0]}`).get();
  expect(n.data()).toMatchObject({ kind: "event-reminder", link: { type: "event", id: eventId } });
});

/* ================================================================== logs */

test("log sanitizer drops secrets, codes, tokens and phone numbers", () => {
  const out = sanitize({
    event: "x",
    uid: "abc",
    phone: "+919812345678",
    organizerCode: "K7Q2M9XP4T",
    token: "fcm-token",
    providerSignature: "deadbeef",
    note: "call me on +91 98123 45678",
    nested: { codeHash: "h", pushTokens: ["a"], ok: 1 },
    code: "RATE_LIMITED",
  });
  expect(out).toMatchObject({
    event: "x",
    uid: "abc",
    phone: "[redacted]",
    organizerCode: "[redacted]",
    token: "[redacted]",
    providerSignature: "[redacted]",
    code: "RATE_LIMITED",
    nested: { codeHash: "[redacted]", pushTokens: "[redacted]", ok: 1 },
  });
  expect(String(out.note)).not.toMatch(/98123/);
});
