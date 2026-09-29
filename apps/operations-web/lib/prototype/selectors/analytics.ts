import type { PrototypeState } from "../scenarios";
import type { ScheduledSession } from "../entities";
import { sessionDay } from "../services/staff";
import { bookedCount } from "./status";

/**
 * Operations report computed from workspace records (sessions, bookings,
 * ledger, check-ins, incidents) — not from a pre-aggregated series.
 */

export type ReportRange = 7 | 30 | 90 | "all";

export interface ReportDay {
  day: string; // YYYY-MM-DD
  sessions: number;
  cancelledSessions: number;
  bookings: number;
  capacity: number;
  fillPct: number | null;
  revenue: number;
  refunds: number;
  noShows: number;
  incidents: number;
}

export interface OperationsReport {
  from: string;
  to: string;
  days: ReportDay[];
  totals: {
    sessions: number;
    cancelledSessions: number;
    bookings: number;
    capacity: number;
    fillPct: number | null;
    revenue: number;
    refunds: number;
    netRevenue: number;
    noShows: number;
    noShowPct: number | null;
    incidents: number;
    avgBookingValue: number;
  };
  byCategory: Array<{ id: string; name: string; sessions: number; bookings: number; revenue: number; fillPct: number | null }>;
  byVenue: Array<{ id: string; name: string; sessions: number; bookings: number; revenue: number; fillPct: number | null }>;
}

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Day (YYYY-MM-DD) of a timestamp label: ISO, or "Today, 18:42"-style. */
export function labelDay(label: string | undefined, now: Date = new Date()): string | undefined {
  if (!label) return undefined;
  if (/^\d{4}-\d{2}-\d{2}/.test(label)) {
    const d = new Date(label);
    return Number.isFinite(d.getTime()) && label.length > 10 ? iso(d) : label.slice(0, 10);
  }
  const head = label.split(",")[0].trim();
  const rel = /^(\d+)\s+days?\s+ago$/i.exec(head);
  if (rel) {
    const d = new Date(now);
    d.setDate(d.getDate() - parseInt(rel[1], 10));
    return iso(d);
  }
  const day = sessionDay(head, now);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : undefined;
}

const NO_SEAT = ["cancelled", "archived"];
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

