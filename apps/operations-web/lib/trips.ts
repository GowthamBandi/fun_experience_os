/**
 * Trips review queue: pure helpers (row mapping, queue order, draft presentation, decision checks).
 *
 * Source: tripDrafts/{hostTripId}, written by the PULSE organizer app. A submitted draft is
 * "in-review"; operators approve it (status "live", tripId set), send it back
 * ("changes-requested", with a note) or reject it, through the reviewTrip callable.
 */

import type { BadgeTone } from "@/components/pulse/Badge";
import { TRIP_NOTE_MAX, TRIP_NOTE_MIN, decisionKey, type TripOutcome } from "./console/actions";
import { toDate } from "./console/records";
import { inr, relTime } from "./format";
import { spotOf, type Spot } from "./maps";

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const strings = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter((x): x is string => x !== null) : []);
const objects = (v: unknown): Raw[] => (Array.isArray(v) ? v.filter((x): x is Raw => !!x && typeof x === "object" && !Array.isArray(x)) : []);

/* ---------------------------------------------------------------- statuses */

export const TRIP_STATUSES = ["draft", "in-review", "changes-requested", "live", "rejected"] as const;
export type TripStatus = (typeof TRIP_STATUSES)[number];

/** Statuses the console lists (drafts stay private to the organizer). */
export type TripTab = "in-review" | "changes-requested" | "live" | "rejected";

export const TRIP_TABS: Array<{ id: TripTab; label: string }> = [
  { id: "in-review", label: "In review" },
  { id: "changes-requested", label: "Changes requested" },
  { id: "live", label: "Live" },
  { id: "rejected", label: "Rejected" },
];

export const TRIP_TAB_IDS: TripTab[] = TRIP_TABS.map((t) => t.id);

const BADGE: Record<TripStatus, { label: string; tone: BadgeTone }> = {
  draft: { label: "Draft", tone: "muted" },
  "in-review": { label: "In review", tone: "violet" },
  "changes-requested": { label: "Changes requested", tone: "warn" },
  live: { label: "Live", tone: "ok" },
  rejected: { label: "Rejected", tone: "err" },
};

export function tripBadge(status: unknown): { label: string; tone: BadgeTone } {
  return BADGE[status as TripStatus] ?? { label: str(status) ?? "Unknown", tone: "muted" };
}

/** Only a submitted draft can be decided (the server refuses anything else). */
export const isDecidable = (row: { status: string | null }): boolean => row.status === "in-review";

/* ------------------------------------------------------------------ labels */

export const STYLE_LABEL: Record<string, { label: string; emoji: string }> = {
  weekend: { label: "Weekend getaway", emoji: "🏕️" },
  trek: { label: "Trek", emoji: "🥾" },
  roadTrip: { label: "Road trip", emoji: "🚐" },
  beach: { label: "Beach", emoji: "🏖️" },
  heritage: { label: "Heritage", emoji: "🏛️" },
  international: { label: "International", emoji: "✈️" },
};

export function tripStyle(style: unknown): { label: string; emoji: string } {
  const key = str(style);
  return (key && STYLE_LABEL[key]) || { label: key ?? "—", emoji: "🧭" };
}

export const DIFFICULTY_LABEL: Record<string, string> = { easy: "Easy", light: "Light", moderate: "Moderate", challenging: "Challenging", demanding: "Demanding" };
export const GENDER_LABEL: Record<string, string> = { open: "Open to all", mixed: "Mixed group", womenOnly: "Women only", menOnly: "Men only" };
export const ROOM_POLICY_LABEL: Record<string, string> = {
  guaranteed: "Guaranteed — the room type booked is the room type given",
  bestEffort: "Best effort — room type depends on availability",
};
export const REFUND_LABEL: Record<string, string> = { flexible: "Flexible", standard: "Standard", strict: "Strict" };

const label = (map: Record<string, string>, v: unknown): string => {
  const key = str(v);
  return key ? map[key] ?? key : "—";
};

/** Whole rupees ("₹12,499"); "—" when missing. */
export const rupees = (n: number | null | undefined): string => (typeof n === "number" && Number.isFinite(n) ? inr(n) : "—");

/** A departure's price change: "+₹1,500", "−₹500", "Base price". */
export function priceDeltaLabel(delta: number | null): string {
  if (delta === null || delta === 0) return "Base price";
  return delta > 0 ? `+${inr(delta)}` : `−${inr(Math.abs(delta))}`;
}

