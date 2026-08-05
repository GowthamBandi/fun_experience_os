import type { Booking, BookingSource, BookingType, ScheduledSession } from "../entities";
import type { PrototypeState } from "../scenarios";
import { sessionTitle } from "../selectors";
import { sessionCapacityLedger } from "../selectors/capacity";
import { pushAudit, pushSignal } from "./helpers";

const nowIso = () => new Date().toISOString();
const nowDisplay = () => "Just now";

/**
 * Automatically calculates session status based on remaining capacity and session state.
 */
export function autoUpdateSessionStatus(state: PrototypeState, sessionId: string): PrototypeState {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return state;

  // Guarded states that never auto-reopen
  if (
    session.status === "cancelled" ||
    session.status === "archived" ||
    session.status === "completed" ||
    session.status === "live" ||
    session.status === "check-in-open" ||
    session.status === "revealed" ||
    session.status === "booking-closed"
  ) {
    return state;
  }

  const ledger = sessionCapacityLedger(state, sessionId);
  let nextStatus = session.status;

  if (ledger.remainingSellableCapacity === 0) {
    nextStatus = "full";
  } else if (ledger.fillRate >= 85) {
    nextStatus = "almost-full";
  } else if (session.status === "full" || session.status === "almost-full") {
    nextStatus = "booking-open";
  }

  if (nextStatus === session.status) return state;

  return {
    ...state,
    sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, status: nextStatus } : s)),
  };
}

/**
 * Creates a new reservation hold on sellable capacity.
 */
export function createBookingReservation(
  state: PrototypeState,
  params: {
    sessionId: string;
    alias: string;
    phoneMask?: string;
    bookingType?: BookingType;
    source?: BookingSource;
    amount?: number;
    operatorId?: string;
  }
): { state: PrototypeState; booking?: Booking; error?: string } {
  const session = state.sessions.find((s) => s.id === params.sessionId);
  if (!session) return { state, error: "Session not found." };

  const ledger = sessionCapacityLedger(state, params.sessionId);
  const bookingType = params.bookingType || "individual";

  if (bookingType !== "complimentary" && ledger.remainingSellableCapacity <= 0) {
    return { state, error: "No remaining sellable capacity for this session." };
  }

  if (bookingType === "complimentary" && ledger.physicalOccupancy >= ledger.maxPhysicalCapacity) {
    return { state, error: "Physical venue capacity limit reached." };
  }

  const id = `b-${Date.now().toString(36)}`;
  const bookingCode = `BK-${id.toUpperCase().replace("-", "")}`;
  const amount = params.amount ?? session.basePrice ?? 0;

  const newBooking: Booking = {
    id,
    bookingCode,
    sessionId: params.sessionId,
    participantId: `usr-${params.alias.toLowerCase()}`,
    alias: params.alias,
    phoneMask: params.phoneMask || "•••• 12",
    source: params.source || (params.operatorId ? "admin" : "customer-app"),
    bookingType,
    reservationStatus: "active",
    paymentStatus: bookingType === "complimentary" ? "confirmed" : "pending",
    status: bookingType === "complimentary" ? "confirmed" : "payment-pending",
    amount,
    discount: 0,
    tax: Math.round(amount * 0.18),
    platformFee: Math.round(amount * 0.05),
    finalAmount: amount,
    method: bookingType === "complimentary" ? "complimentary" : "card",
    reservedAt: nowDisplay(),
    reservationExpiresAt: "15:00 mins",
    createdAt: nowDisplay(),
    updatedAt: nowDisplay(),
    createdBy: params.operatorId || `usr-${params.alias.toLowerCase()}`,
  };

  let next: PrototypeState = {
    ...state,
    bookings: [...state.bookings, newBooking],
  };

  // Add payment record if not complimentary
  if (bookingType !== "complimentary") {
    next = {
      ...next,
      payments: [
        ...(next.payments ?? []),
        {
          id: `pay-${id}`,
          bookingId: id,
          sessionId: params.sessionId,
          provider: "razorpay_sim",
          providerReference: `pay_ref_${id}`,
          amount,
          status: "pending",
          paymentMethod: newBooking.method,
          initiatedAt: nowDisplay(),
          createdAt: nowDisplay(),
          updatedAt: nowDisplay(),
        },
      ],
    };
  }

  next = pushSignal(next, {
    kind: "join",
    message: `Reservation created for ${params.alias} (${bookingCode})`,
    sessionId: params.sessionId,
  });

  next = pushAudit(next, {
    action: "Reservation Created",
    description: `Reservation ${bookingCode} created for ${params.alias} (${bookingType}).`,
    sessionId: params.sessionId,
    operatorId: params.operatorId,
  });

  next = autoUpdateSessionStatus(next, params.sessionId);

  return { state: next, booking: newBooking };
}

