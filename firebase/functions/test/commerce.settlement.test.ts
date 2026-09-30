/**
 * Settlements reconcile with the ledger, never double-include entries, and
 * need two admins above ₹50,000. Reminders are deduplicated.
 */

import {
  adminCtx,
  book,
  call,
  callCode,
  callErr,
  commerce,
  db,
  expectBalanced,
  getDoc,
  newCustomer,
  phoneCtx,
  rid,
  seedEvent,
  seedMembership,
  seedOrg,
  uniq,
  type Entry,
} from "./commerce-helpers";
import { buildSettlement } from "../src/commerce/settlements";
import { sendEventReminders } from "../src/commerce/reminders";

jest.setTimeout(180_000);

type Settlement = {
  orgId: string;
  grossMinor: number;
  commissionMinor: number;
  refundsMinor: number;
  netMinor: number;
  entryCount: number;
  status: string;
  approvedBy: string | null;
  paidBy: string | null;
  payoutReference: string | null;
};

async function orgLedger(orgId: string): Promise<Array<Entry & { id: string }>> {
  const s = await db().collection("ledgerEntries").where("orgId", "==", orgId).get();
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Entry) }));
}

async function scenario(price = 99_999, bps = 1_250) {
  const orgId = uniq("org");
  await seedOrg(orgId);
  const done = await seedEvent({ orgId, priceMinor: price, commissionBps: bps, policy: "flexible", startsInHours: 48 });
  const open = await seedEvent({ orgId, priceMinor: price, commissionBps: bps });
  const buyers = await Promise.all([1, 2, 3].map(() => newCustomer()));
  const b1 = await book(buyers[0]!, done, 2);
  await book(buyers[1]!, done, 1);
  await book(buyers[2]!, open, 1);
  // A partial refund on the completed event (100% — flexible, 48h out).
  await call(commerce.cancelBooking, { requestId: rid(), bookingId: b1.bookingId }, phoneCtx(buyers[0]!));
  await db().collection("events").doc(done).update({ status: "completed" });
  return { orgId, done, open };
}

