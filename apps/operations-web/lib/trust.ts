/**
 * Pure helpers for the Risk page and the Reviews moderation feed (no Firebase imports).
 *
 * riskAlerts (firebase/functions/src/commerce/shared.ts raiseRiskAlert): id, kind,
 * severity "low" | "medium" | "high", status "open", orgId (nullable), summary,
 * detail { eventId?, bookingId?, paymentId?, refundId?, uid?, … }, createdAt; some carry
 * lastSeenAt. No version until setMarketplaceEntityStatus("risk-alert") writes one with
 * status, statusReason and updatedAt (governance/service.ts). "critical" is read defensively.
 *
 * reviews (catalog/reviews.ts): `{eventId}__{uid}` with eventId, experienceId, orgId,
 * authorUid, authorName (display name or "PULSE member"), rating 1–5, comment, status
 * "published" | "hidden", version, createdAt, updatedAt, moderation { by, reason, at } | null.
 * There is no report or flag field, so the feed has no "Flagged" filter.
 */

import type { BadgeTone } from "@/components/pulse/Badge";
import { CONFIRM_PHRASES, type EntityStatus } from "./console/actions";
import { isOpenRisk } from "./console/attention";
import { toDate } from "./console/records";
import { entityVersion } from "./organizers";

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Raw | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : null);
const words = (s: string) => s.replace(/[-_]+/g, " ");
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/* -------------------------------------------------------------------- risk */

export type RiskSeverity = "critical" | "high" | "medium" | "low";

export interface RiskAlert {
  id: string;
  kind: string | null;
  title: string;
  severity: RiskSeverity | null;
  status: string | null;
  open: boolean;
  summary: string | null;
  orgId: string | null;
  eventId: string | null;
  bookingId: string | null;
  uid: string | null;
  detail: Raw;
  createdAt: Date | null;
  lastSeenAt: Date | null;
  updatedAt: Date | null;
  statusReason: string | null;
  version: number;
}

export function toRiskAlert(id: string, d: Raw): RiskAlert {
  const detail = obj(d.detail) ?? {};
  const kind = str(d.kind);
  const sev = str(d.severity);
  return {
    id,
    kind,
    title: kind ? sentence(words(kind)) : "Risk alert",
    severity: sev === "critical" || sev === "high" || sev === "medium" || sev === "low" ? sev : null,
    status: str(d.status),
    open: isOpenRisk(d),
    summary: str(d.summary),
    orgId: str(d.orgId),
    eventId: str(detail.eventId),
    bookingId: str(detail.bookingId),
    uid: str(detail.uid),
    detail,
    createdAt: toDate(d.createdAt),
    lastSeenAt: toDate(d.lastSeenAt),
    updatedAt: toDate(d.updatedAt),
    statusReason: str(d.statusReason),
    version: entityVersion(d.version),
  };
}

const SEVERITY_RANK: Record<RiskSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Critical first, then high, medium, low, unknown; newest first inside a severity. */
export function sortRisks(alerts: RiskAlert[]): RiskAlert[] {
  const rank = (a: RiskAlert) => (a.severity ? SEVERITY_RANK[a.severity] : 4);
  const at = (a: RiskAlert) => (a.lastSeenAt ?? a.createdAt)?.getTime() ?? 0;
  return [...alerts].sort((a, b) => rank(a) - rank(b) || at(b) - at(a) || a.id.localeCompare(b.id));
}

export function riskGlyph(severity: RiskSeverity | null): { emoji: string; tone: BadgeTone } {
  if (severity === "critical" || severity === "high") return { emoji: "🚨", tone: "err" };
  if (severity === "medium") return { emoji: "⚠️", tone: "warn" };
  if (severity === "low") return { emoji: "⚠️", tone: "info" };
  return { emoji: "⚠️", tone: "muted" };
}

export function severityBadge(severity: RiskSeverity | null): { label: string; tone: BadgeTone } {
  if (!severity) return { label: "—", tone: "muted" };
  return { label: sentence(severity), tone: severity === "critical" || severity === "high" ? "err" : severity === "medium" ? "warn" : "info" };
}

const RISK_STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  open: { label: "Open", tone: "err" },
  "under-review": { label: "Investigating", tone: "info" },
  paused: { label: "Exposure paused", tone: "warn" },
  "on-hold": { label: "On hold", tone: "warn" },
  resolved: { label: "Resolved", tone: "ok" },
  closed: { label: "Closed", tone: "muted" },
  dismissed: { label: "Dismissed", tone: "muted" },
  blocked: { label: "Blocked", tone: "muted" },
};

