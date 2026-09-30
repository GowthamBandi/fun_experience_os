/**
 * Cancellation policy, discretionary refunds with dual control, event
 * cancellation fan-out, and ledger reversals.
 */

import {
  adminCtx,
  book,
  call,
  callCode,
  callErr,
  commerce,
  db,
  deliverWebhook,
  expectBalanced,
  getDoc,
  ledgerWhere,
  newCustomer,
  phoneCtx,
  refundEvent,
  reserve,
  rid,
  seedMembership,
  sum,
  uniq,
  world,
} from "./commerce-helpers";
import { cancellationPercent, refundAmount } from "../src/commerce/policy";
import { refundSplit } from "../src/commerce/ledger";
import { emulatorProvider } from "../src/commerce/provider";
import { retryApprovedRefunds } from "../src/commerce/refundCore";
import { EventRefundIncompleteError, refundCancelledEvent } from "../src/commerce/refunds";
import { REFUND_RETRY_BUDGET_MS, runReleaseExpiredHoldsJob } from "../src/commerce/functions";
import { jobRunId } from "../src/platform/jobs";

jest.setTimeout(180_000);

type Refund = { status: string; amountMinor: number; reason: string; approvals: string[]; providerRefundId: string | null; orgId: string };
type Occ = { occupancy: { confirmedPaidBookings: number; activeReservationHolds: number }; remainingSellableCapacity: number };

describe("pure policy math", () => {
  test.each([
    ["flexible", 24, 100], ["flexible", 23.99, 50], ["flexible", 0.1, 50], ["flexible", -1, 0],
    ["moderate", 72, 100], ["moderate", 71.9, 50], ["moderate", 24, 50], ["moderate", 23.9, 0],
    ["strict", 168, 100], ["strict", 167.9, 0],
  ])("%s at %sh → %s%%", (policy, hours, pct) => {
    expect(cancellationPercent(policy as string, hours as number)).toBe(pct);
  });

  test("refund amounts are integer paise rounded down; commission reversal sums exactly", () => {
    expect(refundAmount(99_999, 50)).toBe(49_999);
    // Refund 3 odd parts of a 100,001 payment with 12,501 commission.
    let before = 0;
    let rev = 0;
    for (const part of [33_333, 33_333, 33_335]) {
      const s = refundSplit(100_001, 12_501, before, part);
      expect(Number.isSafeInteger(s.commissionReversal)).toBe(true);
      rev += s.commissionReversal;
      before += part;
    }
    expect(rev).toBe(12_501);
  });
});

