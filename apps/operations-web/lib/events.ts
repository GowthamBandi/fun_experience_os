/**
 * Pure helpers for the Experiences & Events table and Event 360 (no Firebase imports).
 * Field names verified in firebase/functions/src: events (catalog/events.ts saveEvent,
 * cancelInTx), bookings (bookings/reserveSeat.ts BookingDoc), tickets (commerce/tickets.ts
 * TicketDoc), reviews (catalog/reviews.ts) and ledgerEntries (commerce/ledger.ts).
 */

import type { BadgeTone } from "@/components/pulse/Badge";
import { toDate } from "./console/records";
import type { OrgEventRow } from "./organizers";

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/* -------------------------------------------------------------------- tabs */

export type EventTab = "upcoming" | "live" | "past" | "drafts" | "cancelled";

export const EVENT_TABS: Array<{ id: EventTab; label: string }> = [
  { id: "upcoming", label: "Upcoming" },
  { id: "live", label: "Live" },
  { id: "past", label: "Past" },
  { id: "drafts", label: "Drafts & review" },
  { id: "cancelled", label: "Cancelled" },
];

/** On sale or running (the lifecycle phases a published event moves through before completion). */
export const OPEN_STATUSES = ["published", "booking-closed", "live"] as const;
/**
 * Not yet published, or knocked off the lifecycle. "paused", "blocked" and "active" only appear
 * when a legacy console wrote them through setMarketplaceEntityStatus; they're listed here so such
 * an event still shows up somewhere.
 */
export const DRAFT_STATUSES = ["draft", "submitted", "under-review", "changes-requested", "approved", "rejected", "paused", "blocked", "active"] as const;

/** Statuses adminCancelEvent accepts (catalog/events.ts PRE_COMPLETED). */
const CANCELLABLE = new Set(["draft", "submitted", "changes-requested", "approved", "published", "booking-closed", "live"]);

export function isCancellable(status: unknown): boolean {
  return CANCELLABLE.has(String(status ?? ""));
}

/** Statuses the event lifecycle doesn't know (written by setMarketplaceEntityStatus on an event). */
export function isOffLifecycle(status: unknown): boolean {
  return status === "paused" || status === "blocked" || status === "active";
}

/**
 * Which tab an event belongs in at `now`. Open events are live while the organizer has them in the
 * live phase or the clock is inside startsAt..endsAt (the same window as /live), past once endsAt has
 * gone by without anyone completing them, and upcoming otherwise.
 */
export function eventTab(e: Pick<OrgEventRow, "status" | "startsAt" | "endsAt">, now: Date): EventTab {
  const s = e.status ?? "";
  if (s === "cancelled") return "cancelled";
  if (s === "completed") return "past";
  if (!(OPEN_STATUSES as readonly string[]).includes(s)) return "drafts";
  if (s === "live") return "live";
  const t = now.getTime();
  const start = e.startsAt?.getTime() ?? null;
  const end = e.endsAt?.getTime() ?? (start !== null ? start + 3 * 3_600_000 : null);
  if (end !== null && end <= t) return "past";
  if (start !== null && start <= t) return "live";
  return "upcoming";
}

/** Upcoming and live soonest first; everything else newest first. */
export function sortForTab(rows: OrgEventRow[], tab: EventTab): OrgEventRow[] {
  const at = (e: OrgEventRow) => e.startsAt?.getTime() ?? 0;
  const asc = tab === "upcoming" || tab === "live";
  return [...rows].sort((a, b) => (asc ? at(a) - at(b) : at(b) - at(a)));
}

export function partitionEvents(rows: OrgEventRow[], now: Date): Record<EventTab, OrgEventRow[]> {
  const out: Record<EventTab, OrgEventRow[]> = { upcoming: [], live: [], past: [], drafts: [], cancelled: [] };
  for (const e of rows) out[eventTab(e, now)].push(e);
  for (const t of Object.keys(out) as EventTab[]) out[t] = sortForTab(out[t], t);
  return out;
}

export function parseEventTab(value: string | null | undefined): EventTab {
  return EVENT_TABS.some((t) => t.id === value) ? (value as EventTab) : "upcoming";
}

/* ------------------------------------------------------------------ filters */

export interface EventFilters {
  city: string | null;
  category: string | null;
  search: string;
}

/** Facet chips with counts, most common first. */
export function facets(rows: OrgEventRow[], key: "city" | "category"): Array<{ value: string; count: number }> {
  const by = new Map<string, number>();
  for (const e of rows) {
    const v = e[key];
    if (v) by.set(v, (by.get(v) ?? 0) + 1);
  }
  return [...by.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function filterEvents(rows: OrgEventRow[], f: EventFilters): OrgEventRow[] {
  const q = f.search.trim().toLowerCase();
  return rows.filter((e) => {
    if (f.city && e.city !== f.city) return false;
    if (f.category && e.category !== f.category) return false;
    if (!q) return true;
    return [e.title, e.organizerName, e.city, e.venue, e.id].some((v) => v && v.toLowerCase().includes(q));
  });
}

/* --------------------------------------------------------------------- time */

const IST = "Asia/Kolkata";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: IST }).format(d);

/** "Sat, 11 Oct · 7:00 pm" in IST. */
export function eventWhen(d: Date | null): string {
  if (!d) return "—";
  const day = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: IST }).format(d);
  const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST }).format(d).toLowerCase();
  return `${day} · ${time}`;
}

