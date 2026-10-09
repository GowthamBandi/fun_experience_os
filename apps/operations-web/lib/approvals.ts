/**
 * Approvals queue: pure helpers (lanes, selection, PULSE preview mapping, revision diff).
 */

import type { BadgeTone } from "@/components/pulse/Badge";
import { isOpenCase } from "./console/attention";
import { toDate } from "./console/records";
import { NEEDS_GLYPH, categoryEmoji } from "./overview";

type Raw = Record<string, unknown>;
type Doc = { id: string; raw: Raw };

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim() !== "") : []);

/* ------------------------------------------------------------------ lanes */

export type Lane = "all" | "hosts" | "experiences" | "info";

export const LANES: Array<{ id: Lane; label: string }> = [
  { id: "all", label: "All" },
  { id: "hosts", label: "Hosts" },
  { id: "experiences", label: "Experiences" },
  { id: "info", label: "Info requested" },
];

export function caseLane(raw: Raw): "hosts" | "experiences" | null {
  if (raw.kind === "organizer-kyc") return "hosts";
  if (raw.kind === "experience-approval" || raw.kind === "event-approval") return "experiences";
  return null;
}

function inLane(raw: Raw, lane: Lane): boolean {
  if (!isOpenCase(raw)) return false;
  if (lane === "all") return true;
  if (lane === "info") return raw.status === "information-requested";
  return caseLane(raw) === lane;
}

const submittedMs = (raw: Raw) => (toDate(raw.createdAt) ?? toDate(raw.updatedAt))?.getTime() ?? Number.MAX_SAFE_INTEGER;

/** Open cases in the lane, longest-waiting first (undated cases last). */
export function laneRecords<T extends Doc>(records: T[], lane: Lane): T[] {
  return records.filter((r) => inLane(r.raw, lane)).sort((a, b) => submittedMs(a.raw) - submittedMs(b.raw));
}

export function laneCounts(records: Doc[]): Record<Lane, number> {
  const out: Record<Lane, number> = { all: 0, hosts: 0, experiences: 0, info: 0 };
  for (const { raw } of records) for (const { id } of LANES) if (inLane(raw, id)) out[id] += 1;
  return out;
}

/* ----------------------------------------------------------- presentation */

export const KIND_LABEL: Record<string, string> = {
  "organizer-kyc": "Organizer approval (KYC)",
  "arena-verification": "Arena verification",
  "experience-approval": "Experience approval",
  "event-approval": "Event approval",
  "commission-proposal": "Commission proposal",
  "fraud-alert": "Fraud alert",
  "refund-exception": "Refund exception",
  "settlement-release": "Settlement release",
};

/** From server fields only: KYC summary "Business organizer · music, food", experience displayValue "trips · open · 18+". */
export function caseCategory(raw: Raw): string | null {
  if (raw.kind === "organizer-kyc") {
    const tail = str(raw.summary)?.split(" · ")[1];
    return str(tail?.split(",")[0]);
  }
  if (raw.kind === "experience-approval") return str(str(raw.displayValue)?.split(" · ")[0]);
  return str(raw.category);
}

export function caseGlyph(raw: Raw): { emoji: string; tone: BadgeTone } {
  if (raw.kind === "organizer-kyc") return NEEDS_GLYPH.kyc;
  if (raw.kind === "experience-approval") return { emoji: categoryEmoji(caseCategory(raw)), tone: "info" };
  if (raw.kind === "event-approval") return NEEDS_GLYPH.event;
  return NEEDS_GLYPH.case;
}

const BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending", tone: "violet" },
  "under-review": { label: "In review", tone: "info" },
  "information-requested": { label: "Info requested", tone: "warn" },
  approved: { label: "Approved", tone: "ok" },
  rejected: { label: "Rejected", tone: "err" },
};

export function caseBadge(status: unknown): { label: string; tone: BadgeTone } {
  return BADGE[String(status ?? "pending")] ?? { label: String(status), tone: "muted" };
}

const TARGET_FALLBACK: Record<string, string> = {
  "organizer-kyc": "organizers",
  "arena-verification": "arenas",
  "experience-approval": "experiences",
  "event-approval": "events",
};

