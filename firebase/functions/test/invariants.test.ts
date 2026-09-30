/**
 * Cross-cutting invariants of the money and capacity engines, checked after
 * mixed (sequential AND concurrent) sequences of real service calls against
 * the Firestore emulator. Complements the per-feature suites:
 *
 *  I1  occupancy counters never negative, confirmed ≤ capacity, and the
 *      projection always equals the booking ledger of record, after random
 *      reserve / pay / late-capture / cancel / lapse / sweep sequences
 *  I2  expired holds don't consume inventory
 *  I3  refunds per payment ≤ captured, under repeated and concurrent requests
 *  I4  ledger is append-only and every txnId balances across a full journey
 *  I5  settlement net == gross − commission − refunds == ledger sum of the
 *      claimed entries, with partial refunds and awkward rounding
 *  I6  every stored money field is a non-negative safe integer
 *  I7  duplicate requestIds: booking / payment / refund retries return the
 *      same result with no second side effect
 */

import {
  adminCtx,
  book,
  call,
  callCode,
  capturedEvent,
  commerce,
  db,
  deliverWebhook,
  fakePayId,
  getDoc,
  lapseHold,
  newCustomer,
  order,
  phoneCtx,
  refundEvent,
  reserve,
  rid,
  seedEvent,
  seedMembership,
  seedOrg,
  uniq,
  world,
} from "./commerce-helpers";
import { paymentSignature } from "../src/commerce/provider";
import { releaseExpiredHolds } from "../src/commerce/holds";
import { refundCancelledEvent } from "../src/commerce/refunds";
import { sendEventReminders } from "../src/commerce/reminders";

jest.setTimeout(300_000);

/* ------------------------------------------------------------ helpers */

type Json = Record<string, any>;

const BAD = /^(INTERNAL|UNEXPECTED)/;

async function codeOfCall(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    const err = e as { details?: { code?: string }; message?: string };
    return err.details?.code ?? `UNEXPECTED:${err.message ?? String(e)}`;
  }
}