describe("customer cancellation", () => {
  test.each([
    ["flexible", 30, 100],
    ["flexible", 10, 50],
    ["moderate", 100, 100],
    ["moderate", 48, 50],
    ["strict", 200, 100],
  ])("%s policy, %sh before start → %s%% refund, exact paise, balanced reversal", async (policy, hours, pct) => {
    const price = 99_999;
    const { eventId } = await world({ priceMinor: price, commissionBps: 1_250, policy: policy as "flexible", startsInHours: hours as number, capacity: 5 });
    const uid = await newCustomer();
    const b = await book(uid, eventId, 1);

    const q = await call<{ percent: number; amountMinor: number }>(commerce.quoteCancellation, { bookingId: b.bookingId }, phoneCtx(uid));
    const expected = Math.floor((price * (pct as number)) / 100);
    expect(q).toMatchObject({ percent: pct, amountMinor: expected });

    const out = await call<{ refund: { refundId: string; amountMinor: number; status: string } }>(
      commerce.cancelBooking,
      { requestId: rid(), bookingId: b.bookingId },
      phoneCtx(uid)
    );
    expect(out.refund.amountMinor).toBe(expected);
    expect(out.refund.status).toBe("processing");

    const booking = (await getDoc<{ status: string; refundedMinor: number }>(`bookings/${b.bookingId}`))!;
    expect(booking.status).toBe("cancelled");
    expect(booking.refundedMinor).toBe(expected);
    for (const t of b.ticketIds) expect((await getDoc<{ status: string }>(`tickets/${t}`))!.status).toBe("refunded");
    const ev = (await getDoc<Occ>(`events/${eventId}`))!;
    expect(ev.occupancy.confirmedPaidBookings).toBe(0);
    expect(ev.remainingSellableCapacity).toBe(5);

    const entries = await ledgerWhere("bookingId", b.bookingId);
    expect(expectBalanced(entries)).toBe(2);
    expect(sum(entries, "customer_refunds", "credit")).toBe(expected);
    const commission = Math.floor((price * 1_250) / 10_000);
    const commRev = sum(entries, "platform_commission", "debit");
    expect(commRev).toBe(Math.floor((commission * expected) / price));
    expect(sum(entries, "organizer_payable", "debit")).toBe(expected - commRev);

    // refund.processed completes it
    const r = (await getDoc<Refund>(`refunds/${out.refund.refundId}`))!;
    await deliverWebhook(refundEvent("refund.processed", { providerRefundId: r.providerRefundId!, refundId: out.refund.refundId, amount: expected }));
    expect((await getDoc<Refund>(`refunds/${out.refund.refundId}`))!.status).toBe("completed");

    // Cancelling twice (new requestId) is a no-op that reports the same refund.
    const again = await call<{ refund: { refundId: string; amountMinor: number } }>(commerce.cancelBooking, { requestId: rid(), bookingId: b.bookingId }, phoneCtx(uid));
    expect(again.refund.amountMinor).toBe(expected);
    expect((await ledgerWhere("bookingId", b.bookingId)).length).toBe(entries.length);
  });

  test("outside policy (strict, 5 days out): cancelled, seat released, no refund", async () => {
    const { eventId } = await world({ policy: "strict", startsInHours: 120 });
    const uid = await newCustomer();
    const b = await book(uid, eventId);
    const q = await call<{ percent: number; amountMinor: number }>(commerce.quoteCancellation, { bookingId: b.bookingId }, phoneCtx(uid));
    expect(q).toMatchObject({ percent: 0, amountMinor: 0 });
    const out = await call<{ refund: unknown }>(commerce.cancelBooking, { requestId: rid(), bookingId: b.bookingId }, phoneCtx(uid));
    expect(out.refund).toBeNull();
    expect((await getDoc<{ status: string }>(`tickets/${b.ticketIds[0]}`))!.status).toBe("cancelled");
    expect((await ledgerWhere("bookingId", b.bookingId)).filter((e) => e.kind === "refund")).toHaveLength(0);
  });

  test("a held booking is simply released", async () => {
    const { eventId } = await world({ capacity: 4 });
    const uid = await newCustomer();
    const r = await reserve(uid, eventId, 3);
    const out = await call<{ refund: unknown }>(commerce.cancelBooking, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(uid));
    expect(out.refund).toBeNull();
    const ev = (await getDoc<Occ>(`events/${eventId}`))!;
    expect(ev.occupancy.activeReservationHolds).toBe(0);
    expect(ev.remainingSellableCapacity).toBe(4);
    // ...and the customer may book again.
    expect((await reserve(uid, eventId, 1)).status).toBe("held");
  });

  test("another customer can neither quote nor cancel my booking", async () => {
    const { eventId } = await world();
    const me = await newCustomer();
    const other = await newCustomer();
    const b = await book(me, eventId);
    expect(await callCode(commerce.quoteCancellation, { bookingId: b.bookingId }, phoneCtx(other))).toBe("NOT_FOUND");
    expect(await callCode(commerce.cancelBooking, { requestId: rid(), bookingId: b.bookingId }, phoneCtx(other))).toBe("NOT_FOUND");
  });

  test("a booking with a checked-in ticket can't be cancelled", async () => {
    const { eventId } = await world();
    const uid = await newCustomer();
    const b = await book(uid, eventId);
    await db().collection("tickets").doc(b.ticketIds[0]!).update({ status: "used" });
    expect(await callCode(commerce.cancelBooking, { requestId: rid(), bookingId: b.bookingId }, phoneCtx(uid))).toBe("PRECONDITION");
  });

  test("a provider outage leaves the refund approved; the sweeper retries it", async () => {
    const { eventId } = await world({ policy: "flexible", startsInHours: 48 });
    const uid = await newCustomer();
    const b = await book(uid, eventId);
    emulatorProvider().failNext = 1;
    const out = await call<{ refund: { refundId: string; status: string } }>(commerce.cancelBooking, { requestId: rid(), bookingId: b.bookingId }, phoneCtx(uid));
    expect(out.refund.status).toBe("approved");
    await retryApprovedRefunds();
    expect((await getDoc<Refund>(`refunds/${out.refund.refundId}`))!.status).toBe("processing");
  });
});

