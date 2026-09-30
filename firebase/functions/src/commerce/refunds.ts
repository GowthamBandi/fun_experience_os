/**
 * Cancellation and refunds (ADR-0005 "Refunds").
 *
 *  - quoteCancellation / cancelBooking: the customer's policy-driven path.
 *  - requestRefund: organizer member with `refunds.request` → under-review.
 *  - decideRefund: platform admins only; dual control above ₹10,000.
 *  - refundCancelledEvent: 100% refunds for every confirmed booking.
 *
 * Every seat released here goes through a transaction that mutates the
 * booking and the event counters together (ADR-0002 consequence).
 */

import { FieldValue, type Transaction } from "firebase-admin/firestore";
import { bookingRef, db, receiptRef, serverNow, sessionRef } from "../platform/firestore";
import { DomainError, notFound, precondition } from "../platform/errors";
import { writeAudit } from "../platform/audit";
import { notify } from "../platform/notify";
import {
  EMPTY_OCCUPANCY,
  applyConfirmedReleased,
  applyHoldReleased,
  occupancyProjection,
  type OccupancyCounters,
} from "../domain/capacity";
import { requirePermission, actorRole } from "../access/permissions";
import type { BookingDoc, EventDoc } from "../bookings/reserveSeat";
import { C, REFUND_DUAL_CONTROL_MINOR } from "./config";
import { cancellationPercent, refundAmount } from "./policy";
import { approveRefundInTx, executeRefund, newRefundDoc } from "./refundCore";
import { assertOwner, getBooking, getPayment, getRefund, raiseRiskAlert, refundRef, ticketRef } from "./shared";
import { logError } from "../platform/log";
import type { TicketDoc } from "./tickets";
import type { PaymentDoc, RefundDoc } from "./types";

/* ============================================================ quote */

export interface CancellationQuote {
  percent: number;
  amountMinor: number;
  reason: string;
}

function quoteFor(booking: BookingDoc, event: EventDoc, payment: PaymentDoc | null, nowMs: number): CancellationQuote {
  if (booking.status === "held") return { percent: 0, amountMinor: 0, reason: "hold-release" };
  if (booking.status !== "confirmed") return { percent: 0, amountMinor: 0, reason: "not-cancellable" };
  if (!event.startsAt || event.startsAt.toMillis() <= nowMs) return { percent: 0, amountMinor: 0, reason: "event-started" };
  if (!payment || (payment.status !== "captured" && payment.status !== "partially-refunded") || booking.amountMinor === 0) {
    return { percent: 0, amountMinor: 0, reason: "free-booking" };
  }
  const hours = (event.startsAt.toMillis() - nowMs) / 3_600_000;
  const percent = cancellationPercent(event.cancellationPolicy, hours);
  const paid = payment.amountMinor - (payment.refundedMinor ?? 0);
  return {
    percent,
    amountMinor: refundAmount(paid, percent),
    reason: percent === 0 ? `outside-policy:${event.cancellationPolicy ?? "strict"}` : `policy:${event.cancellationPolicy ?? "strict"}`,
  };
}

export async function quoteCancellation(uid: string, bookingId: string): Promise<CancellationQuote> {
  const booking = assertOwner(await getBooking(bookingId), uid);
  const eSnap = await sessionRef(booking.eventId).get();
  const payment = booking.paymentId ? await getPayment(booking.paymentId) : null;
  return quoteFor(booking, eSnap.data() as EventDoc, payment, Date.now());
}

/* ============================================================ helpers */

/** Releases a booking's seats on the event projection (hold or confirmed). */
function releaseSeats(occ: OccupancyCounters, b: BookingDoc): OccupancyCounters {
  if (b.status === "held") return applyHoldReleased(occ, b.spots);
  if (b.status === "confirmed") return applyConfirmedReleased(occ, b.kind ?? "sellable", b.spots);
  return occ;
}

async function readTickets(tx: Transaction, ids: string[]): Promise<TicketDoc[]> {
  if (!ids.length) return [];
  const snaps = await tx.getAll(...ids.map((id) => ticketRef(id)));
  return snaps.filter((s) => s.exists).map((s) => s.data() as TicketDoc);
}

/* ============================================================ cancelBooking */

export interface CancelResult {
  bookingId: string;
  status: "cancelled";
  refund: { refundId: string; amountMinor: number; status: RefundDoc["status"] } | null;
}

