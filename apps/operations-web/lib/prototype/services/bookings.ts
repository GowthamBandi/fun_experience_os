import type { Booking, BookingSource, BookingType, Payment } from "../entities";
import type { PrototypeState } from "../scenarios";
import { sessionTitle } from "../selectors/lookups";
import { sessionCapacityLedger } from "../selectors/capacity";
import { bookingRefundTotals, currentPaymentForBooking, PAYMENT_METHODS } from "../selectors/money";
import {
  CANCELLABLE_STATUSES,
  bookableSessionStatus,
  canonicalBookingStatus,
  isoMillis,
  occupiesSeat,
  seatClass,
} from "../selectors/status";
import { validateBookingCapacityEligibility } from "../validators/bookingValidation";
import { pushAudit, pushSignal } from "./helpers";
import { syncLedger } from "./money";

/* ------------------------------------------------------------------
 * Bookings, reservation holds and the waitlist.
 *
 * Every command returns `{ state, error? }`. On error the ORIGINAL state
 * object is returned unchanged, so the store records the command as rejected
 * and nothing is saved. All timestamps written here are ISO strings.
 * ------------------------------------------------------------------ */

/** Minutes a payment-pending reservation holds its seat. */
export const HOLD_MINUTES = 15;
/** Default minutes a waitlist offer stays open when the session does not set one. */
export const DEFAULT_OFFER_MINUTES = 10;

export type CommandResult<T = unknown> = { state: PrototypeState; error?: string } & T;

const reject = <T,>(state: PrototypeState, error: string): CommandResult<T> => ({ state, error }) as CommandResult<T>;

const plusMinutes = (iso: string, mins: number) => new Date(Date.parse(iso) + mins * 60_000).toISOString();

let idSeq = 0;
/** Unique, sortable id (safe when several bookings are created in the same millisecond). */
export function newRecordId(prefix: string, existing: Array<{ id: string }> = []): string {
  const taken = new Set(existing.map((x) => x.id));
  let id = "";
  do {
    idSeq = (idSeq + 1) % 1296;
    id = `${prefix}-${Date.now().toString(36)}${idSeq.toString(36).padStart(2, "0")}`;
  } while (taken.has(id));
  return id;
}

const bookingCodeFor = (id: string) => `BK-${id.replace(/^b-/, "").toUpperCase()}`;

const cleanAlias = (alias: string) => alias.trim().replace(/\s+/g, " ");

function validateAlias(alias: string): string | undefined {
  const a = cleanAlias(alias);
  if (a.length < 2) return "Enter the participant's name or alias (at least 2 characters).";
  if (a.length > 40) return "Keep the name or alias under 40 characters.";
  return undefined;
}

function hasActiveEntry(state: PrototypeState, sessionId: string, alias: string): boolean {
  const a = cleanAlias(alias).toLowerCase();
  return state.bookings.some((b) => b.sessionId === sessionId && b.alias.toLowerCase() === a && seatClass(b) !== "none");
}

const updateBooking = (state: PrototypeState, id: string, patch: Partial<Booking>): PrototypeState => ({
  ...state,
  bookings: state.bookings.map((b) => (b.id === id ? { ...b, ...patch } : b)),
});

const updatePayment = (state: PrototypeState, id: string, patch: Partial<Payment>): PrototypeState => ({
  ...state,
  payments: (state.payments ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
});

/** Close any open (pending) payment on a booking with the given status. */
function closeOpenPayments(state: PrototypeState, bookingId: string, status: "cancelled" | "failed", nowIso: string, reason: string): PrototypeState {
  const open = (state.payments ?? []).filter((p) => p.bookingId === bookingId && (p.status === "pending" || p.status === "initiated"));
  if (open.length === 0) return state;
  return {
    ...state,
    payments: (state.payments ?? []).map((p) =>
      open.includes(p)
        ? {
            ...p,
            status,
            failureReason: reason,
            ...(status === "failed" ? { failedAt: nowIso } : { cancelledAt: nowIso }),
            updatedAt: nowIso,
          }
        : p
    ),
  };
}

function openPayment(state: PrototypeState, booking: Booking, nowIso: string): PrototypeState {
  const payments = state.payments ?? [];
  const payment: Payment = {
    id: newRecordId("pay", payments),
    bookingId: booking.id,
    sessionId: booking.sessionId,
    provider: "manual",
    amount: booking.amount,
    status: "pending",
    initiatedAt: nowIso,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  return { ...state, payments: [...payments, payment] };
}

/**
 * Recalculates the booking-open / almost-full / full status of a session from
 * its capacity ledger. Sessions in operational states are never changed.
 */
export function autoUpdateSessionStatus(state: PrototypeState, sessionId: string): PrototypeState {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return state;
  if (!["booking-open", "almost-full", "full", "published", "scheduled"].includes(session.status)) return state;

  const ledger = sessionCapacityLedger(state, sessionId);
  let nextStatus = session.status;
  if (ledger.remainingSellableCapacity === 0 && ledger.sellableCapacity > 0) nextStatus = "full";
  else if (ledger.fillRate >= 85) nextStatus = "almost-full";
  else if (session.status === "full" || session.status === "almost-full") nextStatus = "booking-open";

  if (nextStatus === session.status) return state;
  return { ...state, sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, status: nextStatus } : s)) };
}