export function caseTarget(raw: Raw): { collection: string | null; id: string | null } {
  return {
    collection: str(raw.targetCollection) ?? TARGET_FALLBACK[String(raw.kind ?? "")] ?? null,
    id: str(raw.targetId),
  };
}

/* -------------------------------------------------------------- selection */

export function stepSelection(ids: string[], current: string | null, delta: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const i = current ? ids.indexOf(current) : -1;
  if (i < 0) return ids[0];
  return ids[Math.min(Math.max(i + delta, 0), ids.length - 1)];
}

/** Where the selection goes once `current` leaves the queue. */
export function neighbourId(ids: string[], current: string): string | null {
  const i = ids.indexOf(current);
  if (i < 0) return ids[0] ?? null;
  return ids[i + 1] ?? ids[i - 1] ?? null;
}

export function isTypingTarget(el: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  if (!el) return false;
  const tag = (el.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable === true;
}

/* ---------------------------------------------------- PULSE preview model */

export type ArtPattern = "court" | "rings" | "contours" | "film" | "orbits" | "waves" | "dots" | "grid";

// Same colours and patterns as ExperienceCategory in the PULSE app.
export const CATEGORY_ART: Record<string, { label: string; color: string; pattern: ArtPattern }> = {
  sports: { label: "Sports", color: "#B6F04A", pattern: "court" },
  music: { label: "Music", color: "#FF7AB6", pattern: "rings" },
  trips: { label: "Trips", color: "#3FD8C6", pattern: "contours" },
  movies: { label: "Movies", color: "#FFB84D", pattern: "film" },
  social: { label: "Social", color: "#A58BFF", pattern: "orbits" },
  wellness: { label: "Wellness", color: "#7FD4FF", pattern: "waves" },
  food: { label: "Food", color: "#FF8A5B", pattern: "dots" },
  workshops: { label: "Workshops", color: "#F2D24B", pattern: "grid" },
};
const FALLBACK_ART = { label: "Experience", color: "#8E72FF", pattern: "orbits" as ArtPattern };

export const artFor = (category: string | null) => (category && CATEGORY_ART[category]) || FALLBACK_ART;

function hexToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return `#${[f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, "0")).join("")}`;
}

const clamp01 = (x: number) => Math.min(Math.max(x, 0), 1);

/** The app's generated art: base colour → hue-shifted → deep, angled by the cover seed. */
export function artGradient(category: string | null, seed: number): string {
  const base = artFor(category).color.toLowerCase();
  const [h, s, l] = hexToHsl(base);
  const shifted = hslToHex((h + 28 + (seed % 30)) % 360, s, clamp01(l * 0.55));
  const deep = hslToHex(h, clamp01(s * 0.9), clamp01(l * 0.32));
  const bx = -1 + (seed % 5) * 0.2;
  const angle = Math.round((Math.atan2(1 - bx, -2) * 180) / Math.PI);
  return `linear-gradient(${angle}deg, ${base} 0%, ${shifted} 55%, ${deep} 100%)`;
}

const GENDER: Record<string, { label: string; body: string }> = {
  open: { label: "Open to all", body: "Anyone who meets the age requirement can join." },
  mixed: { label: "Mixed format", body: "Teams or pairs are balanced across genders." },
  "women-only": { label: "Women only", body: "This experience is reserved for women." },
  "men-only": { label: "Men only", body: "This experience is reserved for men." },
};

// The app's formatFrom(): only "team" and "solo" are special; any other text reads as a group experience.
const FORMAT: Record<string, { label: string; body: string }> = {
  solo: { label: "Solo spot", body: "Join on your own — you’ll be grouped on the day." },
  team: { label: "Team play", body: "You’ll be placed into a team before it starts." },
  group: { label: "Group experience", body: "Everyone takes part together." },
};

const SAFETY: Record<string, string> = { low: "Low intensity", medium: "Moderate activity", moderate: "Moderate activity", high: "High activity" };

