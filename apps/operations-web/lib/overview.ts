/**
 * Command Center logic kept free of React and Firebase so it can be unit-tested:
 * event shaping for Live now / Top cities, the Needs-you rows, and the headline.
 */

import type { BadgeTone } from "@/components/pulse/Badge";
import { isOpenCase, isOpenRisk, type Severity } from "@/lib/console/attention";
import { REFUND_REASON_LABEL, refundStage, toDate } from "@/lib/console/records";
import { inrMinor, relTime } from "@/lib/format";
import { readNumber, type RangeKey } from "@/lib/metrics";

const IST = "Asia/Kolkata";
const HOUR = 3_600_000;

/* ---------------------------------------------------------------- greeting */

export function greetingFor(now: Date): { date: string; greeting: string } {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: IST }).format(now));
  const part = hour < 5 ? "evening" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const date = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: IST }).format(now);
  return { date, greeting: `Good ${part}` };
}

export type HeadlineState = { kind: "buzzing" } | { kind: "needs"; n: number } | { kind: "quiet" } | { kind: "neutral" };

/** Live events win; otherwise open attention items; otherwise quiet. A failed source (`degraded`) gets a neutral line, since any count could be wrong. */
export function headlineFor(live: number, attention: number, degraded = false): HeadlineState {
  if (degraded) return { kind: "neutral" };
  if (live > 0) return { kind: "buzzing" };
  if (attention > 0) return { kind: "needs", n: attention };
  return { kind: "quiet" };
}

export const RANGE_KEYS: RangeKey[] = ["today", "7d", "30d"];
export const RANGE_LABEL: Record<RangeKey, string> = { today: "Today", "7d": "7 days", "30d": "30 days" };
export const RANGE_COMPARE: Record<RangeKey, string> = { today: "vs yesterday", "7d": "vs prev 7 days", "30d": "vs prev 30 days" };

export function parseRange(value: string | null | undefined): RangeKey {
  return RANGE_KEYS.includes(value as RangeKey) ? (value as RangeKey) : "today";
}

/** 0.873 → "87%", 0.016 → "1.6%"; null → "—". */
export function percent(r: number | null): string {
  if (r === null || !Number.isFinite(r)) return "—";
  const p = r * 100;
  return p > 0 && p < 10 ? `${p.toFixed(1).replace(/\.0$/, "")}%` : `${Math.round(p)}%`;
}

export const countFull = (n: number | null): string => (n === null || !Number.isFinite(n) ? "—" : new Intl.NumberFormat("en-IN").format(n));

/* ------------------------------------------------------------------ events */

export interface Ev {
  id: string;
  title: string;
  orgId: string | null;
  organizerName: string | null;
  city: string | null;
  category: string | null;
  startsAt: Date | null;
  /** Stored end, or startsAt + 3 h when the doc has none (`endsAssumed`). */
  endsAt: Date | null;
  endsAssumed: boolean;
  status: string;
  /** capacity.maxPhysicalCapacity (what catalog/events.ts stores), falling back to capacity.max. */
  capacity: number | null;
  /** occupancy.confirmedPaidBookings + confirmedComplimentaryBookings. */
  taken: number | null;
  /** occupancy.confirmedPaidBookings alone: the spots that brought money in. */
  paid: number | null;
  /** Ticket price per spot, in paise. */
  priceMinor: number | null;
  checkedIn?: number;
}

export const ASSUMED_DURATION_MS = 3 * HOUR;
/** Statuses an event can run under; drafts, submissions, cancellations and completed events are never "live". */
export const RUNNING_STATUSES = new Set(["published", "booking-closed", "live"]);
/** Statuses counted in Top cities: scheduled for the public or already run. */
export const SCHEDULED_STATUSES = new Set([...RUNNING_STATUSES, "completed"]);

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function toEv(id: string, data: Record<string, unknown>): Ev {
  const capacity = obj(data.capacity);
  const occupancy = obj(data.occupancy);
  const paid = readNumber(occupancy.confirmedPaidBookings);
  const comp = readNumber(occupancy.confirmedComplimentaryBookings);
  const startsAt = toDate(data.startsAt);
  const storedEnd = toDate(data.endsAt);
  return {
    id,
    title: str(data.title) ?? str(data.name) ?? "Untitled event",
    orgId: str(data.orgId),
    organizerName: str(data.organizerName),
    city: str(obj(data.venue).city),
    category: str(data.category),
    startsAt,
    endsAt: storedEnd ?? (startsAt ? new Date(startsAt.getTime() + ASSUMED_DURATION_MS) : null),
    endsAssumed: !storedEnd && !!startsAt,
    status: str(data.status) ?? "unknown",
    capacity: readNumber(capacity.maxPhysicalCapacity) ?? readNumber(capacity.max),
    taken: paid === null && comp === null ? null : (paid ?? 0) + (comp ?? 0),
    paid,
    priceMinor: readNumber(data.priceMinor),
  };
}

