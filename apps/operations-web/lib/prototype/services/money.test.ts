import { describe, expect, it } from "vitest";
import { getInitialState } from "../scenarios/initial";
import type { PrototypeState } from "../scenarios/state";
import { bookingRefundTotals, buildLedgerTransactions, selectFinancialOperationsMetrics, selectReconciliationIssues } from "../selectors/money";
import { generateOperationsAlerts } from "../selectors/intelligence";
import { approveRefund, completeRefund, initiateRefund, migrateLegacyMoney, reconcilePayment, rejectRefund } from "./money";
import { approveRefundException, recommendRefundException, rejectRefundException } from "./refundExceptions";
import { cancelSession } from "./operations";
import { cancelBooking } from "./bookings";
import { migrateState } from "../migrations";

const T0 = "2026-09-29T12:00:00.000Z";
const PAYOUT = { method: "upi", reference: "UTR998877665544" };
const FINANCE = "finance";

const seed = () => getInitialState();

describe("refund lifecycle: requested → approved → paid out", () => {
  it("requires a reason, a positive amount and a recorded payment", () => {
    const s = seed();
    expect(initiateRefund(s, { bookingId: "b-10", amount: 100, reason: "" }).error).toMatch(/reason/);
    expect(initiateRefund(s, { bookingId: "b-10", amount: 0, reason: "Customer request" }).error).toMatch(/greater than zero/);
    expect(initiateRefund(s, { bookingId: "b-22", amount: 100, reason: "Customer request" }).error).toMatch(/No payment/);
    expect(initiateRefund(s, { bookingId: "b-23", amount: 10, reason: "Complimentary" }).error).toMatch(/No payment/);
  });

  it("blocks cumulative over-refunds across several requests", () => {
    let s = seed();
    const first = initiateRefund(s, { bookingId: "b-10", amount: 200, reason: "Partial refund for late start" }, T0);
    expect(first.error).toBeUndefined();
    s = first.state;
    expect(initiateRefund(s, { bookingId: "b-10", amount: 200, reason: "Second partial refund" }, T0).error).toMatch(/exceed what can still be refunded/);
    expect(initiateRefund(s, { bookingId: "b-10", amount: 149, reason: "Remaining balance" }, T0).error).toBeUndefined();
    expect(bookingRefundTotals(s, "b-10").refundable).toBe(149);
  });

  it("approval does not pay out; payout needs a reference and can happen only once", () => {
    let s = seed();
    const req = initiateRefund(s, { bookingId: "b-10", amount: 349, reason: "Customer cannot attend" }, T0);
    s = req.state;
    const id = req.refund!.id;
    expect(completeRefund(s, id, PAYOUT, "op-6", FINANCE, T0).error).toMatch(/Approve the refund/);

    const approved = approveRefund(s, id, "op-6", FINANCE, T0);
    expect(approved.error).toBeUndefined();
    s = approved.state;
    expect(s.refunds.find((r) => r.id === id)!.status).toBe("approved");
    expect(approveRefund(s, id, "op-6", FINANCE, T0).error).toMatch(/already approved/);

    expect(completeRefund(s, id, { method: "upi", reference: "" }, "op-6", FINANCE, T0).error).toMatch(/payout reference/);
    const done = completeRefund(s, id, PAYOUT, "op-6", FINANCE, T0);
    expect(done.error).toBeUndefined();
    s = done.state;
    const r = s.refunds.find((x) => x.id === id)!;
    expect(r.status).toBe("completed");
    expect(r.payoutReference).toBe(PAYOUT.reference);
    expect(r.completedBy).toBe("op-6");
    expect(s.bookings.find((b) => b.id === "b-10")!.paymentStatus).toBe("refunded");
    expect(s.bookings.find((b) => b.id === "b-10")!.status).toBe("refunded");
    expect(completeRefund(s, id, PAYOUT, "op-6", FINANCE, T0).error).toMatch(/already been paid out/);
    expect(s.transactions.find((t) => t.refundId === id)).toMatchObject({ status: "settled", amount: -349 });
  });

  it("rejection needs a reason and frees the refundable amount again", () => {
    let s = seed();
    const req = initiateRefund(s, { bookingId: "b-11", amount: 349, reason: "Duplicate charge claim" }, T0);
    s = req.state;
    expect(rejectRefund(s, req.refund!.id, "no", "op-6", FINANCE, T0).error).toMatch(/reason/);
    s = rejectRefund(s, req.refund!.id, "Charge was not duplicated", "op-6", FINANCE, T0).state;
    expect(bookingRefundTotals(s, "b-11").refundable).toBe(349);
    expect(s.bookings.find((b) => b.id === "b-11")!.paymentStatus).toBe("confirmed");
  });

  it("only Finance, Super Admin or Platform Owner can approve or pay out", () => {
    const s = seed();
    expect(approveRefund(s, "ref-004", "op-9", "analyst", T0).error).toMatch(/Only Finance/);
    expect(completeRefund(s, "ref-003", PAYOUT, "op-9", "support", T0).error).toMatch(/Only Finance/);
    expect(approveRefund(s, "ref-004", "op-6", FINANCE, T0).error).toBeUndefined();
  });

  it("verifying a payment needs a confirmed payment with a reference", () => {
    const s = seed();
    expect(reconcilePayment(s, "pay-b-22").error).toMatch(/Only a confirmed payment/);
    const ok = reconcilePayment(s, "pay-b-10");
    expect(ok.error).toBeUndefined();
    expect(ok.state.payments.find((p) => p.id === "pay-b-10")!.status).toBe("reconciled");
    expect(reconcilePayment(ok.state, "pay-b-10").error).toMatch(/already verified/);
  });
});

