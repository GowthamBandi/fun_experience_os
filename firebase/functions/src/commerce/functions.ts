/**
 * Commerce Cloud Functions (docs/API_CONTRACT.md "Commerce").
 * Region asia-south1; App Check enforced outside the emulator (callable()).
 */

import * as functions from "firebase-functions/v1";
import { callable, compositeId, docId, int, obj, oneOf, requestId, str, optStr } from "../platform/callable";
import { requirePhoneUser, requireUser } from "../platform/actors";
import { requireAdmin } from "../platform/auth";
import { consumeRateLimit } from "../platform/rateLimit";
import { DomainError } from "../platform/errors";
import { SECRET_NAMES, isEmulator, type SecretName } from "../platform/security";
import { reserveSeat as reserveSeatTx } from "../bookings/reserveSeat";
import { MAX_SPOTS_PER_BOOKING } from "../domain/capacity";
import { RATE_LIMITS } from "./config";
import { confirmPayment as confirmPaymentSvc, createPaymentOrder as createPaymentOrderSvc } from "./payments";
import {
  cancelBooking as cancelBookingSvc,
  decideRefund as decideRefundSvc,
  quoteCancellation as quoteCancellationSvc,
  refundCancelledEvent,
  requestRefund as requestRefundSvc,
} from "./refunds";
import { scanTicket as scanTicketSvc } from "./scan";
import { checkInManually as checkInManuallySvc, listEventAttendees as listEventAttendeesSvc } from "./checkin";
import { buildSettlement as buildSettlementSvc, decideSettlement as decideSettlementSvc } from "./settlements";
import { releaseExpiredHolds as releaseExpiredHoldsSvc } from "./holds";
import { PAYOUT_CADENCES, decideCommercialAgreement as decideCommercialAgreementSvc, proposeCommercialAgreement as proposeCommercialAgreementSvc } from "./agreements";
import { retryApprovedRefunds } from "./refundCore";
import { sendEventReminders as sendEventRemindersSvc } from "./reminders";
import { handleRazorpayWebhook } from "./webhook";
import { isStaleEvent, runJob } from "../platform/jobs";
import { logError, logInfo } from "../platform/log";

const REGION = "asia-south1";
const RZP: SecretName[] = [SECRET_NAMES.razorpayKeyId, SECRET_NAMES.razorpayKeySecret];
const TICKET: SecretName[] = [SECRET_NAMES.ticketKey];
const bind = (s: SecretName[]) => (isEmulator() ? [] : s);

/* ---------------------------------------------------------------- customer */

export const reserveSeat = callable(
  async (data, context) => {
    const actor = requirePhoneUser(context);
    const d = obj(data);
    const rid = requestId(d.requestId);
    const eventId = docId(d.eventId, "eventId");
    const spots = int(d.spots ?? 1, "spots", 1, MAX_SPOTS_PER_BOOKING);
    const alias = str(d.alias, "Display name", 2, 40);
    await consumeRateLimit({
      bucket: `reserve_${actor.uid}`,
      ...RATE_LIMITS.reserve,
      message: "Too many booking attempts. Please wait a few minutes.",
    });
    const r = await reserveSeatTx({
      requestId: rid,
      eventId,
      alias,
      spots,
      kind: "sellable",
      actor: { uid: actor.uid, roleId: "customer" },
      customerUid: actor.uid,
      source: "customer-app",
    });
    return {
      bookingId: r.bookingId,
      status: r.status,
      holdExpiresAt: r.holdExpiresAt,
      amountMinor: r.amountMinor,
      currency: r.currency,
      spots: r.spots,
      ticketIds: r.ticketIds,
    };
  },
  { secrets: TICKET }
);

export const createPaymentOrder = callable(
  async (data, context) => {
    const actor = requirePhoneUser(context);
    const d = obj(data);
    requestId(d.requestId);
    const bookingId = docId(d.bookingId, "bookingId");
    await consumeRateLimit({ bucket: `payorder_${actor.uid}`, ...RATE_LIMITS.paymentOrder });
    return createPaymentOrderSvc(actor.uid, bookingId);
  },
  { secrets: RZP }
);

