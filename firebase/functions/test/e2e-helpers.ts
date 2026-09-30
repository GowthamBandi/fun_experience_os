/**
 * End-to-end journey helpers. Every step goes through the REAL exported
 * callables (`.run(data, context)`), so input parsing, auth mapping, business
 * rules, transactions and error mapping are all exercised against the
 * Firestore emulator. Nothing is mocked; seeding is used only where no server
 * path exists (the pending commission-proposal case the console would open).
 *
 * FUNCTIONS_EMULATOR=true selects the EmulatorProvider and the dev secrets, so
 * tests can mint valid AND forged payment / webhook / ticket signatures with
 * the real algorithms.
 *
 * Runs are isolated by unique ids (uids, orgs, phones, requestIds): these
 * suites never clear the database, so they can share an emulator with others.
 */

process.env.FUNCTIONS_EMULATOR = "true";
process.env.GCLOUD_PROJECT = "demo-experience-os";
if (!process.env.FIRESTORE_EMULATOR_HOST) {
  throw new Error("FIRESTORE_EMULATOR_HOST is not set: run under `firebase emulators:exec`.");
}

import { randomBytes, randomInt } from "node:crypto";
import { db, Timestamp } from "../src/platform/firestore";
import { decideCase, setMarketplaceEntityStatus } from "../src/governance/callables";
import * as identity from "../src/identity";
import * as catalog from "../src/catalog";
import * as commerce from "../src/commerce";
import { paymentSignature, webhookSignature } from "../src/commerce/provider";
import { handleRazorpayWebhook } from "../src/commerce/webhook";

export { db, Timestamp, identity, catalog, commerce, decideCase, setMarketplaceEntityStatus };

const H = 3_600_000;
export const RUN = randomBytes(3).toString("hex");
export const uniq = (p: string) => `${p}-${RUN}-${randomBytes(4).toString("hex")}`;
/** Valid for every requestId / governance id parser (8–128, [A-Za-z0-9_-], alnum first). */
export const rid = (p = "r") => `${p}${RUN}${randomBytes(6).toString("hex")}`;

/** Every plaintext organizer / staff code handed out during this run. */
export const issuedCodes: string[] = [];

/* ------------------------------------------------------------ actors */

export interface Person {
  uid: string;
  phone: string;
  ctx: never;
}

export function uniquePhone(): string {
  return `+91${randomInt(6, 10)}${String(randomInt(0, 1_000_000_000)).padStart(9, "0")}`;
}

export function phoneCtxFor(uid: string, phone: string) {
  return {
    auth: { uid, token: { phone_number: phone, firebase: { sign_in_provider: "phone" } } },
    rawRequest: {},
  } as never;
}

export function person(tag: string, phone = uniquePhone()): Person {
  const uid = uniq(tag);
  return { uid, phone, ctx: phoneCtxFor(uid, phone) };
}

export function adminCtx(uid: string, roleId = "super-admin") {
  return { auth: { uid, token: { roleId, email_verified: true, email: `${uid}@ops.test` } }, rawRequest: {} } as never;
}

export const ADMIN_A = uniq("admin-a");
export const ADMIN_B = uniq("admin-b");
export const adminA = () => adminCtx(ADMIN_A);
export const adminB = () => adminCtx(ADMIN_B);

/* ------------------------------------------------------------ invoking */

type Runnable = { run: (data: unknown, ctx: unknown) => Promise<unknown> };

export async function call<T = Record<string, any>>(fn: unknown, data: unknown, ctx: unknown): Promise<T> {
  return (await (fn as Runnable).run(data, ctx)) as T;
}

/** The business error code of a rejected call ("OK" when it succeeded). */
export async function codeOf(p: Promise<unknown>): Promise<string> {
  try {
    await p;
    return "OK";
  } catch (e) {
    const err = e as { details?: { code?: string }; code?: string; message?: string };
    return err.details?.code ?? `UNEXPECTED:${err.code ?? ""}:${err.message ?? String(e)}`;
  }
}

export const callCode = (fn: unknown, data: unknown, ctx: unknown) => codeOf(call(fn, data, ctx));

/* ------------------------------------------------------------ reads */

export async function getDoc<T = Record<string, any>>(path: string): Promise<T | undefined> {
  const s = await db().doc(path).get();
  return s.exists ? (s.data() as T) : undefined;
}

export async function count(collection: string, field: string, value: unknown): Promise<number> {
  return (await db().collection(collection).where(field, "==", value).count().get()).data().count;
}

export async function docsWhere<T = Record<string, any>>(collection: string, field: string, value: unknown) {
  const s = await db().collection(collection).where(field, "==", value).get();
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));
}

