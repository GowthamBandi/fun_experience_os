/**
 * Organizer-set cancellation rules (docs/CANCELLATION_POLICY_CONTRACT.md).
 *
 *   cancellation: { allowed, cutoffHours, tiers: [{ hoursBefore, refundPercent }], preset }
 *
 * Set on experiences, copied to events, frozen on bookings at reservation.
 * The three old string presets (`cancellationPolicy`) read as the matching
 * rules everywhere, so old listings and bookings behave exactly as before.
 *
 * PURE and import-free on purpose: the operations console's parity test loads
 * this file directly and checks its own copy (apps/operations-web/lib/cancellation.ts)
 * says the same thing.
 */

export const CANCELLATION_PRESET_NAMES = ["flexible", "moderate", "strict", "none"] as const;
export type CancellationPresetName = (typeof CANCELLATION_PRESET_NAMES)[number];
export type CancellationPreset = CancellationPresetName | "custom";

/** 30 days: the furthest a cut-off or a refund tier can reach before the start. */
export const MAX_CANCELLATION_HOURS = 720;
export const MAX_REFUND_TIERS = 4;
/** Cut-offs longer than this are flagged for the reviewer. */
export const LONG_CUTOFF_HOURS = 48;

export interface RefundTier {
  hoursBefore: number;
  refundPercent: number;
}

export interface CancellationRules {
  /** false = "No cancellations": the customer can't cancel at all. */
  allowed: boolean;
  /** Customers can cancel until this many hours before the start (0 = until the start). */
  cutoffHours: number;
  /** hoursBefore strictly descending, refundPercent non-increasing; first tier with hoursBefore <= hours left wins, none → 0%. */
  tiers: RefundTier[];
  /** What the organizer picked (display only). */
  preset: CancellationPreset;
}

const PRESETS: Record<CancellationPresetName, Omit<CancellationRules, "preset">> = {
  flexible: { allowed: true, cutoffHours: 0, tiers: [{ hoursBefore: 24, refundPercent: 100 }, { hoursBefore: 0, refundPercent: 50 }] },
  moderate: { allowed: true, cutoffHours: 0, tiers: [{ hoursBefore: 72, refundPercent: 100 }, { hoursBefore: 24, refundPercent: 50 }] },
  strict: { allowed: true, cutoffHours: 0, tiers: [{ hoursBefore: 168, refundPercent: 100 }] },
  none: { allowed: false, cutoffHours: 0, tiers: [] },
};

export function isPresetName(v: unknown): v is CancellationPresetName {
  return typeof v === "string" && (CANCELLATION_PRESET_NAMES as readonly string[]).includes(v);
}

/** A fresh copy of a preset's rules. */
export function presetRules(name: CancellationPresetName): CancellationRules {
  const p = PRESETS[name];
  return { allowed: p.allowed, cutoffHours: p.cutoffHours, tiers: p.tiers.map((t) => ({ ...t })), preset: name };
}

/** Same customer-facing rules (the display-only `preset` is ignored). */
export function sameRules(a: Omit<CancellationRules, "preset">, b: Omit<CancellationRules, "preset">): boolean {
  return (
    a.allowed === b.allowed &&
    a.cutoffHours === b.cutoffHours &&
    a.tiers.length === b.tiers.length &&
    a.tiers.every((t, i) => t.hoursBefore === b.tiers[i]!.hoursBefore && t.refundPercent === b.tiers[i]!.refundPercent)
  );
}

/** The named preset these rules are exactly, if any. */
export function matchingPreset(r: Omit<CancellationRules, "preset">): CancellationPresetName | null {
  return CANCELLATION_PRESET_NAMES.find((n) => sameRules(r, PRESETS[n])) ?? null;
}

/* ============================================================ validation */

export type CancellationProblem = { message: string; tier?: number };
export type ParsedCancellation = { ok: true; rules: CancellationRules } | ({ ok: false } & CancellationProblem);

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min && v <= max;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const fail = (message: string, tier?: number): ParsedCancellation => (tier === undefined ? { ok: false, message } : { ok: false, message, tier });

/**
 * Validates organizer input (and re-reads stored rules). Unknown keys are
 * dropped. When cancelling isn't allowed, the cut-off and tiers don't apply and
 * are stored empty. `preset` is display-only: a named preset whose rules were
 * changed is stored as "custom", and a missing one is worked out from the rules.
 */
