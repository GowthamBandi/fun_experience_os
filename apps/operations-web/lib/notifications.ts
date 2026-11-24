/**
 * Notification center — pure logic (no Firestore, no React), unit-tested in
 * tests/unit/notifications.test.ts.
 *
 * Field names, limits and statuses follow docs/NOTIFICATION_CENTER_CONTRACT.md
 * (sections 1, 2 and 5). The server re-validates everything; these checks only
 * stop obvious mistakes before a callable round trip and drive the composer's
 * live preview.
 */

import type { BadgeTone } from "@/components/pulse/Badge";
import { toDate } from "./console/records";

type Raw = Record<string, unknown>;

/* ------------------------------------------------------------------ enums */

export const FORMATS = ["modal", "fullscreen", "sheet", "banner", "inbox"] as const;
export type AnnouncementFormat = (typeof FORMATS)[number];

export const TONES = ["info", "success", "warning", "critical", "promo"] as const;
export type Tone = (typeof TONES)[number];

export const FREQUENCIES = ["once", "daily", "every-open"] as const;
export type Frequency = (typeof FREQUENCIES)[number];

export const ANNOUNCEMENT_STATUSES = ["draft", "scheduled", "live", "paused", "ended", "archived"] as const;
export type AnnouncementStatus = (typeof ANNOUNCEMENT_STATUSES)[number];

export const AUDIENCE_TYPES = ["all", "customers", "organizers", "cities", "users", "orgs"] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

export const PLATFORMS = ["android", "ios"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const NOTIFICATION_STYLES = ["standard", "rich"] as const;
export type NotificationStyle = (typeof NOTIFICATION_STYLES)[number];

/** The app's notification link types (firebase/functions/src/platform/notify.ts NotificationLinkType). */
export const LINK_TYPES = [
  { value: "event", label: "Event", idLabel: "Event ID" },
  { value: "trip-departure", label: "Trip departure", idLabel: "Departure ID" },
  { value: "organizer", label: "Organizer profile", idLabel: "Organizer ID" },
  { value: "experience", label: "Experience", idLabel: "Experience ID" },
  { value: "booking", label: "Booking", idLabel: "Booking ID" },
  { value: "ticket", label: "Ticket", idLabel: "Ticket ID" },
  { value: "trip-booking", label: "Trip booking", idLabel: "Trip booking ID" },
  { value: "support-request", label: "Support request", idLabel: "Request ID" },
  { value: "host-trip", label: "Host trip (organizer workspace)", idLabel: "Host trip ID" },
  { value: "payout-account", label: "Payout account (organizer workspace)", idLabel: "Organization ID" },
  { value: "application", label: "Organizer application", idLabel: "Applicant uid" },
] as const;
export type LinkType = (typeof LINK_TYPES)[number]["value"];
const LINK_VALUES = LINK_TYPES.map((l) => l.value) as readonly string[];

/* ---------------------------------------------------------------- limits */

export const LIMITS = {
  announcementTitle: [3, 80],
  announcementBody: [0, 600],
  notificationTitle: [3, 65],
  notificationBody: [5, 240],
  ctaLabel: [1, 30],
  priority: [0, 100],
  reason: [3, 500],
  templateName: [3, 60],
  maxUids: 500,
  maxOrgIds: 100,
  maxExclusions: 500,
  maxCities: 50,
  maxBuild: 1_000_000,
  /** scheduleAt: 2 minutes .. 60 days ahead (contract §5). */
  scheduleMinMs: 2 * 60_000,
  scheduleMaxMs: 60 * 86_400_000,
  templatePayloadBytes: 20_000,
} as const;

/* ------------------------------------------------------------ presentation */

export interface FormatMeta {
  label: string;
  description: string;
  /** Where the preview draws it. */
  placement: "center" | "full" | "bottom" | "top" | "inbox";
  /** Popups show one at a time over the app; banners and inbox items don't interrupt. */
  popup: boolean;
}

export const FORMAT_META: Record<AnnouncementFormat, FormatMeta> = {
  modal: { label: "Centre popup", description: "A card in the middle of the screen when the app opens.", placement: "center", popup: true },
  fullscreen: { label: "Full screen", description: "Takes over the whole screen — launches and big news.", placement: "full", popup: true },
  sheet: { label: "Bottom sheet", description: "Slides up from the bottom; softer than a popup.", placement: "bottom", popup: true },
  banner: { label: "Top banner", description: "A strip at the top of Explore (customers) and Today (hosts).", placement: "top", popup: false },
  inbox: { label: "Inbox only", description: "Only an item in the notifications list. Nothing pops up.", placement: "inbox", popup: false },
};

export interface ToneMeta {
  label: string;
  /** Accent colour (hex) for the icon, CTA and stripe. */
  accent: string;
  /** Soft background tint. */
  soft: string;
  /** Text colour on the accent (CTA label). */
  onAccent: string;
  badge: BadgeTone;
  icon: "info" | "check" | "alert" | "shield" | "sparkles";
}

export const TONE_META: Record<Tone, ToneMeta> = {
  info: { label: "Info", accent: "#63BEFF", soft: "rgba(99,190,255,0.16)", onAccent: "#06121C", badge: "info", icon: "info" },
  success: { label: "Success", accent: "#3FDD9A", soft: "rgba(63,221,154,0.16)", onAccent: "#04150D", badge: "ok", icon: "check" },
  warning: { label: "Warning", accent: "#FFB84D", soft: "rgba(255,184,77,0.16)", onAccent: "#1D1203", badge: "warn", icon: "alert" },
  critical: { label: "Critical", accent: "#FF6178", soft: "rgba(255,97,120,0.16)", onAccent: "#1E0509", badge: "err", icon: "shield" },
  promo: { label: "Promo", accent: "#D9FF3F", soft: "rgba(217,255,63,0.14)", onAccent: "#141A00", badge: "volt", icon: "sparkles" },
};

export const FREQUENCY_META: Record<Frequency, { label: string; description: string }> = {
  once: { label: "Once", description: "Until the person closes it, taps the button or acknowledges it." },
  daily: { label: "Once a day", description: "At most once per day (India time) while it's live." },
  "every-open": { label: "Every open", description: "Each time the app opens while it's live." },
};

export const STATUS_META: Record<AnnouncementStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "muted" },
  scheduled: { label: "Scheduled", tone: "info" },
  live: { label: "Live", tone: "ok" },
  paused: { label: "Paused", tone: "warn" },
  ended: { label: "Ended", tone: "violet" },
  archived: { label: "Archived", tone: "muted" },
};