/**
 * Confirms payment for a reservation, converting reservation hold into a confirmed booking.
 */
export function confirmBookingPayment(
  state: PrototypeState,
  bookingId: string,
  method = "card",
  operatorId?: string
): PrototypeState {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return state;
  if (booking.status === "confirmed" && booking.paymentStatus === "confirmed") return state;

  let next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b) =>
      b.id === bookingId
        ? {
            ...b,
            reservationStatus: "converted" as const,
            paymentStatus: "confirmed" as const,
            status: "confirmed" as const,
            method,
            confirmedAt: nowDisplay(),
            updatedAt: nowDisplay(),
          }
        : b
    ),
    payments: (state.payments ?? []).map((p) =>
      p.bookingId === bookingId
        ? {
            ...p,
            status: "confirmed" as const,
            confirmedAt: nowDisplay(),
            updatedAt: nowDisplay(),
          }
        : p
    ),
  };

  next = pushSignal(next, {
    kind: "join",
    message: `${booking.alias} payment confirmed — ${sessionTitle(state, booking.sessionId)}`,
    sessionId: booking.sessionId,
  });

  next = pushAudit(next, {
    action: "Payment Confirmed",
    description: `Payment ${method} confirmed for booking ${booking.bookingCode || bookingId} (${booking.alias}).`,
    sessionId: booking.sessionId,
    operatorId,
  });

  return autoUpdateSessionStatus(next, booking.sessionId);
}

/**
 * Marks payment failed and releases reservation hold.
 */
export function failBookingPayment(
  state: PrototypeState,
  bookingId: string,
  reason = "Card authorization failed",
  operatorId?: string
): PrototypeState {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return state;

  let next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b) =>
      b.id === bookingId
        ? {
            ...b,
            reservationStatus: "released" as const,
            paymentStatus: "failed" as const,
            status: "payment-failed" as const,
            updatedAt: nowDisplay(),
          }
        : b
    ),
    payments: (state.payments ?? []).map((p) =>
      p.bookingId === bookingId
        ? {
            ...p,
            status: "failed" as const,
            failedAt: nowDisplay(),
            failureReason: reason,
            updatedAt: nowDisplay(),
          }
        : p
    ),
  };

  next = pushSignal(next, {
    kind: "alert",
    message: `Payment failed for ${booking.alias} (${reason})`,
    sessionId: booking.sessionId,
  });

  next = pushAudit(next, {
    action: "Payment Failed",
    description: `Payment failed for booking ${booking.bookingCode || bookingId} (${reason}). Capacity released.`,
    sessionId: booking.sessionId,
    operatorId,
  });

  return autoUpdateSessionStatus(next, booking.sessionId);
}

/**
 * Expires an active reservation hold.
 */
export function expireReservation(
  state: PrototypeState,
  bookingId: string,
  operatorId?: string
): PrototypeState {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return state;

  let next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b) =>
      b.id === bookingId
        ? {
            ...b,
            reservationStatus: "expired" as const,
            paymentStatus: "not-started" as const,
            status: "reservation-expired" as const,
            updatedAt: nowDisplay(),
          }
        : b
    ),
  };

  next = pushAudit(next, {
    action: "Reservation Expired",
    description: `Reservation ${booking.bookingCode || bookingId} expired. Capacity released.`,
    sessionId: booking.sessionId,
    operatorId,
  });

  return autoUpdateSessionStatus(next, booking.sessionId);
}

/**
 * User / company cancellation. Releases capacity and queues a refund request if paid.
 */