/** A missing status is the server's initial "open". */
export function riskStatusBadge(status: string | null): { label: string; tone: BadgeTone } {
  const s = status ?? "open";
  return RISK_STATUS[s] ?? { label: sentence(words(s)), tone: "muted" };
}

export type RiskFilter = "open" | "closed" | "all";

export const RISK_FILTERS: Array<{ id: RiskFilter; label: string }> = [
  { id: "open", label: "Open" },
  { id: "closed", label: "Closed" },
  { id: "all", label: "All" },
];

export function riskCounts(alerts: RiskAlert[]): Record<RiskFilter, number> {
  const open = alerts.filter((a) => a.open).length;
  return { open, closed: alerts.length - open, all: alerts.length };
}

export function filterRisks(alerts: RiskAlert[], filter: RiskFilter, search: string): RiskAlert[] {
  const q = search.trim().toLowerCase();
  return alerts.filter((a) => {
    if (filter === "open" && !a.open) return false;
    if (filter === "closed" && a.open) return false;
    if (!q) return true;
    return [a.id, a.kind, a.summary, a.orgId, a.eventId, a.bookingId, a.uid].some((v) => v && v.toLowerCase().includes(q));
  });
}

export interface EntityLink {
  label: string;
  href: string;
  id: string;
}

/** Console pages for the records an alert names; ids without a page stay in the details list. */
export function riskEntityLinks(a: RiskAlert): EntityLink[] {
  const links: EntityLink[] = [];
  const enc = encodeURIComponent;
  if (a.orgId) links.push({ label: "Organizer", href: `/partners/${enc(a.orgId)}`, id: a.orgId });
  if (a.eventId) links.push({ label: "Event", href: `/events/${enc(a.eventId)}`, id: a.eventId });
  if (a.eventId && a.bookingId) links.push({ label: "Booking", href: `/events/${enc(a.eventId)}?booking=${enc(a.bookingId)}`, id: a.bookingId });
  if (a.uid) links.push({ label: "Customer", href: `/customers/${enc(a.uid)}`, id: a.uid });
  return links;
}

/** The detail map as display rows (scalars only; nested values are summarised). */
export function riskDetailRows(detail: Raw): Array<{ label: string; value: string }> {
  return Object.keys(detail)
    .sort()
    .map((k) => {
      const v = detail[k];
      const value = v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? (toDate(v)?.toISOString() ?? JSON.stringify(v)) : String(v);
      return { label: sentence(k.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()), value };
    });
}

export interface AlertAction {
  status: Extract<EntityStatus, "resolved" | "under-review" | "paused" | "blocked">;
  label: string;
  phrase: string | null;
  consequence: string;
  tone: "volt" | "danger";
  /** Toast title prefix after success. */
  done: string;
  question: string;
  confirm: string;
}

const RESOLVE: AlertAction = {
  status: "resolved",
  label: "Resolve",
  phrase: null,
  consequence: "Closes the alert with your note. It leaves the attention queue; nothing else changes.",
  tone: "volt",
  done: "Resolved",
  question: "Resolve this alert?",
  confirm: "Resolve alert",
};
const KEEP_OPEN: AlertAction = {
  status: "under-review",
  label: "Keep open",
  phrase: null,
  consequence: "Marks the alert as under investigation with your note. It stays in the attention queue.",
  tone: "volt",
  done: "Kept open",
  question: "Keep this alert open?",
  confirm: "Keep alert open",
};
const REOPEN: AlertAction = { ...KEEP_OPEN, label: "Reopen", consequence: "Reopens the alert as under investigation. It returns to the attention queue.", done: "Reopened", question: "Reopen this alert?", confirm: "Reopen alert" };
const PAUSE: AlertAction = {
  status: "paused",
  label: "Pause exposure",
  phrase: null,
  consequence: "Records the alert as exposure paused while you investigate. It stays open.",
  tone: "danger",
  done: "Exposure paused",
  question: "Pause exposure on this alert?",
  confirm: "Pause exposure",
};
const CLOSE_BLOCKED: AlertAction = {
  status: "blocked",
  label: "Close as blocked",
  phrase: CONFIRM_PHRASES.blockEntity,
  consequence: "Closes this alert as blocked. To stop the organizer from operating, use Block organizer below.",
  tone: "danger",
  done: "Closed as blocked",
  question: "Close this alert as blocked?",
  confirm: "Close as blocked",
};