export const NOTIFICATION_STATUS_META: Record<string, { label: string; tone: BadgeTone }> = {
  scheduled: { label: "Scheduled", tone: "info" },
  sending: { label: "Sending", tone: "violet" },
  sent: { label: "Sent", tone: "ok" },
  failed: { label: "Failed", tone: "err" },
  cancelled: { label: "Cancelled", tone: "muted" },
};

export function notificationStatusBadge(status: unknown): { label: string; tone: BadgeTone } {
  const s = typeof status === "string" ? status : "";
  return NOTIFICATION_STATUS_META[s] ?? { label: s || "—", tone: "muted" };
}

/* --------------------------------------------------------------- audience */

export interface Audience {
  type: AudienceType;
  cities?: string[];
  uids?: string[];
  orgIds?: string[];
  platforms?: Platform[];
  minBuild?: number;
  maxBuild?: number;
  excludeUids?: string[];
}

export interface PersonChip {
  uid: string;
  displayName: string | null;
}

export interface OrgChip {
  orgId: string;
  name: string | null;
}

/** The audience builder's editable state (chips keep names for display; the payload sends ids). */
export interface AudienceForm {
  type: AudienceType;
  cities: string[];
  people: PersonChip[];
  orgs: OrgChip[];
  platforms: Platform[];
  minBuild: string;
  maxBuild: string;
  exclude: PersonChip[];
}

export const EMPTY_AUDIENCE: AudienceForm = { type: "all", cities: [], people: [], orgs: [], platforms: [], minBuild: "", maxBuild: "", exclude: [] };

export const AUDIENCE_META: Record<AudienceType, { label: string; description: string }> = {
  all: { label: "Everyone", description: "Every signed-in person on PULSE." },
  customers: { label: "Customers", description: "People who aren't on any organizer team." },
  organizers: { label: "Organizers", description: "Active members of any organization." },
  cities: { label: "Cities", description: "People whose app is set to one of these cities." },
  users: { label: "Specific people", description: "Up to 500 people you pick." },
  orgs: { label: "Organizations", description: "Every active member of up to 100 organizations." },
};

const buildNumber = (text: string): number | null | "bad" => {
  const t = text.trim();
  if (!t) return null;
  if (!/^\d+$/.test(t)) return "bad";
  const n = Number(t);
  return Number.isSafeInteger(n) && n <= LIMITS.maxBuild ? n : "bad";
};

/** The server's audience object: only the keys that apply, no empty filters. */
export function toAudience(form: AudienceForm): Audience {
  const out: Audience = { type: form.type };
  if (form.type === "cities") out.cities = dedupe(form.cities.map((c) => c.trim()).filter(Boolean));
  if (form.type === "users") out.uids = dedupe(form.people.map((p) => p.uid));
  if (form.type === "orgs") out.orgIds = dedupe(form.orgs.map((o) => o.orgId));
  const platforms = dedupe(form.platforms).filter((p) => (PLATFORMS as readonly string[]).includes(p)) as Platform[];
  if (platforms.length === 1) out.platforms = platforms;
  const min = buildNumber(form.minBuild);
  const max = buildNumber(form.maxBuild);
  if (typeof min === "number") out.minBuild = min;
  if (typeof max === "number") out.maxBuild = max;
  const exclude = dedupe(form.exclude.map((p) => p.uid));
  if (exclude.length) out.excludeUids = exclude;
  return out;
}

/** An announcement / notification document's audience → the builder's state (names filled in later). */
export function audienceFormFrom(raw: unknown): AudienceForm {
  const a = (raw && typeof raw === "object" ? raw : {}) as Raw;
  const type = (AUDIENCE_TYPES as readonly string[]).includes(String(a.type)) ? (a.type as AudienceType) : "all";
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []);
  return {
    type,
    cities: list(a.cities),
    people: list(a.uids).map((uid) => ({ uid, displayName: null })),
    orgs: list(a.orgIds).map((orgId) => ({ orgId, name: null })),
    platforms: list(a.platforms).filter((p): p is Platform => (PLATFORMS as readonly string[]).includes(p)),
    minBuild: typeof a.minBuild === "number" ? String(a.minBuild) : "",
    maxBuild: typeof a.maxBuild === "number" ? String(a.maxBuild) : "",
    exclude: list(a.excludeUids).map((uid) => ({ uid, displayName: null })),
  };
}

