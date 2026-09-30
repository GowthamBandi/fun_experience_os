/**
 * Commerce Cloud Functions (docs/API_CONTRACT.md "Commerce").
 * Region asia-south1; App Check enforced outside the emulator (callable()).
 */

import * as functions from "firebase-functions/v1";
import { callable, docId, int, obj, oneOf, requestId, str, optStr } from "../platform/callable";
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
import { buildSettlement as buildSettlementSvc, decideSettlement as decideSettlementSvc } from "./settlements";
import { releaseExpiredHolds as releaseExpiredHoldsSvc } from "./holds";
import { retryApprovedRefunds } from "./refundCore";
import { sendEventReminders as sendEventRemindersSvc } from "./reminders";
import { handleRazorpayWebhook } from "./webhook";

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

/* ----------------------------------------------------------------- admins */

export const decideRefund = callable(
  async (data, context) => {
    const admin = requireAdmin(context, "refunds.decide");
    const d = obj(data);
    return decideRefundSvc(admin, {
      requestId: requestId(d.requestId),
      refundId: str(d.refundId, "refundId", 4, 150),
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

export const decideSettlement = callable(async (data, context) => {
  const admin = requireAdmin(context, "settlements.decide");
  const d = obj(data);
  return decideSettlementSvc(admin, {
    requestId: requestId(d.requestId),
    settlementId: str(d.settlementId, "settlementId", 4, 150),
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

export const releaseExpiredHolds = functions
  .region(REGION)
  .runWith({ secrets: bind(RZP) })
  .pubsub.schedule("every 5 minutes")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const holds = await releaseExpiredHoldsSvc();
    const refunds = await retryApprovedRefunds();
    functions.logger.info("releaseExpiredHolds", { ...holds, refundsRetried: refunds });
  });

export const sendEventReminders = functions
  .region(REGION)
  .pubsub.schedule("every 15 minutes")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const out = await sendEventRemindersSvc();
    functions.logger.info("sendEventReminders", out);
  });

/* -------------------------------------------------------------- triggers */

export const onEventCancelled = functions
  .region(REGION)
  .runWith({ secrets: bind(RZP) })
  .firestore.document("events/{eventId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data() as { status?: string } | undefined;
    const after = change.after.data() as { status?: string; cancelledBy?: string } | undefined;
    if (before?.status === "cancelled" || after?.status !== "cancelled") return;
    const out = await refundCancelledEvent(context.params.eventId, {
      uid: typeof after.cancelledBy === "string" ? after.cancelledBy : "system",
      role: "system",
    });
    functions.logger.info("onEventCancelled", out);
  });
