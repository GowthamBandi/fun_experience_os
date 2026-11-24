/**
 * Organizer-set cancellation rules, read for review (docs/CANCELLATION_POLICY_CONTRACT.md).
 * The console's copy of firebase/functions/src/commerce/cancellation.ts (reading, plain words,
 * reviewer flags); tests/unit/cancellation.test.ts checks both say the same thing.
 *
 *   cancellation: { allowed, cutoffHours, tiers: [{ hoursBefore, refundPercent }], preset }
 *
 * Documents with only the old one-word `cancellationPolicy` read as that preset.
 */

export type CancellationPreset = "flexible" | "moderate" | "strict" | "none" | "custom";

export interface RefundTier {
  hoursBefore: number;
  refundPercent: number;
}

export interface CancellationRules {
  allowed: boolean;
  cutoffHours: number;
  tiers: RefundTier[];
  preset: CancellationPreset;
}

type Raw = Record<string, unknown>;

const NAMED = ["flexible", "moderate", "strict", "none"] as const;
type Named = (typeof NAMED)[number];
const MAX_HOURS = 720;
const MAX_TIERS = 4;
/** Cut-offs longer than this are flagged for the reviewer. */
export const LONG_CUTOFF_HOURS = 48;

const t = (hoursBefore: number, refundPercent: number): RefundTier => ({ hoursBefore, refundPercent });
const PRESETS: Record<Named, Omit<CancellationRules, "preset">> = {
  flexible: { allowed: true, cutoffHours: 0, tiers: [t(24, 100), t(0, 50)] },
  moderate: { allowed: true, cutoffHours: 0, tiers: [t(72, 100), t(24, 50)] },
  strict: { allowed: true, cutoffHours: 0, tiers: [t(168, 100)] },
  none: { allowed: false, cutoffHours: 0, tiers: [] },
};

export const PRESET_LABEL: Record<CancellationPreset, string> = {
  flexible: "Flexible",
  moderate: "Moderate",
  strict: "Strict",
  none: "No cancellations",
  custom: "Custom",
};

const isNamed = (v: unknown): v is Named => typeof v === "string" && (NAMED as readonly string[]).includes(v);
const isInt = (v: unknown, min: number, max: number): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const isObj = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);

export function presetRules(name: Named): CancellationRules {
  const p = PRESETS[name];
  return { allowed: p.allowed, cutoffHours: p.cutoffHours, tiers: p.tiers.map((x) => ({ ...x })), preset: name };
}

function same(a: Omit<CancellationRules, "preset">, b: Omit<CancellationRules, "preset">): boolean {
  return (
    a.allowed === b.allowed &&
    a.cutoffHours === b.cutoffHours &&
    a.tiers.length === b.tiers.length &&
    a.tiers.every((x, i) => x.hoursBefore === b.tiers[i]!.hoursBefore && x.refundPercent === b.tiers[i]!.refundPercent)
  );
}

/** A stored `cancellation` object, if it is well formed (the server validated it on save). */
function storedRules(raw: unknown): CancellationRules | null {
  if (!isObj(raw) || typeof raw.allowed !== "boolean") return null;
  const given = raw.preset === "custom" || isNamed(raw.preset) ? (raw.preset as CancellationPreset) : null;
  if (raw.preset !== undefined && raw.preset !== null && given === null) return null;
  let body: Omit<CancellationRules, "preset">;
  if (!raw.allowed) body = { allowed: false, cutoffHours: 0, tiers: [] };
  else {
    const cutoff = raw.cutoffHours === undefined || raw.cutoffHours === null ? 0 : raw.cutoffHours;
    if (!isInt(cutoff, 0, MAX_HOURS) || !Array.isArray(raw.tiers) || raw.tiers.length === 0 || raw.tiers.length > MAX_TIERS) return null;
    const tiers: RefundTier[] = [];
    for (const x of raw.tiers) {
      if (!isObj(x) || !isInt(x.hoursBefore, 0, MAX_HOURS) || !isInt(x.refundPercent, 0, 100)) return null;
      const prev = tiers[tiers.length - 1];
      if (prev && (x.hoursBefore >= prev.hoursBefore || x.refundPercent > prev.refundPercent)) return null;
      tiers.push({ hoursBefore: x.hoursBefore, refundPercent: x.refundPercent });
    }
    body = { allowed: true, cutoffHours: cutoff, tiers };
  }
  const preset: CancellationPreset =
    given === "custom" ? "custom" : given !== null ? (same(body, PRESETS[given]) ? given : "custom") : (NAMED.find((n) => same(body, PRESETS[n])) ?? "custom");
  return { ...body, preset };
}

export interface ReadCancellation {
  rules: CancellationRules;
  /** Where the rules came from: the organizer's rules, an old one-word preset, or nothing usable (read as strict, as the server does). */
  source: "rules" | "preset" | "fallback";
}

/** The rules an experience, event or booking carries: `cancellation`, else the old `cancellationPolicy` preset, else strict. */
export function readCancellation(doc: Raw | null | undefined): ReadCancellation {
  const own = doc ? storedRules(doc.cancellation) : null;
  if (own) return { rules: own, source: "rules" };
  const legacy = doc?.cancellationPolicy;
  if (isNamed(legacy)) return { rules: presetRules(legacy), source: "preset" };
  return { rules: presetRules("strict"), source: "fallback" };
}