describe("refund retry time budget", () => {
  async function stuckRefund(): Promise<string> {
    const { eventId } = await world({ policy: "flexible", startsInHours: 48 });
    const uid = await newCustomer();
    const b = await book(uid, eventId);
    emulatorProvider().failNext = 1;
    const out = await call<{ refund: { refundId: string; status: string } }>(commerce.cancelBooking, { requestId: rid(), bookingId: b.bookingId }, phoneCtx(uid));
    expect(out.refund.status).toBe("approved");
    return out.refund.refundId;
  }

  test("never starts a provider attempt past the deadline; reports stoppedForTime; the next run finishes", async () => {
    const ids = [await stuckRefund(), await stuckRefund()];

    const none = await retryApprovedRefunds(50, 200, { deadlineMs: Date.now() - 1 });
    expect(none).toMatchObject({ retried: 0, stoppedForTime: true });
    expect(none.due).toBeGreaterThanOrEqual(2);
    for (const id of ids) expect((await getDoc<Refund>(`refunds/${id}`))!.status).toBe("approved");

    // A clock that jumps past the deadline after the first attempt (an outage
    // where each attempt eats the provider timeout): exactly one is attempted.
    const base = Date.now();
    let calls = 0;
    const clock = () => (++calls <= 2 ? base : base + 200_000);
    const one = await retryApprovedRefunds(50, 200, { deadlineMs: base + 120_000, now: clock });
    expect(one).toMatchObject({ retried: 1, stoppedForTime: true });

    // The scheduled job records it in its summary (jobRuns) ...
    const job = await runReleaseExpiredHoldsJob({ refundBudgetMs: 0 });
    expect(job.steps.refundRetry).toMatchObject({ retried: 0, stoppedForTime: true });
    const runDoc = (await getDoc<{ lastSteps: Record<string, Record<string, unknown>> }>(`jobRuns/${jobRunId("releaseExpiredHolds")}`))!;
    expect(runDoc.lastSteps.refundRetry).toMatchObject({ stoppedForTime: true });

    // ... and with its normal budget, the next run retries what's left.
    const next = await runReleaseExpiredHoldsJob();
    expect(next.steps.refundRetry).toMatchObject({ stoppedForTime: false });
    for (const id of ids) expect((await getDoc<Refund>(`refunds/${id}`))!.status).toBe("processing");
  });

  test("the refund-retry budget is bounded by the function's own timeout", async () => {
    await stuckRefund();
    // Started 230 s ago in a 240 s function: no time for even one attempt.
    const job = await runReleaseExpiredHoldsJob({ startedAtMs: Date.now() - 230_000 });
    expect(job.steps.refundRetry).toMatchObject({ retried: 0, stoppedForTime: true });
    expect(REFUND_RETRY_BUDGET_MS).toBeLessThanOrEqual(120_000);
  });
});

