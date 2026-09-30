/**
 * Shared fixtures for the commerce suites. Runs against the real Firestore
 * emulator (FIRESTORE_EMULATOR_HOST from env). FUNCTIONS_EMULATOR=true selects
 * the EmulatorProvider and the dev secrets, so tests can mint valid AND forged
 * signatures with the real algorithms.
 */

process.env.FUNCTIONS_EMULATOR = "true";
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
process.env.GCLOUD_PROJECT = "demo-experience-os";

import { randomBytes } from "node:crypto";
import { Timestamp, db } from "../src/platform/firestore";
import { EMPTY_OCCUPANCY } from "../src/domain/capacity";
import { paymentSignature, webhookSignature } from "../src/commerce/provider";
import { handleRazorpayWebhook } from "../src/commerce/webhook";
import * as commerce from "../src/commerce";

export { db, Timestamp, commerce };

export const uniq = (p: string) => `${p}-${randomBytes(5).toString("hex")}`;
export const rid = () => `req_${randomBytes(8).toString("hex")}`;
const H = 3_600_000;

/* ------------------------------------------------------------- contexts */

let phoneSeq = 0;
export function phoneCtx(uid: string) {
  phoneSeq++;
  return {
    auth: { uid, token: { phone_number: `+9198${String(10000000 + phoneSeq).slice(-8)}`, firebase: { sign_in_provider: "phone" } } },
    rawRequest: {},
  } as never;
}
export function adminCtx(uid: string, roleId = "super-admin") {
  return { auth: { uid, token: { roleId, email_verified: true, email: `${uid}@ops.test` } }, rawRequest: {} } as never;
}
export function anonEmailCtx(uid: string) {
  return { auth: { uid, token: { email: `${uid}@x.test` } }, rawRequest: {} } as never;
}

type Runnable = { run: (data: unknown, ctx: unknown) => Promise<unknown> };

/** Invokes an exported callable exactly as deployed (validation + error mapping). */
export async function call<T = Record<string, unknown>>(fn: unknown, data: unknown, ctx: unknown): Promise<T> {
  return (await (fn as Runnable).run(data, ctx)) as T;
}

/** Invokes and returns the business error code ("OK" on success). */
export async function callCode(fn: unknown, data: unknown, ctx: unknown): Promise<string> {
  try {
    await call(fn, data, ctx);
    return "OK";
  } catch (e) {
    const details = (e as { details?: { code?: string } }).details;
    return details?.code ?? `UNEXPECTED:${(e as Error).message}`;
  }
}

export async function callErr(fn: unknown, data: unknown, ctx: unknown): Promise<{ code: string; message: string }> {
  try {
    await call(fn, data, ctx);
  } catch (e) {
    const details = (e as { details?: { code?: string; message?: string } }).details;
    return { code: details?.code ?? "UNEXPECTED", message: details?.message ?? (e as Error).message };
  }
  throw new Error("expected the call to fail");
}

/* ---------------------------------------------------------------- seeds */

export async function seedOrg(orgId: string, status = "active") {
  await db().collection("organizers").doc(orgId).set({ id: orgId, status, name: `Org ${orgId}` });
}

export async function seedCustomer(uid: string, safety: { birthDate: string; gender: string } | null = { birthDate: "1995-05-20", gender: "woman" }) {
  if (safety) await db().collection("customerSafety").doc(uid).set(safety);
  await db().collection("publicProfiles").doc(uid).set({ displayName: `Cust ${uid.slice(-4)}` });
}

export interface EventSeed {
  orgId: string;
  capacity?: number;
  priceMinor?: number;
  commissionBps?: number;
  startsInHours?: number;
  status?: string;
  policy?: "flexible" | "moderate" | "strict";
  eligibility?: { ageMin: number; ageMax: number | null; genderRule: string };
}