export function parseCancellationRules(raw: unknown): ParsedCancellation {
  if (!isObj(raw)) return fail("Set the cancellation rules.");
  if (typeof raw.allowed !== "boolean") return fail("Choose whether customers can cancel.");
  let given: CancellationPreset | null = null;
  if (raw.preset !== undefined && raw.preset !== null) {
    if (raw.preset !== "custom" && !isPresetName(raw.preset)) return fail("That cancellation preset isn't supported.");
    given = raw.preset as CancellationPreset;
  }

  let body: Omit<CancellationRules, "preset">;
  if (!raw.allowed) {
    body = { allowed: false, cutoffHours: 0, tiers: [] };
  } else {
    const cutoff = raw.cutoffHours === undefined || raw.cutoffHours === null ? 0 : raw.cutoffHours;
    if (!isInt(cutoff, 0, MAX_CANCELLATION_HOURS)) {
      return fail(`The cancellation cut-off must be a whole number of hours from 0 to ${MAX_CANCELLATION_HOURS}.`);
    }
    if (!Array.isArray(raw.tiers)) return fail("Refund tiers must be a list.");
    if (raw.tiers.length === 0) return fail("Add at least one refund tier.");
    if (raw.tiers.length > MAX_REFUND_TIERS) return fail(`Use at most ${MAX_REFUND_TIERS} refund tiers.`);
    const tiers: RefundTier[] = [];
    for (let i = 0; i < raw.tiers.length; i++) {
      const t = raw.tiers[i];
      const n = i + 1;
      if (!isObj(t)) return fail(`Refund tier ${n} is incomplete.`, n);
      if (!isInt(t.hoursBefore, 0, MAX_CANCELLATION_HOURS)) {
        return fail(`Refund tier ${n}: the hours before the start must be a whole number from 0 to ${MAX_CANCELLATION_HOURS}.`, n);
      }
      if (!isInt(t.refundPercent, 0, 100)) return fail(`Refund tier ${n}: the refund must be a whole percent from 0 to 100.`, n);
      const prev = tiers[i - 1];
      if (prev && t.hoursBefore === prev.hoursBefore) return fail("Two refund tiers can't start at the same time before the event.", n);
      if (prev && t.hoursBefore > prev.hoursBefore) return fail("Refund tiers must go from earliest to latest.", n);
      if (prev && t.refundPercent > prev.refundPercent) return fail("A later refund tier can't give back more than an earlier one.", n);
      tiers.push({ hoursBefore: t.hoursBefore, refundPercent: t.refundPercent });
    }
    body = { allowed: true, cutoffHours: cutoff, tiers };
  }

  const preset: CancellationPreset =
    given === "custom" ? "custom" : given !== null ? (sameRules(body, PRESETS[given]) ? given : "custom") : (matchingPreset(body) ?? "custom");
  return { ok: true, rules: { ...body, preset } };
}

/* ============================================================== reading */

export interface ResolvedCancellation {
  rules: CancellationRules;
  /**
   * The policy's name for reasons and logs: the preset, or for a document that
   * only has the old string, that string exactly as before ("strict" if absent).
   */
  label: string;
  source: "rules" | "preset" | "fallback";
}

/**
 * The rules a document (booking, event or experience) carries: its
 * `cancellation` object when valid, else its old `cancellationPolicy` string
 * read as that preset, else strict (what an unknown policy always meant).
 */
export function resolveCancellation(doc: { cancellation?: unknown; cancellationPolicy?: unknown } | null | undefined): ResolvedCancellation {
  if (doc && doc.cancellation !== undefined && doc.cancellation !== null) {
    const p = parseCancellationRules(doc.cancellation);
    if (p.ok) return { rules: p.rules, label: p.rules.preset, source: "rules" };
  }
  const legacy = doc?.cancellationPolicy;
  if (isPresetName(legacy)) return { rules: presetRules(legacy), label: legacy, source: "preset" };
  return { rules: presetRules("strict"), label: typeof legacy === "string" ? legacy : "strict", source: "fallback" };
}

/** True when the document has a valid `cancellation` object of its own. */
export function hasOwnRules(doc: { cancellation?: unknown } | null | undefined): boolean {
  return !!doc && doc.cancellation !== undefined && doc.cancellation !== null && parseCancellationRules(doc.cancellation).ok;
}

/* ============================================================== quoting */

/** Refund percent `hoursLeft` before the start: the first tier whose hoursBefore <= hoursLeft, else 0. */
export function refundPercentFor(rules: Pick<CancellationRules, "tiers">, hoursLeft: number): number {
  if (!(hoursLeft >= 0)) return 0;
  for (const t of rules.tiers) if (t.hoursBefore <= hoursLeft) return t.refundPercent;
  return 0;
}