describe("discretionary refunds", () => {
  async function paidBooking(price = 99_900) {
    const { orgId, eventId } = await world({ priceMinor: price });
    const uid = await newCustomer();
    const b = await book(uid, eventId);
    const lead = uniq("lead");
    await seedMembership(orgId, lead, { permissions: ["refunds.request", "attendees.view"], eventIds: [eventId] });
    return { orgId, eventId, uid, b, lead };
  }

  test("member with scoped refunds.request → under-review; out of scope / no permission refused", async () => {
    const p = await paidBooking();
    const out = await call<{ refundId: string; status: string }>(
      commerce.requestRefund,
      { requestId: rid(), orgId: p.orgId, bookingId: p.b.bookingId, amountMinor: 10_000, reason: "Bad weather at venue" },
      phoneCtx(p.lead)
    );
    expect(out.status).toBe("under-review");

    const outOfScope = uniq("staff");
    await seedMembership(p.orgId, outOfScope, { permissions: ["refunds.request"], eventIds: ["some-other-event"] });
    const noPerm = uniq("staff");
    await seedMembership(p.orgId, noPerm, { permissions: ["attendees.view"], eventIds: "all" });
    for (const who of [outOfScope, noPerm, p.uid]) {
      expect(
        await callCode(commerce.requestRefund, { requestId: rid(), orgId: p.orgId, bookingId: p.b.bookingId, amountMinor: 10_000, reason: "Please" }, phoneCtx(who))
      ).toBe("NOT_PERMITTED");
    }
    // Over-refund is refused.
    expect(
      await callCode(commerce.requestRefund, { requestId: rid(), orgId: p.orgId, bookingId: p.b.bookingId, amountMinor: 99_901, reason: "Too much" }, phoneCtx(p.lead))
    ).toBe("INVALID_INPUT");
    // Wrong org for the booking is refused (tenancy).
    const otherOrg = uniq("org");
    await seedMembership(otherOrg, p.lead, { role: "owner", eventIds: "all" });
    expect(
      await callCode(commerce.requestRefund, { requestId: rid(), orgId: otherOrg, bookingId: p.b.bookingId, amountMinor: 100, reason: "Cross org" }, phoneCtx(p.lead))
    ).toBe("NOT_FOUND");
  });

  test("an organizer (even the owner) cannot approve a refund", async () => {
    const p = await paidBooking();
    const { refundId } = await call<{ refundId: string }>(
      commerce.requestRefund,
      { requestId: rid(), orgId: p.orgId, bookingId: p.b.bookingId, amountMinor: 5_000, reason: "Goodwill gesture" },
      phoneCtx(p.lead)
    );
    const owner = uniq("owner");
    await seedMembership(p.orgId, owner, { role: "owner", eventIds: "all" });
    for (const ctx of [phoneCtx(owner), phoneCtx(p.lead), adminCtx(uniq("auditor"), "auditor")]) {
      expect(await callCode(commerce.decideRefund, { requestId: rid(), refundId, decision: "approve", note: "ok by me" }, ctx)).toBe("NOT_PERMITTED");
    }
    expect((await getDoc<Refund>(`refunds/${refundId}`))!.status).toBe("under-review");
  });

  test("below ₹10,000 one admin approves → ledger reversal → provider", async () => {
    const p = await paidBooking();
    const { refundId } = await call<{ refundId: string }>(
      commerce.requestRefund,
      { requestId: rid(), orgId: p.orgId, bookingId: p.b.bookingId, amountMinor: 33_333, reason: "Late start" },
      phoneCtx(p.lead)
    );
    const out = await call<{ status: string }>(commerce.decideRefund, { requestId: rid(), refundId, decision: "approve", note: "Verified" }, adminCtx("admin-a"));
    expect(out.status).toBe("processing");
    const entries = await ledgerWhere("refundId", refundId);
    expect(expectBalanced(entries)).toBe(1);
    expect(sum(entries, "customer_refunds", "credit")).toBe(33_333);
    // A decided refund can't be decided again.
    expect(await callCode(commerce.decideRefund, { requestId: rid(), refundId, decision: "reject", note: "changed mind" }, adminCtx("admin-b"))).toBe("CONFLICT");
  });

  test("above ₹10,000 needs two DIFFERENT admins; same admin twice refused; replay is idempotent", async () => {
    const p = await paidBooking(2_000_000); // ₹20,000
    const { refundId } = await call<{ refundId: string }>(
      commerce.requestRefund,
      { requestId: rid(), orgId: p.orgId, bookingId: p.b.bookingId, amountMinor: 1_500_000, reason: "Venue flooded" },
      phoneCtx(p.lead)
    );
    const firstReq = rid();
    const first = await call<{ status: string }>(commerce.decideRefund, { requestId: firstReq, refundId, decision: "approve", note: "Looks right" }, adminCtx("admin-a"));
    expect(first.status).toBe("awaiting-second-approval");
    expect((await ledgerWhere("refundId", refundId)).length).toBe(0);

    const replay = await call<{ status: string }>(commerce.decideRefund, { requestId: firstReq, refundId, decision: "approve", note: "Looks right" }, adminCtx("admin-a"));
    expect(replay.status).toBe("awaiting-second-approval");

    const same = await callErr(commerce.decideRefund, { requestId: rid(), refundId, decision: "approve", note: "Me again" }, adminCtx("admin-a"));
    expect(same.code).toBe("NOT_PERMITTED");
    expect((await getDoc<Refund>(`refunds/${refundId}`))!.status).toBe("under-review");

    const second = await call<{ status: string }>(commerce.decideRefund, { requestId: rid(), refundId, decision: "approve", note: "Second check" }, adminCtx("admin-b", "platform-owner"));
    expect(second.status).toBe("processing");
    const r = (await getDoc<Refund>(`refunds/${refundId}`))!;
    expect(r.approvals).toEqual(["admin-a", "admin-b"]);
    expect(expectBalanced(await ledgerWhere("refundId", refundId))).toBe(1);
  });
});