/** A stable fingerprint of documents (Timestamps normalised) for no-side-effect checks. */
export async function fingerprint(paths: string[]): Promise<string> {
  const out: Record<string, unknown> = {};
  for (const p of paths) out[p] = (await db().doc(p).get()).data() ?? null;
  return JSON.stringify(out);
}

/** Audit events + receipts + ledger + refunds + notifications touching an org / uid set. */
export async function sideEffectCounts(orgId: string) {
  const [audits, ledger, refunds, bookings, tickets, invites, members] = await Promise.all([
    count("auditEvents", "orgId", orgId),
    count("ledgerEntries", "orgId", orgId),
    count("refunds", "orgId", orgId),
    count("bookings", "orgId", orgId),
    count("tickets", "orgId", orgId),
    count("staffInvites", "orgId", orgId),
    count("memberships", "orgId", orgId),
  ]);
  return { audits, ledger, refunds, bookings, tickets, invites, members };
}

export async function receiptExists(requestId: string): Promise<boolean> {
  const snap = await db().collection("commandReceipts").get();
  return snap.docs.some((d) => d.id.includes(requestId));
}

/* ------------------------------------------------------------ ledger */

export interface Entry {
  id: string;
  txnId: string;
  kind: string;
  account: string;
  direction: "debit" | "credit";
  amountMinor: number;
  orgId: string;
  eventId: string;
  bookingId: string;
  settlementId: string | null;
  txnGrossMinor: number;
  txnCommissionMinor: number;
}

export async function ledgerFor(field: "orgId" | "eventId" | "bookingId", value: string): Promise<Entry[]> {
  return docsWhere<Entry>("ledgerEntries", field, value) as Promise<Entry[]>;
}

/** Every txnId balances (Σ debits == Σ credits, integer paise). Returns #txns. */
export function balancedTxns(entries: Entry[]): number {
  const by = new Map<string, number>();
  for (const e of entries) {
    if (!Number.isSafeInteger(e.amountMinor) || e.amountMinor < 0) throw new Error(`bad amount in ${e.id}`);
    by.set(e.txnId, (by.get(e.txnId) ?? 0) + (e.direction === "debit" ? e.amountMinor : -e.amountMinor));
  }
  for (const [txn, diff] of by) if (diff !== 0) throw new Error(`unbalanced txn ${txn}: ${diff}`);
  return by.size;
}

/** Net balance of an account: credits − debits. */
export const net = (entries: Entry[], account: string) =>
  entries.filter((e) => e.account === account).reduce((a, e) => a + (e.direction === "credit" ? e.amountMinor : -e.amountMinor), 0);

/* ------------------------------------------------------------ journeys */

export async function completeProfile(p: Person, o: { birthDate?: string; gender?: string; name?: string } = {}) {
  return call(identity.updateMyProfile, {
    displayName: o.name ?? `P ${p.uid.slice(-6)}`,
    birthDate: o.birthDate ?? "1994-06-15",
    gender: o.gender ?? "woman",
  }, p.ctx);
}

export const organizerCaseIdFor = (uid: string) => `organizer-kyc_${uid}`;

export async function applyAsOrganizer(p: Person, name = "Deccan Weekend Club") {
  return call(identity.submitOrganizerApplication, {
    requestId: rid("app"),
    kind: "business",
    displayName: name,
    legalName: `${name} Private Limited`,
    city: "Hyderabad",
    categories: ["sports", "outdoors"],
    about: "Small-group weekend sport sessions around Hyderabad for all levels.",
    contactEmail: "hello@deccanweekend.in",
  }, p.ctx);
}

export async function caseVersion(caseId: string): Promise<number> {
  return Number((await getDoc(`governanceCases/${caseId}`))?.version ?? 0);
}

export async function approveCase(caseId: string, ctx = adminA(), requestId = rid("dec")) {
  return call(decideCase, { requestId, caseId, expectedVersion: await caseVersion(caseId), outcome: "approved", note: "" }, ctx);
}

/** Full real onboarding: profile → apply → admin approve → redeem. */
export async function onboardOrganizer(tag = "owner", name?: string) {
  const owner = person(tag);
  await completeProfile(owner, { gender: "man" });
  await applyAsOrganizer(owner, name);
  const decided = await approveCase(organizerCaseIdFor(owner.uid));
  const code = String(decided.organizerCode);
  issuedCodes.push(code);
  const redeemed = await call<{ orgId: string }>(identity.redeemOrganizerCode, { code }, owner.ctx);
  return { owner, orgId: redeemed.orgId, code };
}

/**
 * Commercial terms: the console opens a `commission-proposal` case against a
 * proposed `commercialAgreements` doc (no server path creates these yet, so
 * the pending state is seeded exactly as the console writes it); the Super
 * Admin approval goes through the REAL decideCase.
 */
