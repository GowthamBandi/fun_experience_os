import type { PrototypeState } from "../scenarios";
import type { Booking, Payment, Refund, RefundType } from "../entities";
import { validateRefundEligibility } from "../validators/bookingValidation";
import {
  AWAITING_APPROVAL_REFUND_STATUSES,
  AWAITING_PAYOUT_REFUND_STATUSES,
  PAYMENT_METHODS,
  bookingRefundTotals,
  buildLedgerTransactions,
  currentPaymentForBooking,
} from "../selectors/money";
import { canonicalBookingStatus, seatClass } from "../selectors/status";
import { pushAudit, pushSignal } from "./helpers";
import { autoOfferFreedSeats, autoUpdateSessionStatus, newRecordId, type CommandResult } from "./bookings";

/* ------------------------------------------------------------------
 * Money: refunds and payment verification.
 *
 * Payments and Refunds are the source of truth. `syncLedger` rebuilds the
 * `transactions` view from them after every change.
 *
 * Refund lifecycle: requested → approved → completed (paid out manually with
 * a reference, because the payment provider is not connected), or
 * requested/approved → rejected. Every transition is guarded.
 * ------------------------------------------------------------------ */

/** Roles allowed to approve, reject and pay out refunds. */
export const REFUND_APPROVER_ROLES = new Set(["platform-owner", "super-admin", "finance"]);

const reject = <T,>(state: PrototypeState, error: string): CommandResult<T> => ({ state, error }) as CommandResult<T>;

function roleError(actorRole: string | undefined, verb: string): string | undefined {
  if (actorRole === undefined || REFUND_APPROVER_ROLES.has(actorRole)) return undefined;
  return `Only Finance, a Super Admin or a Platform Owner can ${verb} refunds.`;
}

/** Rebuild the derived ledger view (`transactions`) from payments and refunds. */
export function syncLedger(state: PrototypeState): PrototypeState {
  return { ...state, transactions: buildLedgerTransactions(state) };
}

const updateRefund = (state: PrototypeState, id: string, patch: Partial<Refund>): PrototypeState => ({
  ...state,
  refunds: (state.refunds ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)),
});

/** Keep the booking's payment status in step with its payments and refunds. */
function refreshBookingPaymentStatus(state: PrototypeState, bookingId: string, nowIso: string): PrototypeState {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return state;
  const t = bookingRefundTotals(state, bookingId);
  let paymentStatus: Booking["paymentStatus"] = booking.paymentStatus;
  if (t.paid > 0 && t.completed >= t.paid) paymentStatus = "refunded";
  else if (t.awaitingApproval + t.awaitingPayout > 0) paymentStatus = "refund-pending";
  else if (t.paid > 0) paymentStatus = "confirmed";
  let status = booking.status;
  let released = false;
  // A fully refunded booking that was never cancelled no longer holds a seat.
  if (paymentStatus === "refunded" && seatClass(booking) === "paid" && canonicalBookingStatus(booking.status) === "confirmed" && !booking.checkedIn) {
    status = "refunded";
    released = true;
  }
  if (paymentStatus === booking.paymentStatus && status === booking.status) return state;
  let next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b) => (b.id === bookingId ? { ...b, paymentStatus, status, updatedAt: nowIso } : b)),
  };
  if (released) {
    next = autoOfferFreedSeats(next, booking.sessionId, nowIso);
    next = autoUpdateSessionStatus(next, booking.sessionId);
  }
  return next;
}

const REFUND_TYPES: RefundType[] = ["full", "partial", "company-cancellation", "user-cancellation", "duplicate-payment", "manual-adjustment"];