/** Live: running status and startsAt ≤ now < endsAt. Soon: running status, starting within 12 h. */
export function splitLive(events: Ev[], now: Date): { live: Ev[]; soon: Ev[] } {
  const t = now.getTime();
  const live: Ev[] = [];
  const soon: Ev[] = [];
  for (const e of events) {
    if (!RUNNING_STATUSES.has(e.status) || !e.startsAt || !e.endsAt) continue;
    const s = e.startsAt.getTime();
    if (s <= t && t < e.endsAt.getTime()) live.push(e);
    else if (s > t && s <= t + 12 * HOUR) soon.push(e);
  }
  return { live, soon };
}

/**
 * Whether a listener read with a +1 probe (`all` holds up to limit + 1 docs, soonest-ending
 * first) was cut among events that matter: the first left-out one is live or starts within 12 h.
 */
export function liveCutMatters(all: Ev[], limit: number, now: Date): boolean {
  const probe = all.length > limit ? all[limit] : undefined;
  return !!probe?.startsAt && probe.startsAt.getTime() <= now.getTime() + 12 * HOUR;
}

export function cityCounts(events: Ev[]): Array<{ city: string; count: number }> {
  const by = new Map<string, number>();
  for (const e of events) {
    if (!SCHEDULED_STATUSES.has(e.status)) continue;
    const city = e.city ?? "City not set";
    by.set(city, (by.get(city) ?? 0) + 1);
  }
  return [...by.entries()].map(([city, count]) => ({ city, count })).sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
}

const CATEGORY_EMOJI: Record<string, string> = {
  sports: "🏏",
  music: "🎤",
  trips: "🏕️",
  movies: "🎬",
  social: "🎉",
  wellness: "🧘",
  food: "🍜",
  workshops: "🎨",
};

export const categoryEmoji = (category: string | null): string => (category && CATEGORY_EMOJI[category]) || "🎟️";

/* --------------------------------------------------------------- needs you */

type Doc = { id: string; raw: Record<string, unknown> };

export type NeedsKind = "kyc" | "experience" | "event" | "case" | "risk" | "refund" | "settlement";

export interface NeedsRow {
  key: string;
  kind: NeedsKind;
  emoji: string;
  tone: BadgeTone;
  severity: Severity;
  title: string;
  meta: string;
  at: Date | null;
  href: string;
}

export const NEEDS_GLYPH: Record<NeedsKind, { emoji: string; tone: BadgeTone }> = {
  kyc: { emoji: "🪪", tone: "violet" },
  experience: { emoji: "🧩", tone: "info" },
  event: { emoji: "🗓️", tone: "violet" },
  case: { emoji: "📋", tone: "muted" },
  risk: { emoji: "🚨", tone: "err" },
  refund: { emoji: "💸", tone: "warn" },
  settlement: { emoji: "🏦", tone: "info" },
};

const RANK: Record<Severity, number> = { critical: 0, high: 1, normal: 2 };
const dot = (...parts: Array<string | null | undefined>) => parts.filter((p) => p && p !== "—").join(" · ");
const href = (path: string, param: string, id: string) => `${path}?${param}=${encodeURIComponent(id)}`;
const words = (s: string) => s.replace(/[-_]+/g, " ");

/**
 * One row per open item, using the same "open" rules as buildAttentionQueue,
 * most severe first and, within a severity, the longest-waiting first.
 */
