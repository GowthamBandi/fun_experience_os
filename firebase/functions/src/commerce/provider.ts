/**
 * Payment provider boundary (ADR-0005).
 *
 * `RazorpayProvider` makes real REST calls with keys from Firebase secrets.
 * `EmulatorProvider` fabricates provider ids locally and is selectable ONLY
 * when `FUNCTIONS_EMULATOR === "true"` — a production deploy can never pick it,
 * even if FIRESTORE_EMULATOR_HOST leaked into the environment.
 *
 * Signature verification is provider-independent and always uses the real
 * algorithm (HMAC-SHA256 + constant-time compare). In the emulator the secrets
 * resolve to the dev values from `secret()`, so tests can mint both valid and
 * forged signatures.
 */

import { createHmac, randomBytes } from "node:crypto";
import { DomainError } from "../platform/errors";
import { SECRET_NAMES, hmacHex, safeEqual, secret } from "../platform/security";

export interface CreateOrderInput {
  amountMinor: number;
  currency: string;
  /** Our paymentId — Razorpay `receipt`, and the idempotency key. */
  receipt: string;
  notes: Record<string, string>;
}

export interface RefundInput {
  providerPaymentId: string;
  amountMinor: number;
  /** Our refundId — idempotency key and `receipt`. */
  refundId: string;
  notes: Record<string, string>;
}

export interface ProviderRefund {
  providerRefundId: string;
  /** Razorpay returns `pending` (normal speed) or `processed`. */
  status: "pending" | "processed" | "failed";
}

/** The provider's own record of a payment (Razorpay GET /payments/{id}). */
export interface ProviderPayment {
  providerPaymentId: string;
  /** Razorpay: created | authorized | captured | refunded | failed. */
  status: string;
  orderId: string | null;
  amountMinor: number;
  currency: string;
}

/** A refund the provider already holds for a payment (GET /payments/{id}/refunds). */
export interface ProviderRefundRecord {
  providerRefundId: string;
  amountMinor: number;
  status: ProviderRefund["status"];
  notes: Record<string, string>;
}

export interface PaymentProvider {
  readonly name: "razorpay";
  readonly mode: "live" | "emulator";
  keyId(): string;
  createOrder(input: CreateOrderInput): Promise<{ providerOrderId: string }>;
  refund(input: RefundInput): Promise<ProviderRefund>;
  /** The provider's record of a payment, or null when it doesn't know the id. */
  fetchPayment(providerPaymentId: string): Promise<ProviderPayment | null>;
  /** Refunds the provider already holds for a payment. */
  listRefunds(providerPaymentId: string): Promise<ProviderRefundRecord[]>;
}

/* ------------------------------------------------------------ signatures */

/** Checkout signature: HMAC_SHA256(key_secret, order_id + "|" + payment_id). */
function checkoutSignature(orderId: string, paymentId: string): string {
  return hmacHex(secret(SECRET_NAMES.razorpayKeySecret), `${orderId}|${paymentId}`);
}

/**
 * Mints a checkout signature, as Razorpay does when payment [paymentId] of
 * [orderId] succeeds. In the emulator it also records that captured payment,
 * so fetchPayment answers for it like Razorpay would. Production code only
 * verifies (verifyPaymentSignature); tests mint.
 */
export function paymentSignature(orderId: string, paymentId: string): string {
  if (providerIsEmulated()) emulatorProvider().recordCheckout(orderId, paymentId);
  return checkoutSignature(orderId, paymentId);
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: unknown): boolean {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  return safeEqual(checkoutSignature(orderId, paymentId), signature.toLowerCase());
}

/** Webhook signature: HMAC_SHA256(webhook_secret, raw request body). */
export function webhookSignature(rawBody: Buffer | string): string {
  // HMAC over the exact bytes received — never a re-serialised JSON body.
  return createHmac("sha256", secret(SECRET_NAMES.razorpayWebhookSecret)).update(rawBody).digest("hex");
}

