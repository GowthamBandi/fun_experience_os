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

export interface PaymentProvider {
  readonly name: "razorpay";
  readonly mode: "live" | "emulator";
  keyId(): string;
  createOrder(input: CreateOrderInput): Promise<{ providerOrderId: string }>;
  refund(input: RefundInput): Promise<ProviderRefund>;
}

/* ------------------------------------------------------------ signatures */

/** Checkout signature: HMAC_SHA256(key_secret, order_id + "|" + payment_id). */
export function paymentSignature(orderId: string, paymentId: string): string {
  return hmacHex(secret(SECRET_NAMES.razorpayKeySecret), `${orderId}|${paymentId}`);
}

export function verifyPaymentSignature(orderId: string, paymentId: string, signature: unknown): boolean {
  if (typeof signature !== "string" || !/^[a-f0-9]{64}$/i.test(signature)) return false;
  return safeEqual(paymentSignature(orderId, paymentId), signature.toLowerCase());
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

  private async post<T>(path: string, body: unknown, idempotencyKey: string): Promise<T> {
    const auth = Buffer.from(`${this.keyId()}:${secret(SECRET_NAMES.razorpayKeySecret)}`).toString("base64");
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
    const status = out.status === "processed" ? "processed" : out.status === "failed" ? "failed" : "pending";
    return { providerRefundId: out.id, status };
  }
}

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
  private readonly refunds = new Map<string, string>();
  /** Test hook: make the next N provider calls fail. */
  failNext = 0;

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
    }
    return { providerOrderId: id };
  }

  async refund(input: RefundInput): Promise<ProviderRefund> {
    this.maybeFail();
    let id = this.refunds.get(input.refundId);
    if (!id) {
      id = `rfnd_emu_${randomBytes(7).toString("hex")}`;
      this.refunds.set(input.refundId, id);
    }
    // Razorpay "normal" speed refunds come back pending; refund.processed
    // arrives later by webhook. Tests deliver that webhook explicitly.
    return { providerRefundId: id, status: "pending" };
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
