/**
 * Firestore query shapes used in production, run against the emulator.
 *
 * IMPORTANT: the Firestore emulator does NOT enforce composite indexes — every
 * query below would succeed here even with an empty firestore.indexes.json.
 * What this suite proves is that the query SHAPES are legal (operator
 * combinations, inequality/orderBy ordering, documentId + equality, `in` +
 * range) and return what the code expects. The real index guard is the static
 * check `npm run check:indexes` (firebase/scripts/check-indexes.mjs), which
 * this suite also runs so a missing index fails `npm test` too.
 */

process.env.GCLOUD_PROJECT = "demo-experience-os";
if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error("Run under `firebase emulators:exec`.");

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { randomBytes } from "node:crypto";
import { FieldPath } from "firebase-admin/firestore";
import { db, Timestamp } from "../src/platform/firestore";

const T = randomBytes(4).toString("hex");
const H = 3_600_000;
const at = (ms: number) => Timestamp.fromMillis(Date.now() + ms);

test("static index check passes (the real guard: the emulator doesn't enforce indexes)", () => {
  const script = resolve(__dirname, "../../scripts/check-indexes.mjs");
  const out = execFileSync(process.execPath, [script], { encoding: "utf8" });
  expect(out).toMatch(/✓ \d+ declared queries/);
});

describe("representative multi-field queries run and return the seeded rows", () => {
  const orgId = `org-ix-${T}`;
  const uid = `uid-ix-${T}`;
  const eventId = `evt-ix-${T}`;

  // Seeds are shaped so no other suite's global sweep (releaseExpiredHolds,
  // retention) ever picks them up: the held booking expires in the future, the event starts
  // outside the 24h reminder window, retention candidates lie in the future.
  beforeAll(async () => {
    const b = db().batch();
    b.set(db().doc(`tickets/tkt-ix-${T}`), { eventId, customerUid: uid, status: "used" });
    b.set(db().doc(`ledgerEntries/le-ix-${T}`), { orgId, account: "organizer_payable", settlementId: null, amountMinor: 1 });
    b.set(db().doc(`bookings/bkg-ix-${T}-1`), { eventId, customerUid: uid, status: "held", holdExpiresAt: at(H), createdAt: at(-2 * H) });
    b.set(db().doc(`bookings/bkg-ix-${T}-2`), { eventId, customerUid: uid, status: "confirmed", holdExpiresAt: null, createdAt: at(-H) });
    b.set(db().doc(`events/${eventId}`), { orgId, status: "published", startsAt: at(30 * H), responsibility: { primaryUid: uid } });
    b.set(db().doc(`commercialAgreements/ca-ix-${T}`), { orgId, status: "approved" });
    b.set(db().doc(`staffInvites/inv-ix-${T}`), { orgId, phone: `+9190000${T.slice(0, 5)}`, status: "pending" });
    b.set(db().doc(`userNotifications/n-ix-${T}-1`), { recipientUid: uid, createdAt: at(-H) });
    b.set(db().doc(`userNotifications/n-ix-${T}-2`), { recipientUid: uid, createdAt: at(0) });
    b.set(db().doc(`experiences/exp-ix-${T}`), { orgId, status: "approved" });
    b.set(db().doc(`auditEvents/ae-ix-${T}`), { at: at(10 * H) });
    b.set(db().doc(`organizerApplications/oa-ix-${T}`), { status: "rejected", decidedAt: at(400 * 24 * H) });
    b.set(db().doc(`organizerActivations/act-ix-${T}`), { status: "issued", expiresAt: at(400 * 24 * H) });
    await b.commit();
  });

  test("backend", async () => {
    const ids = async (q: FirebaseFirestore.Query) => (await q.get()).docs.map((d) => d.id);
    // catalog/reviews.ts — three equalities
    expect(await ids(db().collection("tickets").where("eventId", "==", eventId).where("customerUid", "==", uid).where("status", "==", "used").limit(1))).toEqual([`tkt-ix-${T}`]);
    // commerce/settlements.ts — equality on null
    expect(await ids(db().collection("ledgerEntries").where("orgId", "==", orgId).where("account", "==", "organizer_payable").where("settlementId", "==", null))).toEqual([`le-ix-${T}`]);
    // commerce/holds.ts — equality + range
    expect(await ids(db().collection("bookings").where("status", "==", "held").where("holdExpiresAt", "<=", at(2 * H)).limit(500))).toContain(`bkg-ix-${T}-1`);
    // commerce/reminders.ts — in + two-sided range
    expect(
      await ids(db().collection("events").where("status", "in", ["published", "booking-closed"]).where("startsAt", ">", at(0)).where("startsAt", "<=", at(48 * H)))
    ).toContain(eventId);
    // catalog/events.ts, commerce/refunds.ts — equality + in
    expect(await ids(db().collection("bookings").where("eventId", "==", eventId).where("status", "in", ["held", "confirmed"]))).toHaveLength(2);
    // identity/staff.ts — nested field + in
    expect(
      await ids(db().collection("events").where("orgId", "==", orgId).where("responsibility.primaryUid", "==", uid).where("status", "in", ["published", "live"]).limit(1))
    ).toEqual([eventId]);
    expect(await ids(db().collection("commercialAgreements").where("orgId", "==", orgId).where("status", "==", "approved"))).toEqual([`ca-ix-${T}`]);
    expect(await ids(db().collection("staffInvites").where("orgId", "==", orgId).where("status", "==", "pending"))).toEqual([`inv-ix-${T}`]);
    // platform/retention.ts — equality + range (+ orderBy on the range field)
    expect(await ids(db().collection("organizerActivations").where("status", "==", "issued").where("expiresAt", "<", at(401 * 24 * H)).limit(500))).toContain(`act-ix-${T}`);
    expect(
      await ids(db().collection("organizerApplications").where("status", "==", "rejected").where("decidedAt", "<", at(401 * 24 * H)).orderBy("decidedAt").limit(500))
    ).toContain(`oa-ix-${T}`);
    expect(await ids(db().collection("userNotifications").where("read", "==", true).where("createdAt", "<", at(0)).limit(10))).toBeDefined();
  });

  test("PULSE app", async () => {
    const ids = async (q: FirebaseFirestore.Query) => (await q.get()).docs.map((d) => d.id);
    // firebase_repositories.dart fetchExperiences
    expect(await ids(db().collection("events").where("status", "==", "published").where("startsAt", ">", at(-12 * H)).orderBy("startsAt").limit(200))).toContain(eventId);
    expect(await ids(db().collection("experiences").where(FieldPath.documentId(), "in", [`exp-ix-${T}`]).where("status", "==", "approved"))).toEqual([`exp-ix-${T}`]);
    // bookings + notifications, newest first
    expect(await ids(db().collection("bookings").where("customerUid", "==", uid).orderBy("createdAt", "desc").limit(100))).toEqual([`bkg-ix-${T}-2`, `bkg-ix-${T}-1`]);
    expect(await ids(db().collection("userNotifications").where("recipientUid", "==", uid).orderBy("createdAt", "desc").limit(100))).toEqual([`n-ix-${T}-2`, `n-ix-${T}-1`]);
    // host workspace
    expect(await ids(db().collection("experiences").where("orgId", "==", orgId).where("status", "==", "approved").limit(300))).toEqual([`exp-ix-${T}`]);
  });

  test("operations console", async () => {
    const snap = await db().collection("auditEvents").orderBy("at", "desc").limit(250).get();
    expect(snap.docs[0]?.id).toBe(`ae-ix-${T}`);
  });
});