export function verifyWebhookSignature(rawBody: Buffer | undefined, signature: unknown): boolean {
  if (!rawBody || typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  return safeEqual(webhookSignature(rawBody), signature.toLowerCase());
}

/* -------------------------------------------------------------- razorpay */

const RAZORPAY_API = "https://api.razorpay.com/v1";

export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  readonly mode = "live" as const;

  keyId(): string {
    return secret(SECRET_NAMES.razorpayKeyId);
  }

  private auth(): string {
    return Buffer.from(`${this.keyId()}:${secret(SECRET_NAMES.razorpayKeySecret)}`).toString("base64");
  }

  /** GET; null on 404. */
  private async get<T>(path: string): Promise<T | null> {
    let res: Response;
    try {
      res = await fetch(`${RAZORPAY_API}${path}`, {
        method: "GET",
        headers: { Authorization: `Basic ${this.auth()}` },
        signal: AbortSignal.timeout(15_000),
      });
    } catch (cause) {
      throw providerUnavailable({ path, cause: String(cause) });
    }
    const text = await res.text();
    if (res.status === 404) return null;
    if (!res.ok) throw providerUnavailable({ path, status: res.status, body: text.slice(0, 500) });
    return JSON.parse(text) as T;
  }

  private async post<T>(path: string, body: unknown, idempotencyKey: string): Promise<T> {
    const auth = this.auth();
    let res: Response;
    try {
      res = await fetch(`${RAZORPAY_API}${path}`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/json",
          "X-Razorpay-Idempotency": idempotencyKey,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (cause) {
      throw providerUnavailable({ path, cause: String(cause) });
    }
    const text = await res.text();
    if (!res.ok) {
      throw providerUnavailable({ path, status: res.status, body: text.slice(0, 500) });
    }
    return JSON.parse(text) as T;
  }

  async createOrder(input: CreateOrderInput): Promise<{ providerOrderId: string }> {
    const out = await this.post<{ id: string }>(
      "/orders",
      { amount: input.amountMinor, currency: input.currency, receipt: input.receipt, notes: input.notes },
      input.receipt
    );
    return { providerOrderId: out.id };
  }

  async refund(input: RefundInput): Promise<ProviderRefund> {
    const out = await this.post<{ id: string; status: string }>(
      `/payments/${encodeURIComponent(input.providerPaymentId)}/refund`,
      { amount: input.amountMinor, speed: "normal", receipt: input.refundId, notes: input.notes },
      input.refundId
    );
    return { providerRefundId: out.id, status: refundStatus(out.status) };
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPayment | null> {
    const p = await this.get<{ id: string; status: string; order_id: string | null; amount: number; currency: string }>(
      `/payments/${encodeURIComponent(providerPaymentId)}`
    );
    return p && { providerPaymentId: p.id, status: p.status, orderId: p.order_id ?? null, amountMinor: Number(p.amount), currency: String(p.currency) };
  }

  async listRefunds(providerPaymentId: string): Promise<ProviderRefundRecord[]> {
    const out = await this.get<{ items?: Array<{ id: string; amount: number; status: string; notes?: Record<string, string> | [] }> }>(
      `/payments/${encodeURIComponent(providerPaymentId)}/refunds?count=100`
    );
    return (out?.items ?? []).map((r) => ({
      providerRefundId: r.id,
      amountMinor: Number(r.amount),
      status: refundStatus(r.status),
      // Razorpay sends [] for "no notes".
      notes: r.notes && !Array.isArray(r.notes) ? r.notes : {},
    }));
  }
}

const refundStatus = (s: string): ProviderRefund["status"] => (s === "processed" ? "processed" : s === "failed" ? "failed" : "pending");

function providerUnavailable(detail: Record<string, unknown>) {
  return new DomainError("INTERNAL", "The payment service didn't respond. Please try again.", {
    nextStep: "Try again in a moment. You have not been charged twice.",
    detail,
  });
}

/* -------------------------------------------------------------- emulator */

/** Local fake: fabricates ids, never touches the network. Emulator only. */
export class EmulatorProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  readonly mode = "emulator" as const;
  /** Idempotency memory, like Razorpay's receipt/idempotency handling. */
  private readonly orders = new Map<string, string>();
  private readonly orderAmounts = new Map<string, { amountMinor: number; currency: string }>();
  private readonly refunds = new Map<string, string>();
  private readonly payments = new Map<string, ProviderPayment>();
  private readonly refundsByPayment = new Map<string, ProviderRefundRecord[]>();
  /** Test hook: make the next N provider calls fail. */
  failNext = 0;
  /** Test hook: the next N refunds are made at the provider but the reply is lost. */
  loseNextReply = 0;
  /** Test hook: false = behave as if the provider ignored the idempotency key on refunds. */
  honorRefundIdempotency = true;

  keyId(): string {
    return "rzp_test_emulator";
  }

  private maybeFail(): void {
    if (this.failNext > 0) {
      this.failNext--;
      throw providerUnavailable({ emulator: true });
    }
  }

  async createOrder(input: CreateOrderInput): Promise<{ providerOrderId: string }> {
    this.maybeFail();
    let id = this.orders.get(input.receipt);
    if (!id) {
      id = `order_emu_${randomBytes(7).toString("hex")}`;
      this.orders.set(input.receipt, id);
      this.orderAmounts.set(id, { amountMinor: input.amountMinor, currency: input.currency });
    }
    return { providerOrderId: id };
  }

  async refund(input: RefundInput): Promise<ProviderRefund> {
    this.maybeFail();
    let id = this.honorRefundIdempotency ? this.refunds.get(input.refundId) : undefined;
    if (!id) {
      id = `rfnd_emu_${randomBytes(7).toString("hex")}`;
      this.refunds.set(input.refundId, id);
      const list = this.refundsByPayment.get(input.providerPaymentId) ?? [];
      list.push({ providerRefundId: id, amountMinor: input.amountMinor, status: "pending", notes: { ...input.notes } });
      this.refundsByPayment.set(input.providerPaymentId, list);
    }
    if (this.loseNextReply > 0) {
      this.loseNextReply--;
      throw providerUnavailable({ emulator: true, lostReply: true });
    }
    // Razorpay "normal" speed refunds come back pending; refund.processed
    // arrives later by webhook. Tests deliver that webhook explicitly.
    return { providerRefundId: id, status: "pending" };
  }

  async fetchPayment(providerPaymentId: string): Promise<ProviderPayment | null> {
    this.maybeFail();
    const p = this.payments.get(providerPaymentId);
    return p ? { ...p } : null;
  }

  async listRefunds(providerPaymentId: string): Promise<ProviderRefundRecord[]> {
    this.maybeFail();
    return (this.refundsByPayment.get(providerPaymentId) ?? []).map((r) => ({ ...r, notes: { ...r.notes } }));
  }

  /** A checkout succeeded: payment [paymentId] of [orderId] is captured for the order's amount. */
  recordCheckout(orderId: string, paymentId: string): void {
    if (this.payments.has(paymentId)) return;
    const o = this.orderAmounts.get(orderId);
    this.payments.set(paymentId, {
      providerPaymentId: paymentId, status: "captured", orderId, amountMinor: o?.amountMinor ?? 0, currency: o?.currency ?? "INR",
    });
  }

  /** Test hook: overwrite what the provider says about a payment. */
  setPayment(paymentId: string, p: Partial<ProviderPayment>): void {
    const cur = this.payments.get(paymentId) ?? { providerPaymentId: paymentId, status: "captured", orderId: null, amountMinor: 0, currency: "INR" };
    this.payments.set(paymentId, { ...cur, ...p });
  }

  /** Test hook: refunds the provider holds for a payment. */
  refundsFor(paymentId: string): ProviderRefundRecord[] {
    return this.refundsByPayment.get(paymentId) ?? [];
  }
}

/* ------------------------------------------------------------- selection */

let emulatorSingleton: EmulatorProvider | null = null;

export const providerIsEmulated = (): boolean => process.env.FUNCTIONS_EMULATOR === "true";

export function getPaymentProvider(): PaymentProvider {
  if (providerIsEmulated()) {
    emulatorSingleton ??= new EmulatorProvider();
    return emulatorSingleton;
  }
  return new RazorpayProvider();
}

/** Tests only: the emulator provider instance (throws outside the emulator). */
export function emulatorProvider(): EmulatorProvider {
  const p = getPaymentProvider();
  if (!(p instanceof EmulatorProvider)) throw new Error("Emulator provider is not available outside the emulator.");
  return p;
}

/** Fabricated provider payment id (emulator tests / fixtures). */
export function emulatorPaymentId(): string {
  if (!providerIsEmulated()) throw new Error("Emulator only.");
  return `pay_emu_${randomBytes(7).toString("hex")}`;
}
