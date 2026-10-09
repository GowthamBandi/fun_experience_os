/**
 * Pure helpers for the Organizers grid and Organizer 360 (no Firebase imports).
 * Field names verified in firebase/functions/src: organizers (governance/service.ts
 * onboardApprovedOrganizer), publicOrganizers (organizerOnboarding.ts publicOrganizerDoc),
 * memberships (access/permissions.ts), reviews (catalog/reviews.ts),
 * commercialAgreements (commerce/agreements.ts), eventCommercials (catalog/events.ts),
 * settlements (commerce/settlements.ts) and auditEvents (platform/audit.ts, governance/service.ts).
 */

import type { BadgeTone } from "@/components/pulse/Badge";
import type { EntityStatus } from "./console/actions";
import { CONFIRM_PHRASES } from "./console/actions";
import { toDate } from "./console/records";
import { auditTitle, auditTone } from "./overview";

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);

/* ------------------------------------------------------------------ status */

export type OrgFilter = "all" | "active" | "paused" | "blocked";

export const ORG_FILTERS: Array<{ id: OrgFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "paused", label: "Paused" },
  { id: "blocked", label: "Blocked" },
];

const STATUS_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "ok" },
  paused: { label: "Paused", tone: "warn" },
  blocked: { label: "Blocked", tone: "err" },
  "under-review": { label: "Under review", tone: "info" },
};

export function orgStatusBadge(status: unknown): { label: string; tone: BadgeTone } {
  const s = str(status);
  if (!s) return { label: "—", tone: "muted" };
  return STATUS_BADGE[s] ?? { label: s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, " "), tone: "muted" };
}

/** Same rule as the server's asVersion (governance/service.ts): a missing or non-integer version is 0. */
export function entityVersion(value: unknown): number {
  return Number.isSafeInteger(value) ? (value as number) : 0;
}

/* -------------------------------------------------------------------- grid */

export interface OrgCard {
  id: string;
  name: string;
  handle: string | null;
  city: string | null;
  categories: string[];
  status: string | null;
  since: Date | null;
  /** null when the public projection is unknown (read failed, truncated or doc missing). */
  verified: boolean | null;
  rating: number | null;
  /** null when unknown; a known projection without aggregates has 0 ratings. */
  ratingCount: number | null;
  version: number;
}

/** organizers (authoritative status/version) merged with publicOrganizers (display fields); a null/undefined `pub` means unknown. */
export function mergeOrganizer(id: string, org: Raw, pub: Raw | null | undefined): OrgCard {
  const known = !!pub;
  const p = pub ?? {};
  const pubCategories = strings(p.categories);
  return {
    id,
    name: str(p.name) ?? str(org.name) ?? str(org.subject) ?? "—",
    handle: str(p.handle) ?? str(org.handle),
    city: str(p.city) ?? str(org.city),
    categories: pubCategories.length ? pubCategories : strings(org.categories),
    status: str(org.status),
    since: toDate(p.hostingSince) ?? toDate(org.createdAt),
    verified: known && typeof p.verified === "boolean" ? p.verified : null,
    rating: num(p.ratingAverage),
    ratingCount: known ? num(p.ratingCount) ?? 0 : null,
    version: entityVersion(org.version),
  };
}

export function orgCounts(cards: OrgCard[]): Record<OrgFilter, number> {
  const counts: Record<OrgFilter, number> = { all: cards.length, active: 0, paused: 0, blocked: 0 };
  for (const c of cards) if (c.status === "active" || c.status === "paused" || c.status === "blocked") counts[c.status]++;
  return counts;
}

/** Status filter plus a case-insensitive search over name, handle, city, categories and id. */
export function filterOrganizers(cards: OrgCard[], filter: OrgFilter, search: string): OrgCard[] {
  const q = search.trim().toLowerCase();
  return cards.filter((c) => {
    if (filter !== "all" && c.status !== filter) return false;
    if (!q) return true;
    return [c.name, c.handle, c.city, c.id, ...c.categories].some((v) => v && v.toLowerCase().includes(q));
  });
}

