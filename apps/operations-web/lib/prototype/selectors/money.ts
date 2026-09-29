import type { PrototypeState } from "../scenarios/state";
import type { Payment, Refund, RefundStatus, ScheduledSession, Transaction } from "../entities";
import { sessionCapacityLedger } from "./capacity";
import { canonicalBookingStatus, isoMillis, seatClass } from "./status";

/* ------------------------------------------------------------------
 * Money read model.
 *
 * Payments and Refunds are the source of truth for booking money.
 * `state.transactions` is a derived ledger view (see `buildLedgerTransactions`)
 * plus manual promo / adjustment entries; services rebuild it after every
 * money change so older readers of the ledger stay consistent.
 * ------------------------------------------------------------------ */

/** Payment statuses that mean money was received. */
export const COLLECTED_PAYMENT_STATUSES = new Set<Payment["status"]>(["confirmed", "reconciled"]);

/** Refund statuses that count against what can still be refunded. */
export const COMMITTED_REFUND_STATUSES = new Set<RefundStatus>(["requested", "under-review", "approved", "processing", "completed"]);

/** Refunds waiting for a Finance decision. */
export const AWAITING_APPROVAL_REFUND_STATUSES = new Set<RefundStatus>(["requested", "under-review"]);

/** Refunds approved but not yet paid out. */
export const AWAITING_PAYOUT_REFUND_STATUSES = new Set<RefundStatus>(["approved", "processing"]);

export const PAYMENT_METHODS = [
  { id: "upi", label: "UPI" },
  { id: "card", label: "Card (POS terminal)" },
  { id: "cash", label: "Cash" },
  { id: "bank-transfer", label: "Bank transfer" },
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHODS)[number]["id"];

export const paymentMethodLabel = (id?: string): string =>
  PAYMENT_METHODS.find((m) => m.id === id)?.label ??
  (id === "internal" || id === "complimentary" ? "Complimentary" : id ? id.replace(/[-_]/g, " ") : "—");

export function selectPaymentList(state: PrototypeState): Payment[] {
  return state.payments ?? [];
}

export function selectRefundList(state: PrototypeState): Refund[] {
  return state.refunds ?? [];
}

export function paymentsForBooking(state: Pick<PrototypeState, "payments">, bookingId: string): Payment[] {
  return (state.payments ?? []).filter((p) => p.bookingId === bookingId);
}

export function refundsForBooking(state: Pick<PrototypeState, "refunds">, bookingId: string): Refund[] {
  return (state.refunds ?? []).filter((r) => r.bookingId === bookingId);
}

/** Total money received for a booking (confirmed or reconciled payments). */
export function paidAmountForBooking(state: Pick<PrototypeState, "payments">, bookingId: string): number {
  return paymentsForBooking(state, bookingId)
    .filter((p) => COLLECTED_PAYMENT_STATUSES.has(p.status))
    .reduce((sum, p) => sum + p.amount, 0);
}

export interface BookingRefundTotals {
  paid: number;
  /** Requested, under review, approved, processing or completed. */
  committed: number;
  completed: number;
  awaitingApproval: number;
  awaitingPayout: number;
  refundable: number;
}

export function bookingRefundTotals(
  state: Pick<PrototypeState, "payments" | "refunds">,
  bookingId: string,
  excludeRefundId?: string
): BookingRefundTotals {
  const paid = paidAmountForBooking(state, bookingId);
  let committed = 0;
  let completed = 0;
  let awaitingApproval = 0;
  let awaitingPayout = 0;
  for (const r of refundsForBooking(state, bookingId)) {
    if (r.id === excludeRefundId) continue;
    if (COMMITTED_REFUND_STATUSES.has(r.status)) committed += r.amount;
    if (r.status === "completed") completed += r.amount;
    if (AWAITING_APPROVAL_REFUND_STATUSES.has(r.status)) awaitingApproval += r.amount;
    if (AWAITING_PAYOUT_REFUND_STATUSES.has(r.status)) awaitingPayout += r.amount;
  }
  return { paid, committed, completed, awaitingApproval, awaitingPayout, refundable: Math.max(0, paid - committed) };
}

/** The payment currently attached to a booking: the open or collected one, else the latest. */
export function currentPaymentForBooking(state: Pick<PrototypeState, "payments">, bookingId: string): Payment | undefined {
  const list = paymentsForBooking(state, bookingId);
  return (
    list.find((p) => COLLECTED_PAYMENT_STATUSES.has(p.status)) ??
    list.find((p) => p.status === "pending" || p.status === "initiated") ??
    list[list.length - 1]
  );
}