export function needsYouRows(
  input: { governanceCases: Doc[]; riskAlerts: Doc[]; refunds: Doc[]; settlements: Doc[] },
  now: Date,
): NeedsRow[] {
  const rows: NeedsRow[] = [];
  const push = (kind: NeedsKind, r: Omit<NeedsRow, "kind" | "emoji" | "tone">) => rows.push({ kind, ...NEEDS_GLYPH[kind], ...r });

  for (const { id, raw } of input.governanceCases) {
    if (!isOpenCase(raw)) continue;
    const at = toDate(raw.createdAt) ?? toDate(raw.updatedAt);
    const subject = str(raw.subject) ?? "Untitled";
    const when = relTime(at, now);
    const common = { key: `case-${id}`, at, href: href("/approvals", "case", id) };
    if (raw.kind === "organizer-kyc") push("kyc", { ...common, severity: "high", title: `${subject} wants to host`, meta: dot("Organizer KYC", str(raw.location), when) });
    else if (raw.kind === "experience-approval") push("experience", { ...common, severity: "normal", title: `${subject} is up for review`, meta: dot("Experience", str(raw.summary), when) });
    else if (raw.kind === "event-approval") push("event", { ...common, severity: "normal", title: `${subject} needs approval`, meta: dot("Event", str(raw.location), when) });
    else push("case", { ...common, severity: "normal", title: subject, meta: dot("Case", str(raw.kind) && words(String(raw.kind)), when) });
  }

  for (const { id, raw } of input.riskAlerts) {
    if (!isOpenRisk(raw)) continue;
    const at = toDate(raw.createdAt);
    const high = raw.severity === "high" || raw.severity === "critical" || raw.status === "on-hold";
    push("risk", {
      key: `risk-${id}`,
      severity: high ? "critical" : "normal",
      title: str(raw.summary) ?? (str(raw.kind) ? words(String(raw.kind)) : "Risk alert"),
      meta: dot("Risk", str(raw.severity), at ? `opened ${relTime(at, now)}` : null),
      at,
      href: href("/risk", "alert", id),
    });
  }

  for (const { id, raw } of input.refunds) {
    const stage = refundStage(raw);
    if (stage === "decided") continue;
    const at = toDate(raw.createdAt);
    const reason = typeof raw.reason === "string" ? REFUND_REASON_LABEL[raw.reason] ?? words(raw.reason) : "Refund";
    push("refund", {
      key: `refund-${id}`,
      severity: stage === "awaiting-second-approver" ? "critical" : "high",
      title: `${reason} · ${inrMinor(readNumber(raw.amountMinor))}`,
      meta: dot("Refunds", stage === "awaiting-second-approver" ? "needs a second approver" : "needs a decision", relTime(at, now)),
      at,
      href: href("/refunds", "refund", id),
    });
  }

  const SETTLEMENT: Record<string, { severity: Severity; title: string }> = {
    held: { severity: "critical", title: "Settlement on hold" },
    "pending-approval": { severity: "high", title: "Settlement ready to approve" },
    approved: { severity: "high", title: "Approved payout to send" },
  };
  for (const { id, raw } of input.settlements) {
    const s = SETTLEMENT[String(raw.status)];
    if (!s) continue;
    const at = toDate(raw.createdAt);
    const who = str(raw.organizerName) ?? str(raw.orgName) ?? (str(raw.orgId) ? `org ${str(raw.orgId)}` : null);
    push("settlement", {
      key: `settlement-${id}`,
      severity: s.severity,
      title: `${s.title} · ${inrMinor(readNumber(raw.netMinor))}`,
      meta: dot("Money", who, relTime(at, now)),
      at,
      href: href("/settlements", "settlement", id),
    });
  }

  const age = (r: NeedsRow) => r.at?.getTime() ?? Number.POSITIVE_INFINITY;
  return rows.sort((a, b) => RANK[a.severity] - RANK[b.severity] || age(a) - age(b));
}

/* ------------------------------------------------------------ audit labels */

/** "governance.case-decided" → "Governance · case decided". */
export function auditTitle(action: unknown): string {
  if (typeof action !== "string" || !action.trim()) return "Unnamed action";
  const [head, ...rest] = action.split(".");
  const domain = head.charAt(0).toUpperCase() + head.slice(1);
  return rest.length ? `${domain} · ${words(rest.join(" "))}` : words(domain);
}

export function auditTone(action: unknown): BadgeTone {
  const a = typeof action === "string" ? action : "";
  if (/reject|cancel|block|disable|suspend|hidden/.test(a)) return "err";
  if (/hold|changes|reissue/.test(a)) return "warn";
  if (/approve|paid|publish|release|activ/.test(a)) return "ok";
  return "violet";
}