describe("buildSettlement", () => {
  test("totals reconcile with the ledger (gross − commission − refunds == net) and only completed events count", async () => {
    const { orgId, done, open } = await scenario();
    const ledger = await orgLedger(orgId);
    expectBalanced(ledger);

    const buildReq = rid();
    const out = await call<{ settlementId: string; netMinor: number; entryCount: number; status: string }>(
      commerce.buildSettlement,
      { requestId: buildReq, orgId, periodEnd: new Date().toISOString() },
      adminCtx("admin-a")
    );
    expect(out.status).toBe("pending-approval");
    const s = (await getDoc<Settlement>(`settlements/${out.settlementId}`))!;
    expect(s.grossMinor - s.commissionMinor - s.refundsMinor).toBe(s.netMinor);

    // Independently recompute from the ledger of record.
    const payable = ledger.filter((e) => e.account === "organizer_payable" && e.eventId === done);
    const credits = payable.filter((e) => e.direction === "credit").reduce((a, e) => a + e.amountMinor, 0);
    const debits = payable.filter((e) => e.direction === "debit").reduce((a, e) => a + e.amountMinor, 0);
    expect(s.netMinor).toBe(credits - debits);
    expect(s.entryCount).toBe(payable.length);
    const gross = 99_999 * 3;
    expect(s.grossMinor).toBe(gross);
    expect(s.commissionMinor).toBe(Math.floor((99_999 * 2 * 1_250) / 10_000) + Math.floor((99_999 * 1_250) / 10_000));
    // Only the 1-spot booking survived: net == its organizer share.
    expect(s.netMinor).toBe(99_999 - Math.floor((99_999 * 1_250) / 10_000));

    // Entries were stamped; the open event's entries were not.
    const after = await orgLedger(orgId);
    for (const e of after.filter((x) => x.account === "organizer_payable")) {
      expect(e.settlementId).toBe(e.eventId === done ? out.settlementId : null);
    }
    expect(after.some((e) => e.eventId === open && e.account === "organizer_payable")).toBe(true);

    // Replay with the same requestId returns the same settlement.
    const replay = await call<{ settlementId: string; netMinor: number; entryCount: number }>(
      commerce.buildSettlement,
      { requestId: buildReq, orgId, periodEnd: new Date().toISOString() },
      adminCtx("admin-a")
    );
    expect(replay).toMatchObject({ settlementId: out.settlementId, netMinor: s.netMinor, entryCount: s.entryCount });

    // A new build cannot include the same entries again.
    const again = await call<{ settlementId: string | null; entryCount: number }>(
      commerce.buildSettlement,
      { requestId: rid(), orgId, periodEnd: new Date().toISOString() },
      adminCtx("admin-b")
    );
    expect(again).toMatchObject({ settlementId: null, entryCount: 0 });
  });

  test("concurrent builds partition the entries — no entry is in two settlements", async () => {
    const { orgId } = await scenario(12_345, 777);
    const payable = (await orgLedger(orgId)).filter((e) => e.account === "organizer_payable");
    const eligible = payable.filter((e) => e.settlementId === null).length;
    const results = await Promise.all(
      [1, 2, 3].map(() => buildSettlement({ uid: "admin-a", roleId: "super-admin" }, { requestId: rid(), orgId, periodEnd: new Date() }))
    );
    const total = results.reduce((a, r) => a + r.entryCount, 0);
    const after = (await orgLedger(orgId)).filter((e) => e.account === "organizer_payable" && e.settlementId !== null);
    expect(total).toBe(after.length);
    expect(total).toBeLessThanOrEqual(eligible);
    const sumNet = results.reduce((a, r) => a + r.netMinor, 0);
    const recomputed = after.reduce((a, e) => a + (e.direction === "credit" ? e.amountMinor : -e.amountMinor), 0);
    expect(sumNet).toBe(recomputed);
    for (const r of results.filter((x) => x.settlementId)) {
      const s = (await getDoc<Settlement>(`settlements/${r.settlementId}`))!;
      expect(s.grossMinor - s.commissionMinor - s.refundsMinor).toBe(s.netMinor);
    }
  });

  test("entries after periodEnd are left for the next settlement", async () => {
    const { orgId } = await scenario();
    const out = await buildSettlement({ uid: "admin-a", roleId: "super-admin" }, { requestId: rid(), orgId, periodEnd: new Date(Date.now() - 3_600_000) });
    expect(out.entryCount).toBe(0);
  });

  test("organizers (even with earnings.view) cannot build or decide settlements", async () => {
    const { orgId } = await scenario();
    const owner = uniq("owner");
    await seedMembership(orgId, owner, { role: "owner", eventIds: "all" });
    expect(await callCode(commerce.buildSettlement, { requestId: rid(), orgId, periodEnd: new Date().toISOString() }, phoneCtx(owner))).toBe("NOT_PERMITTED");
    expect(await callCode(commerce.decideSettlement, { requestId: rid(), settlementId: "stl_x", action: "approve", note: "self" }, phoneCtx(owner))).toBe("NOT_PERMITTED");
  });
});