/** Active first, then paused, blocked and the rest; alphabetical inside each group. */
export function sortOrganizers(cards: OrgCard[]): OrgCard[] {
  const rank = (s: string | null) => (s === "active" ? 0 : s === "paused" ? 1 : s === "blocked" ? 2 : 3);
  return [...cards].sort((a, b) => rank(a.status) - rank(b.status) || a.name.localeCompare(b.name, "en-IN"));
}

/* ----------------------------------------------------------------- ratings */

/** Mean of published review ratings (1–5); hidden or malformed reviews are ignored. */
export function averageRating(reviews: Raw[]): { average: number | null; count: number } {
  let sum = 0;
  let count = 0;
  for (const r of reviews) {
    const rating = num(r.rating);
    if (r.status === "hidden" || rating === null || rating < 1 || rating > 5) continue;
    sum += rating;
    count++;
  }
  return { average: count ? Math.round((sum / count) * 10) / 10 : null, count };
}

/* ------------------------------------------------------------ status actions */

export interface StatusAction {
  status: Extract<EntityStatus, "active" | "paused" | "blocked">;
  label: string;
  /** Typed confirmation phrase, when the action is high-risk. */
  phrase: string | null;
  consequence: string;
  tone: "volt" | "danger";
}

const PAUSE: StatusAction = {
  status: "paused",
  label: "Pause",
  phrase: CONFIRM_PHRASES.suspendOrganizer,
  consequence: "Pauses this organizer: they can't publish or sell until reactivated. Existing bookings are not refunded by this action.",
  tone: "danger",
};
const BLOCK: StatusAction = {
  status: "blocked",
  label: "Block",
  phrase: CONFIRM_PHRASES.suspendOrganizer,
  consequence: "Blocks this organizer: they can't publish or sell until reactivated. Existing bookings are not refunded by this action.",
  tone: "danger",
};
const REACTIVATE: StatusAction = {
  status: "active",
  label: "Reactivate",
  phrase: null,
  consequence: "Sets the organizer back to active so they can publish and sell again.",
  tone: "volt",
};

/** The status changes offered from the current status (the server accepts any; we hide no-ops). */
export function statusActions(status: unknown): StatusAction[] {
  switch (status) {
    case "active": return [PAUSE, BLOCK];
    case "paused": return [REACTIVATE, BLOCK];
    case "blocked": return [REACTIVATE];
    default: return [REACTIVATE, PAUSE, BLOCK];
  }
}

/* ------------------------------------------------------------------- money */

export function commissionLabel(bps: unknown): string {
  const b = num(bps);
  if (b === null) return "—";
  return `${(b / 100).toFixed(2).replace(/\.?0+$/, "")}%`;
}

/** The approved agreement in force (newest decision wins) and any pending proposals, newest first. */
export function agreementSummary(agreements: Array<{ id: string; raw: Raw }>) {
  const at = (r: Raw) => (toDate(r.decidedAt) ?? toDate(r.createdAt) ?? toDate(r.proposedAt))?.getTime() ?? 0;
  const newest = [...agreements].sort((a, b) => at(b.raw) - at(a.raw));
  return {
    current: newest.find((a) => a.raw.status === "approved") ?? null,
    pending: newest.filter((a) => a.raw.status === "pending-approval"),
    history: newest,
  };
}

const AGREEMENT_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  approved: { label: "In force", tone: "ok" },
  "pending-approval": { label: "Pending approval", tone: "warn" },
  rejected: { label: "Rejected", tone: "err" },
  superseded: { label: "Superseded", tone: "muted" },
};

export function agreementBadge(status: unknown): { label: string; tone: BadgeTone } {
  const s = str(status);
  return (s && AGREEMENT_BADGE[s]) || { label: s ?? "—", tone: "muted" };
}

