import type { SessionId, SessionStatus } from "../entities";
import type { PrototypeState } from "../scenarios";

/**
 * Booking statuses that occupy a seat on the floor.
 */
export const SEAT_STATUSES = new Set([
  "reserved",
  "payment-pending",
  "payment-confirmed",
  "checked-in",
  "complimentary"
] as const);

export const WAITLIST_STATUSES = new Set(["waitlist-joined", "waitlist-promoted"] as const);

export const LIVE_STATUSES = new Set<SessionStatus>([
  "reveal-pending",
  "revealed",
  "check-in-open",
  "live"
]);

export const bookableSessionStatus = (status: SessionStatus): boolean =>
  status === "scheduled" || status === "booking-open" || status === "almost-full";

export type SeatStatus = (typeof SEAT_STATUSES) extends Set<infer T> ? T : never;
export type WaitlistStatus = (typeof WAITLIST_STATUSES) extends Set<infer T> ? T : never;

export function bookedCount(state: PrototypeState, sessionId: SessionId): number {
  return state.bookings.filter(
    (b) => b.sessionId === sessionId && SEAT_STATUSES.has(b.status as SeatStatus)
  ).length;
}

export function waitlistCount(state: PrototypeState, sessionId: SessionId): number {
  return state.bookings.filter(
    (b) => b.sessionId === sessionId && WAITLIST_STATUSES.has(b.status as WaitlistStatus)
  ).length;
}