const CANCELLATION: Record<string, { label: string; rules: string[] }> = {
  flexible: {
    label: "Flexible",
    rules: ["Full refund if you cancel 24 hours or more before the start.", "50% refund if you cancel within 24 hours.", "No refund after the experience starts."],
  },
  moderate: {
    label: "Moderate",
    rules: ["Full refund if you cancel 3 days or more before the start.", "50% refund between 3 days and 24 hours before.", "No refund within 24 hours of the start."],
  },
  strict: { label: "Strict", rules: ["Full refund if you cancel 7 days or more before the start.", "No refund within 7 days of the start."] },
};

export interface PreviewModel {
  title: string;
  tagline: string | null;
  category: string | null;
  categoryLabel: string;
  activity: string | null;
  description: string | null;
  highlights: string[];
  rules: string[];
  bring: string[];
  gender: { label: string; body: string };
  age: { label: string; body: string };
  format: { label: string; body: string };
  idRequired: boolean;
  safety: { label: string; measures: string[] };
  cancellation: { label: string; rules: string[] };
  seed: number;
  host: string | null;
}

export function toPreview(e: Raw): PreviewModel {
  const category = str(e.category);
  const ageMin = typeof e.ageMin === "number" ? e.ageMin : null;
  const ageMax = typeof e.ageMax === "number" ? e.ageMax : null;
  const safety = e.safety && typeof e.safety === "object" ? (e.safety as Raw) : {};
  const cover = e.coverStyle && typeof e.coverStyle === "object" ? (e.coverStyle as Raw) : {};
  const gender = str(e.genderRule);
  const format = str(e.format);
  const cancellation = str(e.cancellationPolicy);
  const level = str(safety.level);
  return {
    title: str(e.title) ?? "—",
    tagline: str(e.tagline),
    category,
    categoryLabel: artFor(category).label,
    activity: str(e.activity),
    description: str(e.description),
    highlights: list(e.highlights),
    rules: list(e.rules),
    bring: list(e.bring),
    gender: (gender && GENDER[gender]) || { label: gender ?? "—", body: "" },
    age:
      ageMin === null
        ? { label: "—", body: "" }
        : ageMax === null
          ? { label: `${ageMin}+`, body: `You must be ${ageMin} or older to join.` }
          : { label: `${ageMin}–${ageMax}`, body: `Open to ages ${ageMin} to ${ageMax}.` },
    format: format ? FORMAT[format] ?? FORMAT.group : { label: "—", body: "" },
    idRequired: e.idRequired === true,
    safety: { label: (level && SAFETY[level]) || level || "—", measures: list(safety.measures) },
    cancellation: (cancellation && CANCELLATION[cancellation]) || { label: cancellation ?? "—", rules: [] },
    seed: typeof cover.seed === "number" ? cover.seed : 0,
    host: str(e.organizerName),
  };
}

/* ------------------------------------------------------------ revision diff */

const DIFF_FIELDS: Array<[string, string]> = [
  ["title", "Title"],
  ["tagline", "Tagline"],
  ["category", "Category"],
  ["activity", "Activity"],
  ["description", "Description"],
  ["highlights", "Highlights"],
  ["format", "Format"],
  ["genderRule", "Gender rule"],
  ["ageMin", "Minimum age"],
  ["ageMax", "Maximum age"],
  ["idRequired", "ID required"],
  ["rules", "Rules"],
  ["bring", "Things to bring"],
  ["safety", "Safety"],
  ["cancellationPolicy", "Cancellation policy"],
  ["config", "Category settings"],
  ["coverStyle", "Cover art"],
  ["mediaPaths", "Photos"],
];

function show(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.map(show).join(" · ") : "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "object") {
    const o = value as Raw;
    if ("level" in o && "measures" in o) {
      const m = list(o.measures);
      return m.length ? `${show(o.level)} — ${m.join(", ")}` : show(o.level);
    }
    const parts = Object.entries(o).map(([k, v]) => `${k}: ${show(v)}`);
    return parts.length ? parts.join(", ") : "—";
  }
  return String(value);
}

export interface DiffRow {
  field: string;
  label: string;
  before: string;
  after: string;
}

export function experienceDiff(before: Raw, after: Raw): DiffRow[] {
  const rows: DiffRow[] = [];
  for (const [field, label] of DIFF_FIELDS) {
    const b = show(before[field]);
    const a = show(after[field]);
    if (b !== a) rows.push({ field, label, before: b, after: a });
  }
  return rows;
}