/** True when the audience narrows by platform, build or exclusions. */
export function hasFilters(a: Audience): boolean {
  return !!(a.platforms?.length || typeof a.minBuild === "number" || typeof a.maxBuild === "number" || a.excludeUids?.length);
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** One readable line for an audience: "Everyone on PULSE · Android only · build ≥ 120 · 2 excluded". */
export function audienceSummary(a: Audience | null | undefined): string {
  if (!a) return "—";
  const parts: string[] = [];
  switch (a.type) {
    case "all": parts.push("Everyone on PULSE"); break;
    case "customers": parts.push("Customers"); break;
    case "organizers": parts.push("Organizers"); break;
    case "cities": {
      const c = a.cities ?? [];
      parts.push(c.length === 0 ? "No cities chosen" : c.length <= 3 ? `People in ${c.join(", ")}` : `People in ${c.slice(0, 2).join(", ")} + ${c.length - 2} more`);
      break;
    }
    case "users": parts.push(plural(a.uids?.length ?? 0, "specific person", "specific people")); break;
    case "orgs": parts.push(`Members of ${plural(a.orgIds?.length ?? 0, "organization")}`); break;
    default: parts.push("—");
  }
  if (a.platforms?.length === 1) parts.push(a.platforms[0] === "ios" ? "iPhone only" : "Android only");
  const min = typeof a.minBuild === "number" ? a.minBuild : null;
  const max = typeof a.maxBuild === "number" ? a.maxBuild : null;
  if (min !== null && max !== null) parts.push(min === max ? `build ${min}` : `builds ${min}–${max}`);
  else if (min !== null) parts.push(`build ≥ ${min}`);
  else if (max !== null) parts.push(`build ≤ ${max}`);
  if (a.excludeUids?.length) parts.push(`${a.excludeUids.length} excluded`);
  return parts.join(" · ");
}

export interface Problem {
  field: string;
  message: string;
}

/** Audience problems shared by the composer and the send form. */
export function audienceProblems(form: AudienceForm): Problem[] {
  const out: Problem[] = [];
  if (form.type === "cities") {
    const c = form.cities.filter((x) => x.trim());
    if (c.length === 0) out.push({ field: "audience", message: "Choose at least one city." });
    if (c.length > LIMITS.maxCities) out.push({ field: "audience", message: `At most ${LIMITS.maxCities} cities.` });
  }
  if (form.type === "users") {
    if (form.people.length === 0) out.push({ field: "audience", message: "Add at least one person." });
    if (form.people.length > LIMITS.maxUids) out.push({ field: "audience", message: `At most ${LIMITS.maxUids} people.` });
  }
  if (form.type === "orgs") {
    if (form.orgs.length === 0) out.push({ field: "audience", message: "Add at least one organization." });
    if (form.orgs.length > LIMITS.maxOrgIds) out.push({ field: "audience", message: `At most ${LIMITS.maxOrgIds} organizations.` });
  }
  const min = buildNumber(form.minBuild);
  const max = buildNumber(form.maxBuild);
  if (min === "bad") out.push({ field: "minBuild", message: "Minimum build must be a whole number." });
  if (max === "bad") out.push({ field: "maxBuild", message: "Maximum build must be a whole number." });
  if (typeof min === "number" && typeof max === "number" && min > max) out.push({ field: "maxBuild", message: "Maximum build must be at least the minimum build." });
  if (form.exclude.length > LIMITS.maxExclusions) out.push({ field: "exclude", message: `At most ${LIMITS.maxExclusions} exclusions.` });
  return out;
}

/* ------------------------------------------------------------------ links */

/** https only; images may also come from the local Storage emulator. */
export function isHttpsUrl(value: string, opts: { allowEmulator?: boolean } = {}): boolean {
  const t = value.trim();
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return false;
  }
  if (u.protocol === "https:") return !!u.hostname;
  if (opts.allowEmulator && u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return true;
  return false;
}

const LINK_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{3,127}$/;

export type CtaTarget = "none" | "link" | "url";

export interface CtaForm {
  label: string;
  target: CtaTarget;
  linkType: LinkType;
  linkId: string;
  url: string;
}

export const EMPTY_CTA: CtaForm = { label: "", target: "none", linkType: "event", linkId: "", url: "" };

export interface Cta {
  label: string;
  link?: { type: LinkType; id: string };
  url?: string;
}

/** A CTA row → the server object (null when the label is empty). */
export function toCta(form: CtaForm | null): Cta | null {
  if (!form || !form.label.trim()) return null;
  const out: Cta = { label: form.label.trim() };
  if (form.target === "link" && form.linkId.trim()) out.link = { type: form.linkType, id: form.linkId.trim() };
  if (form.target === "url" && form.url.trim()) out.url = form.url.trim();
  return out;
}

export function ctaFormFrom(raw: unknown): CtaForm | null {
  if (!raw || typeof raw !== "object") return null;
  const c = raw as Raw;
  if (typeof c.label !== "string" || !c.label.trim()) return null;
  const link = c.link && typeof c.link === "object" ? (c.link as Raw) : null;
  if (link && typeof link.type === "string" && LINK_VALUES.includes(link.type) && typeof link.id === "string") {
    return { label: c.label, target: "link", linkType: link.type as LinkType, linkId: link.id, url: "" };
  }
  if (typeof c.url === "string" && c.url) return { label: c.label, target: "url", linkType: "event", linkId: "", url: c.url };
  return { label: c.label, target: "none", linkType: "event", linkId: "", url: "" };
}

function ctaProblems(form: CtaForm | null, field: string, name: string): Problem[] {
  if (!form) return [];
  const label = form.label.trim();
  const out: Problem[] = [];
  const touched = label || (form.target === "link" && form.linkId.trim()) || (form.target === "url" && form.url.trim());
  if (!touched) return [];
  if (label.length < LIMITS.ctaLabel[0] || label.length > LIMITS.ctaLabel[1]) out.push({ field, message: `${name} label must be ${LIMITS.ctaLabel[0]}–${LIMITS.ctaLabel[1]} characters.` });
  if (form.target === "link" && !LINK_ID.test(form.linkId.trim())) out.push({ field, message: `${name}: enter a valid ${linkIdLabel(form.linkType).toLowerCase()}.` });
  if (form.target === "url" && !isHttpsUrl(form.url)) out.push({ field, message: `${name}: the web link must start with https://.` });
  return out;
}

export function linkIdLabel(type: string): string {
  return LINK_TYPES.find((l) => l.value === type)?.idLabel ?? "ID";
}

export function linkTypeLabel(type: string): string {
  return LINK_TYPES.find((l) => l.value === type)?.label ?? type;
}

/* --------------------------------------------------------------- IST time */

const IST_MS = 330 * 60_000;

/** A `datetime-local` value read as India time → ISO (null when empty or invalid). */
export function istInputToIso(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5])) - IST_MS;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** A date → the `datetime-local` value in India time ("" when missing). */
export function toIstInput(value: unknown): string {
  const d = toDate(value);
  if (!d) return "";
  return new Date(d.getTime() + IST_MS).toISOString().slice(0, 16);
}

/* ---------------------------------------------------------- announcements */

export interface AnnouncementForm {
  title: string;
  body: string;
  format: AnnouncementFormat;
  tone: Tone;
  imageUrl: string;
  primaryCta: CtaForm;
  secondaryCta: CtaForm;
  dismissible: boolean;
  requireAck: boolean;
  frequency: Frequency;
  priority: number;
  audience: AudienceForm;
  startMode: "now" | "at";
  /** datetime-local, India time. */
  startsAt: string;
  /** datetime-local, India time; "" = no end. */
  endsAt: string;
  sendPush: boolean;
}

export const EMPTY_ANNOUNCEMENT: AnnouncementForm = {
  title: "",
  body: "",
  format: "modal",
  tone: "info",
  imageUrl: "",
  primaryCta: EMPTY_CTA,
  secondaryCta: EMPTY_CTA,
  dismissible: true,
  requireAck: false,
  frequency: "once",
  priority: 50,
  audience: EMPTY_AUDIENCE,
  startMode: "now",
  startsAt: "",
  endsAt: "",
  sendPush: false,
};

const pick = <T extends string>(v: unknown, options: readonly T[], fallback: T): T => ((options as readonly unknown[]).includes(v) ? (v as T) : fallback);

