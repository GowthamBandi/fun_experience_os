import type { PrototypeState } from "../scenarios/state";
import type { BookingType } from "../entities";
import { sessionCapacityLedger } from "../selectors/capacity";
import { bookingRefundTotals } from "../selectors/money";
import { bookableSessionStatus } from "../selectors/status";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

/**
 * Can a new reservation be created on this session right now?
 * Paid bookings need a free sellable seat. Complimentary bookings use a reserved
 * comp slot first and a sellable seat after that.
 */
export function validateBookingCapacityEligibility(
  state: PrototypeState,
  sessionId: string,
  bookingType: BookingType
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) {
    return { isValid: false, errors: ["This session no longer exists."], warnings };
  }

  if (!bookableSessionStatus(session.status)) {
    const why =
      session.status === "cancelled" ? "it has been cancelled"
      : session.status === "completed" || session.status === "archived" ? "it has already finished"
      : session.status === "draft" ? "it is still a draft"
      : "bookings are closed";
    return { isValid: false, errors: [`This session is not taking bookings because ${why}.`], warnings };
  }

  const ledger = sessionCapacityLedger(state, sessionId);

  if (bookingType === "complimentary") {
    const compSlotsLeft = Math.max(0, ledger.compSlots - ledger.confirmedComplimentaryBookings);
    if (compSlotsLeft === 0 && ledger.remainingSellableCapacity <= 0) {
      errors.push("No complimentary slot or free seat is left in this session.");
    } else if (compSlotsLeft === 0) {
      warnings.push("All reserved complimentary slots are used — this free pass takes a sellable seat.");
    }
  } else if (ledger.remainingSellableCapacity <= 0) {
    errors.push("This session is full. Add the person to the waiting list instead.");
  }

  return { isValid: errors.length === 0, errors, warnings };
}

/**
 * Cumulative over-refund guard. A refund is allowed only when the booking was
 * paid and the sum of all requested, approved and completed refunds (plus this
 * one) stays within what was actually collected.
 */
export function validateRefundEligibility(
  state: PrototypeState,
  bookingId: string,
  refundAmount: number,
  options: { excludeRefundId?: string } = {}
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) {
    return { isValid: false, errors: ["The booking for this refund could not be found."], warnings };
  }

  if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
    errors.push("Enter a refund amount greater than zero.");
  } else if (!Number.isInteger(refundAmount)) {
    errors.push("Refunds are recorded in whole rupees.");
  }

  const totals = bookingRefundTotals(state, bookingId, options.excludeRefundId);
  if (totals.paid <= 0) {
    errors.push("No payment has been recorded for this booking, so there is nothing to refund.");
  } else if (refundAmount > totals.refundable) {
    errors.push(
      `A refund of ${rupees(refundAmount)} would exceed what can still be refunded (${rupees(totals.refundable)} of ${rupees(totals.paid)} paid; ${rupees(totals.committed)} already refunded or in progress).`
    );
  }

  return { isValid: errors.length === 0, errors, warnings };
}
