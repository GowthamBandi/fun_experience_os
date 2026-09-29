import { authorizeSafetyAction } from "@/lib/safety/access";
import type { PrototypeState } from "../scenarios/state";
import type { Refund, RefundException, RefundExceptionReason } from "../entities";
import { validateRefundEligibility } from "../validators/bookingValidation";
import { currentPaymentForBooking } from "../selectors/money";
import { nextId, pushAudit, pushSignal } from "./helpers";
import { newRecordId, type CommandResult } from "./bookings";
import { REFUND_APPROVER_ROLES, syncLedger } from "./money";

/* ------------------------------------------------------------------
 * Refund exceptions: refunds outside the normal cancellation policy
 * (safety incident, venue failure, dispute outcome…).
 *
 *   recommended → approved (creates an APPROVED Refund, cumulative guard applied)
 *               → completed (when that refund is paid out, see completeRefund)
 *   recommended → rejected
 * ------------------------------------------------------------------ */

const reject = (state: PrototypeState, error: string): CommandResult => ({ state, error });

const REASONS: RefundExceptionReason[] = [
  "safety-incident",
  "tournament-cancellation",
  "match-abandonment",
  "venue-failure",
  "medical-incident",
  "misconduct-decision",
  "dispute-outcome",
];

/** Recommend an exception refund for Finance to review. */
export function recommendRefundException(
  state: PrototypeState,
  params: {
    incidentId?: string;
    disputeId?: string;
    tournamentId?: string;
    matchId?: string;
    sessionId?: string;
    bookingId?: string;
    reason: RefundExceptionReason;
    amount: number;
    notes?: string;
  },
  operatorId: string = "system",
  nowIso: string = new Date().toISOString()
): CommandResult<{ exception?: RefundException }> {
  const who = authorizeSafetyAction(state, operatorId, "refund-exception.recommend");
  if (!who.ok) return reject(state, who.error);
  if (!REASONS.includes(params.reason)) return reject(state, "Choose why this refund is an exception.");
  if (!Number.isFinite(params.amount) || params.amount <= 0 || !Number.isInteger(params.amount)) {
    return reject(state, "Enter a refund amount in whole rupees greater than zero.");
  }
  const booking = params.bookingId ? state.bookings.find((b) => b.id === params.bookingId) : undefined;
  if (params.bookingId && !booking) return reject(state, "The booking for this exception could not be found.");
  if (booking) {
    const check = validateRefundEligibility(state, booking.id, params.amount);
    if (!check.isValid) return reject(state, check.errors.join(" "));
  }

  const exceptions = state.refundExceptions ?? [];
  const exception: RefundException = {
    id: nextId("rex", exceptions.map((e) => e.id)),
    incidentId: params.incidentId,
    disputeId: params.disputeId,
    tournamentId: params.tournamentId,
    matchId: params.matchId,
    sessionId: params.sessionId ?? booking?.sessionId,
    bookingId: params.bookingId,
    reason: params.reason,
    amount: params.amount,
    currency: "INR",
    status: "recommended",
    recommendedBy: operatorId,
    recommendedAt: nowIso,
    notes: params.notes?.trim() || undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const next = pushAudit(
    { ...state, refundExceptions: [...exceptions, exception] },
    {
      action: "Refund Exception Recommended",
      description: `Exception refund ${exception.id} of ₹${params.amount} recommended (${params.reason.replace(/-/g, " ")}).`,
      sessionId: exception.sessionId,
      operatorId,
    }
  );
  return { state: next, exception };
}

/**
 * Finance approves an exception. This creates an APPROVED refund against the
 * booking — subject to the same cumulative over-refund guard as any other
 * refund — which is then paid out and recorded with `completeRefund`.
 * Exceptions recommended without a booking must be linked to one here.
 */
export function approveRefundException(
  state: PrototypeState,
  exceptionId: string,
  operatorId: string = "system",
  options: { bookingId?: string; actorRole?: string } = {},
  nowIso: string = new Date().toISOString()
): CommandResult<{ refundId?: string }> {
  if (options.actorRole !== undefined && !REFUND_APPROVER_ROLES.has(options.actorRole)) {
    return reject(state, "Only Finance, a Super Admin or a Platform Owner can approve exception refunds.");
  }
  const exception = (state.refundExceptions ?? []).find((e) => e.id === exceptionId);
  if (!exception) return reject(state, "This refund exception could not be found.");
  if (exception.status !== "recommended" && exception.status !== "under-review") {
    return reject(state, `This exception is already ${exception.status.replace(/-/g, " ")}.`);
  }
  const bookingId = exception.bookingId ?? options.bookingId;
  if (!bookingId) return reject(state, "Link this exception to the booking that should be refunded before approving it.");
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return reject(state, "The booking for this exception could not be found.");
  if (exception.sessionId && booking.sessionId !== exception.sessionId) {
    return reject(state, "That booking belongs to a different session from the one this exception was raised for.");
  }

  const check = validateRefundEligibility(state, bookingId, exception.amount);
  if (!check.isValid) return reject(state, check.errors.join(" "));

  const refundId = newRecordId("ref", state.refunds ?? []);
  const refund: Refund = {
    id: refundId,
    paymentId: currentPaymentForBooking(state, bookingId)?.id,
    bookingId,
    sessionId: booking.sessionId,
    type: "manual-adjustment",
    amount: exception.amount,
    reason: exception.notes || `Exception refund: ${exception.reason.replace(/-/g, " ")}`,
    status: "approved",
    requestedAt: exception.recommendedAt,
    requestedBy: exception.recommendedBy,
    approvedAt: nowIso,
    approvedBy: operatorId,
    refundExceptionId: exception.id,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  let next: PrototypeState = {
    ...state,
    refunds: [...(state.refunds ?? []), refund],
    bookings: state.bookings.map((b) => (b.id === bookingId ? { ...b, paymentStatus: "refund-pending" as const, updatedAt: nowIso } : b)),
    refundExceptions: (state.refundExceptions ?? []).map((e) =>
      e.id === exceptionId
        ? {
            ...e,
            bookingId,
            sessionId: e.sessionId ?? booking.sessionId,
            status: "approved" as const,
            reviewedBy: operatorId,
            reviewedAt: nowIso,
            approvedBy: operatorId,
            approvedAt: nowIso,
            linkedRefundId: refundId,
            updatedAt: nowIso,
          }
        : e
    ),
  };
  next = pushAudit(next, {
    action: "Refund Exception Approved",
    description: `Exception ${exceptionId} approved: refund ${refundId} of ₹${exception.amount} for ${booking.bookingCode ?? bookingId} (${booking.alias}) is ready to be paid out.`,
    sessionId: booking.sessionId,
    operatorId,
  });
  next = pushSignal(next, { kind: "system", message: `Exception refund of ₹${exception.amount} approved for ${booking.alias}`, sessionId: booking.sessionId });
  return { state: syncLedger(next), refundId };
}

/** Finance rejects an exception. A reason is required. */
export function rejectRefundException(
  state: PrototypeState,
  exceptionId: string,
  reason: string,
  operatorId: string = "system",
  options: { actorRole?: string } = {},
  nowIso: string = new Date().toISOString()
): CommandResult {
  if (options.actorRole !== undefined && !REFUND_APPROVER_ROLES.has(options.actorRole)) {
    return reject(state, "Only Finance, a Super Admin or a Platform Owner can reject exception refunds.");
  }
  const exception = (state.refundExceptions ?? []).find((e) => e.id === exceptionId);
  if (!exception) return reject(state, "This refund exception could not be found.");
  if (exception.status !== "recommended" && exception.status !== "under-review") {
    return reject(state, `This exception is already ${exception.status.replace(/-/g, " ")}.`);
  }
  const why = reason?.trim() ?? "";
  if (why.length < 5) return reject(state, "Give a reason for rejecting the exception (at least 5 characters).");

  const next = pushAudit(
    {
      ...state,
      refundExceptions: (state.refundExceptions ?? []).map((e) =>
        e.id === exceptionId
          ? { ...e, status: "rejected" as const, reviewedBy: operatorId, reviewedAt: nowIso, rejectedBy: operatorId, rejectedAt: nowIso, rejectionReason: why, updatedAt: nowIso }
          : e
      ),
    },
    {
      action: "Refund Exception Rejected",
      description: `Exception ${exceptionId} (₹${exception.amount}) rejected: ${why}.`,
      sessionId: exception.sessionId,
      operatorId,
    }
  );
  return { state: next };
}