/** An announcements/{id} document (or a template payload) → the composer's state. */
export function announcementFormFrom(raw: Raw | null | undefined): AnnouncementForm {
  const r = raw ?? {};
  const start = toIstInput(r.startsAt);
  return {
    title: typeof r.title === "string" ? r.title : "",
    body: typeof r.body === "string" ? r.body : "",
    format: pick(r.format, FORMATS, "modal"),
    tone: pick(r.tone, TONES, "info"),
    imageUrl: typeof r.imageUrl === "string" ? r.imageUrl : "",
    primaryCta: ctaFormFrom(r.primaryCta) ?? EMPTY_CTA,
    secondaryCta: ctaFormFrom(r.secondaryCta) ?? EMPTY_CTA,
    dismissible: r.dismissible !== false,
    requireAck: r.requireAck === true,
    frequency: pick(r.frequency, FREQUENCIES, "once"),
    priority: typeof r.priority === "number" && Number.isFinite(r.priority) ? Math.max(0, Math.min(100, Math.round(r.priority))) : 50,
    audience: audienceFormFrom(r.audience),
    startMode: start ? "at" : "now",
    startsAt: start,
    endsAt: toIstInput(r.endsAt),
    sendPush: r.sendPush === true,
  };
}

/** True when a popup gives the person a way out (close button, "I understand" or a CTA). */
export function canClose(form: Pick<AnnouncementForm, "format" | "dismissible" | "requireAck" | "primaryCta" | "secondaryCta">): boolean {
  if (!FORMAT_META[form.format].popup) return true;
  return form.dismissible || form.requireAck || !!toCta(form.primaryCta) || !!toCta(form.secondaryCta);
}

/**
 * Problems with the composer. `forPublish` adds the publish-time checks
 * (schedule in the future, end after start) on top of the shape checks that
 * every draft save needs.
 */
export function announcementProblems(form: AnnouncementForm, opts: { now: Date; forPublish: boolean }): Problem[] {
  const out: Problem[] = [];
  const title = form.title.trim();
  if (title.length < LIMITS.announcementTitle[0] || title.length > LIMITS.announcementTitle[1]) out.push({ field: "title", message: `Title must be ${LIMITS.announcementTitle[0]}–${LIMITS.announcementTitle[1]} characters.` });
  if (form.body.trim().length > LIMITS.announcementBody[1]) out.push({ field: "body", message: `Message can be at most ${LIMITS.announcementBody[1]} characters.` });
  if (form.imageUrl.trim() && !isHttpsUrl(form.imageUrl, { allowEmulator: true })) out.push({ field: "imageUrl", message: "The image link must start with https://." });
  out.push(...ctaProblems(form.primaryCta, "primaryCta", "Main button"));
  out.push(...ctaProblems(form.secondaryCta, "secondaryCta", "Second button"));
  if (!toCta(form.primaryCta) && toCta(form.secondaryCta)) out.push({ field: "secondaryCta", message: "Add the main button first." });
  if (!Number.isInteger(form.priority) || form.priority < 0 || form.priority > 100) out.push({ field: "priority", message: "Priority must be a whole number from 0 to 100." });
  if (!canClose(form)) out.push({ field: "dismissible", message: "This popup can't be closed: allow closing, require “I understand” or add a button." });
  out.push(...audienceProblems(form.audience));

  const start = form.startMode === "at" ? istInputToIso(form.startsAt) : null;
  const end = form.endsAt.trim() ? istInputToIso(form.endsAt) : null;
  if (form.startMode === "at" && !start) out.push({ field: "startsAt", message: "Choose when it starts." });
  if (form.endsAt.trim() && !end) out.push({ field: "endsAt", message: "The end time isn't a valid date." });
  const startMs = start ? Date.parse(start) : opts.now.getTime();
  if (end && Date.parse(end) <= startMs) out.push({ field: "endsAt", message: "It must end after it starts." });
  if (opts.forPublish && end && Date.parse(end) <= opts.now.getTime()) out.push({ field: "endsAt", message: "The end time has already passed." });
  if (form.sendPush) {
    const a = toAudience(form.audience);
    if (a.type === "cities" && hasFilters(a)) out.push({ field: "sendPush", message: "A city push can't be limited by platform, build or exclusions. Turn off the push or remove the filters." });
  }
  return dedupeProblems(out);
}

/** The saveAnnouncement payload (contract §1: every field except status/stats/meta). */
export function buildAnnouncementPayload(form: AnnouncementForm, ids: { requestId: string; id?: string | null }) {
  const start = form.startMode === "at" ? istInputToIso(form.startsAt) : null;
  const end = form.endsAt.trim() ? istInputToIso(form.endsAt) : null;
  return {
    requestId: ids.requestId,
    ...(ids.id ? { id: ids.id } : {}),
    title: form.title.trim(),
    body: form.body.trim(),
    format: form.format,
    tone: form.tone,
    imageUrl: form.imageUrl.trim() || null,
    primaryCta: toCta(form.primaryCta),
    secondaryCta: toCta(form.primaryCta) ? toCta(form.secondaryCta) : null,
    dismissible: form.dismissible,
    requireAck: form.requireAck,
    frequency: form.frequency,
    priority: form.priority,
    audience: toAudience(form.audience),
    startsAt: start,
    endsAt: end,
    sendPush: form.sendPush,
  };
}

/** What the live phone preview draws for the current composer state. */
export interface PreviewModel {
  placement: FormatMeta["placement"];
  popup: boolean;
  tone: ToneMeta;
  title: string;
  body: string;
  imageUrl: string | null;
  primary: string | null;
  secondary: string | null;
  showClose: boolean;
  showAck: boolean;
  /** Where a tap on the main button goes ("Opens event ev_123", "Opens example.com"). */
  primaryHint: string | null;
}

export function previewModel(form: AnnouncementForm): PreviewModel {
  const meta = FORMAT_META[form.format];
  const primary = toCta(form.primaryCta);
  const secondary = primary ? toCta(form.secondaryCta) : null;
  const image = form.imageUrl.trim() && isHttpsUrl(form.imageUrl, { allowEmulator: true }) ? form.imageUrl.trim() : null;
  return {
    placement: meta.placement,
    popup: meta.popup,
    tone: TONE_META[form.tone],
    title: form.title.trim() || "Your title",
    body: form.body.trim(),
    imageUrl: image,
    primary: primary?.label ?? null,
    secondary: secondary?.label ?? null,
    showClose: meta.popup ? form.dismissible : form.format === "banner" ? form.dismissible : false,
    showAck: form.requireAck && form.format !== "inbox",
    primaryHint: primary ? ctaHint(primary) : null,
  };
}