export const confirmPayment = callable(
  async (data, context) => {
    const actor = requirePhoneUser(context);
    const d = obj(data);
    const paymentId = docId(d.paymentId, "paymentId");
    const providerPaymentId = str(d.providerPaymentId, "providerPaymentId", 4, 64);
    if (!/^[A-Za-z0-9_]+$/.test(providerPaymentId)) throw new DomainError("INVALID_INPUT", "providerPaymentId is not valid.");
    const providerSignature = str(d.providerSignature, "providerSignature", 64, 64);
    await consumeRateLimit({ bucket: `confirmpay_${actor.uid}`, ...RATE_LIMITS.confirmPayment });
    return confirmPaymentSvc(actor.uid, { paymentId, providerPaymentId, providerSignature });
  },
  { secrets: [...RZP, ...TICKET] }
);

export const quoteCancellation = callable(async (data, context) => {
  const actor = requirePhoneUser(context);
  const d = obj(data);
  await consumeRateLimit({ bucket: `quote_${actor.uid}`, ...RATE_LIMITS.quote });
  return quoteCancellationSvc(actor.uid, docId(d.bookingId, "bookingId"));
});

export const cancelBooking = callable(
  async (data, context) => {
    const actor = requirePhoneUser(context);
    const d = obj(data);
    const rid = requestId(d.requestId);
    const bookingId = docId(d.bookingId, "bookingId");
    await consumeRateLimit({ bucket: `cancel_${actor.uid}`, ...RATE_LIMITS.cancel });
    const r = await cancelBookingSvc(actor.uid, bookingId, rid);
    return { bookingId: r.bookingId, status: r.status, refund: r.refund };
  },
  { secrets: RZP }
);

/* ------------------------------------------------------------- organizer */

export const requestRefund = callable(async (data, context) => {
  const actor = requirePhoneUser(context);
  const d = obj(data);
  await consumeRateLimit({
    bucket: `refundreq_${actor.uid}`,
    ...RATE_LIMITS.refundRequest,
    message: "You've requested a lot of refunds recently. Please wait a while and try again.",
  });
  return requestRefundSvc(actor.uid, {
    requestId: requestId(d.requestId),
    orgId: docId(d.orgId, "orgId"),
    bookingId: docId(d.bookingId, "bookingId"),
    amountMinor: int(d.amountMinor, "amountMinor", 1, 100_000_000),
    reason: str(d.reason, "Reason", 3, 500),
  });
});

export const scanTicket = callable(
  async (data, context) => {
    const actor = requireUser(context);
    const d = obj(data);
    return scanTicketSvc(actor.uid, {
      requestId: requestId(d.requestId),
      eventId: docId(d.eventId, "eventId"),
      payload: str(d.payload, "payload", 1, 200),
    });
  },
  { secrets: TICKET }
);

export const checkInManually = callable(async (data, context) => {
  const actor = requireUser(context);
  const d = obj(data);
  return checkInManuallySvc(actor.uid, {
    requestId: requestId(d.requestId),
    eventId: docId(d.eventId, "eventId"),
    ticketId: docId(d.ticketId, "ticketId"),
    reason: str(d.reason, "Reason", 10, 300),
  });
});

export const listEventAttendees = callable(async (data, context) => {
  const actor = requireUser(context);
  const d = obj(data);
  await consumeRateLimit({ bucket: `attendees_${actor.uid}`, ...RATE_LIMITS.attendees });
  return listEventAttendeesSvc(actor.uid, {
    orgId: docId(d.orgId, "orgId"),
    eventId: docId(d.eventId, "eventId"),
  });
});

/* ----------------------------------------------------------------- admins */

export const decideRefund = callable(
  async (data, context) => {
    const admin = requireAdmin(context, "refunds.decide");
    const d = obj(data);
    return decideRefundSvc(admin, {
      requestId: requestId(d.requestId),
      refundId: compositeId(d.refundId, "refundId"),
      decision: oneOf(d.decision, "decision", ["approve", "reject"] as const),
      note: str(d.note, "Note", 3, 500),
    });
  },
  { secrets: RZP }
);

export const buildSettlement = callable(async (data, context) => {
  const admin = requireAdmin(context, "settlements.build");
  const d = obj(data);
  const periodEnd = new Date(str(d.periodEnd, "periodEnd", 10, 40));
  if (Number.isNaN(periodEnd.getTime()) || periodEnd.getTime() > Date.now()) {
    throw new DomainError("INVALID_INPUT", "periodEnd must be a date in the past.");
  }
  return buildSettlementSvc(admin, { requestId: requestId(d.requestId), orgId: docId(d.orgId, "orgId"), periodEnd });
});

