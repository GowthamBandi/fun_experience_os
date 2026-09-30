/**
 * Pure record adapters: Firestore document data → console display rows.
 * No Firebase imports, so everything here is unit-testable.
 */

import { formatPaise, isMinorAmount, needsRefundDualControl } from "./money";

export type DisplayStatus = "Approved" | "Pending" | "Paused" | "Blocked" | "Under review" | "On hold" | "Hidden";

export interface DisplayRecord {
  id: string;
  primary: string;
  secondary: string;
  status: DisplayStatus;
  value: string;
  meta: string;
  version: number;
  raw: Record<string, unknown>;
}

type Data = Record<string, unknown>;

export function text(data: Data, ...keys: string[]): string {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "—";
}

export function displayStatus(value: unknown): DisplayStatus {
  switch (String(value)) {
    case "active": case "approved": case "approved-for-release": case "published": case "resolved": case "completed": case "paid": return "Approved";
    case "paused": return "Paused";
    case "hidden": return "Hidden";
    case "blocked": case "rejected": case "cancelled": case "failed": return "Blocked";
    case "held": case "on-hold": return "On hold";
    case "under-review": case "information-requested": case "changes-requested": return "Under review";
    default: return "Pending";
  }
}

/** Accepts a Firestore Timestamp, {seconds}, Date, ISO string or epoch ms. */
export function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (value && typeof value === "object") {
    const v = value as { toDate?: () => Date; seconds?: number };
    if (typeof v.toDate === "function") return v.toDate();
    if (typeof v.seconds === "number") return new Date(v.seconds * 1000);
  }
  return null;
}

export function formatDateTime(value: unknown): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Kolkata" }).format(d);
}

export function formatDate(value: unknown): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(d);
}

function versionOf(data: Data): number {
  return Number.isSafeInteger(data.version) ? (data.version as number) : 0;
}

/** Generic governance adapter (the original console behaviour). */
export function adaptGeneric(id: string, data: Data): DisplayRecord {
  const minor = data.amountMinor ?? data.exposureMinor ?? data.projectedGmvMinor ?? data.priceMinor;
  const amount = isMinorAmount(minor) ? formatPaise(minor, data.currency) : null;
  const rate = typeof data.commissionBps === "number" ? `${(data.commissionBps / 100).toFixed(2).replace(/\.00$/, "")}% commission` : null;
  const location = text(data, "location", "city", "territoryName");
  const owner = text(data, "organizerName", "subjectType", "category", "action");
  return {
    id,
    primary: text(data, "subject", "name", "title", "displayName", "action"),
    secondary: owner === "—" ? text(data, "kind", "type", "description") : owner,
    status: displayStatus(data.status ?? data.outcome),
    value: amount ?? rate ?? text(data, "displayValue", "value", "effectiveFrom"),
    meta: [location, text(data, "summary", "statusReason", "policyVersion")].filter((item) => item !== "—").join(" · ") || "No additional context",
    version: versionOf(data),
    raw: { ...data },
  };
}

/* --------------------------------------------------------------- refunds */

export type RefundStage = "decided" | "needs-decision" | "awaiting-second-approver";

export function refundStage(data: Data): RefundStage {
  if (data.status !== "under-review") return "decided";
  const approvals = Array.isArray(data.approvals) ? data.approvals.length : 0;
  return approvals >= 1 && needsRefundDualControl(data.amountMinor) ? "awaiting-second-approver" : "needs-decision";
}

export const REFUND_REASON_LABEL: Record<string, string> = {
  "customer-cancellation": "Customer cancellation",
  "organizer-request": "Organizer-requested refund",
  "event-cancelled": "Event cancelled",
  "payment-orphaned": "Payment without seat",
  "duplicate-capture": "Duplicate payment",
};

