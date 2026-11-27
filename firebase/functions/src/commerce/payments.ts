/**
 * Booking → payment → ticket (ADR-0005).
 *
 * The client never supplies an amount. Payment is confirmed only by the server
 * (verified checkout signature or verified webhook), and both paths converge on
 * the single idempotent `settleCapturedPayment()`.
 */

import { Timestamp, bookingRef, db, sessionRef, serverNow } from "../platform/firestore";
import { DomainError, notFound, precondition } from "../platform/errors";
import { writeAudit } from "../platform/audit";
import { notify } from "../platform/notify";
import {
  EMPTY_OCCUPANCY,
  admitSeats,
  applyHoldReleased,
  applySeatConfirmed,
  applySeatsConfirmedDirect,
  deriveCapacityLedger,
  occupancyProjection,
  type OccupancyCounters,
} from "../domain/capacity";
import { isLiveBooking, type BookingDoc, type EventDoc } from "../bookings/reserveSeat";
import { C, CURRENCY, bookingLockId } from "./config";
import { captureLines, commissionFor, postLedger } from "./ledger";
import { getPaymentProvider, verifyPaymentSignature } from "./provider";
import { logWarn } from "../platform/log";
import { approveRefundInTx, executeRefund, newRefundDoc } from "./refundCore";
import { assertOwner, claimAllows, getBooking, getPayment, paymentRef, providerPaymentRef, raiseRiskAlert, refundRef, writeClaim } from "./shared";
import { issueTickets } from "./tickets";
import type { PaymentDoc } from "./types";

/* ============================================================ createPaymentOrder */

export interface PaymentOrderResult {
  paymentId: string;
  provider: "razorpay";
  providerOrderId: string;
  keyId: string;
  amountMinor: number;
  currency: string;
}

const CREATE_LEASE_MS = 30_000;