/* ------------------------------ derived ledger ------------------------------ */

const paymentTxStatus = (p: Payment): Transaction["status"] | null =>
  COLLECTED_PAYMENT_STATUSES.has(p.status) ? "settled" : p.status === "failed" ? "failed" : p.status === "cancelled" ? null : "pending";

const refundTxStatus = (r: Refund): Transaction["status"] | null =>
  r.status === "completed" ? "settled" : r.status === "failed" ? "failed" : r.status === "rejected" ? null : "pending";

const sortKey = (t: Transaction) => {
  const ms = isoMillis(t.at);
  return Number.isNaN(ms) ? -Infinity : ms;
};

/**
 * Rebuild the ledger view from Payments and Refunds. Manual promo and
 * adjustment rows are kept as they are; payment / refund rows are always
 * derived, so the two can never disagree.
 */
export function buildLedgerTransactions(src: {
  payments?: Payment[];
  refunds?: Refund[];
  sessions: Pick<ScheduledSession, "id" | "territoryId">[];
  transactions?: Transaction[];
}): Transaction[] {
  const territoryOf = new Map(src.sessions.map((s) => [s.id, s.territoryId]));
  const manual = (src.transactions ?? []).filter((t) => t.kind !== "payment" && t.kind !== "refund");
  const derived: Transaction[] = [];

  for (const p of src.payments ?? []) {
    const status = paymentTxStatus(p);
    if (!status || p.amount <= 0) continue;
    derived.push({
      id: `tx-${p.id}`,
      sessionId: p.sessionId,
      territoryId: territoryOf.get(p.sessionId) ?? "unknown",
      bookingId: p.bookingId,
      kind: "payment",
      amount: p.amount,
      method: p.paymentMethod ?? "",
      status,
      at: p.confirmedAt ?? p.failedAt ?? p.initiatedAt ?? p.createdAt,
      paymentId: p.id,
      reference: p.providerReference,
    });
  }
  for (const r of src.refunds ?? []) {
    const status = refundTxStatus(r);
    if (!status || r.amount <= 0) continue;
    derived.push({
      id: `tx-${r.id}`,
      sessionId: r.sessionId,
      territoryId: territoryOf.get(r.sessionId) ?? "unknown",
      bookingId: r.bookingId,
      kind: "refund",
      amount: -r.amount,
      method: r.payoutMethod ?? "refund",
      status,
      at: r.completedAt ?? r.approvedAt ?? r.requestedAt ?? r.createdAt,
      refundId: r.id,
      paymentId: r.paymentId,
      reference: r.payoutReference,
    });
  }

  return [...derived, ...manual].sort((a, b) => sortKey(b) - sortKey(a));
}

/* ------------------------------ reconciliation ------------------------------ */

export type ReconciliationIssueKind =
  | "payment-without-booking"
  | "confirmed-without-payment"
  | "payment-missing-reference"
  | "amount-mismatch"
  | "paid-seat-released-without-refund"
  | "over-refunded";

export interface ReconciliationIssue {
  id: string;
  kind: ReconciliationIssueKind;
  severity: "high" | "medium";
  title: string;
  detail: string;
  amount: number;
  bookingId?: string;
  paymentId?: string;
  sessionId?: string;
}