export function cancelBooking(
  state: PrototypeState,
  bookingId: string,
  operatorId?: string,
  reason = "User requested cancellation",
  isCompanyCancellation = false
): PrototypeState {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return state;

  const nextStatus = isCompanyCancellation ? ("cancelled-company" as const) : ("cancelled-user" as const);

  let next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b) =>
      b.id === bookingId
        ? {
            ...b,
            reservationStatus: "released" as const,
            paymentStatus: booking.paymentStatus === "confirmed" ? ("refund-pending" as const) : ("not-started" as const),
            status: nextStatus,
            cancelledAt: nowDisplay(),
            cancellationReason: reason,
            updatedAt: nowDisplay(),
          }
        : b
    ),
  };

  // If booking was paid, create a refund request record
  if (booking.amount > 0 && (booking.paymentStatus === "confirmed" || booking.status === "confirmed")) {
    const refundId = `ref-${Date.now().toString(36)}`;
    next = {
      ...next,
      refunds: [
        ...(next.refunds ?? []),
        {
          id: refundId,
          paymentId: `pay-${booking.id}`,
          bookingId: booking.id,
          sessionId: booking.sessionId,
          type: isCompanyCancellation ? "company-cancellation" : "user-cancellation",
          amount: booking.amount,
          reason,
          status: "requested",
          requestedAt: nowDisplay(),
          createdAt: nowDisplay(),
          updatedAt: nowDisplay(),
        },
      ],
    };
  }

  next = pushSignal(next, {
    kind: "close",
    message: `${booking.alias} booking cancelled (${reason})`,
    sessionId: booking.sessionId,
  });

  next = pushAudit(next, {
    action: "Booking Cancelled",
    description: `Booking ${booking.bookingCode || bookingId} cancelled (${reason}). Capacity released.`,
    sessionId: booking.sessionId,
    operatorId,
  });

  return autoUpdateSessionStatus(next, booking.sessionId);
}

/**
 * Adds a participant to the operational waitlist queue.
 */
export function joinWaitlist(
  state: PrototypeState,
  params: {
    sessionId: string;
    alias: string;
    phoneMask?: string;
    operatorId?: string;
  }
): PrototypeState {
  const existingQueue = state.bookings.filter(
    (b) => b.sessionId === params.sessionId && (b.status === "waitlisted" || b.status === "waitlist-offered")
  );
  const waitlistOrder = existingQueue.length + 1;

  const id = `b-w-${Date.now().toString(36)}`;
  const bookingCode = `WL-${id.toUpperCase().replace("-", "")}`;

  const waitlistBooking: Booking = {
    id,
    bookingCode,
    sessionId: params.sessionId,
    participantId: `usr-${params.alias.toLowerCase()}`,
    alias: params.alias,
    phoneMask: params.phoneMask || "•••• 12",
    source: "customer-app",
    bookingType: "individual",
    reservationStatus: "none",
    paymentStatus: "not-started",
    status: "waitlisted",
    amount: state.sessions.find((s) => s.id === params.sessionId)?.basePrice || 0,
    waitlistOrder,
    waitlistPosition: waitlistOrder,
    createdAt: nowDisplay(),
    updatedAt: nowDisplay(),
    createdBy: params.operatorId || `usr-${params.alias.toLowerCase()}`,
  };

  let next: PrototypeState = {
    ...state,
    bookings: [...state.bookings, waitlistBooking],
  };

  next = pushSignal(next, {
    kind: "alert",
    message: `${params.alias} joined waitlist position #${waitlistOrder}`,
    sessionId: params.sessionId,
  });

  next = pushAudit(next, {
    action: "Waitlist Joined",
    description: `${params.alias} joined waitlist at position #${waitlistOrder}.`,
    sessionId: params.sessionId,
    operatorId: params.operatorId,
  });

  return autoUpdateSessionStatus(next, params.sessionId);
}

/**
 * Extends a waitlist offer to the top eligible waitlisted participant, creating an offer hold.
 */