export async function createPaymentOrder(uid: string, bookingId: string): Promise<PaymentOrderResult> {
  const provider = getPaymentProvider();

  // Step 1 — claim (or reuse) the booking's single open payment.
  const claim = await db().runTransaction(async (tx) => {
    const booking = assertOwner(await getBooking(bookingId, tx), uid);
    const [existing, eventSnap] = await Promise.all([
      booking.paymentId ? getPayment(booking.paymentId, tx) : Promise.resolve(null),
      tx.get(sessionRef(booking.eventId)),
    ]);
    const now = serverNow();

    if (booking.status === "confirmed") {
      throw precondition("This booking is already paid.", "Open My bookings to see your tickets.");
    }
    const refusal = unpayableHold(booking, eventSnap.data() as EventDoc | undefined, now.toMillis());
    if (refusal) throw refusal;
    if (!(booking.amountMinor > 0)) throw precondition("This booking doesn't need a payment.");

    if (existing && existing.status === "created" && existing.providerOrderId) {
      return { reuse: existing };
    }
    if (existing && existing.status === "captured") {
      throw precondition("This booking is already paid.", "Open My bookings to see your tickets.");
    }
    if (existing && existing.status === "creating" && existing.creatingUntil && existing.creatingUntil.toMillis() > now.toMillis()) {
      throw new DomainError("CONTENTION", "We're already setting up your payment.", { nextStep: "Try again in a few seconds." });
    }

    // Reuse a stale 'creating' payment id (same receipt → provider dedupes);
    // a failed payment gets a fresh id so the customer can retry cleanly.
    const ref = existing && existing.status === "creating" ? paymentRef(existing.id) : db().collection(C.payments).doc();
    const payment: PaymentDoc = {
      id: ref.id,
      bookingId,
      orgId: booking.orgId ?? "",
      eventId: booking.eventId,
      customerUid: uid,
      provider: "razorpay",
      providerOrderId: null,
      providerPaymentId: null,
      amountMinor: booking.amountMinor,
      currency: booking.currency ?? CURRENCY,
      status: "creating",
      commissionBps: null,
      commissionMinor: null,
      refundedMinor: 0,
      creatingUntil: Timestamp.fromMillis(now.toMillis() + CREATE_LEASE_MS),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    tx.set(ref, payment);
    tx.update(bookingRef(bookingId), { paymentId: ref.id, updatedAt: now });
    return { create: payment };
  });

  if ("reuse" in claim && claim.reuse) {
    const p = claim.reuse;
    return orderResult(p, provider.keyId());
  }
  const p = (claim as { create: PaymentDoc }).create;

  // Step 2 — provider order (outside any transaction). receipt = paymentId.
  const { providerOrderId } = await provider.createOrder({
    amountMinor: p.amountMinor,
    currency: p.currency,
    receipt: p.id,
    notes: { paymentId: p.id, bookingId: p.bookingId, eventId: p.eventId },
  });

  // Step 3 — record the order.
  const recorded = await db().runTransaction(async (tx) => {
    const cur = await getPayment(p.id, tx);
    if (!cur) throw notFound("We couldn't find that payment.");
    if (cur.providerOrderId) return cur;
    const now = serverNow();
    const next = { ...cur, providerOrderId, status: cur.status === "creating" ? ("created" as const) : cur.status, creatingUntil: null, updatedAt: now };
    tx.update(paymentRef(p.id), {
      providerOrderId,
      status: next.status,
      creatingUntil: null,
      updatedAt: now,
    });
    writeAudit(tx, {
      action: "payment.order-created",
      actorUid: uid,
      actorRole: "customer",
      resourceType: "payment",
      resourceId: p.id,
      orgId: p.orgId,
      after: { providerOrderId, amountMinor: p.amountMinor, bookingId: p.bookingId },
    });
    return next;
  });
  return orderResult(recorded, provider.keyId());
}

/**
 * Why a held booking can't be paid for right now, in the customer's words,
 * or null when it can. `facts.reason` lets the app pick the right screen.
 * Checked before money moves, so nobody is charged for a hold that is gone
 * or an event that was called off (the capture path still refunds anything
 * that slips through: settleCapturedPayment).
 */
export function unpayableHold(booking: BookingDoc, event: EventDoc | undefined, nowMs: number): DomainError | null {
  const refuse = (reason: string, message: string, nextStep: string) =>
    new DomainError("PRECONDITION", message, { nextStep, facts: { reason } });
  if (booking.status === "cancelled") {
    return (booking as { cancelReason?: string }).cancelReason === "event-cancelled"
      ? refuse("event-cancelled", "This event was cancelled, so there's nothing to pay. You haven't been charged.", "Pick another experience.")
      : refuse("released", "These spots were released, so there's nothing to pay. You haven't been charged.", "Start a new booking if spots are still available.");
  }
  if (booking.status !== "held" || !booking.holdExpiresAt || booking.holdExpiresAt.toMillis() <= nowMs) {
    return refuse("hold-expired", "Your hold on these spots ran out, so they went back on sale. You haven't been charged.", "Start a new booking if spots are still available.");
  }
  if (!event || event.status === "cancelled") {
    return refuse("event-cancelled", "This event was cancelled, so there's nothing to pay. You haven't been charged.", "Pick another experience.");
  }
  return null;
}

function orderResult(p: PaymentDoc, keyId: string): PaymentOrderResult {
  return {
    paymentId: p.id,
    provider: "razorpay",
    providerOrderId: p.providerOrderId!,
    keyId,
    amountMinor: p.amountMinor,
    currency: p.currency,
  };
}

/* ============================================================ confirmPayment */

export interface ConfirmResult {
  bookingId: string;
  status: BookingDoc["status"];
  ticketIds: string[];
  refundId?: string | null;
}

export async function confirmPayment(
  uid: string,
  input: { paymentId: string; providerPaymentId: string; providerSignature: unknown }
): Promise<ConfirmResult> {
  const payment = await getPayment(input.paymentId);
  if (!payment || payment.customerUid !== uid) throw notFound("We couldn't find that payment.");
  if (!payment.providerOrderId || !verifyPaymentSignature(payment.providerOrderId, input.providerPaymentId, input.providerSignature)) {
    await db().runTransaction(async (tx) => {
      writeAudit(tx, {
        action: "payment.signature-rejected",
        actorUid: uid,
        actorRole: "customer",
        resourceType: "payment",
        resourceId: payment.id,
        orgId: payment.orgId,
        after: { providerPaymentId: input.providerPaymentId.slice(0, 64) },
      });
    });
    logWarn({ event: "security.payment-signature-rejected", uid, orgId: payment.orgId, paymentId: payment.id });
    throw new DomainError("NOT_PERMITTED", "We couldn't verify this payment.", {
      nextStep: "If money left your account, it will be confirmed automatically or refunded. Contact support if not.",
    });
  }
  // A verified checkout signature proves capture of this exact order, whose
  // amount we fixed server-side; the amount is therefore the order amount.
  const out = await settleCapturedPayment({
    paymentId: payment.id,
    providerOrderId: payment.providerOrderId,
    providerPaymentId: input.providerPaymentId,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    source: "client",
  });
  if (out.outcome === "amount-mismatch" || out.outcome === "order-mismatch" || out.outcome === "payment-reused") {
    throw precondition("We couldn't confirm this payment automatically.", "Our team has been alerted and will contact you.");
  }
  return { bookingId: out.bookingId, status: out.bookingStatus, ticketIds: out.ticketIds, refundId: out.refundId ?? null };
}

/* ============================================================ settlement of a capture */

export interface CaptureInput {
  paymentId: string;
  providerOrderId: string | null;
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  source: "client" | "webhook";
}

export type SettleOutcome =
  | "confirmed"
  | "readmitted"
  | "already-settled"
  | "orphaned"
  | "duplicate-capture"
  | "amount-mismatch"
  | "order-mismatch"
  | "payment-reused";

export interface SettleResult {
  outcome: SettleOutcome;
  bookingId: string;
  bookingStatus: BookingDoc["status"];
  ticketIds: string[];
  refundId?: string | null;
}

/**
 * THE capture transaction. Idempotent: any number of client confirmations and
 * webhook deliveries for the same provider payment settle exactly once.
 */
export async function settleCapturedPayment(input: CaptureInput): Promise<SettleResult> {
  const result = await db().runTransaction(async (tx): Promise<SettleResult> => {
    const payment = await getPayment(input.paymentId, tx);
    if (!payment) throw notFound("We couldn't find that payment.");
    const bRef = bookingRef(payment.bookingId);
    const eRef = sessionRef(payment.eventId);
    const lockRef = db().collection(C.bookingLocks).doc(bookingLockId(payment.eventId, payment.customerUid));
    const dupRefundId = `dup_${input.providerPaymentId}`.slice(0, 120);
    const [bSnap, eSnap, lockSnap, dupSnap, commSnap, claimSnap] = await Promise.all([
      tx.get(bRef),
      tx.get(eRef),
      tx.get(lockRef),
      tx.get(refundRef(dupRefundId)),
      tx.get(db().collection(C.eventCommercials).doc(payment.eventId)),
      tx.get(providerPaymentRef(input.providerPaymentId)),
    ]);
    if (!bSnap.exists || !eSnap.exists) throw notFound("We couldn't find that booking.");
    const booking = bSnap.data() as BookingDoc;
    const event = eSnap.data() as EventDoc;
    const lockBookingId = lockSnap.exists ? (lockSnap.data() as { bookingId?: string }).bookingId : undefined;
    let lockBooking: BookingDoc | undefined;
    if (lockBookingId && lockBookingId !== booking.id) {
      const s = await tx.get(bookingRef(lockBookingId));
      lockBooking = s.exists ? (s.data() as BookingDoc) : undefined;
    }

    const now = serverNow();
    const base = { bookingId: booking.id, bookingStatus: booking.status, ticketIds: booking.ticketIds ?? [] };

    /* ---- the capture must be for this payment's own order: before ANY branch ---- */
    // Both sides must be present: a payment whose order isn't recorded yet
    // ('creating') can't be matched, so it can't be settled.
    if (!input.providerOrderId || !payment.providerOrderId || input.providerOrderId !== payment.providerOrderId) {
      raiseRiskAlert(tx, `order-mismatch_${input.providerPaymentId}`, {
        kind: "payment-order-mismatch",
        severity: "high",
        orgId: payment.orgId,
        summary: "A capture referenced a different provider order than the payment record. Nothing was confirmed or refunded.",
        detail: { paymentId: payment.id, providerOrderId: input.providerOrderId, expected: payment.providerOrderId },
      });
      return { ...base, outcome: "order-mismatch" };
    }
    /* ---- one Razorpay payment settles one PULSE payment ---- */
    if (!claimAllows(claimSnap, "event", payment.id)) {
      raiseRiskAlert(tx, `payment-reused_${input.providerPaymentId}`, {
        kind: "payment-reused",
        severity: "high",
        orgId: payment.orgId,
        summary: "A provider payment already recorded against another PULSE payment was presented again. Nothing was confirmed.",
        detail: { paymentId: payment.id, providerPaymentId: input.providerPaymentId, claimedBy: claimSnap.data() ?? null },
      });
      return { ...base, outcome: "payment-reused" };
    }
    const claim = () => writeClaim(tx, claimSnap, input.providerPaymentId, { kind: "event", paymentId: payment.id, providerOrderId: payment.providerOrderId! });

    /* ---- already settled: replay is a no-op; a second capture waits for an admin ---- */
    if (payment.status === "captured" || payment.status === "refunded" || payment.status === "partially-refunded") {
      if (payment.providerPaymentId === input.providerPaymentId) return { ...base, outcome: "already-settled" };
      if (dupSnap.exists) return { ...base, outcome: "duplicate-capture", refundId: dupRefundId };
      // The same order was paid twice. The second charge never entered the
      // ledger, so its refund is ledger-neutral. It is never sent on its own:
      // an admin checks it first (decideRefund).
      const refund = newRefundDoc(dupRefundId, payment, {
        amountMinor: input.amountMinor,
        status: "under-review",
        reason: "duplicate-capture",
        requestedBy: "system",
        providerPaymentId: input.providerPaymentId,
        ledgerPosted: false,
      });
      tx.create(refundRef(dupRefundId), refund);
      claim();
      raiseRiskAlert(tx, `dup-capture_${input.providerPaymentId}`, {
        kind: "payment-duplicate-capture",
        severity: "high",
        orgId: payment.orgId,
        summary: "An order was paid twice. The second payment's refund waits for an admin in Refunds.",
        detail: { paymentId: payment.id, providerPaymentId: input.providerPaymentId, amountMinor: input.amountMinor, refundId: dupRefundId },
      });
      return { ...base, outcome: "duplicate-capture", refundId: dupRefundId };
    }

    /* ---- the provider must have charged exactly what we asked for ---- */
    if (input.amountMinor !== payment.amountMinor || input.currency !== payment.currency) {
      raiseRiskAlert(tx, `amount-mismatch_${input.providerPaymentId}`, {
        kind: "payment-amount-mismatch",
        severity: "high",
        orgId: payment.orgId,
        summary: "A captured payment did not match the booking amount. The booking was NOT confirmed.",
        detail: {
          paymentId: payment.id,
          providerPaymentId: input.providerPaymentId,
          expectedMinor: payment.amountMinor,
          receivedMinor: input.amountMinor,
          expectedCurrency: payment.currency,
          receivedCurrency: input.currency,
        },
      });
      tx.update(paymentRef(payment.id), { riskFlag: "amount-mismatch", updatedAt: now });
      return { ...base, outcome: "amount-mismatch" };
    }
    claim();

    // The booking's reservation-time snapshot is authoritative; the event's
    // current commercial doc is only a fallback for bookings made before
    // snapshots existed. Money has already moved at the provider, so a
    // missing rate can't block the capture — but it is never silent.
    const validBps = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 10_000;
    const snapshotBps = validBps(booking.commissionBps) ? booking.commissionBps : validBps(commSnap.data()?.commissionBps) ? (commSnap.data()!.commissionBps as number) : null;
    if (snapshotBps === null) {
      raiseRiskAlert(tx, `commission-missing_${payment.id}`, {
        kind: "capture-without-commission-terms",
        severity: "high",
        orgId: payment.orgId,
        summary: "A payment was captured with no agreed commission on the booking or event; it was recorded at 0% and needs an admin correction.",
        detail: { paymentId: payment.id, bookingId: booking.id, eventId: payment.eventId, amountMinor: payment.amountMinor },
      });
    }
    const bps = snapshotBps ?? 0;
    const commissionMinor = commissionFor(payment.amountMinor, bps);
    const captured: PaymentDoc = {
      ...payment,
      status: "captured",
      providerPaymentId: input.providerPaymentId,
      providerOrderId: payment.providerOrderId ?? input.providerOrderId,
      commissionBps: bps,
      commissionMinor,
      capturedAt: now,
      updatedAt: now,
    };
    const ledgerCtx = { orgId: payment.orgId, eventId: payment.eventId, bookingId: booking.id, paymentId: payment.id };
    postLedger(tx, `cap_${payment.id}`, "capture", ledgerCtx, captureLines(payment.amountMinor, commissionMinor), {
      txnGrossMinor: payment.amountMinor,
      txnCommissionMinor: commissionMinor,
    });

    let occupancy: OccupancyCounters = { ...EMPTY_OCCUPANCY, ...(event.occupancy ?? {}) };
    let outcome: SettleOutcome | null = null;

    // A hold the customer let go of (the app releases it when its timer runs
    // out or they leave checkout) is treated exactly like one the sweeper
    // expired: a payment that still lands is honoured if there's room.
    const releasedHold =
      booking.status === "cancelled" && (booking as { cancelReason?: string }).cancelReason === "hold-released";
    if (booking.status === "held" && event.status === "cancelled") {
      // The event was called off while this customer was paying, before the
      // cancellation fan-out reached the hold: never confirm (and notify "You're
      // in!") for an event that won't happen. Falls through to the refund.
      occupancy = applyHoldReleased(occupancy, booking.spots);
      outcome = null;
    } else if (booking.status === "held") {
      // The hold still owns its seats (even if it lapsed and wasn't swept yet).
      occupancy = applySeatConfirmed(occupancy, booking.spots);
      outcome = "confirmed";
    } else if (booking.status === "expired" || releasedHold) {
      // Late capture: re-admit only if the customer has no other live booking,
      // the event can still be attended, and capacity allows.
      const otherLive = lockBooking && isLiveBooking(lockBooking, now.toMillis());
      const eventOpen =
        (event.status === "published" || event.status === "booking-closed") &&
        (!event.startsAt || event.startsAt.toMillis() > now.toMillis());
      if (!otherLive && eventOpen) {
        const admission = admitSeats(deriveCapacityLedger(event.capacity, occupancy), "sellable", booking.spots);
        if (admission.admitted) {
          occupancy = applySeatsConfirmedDirect(occupancy, booking.spots);
          outcome = "readmitted";
        }
      }
    }

    if (outcome) {
      const ticketIds = issueTickets(tx, {
        bookingId: booking.id,
        eventId: booking.eventId,
        orgId: payment.orgId,
        customerUid: payment.customerUid,
        alias: booking.alias,
        reference: booking.reference ?? null,
        spots: booking.spots,
      });
      tx.set(paymentRef(payment.id), captured);
      tx.update(bRef, {
        status: "confirmed",
        paymentId: payment.id,
        ticketIds,
        confirmedAt: now,
        updatedAt: now,
        ...(outcome === "readmitted" ? { readmittedAt: now } : {}),
      });
      tx.update(eRef, { ...occupancyProjection(event.capacity, occupancy), updatedAt: now });
      if (outcome === "readmitted") {
        tx.set(lockRef, { eventId: booking.eventId, customerUid: payment.customerUid, bookingId: booking.id, updatedAt: now });
      }
      notify(tx, {
        recipientUid: payment.customerUid,
        kind: "booking-confirmed",
        title: "You're in!",
        body: `${booking.spots === 1 ? "Your spot" : `Your ${booking.spots} spots`} for ${event.title ?? "your event"} ${booking.spots === 1 ? "is" : "are"} confirmed.`,
        dedupeKey: booking.id,
        link: { type: "booking", id: booking.id },
      });
      writeAudit(tx, {
        action: outcome === "readmitted" ? "booking.confirmed-late-capture" : "booking.confirmed",
        actorUid: input.source === "webhook" ? "razorpay" : payment.customerUid,
        actorRole: input.source === "webhook" ? "system" : "customer",
        resourceType: "booking",
        resourceId: booking.id,
        orgId: payment.orgId,
        before: { status: booking.status },
        after: { status: "confirmed", paymentId: payment.id, amountMinor: payment.amountMinor, commissionMinor, tickets: ticketIds.length },
        source: input.source === "webhook" ? "webhook" : "pulse-app",
      });
      return { outcome, bookingId: booking.id, bookingStatus: "confirmed", ticketIds };
    }

    /* ---- orphaned: charged but no seat → full automatic refund ---- */
    const refundId = `orph_${payment.id}`;
    const refund = newRefundDoc(refundId, captured, {
      amountMinor: payment.amountMinor,
      status: "approved",
      reason: "payment-orphaned",
      requestedBy: "system",
      ledgerPosted: true,
    });
    // approveRefundInTx writes the payment patch; write the captured state first.
    tx.set(paymentRef(payment.id), captured);
    approveRefundInTx(tx, refund, { ...captured, refundedMinor: 0 }, { create: true, decidedBy: "system" });
    tx.update(bRef, { status: "payment-orphaned", paymentId: payment.id, updatedAt: now });
    const calledOff = event.status === "cancelled";
    // A still-held booking owned seats on the counters: give them back.
    if (booking.status === "held") tx.update(eRef, { ...occupancyProjection(event.capacity, occupancy), updatedAt: now });
    notify(tx, {
      recipientUid: payment.customerUid,
      kind: "refund-update",
      title: "Payment refunded",
      body: calledOff
        ? `${event.title ?? "This event"} was cancelled while you were paying. We're refunding your payment in full.`
        : "Your payment arrived after your spots were released, and the event had no room left. We're refunding it in full.",
      dedupeKey: refundId,
      link: { type: "booking", id: booking.id },
    });
    writeAudit(tx, {
      action: "booking.payment-orphaned",
      actorUid: input.source === "webhook" ? "razorpay" : payment.customerUid,
      actorRole: input.source === "webhook" ? "system" : "customer",
      resourceType: "booking",
      resourceId: booking.id,
      orgId: payment.orgId,
      before: { status: booking.status },
      after: { status: "payment-orphaned", refundId, amountMinor: payment.amountMinor },
      source: input.source === "webhook" ? "webhook" : "pulse-app",
    });
    return { outcome: "orphaned", bookingId: booking.id, bookingStatus: "payment-orphaned", ticketIds: [], refundId };
  });

  // Duplicate-capture refunds wait for an admin (decideRefund); only orphans go out at once.
  if (result.refundId && result.outcome === "orphaned") {
    await executeRefund(result.refundId);
  }
  return result;
}

/* ============================================================ payment.failed */

export async function markPaymentFailed(paymentId: string, providerPaymentId: string, reason: string): Promise<boolean> {
  return db().runTransaction(async (tx) => {
    const p = await getPayment(paymentId, tx);
    if (!p || (p.status !== "created" && p.status !== "creating")) return false;
    const now = serverNow();
    tx.update(paymentRef(paymentId), { status: "failed", lastError: reason.slice(0, 200), updatedAt: now });
    notify(tx, {
      recipientUid: p.customerUid,
      kind: "payment-failed",
      title: "Payment didn't go through",
      body: "No money was taken. Your spots are held for a few more minutes — try paying again.",
      dedupeKey: providerPaymentId || paymentId,
      link: { type: "booking", id: p.bookingId },
    });
    writeAudit(tx, {
      action: "payment.failed",
      actorUid: "razorpay",
      actorRole: "system",
      resourceType: "payment",
      resourceId: paymentId,
      orgId: p.orgId,
      after: { reason: reason.slice(0, 200) },
      source: "webhook",
    });
    return true;
  });
}

/**
 * Looks up our payment for a provider entity by its order id, which the server
 * set when it created the order. Payment notes are written by the payer at
 * checkout, so they never decide which payment is settled.
 */
export async function resolvePaymentId(entity: Record<string, unknown>): Promise<string | null> {
  if (typeof entity.order_id !== "string" || entity.order_id.length === 0) return null;
  const q = await db().collection(C.payments).where("providerOrderId", "==", entity.order_id).limit(1).get();
  return q.empty ? null : q.docs[0]!.id;
}