export async function cancelBooking(uid: string, bookingId: string, requestId: string): Promise<CancelResult> {
  const receipt = receiptRef(`cancelBooking_${uid}_${requestId}`);
  const result = await db().runTransaction(async (tx): Promise<CancelResult> => {
    const rSnap = await tx.get(receipt);
    if (rSnap.exists) return (rSnap.data() as { result: CancelResult }).result;

    const booking = assertOwner(await getBooking(bookingId, tx), uid);
    const eSnap = await tx.get(sessionRef(booking.eventId));
    const event = eSnap.data() as EventDoc;
    const payment = booking.paymentId ? await getPayment(booking.paymentId, tx) : null;
    const tickets = await readTickets(tx, booking.ticketIds ?? []);
    const refundId = `cxl_${bookingId}`;
    const existingRefund = await getRefund(refundId, tx);
    const now = serverNow();

    if (booking.status === "cancelled") {
      // Already cancelled by an earlier request: report the same outcome.
      return {
        bookingId,
        status: "cancelled",
        refund: existingRefund
          ? { refundId, amountMinor: existingRefund.amountMinor, status: existingRefund.status }
          : null,
      };
    }
    if (booking.status !== "held" && booking.status !== "confirmed") {
      throw precondition("This booking can't be cancelled.", "Open My bookings to see its status.");
    }
    if (booking.status === "confirmed" && event.startsAt && event.startsAt.toMillis() <= now.toMillis()) {
      throw precondition("This event has already started, so the booking can't be cancelled.", "Contact the organizer if something went wrong.");
    }
    if (tickets.some((t) => t.status === "used")) {
      throw precondition("A ticket from this booking has already been used, so it can't be cancelled.");
    }

    const quote = quoteFor(booking, event, payment, now.toMillis());
    const occ = releaseSeats({ ...EMPTY_OCCUPANCY, ...(event.occupancy ?? {}) }, booking);

    let refund: RefundDoc | null = null;
    if (quote.amountMinor > 0 && payment) {
      refund = approveRefundInTx(
        tx,
        newRefundDoc(refundId, payment, {
          amountMinor: quote.amountMinor,
          status: "approved",
          reason: "customer-cancellation",
          requestedBy: uid,
          note: `${quote.percent}% (${quote.reason})`,
          ledgerPosted: true,
        }),
        payment,
        { create: true, decidedBy: "policy" }
      );
    }

    for (const t of tickets) {
      if (t.status === "valid") {
        tx.update(ticketRef(t.ticketId), { status: refund ? "refunded" : "cancelled", updatedAt: now });
      }
    }
    tx.update(bookingRef(bookingId), {
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: uid,
      cancelReason: booking.status === "held" ? "hold-released" : quote.reason,
      refundedMinor: (booking.refundedMinor ?? 0) + (refund?.amountMinor ?? 0),
      updatedAt: now,
    });
    tx.update(sessionRef(booking.eventId), { ...occupancyProjection(event.capacity, occ), updatedAt: now });
    writeAudit(tx, {
      action: "booking.cancelled",
      actorUid: uid,
      actorRole: "customer",
      resourceType: "booking",
      resourceId: bookingId,
      orgId: booking.orgId,
      before: { status: booking.status },
      after: { status: "cancelled", percent: quote.percent, refundMinor: refund?.amountMinor ?? 0 },
      requestId,
    });
    if (refund) {
      notify(tx, {
        recipientUid: uid,
        kind: "refund-update",
        title: "Booking cancelled",
        body: `We're refunding ₹${(refund.amountMinor / 100).toFixed(2)} (${quote.percent}%) to your original payment method.`,
        dedupeKey: refundId,
        link: { type: "booking", id: bookingId },
      });
    }
    const out: CancelResult = {
      bookingId,
      status: "cancelled",
      refund: refund ? { refundId, amountMinor: refund.amountMinor, status: refund.status } : null,
    };
    tx.set(receipt, { command: "cancelBooking", actorUid: uid, requestId, result: out, at: now });
    return out;
  });

  if (result.refund && result.refund.status === "approved") {
    const status = await executeRefund(result.refund.refundId);
    if (status) result.refund = { ...result.refund, status };
  }
  return result;
}

/* ============================================================ requestRefund */