/** "18–45", "18+" or "—". */
export function ageRange(min: number | null, max: number | null): string {
  if (min === null) return max === null ? "—" : `Up to ${max}`;
  return max === null ? `${min}+` : `${min}–${max}`;
}

/** "6–18 people", "Up to 12" or "—". */
export function groupRange(min: number | null, max: number | null): string {
  if (min === null && max === null) return "—";
  if (min === null) return `Up to ${max}`;
  if (max === null) return `${min}+ people`;
  return min === max ? `${min} people` : `${min}–${max} people`;
}

const DAY = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
const DAY_YEAR = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

/** "Fri, 12 Dec → 15 Dec 2026" (ISO start/end, India time); falls back to whichever end is valid. */
export function departureRange(start: string | null, end: string | null): string {
  const s = start ? toDate(start) : null;
  const e = end ? toDate(end) : null;
  if (s && e) return `${DAY.format(s)} → ${DAY_YEAR.format(e)}`;
  if (s) return DAY_YEAR.format(s);
  if (e) return `until ${DAY_YEAR.format(e)}`;
  return "—";
}

/* ------------------------------------------------------------------- draft */

export interface TripActivity { time: string | null; title: string; detail: string | null; icon: string | null }
export interface TripMeal { meal: string; time: string | null; place: string | null; menu: string | null; diets: string[] }
export interface TripDay {
  title: string;
  summary: string | null;
  activities: TripActivity[];
  meals: string[];
  mealPlan: TripMeal[];
  stay: string | null;
  travel: string | null;
  overnightTransit: boolean;
}
export interface TripStay { name: string; type: string | null; location: string | null; nights: number | null; note: string | null }
export interface TripVehicle { type: string; leg: string | null; model: string | null; seats: number | null; ac: boolean | null; features: string[] }
export interface TripPoint { id: string; name: string; landmark: string | null; time: string | null; spot: Spot | null }
export interface TripGoodie { title: string; moment: string | null; detail: string | null }
export interface TripDeparture { id: string; start: string | null; end: string | null; seatsTotal: number | null; priceDelta: number | null; longWeekend: string | null }
export interface TripRoom { id: string; label: string; occupancy: number | null; price: number | null; beds: string | null }
export interface TripAddOn { id: string; title: string; description: string | null; price: number | null; icon: string | null }
export interface TripFact { icon: string | null; title: string; text: string | null }
export interface TripFaq { q: string; a: string | null }

export interface TripDraft {
  title: string | null;
  tagline: string | null;
  destination: string | null;
  region: string | null;
  style: string | null;
  startCity: string | null;
  route: string[];
  highlights: string[];
  days: TripDay[];
  stays: TripStay[];
  vehicles: TripVehicle[];
  transport: string | null;
  diets: string[];
  foodNote: string | null;
  pickups: TripPoint[];
  drops: TripPoint[];
  reportingNote: string | null;
  returnNote: string | null;
  goodies: TripGoodie[];
  rules: string[];
  luggageNote: string | null;
  bookingCutoffDays: number | null;
  bestSeason: string | null;
  altitude: string | null;
  difficulty: string | null;
  gender: string | null;
  ageMin: number | null;
  ageMax: number | null;
  groupMin: number | null;
  groupMax: number | null;
  departures: TripDeparture[];
  rooms: TripRoom[];
  roomPolicy: string | null;
  roomNote: string | null;
  deposit: number | null;
  compareAt: number | null;
  addOns: TripAddOn[];
  inclusions: string[];
  exclusions: string[];
  refund: string | null;
  facts: TripFact[];
  faqs: TripFaq[];
  packing: Array<{ category: string; items: string[] }>;
  captainName: string | null;
  captainRole: string | null;
  captainBio: string | null;
  languages: string[];
  certifications: string[];
}

/** Strings and numbers are both shown as text (the app may store altitude as "3,500 m" or 3500). */
const textOrNumber = (v: unknown): string | null => str(v) ?? (num(v) !== null ? String(v) : null);
const id = (r: Raw, i: number, prefix: string) => str(r.id) ?? `${prefix}-${i}`;