/* ------------------------------ reservations ------------------------------ */

export interface ReservationInput {
  sessionId: string;
  alias: string;
  phoneMask?: string;
  bookingType?: BookingType;
  source?: BookingSource;
  /** Price override; defaults to the session's final price. Ignored for complimentary bookings. */
  amount?: number;
  operatorId?: string;
}

/**
 * Creates a booking. Paid bookings hold a seat for HOLD_MINUTES while payment
 * is recorded; complimentary bookings are confirmed immediately.
 */
export function createBookingReservation(
  state: PrototypeState,
  params: ReservationInput,
  nowIso: string = new Date().toISOString()
): CommandResult<{ booking?: Booking }> {
  const session = state.sessions.find((s) => s.id === params.sessionId);
  if (!session) return reject(state, "Choose a session for this booking.");
  const aliasError = validateAlias(params.alias);
  if (aliasError) return reject(state, aliasError);
  const alias = cleanAlias(params.alias);

  const bookingType = params.bookingType ?? "individual";
  const eligibility = validateBookingCapacityEligibility(state, params.sessionId, bookingType);
  if (!eligibility.isValid) return reject(state, eligibility.errors.join(" "));
  if (hasActiveEntry(state, params.sessionId, alias)) return reject(state, `${alias} already has an active booking or waitlist entry for this session.`);

  const isComp = bookingType === "complimentary";
  const amount = isComp ? 0 : Math.round(params.amount ?? session.finalPrice ?? session.basePrice ?? 0);
  if (!isComp && (!Number.isFinite(amount) || amount < 0)) return reject(state, "The booking amount must be zero or more.");

  const id = newRecordId("b", state.bookings);
  const booking: Booking = {
    id,
    bookingCode: bookingCodeFor(id),
    sessionId: params.sessionId,
    participantId: `usr-${alias.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    alias,
    phoneMask: params.phoneMask?.trim() || "Not provided",
    source: params.source ?? (isComp ? "complimentary" : params.operatorId ? "admin" : "customer-app"),
    bookingType,
    reservationStatus: isComp ? "converted" : "active",
    paymentStatus: isComp ? "none" : amount === 0 ? "confirmed" : "pending",
    status: isComp || amount === 0 ? "confirmed" : "payment-pending",
    amount,
    discount: 0,
    tax: Math.round(amount * 0.18),
    platformFee: Math.round(amount * 0.05),
    finalAmount: amount,
    method: isComp ? "complimentary" : undefined,
    reservedAt: nowIso,
    reservationExpiresAt: isComp || amount === 0 ? undefined : plusMinutes(nowIso, HOLD_MINUTES),
    confirmedAt: isComp || amount === 0 ? nowIso : undefined,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: params.operatorId ?? "customer",
  };

  let next: PrototypeState = { ...state, bookings: [...state.bookings, booking] };
  if (booking.status === "payment-pending") next = openPayment(next, booking, nowIso);

  next = pushSignal(next, {
    kind: "join",
    message: isComp
      ? `Free pass issued to ${alias} — ${sessionTitle(state, params.sessionId)}`
      : `Seat held for ${alias} for ${HOLD_MINUTES} minutes — ${sessionTitle(state, params.sessionId)}`,
    sessionId: params.sessionId,
  });
  next = pushAudit(next, {
    action: isComp ? "Complimentary Booking Created" : "Reservation Created",
    description: isComp
      ? `Complimentary booking ${booking.bookingCode} created for ${alias}.`
      : `Reservation ${booking.bookingCode} created for ${alias}; seat held until ${booking.reservationExpiresAt}.`,
    sessionId: params.sessionId,
    operatorId: params.operatorId,
  });

  next = syncLedger(autoUpdateSessionStatus(next, params.sessionId));
  return { state: next, booking };
}

export interface PaymentRecordInput {
  /** One of PAYMENT_METHODS ids. */
  method: string;
  /** Receipt number, UPI UTR, POS slip or bank reference. */
  reference: string;
}

function validatePaymentRecord(input: PaymentRecordInput | undefined): string | undefined {
  if (!input || !PAYMENT_METHODS.some((m) => m.id === input.method)) return "Choose how the payment was received.";
  const ref = input.reference?.trim() ?? "";
  if (ref.length < 3) return "Enter the payment reference (receipt number, UTR or POS slip), at least 3 characters.";
  if (ref.length > 64) return "Keep the payment reference under 64 characters.";
  return undefined;
}

/**
 * Records a payment as received. The payment provider is not connected, so an
 * operator confirms the payment manually with its method and reference.
 */
export function confirmBookingPayment(
  state: PrototypeState,
  bookingId: string,
  input: PaymentRecordInput,
  operatorId?: string,
  nowIso: string = new Date().toISOString()
): CommandResult {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return reject(state, "This booking could not be found.");
  const status = canonicalBookingStatus(booking.status);
  if (status === "confirmed" || status === "completed" || status === "no-show") return reject(state, "This booking is already paid and confirmed.");
  const recordError = validatePaymentRecord(input);
  if (recordError) return reject(state, recordError);

  if (status === "payment-failed" || status === "reservation-expired") {
    // The seat was released: taking payment now needs a free seat again.
    const ledger = sessionCapacityLedger(state, booking.sessionId);
    if (ledger.remainingSellableCapacity <= 0) {
      return reject(state, "The seat for this booking was released and the session is now full. Add the person to the waiting list instead.");
    }
    const session = state.sessions.find((s) => s.id === booking.sessionId);
    if (!session || !bookableSessionStatus(session.status)) return reject(state, "This session is no longer taking bookings.");
  } else if (status !== "payment-pending") {
    return reject(state, `A payment can't be recorded for a booking that is ${status.replace(/-/g, " ")}.`);
  }

  const reference = input.reference.trim();
  let next = updateBooking(state, bookingId, {
    status: "confirmed",
    reservationStatus: "converted",
    paymentStatus: "confirmed",
    method: input.method,
    paymentReference: reference,
    reservationExpiresAt: undefined,
    confirmedAt: nowIso,
    updatedAt: nowIso,
  });

  const open = (next.payments ?? []).find((p) => p.bookingId === bookingId && (p.status === "pending" || p.status === "initiated"));
  const confirmedFields: Partial<Payment> = {
    status: "confirmed",
    provider: "manual",
    providerReference: reference,
    paymentMethod: input.method,
    amount: booking.amount,
    confirmedAt: nowIso,
    confirmedBy: operatorId,
    updatedAt: nowIso,
  };
  if (open) {
    next = updatePayment(next, open.id, confirmedFields);
  } else {
    next = openPayment(next, booking, nowIso);
    const created = (next.payments ?? [])[(next.payments ?? []).length - 1];
    next = updatePayment(next, created.id, confirmedFields);
  }

  next = pushSignal(next, {
    kind: "join",
    message: `${booking.alias} paid — ${sessionTitle(state, booking.sessionId)}`,
    sessionId: booking.sessionId,
  });
  next = pushAudit(next, {
    action: "Payment Recorded",
    description: `Payment of ₹${booking.amount} for ${booking.bookingCode ?? bookingId} (${booking.alias}) recorded manually via ${input.method}, reference ${reference}.`,
    sessionId: booking.sessionId,
    operatorId,
  });
  return { state: syncLedger(autoUpdateSessionStatus(next, booking.sessionId)) };
}