export function ctaHint(cta: Cta): string {
  if (cta.link) return `Opens ${linkTypeLabel(cta.link.type).toLowerCase()} ${cta.link.id}`;
  if (cta.url) {
    try {
      return `Opens ${new URL(cta.url).hostname} in the browser`;
    } catch {
      return "Opens a web page";
    }
  }
  return "Closes the message";
}

/* ---------------------------------------------------------------- status */

/**
 * The status people actually see, given the window: a `live` one past its end
 * reads as ended and a `scheduled` one whose start passed reads as live, even
 * before the 5-minute job writes it (delivery checks the window itself).
 */
export function effectiveStatus(status: unknown, startsAt: unknown, endsAt: unknown, now: Date): AnnouncementStatus {
  const s = pick(status, ANNOUNCEMENT_STATUSES, "draft");
  if (s !== "live" && s !== "scheduled") return s;
  const end = toDate(endsAt);
  if (end && end.getTime() <= now.getTime()) return "ended";
  const start = toDate(startsAt);
  if (start && start.getTime() > now.getTime()) return "scheduled";
  return "live";
}

export const ANNOUNCEMENT_ACTIONS = ["publish", "pause", "resume", "end", "duplicate", "archive"] as const;
export type AnnouncementAction = (typeof ANNOUNCEMENT_ACTIONS)[number];

export const ACTION_META: Record<AnnouncementAction, { label: string; verb: string; tone: "volt" | "danger"; consequence: string; done: string }> = {
  publish: { label: "Publish", verb: "Publish", tone: "volt", consequence: "It goes live at its start time for the chosen audience (and sends the push, if turned on).", done: "Published" },
  pause: { label: "Pause", verb: "Pause", tone: "danger", consequence: "It stops showing right away. You can resume it while its window is open.", done: "Paused" },
  resume: { label: "Resume", verb: "Resume", tone: "volt", consequence: "It shows again for the same audience, inside its window.", done: "Resumed" },
  end: { label: "End", verb: "End", tone: "danger", consequence: "It stops for good and its end time is set to now. Duplicate it to run it again.", done: "Ended" },
  duplicate: { label: "Duplicate", verb: "Duplicate", tone: "volt", consequence: "Creates a new draft with the same content and audience; stats and schedule start fresh.", done: "Duplicated" },
  archive: { label: "Archive", verb: "Archive", tone: "danger", consequence: "Moves it out of the working lists. It never shows again; you can still duplicate it.", done: "Archived" },
};

/** The row actions a status allows (contract §5). */
export function announcementActions(status: AnnouncementStatus): AnnouncementAction[] {
  switch (status) {
    case "draft": return ["publish", "duplicate", "archive"];
    case "scheduled": return ["pause", "end", "duplicate", "archive"];
    case "live": return ["pause", "end", "duplicate", "archive"];
    case "paused": return ["resume", "end", "duplicate", "archive"];
    case "ended": return ["duplicate", "archive"];
    case "archived": return ["duplicate"];
    default: return [];
  }
}

/** Editing is allowed for draft / scheduled / paused, and for live within the live-edit fields. */
export function canEdit(status: AnnouncementStatus): boolean {
  return status === "draft" || status === "scheduled" || status === "paused" || status === "live";
}

/** Fields a live announcement may change (contract §5); everything else needs a pause first. */
export const LIVE_EDITABLE = ["title", "body", "imageUrl", "primaryCta", "secondaryCta", "startsAt", "endsAt"] as const;

/* ----------------------------------------------------------------- stats */

export interface AnnouncementStats {
  targeted: number;
  shown: number;
  clicked: number;
  dismissed: number;
  acked: number;
  viewers: number;
}

const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

export function statsOf(raw: unknown): AnnouncementStats {
  const s = (raw && typeof raw === "object" ? raw : {}) as Raw;
  return { targeted: n(s.targeted), shown: n(s.shown), clicked: n(s.clicked), dismissed: n(s.dismissed), acked: n(s.acked), viewers: n(s.viewers) };
}

/** Click-through rate: clicks per distinct viewer (falls back to shown counts for older docs). */
export function ctrOf(stats: Pick<AnnouncementStats, "clicked" | "viewers" | "shown">): number | null {
  const base = stats.viewers > 0 ? stats.viewers : stats.shown;
  if (base <= 0) return null;
  return Math.min(1, stats.clicked / base);
}

export function formatRate(rate: number | null | undefined): string {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "—";
  const p = rate * 100;
  return `${p >= 10 || p === 0 ? Math.round(p) : p.toFixed(1)}%`;
}

/** Reach: distinct viewers out of the estimated audience at publish. */
export function reachOf(stats: Pick<AnnouncementStats, "viewers" | "targeted">): number | null {
  return stats.targeted > 0 ? Math.min(1, stats.viewers / stats.targeted) : null;
}

export interface SeriesPoint {
  day: string;
  shown: number;
  clicked: number;
  dismissed: number;
  acked: number;
}

/** getAnnouncementStats series → 30 zero-filled days ending `today` (IST yyyy-mm-dd), oldest first. */
export function normalizeSeries(series: unknown, today: string, days = 30): SeriesPoint[] {
  const byDay = new Map<string, SeriesPoint>();
  if (Array.isArray(series)) {
    for (const x of series) {
      if (!x || typeof x !== "object") continue;
      const r = x as Raw;
      if (typeof r.day !== "string") continue;
      byDay.set(r.day, { day: r.day, shown: n(r.shown), clicked: n(r.clicked), dismissed: n(r.dismissed), acked: n(r.acked) });
    }
  }
  const end = Date.parse(`${today}T00:00:00Z`);
  const out: SeriesPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(end - i * 86_400_000).toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? { day, shown: 0, clicked: 0, dismissed: 0, acked: 0 });
  }
  return out;
}

/** yyyy-mm-dd in India time. */
export function istDay(at: Date): string {
  return new Date(at.getTime() + IST_MS).toISOString().slice(0, 10);
}

export function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

/* ------------------------------------------------------------- list rows */

export interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  format: AnnouncementFormat;
  tone: Tone;
  status: AnnouncementStatus;
  audience: Audience;
  startsAt: Date | null;
  endsAt: Date | null;
  updatedAt: Date | null;
  publishedAt: Date | null;
  priority: number;
  sendPush: boolean;
  pushStatus: string | null;
  stats: AnnouncementStats;
  raw: Raw;
}