export function selectOperationsReport(state: PrototypeState, range: ReportRange, opts: { territoryId?: string; now?: Date } = {}): OperationsReport {
  const now = opts.now ?? new Date();
  const sessions = state.sessions.filter((s) => !opts.territoryId || s.territoryId === opts.territoryId);
  const dayOf = new Map<string, string>(sessions.map((s) => [s.id, sessionDay(s.date, now)]));
  const to = iso(now);
  let from: string;
  if (range === "all") {
    const days = [...dayOf.values()].filter((d) => /^\d{4}/.test(d) && d <= to).sort();
    from = days[0] ?? to;
  } else {
    const d = new Date(now);
    d.setDate(d.getDate() - (range - 1));
    from = iso(d);
  }
  const inRange = (d?: string) => !!d && d >= from && d <= to;

  const dayList: string[] = [];
  for (let d = new Date(`${from}T00:00:00`); iso(d) <= to; d.setDate(d.getDate() + 1)) dayList.push(iso(d));
  const byDay = new Map<string, ReportDay>(dayList.map((day) => [day, { day, sessions: 0, cancelledSessions: 0, bookings: 0, capacity: 0, fillPct: null, revenue: 0, refunds: 0, noShows: 0, incidents: 0 }]));

  const scoped = sessions.filter((s) => inRange(dayOf.get(s.id)));
  const scopedIds = new Set(scoped.map((s) => s.id));
  const cat = new Map<string, { sessions: number; bookings: number; capacity: number; revenue: number }>();
  const ven = new Map<string, { sessions: number; bookings: number; capacity: number; revenue: number }>();
  const bump = (m: typeof cat, k: string, f: Partial<{ sessions: number; bookings: number; capacity: number; revenue: number }>) => {
    const cur = m.get(k) ?? { sessions: 0, bookings: 0, capacity: 0, revenue: 0 };
    m.set(k, { sessions: cur.sessions + (f.sessions ?? 0), bookings: cur.bookings + (f.bookings ?? 0), capacity: cur.capacity + (f.capacity ?? 0), revenue: cur.revenue + (f.revenue ?? 0) });
  };

  const sessionById = new Map<string, ScheduledSession>(scoped.map((s) => [s.id, s]));
  for (const s of scoped) {
    const row = byDay.get(dayOf.get(s.id)!)!;
    if (NO_SEAT.includes(s.status)) {
      row.cancelledSessions += s.status === "cancelled" ? 1 : 0;
      continue;
    }
    const booked = bookedCount(state, s.id);
    row.sessions += 1;
    row.bookings += booked;
    row.capacity += s.maxParticipants;
    bump(cat, s.categoryId, { sessions: 1, bookings: booked, capacity: s.maxParticipants });
    bump(ven, s.venueId, { sessions: 1, bookings: booked, capacity: s.maxParticipants });
  }

  for (const t of state.transactions) {
    if (!scopedIds.has(t.sessionId) || t.status !== "settled") continue;
    const row = byDay.get(dayOf.get(t.sessionId)!)!;
    const s = sessionById.get(t.sessionId)!;
    if (t.kind === "payment") {
      row.revenue += t.amount;
      bump(cat, s.categoryId, { revenue: t.amount });
      bump(ven, s.venueId, { revenue: t.amount });
    } else if (t.kind === "refund") {
      row.refunds += Math.abs(t.amount);
      bump(cat, s.categoryId, { revenue: -Math.abs(t.amount) });
      bump(ven, s.venueId, { revenue: -Math.abs(t.amount) });
    }
  }

  const noShowBookings = new Set<string>();
  for (const b of state.bookings) if (scopedIds.has(b.sessionId) && (b.noShow || b.status === "no-show")) noShowBookings.add(b.id);
  for (const r of state.checkInRecords) if (scopedIds.has(r.sessionId) && r.status === "no-show") noShowBookings.add(r.bookingId);
  for (const id of noShowBookings) {
    const b = state.bookings.find((x) => x.id === id);
    const day = b ? dayOf.get(b.sessionId) : undefined;
    if (day && byDay.has(day)) byDay.get(day)!.noShows += 1;
  }

  for (const i of state.incidents) {
    if (opts.territoryId && i.territoryId && i.territoryId !== opts.territoryId) continue;
    const day = i.sessionId && dayOf.has(i.sessionId) ? dayOf.get(i.sessionId) : labelDay(i.reportedAt ?? i.occurredAt, now);
    if (opts.territoryId && !i.territoryId && !(i.sessionId && dayOf.has(i.sessionId))) continue;
    if (day && byDay.has(day)) byDay.get(day)!.incidents += 1;
  }

  const days = [...byDay.values()].map((d) => ({ ...d, fillPct: pct(d.bookings, d.capacity) }));
  const sum = (k: keyof ReportDay) => days.reduce((a, d) => a + (Number(d[k]) || 0), 0);
  const bookings = sum("bookings");
  const capacity = sum("capacity");
  const revenue = sum("revenue");
  const refunds = sum("refunds");
  const noShows = sum("noShows");

  const rows = (m: typeof cat, name: (id: string) => string) =>
    [...m.entries()].map(([id, v]) => ({ id, name: name(id), sessions: v.sessions, bookings: v.bookings, revenue: v.revenue, fillPct: pct(v.bookings, v.capacity) })).sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings);

  return {
    from,
    to,
    days,
    totals: {
      sessions: sum("sessions"),
      cancelledSessions: sum("cancelledSessions"),
      bookings,
      capacity,
      fillPct: pct(bookings, capacity),
      revenue,
      refunds,
      netRevenue: revenue - refunds,
      noShows,
      noShowPct: pct(noShows, bookings),
      incidents: sum("incidents"),
      avgBookingValue: bookings ? Math.round(revenue / bookings) : 0,
    },
    byCategory: rows(cat, (id) => state.categories.find((c) => c.id === id)?.name ?? id),
    byVenue: rows(ven, (id) => state.venues.find((v) => v.id === id)?.name ?? id),
  };
}

const esc = (v: unknown) => {
  const s = v === undefined || v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV of the daily series plus totals. */
export function reportToCsv(r: OperationsReport): string {
  const head = ["date", "sessions", "cancelled_sessions", "bookings", "capacity", "fill_pct", "revenue_settled", "refunds_settled", "no_shows", "incidents"];
  const lines = r.days.map((d) => [d.day, d.sessions, d.cancelledSessions, d.bookings, d.capacity, d.fillPct ?? "", d.revenue, d.refunds, d.noShows, d.incidents]);
  const t = r.totals;
  lines.push(["TOTAL", t.sessions, t.cancelledSessions, t.bookings, t.capacity, t.fillPct ?? "", t.revenue, t.refunds, t.noShows, t.incidents]);
  return [head, ...lines].map((l) => l.map(esc).join(",")).join("\n");
}