/** Records that the customer's payment did not go through and releases the held seat. */
export function failBookingPayment(
  state: PrototypeState,
  bookingId: string,
  reason: string,
  operatorId?: string,
  nowIso: string = new Date().toISOString()
): CommandResult {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return reject(state, "This booking could not be found.");
  if (canonicalBookingStatus(booking.status) !== "payment-pending") return reject(state, "Only a booking waiting for payment can be marked as failed.");
  const why = reason?.trim() ?? "";
  if (why.length < 3) return reject(state, "Say why the payment failed (at least 3 characters).");

  let next = updateBooking(state, bookingId, {
    status: "payment-failed",
    reservationStatus: "released",
    paymentStatus: "failed",
    reservationExpiresAt: undefined,
    updatedAt: nowIso,
  });
  next = closeOpenPayments(next, bookingId, "failed", nowIso, why);
  next = pushSignal(next, { kind: "alert", message: `Payment failed for ${booking.alias} (${why}). Seat released.`, sessionId: booking.sessionId });
  next = pushAudit(next, {
    action: "Payment Failed",
    description: `Payment for ${booking.bookingCode ?? bookingId} (${booking.alias}) marked failed: ${why}. Seat released.`,
    sessionId: booking.sessionId,
    operatorId,
  });
  next = autoOfferFreedSeats(next, booking.sessionId, nowIso, operatorId);
  return { state: syncLedger(autoUpdateSessionStatus(next, booking.sessionId)) };
}