const points = (v: unknown, prefix: string): TripPoint[] =>
  objects(v).map((p, i) => ({
    id: id(p, i, prefix),
    name: str(p.name) ?? "—",
    landmark: str(p.landmark),
    time: str(p.time),
    // Trip points carry only organizer pins (never address guesses).
    spot: spotOf({ ...p, pinned: true }),
  }));

/** The organizer's draft as a tolerant view model: missing or malformed fields read as empty, never throw. */
export function parseDraft(value: unknown): TripDraft {
  const d = obj(value);
  const packing = obj(d.packing);
  return {
    title: str(d.title),
    tagline: str(d.tagline),
    destination: str(d.destination),
    region: str(d.region),
    style: str(d.style),
    startCity: str(d.startCity),
    route: strings(d.route),
    highlights: strings(d.highlights),
    days: objects(d.days).map((day, i) => ({
      title: str(day.title) ?? `Day ${i + 1}`,
      summary: str(day.summary),
      activities: objects(day.activities).map((a) => ({ time: str(a.time), title: str(a.title) ?? "—", detail: str(a.detail), icon: str(a.icon) })),
      meals: strings(day.meals),
      mealPlan: objects(day.mealPlan).map((m) => ({ meal: str(m.meal) ?? "Meal", time: str(m.time), place: str(m.place), menu: str(m.menu), diets: strings(m.diets) })),
      stay: str(day.stay),
      travel: str(day.travel),
      overnightTransit: day.overnightTransit === true,
    })),
    stays: objects(d.stays).map((s) => ({ name: str(s.name) ?? "—", type: str(s.type), location: str(s.location), nights: num(s.nights), note: str(s.note) })),
    vehicles: objects(d.vehicles).map((v) => ({ type: str(v.type) ?? "Vehicle", leg: str(v.leg), model: str(v.model), seats: num(v.seats), ac: bool(v.ac), features: strings(v.features) })),
    transport: str(d.transport),
    diets: strings(d.diets),
    foodNote: str(d.foodNote),
    pickups: points(d.pickups, "pickup"),
    drops: points(d.drops, "drop"),
    reportingNote: str(d.reportingNote),
    returnNote: str(d.returnNote),
    goodies: objects(d.goodies).map((g) => ({ title: str(g.title) ?? "—", moment: str(g.moment), detail: str(g.detail) })),
    rules: strings(d.rules),
    luggageNote: str(d.luggageNote),
    bookingCutoffDays: num(d.bookingCutoffDays),
    bestSeason: str(d.bestSeason),
    altitude: textOrNumber(d.altitude),
    difficulty: str(d.difficulty),
    gender: str(d.gender),
    ageMin: num(d.ageMin),
    ageMax: num(d.ageMax),
    groupMin: num(d.groupMin),
    groupMax: num(d.groupMax),
    departures: objects(d.departures).map((x, i) => ({
      id: id(x, i, "departure"),
      start: str(x.start),
      end: str(x.end),
      seatsTotal: num(x.seatsTotal),
      priceDelta: num(x.priceDelta),
      longWeekend: str(x.longWeekend),
    })),
    rooms: objects(d.rooms).map((r, i) => ({ id: id(r, i, "room"), label: str(r.label) ?? "Room", occupancy: num(r.occupancy), price: num(r.price), beds: str(r.beds) })),
    roomPolicy: str(d.roomPolicy),
    roomNote: str(d.roomNote),
    deposit: num(d.deposit),
    compareAt: num(d.compareAt),
    addOns: objects(d.addOns).map((a, i) => ({ id: id(a, i, "addon"), title: str(a.title) ?? "—", description: str(a.description), price: num(a.price), icon: str(a.icon) })),
    inclusions: strings(d.inclusions),
    exclusions: strings(d.exclusions),
    refund: str(d.refund),
    facts: objects(d.facts).map((f) => ({ icon: str(f.icon), title: str(f.title) ?? "—", text: str(f.text) })),
    faqs: objects(d.faqs).map((f) => ({ q: str(f.q) ?? "—", a: str(f.a) })).filter((f) => f.q !== "—" || f.a !== null),
    packing: Object.entries(packing)
      .map(([category, items]) => ({ category, items: strings(items) }))
      .filter((p) => p.items.length > 0)
      .sort((a, b) => a.category.localeCompare(b.category)),
    captainName: str(d.captainName),
    captainRole: str(d.captainRole),
    captainBio: str(d.captainBio),
    languages: strings(d.languages),
    certifications: strings(d.certifications),
  };
}