/** A relative label by IST calendar day: "in 40 min", "today", "tomorrow", "in 5 days", "3 days ago". */
export function startsRel(d: Date | null, now: Date): string {
  if (!d) return "—";
  const diffMs = d.getTime() - now.getTime();
  if (diffMs > 0 && diffMs < 3_600_000) return `in ${Math.max(1, Math.round(diffMs / 60_000))} min`;
  if (diffMs <= 0 && diffMs > -3_600_000) return `started ${Math.max(1, Math.round(-diffMs / 60_000))} min ago`;
  const days = Math.round((Date.parse(dayKey(d)) - Date.parse(dayKey(now))) / 86_400_000);
  if (days === 0) return diffMs > 0 ? `today, in ${Math.round(diffMs / 3_600_000)} h` : "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Same IST day: "Sat, 11 Oct · 7:00 pm – 9:00 pm"; otherwise both ends in full. */
export function eventRange(start: Date | null, end: Date | null): string {
  if (!start) return "—";
  if (!end) return eventWhen(start);
  if (dayKey(start) === dayKey(end)) {
    const time = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: IST }).format(end).toLowerCase();
    return `${eventWhen(start)} – ${time}`;
  }
  return `${eventWhen(start)} → ${eventWhen(end)}`;
}

/* ----------------------------------------------------------------- capacity */

export interface Occupancy {
  capacity: number | null;
  blocked: number;
  taken: number | null;
  held: number;
  waitlist: number;
  /** capacity − blocked − taken − held, never below 0; null when capacity or taken is unknown. */
  left: number | null;
}

/** capacity.maxPhysicalCapacity (fallback capacity.max); taken = confirmed paid + complimentary. */
export function occupancyOf(d: Raw): Occupancy {
  const cap = d.capacity && typeof d.capacity === "object" ? (d.capacity as Raw) : {};
  const occ = d.occupancy && typeof d.occupancy === "object" ? (d.occupancy as Raw) : {};
  const capacity = num(cap.maxPhysicalCapacity) ?? num(cap.max);
  const blocked = num(cap.blockedSlots) ?? num(cap.blocked) ?? 0;
  const paid = num(occ.confirmedPaidBookings);
  const comp = num(occ.confirmedComplimentaryBookings);
  const taken = paid === null && comp === null ? null : (paid ?? 0) + (comp ?? 0);
  const held = (num(occ.activeReservationHolds) ?? 0) + (num(occ.waitlistOfferHolds) ?? 0);
  const waitlist = num(occ.waitlistCount) ?? 0;
  const left = capacity !== null && taken !== null ? Math.max(0, capacity - blocked - taken - held) : null;
  return { capacity, blocked, taken, held, waitlist, left };
}

/** Whole percent, or null when either side is unknown or the total is 0. */
export function ratio(part: number | null, total: number | null): number | null {
  if (part === null || total === null || total <= 0) return null;
  return Math.round((part / total) * 100);
}

/* ----------------------------------------------------------------- bookings */

export interface BookingRow {
  id: string;
  reference: string | null;
  alias: string | null;
  spots: number | null;
  amountMinor: number | null;
  status: string | null;
  complimentary: boolean;
  createdAt: Date | null;
  customerUid: string | null;
  eventId: string | null;
}

export function toBooking(id: string, d: Raw): BookingRow {
  return {
    id,
    reference: str(d.reference),
    alias: str(d.alias),
    spots: num(d.spots),
    amountMinor: num(d.amountMinor),
    status: str(d.status),
    complimentary: d.bookingType === "complimentary" || d.kind === "complimentary",
    createdAt: toDate(d.createdAt),
    customerUid: str(d.customerUid),
    eventId: str(d.eventId),
  };
}

const BOOKING_BADGE: Record<string, { label: string; tone: BadgeTone }> = {
  held: { label: "Held", tone: "warn" },
  confirmed: { label: "Confirmed", tone: "ok" },
  completed: { label: "Completed", tone: "violet" },
  expired: { label: "Expired", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "err" },
  "payment-orphaned": { label: "Payment orphaned", tone: "err" },
};

export function bookingBadge(status: unknown): { label: string; tone: BadgeTone } {
  const s = str(status);
  return (s && BOOKING_BADGE[s]) || { label: s ?? "—", tone: "muted" };
}

/** Counts by status, plus spots in confirmed or completed bookings. */
export function bookingSummary(rows: BookingRow[]): { confirmed: number; spots: number; held: number; cancelled: number } {
  let confirmed = 0;
  let spots = 0;
  let held = 0;
  let cancelled = 0;
  for (const b of rows) {
    if (b.status === "confirmed" || b.status === "completed") {
      confirmed++;
      spots += b.spots ?? 0;
    } else if (b.status === "held") held++;
    else if (b.status === "cancelled") cancelled++;
  }
  return { confirmed, spots, held, cancelled };
}

/* ------------------------------------------------------------------ reviews */

export interface ReviewRow {
  id: string;
  rating: number | null;
  comment: string | null;
  author: string | null;
  status: string | null;
  at: Date | null;
}

export function toReview(id: string, d: Raw): ReviewRow {
  const r = num(d.rating);
  return {
    id,
    rating: r !== null && r >= 1 && r <= 5 ? r : null,
    comment: str(d.comment),
    author: str(d.authorName),
    status: str(d.status),
    at: toDate(d.updatedAt) ?? toDate(d.createdAt),
  };
}