function releaseHold(state: PrototypeState, booking: Booking, nowIso: string, operatorId: string | undefined, how: "expired" | "released"): PrototypeState {
  let next = updateBooking(state, booking.id, {
    status: "reservation-expired",
    reservationStatus: "expired",
    paymentStatus: "not-started",
    updatedAt: nowIso,
  });
  next = closeOpenPayments(next, booking.id, "cancelled", nowIso, how === "expired" ? "Hold expired before payment was recorded" : "Hold released by operator");
  return pushAudit(next, {
    action: how === "expired" ? "Reservation Expired" : "Reservation Released",
    description:
      how === "expired"
        ? `Reservation ${booking.bookingCode ?? booking.id} (${booking.alias}) expired at ${booking.reservationExpiresAt} without payment. Seat released.`
        : `Reservation ${booking.bookingCode ?? booking.id} (${booking.alias}) released before payment. Seat released.`,
    sessionId: booking.sessionId,
    operatorId,
  });
}

/** Releases a payment hold immediately (operator decision). */
export function expireReservation(
  state: PrototypeState,
  bookingId: string,
  operatorId?: string,
  nowIso: string = new Date().toISOString()
): CommandResult {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return reject(state, "This booking could not be found.");
  if (canonicalBookingStatus(booking.status) !== "payment-pending") return reject(state, "Only a seat that is waiting for payment can be released.");
  let next = releaseHold(state, booking, nowIso, operatorId, "released");
  next = autoOfferFreedSeats(next, booking.sessionId, nowIso, operatorId);
  return { state: syncLedger(autoUpdateSessionStatus(next, booking.sessionId)) };
}

export interface CancelBookingInput {
  reason: string;
  /** True when operations cancels (venue issue, session cancelled). */
  byCompany?: boolean;
}

/**
 * Cancels a booking or waitlist entry. A paid booking gets a refund request for
 * everything that can still be refunded; Finance approves and pays it out.
 */