describe("event cancellation", () => {
  test("refunds every confirmed booking in full, releases holds, notifies, exactly once", async () => {
    const { eventId } = await world({ priceMinor: 55_555, capacity: 10 });
    const buyers = await Promise.all([1, 2, 3].map(() => newCustomer()));
    const booked = [];
    for (const [i, uid] of buyers.entries()) booked.push(await book(uid, eventId, i + 1));
    const holder = await newCustomer();
    const held = await reserve(holder, eventId, 2);

    await db().collection("events").doc(eventId).update({ status: "cancelled", cancelledBy: "owner-x" });
    const s1 = await refundCancelledEvent(eventId, { uid: "owner-x", role: "org:owner" });
    expect(s1.refundsIssued).toBe(3);
    expect(s1.bookingsCancelled).toBe(4);

    // Again, and via the deployed Firestore trigger: nothing new.
    const s2 = await refundCancelledEvent(eventId, { uid: "owner-x", role: "org:owner" });
    expect(s2).toMatchObject({ refundsIssued: 0, bookingsCancelled: 0 });
    await (commerce.onEventCancelled as unknown as { run: (c: unknown, ctx: unknown) => Promise<void> }).run(
      { before: { data: () => ({ status: "published" }) }, after: { data: () => ({ status: "cancelled", cancelledBy: "owner-x" }) } },
      { params: { eventId } }
    );

    const refunds = await db().collection("refunds").where("eventId", "==", eventId).get();
    expect(refunds.size).toBe(3);
    for (const [i, b] of booked.entries()) {
      const r = (await getDoc<Refund>(`refunds/evc_${b.bookingId}`))!;
      expect(r).toMatchObject({ amountMinor: 55_555 * (i + 1), reason: "event-cancelled", status: "processing" });
      for (const t of b.ticketIds) expect((await getDoc<{ status: string }>(`tickets/${t}`))!.status).toBe("refunded");
      expect(await getDoc(`userNotifications/event-cancelled:${eventId}:${buyers[i]}`)).toBeDefined();
      const entries = await ledgerWhere("bookingId", b.bookingId);
      expectBalanced(entries);
      expect(sum(entries, "organizer_payable", "credit") - sum(entries, "organizer_payable", "debit")).toBe(0);
    }
    expect((await getDoc<{ status: string }>(`bookings/${held.bookingId}`))!.status).toBe("cancelled");
    const ev = (await getDoc<Occ>(`events/${eventId}`))!;
    expect(ev.occupancy).toMatchObject({ confirmedPaidBookings: 0, activeReservationHolds: 0 });
  });

  test("one permanently failing booking never blocks the others: alerted, the rest refunded, the run still fails for retry", async () => {
    const { orgId, eventId } = await world({ priceMinor: 40_000, capacity: 10 });
    const buyers = await Promise.all([1, 2].map(() => newCustomer()));
    const booked = [];
    for (const uid of buyers) booked.push(await book(uid, eventId));
    // A corrupt booking that sorts FIRST (document-id order) and can never be processed.
    const broken = uniq("000-broken");
    await db().collection("bookings").doc(broken).set({
      id: broken, eventId, orgId, customerUid: uniq("cust"), status: "confirmed", kind: "sellable", spots: 1, paymentId: null, ticketIds: ["bad/nested"],
    });
    await db().collection("events").doc(eventId).update({ status: "cancelled", cancelledBy: "owner-x" });

    const err1 = (await refundCancelledEvent(eventId, { uid: "owner-x", role: "org:owner" }).catch((e: unknown) => e)) as EventRefundIncompleteError;
    expect(err1).toBeInstanceOf(EventRefundIncompleteError);
    expect(err1.summary).toMatchObject({ bookingsCancelled: 2, refundsIssued: 2, failedBookingIds: [broken] });
    for (const b of booked) {
      expect((await getDoc<{ status: string }>(`bookings/${b.bookingId}`))!.status).toBe("cancelled");
      expect((await getDoc<Refund>(`refunds/evc_${b.bookingId}`))!).toMatchObject({ amountMinor: 40_000, status: "processing" });
    }
    expect((await getDoc<{ status: string }>(`bookings/${broken}`))!.status).toBe("confirmed");
    const alert = (await getDoc<Record<string, any>>(`riskAlerts/evc-failed_${broken}`))!;
    expect(alert).toMatchObject({ kind: "event-cancel-refund-failed", severity: "high", status: "open", orgId, detail: { eventId, bookingId: broken, occurrences: 1 } });
    expect(typeof alert.summary).toBe("string");

    // The trigger's retry: still fails (so it keeps retrying), refunds nothing twice, updates the same alert.
    const run = (commerce.onEventCancelled as unknown as { run: (c: unknown, ctx: unknown) => Promise<void> }).run;
    await expect(
      run(
        { before: { data: () => ({ status: "published" }) }, after: { data: () => ({ status: "cancelled", cancelledBy: "owner-x", orgId }) } },
        { params: { eventId }, timestamp: new Date().toISOString() }
      )
    ).rejects.toBeInstanceOf(EventRefundIncompleteError);
    expect((await db().collection("refunds").where("eventId", "==", eventId).get()).size).toBe(2);
    expect((await getDoc<Record<string, any>>(`riskAlerts/evc-failed_${broken}`))!.detail.occurrences).toBe(2);
  });

  test("a cancelled event dropped by the 24 h stale guard raises a high-severity alert instead of vanishing", async () => {
    const { orgId, eventId } = await world();
    const uid = await newCustomer();
    const b = await book(uid, eventId);
    const run = (commerce.onEventCancelled as unknown as { run: (c: unknown, ctx: unknown) => Promise<void> }).run;
    await run(
      { before: { data: () => ({ status: "published" }) }, after: { data: () => ({ status: "cancelled", cancelledBy: "owner-x", orgId }) } },
      { params: { eventId }, timestamp: new Date(Date.now() - 25 * 3_600_000).toISOString() }
    );
    expect((await getDoc<{ status: string }>(`bookings/${b.bookingId}`))!.status).toBe("confirmed"); // dropped, not processed
    const alert = (await getDoc<Record<string, any>>(`riskAlerts/evc-dropped_${eventId}`))!;
    expect(alert).toMatchObject({ kind: "event-cancel-refund-dropped", severity: "high", status: "open", orgId, detail: { eventId } });
  });

  test("the trigger ignores updates that aren't a transition into cancelled", async () => {
    const { eventId } = await world();
    const uid = await newCustomer();
    const b = await book(uid, eventId);
    const run = (commerce.onEventCancelled as unknown as { run: (c: unknown, ctx: unknown) => Promise<void> }).run;
    await run({ before: { data: () => ({ status: "published" }) }, after: { data: () => ({ status: "booking-closed" }) } }, { params: { eventId } });
    await run({ before: { data: () => ({ status: "cancelled" }) }, after: { data: () => ({ status: "cancelled" }) } }, { params: { eventId } });
    expect((await getDoc<{ status: string }>(`bookings/${b.bookingId}`))!.status).toBe("confirmed");
  });
});