describe("decideSettlement", () => {
  test("above ₹50,000: approver cannot mark paid; payout reference required; second admin pays", async () => {
    const orgId = uniq("org");
    await seedOrg(orgId);
    const eventId = await seedEvent({ orgId, priceMinor: 3_000_000, commissionBps: 1_000 }); // ₹30,000
    for (const _ of [1, 2]) await book(await newCustomer(), eventId, 1);
    await db().collection("events").doc(eventId).update({ status: "completed" });
    const built = await buildSettlement({ uid: "admin-a", roleId: "super-admin" }, { requestId: rid(), orgId, periodEnd: new Date() });
    expect(built.netMinor).toBe(5_400_000);
    const id = built.settlementId!;

    expect(await callCode(commerce.decideSettlement, { requestId: rid(), settlementId: id, action: "mark-paid", note: "early", payoutReference: "UTR123" }, adminCtx("admin-a"))).toBe("PRECONDITION");
    await call(commerce.decideSettlement, { requestId: rid(), settlementId: id, action: "approve", note: "Checked" }, adminCtx("admin-a"));
    const same = await callErr(commerce.decideSettlement, { requestId: rid(), settlementId: id, action: "mark-paid", note: "paying", payoutReference: "UTR123456" }, adminCtx("admin-a"));
    expect(same.code).toBe("NOT_PERMITTED");
    expect(await callCode(commerce.decideSettlement, { requestId: rid(), settlementId: id, action: "mark-paid", note: "paying" }, adminCtx("admin-b"))).toBe("INVALID_INPUT");

    // hold / release-hold returns to the prior state
    await call(commerce.decideSettlement, { requestId: rid(), settlementId: id, action: "hold", note: "KYC query" }, adminCtx("admin-b"));
    expect((await getDoc<Settlement>(`settlements/${id}`))!.status).toBe("held");
    expect(await callCode(commerce.decideSettlement, { requestId: rid(), settlementId: id, action: "mark-paid", note: "x", payoutReference: "UTR1" }, adminCtx("admin-b"))).toBe("PRECONDITION");
    await call(commerce.decideSettlement, { requestId: rid(), settlementId: id, action: "release-hold", note: "resolved" }, adminCtx("admin-b"));
    expect((await getDoc<Settlement>(`settlements/${id}`))!.status).toBe("approved");

    const paid = await call<{ status: string }>(commerce.decideSettlement, { requestId: rid(), settlementId: id, action: "mark-paid", note: "paid", payoutReference: "UTR998877" }, adminCtx("admin-b"));
    expect(paid.status).toBe("paid");
    const s = (await getDoc<Settlement>(`settlements/${id}`))!;
    expect(s).toMatchObject({ approvedBy: "admin-a", paidBy: "admin-b", payoutReference: "UTR998877" });
    const audits = await db().collection("auditEvents").where("resourceId", "==", id).get();
    expect(audits.size).toBeGreaterThanOrEqual(5);
  });

  test("at or below ₹50,000 a single admin may approve and pay", async () => {
    const orgId = uniq("org");
    await seedOrg(orgId);
    const eventId = await seedEvent({ orgId, priceMinor: 100_000, commissionBps: 1_000 });
    await book(await newCustomer(), eventId, 1);
    await db().collection("events").doc(eventId).update({ status: "completed" });
    const built = await buildSettlement({ uid: "admin-a", roleId: "super-admin" }, { requestId: rid(), orgId, periodEnd: new Date() });
    await call(commerce.decideSettlement, { requestId: rid(), settlementId: built.settlementId, action: "approve", note: "ok" }, adminCtx("admin-a"));
    const paid = await call<{ status: string }>(commerce.decideSettlement, { requestId: rid(), settlementId: built.settlementId, action: "mark-paid", note: "ok", payoutReference: "UTR42" }, adminCtx("admin-a"));
    expect(paid.status).toBe("paid");
  });
});

describe("sendEventReminders", () => {
  test("2h window reminder sent once per attendee, however often the job runs", async () => {
    const orgId = uniq("org");
    await seedOrg(orgId);
    const eventId = await seedEvent({ orgId, priceMinor: 0, startsInHours: 1.5 });
    const uid = await newCustomer();
    await book(uid, eventId, 1);
    await sendEventReminders();
    const id = `event-reminder:${eventId}-2h:${uid}`;
    const n1 = (await getDoc<{ read: boolean }>(`userNotifications/${id}`))!;
    expect(n1).toBeDefined();
    await db().collection("userNotifications").doc(id).update({ read: true });
    await Promise.all([sendEventReminders(), sendEventReminders()]);
    expect((await getDoc<{ read: boolean }>(`userNotifications/${id}`))!.read).toBe(true);
    const all = await db().collection("userNotifications").where("recipientUid", "==", uid).where("kind", "==", "event-reminder").get();
    expect(all.size).toBe(1);
  });

  test("24h window reminder for an event ~20h away", async () => {
    const orgId = uniq("org");
    await seedOrg(orgId);
    const eventId = await seedEvent({ orgId, priceMinor: 0, startsInHours: 20 });
    const uid = await newCustomer();
    await book(uid, eventId, 1);
    await sendEventReminders();
    expect(await getDoc(`userNotifications/event-reminder:${eventId}-24h:${uid}`)).toBeDefined();
  });
});