export function toAnnouncementRow(id: string, raw: Raw): AnnouncementRow {
  const form = audienceFormFrom(raw.audience);
  return {
    id,
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title : "Untitled",
    body: typeof raw.body === "string" ? raw.body : "",
    format: pick(raw.format, FORMATS, "modal"),
    tone: pick(raw.tone, TONES, "info"),
    status: pick(raw.status, ANNOUNCEMENT_STATUSES, "draft"),
    audience: toAudience(form),
    startsAt: toDate(raw.startsAt),
    endsAt: toDate(raw.endsAt),
    updatedAt: toDate(raw.updatedAt) ?? toDate(raw.createdAt),
    publishedAt: toDate(raw.publishedAt),
    priority: typeof raw.priority === "number" ? raw.priority : 50,
    sendPush: raw.sendPush === true,
    pushStatus: typeof raw.pushStatus === "string" ? raw.pushStatus : null,
    stats: statsOf(raw.stats),
    raw,
  };
}

/** Library filter: effective status ("all" = everything but archived) + free-text search on title/body/id. */
export function filterAnnouncements(rows: AnnouncementRow[], opts: { status: AnnouncementStatus | "all"; search: string; now: Date }): AnnouncementRow[] {
  const q = opts.search.trim().toLowerCase();
  return rows.filter((r) => {
    const s = effectiveStatus(r.status, r.startsAt, r.endsAt, opts.now);
    if (opts.status === "all" ? s === "archived" : s !== opts.status) return false;
    if (!q) return true;
    return `${r.title} ${r.body} ${r.id}`.toLowerCase().includes(q);
  });
}

export function statusCounts(rows: AnnouncementRow[], now: Date): Record<AnnouncementStatus, number> {
  const out = Object.fromEntries(ANNOUNCEMENT_STATUSES.map((s) => [s, 0])) as Record<AnnouncementStatus, number>;
  for (const r of rows) out[effectiveStatus(r.status, r.startsAt, r.endsAt, now)]++;
  return out;
}

export interface NotificationRow {
  id: string;
  title: string;
  body: string;
  status: string;
  audience: Audience;
  recipients: number | null;
  style: NotificationStyle;
  createdAt: Date | null;
  scheduleAt: Date | null;
  sentAt: Date | null;
  failure: string | null;
  pushStatus: string | null;
  reason: string | null;
  link: { type: string; id: string } | null;
  url: string | null;
  imageUrl: string | null;
  raw: Raw;
}

export function toNotificationRow(id: string, raw: Raw): NotificationRow {
  const link = raw.link && typeof raw.link === "object" ? (raw.link as Raw) : null;
  return {
    id,
    title: typeof raw.title === "string" ? raw.title : "—",
    body: typeof raw.body === "string" ? raw.body : "",
    status: typeof raw.status === "string" ? raw.status : "—",
    audience: toAudience(audienceFormFrom(raw.audience)),
    recipients: typeof raw.recipients === "number" ? raw.recipients : null,
    style: pick(raw.style, NOTIFICATION_STYLES, "standard"),
    createdAt: toDate(raw.createdAt),
    scheduleAt: toDate(raw.scheduleAt),
    sentAt: toDate(raw.sentAt),
    failure: typeof raw.failure === "string" ? raw.failure : null,
    pushStatus: typeof raw.pushStatus === "string" ? raw.pushStatus : null,
    reason: typeof raw.reason === "string" ? raw.reason : null,
    link: link && typeof link.type === "string" && typeof link.id === "string" ? { type: link.type, id: link.id } : null,
    url: typeof raw.url === "string" ? raw.url : null,
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : null,
    raw,
  };
}

/** "1,204 people", "Topic push (city)", "—". */
export function recipientsLabel(row: Pick<NotificationRow, "recipients" | "audience" | "status">): string {
  if (row.audience.type === "cities" && row.recipients === null) return "City topic push";
  if (row.recipients === null) return row.status === "scheduled" ? "At send time" : "—";
  return `${new Intl.NumberFormat("en-IN").format(row.recipients)} ${row.recipients === 1 ? "person" : "people"}`;
}

/* ---------------------------------------------------------- notifications */

export interface NotificationForm {
  title: string;
  body: string;
  imageUrl: string;
  target: CtaTarget;
  linkType: LinkType;
  linkId: string;
  url: string;
  style: NotificationStyle;
  audience: AudienceForm;
  when: "now" | "at";
  /** datetime-local, India time. */
  scheduleAt: string;
  reason: string;
}

export const EMPTY_NOTIFICATION: NotificationForm = {
  title: "",
  body: "",
  imageUrl: "",
  target: "none",
  linkType: "event",
  linkId: "",
  url: "",
  style: "standard",
  audience: EMPTY_AUDIENCE,
  when: "now",
  scheduleAt: "",
  reason: "",
};

export function notificationProblems(form: NotificationForm, now: Date): Problem[] {
  const out: Problem[] = [];
  const title = form.title.trim();
  const body = form.body.trim();
  if (title.length < LIMITS.notificationTitle[0] || title.length > LIMITS.notificationTitle[1]) out.push({ field: "title", message: `Title must be ${LIMITS.notificationTitle[0]}–${LIMITS.notificationTitle[1]} characters.` });
  if (body.length < LIMITS.notificationBody[0] || body.length > LIMITS.notificationBody[1]) out.push({ field: "body", message: `Message must be ${LIMITS.notificationBody[0]}–${LIMITS.notificationBody[1]} characters.` });
  if (form.imageUrl.trim() && !isHttpsUrl(form.imageUrl, { allowEmulator: true })) out.push({ field: "imageUrl", message: "The image link must start with https://." });
  if (form.style === "rich" && !form.imageUrl.trim()) out.push({ field: "imageUrl", message: "A rich notification needs an image." });
  if (form.target === "link" && !LINK_ID.test(form.linkId.trim())) out.push({ field: "linkId", message: `Enter a valid ${linkIdLabel(form.linkType).toLowerCase()}.` });
  if (form.target === "url" && !isHttpsUrl(form.url)) out.push({ field: "url", message: "The web link must start with https://." });
  out.push(...audienceProblems(form.audience));
  const a = toAudience(form.audience);
  if (a.type === "cities" && hasFilters(a)) out.push({ field: "audience", message: "A city send can't be limited by platform, build or exclusions (PULSE doesn't know who is where)." });
  if (form.when === "at") {
    const at = istInputToIso(form.scheduleAt);
    if (!at) out.push({ field: "scheduleAt", message: "Choose when to send it." });
    else {
      const ahead = Date.parse(at) - now.getTime();
      if (ahead < LIMITS.scheduleMinMs) out.push({ field: "scheduleAt", message: "Schedule it at least 2 minutes ahead, or send it now." });
      if (ahead > LIMITS.scheduleMaxMs) out.push({ field: "scheduleAt", message: "Schedule it at most 60 days ahead." });
    }
  }
  const reason = form.reason.trim();
  if (reason.length < LIMITS.reason[0] || reason.length > LIMITS.reason[1]) out.push({ field: "reason", message: `Reason must be ${LIMITS.reason[0]}–${LIMITS.reason[1]} characters.` });
  return dedupeProblems(out);
}