export async function seedEvent(s: EventSeed): Promise<string> {
  const id = uniq("evt");
  const startsAt = Date.now() + (s.startsInHours ?? 24 * 10) * H;
  await db().collection("events").doc(id).set({
    id,
    orgId: s.orgId,
    experienceId: uniq("exp"),
    status: s.status ?? "published",
    title: "Sunset Kayak",
    startsAt: Timestamp.fromMillis(startsAt),
    endsAt: Timestamp.fromMillis(startsAt + 2 * H),
    venue: { name: "Lake", area: "Madhapur", city: "Hyderabad", address: "1 Lake Rd" },
    capacity: {
      maxPhysicalCapacity: s.capacity ?? 10,
      blockedSlots: 0,
      compSlots: 0,
      minParticipants: 2,
      targetParticipants: s.capacity ?? 10,
    },
    occupancy: { ...EMPTY_OCCUPANCY },
    priceMinor: s.priceMinor ?? 99_900,
    currency: "INR",
    eligibility: s.eligibility ?? { ageMin: 18, ageMax: null, genderRule: "open" },
    cancellationPolicy: s.policy ?? "flexible",
    responsibility: { primaryUid: "lead-1", staffUids: [] },
    version: 1,
  });
  // Commission lives in the private eventCommercials doc, as publishEvent writes it.
  await db().collection("eventCommercials").doc(id).set({ eventId: id, orgId: s.orgId, commissionBps: s.commissionBps ?? 1_250, commercialAgreementId: "ca-test" });
  return id;
}

export async function seedMembership(
  orgId: string,
  uid: string,
  o: { permissions?: string[]; eventIds?: string[] | "all"; status?: "active" | "revoked"; role?: "owner" | "staff" } = {}
) {
  await db()
    .collection("memberships")
    .doc(`${orgId}__${uid}`)
    .set({
      orgId,
      uid,
      role: o.role ?? "staff",
      status: o.status ?? "active",
      permissions: o.permissions ?? ["tickets.scan"],
      eventScope: o.eventIds === "all" || !o.eventIds ? { all: o.eventIds === "all", eventIds: [] } : { all: false, eventIds: o.eventIds },
      version: 1,
    });
}

/** A fresh org + customer + published event. */
export async function world(s: Partial<EventSeed> = {}) {
  const orgId = s.orgId ?? uniq("org");
  await seedOrg(orgId);
  const eventId = await seedEvent({ ...s, orgId });
  return { orgId, eventId };
}

export async function newCustomer(safety?: { birthDate: string; gender: string } | null) {
  const uid = uniq("cust");
  await seedCustomer(uid, safety === undefined ? { birthDate: "1995-05-20", gender: "woman" } : safety);
  return uid;
}

/* ------------------------------------------------------------- journeys */

export async function reserve(uid: string, eventId: string, spots = 1, requestId = rid()) {
  return call<{ bookingId: string; status: string; amountMinor: number; holdExpiresAt: string | null; ticketIds: string[] }>(
    commerce.reserveSeat,
    { requestId, eventId, spots, alias: `Al${uid.slice(-4)}` },
    phoneCtx(uid)
  );
}

export async function order(uid: string, bookingId: string) {
  return call<{ paymentId: string; providerOrderId: string; amountMinor: number; keyId: string }>(
    commerce.createPaymentOrder,
    { requestId: rid(), bookingId },
    phoneCtx(uid)
  );
}

export const fakePayId = () => `pay_emu_${randomBytes(7).toString("hex")}`;

/** reserve → order → verified confirm. Returns the confirmed booking. */
export async function book(uid: string, eventId: string, spots = 1) {
  const r = await reserve(uid, eventId, spots);
  if (r.status === "confirmed") {
    return { ...r, paymentId: null as string | null, providerOrderId: null as string | null, providerPaymentId: null as string | null };
  }
  const o = await order(uid, r.bookingId);
  const payId = fakePayId();
  const c = await call<{ bookingId: string; status: string; ticketIds: string[] }>(
    commerce.confirmPayment,
    { paymentId: o.paymentId, providerPaymentId: payId, providerSignature: paymentSignature(o.providerOrderId, payId) },
    phoneCtx(uid)
  );
  return {
    ...r,
    ...c,
    paymentId: o.paymentId as string | null,
    providerOrderId: o.providerOrderId as string | null,
    providerPaymentId: payId as string | null,
  };
}

