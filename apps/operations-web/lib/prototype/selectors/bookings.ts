import type { PrototypeState } from "../scenarios/state";
import type { Booking } from "../entities";
import { sessionCapacityLedger } from "./capacity";

export interface BookingFilters {
  search?: string;
  sessionId?: string;
  territoryId?: string;
  cityId?: string;
  venueId?: string;
  bookingStatus?: string;
  paymentStatus?: string;
  bookingSource?: string;
  bookingType?: string;
}

export function selectBookingList(state: PrototypeState, filters: BookingFilters = {}): Booking[] {
  let list = [...state.bookings];

  if (filters.sessionId) {
    list = list.filter((b) => b.sessionId === filters.sessionId);
  }

  if (filters.territoryId) {
    const territorySessionIds = new Set(
      state.sessions.filter((s) => s.territoryId === filters.territoryId).map((s) => s.id)
    );
    list = list.filter((b) => territorySessionIds.has(b.sessionId));
  }

  if (filters.cityId) {
    const citySessionIds = new Set(
      state.sessions.filter((s) => s.cityId === filters.cityId).map((s) => s.id)
    );
    list = list.filter((b) => citySessionIds.has(b.sessionId));
  }

  if (filters.venueId) {
    const venueSessionIds = new Set(
      state.sessions.filter((s) => s.venueId === filters.venueId).map((s) => s.id)
    );
    list = list.filter((b) => venueSessionIds.has(b.sessionId));
  }

  if (filters.bookingStatus) {
    list = list.filter((b) => b.status === filters.bookingStatus);
  }

  if (filters.paymentStatus) {
    list = list.filter((b) => b.paymentStatus === filters.paymentStatus);
  }

  if (filters.bookingSource) {
    list = list.filter((b) => b.source === filters.bookingSource);
  }

  if (filters.bookingType) {
    list = list.filter((b) => b.bookingType === filters.bookingType);
  }

  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (b) =>
        b.alias.toLowerCase().includes(q) ||
        (b.bookingCode && b.bookingCode.toLowerCase().includes(q)) ||
        b.id.toLowerCase().includes(q)
    );
  }

  return list;
}

export function selectBookingById(state: PrototypeState, id: string): Booking | undefined {
  return state.bookings.find((b) => b.id === id);
}

export function selectSessionWaitlistQueue(state: PrototypeState, sessionId: string): Booking[] {
  return state.bookings
    .filter((b) => b.sessionId === sessionId && (b.status === "waitlisted" || b.status === "waitlist-offered"))
    .sort((a, b) => (a.waitlistOrder ?? 999) - (b.waitlistOrder ?? 999));
}

export function selectNextEligibleWaitlistEntry(state: PrototypeState, sessionId: string): Booking | undefined {
  const queue = selectSessionWaitlistQueue(state, sessionId);
  return queue.find((b) => b.status === "waitlisted" && b.reservationStatus !== "offer-hold");
}

export function selectReservationOperationalMetrics(state: PrototypeState) {
  const all = state.bookings;
  const activeReservations = all.filter((b) => b.reservationStatus === "active" || b.status === "reserved" || b.status === "payment-pending").length;
  const confirmed = all.filter((b) => b.status === "confirmed" || b.paymentStatus === "confirmed").length;
  const waitlisted = all.filter((b) => b.status === "waitlisted" || b.status === "waitlist-offered").length;
  const paymentFailed = all.filter((b) => b.status === "payment-failed" || b.paymentStatus === "failed").length;
  const expired = all.filter((b) => b.status === "reservation-expired").length;

  return {
    totalBookings: all.length,
    activeReservations,
    confirmed,
    waitlisted,
    paymentFailed,
    expired,
  };
}