export async function requestRefund(
  uid: string,
  input: { requestId: string; orgId: string; bookingId: string; amountMinor: number; reason: string }
): Promise<{ refundId: string; status: RefundDoc["status"] }> {
  const booking = await getBooking(input.bookingId);
  if (!booking || booking.orgId !== input.orgId) throw notFound("We couldn't find that booking.");
  const membership = await requirePermission(uid, input.orgId, "refunds.request", { eventId: booking.eventId });
  const refundId = `req_${uid}_${input.requestId}`.slice(0, 150);

  return db().runTransaction(async (tx) => {
    const existing = await getRefund(refundId, tx);
    if (existing) return { refundId, status: existing.status };
    const b = (await getBooking(input.bookingId, tx))!;
    const payment = b.paymentId ? await getPayment(b.paymentId, tx) : null;
    if (!payment || (payment.status !== "captured" && payment.status !== "partially-refunded")) {
      throw precondition("This booking has no payment that can be refunded.");
    }
    const refundable = payment.amountMinor - (payment.refundedMinor ?? 0);
    if (input.amountMinor < 1 || input.amountMinor > refundable) {
      throw new DomainError("INVALID_INPUT", `The refund must be between ₹0.01 and ₹${(refundable / 100).toFixed(2)}.`);
    }
    const doc = newRefundDoc(refundId, payment, {
      amountMinor: input.amountMinor,
      status: "under-review",
      reason: "organizer-request",
      requestedBy: uid,
      note: input.reason,
      ledgerPosted: false,
    });
    tx.create(refundRef(refundId), doc);
    writeAudit(tx, {
      action: "refund.requested",
      actorUid: uid,
      actorRole: actorRole(membership),
      resourceType: "refund",
      resourceId: refundId,
      orgId: input.orgId,
      after: { amountMinor: input.amountMinor, bookingId: input.bookingId, status: "under-review" },
      reason: input.reason,
      requestId: input.requestId,
    });
    return { refundId, status: "under-review" as const };
  });
}

/* ============================================================ decideRefund */

export interface DecideRefundResult {
  refundId: string;
  status: RefundDoc["status"] | "awaiting-second-approval";
}

export async function decideRefund(
  admin: { uid: string; roleId: string },
  input: { requestId: string; refundId: string; decision: "approve" | "reject"; note: string }
): Promise<DecideRefundResult> {
  const receipt = receiptRef(`decideRefund_${admin.uid}_${input.requestId}`);
  const result = await db().runTransaction(async (tx): Promise<DecideRefundResult> => {
    const rSnap = await tx.get(receipt);
    if (rSnap.exists) return (rSnap.data() as { result: DecideRefundResult }).result;
    const refund = await getRefund(input.refundId, tx);
    if (!refund) throw notFound("We couldn't find that refund.");
    if (refund.status !== "under-review") {
      throw new DomainError("CONFLICT", "This refund has already been decided.", { nextStep: "Refresh to see its status." });
    }
    const payment = await getPayment(refund.paymentId, tx);
    const now = serverNow();
    const audit = (after: Record<string, unknown>) =>
      writeAudit(tx, {
        action: `refund.${input.decision}`,
        actorUid: admin.uid,
        actorRole: `platform:${admin.roleId}`,
        resourceType: "refund",
        resourceId: refund.id,
        orgId: refund.orgId,
        before: { status: refund.status, approvals: refund.approvals },
        after,
        reason: input.note,
        requestId: input.requestId,
        source: "operations-console",
      });

    let out: DecideRefundResult;
    if (input.decision === "reject") {
      tx.update(refundRef(refund.id), { status: "rejected", decidedBy: admin.uid, note: input.note, updatedAt: now });
      audit({ status: "rejected" });
      out = { refundId: refund.id, status: "rejected" };
    } else {
      if ((refund.approvals ?? []).includes(admin.uid)) {
        throw new DomainError("NOT_PERMITTED", "A different admin must give the second approval.", {
          nextStep: "Ask another Platform Owner or Super Admin to approve this refund.",
        });
      }
      const approvals = [...(refund.approvals ?? []), admin.uid];
      if (refund.amountMinor > REFUND_DUAL_CONTROL_MINOR && approvals.length < 2) {
        tx.update(refundRef(refund.id), { approvals, updatedAt: now });
        audit({ status: "under-review", approvals, awaiting: "second-approval" });
        out = { refundId: refund.id, status: "awaiting-second-approval" };
      } else {
        if (!payment || payment.amountMinor - (payment.refundedMinor ?? 0) < refund.amountMinor) {
          throw precondition("This refund is larger than what is left to refund on the payment.");
        }
        tx.update(refundRef(refund.id), { approvals });
        approveRefundInTx(tx, { ...refund, approvals }, payment, { create: false, decidedBy: admin.uid });
        tx.update(bookingRef(refund.bookingId), {
          refundedMinor: (payment.refundedMinor ?? 0) + refund.amountMinor,
          updatedAt: now,
        });
        notify(tx, {
          recipientUid: refund.customerUid,
          kind: "refund-update",
          title: "Refund approved",
          body: `A refund of ₹${(refund.amountMinor / 100).toFixed(2)} is on its way to you.`,
          dedupeKey: refund.id,
          link: { type: "booking", id: refund.bookingId },
        });
        audit({ status: "approved", approvals });
        out = { refundId: refund.id, status: "approved" };
      }
    }
    tx.set(receipt, { command: "decideRefund", actorUid: admin.uid, requestId: input.requestId, result: out, at: now });
    return out;
  });

  if (result.status === "approved") {
    const status = await executeRefund(result.refundId);
    if (status) return { ...result, status };
  }
  return result;
}

