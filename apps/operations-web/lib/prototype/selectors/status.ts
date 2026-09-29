import type { Booking, BookingStatus, SessionId, SessionStatus } from "../entities";
import type { PrototypeState } from "../scenarios";

/* ------------------------------------------------------------------
 * Canonical booking status vocabulary
 *
 * Every service writes only these statuses. Legacy values that older
 * workspaces or scenarios stored ("payment-confirmed", "checked-in",
 * "waitlist-joined", …) are rewritten by the
 * `2026-09-29-bookings-canonical-status` migration and are also tolerated
 * on read through `canonicalBookingStatus`.
 *
 *   payment-pending      seat held for 15 minutes while payment is recorded
 *   confirmed            paid (or complimentary) seat; `checkedIn` is a flag
 *   payment-failed       payment recorded as failed; seat released
 *   reservation-expired  hold or waitlist offer ran out; seat released
 *   waitlisted           in the queue, holds no seat
 *   waitlist-offered     offered a seat; holds it until the offer expires
 *   cancelled-user       cancelled at the customer's request
 *   cancelled-company    cancelled by operations (session cancelled, venue issue…)
 *   no-show              paid but did not attend (historic sessions)
 *   refunded             fully refunded without a cancellation record
 *   completed            attended a completed session
 * ------------------------------------------------------------------ */

export const BOOKING_STATUSES = [
  "payment-pending",
  "confirmed",
  "payment-failed",
  "reservation-expired",
  "waitlisted",
  "waitlist-offered",
  "cancelled-user",
  "cancelled-company",
  "no-show",
  "refunded",
  "completed",
] as const;

export type CanonicalBookingStatus = (typeof BOOKING_STATUSES)[number];

/** Legacy status → canonical status. */
export const LEGACY_BOOKING_STATUS: Readonly<Record<string, CanonicalBookingStatus>> = {
  reserved: "payment-pending",
  "payment-confirmed": "confirmed",
  "checked-in": "confirmed",
  complimentary: "confirmed",
  "waitlist-joined": "waitlisted",
  "waitlist-promoted": "waitlist-offered",
  cancelled: "cancelled-user",
  "refund-pending": "cancelled-user",
};

const CANONICAL = new Set<string>(BOOKING_STATUSES);

export function canonicalBookingStatus(status: BookingStatus | string): CanonicalBookingStatus {
  if (CANONICAL.has(status)) return status as CanonicalBookingStatus;
  return LEGACY_BOOKING_STATUS[status] ?? "cancelled-user";
}

/** How a booking uses session capacity. */
export type SeatClass = "paid" | "comp" | "hold" | "offer" | "waitlist" | "none";

const CONFIRMED_LIKE = new Set<CanonicalBookingStatus>(["confirmed", "completed", "no-show"]);

export function isComplimentary(b: Pick<Booking, "bookingType" | "status">): boolean {
  return b.bookingType === "complimentary" || b.status === "complimentary";
}

export function seatClass(b: Pick<Booking, "status" | "bookingType">): SeatClass {
  const s = canonicalBookingStatus(b.status);
  if (CONFIRMED_LIKE.has(s)) return isComplimentary(b) ? "comp" : "paid";
  if (s === "payment-pending") return "hold";
  if (s === "waitlist-offered") return "offer";
  if (s === "waitlisted") return "waitlist";
  return "none";
}

/** True when the booking currently occupies a seat (confirmed, comp, payment hold or offer hold). */
export const occupiesSeat = (b: Pick<Booking, "status" | "bookingType">): boolean => {
  const c = seatClass(b);
  return c === "paid" || c === "comp" || c === "hold" || c === "offer";
};

/** True for a confirmed seat (paid or complimentary). */
export const isConfirmedSeat = (b: Pick<Booking, "status" | "bookingType">): boolean => {
  const c = seatClass(b);
  return c === "paid" || c === "comp";
};

/** Statuses a booking can still be cancelled from. */
export const CANCELLABLE_STATUSES = new Set<CanonicalBookingStatus>(["payment-pending", "confirmed", "waitlisted", "waitlist-offered"]);

export const LIVE_STATUSES = new Set<SessionStatus>([
  "reveal-pending",
  "revealed",
  "check-in-open",
  "live"
]);

export const bookableSessionStatus = (status: SessionStatus): boolean =>
  status === "scheduled" || status === "published" || status === "booking-open" || status === "almost-full" || status === "full";

/** Seats occupied in a session: confirmed, complimentary, payment holds and waitlist offer holds. */
export function bookedCount(state: PrototypeState, sessionId: SessionId): number {
  return state.bookings.filter((b) => b.sessionId === sessionId && occupiesSeat(b)).length;
}

/** People waiting in the queue who have not been offered a seat yet. */
export function waitlistCount(state: PrototypeState, sessionId: SessionId): number {
  return state.bookings.filter((b) => b.sessionId === sessionId && seatClass(b) === "waitlist").length;
}

/** ISO helper shared by services and selectors. Legacy display strings return NaN. */
export function isoMillis(value?: string): number {
  if (!value) return Number.NaN;
  if (!/^\d{4}-\d{2}-\d{2}T/.test(value)) return Number.NaN;
  return Date.parse(value);
}