/** Creates a refund request for a paid booking (checked against everything already refunded). */
export function initiateRefund(
  state: PrototypeState,
  params: { bookingId: string; amount: number; reason: string; type?: RefundType; operatorId?: string },
  nowIso: string = new Date().toISOString()
): CommandResult<{ refund?: Refund }> {
  const reason = params.reason?.trim() ?? "";
  if (reason.length < 5) return reject(state, "Give a reason for the refund (at least 5 characters).");
  if (params.type && !REFUND_TYPES.includes(params.type)) return reject(state, "Choose a valid refund type.");
  const validation = validateRefundEligibility(state, params.bookingId, params.amount);
  if (!validation.isValid) return reject(state, validation.errors.join(" "));
  const booking = state.bookings.find((b) => b.id === params.bookingId)!;
  const totals = bookingRefundTotals(state, booking.id);

  const refund: Refund = {
    id: newRecordId("ref", state.refunds ?? []),
    paymentId: currentPaymentForBooking(state, booking.id)?.id,
    bookingId: booking.id,
    sessionId: booking.sessionId,
    type: params.type ?? (params.amount >= totals.refundable ? "full" : "partial"),
    amount: params.amount,
    reason,
    status: "requested",
    requestedAt: nowIso,
    requestedBy: params.operatorId,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  let next: PrototypeState = { ...state, refunds: [...(state.refunds ?? []), refund] };
  next = refreshBookingPaymentStatus(next, booking.id, nowIso);
  next = pushSignal(next, { kind: "system", message: `Refund of ₹${params.amount} requested for ${booking.alias}`, sessionId: booking.sessionId });
  next = pushAudit(next, {
    action: "Refund Requested",
    description: `Refund ${refund.id} of ₹${params.amount} requested for ${booking.bookingCode ?? booking.id} (${booking.alias}): ${reason}.`,
    sessionId: booking.sessionId,
    operatorId: params.operatorId,
  });
  return { state: syncLedger(next), refund };
}

/** Finance approves a requested refund. The money still has to be paid out (`completeRefund`). */
export function approveRefund(
  state: PrototypeState,
  refundId: string,
  operatorId?: string,
  actorRole?: string,
  nowIso: string = new Date().toISOString()
): CommandResult {
  const denied = roleError(actorRole, "approve");
  if (denied) return reject(state, denied);
  const refund = (state.refunds ?? []).find((r) => r.id === refundId);
  if (!refund) return reject(state, "This refund could not be found.");
  if (!AWAITING_APPROVAL_REFUND_STATUSES.has(refund.status)) return reject(state, `This refund is already ${refund.status.replace(/-/g, " ")}.`);
  // Re-check the cumulative guard: other refunds may have been approved since this one was requested.
  const validation = validateRefundEligibility(state, refund.bookingId, refund.amount, { excludeRefundId: refund.id });
  if (!validation.isValid) return reject(state, validation.errors.join(" "));

  let next = updateRefund(state, refundId, { status: "approved", approvedAt: nowIso, approvedBy: operatorId, updatedAt: nowIso });
  next = pushAudit(next, {
    action: "Refund Approved",
    description: `Refund ${refundId} of ₹${refund.amount} approved. Waiting to be paid out.`,
    sessionId: refund.sessionId,
    operatorId,
  });
  return { state: syncLedger(next) };
}

/** Rejects a refund that has not been paid out yet. A reason is required. */
export function rejectRefund(
  state: PrototypeState,
  refundId: string,
  reason: string,
  operatorId?: string,
  actorRole?: string,
  nowIso: string = new Date().toISOString()
): CommandResult {
  const denied = roleError(actorRole, "reject");
  if (denied) return reject(state, denied);
  const refund = (state.refunds ?? []).find((r) => r.id === refundId);
  if (!refund) return reject(state, "This refund could not be found.");
  if (!AWAITING_APPROVAL_REFUND_STATUSES.has(refund.status) && !AWAITING_PAYOUT_REFUND_STATUSES.has(refund.status)) {
    return reject(state, `A ${refund.status.replace(/-/g, " ")} refund can't be rejected.`);
  }
  const why = reason?.trim() ?? "";
  if (why.length < 5) return reject(state, "Give a reason for rejecting the refund (at least 5 characters).");

  let next = updateRefund(state, refundId, { status: "rejected", failureReason: why, rejectedAt: nowIso, rejectedBy: operatorId, updatedAt: nowIso });
  next = refreshBookingPaymentStatus(next, refund.bookingId, nowIso);
  if (refund.refundExceptionId) {
    next = {
      ...next,
      refundExceptions: (next.refundExceptions ?? []).map((e) =>
        e.id === refund.refundExceptionId ? { ...e, status: "rejected" as const, rejectedBy: operatorId, rejectedAt: nowIso, rejectionReason: why, updatedAt: nowIso } : e
      ),
    };
  }
  next = pushAudit(next, {
    action: "Refund Rejected",
    description: `Refund ${refundId} of ₹${refund.amount} rejected: ${why}.`,
    sessionId: refund.sessionId,
    operatorId,
  });
  return { state: syncLedger(next) };
}

export interface PayoutInput {
  /** How the money was returned: one of PAYMENT_METHODS ids. */
  method: string;
  /** Bank / UPI / receipt reference of the payout. */
  reference: string;
}

/**
 * Marks an approved refund as paid out. The payment provider is not
 * connected, so the payout is made outside the console and recorded here with
 * its method and reference. Can only happen once.
 */
export function completeRefund(
  state: PrototypeState,
  refundId: string,
  payout: PayoutInput,
  operatorId?: string,
  actorRole?: string,
  nowIso: string = new Date().toISOString()
): CommandResult {
  const denied = roleError(actorRole, "pay out");
  if (denied) return reject(state, denied);
  const refund = (state.refunds ?? []).find((r) => r.id === refundId);
  if (!refund) return reject(state, "This refund could not be found.");
  if (refund.status === "completed") return reject(state, "This refund has already been paid out.");
  if (!AWAITING_PAYOUT_REFUND_STATUSES.has(refund.status)) return reject(state, "Approve the refund before recording the payout.");
  if (!payout || !PAYMENT_METHODS.some((m) => m.id === payout.method)) return reject(state, "Choose how the refund was paid out.");
  const reference = payout.reference?.trim() ?? "";
  if (reference.length < 3) return reject(state, "Enter the payout reference (UTR, bank or receipt reference), at least 3 characters.");
  // Guard against legacy data: completed refunds may never exceed what was paid.
  const totals = bookingRefundTotals(state, refund.bookingId, refund.id);
  if (totals.completed + refund.amount > totals.paid) {
    return reject(state, `Paying out ₹${refund.amount} would return more than the ₹${totals.paid} collected on this booking.`);
  }

  let next = updateRefund(state, refundId, {
    status: "completed",
    completedAt: nowIso,
    completedBy: operatorId,
    payoutMethod: payout.method,
    payoutReference: reference,
    updatedAt: nowIso,
  });
  next = refreshBookingPaymentStatus(next, refund.bookingId, nowIso);
  if (refund.refundExceptionId) {
    next = {
      ...next,
      refundExceptions: (next.refundExceptions ?? []).map((e) =>
        e.id === refund.refundExceptionId ? { ...e, status: "completed" as const, updatedAt: nowIso } : e
      ),
    };
  }
  const booking = state.bookings.find((b) => b.id === refund.bookingId);
  next = pushSignal(next, { kind: "system", message: `Refund of ₹${refund.amount} paid out to ${booking?.alias ?? refund.bookingId}`, sessionId: refund.sessionId });
  next = pushAudit(next, {
    action: "Refund Paid Out",
    description: `Refund ${refundId} of ₹${refund.amount} paid out via ${payout.method}, reference ${reference}.`,
    sessionId: refund.sessionId,
    operatorId,
  });
  return { state: syncLedger(next) };
}

/** Marks a confirmed payment as matched against the bank / UPI statement. */
export function reconcilePayment(
  state: PrototypeState,
  paymentId: string,
  operatorId?: string,
  nowIso: string = new Date().toISOString()
): CommandResult {
  const payment = (state.payments ?? []).find((p) => p.id === paymentId);
  if (!payment) return reject(state, "This payment could not be found.");
  if (payment.status === "reconciled") return reject(state, "This payment is already verified.");
  if (payment.status !== "confirmed") return reject(state, "Only a confirmed payment can be verified against the statement.");
  if (!payment.providerReference?.trim()) return reject(state, "Add the payment reference before verifying it.");

  const next = {
    ...state,
    payments: (state.payments ?? []).map((p) => (p.id === paymentId ? { ...p, status: "reconciled" as const, updatedAt: nowIso } : p)),
  };
  return {
    state: syncLedger(
      pushAudit(next, {
        action: "Payment Verified",
        description: `Payment ${paymentId} (₹${payment.amount}, reference ${payment.providerReference}) matched against the statement.`,
        sessionId: payment.sessionId,
        operatorId,
      })
    ),
  };
}

/* ------------------------------ legacy data ------------------------------ */

/**
 * One-off repair for workspaces saved before Payments/Refunds became the single
 * source of truth: payment and refund rows that exist only in the legacy
 * `transactions` list become proper Payment / Refund records (never exceeding
 * what was paid), then the ledger is rebuilt. Idempotent.
 */
export function migrateLegacyMoney(state: PrototypeState, nowIso: string = new Date().toISOString()): PrototypeState {
  let payments: Payment[] = (state.payments ?? []).map((p) => (p.provider === "razorpay_sim" ? { ...p, provider: "manual" } : p));
  let refunds: Refund[] = [...(state.refunds ?? [])];
  const bookings = new Map(state.bookings.map((b) => [b.id, b]));
  const sessions = new Map(state.sessions.map((s) => [s.id, s]));
  const legacy = (state.transactions ?? []).filter((t) => (t.kind === "payment" || t.kind === "refund") && !t.paymentId && !t.refundId);

  // Seed correction: the original seed attached the exception refund "ref-001"
  // to b-1 (a live, confirmed booking) instead of b-72, the cancelled booking
  // its refund exception (rex-1) was raised for.
  const rex1 = (state.refundExceptions ?? []).find((e) => e.linkedRefundId === "ref-001" && e.bookingId);
  refunds = refunds.map((r) =>
    r.id === "ref-001" && rex1 && r.bookingId !== rex1.bookingId && bookings.has(rex1.bookingId!)
      ? { ...r, bookingId: rex1.bookingId!, sessionId: bookings.get(rex1.bookingId!)!.sessionId, paymentId: undefined, type: "company-cancellation" as const, refundExceptionId: rex1.id }
      : r
  );

  const legacyPayment = (bookingId: string, sessionId: string, amount: number, status: Payment["status"], method: string | undefined, at: string, ref: string): Payment => ({
    id: `pay-legacy-${ref.toLowerCase()}`,
    bookingId,
    sessionId,
    provider: "manual",
    providerReference: `LEGACY-${ref.toUpperCase()}`,
    amount,
    status,
    paymentMethod: method,
    initiatedAt: at,
    confirmedAt: status === "confirmed" ? at : undefined,
    failedAt: status === "failed" ? at : undefined,
    createdAt: at,
    updatedAt: nowIso,
  });

  // 1. Payments that only existed as ledger rows.
  for (const t of legacy.filter((x) => x.kind === "payment")) {
    if (!bookings.has(t.bookingId) || payments.some((p) => p.bookingId === t.bookingId)) continue;
    const status: Payment["status"] = t.status === "settled" ? "confirmed" : t.status === "failed" ? "failed" : "pending";
    payments = [...payments, legacyPayment(t.bookingId, t.sessionId, Math.abs(t.amount), status, t.method, t.at, t.id)];
  }

  // 2. Paid bookings with no payment record at all.
  for (const b of state.bookings) {
    if (b.amount <= 0 || b.bookingType === "complimentary") continue;
    if (!["confirmed", "reconciled", "refunded", "refund-pending"].includes(String(b.paymentStatus))) continue;
    const cls = seatClass(b);
    if (cls === "hold" || cls === "offer" || cls === "waitlist") continue;
    if (payments.some((p) => p.bookingId === b.id)) continue;
    payments = [...payments, legacyPayment(b.id, b.sessionId, b.amount, "confirmed", b.method, b.confirmedAt ?? b.createdAt, b.id)];
  }

  // 3. Refunds that only existed as ledger rows (never beyond what was paid).
  for (const t of legacy.filter((x) => x.kind === "refund")) {
    if (!bookings.has(t.bookingId) || refunds.some((r) => r.bookingId === t.bookingId)) continue;
    const amount = Math.min(Math.abs(t.amount), bookingRefundTotals({ payments, refunds }, t.bookingId).refundable);
    if (amount <= 0) continue;
    const status: Refund["status"] = t.status === "settled" ? "completed" : t.status === "failed" ? "failed" : "requested";
    const sessionCancelled = sessions.get(t.sessionId)?.status === "cancelled";
    refunds = [
      ...refunds,
      {
        id: `ref-legacy-${t.id}`,
        paymentId: currentPaymentForBooking({ payments }, t.bookingId)?.id,
        bookingId: t.bookingId,
        sessionId: t.sessionId,
        type: sessionCancelled ? "company-cancellation" : "user-cancellation",
        amount,
        reason: sessionCancelled ? "Session cancelled" : "Cancellation refund",
        status,
        requestedAt: t.at,
        completedAt: status === "completed" ? t.at : undefined,
        payoutMethod: status === "completed" ? t.method : undefined,
        payoutReference: status === "completed" ? `LEGACY-${t.id.toUpperCase()}` : undefined,
        createdAt: t.at,
        updatedAt: nowIso,
      },
    ];
  }

  // 4. Bookings marked refunded with no refund record.
  for (const b of state.bookings) {
    if (b.paymentStatus !== "refunded" || refunds.some((r) => r.bookingId === b.id)) continue;
    const amount = bookingRefundTotals({ payments, refunds }, b.id).refundable;
    if (amount <= 0) continue;
    const sessionCancelled = sessions.get(b.sessionId)?.status === "cancelled";
    const at = b.cancelledAt ?? b.updatedAt ?? b.createdAt;
    refunds = [
      ...refunds,
      {
        id: `ref-legacy-${b.id}`,
        paymentId: currentPaymentForBooking({ payments }, b.id)?.id,
        bookingId: b.id,
        sessionId: b.sessionId,
        type: sessionCancelled ? "company-cancellation" : "user-cancellation",
        amount,
        reason: b.cancellationReason ?? (sessionCancelled ? "Session cancelled" : "Cancellation refund"),
        status: "completed",
        requestedAt: at,
        completedAt: at,
        payoutMethod: b.method,
        payoutReference: `LEGACY-${b.id.toUpperCase()}`,
        createdAt: at,
        updatedAt: nowIso,
      },
    ];
  }

  // 5. Refund exceptions whose linked refund has been paid out are complete.
  const completedRefundIds = new Set(refunds.filter((r) => r.status === "completed").map((r) => r.id));
  const refundExceptions = (state.refundExceptions ?? []).map((e) =>
    e.status === "approved" && e.linkedRefundId && completedRefundIds.has(e.linkedRefundId) ? { ...e, status: "completed" as const } : e
  );

  const next: PrototypeState = { ...state, payments, refunds, refundExceptions };
  return { ...next, transactions: buildLedgerTransactions(next) };
}