/* ============================================================ event cancelled */

export interface EventRefundSummary {
  eventId: string;
  bookingsCancelled: number;
  refundsIssued: number;
  refundIds: string[];
  /** Bookings that failed this pass (each has an `evc-failed_{bookingId}` risk alert). */
  failedBookingIds: string[];
}

/**
 * Cancels every live booking of a cancelled event: holds are released,
 * confirmed bookings get a 100% refund of what's left, tickets are voided,
 * attendees notified. Per-booking transactions; safe to run any number of times.
 */
export async function refundCancelledEvent(
  eventId: string,
  actor: { uid: string; role: string }
): Promise<EventRefundSummary> {
  const snap = await db()
    .collection(C.bookings)
    .where("eventId", "==", eventId)
    .where("status", "in", ["held", "confirmed"])
    .get();

  const summary: EventRefundSummary = { eventId, bookingsCancelled: 0, refundsIssued: 0, refundIds: [], failedBookingIds: [] };
  const errors: string[] = [];
  for (const d of snap.docs) {
    const refundId = `evc_${d.id}`;
    // Per-booking isolation: one booking that can never be processed must not
    // block every booking after it (on every retry, and for good once the
    // trigger's 24 h stale guard drops the event). It is recorded, alerted,
    // and the loop moves on; the aggregate error at the end makes the trigger
    // retry, and the retry skips what's already cancelled.
    let r: { refunded: boolean } | null;
    try {
      r = await db().runTransaction(async (tx) => {
        const b = await getBooking(d.id, tx);
        if (!b || (b.status !== "held" && b.status !== "confirmed")) return null;
        const eSnap = await tx.get(sessionRef(eventId));
        const event = eSnap.data() as EventDoc;
        const payment = b.paymentId ? await getPayment(b.paymentId, tx) : null;
        const tickets = await readTickets(tx, b.ticketIds ?? []);
        const existing = await getRefund(refundId, tx);
        const now = serverNow();

        let refund: RefundDoc | null = null;
        const refundable = payment ? payment.amountMinor - (payment.refundedMinor ?? 0) : 0;
        if (
          b.status === "confirmed" &&
          !existing &&
          payment &&
          (payment.status === "captured" || payment.status === "partially-refunded") &&
          refundable > 0
        ) {
          refund = approveRefundInTx(
            tx,
            newRefundDoc(refundId, payment, {
              amountMinor: refundable,
              status: "approved",
              reason: "event-cancelled",
              requestedBy: actor.uid,
              ledgerPosted: true,
            }),
            payment,
            { create: true, decidedBy: "policy" }
          );
        }
        for (const t of tickets) {
          if (t.status === "valid") tx.update(ticketRef(t.ticketId), { status: refund ? "refunded" : "cancelled", updatedAt: now });
        }
        const occ = releaseSeats({ ...EMPTY_OCCUPANCY, ...(event.occupancy ?? {}) }, b);
        tx.update(bookingRef(b.id), {
          status: "cancelled",
          cancelledAt: now,
          cancelledBy: actor.uid,
          cancelReason: "event-cancelled",
          refundedMinor: (b.refundedMinor ?? 0) + (refund?.amountMinor ?? 0),
          updatedAt: now,
        });
        tx.update(sessionRef(eventId), { ...occupancyProjection(event.capacity, occ), updatedAt: now });
        if (b.customerUid) {
          notify(tx, {
            recipientUid: b.customerUid,
            kind: "event-cancelled",
            title: "Event cancelled",
            body: refund
              ? `${event.title ?? "Your event"} was cancelled. We're refunding ₹${(refund.amountMinor / 100).toFixed(2)} in full.`
              : `${event.title ?? "Your event"} was cancelled.`,
            dedupeKey: eventId,
            link: { type: "event", id: eventId },
          });
        }
        writeAudit(tx, {
          action: "booking.cancelled-by-event",
          actorUid: actor.uid,
          actorRole: actor.role,
          resourceType: "booking",
          resourceId: b.id,
          orgId: b.orgId,
          before: { status: b.status },
          after: { status: "cancelled", refundMinor: refund?.amountMinor ?? 0 },
          source: "system",
        });
        return { refunded: !!refund };
      });
    } catch (e) {
      const message = String((e as Error)?.message ?? e).slice(0, 300);
      summary.failedBookingIds.push(d.id);
      errors.push(`${d.id}: ${message}`);
      logError({ event: "refund.event-cancel-booking-failed", eventId, bookingId: d.id, orgId: (d.data().orgId as string | undefined) ?? null, error: message });
      await raiseEventCancelFailure(eventId, d.id, (d.data().orgId as string | undefined) ?? null, message).catch((alertError: unknown) =>
        logError({ event: "refund.alert-write-failed", eventId, bookingId: d.id, error: String((alertError as Error)?.message ?? alertError).slice(0, 300) })
      );
      continue;
    }
    if (r) {
      summary.bookingsCancelled++;
      if (r.refunded) {
        summary.refundsIssued++;
        summary.refundIds.push(refundId);
      }
    }
  }
  // Provider calls after all bookings are settled in Firestore. executeRefund
  // records its own failures (refund stays `approved`; the sweeper retries).
  for (const id of summary.refundIds) {
    await executeRefund(id).catch((e: unknown) =>
      logError({ event: "refund.provider-error", refundId: id, eventId, error: String((e as Error)?.message ?? e).slice(0, 300) })
    );
  }
  if (errors.length) {
    throw new EventRefundIncompleteError(eventId, summary, errors);
  }
  return summary;
}