/** True when the document says anything about cancellation (either field). */
export function hasCancellation(doc: Raw | null | undefined): boolean {
  return !!doc && ((doc.cancellation !== undefined && doc.cancellation !== null) || typeof doc.cancellationPolicy === "string");
}

/* ------------------------------------------------------------ plain words */

function span(h: number): { n: number; unit: string } {
  if (h >= 72 && h % 24 === 0) return { n: h / 24, unit: "days" };
  return { n: h, unit: h === 1 ? "hour" : "hours" };
}

export function hoursLabel(h: number): string {
  const s = span(h);
  return `${s.n} ${s.unit}`;
}

const plural = (u: string) => (u === "hour" ? "hours" : u);
const plus = (h: number) => {
  const s = span(h);
  return `${s.n}+ ${plural(s.unit)}`;
};
function range(upper: number, lower: number): string {
  const a = span(upper);
  const b = span(lower);
  return plural(a.unit) === plural(b.unit) ? `${a.n} to ${b.n} ${plural(b.unit)}` : `${hoursLabel(upper)} to ${hoursLabel(lower)}`;
}
const back = (p: number) => (p >= 100 ? "Full refund" : p <= 0 ? "No refund" : `${p}% back`);

interface Window {
  upper: number | null;
  lower: number;
  percent: number;
}

function windows(rules: CancellationRules): Window[] {
  if (!rules.allowed) return [];
  const c = rules.cutoffHours;
  const out: Window[] = [];
  let upper: number | null = null;
  for (const x of rules.tiers) {
    const lower = Math.max(x.hoursBefore, c);
    if (upper === null || upper > lower) out.push({ upper, lower, percent: x.refundPercent });
    upper = upper === null ? x.hoursBefore : Math.min(upper, x.hoursBefore);
    if (upper <= c) break;
  }
  if (upper !== null && upper > c) out.push({ upper, lower: c, percent: 0 });
  const merged: Window[] = [];
  for (const w of out) {
    const last = merged[merged.length - 1];
    if (last && last.percent === w.percent) last.lower = w.lower;
    else merged.push({ ...w });
  }
  return merged;
}

/** The rules as customers read them, one sentence per line (the same words as the server and the public event page). */
export function cancellationLines(rules: CancellationRules): string[] {
  if (!rules.allowed) return ["No cancellations. Once booked, a spot can't be cancelled."];
  const c = rules.cutoffHours;
  const ws = windows(rules);
  if (ws.every((w) => w.percent === 0)) {
    return [c > 0 ? `You can cancel until ${hoursLabel(c)} before the start, but there's no refund.` : "You can cancel any time before the start, but there's no refund."];
  }
  const lines = ws.map((w) => {
    if (w.upper === null) return w.lower === 0 ? `${back(w.percent)} if you cancel any time before the start.` : `${back(w.percent)} if you cancel ${plus(w.lower)} before.`;
    if (w.lower === 0) return `${back(w.percent)} in the last ${hoursLabel(w.upper)}.`;
    return `${back(w.percent)} from ${range(w.upper, w.lower)}.`;
  });
  if (c > 0) lines.push(`No cancelling in the last ${hoursLabel(c)}.`);
  return lines;
}

export function cancellationSummary(rules: CancellationRules): string {
  return cancellationLines(rules).join(" ");
}

/* --------------------------------------------------------- reviewer flags */

export type CancellationFlagKey = "no-cancellations" | "long-cutoff";

export interface CancellationFlag {
  key: CancellationFlagKey;
  label: string;
  /** Why the reviewer should look twice. */
  body: string;
}

/** "No cancellations" and cut-offs over 48 hours: legal, but worth a second look before approving. */
export function cancellationFlags(rules: CancellationRules): CancellationFlag[] {
  if (!rules.allowed) {
    return [{ key: "no-cancellations", label: "No cancellations", body: "Customers can't cancel at all and get nothing back unless the organizer cancels. Check it suits this experience." }];
  }
  if (rules.cutoffHours > LONG_CUTOFF_HOURS) {
    return [{
      key: "long-cutoff",
      label: `Cancelling closes ${hoursLabel(rules.cutoffHours)} before the start`,
      body: `Customers can't cancel in the last ${hoursLabel(rules.cutoffHours)} — longer than the usual 48 hours. Check it's reasonable.`,
    }];
  }
  return [];
}

/** Everything a review screen shows: label, plain-words lines, flags, and whether it came from an old one-word preset. */
export function cancellationView(doc: Raw | null | undefined): { label: string; lines: string[]; summary: string; flags: CancellationFlag[]; legacy: boolean } {
  const { rules, source } = readCancellation(doc);
  return {
    label: source === "fallback" ? "Not set (read as Strict)" : PRESET_LABEL[rules.preset],
    lines: cancellationLines(rules),
    summary: cancellationSummary(rules),
    flags: cancellationFlags(rules),
    legacy: source !== "rules",
  };
}