export function adaptRefund(id: string, data: Data): DisplayRecord {
  const stage = refundStage(data);
  const reason = typeof data.reason === "string" ? REFUND_REASON_LABEL[data.reason] ?? data.reason : "Refund";
  const status = String(data.status ?? "requested");
  const meta = [
    stage === "awaiting-second-approver" ? "Awaiting second approver (1 of 2)" : stage === "needs-decision" ? (needsRefundDualControl(data.amountMinor) ? "Needs two admins (> ₹10,000)" : "Needs a decision") : `Status: ${status}`,
    typeof data.note === "string" && data.note ? `“${data.note}”` : null,
    formatDateTime(data.createdAt),
  ].filter((part): part is string => !!part && part !== "—");
  return {
    id,
    primary: `${reason}`,
    secondary: `Org ${text(data, "orgId")} · booking ${text(data, "bookingId")}`,
    status: displayStatus(status),
    value: formatPaise(data.amountMinor, data.currency),
    meta: meta.join(" · "),
    version: versionOf(data),
    raw: { ...data },
  };
}

/* ----------------------------------------------------------- settlements */

export function adaptSettlement(id: string, data: Data): DisplayRecord {
  const status = String(data.status ?? "accruing");
  return {
    id,
    primary: `Settlement · org ${text(data, "orgId")}`,
    secondary: `Period ending ${formatDate(data.periodEnd)} · ${typeof data.entryCount === "number" ? data.entryCount : 0} ledger entries`,
    status: displayStatus(status),
    value: `${formatPaise(data.netMinor, data.currency)} net`,
    meta: [
      `Gross ${formatPaise(data.grossMinor, data.currency)}`,
      `Commission ${formatPaise(data.commissionMinor, data.currency)}`,
      `Refunds ${formatPaise(data.refundsMinor, data.currency)}`,
      `Status: ${status}`,
      typeof data.payoutReference === "string" && data.payoutReference ? `Payout ref ${data.payoutReference}` : null,
    ].filter(Boolean).join(" · "),
    version: versionOf(data),
    raw: { ...data },
  };
}

/* --------------------------------------------------------------- reviews */

export function adaptReview(id: string, data: Data): DisplayRecord {
  const rating = typeof data.rating === "number" ? data.rating : 0;
  const comment = typeof data.comment === "string" && data.comment.trim() ? data.comment.trim() : "(no comment)";
  const moderation = data.moderation && typeof data.moderation === "object" ? (data.moderation as Data) : null;
  return {
    id,
    primary: `${"★".repeat(Math.max(0, Math.min(5, rating)))}${"☆".repeat(Math.max(0, 5 - rating))} · ${text(data, "authorName")}`,
    secondary: comment.length > 120 ? `${comment.slice(0, 117)}…` : comment,
    status: displayStatus(data.status),
    value: `${rating}/5`,
    meta: [
      `Event ${text(data, "eventId")}`,
      `Org ${text(data, "orgId")}`,
      moderation && typeof moderation.reason === "string" ? `Moderated: ${moderation.reason}` : null,
    ].filter(Boolean).join(" · "),
    version: versionOf(data),
    raw: { ...data },
  };
}

/* -------------------------------------------------------------- events */

export function adaptEvent(id: string, data: Data): DisplayRecord {
  const base = adaptGeneric(id, data);
  const venue = data.venue && typeof data.venue === "object" ? (data.venue as Data) : null;
  const starts = formatDateTime(data.startsAt);
  return {
    ...base,
    primary: text(data, "title", "name", "subject"),
    value: isMinorAmount(data.priceMinor) ? formatPaise(data.priceMinor, data.currency) : base.value,
    meta: [starts, venue ? [text(venue, "name"), text(venue, "city")].filter((v) => v !== "—").join(", ") : text(data, "location"), `Status: ${String(data.status ?? "—")}`]
      .filter((v) => v && v !== "—").join(" · ") || base.meta,
  };
}

/* ------------------------------------------------- organizer applications */

export function adaptOrganizerApplication(id: string, data: Data): DisplayRecord {
  const categories = Array.isArray(data.categories) ? data.categories.filter((c) => typeof c === "string").join(", ") : "";
  return {
    id,
    primary: text(data, "displayName", "legalName"),
    secondary: `${text(data, "kind")} · ${text(data, "city")}`,
    status: displayStatus(data.status),
    value: typeof data.orgId === "string" ? `Org ${data.orgId}` : "No organizer yet",
    meta: [
      categories || null,
      data.activationPending === true ? "Organizer Code issued · not yet redeemed" : data.orgId ? "Activated" : null,
      `Status: ${String(data.status ?? "—")}`,
    ].filter(Boolean).join(" · "),
    version: versionOf(data),
    raw: { ...data },
  };
}