/**
 * Alert status changes (setMarketplaceEntityStatus, entityType "risk-alert"); no-ops are hidden.
 * Resolve, Pause exposure and Close as blocked keep GovernanceRoutePage's "resolved" / "paused" / "blocked"
 * (blocked is a distinct closed disposition in the audit trail); Keep open writes "under-review".
 */
export function alertActions(status: string | null): AlertAction[] {
  const s = status ?? "open";
  if (s === "under-review") return [RESOLVE, PAUSE, CLOSE_BLOCKED];
  if (s === "paused") return [RESOLVE, KEEP_OPEN, CLOSE_BLOCKED];
  if (!isOpenRisk({ status: s })) return [REOPEN];
  return [RESOLVE, KEEP_OPEN, PAUSE, CLOSE_BLOCKED];
}

/**
 * The entity "Block entity" may target. Only organizers: alerts never name an arena, and
 * events are never blocked from here (overwriting an event's status breaks cancel and refunds).
 */
export function blockTarget(a: RiskAlert): { entityType: "organizer"; id: string } | null {
  return a.orgId ? { entityType: "organizer", id: a.orgId } : null;
}

/* ----------------------------------------------------------------- reviews */

export interface ModReview {
  id: string;
  rating: number | null;
  comment: string | null;
  author: string | null;
  status: string | null;
  eventId: string | null;
  experienceId: string | null;
  orgId: string | null;
  /** updatedAt (falls back to createdAt): sort key only; moderation moves it. */
  at: Date | null;
  /** When the review was first posted (createdAt): shown on the card. */
  postedAt: Date | null;
  moderationReason: string | null;
  moderatedAt: Date | null;
  version: number;
}

export function toModReview(id: string, d: Raw): ModReview {
  const r = num(d.rating);
  const m = obj(d.moderation);
  return {
    id,
    rating: r !== null && r >= 1 && r <= 5 ? r : null,
    comment: str(d.comment),
    author: str(d.authorName),
    status: str(d.status),
    eventId: str(d.eventId),
    experienceId: str(d.experienceId),
    orgId: str(d.orgId),
    at: toDate(d.updatedAt) ?? toDate(d.createdAt),
    postedAt: toDate(d.createdAt),
    moderationReason: m ? str(m.reason) : null,
    moderatedAt: m ? toDate(m.at) : null,
    version: entityVersion(d.version),
  };
}

export type ReviewFilter = "all" | "published" | "hidden";

export const REVIEW_FILTERS: Array<{ id: ReviewFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "published", label: "Published" },
  { id: "hidden", label: "Hidden" },
];

export function reviewCounts(reviews: ModReview[]): Record<ReviewFilter, number> {
  return {
    all: reviews.length,
    published: reviews.filter((r) => r.status === "published").length,
    hidden: reviews.filter((r) => r.status === "hidden").length,
  };
}

export function filterReviews(reviews: ModReview[], filter: ReviewFilter, search: string, titles: Record<string, string | null> = {}): ModReview[] {
  const q = search.trim().toLowerCase();
  return reviews.filter((r) => {
    if (filter !== "all" && r.status !== filter) return false;
    if (!q) return true;
    const title = r.eventId ? titles[r.eventId] : null;
    return [r.comment, r.author, r.eventId, r.orgId, r.id, title].some((v) => v && v.toLowerCase().includes(q));
  });
}

export function sortReviews(reviews: ModReview[]): ModReview[] {
  return [...reviews].sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0) || a.id.localeCompare(b.id));
}

/** Distinct non-empty ids, sorted, capped (the batch for a one-read-per-id lookup). */
export function distinctIds(values: Array<string | null>, max: number): string[] {
  return [...new Set(values.filter((x): x is string => !!x))].sort().slice(0, max);
}

/** The resolved name, or the raw id (flagged so it can be shown as an id) when none resolved. */
export function nameOrId(id: string, names: Record<string, string | null>): { text: string; isName: boolean } {
  const name = names[id];
  return name ? { text: name, isName: true } : { text: id, isName: false };
}

export interface ModerationAction {
  status: "published" | "hidden";
  label: string;
  consequence: string;
  tone: "volt" | "danger";
}

/** moderateReview targets; the current status is not offered (the server would only re-audit it). */
export function moderationAction(status: string | null): ModerationAction {
  return status === "hidden"
    ? { status: "published", label: "Publish", consequence: "Makes the review visible again and restores it to the organizer's and experience's rating aggregates.", tone: "volt" }
    : { status: "hidden", label: "Hide", consequence: "Removes the review from PULSE and from the organizer's and experience's rating aggregates.", tone: "danger" };
}