export function buildNotificationPayload(form: NotificationForm, requestId: string) {
  const scheduleAt = form.when === "at" ? istInputToIso(form.scheduleAt) : null;
  return {
    requestId,
    audience: toAudience(form.audience),
    title: form.title.trim(),
    body: form.body.trim(),
    ...(form.imageUrl.trim() ? { imageUrl: form.imageUrl.trim() } : {}),
    ...(form.target === "link" && form.linkId.trim() ? { link: { type: form.linkType, id: form.linkId.trim() } } : {}),
    ...(form.target === "url" && form.url.trim() ? { url: form.url.trim() } : {}),
    style: form.style,
    ...(scheduleAt ? { scheduleAt } : {}),
    reason: form.reason.trim(),
  };
}

/** True when this audience counts toward the shared 3-a-day limit (all / customers / cities). */
export function isLimitedAudience(a: Pick<Audience, "type">): boolean {
  return a.type === "all" || a.type === "customers" || a.type === "cities";
}

/** How the push travels for this audience (contract §5). */
export function pushRoute(a: Audience): "topic" | "per-user" {
  if (a.type === "cities") return "topic";
  if (a.type === "all" && !hasFilters(a)) return "topic";
  return "per-user";
}

/* -------------------------------------------------------------- templates */

export const TEMPLATE_KINDS = ["announcement", "notification"] as const;
export type TemplateKind = (typeof TEMPLATE_KINDS)[number];

/** The announcement composer's reusable fields (no schedule). */
export function announcementTemplatePayload(form: AnnouncementForm): Raw {
  const { startMode: _s, startsAt: _a, endsAt: _e, ...rest } = form;
  void _s; void _a; void _e;
  return JSON.parse(JSON.stringify(rest)) as Raw;
}

/** The send form's reusable fields (no schedule, no reason). */
export function notificationTemplatePayload(form: NotificationForm): Raw {
  const { when: _w, scheduleAt: _s, reason: _r, ...rest } = form;
  void _w; void _s; void _r;
  return JSON.parse(JSON.stringify(rest)) as Raw;
}

function audienceFormFromTemplate(raw: unknown): AudienceForm {
  // Template payloads store the builder's own state (with chip names).
  const a = (raw && typeof raw === "object" ? raw : {}) as Raw;
  if (Array.isArray(a.people) || Array.isArray(a.orgs) || Array.isArray(a.exclude)) {
    const chips = (v: unknown) =>
      Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === "object" && typeof (x as Raw).uid === "string").map((x) => ({ uid: String(x.uid), displayName: typeof x.displayName === "string" ? x.displayName : null })) : [];
    return {
      type: pick(a.type, AUDIENCE_TYPES, "all"),
      cities: Array.isArray(a.cities) ? a.cities.filter((c): c is string => typeof c === "string") : [],
      people: chips(a.people),
      orgs: Array.isArray(a.orgs) ? a.orgs.filter((x): x is Raw => !!x && typeof x === "object" && typeof (x as Raw).orgId === "string").map((x) => ({ orgId: String(x.orgId), name: typeof x.name === "string" ? x.name : null })) : [],
      platforms: Array.isArray(a.platforms) ? a.platforms.filter((p): p is Platform => (PLATFORMS as readonly unknown[]).includes(p)) : [],
      minBuild: typeof a.minBuild === "string" ? a.minBuild : "",
      maxBuild: typeof a.maxBuild === "string" ? a.maxBuild : "",
      exclude: chips(a.exclude),
    };
  }
  return audienceFormFrom(raw);
}

/** A template payload → the composer's state, tolerant of missing or older fields. */
export function announcementFormFromTemplate(payload: unknown): AnnouncementForm {
  const p = (payload && typeof payload === "object" ? payload : {}) as Raw;
  const base = announcementFormFrom({ ...p, audience: undefined, startsAt: undefined, endsAt: undefined });
  const cta = (v: unknown, fallback: CtaForm): CtaForm => {
    if (!v || typeof v !== "object") return fallback;
    const c = v as Raw;
    if ("target" in c) {
      return {
        label: typeof c.label === "string" ? c.label : "",
        target: pick(c.target, ["none", "link", "url"] as const, "none"),
        linkType: pick(c.linkType, LINK_TYPES.map((l) => l.value), "event"),
        linkId: typeof c.linkId === "string" ? c.linkId : "",
        url: typeof c.url === "string" ? c.url : "",
      };
    }
    return ctaFormFrom(v) ?? fallback;
  };
  return { ...base, primaryCta: cta(p.primaryCta, EMPTY_CTA), secondaryCta: cta(p.secondaryCta, EMPTY_CTA), audience: audienceFormFromTemplate(p.audience) };
}

export function notificationFormFromTemplate(payload: unknown): NotificationForm {
  const p = (payload && typeof payload === "object" ? payload : {}) as Raw;
  return {
    ...EMPTY_NOTIFICATION,
    title: typeof p.title === "string" ? p.title : "",
    body: typeof p.body === "string" ? p.body : "",
    imageUrl: typeof p.imageUrl === "string" ? p.imageUrl : "",
    target: pick(p.target, ["none", "link", "url"] as const, "none"),
    linkType: pick(p.linkType, LINK_TYPES.map((l) => l.value), "event"),
    linkId: typeof p.linkId === "string" ? p.linkId : "",
    url: typeof p.url === "string" ? p.url : "",
    style: pick(p.style, NOTIFICATION_STYLES, "standard"),
    audience: audienceFormFromTemplate(p.audience),
  };
}