/** Some bookings of a cancelled event could not be processed (the rest were). */
export class EventRefundIncompleteError extends Error {
  constructor(
    public readonly eventId: string,
    public readonly summary: EventRefundSummary,
    errors: string[]
  ) {
    super(`Event ${eventId}: ${errors.length} booking(s) could not be cancelled/refunded: ${errors.slice(0, 5).join("; ")}`);
    this.name = "EventRefundIncompleteError";
  }
}

export const eventCancelFailureAlertId = (bookingId: string) => `evc-failed_${bookingId}`;

/**
 * Upserts the console alert for a booking the cancellation fan-out couldn't
 * process. Deterministic id, so retries update one alert (occurrences, last
 * error) instead of opening a new one, and never reopen one an admin resolved.
 */
async function raiseEventCancelFailure(eventId: string, bookingId: string, orgId: string | null, message: string): Promise<void> {
  const ref = db().collection(C.riskAlerts).doc(eventCancelFailureAlertId(bookingId));
  await db().runTransaction(async (tx) => {
    const cur = await tx.get(ref);
    if (!cur.exists) {
      raiseRiskAlert(tx, ref.id, {
        kind: "event-cancel-refund-failed",
        severity: "high",
        orgId,
        summary: "A booking of a cancelled event could not be cancelled/refunded automatically and needs manual action.",
        detail: { eventId, bookingId, lastError: message, occurrences: 1 },
      });
      return;
    }
    tx.update(ref, {
      "detail.lastError": message,
      "detail.occurrences": FieldValue.increment(1),
      lastSeenAt: serverNow(),
    });
  });
}

/**
 * The onEventCancelled trigger gave up on an event (its retries went on past
 * the 24 h stale guard): bookings may still be live and unrefunded. Raised
 * once per event for the console.
 */
export async function raiseEventCancelDropped(eventId: string, orgId: string | null, ageMs: number): Promise<void> {
  await db().runTransaction(async (tx) => {
    const ref = db().collection(C.riskAlerts).doc(`evc-dropped_${eventId}`);
    if ((await tx.get(ref)).exists) return;
    raiseRiskAlert(tx, ref.id, {
      kind: "event-cancel-refund-dropped",
      severity: "high",
      orgId,
      summary: "Automatic refunds for a cancelled event stopped retrying after 24 hours. Check its bookings and refund any still live.",
      detail: { eventId, ageMs },
    });
  });
}