async function where(collection: string, field: string, value: unknown): Promise<Array<Json & { id: string }>> {
  const s = await db().collection(collection).where(field, "==", value).get();
  return s.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/** Capacity invariants of one event, recomputed from the ledger of record. */
async function assertOccupancy(eventId: string, label: string) {
  const ev = (await getDoc<Json>(`events/${eventId}`))!;
  const occ = ev.occupancy as Record<string, number>;
  const cap = ev.capacity as Record<string, number>;
  for (const [k, v] of Object.entries(occ)) {
    if (!Number.isSafeInteger(v) || v < 0) throw new Error(`${label}: occupancy.${k} = ${v}`);
  }
  const bookings = await where("bookings", "eventId", eventId);
  const held = bookings.filter((b) => b.status === "held").reduce((a, b) => a + (b.spots ?? 1), 0);
  const confirmed = bookings.filter((b) => b.status === "confirmed").reduce((a, b) => a + (b.spots ?? 1), 0);
  const sellable = cap.maxPhysicalCapacity - cap.blockedSlots;
  const tickets = await where("tickets", "eventId", eventId);
  const liveTickets = tickets.filter((t) => t.status === "valid" || t.status === "used").length;
  const got = {
    holds: occ.activeReservationHolds,
    confirmed: occ.confirmedPaidBookings,
    confirmedWithinCapacity: confirmed <= sellable,
    occupiedWithinCapacity: held + confirmed <= sellable,
    liveTickets,
    remaining: ev.remainingSellableCapacity ?? sellable,
  };
  expect({ label, ...got }).toEqual({
    label,
    holds: held,
    confirmed,
    confirmedWithinCapacity: true,
    occupiedWithinCapacity: true,
    liveTickets: confirmed,
    remaining: sellable - held - confirmed,
  });
}

/** Deterministic PRNG (mulberry32) so a failing sequence can be replayed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Actor {
  uid: string;
  bookingId?: string;
  paymentId?: string;
  providerOrderId?: string;
  amountMinor?: number;
}

type Op = "reserve" | "order" | "pay" | "late-webhook" | "cancel" | "lapse" | "sweep";
const OPS: Op[] = ["reserve", "reserve", "reserve", "order", "pay", "pay", "late-webhook", "cancel", "cancel", "lapse", "sweep"];

async function runOp(op: Op, a: Actor, eventId: string, r: () => number): Promise<string> {
  switch (op) {
    case "reserve":
      return codeOfCall(
        reserve(a.uid, eventId, 1 + Math.floor(r() * 3)).then((x) => {
          a.bookingId = x.bookingId;
          a.paymentId = a.providerOrderId = undefined;
        })
      );
    case "order":
      if (!a.bookingId) return "SKIP";
      return codeOfCall(
        order(a.uid, a.bookingId).then((o) => {
          a.paymentId = o.paymentId;
          a.providerOrderId = o.providerOrderId;
          a.amountMinor = o.amountMinor;
        })
      );
    case "pay": {
      if (!a.bookingId) return "SKIP";
      if (!a.paymentId) {
        const c = await runOp("order", a, eventId, r);
        if (c !== "OK") return `order:${c}`;
      }
      const payId = fakePayId();
      return codeOfCall(
        call(
          commerce.confirmPayment,
          { paymentId: a.paymentId, providerPaymentId: payId, providerSignature: paymentSignature(a.providerOrderId!, payId) },
          phoneCtx(a.uid)
        )
      );
    }
    case "late-webhook": {
      if (!a.paymentId) return "SKIP";
      const res = await deliverWebhook(
        capturedEvent({ providerPaymentId: fakePayId(), orderId: a.providerOrderId!, paymentId: a.paymentId, amount: a.amountMinor! })
      );
      return res.statusCode === 200 ? "OK" : `HTTP_${res.statusCode}`;
    }
    case "cancel":
      if (!a.bookingId) return "SKIP";
      return codeOfCall(call(commerce.cancelBooking, { requestId: rid(), bookingId: a.bookingId }, phoneCtx(a.uid)));
    case "lapse": {
      if (!a.bookingId) return "SKIP";
      const b = await getDoc<Json>(`bookings/${a.bookingId}`);
      if (b?.status !== "held") return "SKIP";
      await lapseHold(a.bookingId);
      return "OK";
    }
    case "sweep":
      await releaseExpiredHolds();
      return "OK";
  }
}

/* ============================================================== I1 */

describe("I1 occupancy", () => {
  test("random reserve / pay / late capture / cancel / lapse / sweep sequences keep the projection exact and within capacity", async () => {
    const { eventId } = await world({ capacity: 6, policy: "flexible" });
    const actors: Actor[] = [];
    for (let i = 0; i < 8; i++) actors.push({ uid: await newCustomer() });
    const r = rng(20260930);
    const seen = new Map<string, number>();
    const note = (op: string, code: string) => {
      const k = `${op}:${code}`;
      seen.set(k, (seen.get(k) ?? 0) + 1);
      if (BAD.test(code)) throw new Error(`${op} returned ${code}`);
    };

    // Sequential phase: invariant after every step.
    for (let i = 0; i < 70; i++) {
      const op = OPS[Math.floor(r() * OPS.length)]!;
      const a = actors[Math.floor(r() * actors.length)]!;
      note(op, await runOp(op, a, eventId, r));
      await assertOccupancy(eventId, `step ${i} ${op}`);
    }
    // Concurrent phase: 5 bursts of 8 simultaneous mixed operations.
    for (let round = 0; round < 5; round++) {
      const codes = await Promise.all(
        actors.map(async (a) => {
          const op = OPS[Math.floor(r() * OPS.length)]!;
          return [op, await runOp(op, a, eventId, r)] as const;
        })
      );
      codes.forEach(([op, c]) => note(op, c));
      await assertOccupancy(eventId, `burst ${round}`);
    }
    // Drain: every hold lapses and is swept → only confirmed seats remain.
    for (const a of actors) if (a.bookingId) await runOp("lapse", a, eventId, r);
    await releaseExpiredHolds();
    await assertOccupancy(eventId, "drained");
    const ev = (await getDoc<Json>(`events/${eventId}`))!;
    expect(ev.occupancy.activeReservationHolds).toBe(0);
    // The sequence really exercised the interesting paths.
    expect([...seen.keys()].some((k) => k.startsWith("reserve:SOLD_OUT"))).toBe(true);
    expect(seen.get("reserve:OK") ?? 0).toBeGreaterThan(5);
    expect(seen.get("cancel:OK") ?? 0).toBeGreaterThan(0);
  });
});

/* ============================================================== I2 */

describe("I2 expired holds", () => {
  test("after the sweep a lapsed hold frees its seats: another customer books the FULL capacity", async () => {
    const { eventId } = await world({ capacity: 3 });
    const a = await newCustomer();
    const b = await newCustomer();
    const held = await reserve(a, eventId, 3);
    expect(await callCode(commerce.reserveSeat, { requestId: rid(), eventId, spots: 1, alias: "Bee" }, phoneCtx(b))).toBe("SOLD_OUT");
    await lapseHold(held.bookingId);
    await releaseExpiredHolds();
    const r = await reserve(b, eventId, 3);
    expect(r.status).toBe("held");
    await assertOccupancy(eventId, "after sweep");
    expect((await getDoc<Json>(`bookings/${held.bookingId}`))!.status).toBe("expired");
  });

  test("the same customer re-reserving after their own hold lapsed reclaims it inline (no sweep needed)", async () => {
    const { eventId } = await world({ capacity: 3 });
    const a = await newCustomer();
    const first = await reserve(a, eventId, 3);
    await lapseHold(first.bookingId);
    const again = await reserve(a, eventId, 3);
    expect(again.status).toBe("held");
    expect((await getDoc<Json>(`bookings/${first.bookingId}`))!.status).toBe("expired");
    await assertOccupancy(eventId, "self re-reserve");
  });

  /**
   * Formerly a known gap: reserveSeat only reclaimed the CALLER's own lapsed
   * hold. It now also reclaims other customers' lapsed-but-unswept holds
   * inline when capacity is short (bounded, same effect as the sweeper).
   */
  test("a lapsed hold of ANOTHER customer does not block a reservation before the sweep runs", async () => {
    const { eventId } = await world({ capacity: 3 });
    const a = await newCustomer();
    const b = await newCustomer();
    const held = await reserve(a, eventId, 3);
    await lapseHold(held.bookingId);
    const r = await reserve(b, eventId, 3);
    expect(r.status).toBe("held");
    expect((await getDoc<Json>(`bookings/${held.bookingId}`))!.status).toBe("expired");
    await assertOccupancy(eventId, "inline reclaim of another customer's lapsed hold");
  });
});

/* ============================================================== I3 */

async function paymentMoney(paymentId: string, bookingId: string) {
  const p = (await getDoc<Json>(`payments/${paymentId}`))!;
  const refunds = await where("refunds", "paymentId", paymentId);
  const posted = refunds.filter((x) => x.ledgerPosted === true);
  const ledger = await where("ledgerEntries", "bookingId", bookingId);
  const credited = ledger.filter((e) => e.account === "customer_refunds" && e.direction === "credit").reduce((a, e) => a + e.amountMinor, 0);
  const b = (await getDoc<Json>(`bookings/${bookingId}`))!;
  return { p, refunds, posted, postedSum: posted.reduce((a, x) => a + x.amountMinor, 0), ledgerRefunds: credited, ledger, booking: b };
}

function assertBalanced(entries: Json[]) {
  const by = new Map<string, number>();
  for (const e of entries) {
    expect(Number.isSafeInteger(e.amountMinor) && e.amountMinor >= 0).toBe(true);
    by.set(e.txnId, (by.get(e.txnId) ?? 0) + (e.direction === "debit" ? e.amountMinor : -e.amountMinor));
  }
  for (const [txnId, diff] of by) expect({ txnId, diff }).toEqual({ txnId, diff: 0 });
  return by.size;
}

describe("I3 refund ceiling", () => {
  test("concurrent organizer refunds + customer cancel + event-cancel sweep never refund more than was captured", async () => {
    const { orgId, eventId } = await world({ capacity: 10, priceMinor: 99_900, commissionBps: 1_250, policy: "flexible" });
    const cust = await newCustomer();
    const b = await book(cust, eventId, 1);
    const staff = uniq("refunder");
    await seedMembership(orgId, staff, { permissions: ["refunds.request"], eventIds: "all" });

    // Each request is individually within the refundable amount; together they are not.
    const reqs = await Promise.all(
      [1, 2, 3].map(() =>
        call<{ refundId: string; status: string }>(
          commerce.requestRefund,
          { requestId: rid(), orgId, bookingId: b.bookingId, amountMinor: 60_000, reason: "Venue lights failed" },
          phoneCtx(staff)
        )
      )
    );
    expect(reqs.map((x) => x.status)).toEqual(["under-review", "under-review", "under-review"]);
    // Over-asking is refused up front.
    expect(
      await callCode(commerce.requestRefund, { requestId: rid(), orgId, bookingId: b.bookingId, amountMinor: 99_901, reason: "Too much" }, phoneCtx(staff))
    ).toBe("INVALID_INPUT");

    const decideRids = reqs.map(() => rid());
    const codes = await Promise.all([
      ...reqs.map((x, i) =>
        codeOfCall(call(commerce.decideRefund, { requestId: decideRids[i], refundId: x.refundId, decision: "approve", note: "Approved" }, adminCtx(`adm-${i}`)))
      ),
      codeOfCall(call(commerce.cancelBooking, { requestId: rid(), bookingId: b.bookingId }, phoneCtx(cust))),
      codeOfCall(call(commerce.cancelBooking, { requestId: rid(), bookingId: b.bookingId }, phoneCtx(cust))),
      codeOfCall(refundCancelledEvent(eventId, { uid: "system", role: "system" })),
    ]);
    for (const c of codes) expect(c).not.toMatch(BAD);

    // Retries of every decision (same requestId) change nothing.
    const before = await paymentMoney(b.paymentId!, b.bookingId);
    const replays = await Promise.all(
      reqs.map((x, i) =>
        codeOfCall(call(commerce.decideRefund, { requestId: decideRids[i], refundId: x.refundId, decision: "approve", note: "Approved" }, adminCtx(`adm-${i}`)))
      )
    );
    expect(replays.map((c) => c === "OK")).toEqual(codes.slice(0, 3).map((c) => c === "OK"));
    // Late provider confirmations for every refund (twice each).
    for (const rf of before.refunds.filter((x) => x.providerRefundId)) {
      for (let k = 0; k < 2; k++) {
        await deliverWebhook(refundEvent("refund.processed", { providerRefundId: rf.providerRefundId, refundId: rf.id, amount: rf.amountMinor }));
      }
    }
    const m = await paymentMoney(b.paymentId!, b.bookingId);
    expect(m.ledger.length).toBe(before.ledger.length);

    expect(m.p.refundedMinor).toBeLessThanOrEqual(m.p.amountMinor);
    expect(m.postedSum).toBe(m.p.refundedMinor);
    expect(m.ledgerRefunds).toBe(m.p.refundedMinor);
    expect(m.booking.refundedMinor ?? 0).toBeLessThanOrEqual(m.p.amountMinor);
    // The booking ended cancelled, so everything captured went back exactly once.
    expect(m.booking.status).toBe("cancelled");
    expect(m.p.refundedMinor).toBe(m.p.amountMinor);
    expect(m.p.status).toBe("refunded");
    assertBalanced(m.ledger);
    // Commission reversal is exact: the platform keeps nothing of a full refund.
    const commission = m.ledger
      .filter((e) => e.account === "platform_commission")
      .reduce((a, e) => a + (e.direction === "credit" ? e.amountMinor : -e.amountMinor), 0);
    expect(commission).toBe(0);
    await assertOccupancy(eventId, "after refunds");

    // Nothing more can be requested on a fully refunded payment.
    expect(
      await callCode(commerce.requestRefund, { requestId: rid(), orgId, bookingId: b.bookingId, amountMinor: 1, reason: "One more" }, phoneCtx(staff))
    ).toBe("PRECONDITION");
  });

  test("two admins approving the last two partial refunds at once: only what's left is refunded", async () => {
    const { orgId, eventId } = await world({ priceMinor: 50_000, commissionBps: 999 });
    const cust = await newCustomer();
    const b = await book(cust, eventId, 1);
    const staff = uniq("refunder");
    await seedMembership(orgId, staff, { permissions: ["refunds.request"], eventIds: "all" });
    const mk = (amountMinor: number) =>
      call<{ refundId: string }>(commerce.requestRefund, { requestId: rid(), orgId, bookingId: b.bookingId, amountMinor, reason: "Partial" }, phoneCtx(staff));
    const r1 = await mk(20_001);
    const r2 = await mk(29_999);
    const r3 = await mk(29_999);
    const codes = await Promise.all(
      [r1, r2, r3].map((x, i) => codeOfCall(call(commerce.decideRefund, { requestId: rid(), refundId: x.refundId, decision: "approve", note: "OK then" }, adminCtx(`a${i}`))))
    );
    for (const c of codes) expect(c).not.toMatch(BAD);
    const m = await paymentMoney(b.paymentId!, b.bookingId);
    expect(m.p.refundedMinor).toBeLessThanOrEqual(50_000);
    expect(m.postedSum).toBe(m.p.refundedMinor);
    expect(m.ledgerRefunds).toBe(m.p.refundedMinor);
    // Exactly one of the two 29,999 refunds fits next to 20,001 (and r1 may lose to both).
    expect([50_000, 49_998, 29_999, 20_001]).toContain(m.p.refundedMinor);
    expect(codes.filter((c) => c === "OK").length).toBe(m.posted.length);
    assertBalanced(m.ledger);
  });
});

/* ============================================================== I4 + I5 + I6 */

type Snap = Map<string, { data: string; settlementId: string | null }>;

async function ledgerSnapshot(orgId: string): Promise<Snap> {
  const s = await db().collection("ledgerEntries").where("orgId", "==", orgId).get();
  const out: Snap = new Map();
  for (const d of s.docs) {
    const { settlementId, ...rest } = d.data();
    out.set(d.id, { data: JSON.stringify(rest), settlementId: settlementId ?? null });
  }
  return out;
}

/** Earlier entries still exist, unchanged except settlementId null → S (once). */
function expectAppendOnly(before: Snap, after: Snap, label: string) {
  expect(after.size).toBeGreaterThanOrEqual(before.size);
  const problems: string[] = [];
  for (const [id, e] of before) {
    const a = after.get(id);
    if (!a) problems.push(`${label}: ${id} deleted`);
    else if (a.data !== e.data) problems.push(`${label}: ${id} changed`);
    else if (e.settlementId !== null && a.settlementId !== e.settlementId) problems.push(`${label}: ${id} re-settled`);
  }
  expect(problems).toEqual([]);
}

const MONEY_KEY = /(Minor|Bps)$/;

/** Every numeric money field anywhere in [doc] is a non-negative safe integer. */
function badMoney(path: string, value: unknown, out: string[], key = "") {
  if (value === null || value === undefined) return;
  if (Array.isArray(value)) return value.forEach((v, i) => badMoney(`${path}[${i}]`, v, out, key));
  if (typeof value === "object" && !(value as { toMillis?: unknown }).toMillis) {
    for (const [k, v] of Object.entries(value)) badMoney(`${path}.${k}`, v, out, k);
    return;
  }
  if (MONEY_KEY.test(key) || key === "spots" || key === "entryCount") {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) out.push(`${path} = ${JSON.stringify(value)}`);
    if (key.endsWith("Bps") && typeof value === "number" && value > 10_000) out.push(`${path} = ${value} (> 100%)`);
  }
}