export function offerWaitlistSlot(
  state: PrototypeState,
  sessionId: string,
  operatorId?: string
): PrototypeState {
  const ledger = sessionCapacityLedger(state, sessionId);
  if (ledger.remainingSellableCapacity <= 0) return state;

  const waiting = state.bookings
    .filter((b) => b.sessionId === sessionId && b.status === "waitlisted" && b.reservationStatus !== "offer-hold")
    .sort((a, b) => (a.waitlistOrder ?? 999) - (b.waitlistOrder ?? 999));

  if (waiting.length === 0) return state;
  const target = waiting[0];

  let next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b) =>
      b.id === target.id
        ? {
            ...b,
            reservationStatus: "offer-hold" as const,
            status: "waitlist-offered" as const,
            waitlistOfferExpiresAt: "10:00 mins",
            updatedAt: nowDisplay(),
          }
        : b
    ),
  };

  next = pushSignal(next, {
    kind: "system",
    message: `Waitlist offer extended to ${target.alias}. Expires in 10:00 mins.`,
    sessionId,
  });

  next = pushAudit(next, {
    action: "Waitlist Offer Extended",
    description: `Waitlist offer extended to ${target.alias} (booking ${target.id}). Hold active.`,
    sessionId,
    operatorId,
  });

  return autoUpdateSessionStatus(next, sessionId);
}

/**
 * Accepts a waitlist offer, converting offer hold into an active reservation / payment pending.
 */
export function acceptWaitlistOffer(
  state: PrototypeState,
  bookingId: string,
  operatorId?: string
): PrototypeState {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return state;

  let next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b) =>
      b.id === bookingId
        ? {
            ...b,
            reservationStatus: "active" as const,
            paymentStatus: "pending" as const,
            status: "payment-pending" as const,
            reservedAt: nowDisplay(),
            reservationExpiresAt: "15:00 mins",
            updatedAt: nowDisplay(),
          }
        : b
    ),
    payments: [
      ...(state.payments ?? []),
      {
        id: `pay-${bookingId}`,
        bookingId,
        sessionId: booking.sessionId,
        provider: "razorpay_sim",
        providerReference: `pay_ref_${bookingId}`,
        amount: booking.amount,
        status: "pending",
        paymentMethod: "card",
        initiatedAt: nowDisplay(),
        createdAt: nowDisplay(),
        updatedAt: nowDisplay(),
      },
    ],
  };

  next = pushSignal(next, {
    kind: "join",
    message: `${booking.alias} accepted waitlist offer! Payment pending.`,
    sessionId: booking.sessionId,
  });

  next = pushAudit(next, {
    action: "Waitlist Offer Accepted",
    description: `${booking.alias} accepted waitlist offer for ${booking.bookingCode || bookingId}.`,
    sessionId: booking.sessionId,
    operatorId,
  });

  return autoUpdateSessionStatus(next, booking.sessionId);
}

/**
 * Expires an active waitlist offer hold and automatically dispatches offer to next eligible entry.
 */
export function expireWaitlistOffer(
  state: PrototypeState,
  bookingId: string,
  operatorId?: string
): PrototypeState {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return state;

  let next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b) =>
      b.id === bookingId
        ? {
            ...b,
            reservationStatus: "expired" as const,
            status: "reservation-expired" as const,
            updatedAt: nowDisplay(),
          }
        : b
    ),
  };

  next = pushAudit(next, {
    action: "Waitlist Offer Expired",
    description: `Waitlist offer expired for ${booking.alias}. Offer hold released.`,
    sessionId: booking.sessionId,
    operatorId,
  });

  // Auto-offer to next eligible waitlisted participant
  return offerWaitlistSlot(next, booking.sessionId, operatorId);
}

/** Legacy helpers maintained for backward compatibility */
export function strikeBooking(state: PrototypeState, bookingId: string, operatorId?: string): PrototypeState {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking || booking.checkedIn) return state;
  const next: PrototypeState = {
    ...state,
    bookings: state.bookings.map((b) => (b.id === bookingId ? { ...b, checkedIn: true } : b)),
  };
  return pushAudit(
    pushSignal(next, { kind: "strike", message: `${booking.alias} checked in — ${sessionTitle(state, booking.sessionId)}`, sessionId: booking.sessionId }),
    { action: "Check-in Strike", description: `Booking ${bookingId} marked checked-in at the door.`, sessionId: booking.sessionId, operatorId }
  );
}

export function promoteWaitlistUser(state: PrototypeState, sessionId: string, operatorId?: string): PrototypeState {
  return offerWaitlistSlot(state, sessionId, operatorId);
}

export function confirmBooking(state: PrototypeState, bookingId: string, method = "card", operatorId?: string): PrototypeState {
  return confirmBookingPayment(state, bookingId, method, operatorId);
}

