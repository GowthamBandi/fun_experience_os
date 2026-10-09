/**
 * Pure helpers for Customers search and Customer 360 (no Firestore reads).
 * Field names verified in firebase/functions/src:
 *  - users/{uid}: uid, phone (E.164), createdAt, updatedAt, pushTokens (identity/profile.ts, identity/push.ts).
 *    Customers carry no scope, status or displayName; operators carry scope "platform", displayName,
 *    email, roleId and status (auth/operatorAccess.ts).
 *  - publicProfiles/{uid}.displayName (identity/profile.ts); customerSafety/{uid} birthDate, gender (owner-only).
 *  - payments and refunds: commerce/types.ts PaymentDoc / RefundDoc (both carry customerUid).
 *  - reviews: authorUid, authorName (catalog/reviews.ts); legalHolds: platform/legalHolds.ts.
 */

import type { BadgeTone } from "@/components/pulse/Badge";
import { toDate } from "./console/records";
import { str, toBooking, toReview, type BookingRow, type ReviewRow } from "./events";
import { CAPTURED_PAYMENT_STATUSES } from "./metrics";
import { classifyQuery } from "./search";

type Raw = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const badge = (map: Record<string, { label: string; tone: BadgeTone }>, status: unknown) => {
  const s = str(status);
  return (s && map[s]) || { label: s ?? "—", tone: "muted" as BadgeTone };
};

/** The name the PULSE app falls back to (catalog/reviews.ts authorName). */
export const MEMBER_FALLBACK = "PULSE member";

export function customerName(displayName: string | null | undefined): string {
  return str(displayName) ?? MEMBER_FALLBACK;
}

/** A revealed Indian number in readable groups ("+91 91000 00004"); anything else as stored. */
export function formatPhone(e164: string | null): string {
  if (!e164) return "—";
  const m = /^\+91(\d{5})(\d{5})$/.exec(e164);
  return m ? `+91 ${m[1]} ${m[2]}` : e164;
}

/* ------------------------------------------------------------------ search */

export type CustomerLookup =
  | { kind: "empty" }
  | { kind: "phone"; value: string }
  | { kind: "id"; value: string }
  | { kind: "reference"; value: string }
  /** users has no name field, so free text can't be searched. */
  | { kind: "unsupported" };

export function customerLookup(q: string): CustomerLookup {
  if (!q.trim()) return { kind: "empty" };
  const c = classifyQuery(q);
  if (c.kind === "text") return { kind: "unsupported" };
  return { kind: c.kind, value: c.value };
}

/* ------------------------------------------------------------------- users */

export interface CustomerRow {
  uid: string;
  phone: string | null;
  createdAt: Date | null;
  /** Operators (scope "platform") are console staff, not customers. */
  operator: boolean;
  status: string | null;
}

export function toCustomer(id: string, d: Raw): CustomerRow {
  return { uid: id, phone: str(d.phone), createdAt: toDate(d.createdAt), operator: d.scope === "platform", status: str(d.status) };
}

/**
 * Newest customers from a newest-first read of users. Customer docs have no `scope` field and
 * Firestore's `!=` skips docs missing the field, so operators are dropped here instead.
 */
export function newestCustomers(rows: CustomerRow[], n = 20): CustomerRow[] {
  return rows.filter((r) => !r.operator).slice(0, n);
}

const USER_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "ok" },
  suspended: { label: "Suspended", tone: "warn" },
  disabled: { label: "Disabled", tone: "err" },
};

/** Customers have no status field (only operators do), so null means "not recorded". */
export function userStatusBadge(status: unknown): { label: string; tone: BadgeTone } | null {
  return str(status) ? badge(USER_STATUS, status) : null;
}

/* ---------------------------------------------------------------- bookings */

export interface CustomerBookingRow extends BookingRow {
  refundedMinor: number | null;
  /** The age and gender checks reserveSeat recorded; null when the booking carries none. */
  eligibility: { age: boolean | null; gender: boolean | null } | null;
}

export function toCustomerBooking(id: string, d: Raw): CustomerBookingRow {
  const e = d.eligibility && typeof d.eligibility === "object" ? (d.eligibility as Raw) : null;
  const flag = (v: unknown) => (typeof v === "boolean" ? v : null);
  return {
    ...toBooking(id, d),
    refundedMinor: num(d.refundedMinor),
    eligibility: e ? { age: flag(e.ageVerifiedOk), gender: flag(e.genderOk) } : null,
  };
}

/** Booking checks at reservation: how many recorded a result, and how many failed either check. */
export function eligibilitySummary(rows: CustomerBookingRow[]): { checked: number; failed: number; unrecorded: number } {
  let checked = 0;
  let failed = 0;
  for (const b of rows) {
    if (!b.eligibility) continue;
    checked++;
    if (b.eligibility.age === false || b.eligibility.gender === false) failed++;
  }
  return { checked, failed, unrecorded: rows.length - checked };
}

/** The newest-customers list came up short because operators filled part of a truncated read. */
export function newestShort(shown: number, truncated: boolean, want = 20): boolean {
  return truncated && shown < want;
}

/* ---------------------------------------------------------------- payments */

export interface PaymentRow {
  id: string;
  bookingId: string | null;
  eventId: string | null;
  amountMinor: number | null;
  refundedMinor: number | null;
  status: string | null;
  providerPaymentId: string | null;
  createdAt: Date | null;
  capturedAt: Date | null;
}