/** Labels for the draft's enums and ranges (the detail panel's "At a glance" block). */
export function draftFacts(draft: TripDraft): Array<{ label: string; value: string }> {
  return [
    { label: "Difficulty", value: label(DIFFICULTY_LABEL, draft.difficulty) },
    { label: "Group", value: groupRange(draft.groupMin, draft.groupMax) },
    { label: "Ages", value: ageRange(draft.ageMin, draft.ageMax) },
    { label: "Who can join", value: label(GENDER_LABEL, draft.gender) },
    { label: "Best season", value: draft.bestSeason ?? "—" },
    { label: "Altitude", value: draft.altitude ?? "—" },
    { label: "Start city", value: draft.startCity ?? "—" },
    { label: "Booking closes", value: draft.bookingCutoffDays === null ? "—" : draft.bookingCutoffDays === 0 ? "On departure day" : `${draft.bookingCutoffDays} day${draft.bookingCutoffDays === 1 ? "" : "s"} before departure` },
    { label: "Refund policy", value: label(REFUND_LABEL, draft.refund) },
  ];
}

export const roomPolicyLabel = (policy: string | null): string => label(ROOM_POLICY_LABEL, policy);

/** Seats across all departures (null when no departure states its seats). */
export function totalSeats(departures: TripDeparture[]): number | null {
  const seats = departures.map((d) => d.seatsTotal).filter((n): n is number => n !== null);
  return seats.length ? seats.reduce((a, b) => a + b, 0) : null;
}

/* --------------------------------------------------------------------- row */

export interface TripRow {
  id: string;
  orgId: string | null;
  organizerName: string | null;
  status: string | null;
  title: string;
  destination: string | null;
  style: string | null;
  durationDays: number | null;
  priceFrom: number | null;
  departuresCount: number;
  /** Set once approved; non-null on a resubmitted revision of a live trip. */
  tripId: string | null;
  reviewerNote: string | null;
  submittedAt: Date | null;
  submittedBy: string | null;
  decidedAt: Date | null;
  decidedBy: string | null;
  updatedAt: Date | null;
  createdAt: Date | null;
  version: number;
  draft: TripDraft;
}

export function toTripRow(docId: string, raw: Raw): TripRow {
  const draft = parseDraft(raw.draft);
  const departures = num(raw.departuresCount);
  return {
    id: docId,
    orgId: str(raw.orgId),
    organizerName: str(raw.organizerName),
    status: str(raw.status),
    title: str(raw.title) ?? draft.title ?? "Untitled trip",
    destination: str(raw.destination) ?? draft.destination,
    style: str(raw.style) ?? draft.style,
    durationDays: num(raw.durationDays) ?? (draft.days.length || null),
    priceFrom: num(raw.priceFrom),
    departuresCount: departures ?? draft.departures.length,
    tripId: str(raw.tripId),
    reviewerNote: str(raw.reviewerNote),
    submittedAt: toDate(raw.submittedAt),
    submittedBy: str(raw.submittedBy),
    decidedAt: toDate(raw.decidedAt),
    decidedBy: str(raw.decidedBy),
    updatedAt: toDate(raw.updatedAt),
    createdAt: toDate(raw.createdAt),
    version: Number.isSafeInteger(raw.version) && (raw.version as number) >= 0 ? (raw.version as number) : 0,
    draft,
  };
}

/** A resubmitted edit of a trip that is already live (tripId was set by an earlier approval). */
export const isRevision = (row: Pick<TripRow, "tripId">): boolean => row.tripId !== null;

/** "3 days", "1 day", "—". */
export const daysLabel = (n: number | null): string => (n === null ? "—" : `${n} day${n === 1 ? "" : "s"}`);

/** Row meta for the list: organizer · destination · style. */
export function tripMeta(row: TripRow): string {
  return [row.organizerName ? `by ${row.organizerName}` : null, row.destination, tripStyle(row.style).label].filter((p) => p && p !== "—").join(" · ") || "—";
}

/* ------------------------------------------------------------------- queue */

const waitingSince = (r: TripRow) => r.submittedAt ?? r.updatedAt;
const ascending = (d: Date | null) => d?.getTime() ?? Number.MAX_SAFE_INTEGER;
const descending = (d: Date | null) => -(d?.getTime() ?? Number.MIN_SAFE_INTEGER);

