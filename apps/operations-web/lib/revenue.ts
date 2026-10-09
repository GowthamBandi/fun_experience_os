/** Revenue page logic kept free of React and Firebase so it can be unit-tested. */

import { SCHEDULED_STATUSES, type Ev } from "@/lib/overview";

/** Gross minus refunds; null when either side is unknown, so the card shows "—" rather than NaN. */
export function netMinor(gross: number | null, refunds: number | null): number | null {
  if (gross === null || refunds === null || !Number.isFinite(gross) || !Number.isFinite(refunds)) return null;
  return gross - refunds;
}

/** Paid spots × ticket price. Complimentary spots bring no money; a missing field gives null, never a guess. */
export function bookedMinor(e: Ev): number | null {
  if (e.paid === null || e.priceMinor === null) return null;
  return e.paid * e.priceMinor;
}

export interface ValueRow {
  key: string;
  label: string;
  value: number;
  events: number;
}

export interface BookedBreakdown {
  rows: ValueRow[];
  total: number;
  /** Scheduled events counted. */
  events: number;
  /** Scheduled events skipped for a missing price or paid count. */
  unknown: number;
}

const titleCase = (s: string) => s.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Booked value of scheduled events grouped by city or category, largest first; zero-value groups drop out. */
export function bookedValueBy(events: Ev[], by: "city" | "category"): BookedBreakdown {
  const groups = new Map<string, ValueRow>();
  let total = 0;
  let counted = 0;
  let unknown = 0;
  for (const e of events) {
    if (!SCHEDULED_STATUSES.has(e.status)) continue;
    const value = bookedMinor(e);
    if (value === null) {
      unknown++;
      continue;
    }
    counted++;
    total += value;
    const raw = by === "city" ? e.city : e.category;
    const key = raw ?? "";
    const label = raw ? (by === "city" ? raw : titleCase(raw)) : by === "city" ? "City not set" : "Category not set";
    const row = groups.get(key) ?? { key, label, value: 0, events: 0 };
    row.value += value;
    row.events++;
    groups.set(key, row);
  }
  const rows = [...groups.values()].filter((r) => r.value > 0).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
  return { rows, total, events: counted, unknown };
}

export interface SeriesSummary {
  total: number;
  average: number;
  best: { label: string; value: number } | null;
  activeDays: number;
}

/** Totals for a daily series; the best day is the first highest one, and none when every day is zero. */
export function seriesSummary(points: Array<{ label: string; value: number }>): SeriesSummary {
  const clean = points.filter((p) => Number.isFinite(p.value));
  const total = clean.reduce((n, p) => n + p.value, 0);
  let best: SeriesSummary["best"] = null;
  for (const p of clean) if (p.value > 0 && (!best || p.value > best.value)) best = p;
  return { total, average: clean.length ? total / clean.length : 0, best, activeDays: clean.filter((p) => p.value > 0).length };
}