export const proposeCommercialAgreement = callable(async (data, context) => {
  const admin = requireAdmin(context, "commercials.propose");
  const d = obj(data);
  return proposeCommercialAgreementSvc(admin, {
    requestId: requestId(d.requestId),
    orgId: docId(d.orgId, "orgId"),
    commissionBps: int(d.commissionBps, "commissionBps", 0, 5_000),
    payoutCadence: oneOf(d.payoutCadence, "payoutCadence", PAYOUT_CADENCES),
    note: str(d.note, "Note", 3, 500),
  });
});

export const decideCommercialAgreement = callable(async (data, context) => {
  const admin = requireAdmin(context, "commercials.decide");
  const d = obj(data);
  return decideCommercialAgreementSvc(admin, {
    requestId: requestId(d.requestId),
    agreementId: docId(d.agreementId, "agreementId"),
    action: oneOf(d.action, "action", ["approve", "reject"] as const),
    note: str(d.note, "Note", 3, 500),
  });
});

export const decideSettlement = callable(async (data, context) => {
  const admin = requireAdmin(context, "settlements.decide");
  const d = obj(data);
  return decideSettlementSvc(admin, {
    requestId: requestId(d.requestId),
    settlementId: compositeId(d.settlementId, "settlementId"),
    action: oneOf(d.action, "action", ["approve", "hold", "release-hold", "mark-paid"] as const),
    note: str(d.note, "Note", 3, 500),
    payoutReference: optStr(d.payoutReference, "payoutReference", 100),
  });
});

/* ------------------------------------------------------------------ HTTP */

export const razorpayWebhook = functions
  .region(REGION)
  .runWith({ secrets: bind([SECRET_NAMES.razorpayWebhookSecret, ...RZP, ...TICKET]) })
  .https.onRequest(async (req, res) => {
    await handleRazorpayWebhook(req, res);
  });

/* ------------------------------------------------------------- schedules */

// Scheduled jobs are NOT retried (no failurePolicy): the next run is at most
// 15 minutes away and every step resumes where the last one stopped. Each run
// is summarised in jobRuns/{job}_{date} and logged (platform/jobs.ts).

export const releaseExpiredHolds = functions
  .region(REGION)
  .runWith({ secrets: bind(RZP), timeoutSeconds: 240 })
  .pubsub.schedule("every 5 minutes")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    await runJob("releaseExpiredHolds", {
      holds: async () => {
        const out = await releaseExpiredHoldsSvc();
        if (out.failed > 0) throw new Error(`${out.failed} of ${out.scanned} holds could not be released`);
        return out;
      },
      // Approved refunds whose provider call failed: retried here so a
      // provider outage heals without an operator.
      refundRetry: async () => ({ retried: await retryApprovedRefunds() }),
    });
  });

export const sendEventReminders = functions
  .region(REGION)
  .runWith({ timeoutSeconds: 300 })
  .pubsub.schedule("every 15 minutes")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    await runJob("sendEventReminders", { reminders: () => sendEventRemindersSvc() });
  });

/* -------------------------------------------------------------- triggers */

/**
 * Event cancellation fan-out: cancel + refund every live booking.
 * RETRIED (failurePolicy): refundCancelledEvent is idempotent (deterministic
 * refund ids, per-booking transactions that skip already-cancelled bookings),
 * so a crash or timeout part-way resumes on retry instead of stranding
 * customers. Events older than 24 h are dropped with an ERROR log rather than
 * retried forever.
 */
export const onEventCancelled = functions
  .region(REGION)
  .runWith({ secrets: bind(RZP), failurePolicy: true, timeoutSeconds: 540, memory: "512MB" })
  .firestore.document("events/{eventId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data() as { status?: string } | undefined;
    const after = change.after.data() as { status?: string; cancelledBy?: string; orgId?: string } | undefined;
    if (before?.status === "cancelled" || after?.status !== "cancelled") return;
    const eventId = context.params.eventId as string;
    if (isStaleEvent(context.timestamp, 24 * 3_600_000, { job: "onEventCancelled", eventId, orgId: after.orgId ?? null })) return;
    try {
      const out = await refundCancelledEvent(eventId, {
        uid: typeof after.cancelledBy === "string" ? after.cancelledBy : "system",
        role: "system",
      });
      logInfo({
        event: "job.completed",
        job: "onEventCancelled",
        eventId,
        orgId: after.orgId ?? null,
        bookingsCancelled: out.bookingsCancelled,
        refundsIssued: out.refundsIssued,
      });
    } catch (e) {
      logError({ event: "job.failed", job: "onEventCancelled", eventId, orgId: after.orgId ?? null, error: String((e as Error)?.message ?? e), willRetry: true });
      throw e;
    }
  });