export function cancelBooking(
  state: PrototypeState,
  bookingId: string,
  input: CancelBookingInput,
  operatorId?: string,
  nowIso: string = new Date().toISOString()
): CommandResult<{ refundId?: string }> {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return reject(state, "This booking could not be found.");
  const status = canonicalBookingStatus(booking.status);
  if (!CANCELLABLE_STATUSES.has(status)) return reject(state, `This booking is already ${status.replace(/-/g, " ")} and can't be cancelled.`);
  if (booking.checkedIn) return reject(state, "This participant has already checked in. Record a refund instead of cancelling.");
  const reason = input.reason?.trim() ?? "";
  if (reason.length < 5) return reject(state, "Give a reason for the cancellation (at least 5 characters).");

  const wasSeated = occupiesSeat(booking);
  const totals = bookingRefundTotals(state, bookingId);
  let next = updateBooking(state, bookingId, {
    status: input.byCompany ? "cancelled-company" : "cancelled-user",
    reservationStatus: "released",
    paymentStatus: totals.refundable > 0 ? "refund-pending" : totals.paid > 0 ? booking.paymentStatus : "not-started",
    reservationExpiresAt: undefined,
    waitlistOfferExpiresAt: undefined,
    cancelledAt: nowIso,
    cancelledBy: operatorId,
    cancellationReason: reason,
    updatedAt: nowIso,
  });
  next = closeOpenPayments(next, bookingId, "cancelled", nowIso, "Booking cancelled before payment");

  let refundId: string | undefined;
  if (totals.refundable > 0) {
    refundId = newRecordId("ref", next.refunds ?? []);
    const payment = currentPaymentForBooking(next, bookingId);
    next = {
      ...next,
      refunds: [
        ...(next.refunds ?? []),
        {
          id: refundId,
          paymentId: payment?.id,
          bookingId,
          sessionId: booking.sessionId,
          type: input.byCompany ? "company-cancellation" : "user-cancellation",
          amount: totals.refundable,
          reason,
          status: "requested",
          requestedAt: nowIso,
          requestedBy: operatorId,
          createdAt: nowIso,
          updatedAt: nowIso,
        },
      ],
    };
  }

  next = pushSignal(next, { kind: "close", message: `${booking.alias}'s booking cancelled — ${reason}`, sessionId: booking.sessionId });
  next = pushAudit(next, {
    action: "Booking Cancelled",
    description:
      `${booking.bookingCode ?? bookingId} (${booking.alias}) cancelled${input.byCompany ? " by operations" : " at the customer's request"}: ${reason}.` +
      (refundId ? ` Refund request ${refundId} for ₹${totals.refundable} created.` : "") +
      (wasSeated ? " Seat released." : ""),
    sessionId: booking.sessionId,
    operatorId,
  });
  if (wasSeated) next = autoOfferFreedSeats(next, booking.sessionId, nowIso, operatorId);
  return { state: syncLedger(autoUpdateSessionStatus(next, booking.sessionId)), refundId };
}

/* -------------------------------- waitlist -------------------------------- */