describe("refund exceptions use the same over-refund guard", () => {
  it("approving creates an APPROVED refund (not a completed one) and completion closes the exception", () => {
    let s = seed();
    const approved = approveRefundException(s, "rex-2", "op-6", { actorRole: FINANCE }, T0);
    expect(approved.error).toBeUndefined();
    s = approved.state;
    const rex = s.refundExceptions.find((e) => e.id === "rex-2")!;
    expect(rex.status).toBe("approved");
    const refund = s.refunds.find((r) => r.id === rex.linkedRefundId)!;
    expect(refund).toMatchObject({ status: "approved", bookingId: "b-8", amount: 499, refundExceptionId: "rex-2" });
    expect(approveRefundException(s, "rex-2", "op-6", { actorRole: FINANCE }, T0).error).toMatch(/already approved/);

    s = completeRefund(s, refund.id, PAYOUT, "op-6", FINANCE, T0).state;
    expect(s.refundExceptions.find((e) => e.id === "rex-2")!.status).toBe("completed");
  });

  it("refuses an exception that would refund more than was paid", () => {
    let s = seed();
    // b-8 already has a partial refund in progress.
    s = initiateRefund(s, { bookingId: "b-8", amount: 300, reason: "Partial goodwill refund" }, T0).state;
    const blocked = approveRefundException(s, "rex-2", "op-6", { actorRole: FINANCE }, T0);
    expect(blocked.error).toMatch(/exceed what can still be refunded/);
    expect(blocked.state).toBe(s);
    expect(s.refundExceptions.find((e) => e.id === "rex-2")!.status).toBe("recommended");
  });

  it("an exception without a booking must be linked to one before approval", () => {
    let s = seed();
    const rec = recommendRefundException(s, { sessionId: "s-1", reason: "venue-failure", amount: 200, notes: "Floodlight failure" }, "op-4", T0);
    expect(rec.error).toBeUndefined();
    s = rec.state;
    const id = rec.exception!.id;
    expect(approveRefundException(s, id, "op-6", { actorRole: FINANCE }, T0).error).toMatch(/Link this exception/);
    expect(approveRefundException(s, id, "op-6", { actorRole: FINANCE, bookingId: "b-30" }, T0).error).toMatch(/different session/);
    const ok = approveRefundException(s, id, "op-6", { actorRole: FINANCE, bookingId: "b-2" }, T0);
    expect(ok.error).toBeUndefined();
    expect(ok.state.refunds.find((r) => r.refundExceptionId === id)!.bookingId).toBe("b-2");
    expect(recommendRefundException(s, { bookingId: "b-2", reason: "venue-failure", amount: 9999 }, "op-4", T0).error).toMatch(/exceed/);
  });

  it("rejection needs a reason and a Finance role", () => {
    const s = seed();
    expect(rejectRefundException(s, "rex-2", "", "op-6", { actorRole: FINANCE }).error).toMatch(/reason/);
    expect(rejectRefundException(s, "rex-2", "Outside policy", "op-6", { actorRole: "coordinator" }).error).toMatch(/Only Finance/);
    expect(rejectRefundException(s, "rex-2", "Outside policy", "op-6", { actorRole: FINANCE }).state.refundExceptions.find((e) => e.id === "rex-2")!.status).toBe("rejected");
  });
});