export type CancelVerdict =
  | { ok: true; percent: number }
  | { ok: false; reason: "not-allowed" }
  | { ok: false; reason: "cutoff"; cutoffHours: number };

/**
 * May the customer cancel `hoursLeft` before the start, and for what refund?
 * Inside the cut-off means strictly fewer hours left than `cutoffHours`:
 * exactly at the cut-off, cancelling is still open.
 */
export function cancelVerdict(rules: CancellationRules, hoursLeft: number): CancelVerdict {
  if (!rules.allowed) return { ok: false, reason: "not-allowed" };
  if (hoursLeft < rules.cutoffHours) return { ok: false, reason: "cutoff", cutoffHours: rules.cutoffHours };
  return { ok: true, percent: refundPercentFor(rules, hoursLeft) };
}

/* ========================================================== plain words */

export const PRESET_LABEL: Record<CancellationPreset, string> = {
  flexible: "Flexible",
  moderate: "Moderate",
  strict: "Strict",
  none: "No cancellations",
  custom: "Custom",
};

/** 72 h and longer whole days read in days ("3 days", "7 days"); the rest in hours ("48 hours", "1 hour"). */
function span(h: number): { n: number; unit: string } {
  if (h >= 72 && h % 24 === 0) return { n: h / 24, unit: "days" };
  return { n: h, unit: h === 1 ? "hour" : "hours" };
}

export function hoursLabel(h: number): string {
  const s = span(h);
  return `${s.n} ${s.unit}`;
}

const plus = (h: number) => {
  const s = span(h);
  return `${s.n}+ ${s.unit === "hour" ? "hours" : s.unit}`;
};

function range(upper: number, lower: number): string {
  const a = span(upper);
  const b = span(lower);
  const unit = (u: string) => (u === "hour" ? "hours" : u);
  return unit(a.unit) === unit(b.unit) ? `${a.n} to ${b.n} ${unit(b.unit)}` : `${hoursLabel(upper)} to ${hoursLabel(lower)}`;
}

const back = (p: number) => (p >= 100 ? "Full refund" : p <= 0 ? "No refund" : `${p}% back`);

interface Segment {
  /** null = no upper end (as early as you like). */
  upper: number | null;
  lower: number;
  percent: number;
}

/** The windows a customer can cancel in (from the earliest down to the cut-off), each with its refund. */
export function refundWindows(rules: CancellationRules): Segment[] {
  if (!rules.allowed) return [];
  const c = rules.cutoffHours;
  const out: Segment[] = [];
  let upper: number | null = null;
  for (const t of rules.tiers) {
    const lower = Math.max(t.hoursBefore, c);
    if (upper === null || upper > lower) out.push({ upper, lower, percent: t.refundPercent });
    upper = upper === null ? t.hoursBefore : Math.min(upper, t.hoursBefore);
    if (upper <= c) break;
  }
  if (upper !== null && upper > c) out.push({ upper, lower: c, percent: 0 });
  const merged: Segment[] = [];
  for (const s of out) {
    const last = merged[merged.length - 1];
    if (last && last.percent === s.percent) last.lower = s.lower;
    else merged.push({ ...s });
  }
  return merged;
}

/**
 * The rules as customers read them, one sentence per line, e.g.
 * ["Full refund if you cancel 48+ hours before.", "50% back from 48 to 24 hours.", "No cancelling in the last 24 hours."].
 */
export function cancellationLines(rules: CancellationRules): string[] {
  if (!rules.allowed) return ["No cancellations. Once booked, a spot can't be cancelled."];
  const c = rules.cutoffHours;
  const windows = refundWindows(rules);
  if (windows.every((w) => w.percent === 0)) {
    return [c > 0 ? `You can cancel until ${hoursLabel(c)} before the start, but there's no refund.` : "You can cancel any time before the start, but there's no refund."];
  }
  const lines = windows.map((w) => {
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

export type CancellationFlagKey = "no-cancellations" | "long-cutoff";

/** What a reviewer should look at twice: no cancellations at all, or a cut-off over 48 hours. */
export function cancellationFlags(rules: CancellationRules): Array<{ key: CancellationFlagKey; label: string }> {
  if (!rules.allowed) return [{ key: "no-cancellations", label: "No cancellations" }];
  if (rules.cutoffHours > LONG_CUTOFF_HOURS) return [{ key: "long-cutoff", label: `Cancelling closes ${hoursLabel(rules.cutoffHours)} before the start` }];
  return [];
}