export async function approveCommercialTerms(orgId: string, commissionBps = 1_200, ctx = adminA()) {
  const agreementId = `ca_${orgId}`;
  const caseId = `commission_${orgId}`;
  const now = Timestamp.now();
  await db().doc(`commercialAgreements/${agreementId}`).set({ orgId, status: "proposed", commissionBps, version: 0, createdAt: now, updatedAt: now });
  await db().doc(`governanceCases/${caseId}`).set({
    kind: "commission-proposal", targetId: agreementId, targetCollection: "commercialAgreements", orgId,
    subject: `Commission ${commissionBps / 100}%`, status: "pending", version: 0, createdAt: now, updatedAt: now,
  });
  await approveCase(caseId, ctx);
  return { agreementId, caseId };
}

export function experienceInput(orgId: string, over: Record<string, unknown> = {}) {
  return {
    requestId: rid("exp"),
    orgId,
    title: "Sunday 5-a-side Football",
    tagline: "Friendly floodlit games",
    category: "sports",
    activity: "Football",
    description: "A relaxed but competitive five-a-side football session for all skill levels.",
    highlights: ["Floodlit turf", "Bibs provided"],
    format: "5-a-side",
    genderRule: "open",
    ageMin: 18,
    idRequired: false,
    rules: ["No studs"],
    bring: ["Water"],
    safety: { level: "medium", measures: ["First-aid kit on site"] },
    cancellationPolicy: "flexible",
    config: { teamSize: 5, skillLevel: "all-levels", equipmentProvided: true },
    ...over,
  };
}

export async function approvedExperience(owner: Person, orgId: string, over: Record<string, unknown> = {}) {
  const saved = await call(catalog.saveExperience, experienceInput(orgId, over), owner.ctx);
  const submitted = await call(catalog.submitExperience, { requestId: rid("sx"), orgId, experienceId: saved.experienceId }, owner.ctx);
  await approveCase(String(submitted.caseId));
  return String(saved.experienceId);
}

export const isoIn = (ms: number) => new Date(Date.now() + ms).toISOString();

export function eventInput(orgId: string, experienceId: string, primaryUid: string, over: Record<string, unknown> = {}) {
  return {
    requestId: rid("evt"),
    orgId,
    experienceId,
    venue: { name: "Turf Arena", area: "Jubilee Hills", city: "Hyderabad", address: "Road 36, Jubilee Hills" },
    startsAt: isoIn(10 * 24 * H),
    durationMinutes: 90,
    capacity: { max: 10, min: 2 },
    priceMinor: 49_900,
    currency: "INR",
    primaryUid,
    staffUids: [],
    ...over,
  };
}

/** save → submit → admin approve → publish. Returns the event id. */
export async function publishedEvent(owner: Person, orgId: string, experienceId: string, over: Record<string, unknown> = {}) {
  const saved = await call(catalog.saveEvent, eventInput(orgId, experienceId, owner.uid, over), owner.ctx);
  const eventId = String(saved.eventId);
  const sub = await call(catalog.submitEvent, { requestId: rid("se"), orgId, eventId }, owner.ctx);
  await approveCase(String(sub.caseId));
  await call(catalog.publishEvent, { requestId: rid("pe"), orgId, eventId }, owner.ctx);
  return eventId;
}

/** A complete organizer with approved terms, one approved experience and N published events. */
export async function organizerWorld(tag: string, events: Array<Record<string, unknown>> = [{}], bps = 1_200) {
  const { owner, orgId, code } = await onboardOrganizer(tag);
  await approveCommercialTerms(orgId, bps);
  const experienceId = await approvedExperience(owner, orgId);
  const eventIds: string[] = [];
  for (const over of events) eventIds.push(await publishedEvent(owner, orgId, experienceId, over));
  return { owner, orgId, code, experienceId, eventIds };
}

export async function customer(tag = "cust", o: { birthDate?: string; gender?: string } = {}) {
  const p = person(tag);
  await completeProfile(p, o);
  return p;
}

export const fakePayId = () => `pay_emu_${randomBytes(7).toString("hex")}`;

export async function reserve(p: Person, eventId: string, spots = 1, extra: Record<string, unknown> = {}) {
  return call<{ bookingId: string; status: string; amountMinor: number; ticketIds: string[] }>(
    commerce.reserveSeat, { requestId: rid("rs"), eventId, spots, alias: `Al${p.uid.slice(-4)}`, ...extra }, p.ctx
  );
}