/** Only approved applications with an organizer and a pending activation can get a new code. */
export function canReissueOrganizerCode(data: Data): boolean {
  return data.status === "approved" && typeof data.orgId === "string" && data.activationPending !== false;
}

/* ---------------------------------------------- case target key fields */

export interface KeyField {
  label: string;
  value: string;
}

const GENDER: Record<string, string> = { any: "Everyone", open: "Everyone", women: "Women only", men: "Men only", "women-only": "Women only", "men-only": "Men only" };

function eligibilityText(source: Data): string {
  const e = source.eligibility && typeof source.eligibility === "object" ? (source.eligibility as Data) : source;
  const ageMin = typeof e.ageMin === "number" ? e.ageMin : null;
  const ageMax = typeof e.ageMax === "number" ? e.ageMax : null;
  const gender = typeof e.genderRule === "string" ? GENDER[e.genderRule] ?? e.genderRule : null;
  const age = ageMin === null ? null : ageMax === null ? `${ageMin}+` : `${ageMin}–${ageMax}`;
  const parts = [age ? `Age ${age}` : null, gender, e.idRequired === true ? "ID required" : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : "—";
}

/**
 * The fields a reviewer must see before deciding an experience or event
 * approval: title, category, eligibility, price (₹ from priceMinor),
 * capacity, startsAt, venue and responsibility.primaryUid.
 */
export function caseTargetFields(kind: string, target: Data | null): KeyField[] {
  if (!target) return [];
  if (kind === "organizer-kyc") {
    return [
      { label: "Display name", value: text(target, "displayName") },
      { label: "Legal name", value: text(target, "legalName") },
      { label: "Kind", value: text(target, "kind") },
      { label: "City", value: text(target, "city") },
      { label: "Categories", value: Array.isArray(target.categories) ? target.categories.join(", ") || "—" : "—" },
      { label: "About", value: text(target, "about") },
      { label: "Application status", value: text(target, "status") },
    ];
  }
  const venue = target.venue && typeof target.venue === "object" ? (target.venue as Data) : null;
  const capacity = target.capacity && typeof target.capacity === "object" ? (target.capacity as Data) : null;
  const responsibility = target.responsibility && typeof target.responsibility === "object" ? (target.responsibility as Data) : null;
  const common: KeyField[] = [
    { label: "Title", value: text(target, "title", "name") },
    { label: "Category", value: [text(target, "category"), text(target, "activity")].filter((v) => v !== "—").join(" · ") || "—" },
    { label: "Organizer", value: text(target, "organizerName", "orgId") },
    { label: "Eligibility", value: eligibilityText(target) },
  ];
  if (kind === "experience-approval") {
    return [
      ...common,
      { label: "Format", value: text(target, "format") },
      { label: "Cancellation policy", value: text(target, "cancellationPolicy") },
      { label: "Safety level", value: target.safety && typeof target.safety === "object" ? text(target.safety as Data, "level") : "—" },
      { label: "Status", value: text(target, "status") },
    ];
  }
  return [
    ...common,
    { label: "Price", value: isMinorAmount(target.priceMinor) ? (target.priceMinor === 0 ? "Free" : formatPaise(target.priceMinor, target.currency)) : "—" },
    { label: "Capacity", value: capacity ? `${typeof capacity.min === "number" ? `${capacity.min}–` : ""}${typeof capacity.max === "number" ? capacity.max : "?"} spots` : "—" },
    { label: "Starts", value: formatDateTime(target.startsAt) },
    { label: "Duration", value: typeof target.durationMinutes === "number" ? `${target.durationMinutes} min` : "—" },
    { label: "Venue", value: venue ? [text(venue, "name"), text(venue, "area"), text(venue, "city")].filter((v) => v !== "—").join(", ") || "—" : text(target, "location") },
    { label: "Responsible (primaryUid)", value: responsibility ? text(responsibility, "primaryUid") : "— missing: cannot be published" },
    { label: "Status", value: text(target, "status") },
  ];
}