const SETTLEMENT_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  accruing: { label: "Accruing", tone: "info" },
  "pending-approval": { label: "Pending approval", tone: "warn" },
  approved: { label: "Approved", tone: "violet" },
  held: { label: "Held", tone: "err" },
  paid: { label: "Paid", tone: "ok" },
  empty: { label: "Empty", tone: "muted" },
};

export function settlementBadge(status: unknown): { label: string; tone: BadgeTone } {
  const s = str(status);
  return (s && SETTLEMENT_BADGE[s]) || { label: s ?? "—", tone: "muted" };
}

/* ------------------------------------------------------------------ events */

const EVENT_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "muted" },
  submitted: { label: "In review", tone: "info" },
  "under-review": { label: "In review", tone: "info" },
  approved: { label: "Approved", tone: "violet" },
  published: { label: "Published", tone: "ok" },
  "booking-closed": { label: "Booking closed", tone: "warn" },
  live: { label: "Live", tone: "info" },
  completed: { label: "Completed", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "err" },
  rejected: { label: "Rejected", tone: "err" },
  "changes-requested": { label: "Changes requested", tone: "warn" },
};

export function eventBadge(status: unknown): { label: string; tone: BadgeTone } {
  const s = str(status);
  return (s && EVENT_BADGE[s]) || { label: s ?? "—", tone: "muted" };
}

export interface OrgEventRow {
  id: string;
  title: string;
  category: string | null;
  venue: string | null;
  startsAt: Date | null;
  status: string | null;
  sold: number | null;
  capacity: number | null;
  priceMinor: number | null;
}

/** Sold = confirmed paid + complimentary (occupancy counters); capacity = maxPhysicalCapacity, falling back to capacity.max. */
export function toOrgEvent(id: string, d: Raw): OrgEventRow {
  const occ = d.occupancy && typeof d.occupancy === "object" ? (d.occupancy as Raw) : null;
  const cap = d.capacity && typeof d.capacity === "object" ? (d.capacity as Raw) : null;
  const venue = d.venue && typeof d.venue === "object" ? (d.venue as Raw) : null;
  const paid = occ ? num(occ.confirmedPaidBookings) : null;
  const comp = occ ? num(occ.confirmedComplimentaryBookings) : null;
  return {
    id,
    title: str(d.title) ?? str(d.name) ?? "—",
    category: str(d.category),
    venue: venue ? [str(venue.name), str(venue.city)].filter(Boolean).join(" · ") || null : str(d.location),
    startsAt: toDate(d.startsAt),
    status: str(d.status),
    sold: paid === null && comp === null ? null : (paid ?? 0) + (comp ?? 0),
    capacity: cap ? num(cap.maxPhysicalCapacity) ?? num(cap.max) : null,
    priceMinor: num(d.priceMinor),
  };
}

const EXPERIENCE_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "muted" },
  submitted: { label: "In review", tone: "info" },
  "under-review": { label: "In review", tone: "info" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "err" },
  "changes-requested": { label: "Changes requested", tone: "warn" },
  "information-requested": { label: "Changes requested", tone: "warn" },
  superseded: { label: "Superseded", tone: "muted" },
};

export function experienceBadge(status: unknown): { label: string; tone: BadgeTone } {
  const s = str(status);
  return (s && EXPERIENCE_BADGE[s]) || { label: s ?? "—", tone: "muted" };
}

export interface OrgExperienceRow {
  id: string;
  title: string;
  tagline: string | null;
  category: string | null;
  activity: string | null;
  status: string | null;
  rating: number | null;
  ratingCount: number;
  updatedAt: Date | null;
  revision: number | null;
  seed: number;
}

export function toOrgExperience(id: string, d: Raw): OrgExperienceRow {
  const count = num(d.ratingCount) ?? 0;
  const sum = num(d.ratingSum);
  const cover = d.coverStyle && typeof d.coverStyle === "object" ? (d.coverStyle as Raw) : null;
  return {
    id,
    title: str(d.title) ?? "—",
    tagline: str(d.tagline),
    category: str(d.category),
    activity: str(d.activity),
    status: str(d.status),
    rating: count > 0 && sum !== null ? Math.round((sum / count) * 10) / 10 : null,
    ratingCount: count,
    updatedAt: toDate(d.updatedAt) ?? toDate(d.createdAt),
    revision: num(d.revision),
    seed: num(cover?.seed) ?? 0,
  };
}