describe("I4–I6 ledger, settlement and money fields over a full journey", () => {
  test("append-only ledger, balanced txns, settlement == ledger, integer money everywhere", async () => {
    const orgId = uniq("org");
    await seedOrg(orgId);
    // Awkward prices and a commission rate that never divides evenly.
    const done = await seedEvent({ orgId, priceMinor: 99_999, commissionBps: 777, policy: "moderate", startsInHours: 48, capacity: 12 });
    const other = await seedEvent({ orgId, priceMinor: 12_345, commissionBps: 3_333, capacity: 5 });
    const snaps: Snap[] = [];
    const checkpoint = async (label: string) => {
      const s = await ledgerSnapshot(orgId);
      if (snaps.length) expectAppendOnly(snaps[snaps.length - 1]!, s, label);
      snaps.push(s);
    };

    const buyers = await Promise.all([1, 2, 3, 4, 5].map(() => newCustomer()));
    const b1 = await book(buyers[0]!, done, 2);
    const b2 = await book(buyers[1]!, done, 1);
    const b3 = await book(buyers[2]!, done, 3);
    const b4 = await book(buyers[3]!, other, 1);
    const held = await reserve(buyers[4]!, done, 1);
    await checkpoint("captures");

    // Customer cancellation (policy refund), a discretionary partial refund, a webhook replay.
    const cxl = await call<{ refund: { refundId: string; amountMinor: number } | null }>(
      commerce.cancelBooking, { requestId: rid(), bookingId: b2.bookingId }, phoneCtx(buyers[1]!)
    );
    expect(cxl.refund?.amountMinor).toBeGreaterThan(0);
    const staff = uniq("refunder");
    await seedMembership(orgId, staff, { permissions: ["refunds.request"], eventIds: "all" });
    const pr = await call<{ refundId: string }>(
      commerce.requestRefund, { requestId: rid(), orgId, bookingId: b3.bookingId, amountMinor: 33_333, reason: "One guest no-show" }, phoneCtx(staff)
    );
    await call(commerce.decideRefund, { requestId: rid(), refundId: pr.refundId, decision: "approve", note: "Agreed" }, adminCtx("admin-a"));
    await deliverWebhook(capturedEvent({ providerPaymentId: b1.providerPaymentId!, orderId: b1.providerOrderId!, paymentId: b1.paymentId!, amount: 99_999 * 2 }));
    for (const id of [cxl.refund!.refundId, pr.refundId]) {
      const rf = (await getDoc<Json>(`refunds/${id}`))!;
      await deliverWebhook(refundEvent("refund.processed", { providerRefundId: rf.providerRefundId ?? uniq("rfnd"), refundId: id, amount: rf.amountMinor }));
    }
    await checkpoint("refunds");

    // Scheduled jobs touch nothing in the ledger.
    await lapseHold(held.bookingId);
    await releaseExpiredHolds();
    await sendEventReminders();
    await checkpoint("jobs");

    // Complete + settle + pay out.
    await db().collection("events").doc(done).update({ status: "completed" });
    const built = await call<{ settlementId: string; netMinor: number; entryCount: number }>(
      commerce.buildSettlement, { requestId: rid(), orgId, periodEnd: new Date().toISOString() }, adminCtx("admin-a")
    );
    await checkpoint("settlement built");
    await call(commerce.decideSettlement, { requestId: rid(), settlementId: built.settlementId, action: "approve", note: "Checked" }, adminCtx("admin-a"));
    await call(
      commerce.decideSettlement,
      { requestId: rid(), settlementId: built.settlementId, action: "mark-paid", note: "Paid out", payoutReference: "UTR123456" },
      adminCtx("admin-b")
    );
    // A second build claims nothing.
    const again = await call<{ entryCount: number }>(commerce.buildSettlement, { requestId: rid(), orgId, periodEnd: new Date().toISOString() }, adminCtx("admin-b"));
    expect(again.entryCount).toBe(0);
    await checkpoint("settlement paid");

    // ---- I4: every txn balances; only organizer_payable entries were ever stamped.
    const ledger = await where("ledgerEntries", "orgId", orgId);
    const txns = assertBalanced(ledger);
    expect(txns).toBe(4 + 2); // 4 captures + 2 refunds
    expect(ledger.filter((e) => e.settlementId !== null && e.account !== "organizer_payable")).toEqual([]);

    // ---- I5: settlement reconciles three ways.
    const s = (await getDoc<Json>(`settlements/${built.settlementId}`))!;
    const claimed = ledger.filter((e) => e.settlementId === built.settlementId);
    const net = claimed.reduce((a, e) => a + (e.direction === "credit" ? e.amountMinor : -e.amountMinor), 0);
    expect(s.grossMinor - s.commissionMinor - s.refundsMinor).toBe(s.netMinor);
    expect(s.netMinor).toBe(net);
    expect(s.entryCount).toBe(claimed.length);
    expect(s.grossMinor).toBe(claimed.filter((e) => e.direction === "credit").reduce((a, e) => a + e.txnGrossMinor, 0));
    expect(s.commissionMinor).toBe(claimed.filter((e) => e.direction === "credit").reduce((a, e) => a + e.txnCommissionMinor, 0));
    expect(s.refundsMinor).toBe(claimed.filter((e) => e.direction === "debit").reduce((a, e) => a + e.amountMinor, 0));
    // Everything of the completed event and nothing of the open one.
    expect(claimed.every((e) => e.eventId === done)).toBe(true);
    expect(ledger.filter((e) => e.eventId === done && e.account === "organizer_payable" && e.settlementId !== built.settlementId)).toEqual([]);
    expect(ledger.some((e) => e.eventId === other && e.account === "organizer_payable" && e.settlementId === null)).toBe(true);
    // Money conservation for the completed event: paid in − refunded == organizer net + platform net.
    const ofDone = ledger.filter((e) => e.eventId === done);
    const acct = (a: string) => ofDone.filter((e) => e.account === a).reduce((x, e) => x + (e.direction === "credit" ? e.amountMinor : -e.amountMinor), 0);
    expect(-acct("customer_payments") - acct("customer_refunds")).toBe(acct("organizer_payable") + acct("platform_commission"));
    expect(acct("organizer_payable")).toBe(s.netMinor);
    // And against the payment documents of record.
    const pays = (await where("payments", "eventId", done)).filter((p) => !!p.capturedAt);
    expect(s.grossMinor).toBe(pays.reduce((a, p) => a + p.amountMinor, 0));
    expect(-acct("customer_refunds")).toBe(-pays.reduce((a, p) => a + (p.refundedMinor ?? 0), 0));

    // ---- I6: every stored money field is a non-negative safe integer.
    const bad: string[] = [];
    for (const c of ["bookings", "payments", "refunds", "ledgerEntries", "settlements", "tickets"]) {
      for (const d of await where(c, "orgId", orgId)) badMoney(`${c}/${d.id}`, d, bad);
    }
    for (const id of [done, other]) badMoney(`events/${id}`, await getDoc(`events/${id}`), bad);
    expect(bad).toEqual([]);
    void b4;
  });
});