describe("cancelSession creates Refund records", () => {
  it("creates one requested refund per paid booking for what can still be refunded", () => {
    let s = seed();
    // b-2 already has a 100 partial refund requested.
    s = initiateRefund(s, { bookingId: "b-2", amount: 100, reason: "Late start goodwill" }, T0).state;
    const out = cancelSession(s, "s-1", "Heavy rain on the ground", "op-4", T0);
    expect(out.error).toBeUndefined();
    const next = out.state;
    const created = next.refunds.filter((r) => r.sessionId === "s-1" && r.type === "company-cancellation");
    expect(created).toHaveLength(8);
    expect(out.refundCount).toBe(8);
    expect(created.find((r) => r.bookingId === "b-2")!.amount).toBe(399);
    expect(created.find((r) => r.bookingId === "b-1")!.amount).toBe(499);
    expect(created.every((r) => r.status === "requested")).toBe(true);
    for (const b of next.bookings.filter((x) => x.sessionId === "s-1")) {
      expect(b.status).toBe("cancelled-company");
      expect(bookingRefundTotals(next, b.id).committed).toBeLessThanOrEqual(bookingRefundTotals(next, b.id).paid);
    }
    expect(next.sessions.find((x) => x.id === "s-1")!.status).toBe("cancelled");
    // The ledger view is derived from the refunds.
    expect(next.transactions.filter((t) => t.kind === "refund" && t.sessionId === "s-1" && t.status === "pending")).toHaveLength(9);
    expect(cancelSession(next, "s-1", "Again", "op-4", T0).error).toMatch(/already cancelled/);
  });

  it("cancels open payment holds without refunds and skips complimentary seats", () => {
    const out = cancelSession(seed(), "s-2", "Venue closed for maintenance", "op-4", T0);
    const next = out.state;
    expect(next.payments.find((p) => p.bookingId === "b-22")!.status).toBe("cancelled");
    expect(next.refunds.some((r) => r.bookingId === "b-22" || r.bookingId === "b-23")).toBe(false);
    expect(out.refundCount).toBe(12);
  });

  it("requires a reason", () => {
    expect(cancelSession(seed(), "s-1", "", "op-4").error).toMatch(/reason/);
  });

  it("cancelling one paid booking creates a refund request", () => {
    const out = cancelBooking(seed(), "b-10", { reason: "Customer cannot attend" }, "op-5", T0);
    expect(out.error).toBeUndefined();
    expect(out.state.refunds.find((r) => r.id === out.refundId)).toMatchObject({ bookingId: "b-10", amount: 349, status: "requested", type: "user-cancellation" });
    expect(cancelBooking(out.state, "b-10", { reason: "Customer cannot attend" }).error).toMatch(/already cancelled/);
  });
});

describe("single money ledger", () => {
  it("the seed ledger is derived from payments and refunds and reconciles cleanly", () => {
    const s = seed();
    expect(s.transactions).toEqual(buildLedgerTransactions(s));
    expect(selectReconciliationIssues(s)).toEqual([]);
    const m = selectFinancialOperationsMetrics(s);
    expect(m.grossCollected).toBeGreaterThan(0);
    expect(m.netRevenue).toBe(m.grossCollected - m.totalRefunded);
  });

  it("the migration turns ledger-only rows into Payment/Refund records without over-refunding", () => {
    const s = seed();
    const legacy: PrototypeState = {
      ...s,
      bookings: [...s.bookings, { id: "b-old", sessionId: "s-7", alias: "Legacy", phoneMask: "", amount: 199, status: "cancelled-user", paymentStatus: "refunded", createdAt: "Today, 09:00" }],
      transactions: [
        ...s.transactions,
        { id: "t-x1", sessionId: "s-7", territoryId: "blr-south", bookingId: "b-old", kind: "payment", amount: 199, method: "upi", status: "settled", at: "09:00" },
        { id: "t-x2", sessionId: "s-7", territoryId: "blr-south", bookingId: "b-old", kind: "refund", amount: -500, method: "upi", status: "pending", at: "09:30" },
      ],
    };
    const once = migrateLegacyMoney(legacy, T0);
    expect(once.payments.filter((p) => p.bookingId === "b-old")).toHaveLength(1);
    const refunds = once.refunds.filter((r) => r.bookingId === "b-old");
    expect(refunds).toHaveLength(1);
    expect(refunds[0].amount).toBe(199);
    const twice = migrateLegacyMoney(once, T0);
    expect(twice.payments).toEqual(once.payments);
    expect(twice.refunds).toEqual(once.refunds);
    expect(twice.transactions).toEqual(once.transactions);
  });

  it("the full migration pipeline leaves the seed unchanged in meaning", () => {
    const s = seed();
    const migrated = migrateState(s);
    expect(migrated.bookings).toBe(s.bookings);
    expect(migrated.refunds).toEqual(s.refunds);
  });
});

describe("operations alerts", () => {
  it("uses canonical data and ISO times", () => {
    const now = new Date().toISOString();
    const alerts = generateOperationsAlerts(seed(), now);
    expect(alerts.every((a) => a.generatedAt === now)).toBe(true);
    expect(alerts.some((a) => a.type === "refund-spike")).toBe(true);
    expect(alerts.some((a) => a.type === "refund-payout-pending")).toBe(true);
    // Seeded sessions are consistent: no free seats while people wait, nobody overbooked.
    expect(alerts.some((a) => a.type === "venue-overbooked")).toBe(false);
    expect(alerts.some((a) => a.id.startsWith("alert-waitlist-free"))).toBe(false);
    // Severity order: critical first.
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    for (let i = 1; i < alerts.length; i++) expect(order[alerts[i].severity]).toBeGreaterThanOrEqual(order[alerts[i - 1].severity]);
  });
});

describe("empty workspace", () => {
  it("money, capacity and alert read models work on a fresh workspace", async () => {
    const { getEmptyState } = await import("../scenarios/initial");
    const empty = getEmptyState();
    expect(selectFinancialOperationsMetrics(empty).grossCollected).toBe(0);
    expect(selectReconciliationIssues(empty)).toEqual([]);
    expect(generateOperationsAlerts(empty)).toEqual([]);
    expect(migrateState(empty).transactions).toEqual([]);
  });
});