export async function order(p: Person, bookingId: string, extra: Record<string, unknown> = {}) {
  return call<{ paymentId: string; providerOrderId: string; amountMinor: number }>(
    commerce.createPaymentOrder, { requestId: rid("po"), bookingId, ...extra }, p.ctx
  );
}

/** reserve → order → confirm with a valid emulator checkout signature. */
export async function bookAndPay(p: Person, eventId: string, spots = 1) {
  const r = await reserve(p, eventId, spots);
  const o = await order(p, r.bookingId);
  const providerPaymentId = fakePayId();
  const c = await call<{ bookingId: string; status: string; ticketIds: string[] }>(
    commerce.confirmPayment,
    { paymentId: o.paymentId, providerPaymentId, providerSignature: paymentSignature(o.providerOrderId, providerPaymentId) },
    p.ctx
  );
  return { ...r, ...c, paymentId: o.paymentId, providerOrderId: o.providerOrderId, providerPaymentId, amountMinor: o.amountMinor };
}

export async function ticketPayloads(ticketIds: string[]): Promise<string[]> {
  return Promise.all(ticketIds.map(async (id) => String((await getDoc(`ticketSecrets/${id}`))!.payload)));
}

export async function scan(p: Person, eventId: string, payload: string, requestId = rid("sc")) {
  return call<{ result: string; ticket?: { ticketId: string; checkedInAt: string | null } }>(
    commerce.scanTicket, { requestId, eventId, payload }, p.ctx
  );
}

/** Moves an event's clock into the past (as the catalog tests do) so it can go live / complete. */
export async function moveEventToPast(eventId: string, startedAgoMs = 2 * H, endedAgoMs = 30 * 60_000) {
  await db().doc(`events/${eventId}`).update({
    startsAt: Timestamp.fromMillis(Date.now() - startedAgoMs),
    endsAt: Timestamp.fromMillis(Date.now() - endedAgoMs),
  });
}

export async function completeEvent(owner: Person, orgId: string, eventId: string) {
  await moveEventToPast(eventId);
  await call(catalog.setEventPhase, { requestId: rid("ph"), orgId, eventId, phase: "live" }, owner.ctx);
  await call(catalog.setEventPhase, { requestId: rid("ph"), orgId, eventId, phase: "completed" }, owner.ctx);
}

/** Owner invites [staff] and the staff member redeems the code. */
export async function hireStaff(owner: Person, orgId: string, staff: Person, permissions: string[], eventScope: "all" | string[]) {
  const inv = await call<{ inviteId: string; code: string }>(
    identity.inviteStaff, { requestId: rid("inv"), orgId, phone: staff.phone, title: "Door team", permissions, eventScope }, owner.ctx
  );
  issuedCodes.push(inv.code);
  await call(identity.redeemStaffCode, { code: inv.code }, staff.ctx);
  return inv;
}

/* ------------------------------------------------------------ webhook */

export interface FakeRes {
  statusCode: number;
  body: any;
  status(c: number): FakeRes;
  json(b: unknown): FakeRes;
  send(b?: unknown): FakeRes;
}

export function fakeRes(): FakeRes {
  const r: FakeRes = {
    statusCode: 200,
    body: undefined,
    status(c) { r.statusCode = c; return r; },
    json(b) { r.body = b; return r; },
    send(b) { r.body = b; return r; },
  };
  return r;
}

export async function deliverWebhook(body: Record<string, unknown>, o: { eventId?: string; signature?: string } = {}) {
  const raw = Buffer.from(JSON.stringify(body));
  const res = fakeRes();
  await handleRazorpayWebhook(
    {
      method: "POST",
      rawBody: raw,
      body: JSON.parse(raw.toString("utf8")),
      headers: { "x-razorpay-signature": o.signature ?? webhookSignature(raw), "x-razorpay-event-id": o.eventId ?? uniq("evt_rzp") },
    },
    res
  );
  return res;
}

export function capturedEvent(p: { providerPaymentId: string; orderId: string; paymentId: string; amount: number }) {
  return {
    entity: "event",
    event: "payment.captured",
    payload: {
      payment: {
        entity: { id: p.providerPaymentId, entity: "payment", amount: p.amount, currency: "INR", status: "captured", order_id: p.orderId, notes: { paymentId: p.paymentId } },
      },
    },
  };
}

/* ------------------------------------------------------------ leak scan */

/** Serialises every document of [collections] (for plaintext-code scans). */
export async function dumpCollections(collections: string[]): Promise<{ docs: number; text: string }> {
  const parts: string[] = [];
  for (const c of collections) {
    const snap = await db().collection(c).get();
    snap.forEach((d) => parts.push(`${c}/${d.id} ${JSON.stringify(d.data())}`));
  }
  return { docs: parts.length, text: parts.join("\n") };
}

export { H };