/* -------------------------------------------------------------------- team */

export interface MemberRow {
  id: string;
  uid: string;
  role: string;
  status: string | null;
  title: string | null;
  permissions: string[];
  scope: string;
  since: Date | null;
}

export function toMember(id: string, d: Raw): MemberRow {
  const scope = d.eventScope && typeof d.eventScope === "object" ? (d.eventScope as Raw) : null;
  const ids = scope ? strings(scope.eventIds) : [];
  return {
    id,
    uid: str(d.uid) ?? id.split("__")[1] ?? id,
    role: str(d.role) ?? "—",
    status: str(d.status),
    title: str(d.title),
    permissions: strings(d.permissions),
    scope: d.role === "owner" || scope?.all === true ? "All events" : ids.length ? `${ids.length} ${ids.length === 1 ? "event" : "events"}` : "—",
    since: toDate(d.activatedAt) ?? toDate(d.createdAt),
  };
}

const MEMBER_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "ok" },
  pending: { label: "Invited", tone: "warn" },
  revoked: { label: "Revoked", tone: "err" },
};

export function memberBadge(status: unknown): { label: string; tone: BadgeTone } {
  const s = str(status);
  return (s && MEMBER_BADGE[s]) || { label: s ?? "—", tone: "muted" };
}

/** Owners first, then active staff, then revoked; newest first inside each group. */
export function sortMembers(rows: MemberRow[]): MemberRow[] {
  const rank = (m: MemberRow) => (m.role === "owner" ? 0 : m.status === "active" ? 1 : 2);
  return [...rows].sort((a, b) => rank(a) - rank(b) || (b.since?.getTime() ?? 0) - (a.since?.getTime() ?? 0));
}

/* ---------------------------------------------------------------- timeline */

export interface AuditRow {
  id: string;
  raw: Raw;
}

export interface OrgTimelineItem {
  id: string;
  at: Date | null;
  title: string;
  body?: string;
  tone: BadgeTone;
  actor: string;
}

function statusChange(raw: Raw): string | null {
  const before = raw.before && typeof raw.before === "object" ? str((raw.before as Raw).status) : null;
  const after = raw.after && typeof raw.after === "object" ? str((raw.after as Raw).status) : null;
  if (before && after && before !== after) return `${before} → ${after}`;
  return null;
}

function actorLabel(raw: Raw): string {
  const role = str(raw.actorRole) ?? str(raw.actorRoleId);
  if (!role) return "—";
  if (role === "customer") return "Customer";
  if (role === "system") return "System";
  if (/^org:[^:]+:owner$/.test(role)) return "Organizer owner";
  if (/^org:[^:]+:staff$/.test(role)) return "Organizer staff";
  const platform = role.replace(/^platform:/, "");
  return platform === "platform-owner" ? "Platform Owner" : platform === "super-admin" ? "Super Admin" : platform;
}

/** Audit events about the org (orgId) and on the org itself (resourceId), merged, de-duplicated, newest first. */
export function orgTimeline(byOrg: AuditRow[], byResource: AuditRow[]): OrgTimelineItem[] {
  const seen = new Map<string, AuditRow>();
  for (const r of [...byOrg, ...byResource]) seen.set(r.id, r);
  return [...seen.values()]
    .map((r) => {
      const reason = str(r.raw.reason);
      const change = statusChange(r.raw);
      const body = [change, reason ? `“${reason}”` : null].filter(Boolean).join(" · ");
      return { id: r.id, at: toDate(r.raw.at), title: auditTitle(r.raw.action), body: body || undefined, tone: auditTone(r.raw.action), actor: actorLabel(r.raw) };
    })
    .sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));
}
