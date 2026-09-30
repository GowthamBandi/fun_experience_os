/**
 * Razorpay webhook (ADR-0005 step 3).
 *
 *  - 400 when `X-Razorpay-Signature` is not HMAC_SHA256(webhook_secret, rawBody).
 *  - Deduplicated by `x-razorpay-event-id` into `paymentEvents/{id}`; a
 *    duplicate always answers 200 and changes nothing.
 *  - Handles payment.captured, payment.failed, refund.processed, refund.failed.
 *  - Answers 500 on an internal failure so Razorpay retries (every handler is
 *    idempotent, so a retry is always safe).
 */

import { createHash } from "node:crypto";
import { logError, logWarn } from "../platform/log";
import { db, serverNow } from "../platform/firestore";
import { C } from "./config";
import { verifyWebhookSignature } from "./provider";
import { markPaymentFailed, resolvePaymentId, settleCapturedPayment } from "./payments";
import { completeRefundFromProvider } from "./refundCore";

export interface WebhookRequest {
  method?: string;
  rawBody?: Buffer;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
}

export interface WebhookResponse {
  status(code: number): WebhookResponse;
  json(body: unknown): unknown;
  send(body?: unknown): unknown;
}

function header(req: WebhookRequest, name: string): string | undefined {
  const v = req.headers[name] ?? req.headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

type Entity = Record<string, unknown> & { notes?: Record<string, unknown> };

export async function handleRazorpayWebhook(req: WebhookRequest, res: WebhookResponse): Promise<void> {
  if (req.method && req.method !== "POST") {
    res.status(405).json({ ok: false });
    return;
  }
  const raw = req.rawBody;
  if (!verifyWebhookSignature(raw, header(req, "x-razorpay-signature"))) {
    // Security signal: forged/misconfigured sender. Never log the body or
    // the presented signature.
    logWarn({
      event: "security.webhook-signature-rejected",
      provider: "razorpay",
      signaturePresent: !!header(req, "x-razorpay-signature"),
      bytes: raw?.length ?? 0,
    });
    res.status(400).json({ ok: false, error: "invalid-signature" });
    return;
  }

  let body: { event?: string; payload?: Record<string, { entity?: Entity }> };
  try {
    body = JSON.parse(raw!.toString("utf8"));
  } catch {
    res.status(400).json({ ok: false, error: "invalid-body" });
    return;
  }

  const eventId =
    (header(req, "x-razorpay-event-id") ?? "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 128) ||
    `sha256_${createHash("sha256").update(raw!).digest("hex")}`;
  const dedupeRef = db().collection(C.paymentEvents).doc(eventId);

  if ((await dedupeRef.get()).exists) {
    res.status(200).json({ ok: true, duplicate: true });
    return;
  }

  let outcome: string;
  try {
    outcome = await dispatch(body);
  } catch (e) {
    logError({ event: "webhook.handler-failed", provider: "razorpay", providerEventId: eventId, type: body.event ?? null, error: String((e as Error)?.message ?? e).slice(0, 300) });
    res.status(500).json({ ok: false });
    return;
  }

  try {
    await dedupeRef.create({ eventId, type: body.event ?? null, outcome, receivedAt: serverNow() });
  } catch {
    // A concurrent delivery recorded it first — both were idempotent.
    res.status(200).json({ ok: true, duplicate: true });
    return;
  }
  res.status(200).json({ ok: true, outcome });
}

async function dispatch(body: { event?: string; payload?: Record<string, { entity?: Entity }> }): Promise<string> {
  const payment = body.payload?.payment?.entity;
  const refund = body.payload?.refund?.entity;
  switch (body.event) {
    case "payment.captured": {
      if (!payment) return "ignored:no-entity";
      const paymentId = await resolvePaymentId(payment);
      if (!paymentId) return "ignored:unknown-payment";
      const out = await settleCapturedPayment({
        paymentId,
        providerOrderId: typeof payment.order_id === "string" ? payment.order_id : null,
        providerPaymentId: String(payment.id ?? ""),
        amountMinor: Number(payment.amount),
        currency: String(payment.currency ?? ""),
        source: "webhook",
      });
      return out.outcome;
    }
    case "payment.failed": {
      if (!payment) return "ignored:no-entity";
      const paymentId = await resolvePaymentId(payment);
      if (!paymentId) return "ignored:unknown-payment";
      const changed = await markPaymentFailed(paymentId, String(payment.id ?? ""), String(payment.error_description ?? "failed"));
      return changed ? "failed" : "ignored:not-open";
    }
    case "refund.processed":
    case "refund.failed": {
      if (!refund) return "ignored:no-entity";
      const refundId = await resolveRefundId(refund);
      if (!refundId) return "ignored:unknown-refund";
      return completeRefundFromProvider(
        refundId,
        typeof refund.id === "string" ? refund.id : null,
        body.event === "refund.processed" ? "processed" : "failed"
      );
    }
    default:
      return "ignored:event-type";
  }
}

async function resolveRefundId(entity: Entity): Promise<string | null> {
  const notes = (entity.notes ?? {}) as Record<string, unknown>;
  if (typeof notes.refundId === "string" && /^[A-Za-z0-9_-]{4,128}$/.test(notes.refundId)) {
    const s = await db().collection(C.refunds).doc(notes.refundId).get();
    if (s.exists) return s.id;
  }
  if (typeof entity.id === "string") {
    const q = await db().collection(C.refunds).where("providerRefundId", "==", entity.id).limit(1).get();
    if (!q.empty) return q.docs[0]!.id;
  }
  return null;
}