/** Adds a person to the end of a full session's waitlist queue. */
export function joinWaitlist(
  state: PrototypeState,
  params: { sessionId: string; alias: string; phoneMask?: string; operatorId?: string },
  nowIso: string = new Date().toISOString()
): CommandResult<{ booking?: Booking }> {
  const session = state.sessions.find((s) => s.id === params.sessionId);
  if (!session) return reject(state, "Choose a session for the waitlist.");
  if (session.waitlistEnabled === false) return reject(state, "This session does not use a waitlist.");
  if (!bookableSessionStatus(session.status)) return reject(state, "This session is no longer taking bookings or waitlist entries.");
  const aliasError = validateAlias(params.alias);
  if (aliasError) return reject(state, aliasError);
  const alias = cleanAlias(params.alias);
  if (hasActiveEntry(state, params.sessionId, alias)) return reject(state, `${alias} already has an active booking or waitlist entry for this session.`);
  const ledger = sessionCapacityLedger(state, params.sessionId);
  if (ledger.remainingSellableCapacity > 0) {
    return reject(state, `${ledger.remainingSellableCapacity} seat${ledger.remainingSellableCapacity === 1 ? " is" : "s are"} still free — create a booking instead of a waitlist entry.`);
  }

  const orders = state.bookings.filter((b) => b.sessionId === params.sessionId).map((b) => b.waitlistOrder ?? 0);
  const waitlistOrder = Math.max(0, ...orders) + 1;
  const position = state.bookings.filter((b) => b.sessionId === params.sessionId && (seatClass(b) === "waitlist" || seatClass(b) === "offer")).length + 1;
  const id = newRecordId("b", state.bookings);
  const booking: Booking = {
    id,
    bookingCode: `WL-${id.replace(/^b-/, "").toUpperCase()}`,
    sessionId: params.sessionId,
    participantId: `usr-${alias.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    alias,
    phoneMask: params.phoneMask?.trim() || "Not provided",
    source: params.operatorId ? "admin" : "customer-app",
    bookingType: "individual",
    reservationStatus: "none",
    paymentStatus: "not-started",
    status: "waitlisted",
    amount: session.finalPrice || session.basePrice || 0,
    waitlistOrder,
    waitlistPosition: position,
    createdAt: nowIso,
    updatedAt: nowIso,
    createdBy: params.operatorId ?? "customer",
  };

  let next: PrototypeState = { ...state, bookings: [...state.bookings, booking] };
  next = pushSignal(next, { kind: "alert", message: `${alias} joined the waitlist at position ${position} — ${sessionTitle(state, params.sessionId)}`, sessionId: params.sessionId });
  next = pushAudit(next, {
    action: "Waitlist Joined",
    description: `${alias} joined the waitlist at position ${position}.`,
    sessionId: params.sessionId,
    operatorId: params.operatorId,
  });
  return { state: next, booking };
}

function makeOffer(state: PrototypeState, target: Booking, nowIso: string, operatorId: string | undefined, automatic: boolean): PrototypeState {
  const session = state.sessions.find((s) => s.id === target.sessionId);
  const mins = session?.waitlistOfferExpiryMins && session.waitlistOfferExpiryMins > 0 ? session.waitlistOfferExpiryMins : DEFAULT_OFFER_MINUTES;
  const expiresAt = plusMinutes(nowIso, mins);
  let next = updateBooking(state, target.id, {
    status: "waitlist-offered",
    reservationStatus: "offer-hold",
    waitlistOfferedAt: nowIso,
    waitlistOfferExpiresAt: expiresAt,
    updatedAt: nowIso,
  });
  next = pushSignal(next, {
    kind: "system",
    message: `Seat offered to ${target.alias} for ${mins} minutes — ${sessionTitle(state, target.sessionId)}`,
    sessionId: target.sessionId,
  });
  return pushAudit(next, {
    action: "Waitlist Offer Made",
    description: `${automatic ? "A seat freed up and was automatically offered" : "Seat offered"} to ${target.alias} (${target.bookingCode ?? target.id}); the offer holds the seat until ${expiresAt}.`,
    sessionId: target.sessionId,
    operatorId,
  });
}

/** Offers the next free seat to the first person waiting in the queue. */
export function offerWaitlistSlot(
  state: PrototypeState,
  sessionId: string,
  operatorId?: string,
  nowIso: string = new Date().toISOString()
): CommandResult<{ booking?: Booking }> {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return reject(state, "This session could not be found.");
  if (!bookableSessionStatus(session.status)) return reject(state, "This session is no longer taking bookings, so no seat can be offered.");
  const ledger = sessionCapacityLedger(state, sessionId);
  if (ledger.remainingSellableCapacity <= 0) return reject(state, "There is no free seat to offer. A seat frees up when a booking is cancelled or a hold expires.");
  const target = state.bookings
    .filter((b) => b.sessionId === sessionId && seatClass(b) === "waitlist")
    .sort((a, b) => (a.waitlistOrder ?? Number.MAX_SAFE_INTEGER) - (b.waitlistOrder ?? Number.MAX_SAFE_INTEGER))[0];
  if (!target) return reject(state, "Nobody is waiting for this session.");
  const next = makeOffer(state, target, nowIso, operatorId, false);
  return { state: autoUpdateSessionStatus(next, sessionId), booking: next.bookings.find((b) => b.id === target.id) };
}

/**
 * While the session has free seats and people waiting, offer seats in queue
 * order. Used after any seat is released.
 */
export function autoOfferFreedSeats(state: PrototypeState, sessionId: string, nowIso: string, operatorId?: string): PrototypeState {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session || session.waitlistEnabled === false || !bookableSessionStatus(session.status)) return state;
  let next = state;
  for (let guard = 0; guard < 500; guard++) {
    if (sessionCapacityLedger(next, sessionId).remainingSellableCapacity <= 0) break;
    const target = next.bookings
      .filter((b) => b.sessionId === sessionId && seatClass(b) === "waitlist")
      .sort((a, b) => (a.waitlistOrder ?? Number.MAX_SAFE_INTEGER) - (b.waitlistOrder ?? Number.MAX_SAFE_INTEGER))[0];
    if (!target) break;
    next = makeOffer(next, target, nowIso, operatorId, true);
  }
  return next;
}

/** The waitlisted person accepted the offer: the offer hold becomes a payment hold. */
export function acceptWaitlistOffer(
  state: PrototypeState,
  bookingId: string,
  operatorId?: string,
  nowIso: string = new Date().toISOString()
): CommandResult {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return reject(state, "This waitlist entry could not be found.");
  if (canonicalBookingStatus(booking.status) !== "waitlist-offered") return reject(state, "There is no open seat offer for this person.");
  const expires = isoMillis(booking.waitlistOfferExpiresAt);
  if (!Number.isNaN(expires) && expires <= Date.parse(nowIso)) return reject(state, "This offer has expired. The seat has gone back to the queue.");

  let next = updateBooking(state, bookingId, {
    status: "payment-pending",
    reservationStatus: "active",
    paymentStatus: "pending",
    reservedAt: nowIso,
    reservationExpiresAt: plusMinutes(nowIso, HOLD_MINUTES),
    waitlistOfferExpiresAt: undefined,
    updatedAt: nowIso,
  });
  next = openPayment(next, { ...booking, sessionId: booking.sessionId }, nowIso);
  next = pushSignal(next, { kind: "join", message: `${booking.alias} accepted the seat offer — payment pending`, sessionId: booking.sessionId });
  next = pushAudit(next, {
    action: "Waitlist Offer Accepted",
    description: `${booking.alias} accepted the seat offer for ${booking.bookingCode ?? bookingId}; seat held for ${HOLD_MINUTES} minutes while payment is recorded.`,
    sessionId: booking.sessionId,
    operatorId,
  });
  return { state: syncLedger(autoUpdateSessionStatus(next, booking.sessionId)) };
}

function closeOffer(state: PrototypeState, booking: Booking, nowIso: string, operatorId: string | undefined, how: "expired" | "withdrawn"): PrototypeState {
  const next = updateBooking(state, booking.id, {
    status: "reservation-expired",
    reservationStatus: "expired",
    updatedAt: nowIso,
  });
  return pushAudit(next, {
    action: how === "expired" ? "Waitlist Offer Expired" : "Waitlist Offer Withdrawn",
    description:
      how === "expired"
        ? `Seat offer to ${booking.alias} expired at ${booking.waitlistOfferExpiresAt} without a reply.`
        : `Seat offer to ${booking.alias} withdrawn by an operator.`,
    sessionId: booking.sessionId,
    operatorId,
  });
}

/** Withdraws an open offer now and offers the seat to the next person in the queue. */
export function expireWaitlistOffer(
  state: PrototypeState,
  bookingId: string,
  operatorId?: string,
  nowIso: string = new Date().toISOString()
): CommandResult {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return reject(state, "This waitlist entry could not be found.");
  if (canonicalBookingStatus(booking.status) !== "waitlist-offered") return reject(state, "There is no open seat offer to withdraw.");
  let next = closeOffer(state, booking, nowIso, operatorId, "withdrawn");
  next = autoOfferFreedSeats(next, booking.sessionId, nowIso, operatorId);
  return { state: autoUpdateSessionStatus(next, booking.sessionId) };
}

/** Marks a confirmed participant as checked in at the door (legacy quick action). */
export function strikeBooking(state: PrototypeState, bookingId: string, operatorId?: string): CommandResult {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return reject(state, "This booking could not be found.");
  if (seatClass(booking) !== "paid" && seatClass(booking) !== "comp") return reject(state, "Only a confirmed booking can be checked in.");
  if (booking.checkedIn) return reject(state, `${booking.alias} is already checked in.`);
  const next = updateBooking(state, bookingId, { checkedIn: true, updatedAt: new Date().toISOString() });
  return {
    state: pushAudit(
      pushSignal(next, { kind: "strike", message: `${booking.alias} checked in — ${sessionTitle(state, booking.sessionId)}`, sessionId: booking.sessionId }),
      { action: "Checked In", description: `${booking.bookingCode ?? bookingId} (${booking.alias}) checked in at the door.`, sessionId: booking.sessionId, operatorId }
    ),
  };
}

/* ------------------------------ expiry sweeper ------------------------------ */

const isPast = (iso: string | undefined, now: number) => {
  const ms = isoMillis(iso);
  return !Number.isNaN(ms) && ms <= now;
};

/**
 * Release every reservation hold and waitlist offer whose expiry has passed.
 * Called by the store every 30 seconds (the local equivalent of a scheduled
 * job). Expired holds release their seat and cancel the open payment; expired
 * offers pass the seat to the next person in the queue. Idempotent, and
 * returns the SAME state object when nothing expired.
 */
export function releaseExpiredHolds(state: PrototypeState, nowIso: string, operatorId = "system"): PrototypeState {
  const now = Date.parse(nowIso);
  if (Number.isNaN(now)) return state;
  const holds = state.bookings.filter((b) => canonicalBookingStatus(b.status) === "payment-pending" && isPast(b.reservationExpiresAt, now));
  const offers = state.bookings.filter((b) => canonicalBookingStatus(b.status) === "waitlist-offered" && isPast(b.waitlistOfferExpiresAt, now));
  if (holds.length === 0 && offers.length === 0) return state;

  let next = state;
  for (const b of holds) next = releaseHold(next, b, nowIso, operatorId, "expired");
  for (const b of offers) next = closeOffer(next, b, nowIso, operatorId, "expired");

  const sessions = new Set([...holds, ...offers].map((b) => b.sessionId));
  for (const sid of sessions) {
    next = autoOfferFreedSeats(next, sid, nowIso, operatorId);
    next = autoUpdateSessionStatus(next, sid);
  }
  if (holds.length + offers.length > 0) {
    next = pushSignal(next, {
      kind: "system",
      message: `${holds.length ? `${holds.length} unpaid hold${holds.length === 1 ? "" : "s"} expired` : ""}${holds.length && offers.length ? " and " : ""}${offers.length ? `${offers.length} seat offer${offers.length === 1 ? "" : "s"} expired` : ""}; seats released.`,
    });
  }
  return syncLedger(next);
}

/* ------------------------------ legacy data ------------------------------ */

/**
 * Rewrites bookings saved before the canonical vocabulary existed. Legacy
 * statuses become canonical ones, and display-string expiries ("15:00 mins",
 * "19:45") on still-active holds and offers become real ISO timestamps counted
 * from the migration time. Idempotent: canonical data is returned unchanged.
 */
export function migrateLegacyBookings(state: PrototypeState, nowIso: string = new Date().toISOString()): PrototypeState {
  const cancelledSessions = new Set(state.sessions.filter((s) => s.status === "cancelled").map((s) => s.id));
  const offerMins = new Map(state.sessions.map((s) => [s.id, s.waitlistOfferExpiryMins > 0 ? s.waitlistOfferExpiryMins : DEFAULT_OFFER_MINUTES]));
  const isIso = (v?: string) => !Number.isNaN(isoMillis(v));
  let changed = false;

  const bookings = state.bookings.map((b) => {
    const raw = String(b.status);
    let next: Booking = b;
    const set = (patch: Partial<Booking>) => {
      next = { ...next, ...patch };
    };

    switch (raw) {
      case "reserved":
        set({ status: "payment-pending", reservationStatus: "active", paymentStatus: "pending" });
        break;
      case "payment-confirmed":
        set({ status: "confirmed", reservationStatus: "converted", paymentStatus: b.paymentStatus && b.paymentStatus !== "none" && b.paymentStatus !== "not-started" && b.paymentStatus !== "pending" ? b.paymentStatus : "confirmed" });
        break;
      case "checked-in":
        set({ status: "confirmed", reservationStatus: "converted", checkedIn: true, paymentStatus: b.paymentStatus && b.paymentStatus !== "not-started" && b.paymentStatus !== "pending" ? b.paymentStatus : "confirmed" });
        break;
      case "complimentary":
        set({ status: "confirmed", reservationStatus: "converted", bookingType: "complimentary", paymentStatus: "none" });
        break;
      case "waitlist-joined":
        set({ status: "waitlisted", reservationStatus: "none", paymentStatus: "not-started" });
        break;
      case "waitlist-promoted":
        set({ status: "waitlist-offered", reservationStatus: "offer-hold", paymentStatus: "not-started" });
        break;
      case "cancelled":
      case "refund-pending":
        set({
          status: cancelledSessions.has(b.sessionId) ? "cancelled-company" : "cancelled-user",
          reservationStatus: "released",
          paymentStatus: raw === "refund-pending" ? "refund-pending" : b.paymentStatus,
        });
        break;
      default:
        break;
    }

    const status = canonicalBookingStatus(next.status);
    if (status === "payment-pending" && !isIso(next.reservationExpiresAt)) {
      set({ reservationExpiresAt: plusMinutes(nowIso, HOLD_MINUTES) });
    } else if (status !== "payment-pending" && next.reservationExpiresAt && !isIso(next.reservationExpiresAt)) {
      set({ reservationExpiresAt: undefined });
    }
    if (status === "waitlist-offered" && !isIso(next.waitlistOfferExpiresAt)) {
      set({ waitlistOfferExpiresAt: plusMinutes(nowIso, offerMins.get(b.sessionId) ?? DEFAULT_OFFER_MINUTES), reservationStatus: "offer-hold" });
    } else if (status !== "waitlist-offered" && next.waitlistOfferExpiresAt && !isIso(next.waitlistOfferExpiresAt)) {
      set({ waitlistOfferExpiresAt: undefined });
    }

    if (next !== b) changed = true;
    return next;
  });

  return changed ? { ...state, bookings } : state;
}