export function selectReconciliationIssues(state: PrototypeState, sessionIds?: Set<string>): ReconciliationIssue[] {
  const issues: ReconciliationIssue[] = [];
  const payments = state.payments ?? [];
  const bookingsById = new Map(state.bookings.map((b) => [b.id, b]));
  const inScope = (sessionId?: string) => !sessionIds || (sessionId !== undefined && sessionIds.has(sessionId));

  for (const p of payments) {
    if (!inScope(p.sessionId)) continue;
    if (!bookingsById.has(p.bookingId) && COLLECTED_PAYMENT_STATUSES.has(p.status)) {
      issues.push({
        id: `rec-orphan-${p.id}`,
        kind: "payment-without-booking",
        severity: "high",
        title: "Payment recorded for a booking that no longer exists",
        detail: `Payment ${p.id} (${p.providerReference ?? "no reference"}) has no matching booking. Find the customer and re-create or refund the booking.`,
        amount: p.amount,
        paymentId: p.id,
        sessionId: p.sessionId,
      });
    }
    if (COLLECTED_PAYMENT_STATUSES.has(p.status) && !p.providerReference?.trim()) {
      issues.push({
        id: `rec-noref-${p.id}`,
        kind: "payment-missing-reference",
        severity: "medium",
        title: "Payment confirmed without a reference",
        detail: "Every manually confirmed payment needs a receipt, UTR or POS reference so it can be matched to the bank statement.",
        amount: p.amount,
        paymentId: p.id,
        bookingId: p.bookingId,
        sessionId: p.sessionId,
      });
    }
  }

  for (const b of state.bookings) {
    if (!inScope(b.sessionId)) continue;
    const totals = bookingRefundTotals(state, b.id);
    const cls = seatClass(b);
    const status = canonicalBookingStatus(b.status);
    if (cls === "paid" && b.amount > 0 && totals.paid === 0) {
      issues.push({
        id: `rec-unpaid-${b.id}`,
        kind: "confirmed-without-payment",
        severity: "high",
        title: "Confirmed booking has no recorded payment",
        detail: `${b.alias} holds a confirmed seat but no payment was recorded. Record the payment with its reference or cancel the booking.`,
        amount: b.amount,
        bookingId: b.id,
        sessionId: b.sessionId,
      });
    }
    if (cls === "paid" && totals.paid > 0 && totals.paid !== b.amount) {
      issues.push({
        id: `rec-amount-${b.id}`,
        kind: "amount-mismatch",
        severity: "medium",
        title: "Payment amount differs from the booking price",
        detail: `${b.alias} was charged ${totals.paid} against a booking price of ${b.amount}.`,
        amount: Math.abs(totals.paid - b.amount),
        bookingId: b.id,
        sessionId: b.sessionId,
      });
    }
    const released = status === "cancelled-user" || status === "cancelled-company" || status === "reservation-expired" || status === "payment-failed";
    if (released && totals.paid > 0 && refundsForBooking(state, b.id).length === 0) {
      issues.push({
        id: `rec-kept-${b.id}`,
        kind: "paid-seat-released-without-refund",
        severity: "high",
        title: "Paid booking was released without a refund decision",
        detail: `${b.alias}'s seat was released but the payment was not refunded or reviewed. Request a refund or record why the money is kept.`,
        amount: totals.paid,
        bookingId: b.id,
        sessionId: b.sessionId,
      });
    }
    if (totals.committed > totals.paid && totals.committed > 0) {
      issues.push({
        id: `rec-over-${b.id}`,
        kind: "over-refunded",
        severity: "high",
        title: "Refunds exceed the amount paid",
        detail: `Refunds on ${b.alias}'s booking add up to ${totals.committed} but only ${totals.paid} was paid. Reject the excess refund.`,
        amount: totals.committed - totals.paid,
        bookingId: b.id,
        sessionId: b.sessionId,
      });
    }
  }
  return issues;
}

/* --------------------------------- metrics --------------------------------- */

export interface FinancialOperationsMetrics {
  grossCollected: number;
  pendingRevenue: number;
  failedRevenue: number;
  totalRefunded: number;
  netRevenue: number;
  confirmedPaymentsCount: number;
  reconciledPaymentsCount: number;
  pendingPaymentsCount: number;
  failedPaymentsCount: number;
  refundsCount: number;
  /** Refunds waiting for approval. */
  pendingRefundsCount: number;
  awaitingApprovalAmount: number;
  /** Approved refunds waiting to be paid out. */
  payoutPendingCount: number;
  awaitingPayoutAmount: number;
  reconciliationDiscrepanciesCount: number;
}

