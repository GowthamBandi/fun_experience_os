import type { Booking } from "../entities";
import type { PrototypeState } from "../scenarios";
import { sessionTitle } from "../selectors";
import { pushAudit, pushSignal } from "./helpers";

const isSeat = (b: Booking): boolean =>
  b.status === "reserved" ||
  b.status === "payment-pending" ||
  b.status === "payment-confirmed" ||
  b.status === "checked-in" ||
  b.status === "complimentary";

/** Move a payment-pending / reserved booking to payment-confirmed. */
export function confirmBooking(state: PrototypeState, bookingId: string, method = "card", operatorId?: string): PrototypeState {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return state;
  if (booking.status !== "payment-pending" && booking.status !== "reserved") return state;

  let next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b) =>
      b.id === bookingId ? { ...b, status: "payment-confirmed" as const, method } : b
    )
  };
  next = {
    ...next,
    transactions: [
      {
        id: `t-cf-${Date.now()}`,
        sessionId: booking.sessionId,
        territoryId: next.sessions.find((s) => s.id === booking.sessionId)?.territoryId ?? "unknown",
        bookingId,
        kind: "payment",
        amount: booking.amount,
        method,
        status: "settled",
        at: "Just now"
      },
      ...next.transactions
    ]
  };
  next = pushSignal(next, { kind: "join", message: `${booking.alias} payment confirmed — ${sessionTitle(state, booking.sessionId)}`, sessionId: booking.sessionId });
  return pushAudit(next, { action: "Booking Confirmed", description: `Payment ${method} confirmed for booking ${bookingId} (${booking.alias}).`, sessionId: booking.sessionId, operatorId });
}

/** Promote the first waitlist-joined booking to waitlist-promoted (offer extended). */
export function promoteWaitlistUser(state: PrototypeState, sessionId: string, operatorId?: string): PrototypeState {
  const waiting = state.bookings
    .filter((b) => b.sessionId === sessionId && b.status === "waitlist-joined")
    .sort((a, b) => (a.waitlistOrder ?? 0) - (b.waitlistOrder ?? 0));
  if (waiting.length === 0) return state;
  const target = waiting[0];

  let next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b) =>
      b.id === target.id
        ? { ...b, status: "waitlist-promoted" as const, waitlistOfferExpiresAt: "19:45" }
        : b
    )
  };
  next = pushSignal(next, { kind: "system", message: `Waitlist offer extended to ${target.alias} (${sessionTitle(state, sessionId)}). Expires 19:45.`, sessionId });
  return pushAudit(next, { action: "Waitlist Promoted", description: `${target.alias} (booking ${target.id}) promoted off the waitlist; offer expires 19:45.`, sessionId, operatorId });
}

/** Mark a booking checked-in at the door. Raises a strike signal. */
export function strikeBooking(state: PrototypeState, bookingId: string, operatorId?: string): PrototypeState {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking || booking.status === "checked-in") return state;
  const next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b) => (b.id === bookingId ? { ...b, status: "checked-in" as const } : b))
  };
  return pushAudit(
    pushSignal(next, { kind: "strike", message: `${booking.alias} checked in — ${sessionTitle(state, booking.sessionId)}`, sessionId: booking.sessionId }),
    { action: "Check-in Strike", description: `Booking ${bookingId} marked checked-in at the door.`, sessionId: booking.sessionId, operatorId }
  );
}

/** User / company cancellation. Queues a refund transaction when the booking was paid. */
export function cancelBooking(state: PrototypeState, bookingId: string, operatorId?: string, reason = "cancelled"): PrototypeState {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return state;

  let next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b) => (b.id === bookingId ? { ...b, status: "cancelled" as const } : b))
  };

  if (booking.amount > 0 && (booking.status === "payment-confirmed" || booking.status === "checked-in")) {
    next = {
      ...next,
      transactions: [
        {
          id: `t-cx-${Date.now()}`,
          sessionId: booking.sessionId,
          territoryId: next.sessions.find((s) => s.id === booking.sessionId)?.territoryId ?? "unknown",
          bookingId,
          kind: "refund",
          amount: -booking.amount,
          method: "card",
          status: "pending",
          at: "Just now"
        },
        ...next.transactions
      ]
    };
  }

  return pushAudit(
    pushSignal(next, { kind: "system", message: `${booking.alias} cancelled (${reason}) — ${sessionTitle(state, booking.sessionId)}`, sessionId: booking.sessionId }),
    { action: "Booking Cancelled", description: `Booking ${bookingId} (${booking.alias}) cancelled.`, sessionId: booking.sessionId, operatorId }
  );
}

export function seatsForSession(state: PrototypeState, sessionId: string): Booking[] {
  return state.bookings.filter((b) => b.sessionId === sessionId && isSeat(b));
}

export function waitlistForSession(state: PrototypeState, sessionId: string): Booking[] {
  return state.bookings
    .filter((b) => b.sessionId === sessionId && (b.status === "waitlist-joined" || b.status === "waitlist-promoted"))
    .sort((a, b) => (a.waitlistOrder ?? 0) - (b.waitlistOrder ?? 0));
}

export const waitlistPromotionEligible = (state: PrototypeState, sessionId: string): boolean => {
  const session = state.sessions.find((s) => s.id === sessionId);
  const capacity = session?.maxParticipants ?? 0;
  const seats = seatsForSession(state, sessionId).length;
  return (session?.waitlistEnabled ?? false) && seats < capacity && waitlistForSession(state, sessionId).length > 0;
};