/* ============================================================== I7 */

describe("I7 duplicate requestIds", () => {
  test("booking: the same requestId after the booking was cancelled returns the original booking, never a second one", async () => {
    const { eventId } = await world({ capacity: 5 });
    const c = await newCustomer();
    const reqId = rid();
    const first = await reserve(c, eventId, 2, reqId);
    await call(commerce.cancelBooking, { requestId: rid(), bookingId: first.bookingId }, phoneCtx(c));
    const again = await reserve(c, eventId, 2, reqId);
    expect(again.bookingId).toBe(first.bookingId);
    const mine = (await where("bookings", "eventId", eventId)).filter((b) => b.customerUid === c);
    expect(mine.length).toBe(1);
    await assertOccupancy(eventId, "replayed reserve");
  });

  test("payment: repeated order creation and repeated / concurrent confirmations settle once", async () => {
    const { eventId } = await world({ priceMinor: 45_678, commissionBps: 1_111 });
    const c = await newCustomer();
    const r = await reserve(c, eventId, 2);
    const orderReq = rid();
    const orders = await Promise.all([
      call<Json>(commerce.createPaymentOrder, { requestId: orderReq, bookingId: r.bookingId }, phoneCtx(c)),
      call<Json>(commerce.createPaymentOrder, { requestId: orderReq, bookingId: r.bookingId }, phoneCtx(c)),
      call<Json>(commerce.createPaymentOrder, { requestId: rid(), bookingId: r.bookingId }, phoneCtx(c)),
    ]);
    expect(new Set(orders.map((o) => o.paymentId)).size).toBe(1);
    expect(new Set(orders.map((o) => o.providerOrderId)).size).toBe(1);
    expect((await where("payments", "bookingId", r.bookingId)).length).toBe(1);

    const o = orders[0]!;
    const payId = fakePayId();
    const confirm = { paymentId: o.paymentId, providerPaymentId: payId, providerSignature: paymentSignature(o.providerOrderId, payId) };
    const results = await Promise.all([1, 2, 3].map(() => call<Json>(commerce.confirmPayment, confirm, phoneCtx(c))));
    const notesAfterFirst = (await where("userNotifications", "recipientUid", c)).length;
    const replay = await call<Json>(commerce.confirmPayment, confirm, phoneCtx(c));
    for (const x of [...results, replay]) {
      expect({ bookingId: x.bookingId, status: x.status, ticketIds: [...x.ticketIds].sort() }).toEqual({
        bookingId: r.bookingId,
        status: "confirmed",
        ticketIds: [...results[0]!.ticketIds].sort(),
      });
    }
    // The webhook for the same capture is a no-op too.
    await deliverWebhook(capturedEvent({ providerPaymentId: payId, orderId: o.providerOrderId, paymentId: o.paymentId, amount: 45_678 * 2 }));
    expect((await where("tickets", "bookingId", r.bookingId)).length).toBe(2);
    const ledger = await where("ledgerEntries", "bookingId", r.bookingId);
    expect(ledger.length).toBe(3);
    assertBalanced(ledger);
    expect((await where("userNotifications", "recipientUid", c)).length).toBe(notesAfterFirst);
    await assertOccupancy(eventId, "replayed confirm");
  });

  test("refund: repeated / concurrent cancelBooking, requestRefund and decideRefund with the same requestId refund once", async () => {
    const { orgId, eventId } = await world({ priceMinor: 70_001, commissionBps: 1_250, policy: "flexible" });
    const c1 = await newCustomer();
    const c2 = await newCustomer();
    const b1 = await book(c1, eventId, 2);
    const b2 = await book(c2, eventId, 1);

    // cancelBooking ×3 concurrently with one requestId, then a replay.
    const cxlReq = rid();
    const cxl = await Promise.all([1, 2, 3].map(() => call<Json>(commerce.cancelBooking, { requestId: cxlReq, bookingId: b1.bookingId }, phoneCtx(c1))));
    const cxlReplay = await call<Json>(commerce.cancelBooking, { requestId: cxlReq, bookingId: b1.bookingId }, phoneCtx(c1));
    const ids = new Set([...cxl, cxlReplay].map((x) => `${x.refund?.refundId}:${x.refund?.amountMinor}`));
    expect(ids.size).toBe(1);
    const m1 = await paymentMoney(b1.paymentId!, b1.bookingId);
    expect(m1.refunds.length).toBe(1);
    expect(m1.p.refundedMinor).toBe(m1.refunds[0]!.amountMinor);
    expect(m1.ledgerRefunds).toBe(m1.p.refundedMinor);

    // requestRefund ×2 with one requestId → one refund doc; decideRefund ×3 with one requestId → one approval.
    const staff = uniq("refunder");
    await seedMembership(orgId, staff, { permissions: ["refunds.request"], eventIds: "all" });
    const reqReq = rid();
    const rr = await Promise.all(
      [1, 2].map(() =>
        call<Json>(commerce.requestRefund, { requestId: reqReq, orgId, bookingId: b2.bookingId, amountMinor: 10_000, reason: "Late start" }, phoneCtx(staff))
      )
    );
    expect(rr[0]!.refundId).toBe(rr[1]!.refundId);
    const decReq = rid();
    const dec = await Promise.all(
      [1, 2, 3].map(() => call<Json>(commerce.decideRefund, { requestId: decReq, refundId: rr[0]!.refundId, decision: "approve", note: "Fine" }, adminCtx("admin-a")))
    );
    expect(new Set(dec.map((d) => d.refundId)).size).toBe(1);
    const m2 = await paymentMoney(b2.paymentId!, b2.bookingId);
    expect(m2.refunds.length).toBe(1);
    expect(m2.p.refundedMinor).toBe(10_000);
    expect(m2.ledgerRefunds).toBe(10_000);
    expect(m2.ledger.filter((e) => e.kind === "refund").map((e) => e.txnId).filter((v, i, a) => a.indexOf(v) === i).length).toBe(1);
    assertBalanced([...m1.ledger, ...m2.ledger]);
    await assertOccupancy(eventId, "replayed refunds");
  });
});