/**
 * The rows of one tab. Open work (in review, changes requested) is longest-waiting first by
 * submittedAt, undated last; history (live, rejected) is the most recently decided first.
 * Ties keep the trip id order so the list never shuffles between snapshots.
 */
export function tripQueue(rows: TripRow[], tab: TripTab): TripRow[] {
  const key = tab === "in-review" || tab === "changes-requested" ? (r: TripRow) => ascending(waitingSince(r)) : (r: TripRow) => descending(r.decidedAt ?? r.updatedAt);
  return rows.filter((r) => r.status === tab).sort((a, b) => key(a) - key(b) || a.id.localeCompare(b.id));
}

/** How long a submitted trip has waited ("3 h ago"); for decided rows, when it was decided. */
export function waitingLabel(row: TripRow, now: Date | null): string {
  if (!now) return "—";
  return relTime(row.status === "live" || row.status === "rejected" ? row.decidedAt ?? row.updatedAt : waitingSince(row), now);
}

/** Hours a submitted trip has waited (null when undated) — drives the "overdue" hint. */
export function waitingHours(row: TripRow, now: Date): number | null {
  const at = waitingSince(row);
  return at ? Math.max(0, (now.getTime() - at.getTime()) / 3_600_000) : null;
}

/** Trips waiting longer than this get a warning tone in the queue. */
export const TRIP_REVIEW_SLA_HOURS = 48;

/* ---------------------------------------------------------------- decision */

export const OUTCOME_COPY: Record<TripOutcome, { title: (t: string) => string; confirm: string; consequence: string; toast: string; reasonLabel: string }> = {
  approved: {
    title: (t) => `Approve ${t}?`,
    confirm: "Approve trip",
    consequence: "Publishes the trip in PULSE with these departures, prices and rooms. A revision replaces the live version.",
    toast: "Trip approved",
    reasonLabel: "Note",
  },
  "changes-requested": {
    title: () => "Request changes",
    confirm: "Send back",
    consequence: "Sends the trip back to the organizer with your note. They can edit and resubmit it.",
    toast: "Changes requested",
    reasonLabel: "What needs to change? (the organizer sees this)",
  },
  rejected: {
    title: (t) => `Reject ${t}?`,
    confirm: "Reject trip",
    consequence: "Rejects this submission. The organizer sees your reason. A live version, if any, stays live.",
    toast: "Trip rejected",
    reasonLabel: "Reason (the organizer sees this)",
  },
};

/** Minimum note length per outcome (reviewTrip: required, 10+ characters, unless approved). */
export const noteMin = (outcome: TripOutcome): number => (outcome === "approved" ? 0 : TRIP_NOTE_MIN);

/** The client-side check the server repeats: a message when the decision can't be sent, else null. */
export function validateTripDecision(row: Pick<TripRow, "status" | "version">, outcome: TripOutcome, note: string): string | null {
  if (row.status !== "in-review") return "Only trips in review can be decided. Refresh to see the latest status.";
  const clean = note.trim();
  if (outcome !== "approved" && clean.length < TRIP_NOTE_MIN) return `Add a note of at least ${TRIP_NOTE_MIN} characters for the organizer.`;
  if (clean.length > TRIP_NOTE_MAX) return `The note must be at most ${TRIP_NOTE_MAX} characters.`;
  return null;
}

/**
 * reviewTrip RequestIdBook key: the trip, the outcome and the version/status it was decided
 * against (as caseDecisionKey does for decideCase). An identical retry replays; a decision
 * after the draft moved (resubmitted, decided elsewhere) gets a new id and a CONFLICT.
 */
export function tripDecisionKey(row: Pick<TripRow, "id" | "version" | "status">, outcome: TripOutcome): string {
  return decisionKey("trip", row.id, outcome, row.version, row.status ?? "");
}

/** The success toast body for a reviewTrip result. */
export function tripOutcomeMessage(outcome: TripOutcome, result: { status: string; tripId: string | null; replayed?: boolean }, revision: boolean): string {
  const replay = result.replayed ? " (already applied — this was a safe retry)" : "";
  if (outcome === "approved") return `${revision ? "The live trip now shows this revision." : "The trip is live in PULSE."}${result.tripId ? ` Trip ${result.tripId}.` : ""}${replay}`;
  if (outcome === "changes-requested") return `The organizer can edit and resubmit.${replay}`;
  return `The organizer has been told why.${replay}`;
}