/** Money metrics, optionally scoped to one territory. */
export function selectFinancialOperationsMetrics(state: PrototypeState, territoryId?: string): FinancialOperationsMetrics {
  const sessionIds = territoryId ? new Set(state.sessions.filter((s) => s.territoryId === territoryId).map((s) => s.id)) : undefined;
  const inScope = (sessionId: string) => !sessionIds || sessionIds.has(sessionId);
  const payments = (state.payments ?? []).filter((p) => inScope(p.sessionId));
  const refunds = (state.refunds ?? []).filter((r) => inScope(r.sessionId));

  const m: FinancialOperationsMetrics = {
    grossCollected: 0,
    pendingRevenue: 0,
    failedRevenue: 0,
    totalRefunded: 0,
    netRevenue: 0,
    confirmedPaymentsCount: 0,
    reconciledPaymentsCount: 0,
    pendingPaymentsCount: 0,
    failedPaymentsCount: 0,
    refundsCount: 0,
    pendingRefundsCount: 0,
    awaitingApprovalAmount: 0,
    payoutPendingCount: 0,
    awaitingPayoutAmount: 0,
    reconciliationDiscrepanciesCount: 0,
  };

  for (const p of payments) {
    if (COLLECTED_PAYMENT_STATUSES.has(p.status)) {
      m.grossCollected += p.amount;
      m.confirmedPaymentsCount++;
      if (p.status === "reconciled") m.reconciledPaymentsCount++;
    } else if (p.status === "pending" || p.status === "initiated") {
      m.pendingRevenue += p.amount;
      m.pendingPaymentsCount++;
    } else if (p.status === "failed") {
      m.failedRevenue += p.amount;
      m.failedPaymentsCount++;
    }
  }

  for (const r of refunds) {
    if (r.status === "completed") {
      m.totalRefunded += r.amount;
      m.refundsCount++;
    } else if (AWAITING_APPROVAL_REFUND_STATUSES.has(r.status)) {
      m.pendingRefundsCount++;
      m.awaitingApprovalAmount += r.amount;
    } else if (AWAITING_PAYOUT_REFUND_STATUSES.has(r.status)) {
      m.payoutPendingCount++;
      m.awaitingPayoutAmount += r.amount;
    }
  }

  m.netRevenue = m.grossCollected - m.totalRefunded;
  m.reconciliationDiscrepanciesCount = selectReconciliationIssues(state, sessionIds).length;
  return m;
}

export interface SessionFinancialSummary {
  sessionId: string;
  price: number;
  grossCollected: number;
  totalRefunded: number;
  netRevenue: number;
  pendingAmount: number;
  failedAmount: number;
  refundsAwaitingApproval: number;
  refundsAwaitingPayout: number;
  paidBookings: number;
  complimentaryBookings: number;
  targetRevenue: number;
  breakEvenRevenue: number;
  /** Revenue if every open hold is paid. */
  projectedRevenue: number;
  isProfitable: boolean;
  ledger: ReturnType<typeof sessionCapacityLedger>;
}

export function selectSessionFinancialSummary(state: PrototypeState, sessionId: string): SessionFinancialSummary {
  const session = state.sessions.find((s) => s.id === sessionId);
  const ledger = sessionCapacityLedger(state, sessionId);
  const payments = (state.payments ?? []).filter((p) => p.sessionId === sessionId);
  const refunds = (state.refunds ?? []).filter((r) => r.sessionId === sessionId);
  const price = session?.finalPrice || session?.basePrice || 0;

  const sumBy = <T,>(xs: T[], f: (x: T) => boolean, v: (x: T) => number) => xs.filter(f).reduce((a, x) => a + v(x), 0);

  const grossCollected = sumBy(payments, (p) => COLLECTED_PAYMENT_STATUSES.has(p.status), (p) => p.amount);
  const pendingAmount = sumBy(payments, (p) => p.status === "pending" || p.status === "initiated", (p) => p.amount);
  const failedAmount = sumBy(payments, (p) => p.status === "failed", (p) => p.amount);
  const totalRefunded = sumBy(refunds, (r) => r.status === "completed", (r) => r.amount);
  const refundsAwaitingApproval = sumBy(refunds, (r) => AWAITING_APPROVAL_REFUND_STATUSES.has(r.status), (r) => r.amount);
  const refundsAwaitingPayout = sumBy(refunds, (r) => AWAITING_PAYOUT_REFUND_STATUSES.has(r.status), (r) => r.amount);

  const netRevenue = grossCollected - totalRefunded;
  const targetRevenue = price * ledger.targetAttendance;
  const breakEvenRevenue = price * ledger.breakEvenAttendance;

  return {
    sessionId,
    price,
    grossCollected,
    totalRefunded,
    netRevenue,
    pendingAmount,
    failedAmount,
    refundsAwaitingApproval,
    refundsAwaitingPayout,
    paidBookings: ledger.confirmedPaidBookings,
    complimentaryBookings: ledger.confirmedComplimentaryBookings,
    targetRevenue,
    breakEvenRevenue,
    projectedRevenue: netRevenue - refundsAwaitingApproval - refundsAwaitingPayout + pendingAmount,
    isProfitable: netRevenue >= breakEvenRevenue,
    ledger,
  };
}