/* -------------------------------------------------------------- webhook */

export interface FakeRes {
  statusCode: number;
  body: unknown;
  status(c: number): FakeRes;
  json(b: unknown): FakeRes;
  send(b?: unknown): FakeRes;
}

export function fakeRes(): FakeRes {
  const r: FakeRes = {
    statusCode: 200,
    body: undefined,
    status(c) {
      r.statusCode = c;
      return r;
    },
    json(b) {
      r.body = b;
      return r;
    },
    send(b) {
      r.body = b;
      return r;
    },
  };
  return r;
}

export async function deliverWebhook(
  body: Record<string, unknown>,
  o: { eventId?: string; signature?: string; tamper?: (raw: Buffer) => Buffer } = {}
) {
  let raw: Buffer = Buffer.from(JSON.stringify(body));
  const signature = o.signature ?? webhookSignature(raw);
  if (o.tamper) raw = o.tamper(raw);
  const res = fakeRes();
  await handleRazorpayWebhook(
    {
      method: "POST",
      rawBody: raw,
      body: JSON.parse(raw.toString("utf8")),
      headers: { "x-razorpay-signature": signature, "x-razorpay-event-id": o.eventId ?? uniq("evt_rzp") },
    },
    res
  );
  return res;
}

export function capturedEvent(p: { providerPaymentId: string; orderId: string; paymentId: string; amount: number; currency?: string }) {
  return {
    entity: "event",
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: p.providerPaymentId,
          entity: "payment",
          amount: p.amount,
          currency: p.currency ?? "INR",
          status: "captured",
          order_id: p.orderId,
          notes: { paymentId: p.paymentId },
        },
      },
    },
  };
}

export function refundEvent(type: "refund.processed" | "refund.failed", p: { providerRefundId: string; refundId: string; amount: number }) {
  return {
    entity: "event",
    event: type,
    payload: { refund: { entity: { id: p.providerRefundId, entity: "refund", amount: p.amount, notes: { refundId: p.refundId } } } },
  };
}

/* --------------------------------------------------------------- ledger */

export interface Entry {
  txnId: string;
  account: string;
  direction: "debit" | "credit";
  amountMinor: number;
  orgId: string;
  eventId: string;
  settlementId: string | null;
  kind: string;
}

export async function ledgerWhere(field: string, value: string): Promise<Entry[]> {
  const s = await db().collection("ledgerEntries").where(field, "==", value).get();
  return s.docs.map((d) => d.data() as Entry);
}

/** Every txnId balances: Σ debits == Σ credits, integer paise. */
export function expectBalanced(entries: Entry[]) {
  const by = new Map<string, { d: number; c: number }>();
  for (const e of entries) {
    expect(Number.isSafeInteger(e.amountMinor)).toBe(true);
    expect(e.amountMinor).toBeGreaterThanOrEqual(0);
    const t = by.get(e.txnId) ?? { d: 0, c: 0 };
    if (e.direction === "debit") t.d += e.amountMinor;
    else t.c += e.amountMinor;
    by.set(e.txnId, t);
  }
  for (const [txnId, t] of by) expect({ txnId, debit: t.d }).toEqual({ txnId, debit: t.c });
  return by.size;
}

export const sum = (entries: Entry[], account: string, direction: "debit" | "credit") =>
  entries.filter((e) => e.account === account && e.direction === direction).reduce((a, e) => a + e.amountMinor, 0);

export async function getDoc<T = Record<string, unknown>>(path: string): Promise<T | undefined> {
  const s = await db().doc(path).get();
  return s.exists ? (s.data() as T) : undefined;
}

/** Forces a booking's hold into the past (simulates 15 minutes passing). */
export async function lapseHold(bookingId: string) {
  await db().collection("bookings").doc(bookingId).update({ holdExpiresAt: Timestamp.fromMillis(Date.now() - 60_000) });
}