export function templateProblems(input: { name: string; payload: unknown }): Problem[] {
  const out: Problem[] = [];
  const name = input.name.trim();
  if (name.length < LIMITS.templateName[0] || name.length > LIMITS.templateName[1]) out.push({ field: "name", message: `Name must be ${LIMITS.templateName[0]}–${LIMITS.templateName[1]} characters.` });
  const size = new TextEncoder().encode(JSON.stringify(input.payload ?? {})).length;
  if (size > LIMITS.templatePayloadBytes) out.push({ field: "payload", message: "This template is too large to save (over 20 KB)." });
  return out;
}

export interface TemplateRow {
  id: string;
  name: string;
  kind: TemplateKind;
  payload: Raw;
  updatedAt: Date | null;
  title: string;
}

export function toTemplateRow(id: string, raw: Raw): TemplateRow {
  const payload = raw.payload && typeof raw.payload === "object" ? (raw.payload as Raw) : {};
  return {
    id,
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : "Untitled template",
    kind: pick(raw.kind, TEMPLATE_KINDS, "announcement"),
    payload,
    updatedAt: toDate(raw.updatedAt) ?? toDate(raw.createdAt),
    title: typeof payload.title === "string" ? payload.title : "",
  };
}

/* ------------------------------------------------------------------ misc */

function dedupe<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function dedupeProblems(ps: Problem[]): Problem[] {
  const seen = new Set<string>();
  return ps.filter((p) => {
    const k = `${p.field}|${p.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function problemFor(problems: Problem[], field: string): string | null {
  return problems.find((p) => p.field === field)?.message ?? null;
}

/* ------------------------------------------------------- previewAudience */

export interface AudiencePreview {
  estimate: number;
  exact: boolean;
  breakdown: { customers: number; organizers: number };
  sample: Array<{ uid: string; displayName: string | null }>;
  note: string | null;
}

export function readPreview(raw: unknown): AudiencePreview {
  const r = (raw && typeof raw === "object" ? raw : {}) as Raw;
  const b = (r.breakdown && typeof r.breakdown === "object" ? r.breakdown : {}) as Raw;
  return {
    estimate: n(r.estimate),
    exact: r.exact !== false,
    breakdown: { customers: n(b.customers), organizers: n(b.organizers) },
    sample: Array.isArray(r.sample)
      ? r.sample.filter((x): x is Raw => !!x && typeof x === "object" && typeof (x as Raw).uid === "string").map((x) => ({ uid: String(x.uid), displayName: typeof x.displayName === "string" ? x.displayName : null }))
      : [],
    note: typeof r.note === "string" && r.note.trim() ? r.note : null,
  };
}

/** A stable key for "the audience changed" (debounced previews re-run only on a real change). */
export function audienceKey(a: Audience): string {
  return JSON.stringify(a, Object.keys(a).sort());
}

/* --------------------------------------------------------- searchAccounts */

export interface AccountHit {
  uid: string;
  displayName: string | null;
  phoneMasked: string | null;
  role: "customer" | "organizer";
  orgs: Array<{ orgId: string; name: string }>;
  accountStatus: "active" | "paused" | "blocked";
  accountStatusUntil: string | null;
}

/** Tolerates `[...]`, `{ accounts }`, `{ items }` or `{ results }`. */
export function readAccountHits(raw: unknown): AccountHit[] {
  const r = raw as Raw | unknown[] | null;
  const list = Array.isArray(r) ? r : r && typeof r === "object" ? ((r as Raw).accounts ?? (r as Raw).items ?? (r as Raw).results ?? []) : [];
  if (!Array.isArray(list)) return [];
  return list
    .filter((x): x is Raw => !!x && typeof x === "object" && typeof (x as Raw).uid === "string")
    .map((x) => ({
      uid: String(x.uid),
      displayName: typeof x.displayName === "string" && x.displayName.trim() ? x.displayName : null,
      phoneMasked: typeof x.phoneMasked === "string" ? x.phoneMasked : null,
      role: x.role === "organizer" ? "organizer" : "customer",
      orgs: Array.isArray(x.orgs) ? x.orgs.filter((o): o is Raw => !!o && typeof o === "object").map((o) => ({ orgId: String(o.orgId ?? ""), name: String(o.name ?? "") })) : [],
      accountStatus: x.accountStatus === "paused" || x.accountStatus === "blocked" ? x.accountStatus : "active",
      accountStatusUntil: typeof x.accountStatusUntil === "string" ? x.accountStatusUntil : null,
    }));
}

/* --------------------------------------------------------------- overview */

export const BROAD_PUSHES_PER_DAY = 3;

/** Broad pushes (broadcasts docs) in the last 24 hours — the shared 3-a-day quota. */
export function broadPushesUsed(broadcasts: Array<{ raw: Raw }>, now: Date): number {
  const since = now.getTime() - 86_400_000;
  return broadcasts.filter((b) => (toDate(b.raw.createdAt)?.getTime() ?? 0) > since).length;
}

export interface OverviewSummary {
  live: AnnouncementRow[];
  scheduled: AnnouncementRow[];
  drafts: number;
  /** Distinct viewers across live announcements. */
  liveViewers: number;
  /** Clicks per viewer across live announcements. */
  liveCtr: number | null;
  sends7d: number;
  reached7d: number;
  scheduledSends: number;
}

const byPriority = (a: AnnouncementRow, b: AnnouncementRow) => b.priority - a.priority || (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0);

export function overviewSummary(announcements: AnnouncementRow[], sends: NotificationRow[], now: Date): OverviewSummary {
  const eff = announcements.map((r) => ({ r, s: effectiveStatus(r.status, r.startsAt, r.endsAt, now) }));
  const live = eff.filter((x) => x.s === "live").map((x) => x.r).sort(byPriority);
  const scheduled = eff
    .filter((x) => x.s === "scheduled")
    .map((x) => x.r)
    .sort((a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0));
  const viewers = live.reduce((t, r) => t + r.stats.viewers, 0);
  const clicks = live.reduce((t, r) => t + r.stats.clicked, 0);
  const since = now.getTime() - 7 * 86_400_000;
  const recent = sends.filter((s) => s.status === "sent" && (s.sentAt ?? s.createdAt)?.getTime() !== undefined && (s.sentAt ?? s.createdAt)!.getTime() > since);
  return {
    live,
    scheduled,
    drafts: eff.filter((x) => x.s === "draft").length,
    liveViewers: viewers,
    liveCtr: viewers > 0 ? Math.min(1, clicks / viewers) : null,
    sends7d: recent.length,
    reached7d: recent.reduce((t, s) => t + (s.recipients ?? 0), 0),
    scheduledSends: sends.filter((s) => s.status === "scheduled").length,
  };
}