export function toPayment(id: string, d: Raw): PaymentRow {
  return {
    id,
    bookingId: str(d.bookingId),
    eventId: str(d.eventId),
    amountMinor: num(d.amountMinor),
    refundedMinor: num(d.refundedMinor),
    status: str(d.status),
    providerPaymentId: str(d.providerPaymentId),
    createdAt: toDate(d.createdAt),
    capturedAt: toDate(d.capturedAt),
  };
}

const PAYMENT_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  creating: { label: "Creating", tone: "muted" },
  created: { label: "Awaiting payment", tone: "warn" },
  captured: { label: "Captured", tone: "ok" },
  failed: { label: "Failed", tone: "err" },
  refunded: { label: "Refunded", tone: "info" },
  "partially-refunded": { label: "Part refunded", tone: "info" },
};

export const paymentBadge = (status: unknown) => badge(PAYMENT_STATUS, status);

const CAPTURED = new Set<string>(CAPTURED_PAYMENT_STATUSES);

/** Captured money across the loaded payments (the Spent metric's statuses), and refunds approved against them. */
export function paymentTotals(rows: PaymentRow[]): { captured: number; refunded: number } {
  let captured = 0;
  let refunded = 0;
  for (const p of rows) {
    if (p.status !== null && CAPTURED.has(p.status)) captured += p.amountMinor ?? 0;
    refunded += p.refundedMinor ?? 0;
  }
  return { captured, refunded };
}

/* ----------------------------------------------------------------- refunds */

export interface RefundRow {
  id: string;
  bookingId: string | null;
  eventId: string | null;
  amountMinor: number | null;
  status: string | null;
  reason: string | null;
  note: string | null;
  createdAt: Date | null;
}

export function toRefund(id: string, d: Raw): RefundRow {
  return {
    id,
    bookingId: str(d.bookingId),
    eventId: str(d.eventId),
    amountMinor: num(d.amountMinor),
    status: str(d.status),
    reason: str(d.reason),
    note: str(d.note),
    createdAt: toDate(d.createdAt),
  };
}

const REFUND_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  requested: { label: "Requested", tone: "warn" },
  "under-review": { label: "Under review", tone: "warn" },
  approved: { label: "Approved", tone: "info" },
  processing: { label: "Processing", tone: "info" },
  completed: { label: "Refunded", tone: "ok" },
  rejected: { label: "Rejected", tone: "muted" },
  failed: { label: "Failed", tone: "err" },
};

export const refundBadge = (status: unknown) => badge(REFUND_STATUS, status);

const REFUND_REASON: Record<string, string> = {
  "customer-cancellation": "Customer cancelled",
  "event-cancelled": "Event cancelled",
  "payment-orphaned": "Payment without a seat",
  "duplicate-capture": "Charged twice",
  "organizer-request": "Organizer request",
};

export function refundReasonLabel(reason: string | null): string {
  return reason ? REFUND_REASON[reason] ?? reason : "—";
}

const OPEN_REFUND = new Set(["requested", "under-review", "approved", "processing"]);

/** Refunds still moving (not yet refunded, rejected or failed): count and amount. */
export function openRefunds(rows: RefundRow[]): { count: number; amountMinor: number } {
  const open = rows.filter((r) => r.status !== null && OPEN_REFUND.has(r.status));
  return { count: open.length, amountMinor: open.reduce((s, r) => s + (r.amountMinor ?? 0), 0) };
}

/* ----------------------------------------------------------------- reviews */

export interface CustomerReviewRow extends ReviewRow {
  eventId: string | null;
}

export function toCustomerReview(id: string, d: Raw): CustomerReviewRow {
  return { ...toReview(id, d), eventId: str(d.eventId) };
}

/* ------------------------------------------------------------ legal holds */

export interface LegalHoldRow {
  id: string;
  status: string | null;
  reason: string | null;
  reference: string | null;
  placedBy: string | null;
  placedAt: Date | null;
  releasedBy: string | null;
  releasedAt: Date | null;
  releaseReason: string | null;
}

export function toLegalHold(id: string, d: Raw): LegalHoldRow {
  return {
    id,
    status: str(d.status),
    reason: str(d.reason),
    reference: str(d.reference),
    placedBy: str(d.placedBy),
    placedAt: toDate(d.placedAt),
    releasedBy: str(d.releasedBy),
    releasedAt: toDate(d.releasedAt),
    releaseReason: str(d.releaseReason),
  };
}

export const holdBadge = (status: unknown) => badge({ active: { label: "Active hold", tone: "err" }, released: { label: "Released", tone: "muted" } }, status);

/* ------------------------------------------------------------------ safety */

/** Whole years on `now`'s IST date for a YYYY-MM-DD birth date; null when unreadable. */
export function ageFrom(birthDate: unknown, now: Date): number | null {
  const m = typeof birthDate === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate) : null;
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const [ty, tm, td] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now).split("-").map(Number) as [number, number, number];
  const age = ty - y - (tm < mo || (tm === mo && td < d) ? 1 : 0);
  return age >= 0 && age <= 130 ? age : null;
}

const GENDER: Record<string, string> = { woman: "Woman", man: "Man", "non-binary": "Non-binary", "prefer-not": "Prefers not to say" };

export function genderLabel(g: unknown): string {
  const s = str(g);
  return s ? GENDER[s] ?? s : "—";
}

/** A permission-denied read (customerSafety is owner-only in firestore.rules). */
export function isPermissionDenied(err: unknown): boolean {
  const code = typeof err === "object" && err !== null ? String((err as { code?: unknown }).code ?? "") : "";
  return code === "permission-denied" || /insufficient permissions|permission[- ]denied/i.test(err instanceof Error ? err.message : String(err ?? ""));
}
