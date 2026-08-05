import type { PrototypeState } from "../scenarios/state";
import type { Booking, BookingStatus, ReservationStatus, PaymentStatus } from "../entities";
import { sessionCapacityLedger } from "../selectors/capacity";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates whether a state transition between reservationStatus, paymentStatus, and bookingStatus is valid.
 */
export function validateBookingStateTransition(
  current: Partial<Booking>,
  nextStatus: BookingStatus
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Allowed transitions
  if (current.status === "confirmed" && (nextStatus === "reserved" || nextStatus === "payment-pending")) {
    errors.push("Cannot revert a confirmed booking back to reserved or pending status.");
  }

  if (current.status === "refunded" && nextStatus !== "refunded") {
    errors.push("Refunding is a terminal financial state.");
  }

  if ((current.status === "cancelled-user" || current.status === "cancelled-company") && nextStatus === "confirmed") {
    errors.push("Cancelled bookings cannot be directly confirmed. A new reservation must be created.");
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates session capacity eligibility before creating a new reservation.
 */
export function validateBookingCapacityEligibility(
  state: PrototypeState,
  sessionId: string,
  bookingType: "individual" | "group" | "complimentary" | "admin"
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) {
    errors.push(`Session ${sessionId} does not exist.`);
    return { isValid: false, errors, warnings };
  }

  if (session.status === "cancelled" || session.status === "archived") {
    errors.push(`Session ${sessionId} is ${session.status} and cannot accept reservations.`);
    return { isValid: false, errors, warnings };
  }

  if (session.status === "completed" || session.status === "booking-closed") {
    errors.push(`Bookings are closed for session ${sessionId} (Status: ${session.status}).`);
    return { isValid: false, errors, warnings };
  }

  const ledger = sessionCapacityLedger(state, sessionId);

  if (bookingType === "complimentary") {
    if (ledger.confirmedComplimentaryBookings >= ledger.compSlots) {
      warnings.push(
        `Complimentary allocation limit (${ledger.compSlots}) reached. Additional comp booking consumes sellable capacity.`
      );
    }
    if (ledger.physicalOccupancy >= ledger.maxPhysicalCapacity) {
      errors.push(`Physical venue max capacity (${ledger.maxPhysicalCapacity}) reached. Cannot add comp booking.`);
    }
  } else {
    if (ledger.remainingSellableCapacity <= 0) {
      errors.push(`No remaining sellable capacity for session ${sessionId}.`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Validates refund eligibility.
 */
export function validateRefundEligibility(
  state: PrototypeState,
  bookingId: string,
  refundAmount: number
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) {
    errors.push(`Booking ${bookingId} not found.`);
    return { isValid: false, errors, warnings };
  }

  if (refundAmount <= 0) {
    errors.push("Refund amount must be strictly greater than 0.");
  }

  if (refundAmount > (booking.amount || 0)) {
    errors.push(`Refund amount (₹${refundAmount}) cannot exceed paid amount (₹${booking.amount}).`);
  }

  const existingRefunds = (state.refunds ?? []).filter(
    (r) => r.bookingId === bookingId && r.status !== "rejected" && r.status !== "failed"
  );
  const totalAlreadyRefundedOrPending = existingRefunds.reduce((sum, r) => sum + r.amount, 0);

  if (totalAlreadyRefundedOrPending + refundAmount > (booking.amount || 0)) {
    errors.push(
      `Total refund requests (₹${totalAlreadyRefundedOrPending + refundAmount}) would exceed booking amount (₹${booking.amount}).`
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
