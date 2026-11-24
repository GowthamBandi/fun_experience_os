/**
 * Multi-day group trips: wire model, validation and pricing.
 *
 * A trip is built by an organizer as a DRAFT (`tripDrafts/{hostTripId}`),
 * reviewed by PULSE operations (`reviewTrip`) and, once approved, published as
 * `trips/{tripId}` with one `tripDepartures/{departureId}` per dated batch.
 *
 * The draft map mirrors PULSE's `TripDraft` (lib/src/data/models/trip_draft.dart)
 * field for field; enums travel as their Dart names. Money in trip content is
 * WHOLE RUPEES (as the organizer types it); payments convert to paise.
 *
 * `quoteTrip` and `refundPercent` are ports of PULSE's `TripQuote.of` and
 * `Trip.refundPercent`: the checkout and the server must always agree.
 */

import { DomainError, invalidInput } from "../platform/errors";
import { assertWellFormed, obj } from "../platform/callable";

export type Json = Record<string, unknown>;

export const TRIP_STYLES = ["weekend", "trek", "roadTrip", "beach", "heritage", "international"] as const;
export const TRIP_REGIONS = ["south", "himalayas", "northeast", "abroad"] as const;
export const DIFFICULTIES = ["easy", "light", "moderate", "challenging", "demanding"] as const;
export const GENDER_FORMATS = ["open", "mixed", "womenOnly", "menOnly"] as const;
export const STAY_TYPES = ["hostel", "homestay", "camp", "resort", "hotel"] as const;
export const MEALS = ["breakfast", "lunch", "snacks", "dinner"] as const;
export const DIETS = ["veg", "nonVeg", "egg", "jain", "vegan"] as const;
export const VEHICLE_TYPES = ["tempoTraveller", "miniBus", "coach", "sleeper", "suv", "jeep", "train", "flight", "boat", "bike"] as const;
export const GOODIE_MOMENTS = ["welcome", "during", "farewell"] as const;
export const ROOM_POLICIES = ["guaranteed", "bestEffort"] as const;
export const REFUND_PRESETS = ["flexible", "standard", "strict"] as const;
export const TRAVELLER_GENDERS = ["woman", "man", "nonBinary"] as const;

export type RefundPreset = (typeof REFUND_PRESETS)[number];

/** Same tiers as PULSE `TripRefundPreset`: [daysBefore, percent]. */
export const REFUND_TIERS: Record<RefundPreset, Array<[number, number]>> = {
  flexible: [[15, 100], [7, 50]],
  standard: [[30, 90], [15, 50], [7, 25]],
  strict: [[45, 80], [21, 40]],
};

/** The balance is due this many days before departure; later bookings pay in full. */
export const BALANCE_DUE_DAYS = 15;
/** Departures must start at least this far out when a trip is submitted. */
export const MIN_LEAD_DAYS = 7;
export const MAX_TRAVELLERS_PER_BOOKING = 6;
export const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ types */

export interface RoomOption { id: string; label: string; occupancy: number; price: number; beds: number | null }
export interface AddOn { id: string; title: string; description: string; price: number; icon: string }
/** A pickup / drop point. `lat`/`lng`: the exact spot the organizer pinned (optional). */
export interface Point { id: string; name: string; landmark: string; time: string; lat?: number; lng?: number }
export interface DraftDeparture { id: string; start: string; end: string; seatsTotal: number; priceDelta: number; longWeekend: string | null }

export interface TripDraftWire {
  title: string;
  tagline: string;
  destination: string;
  region: string;
  style: string;
  startCity: string;
  route: string[];
  highlights: string[];
  days: Json[];
  stays: Json[];
  vehicles: Json[];
  transport: string;
  diets: string[];
  foodNote: string;
  drops: Point[];
  pickups: Point[];
  reportingNote: string;
  returnNote: string;
  goodies: Json[];
  rules: string[];
  luggageNote: string;
  bookingCutoffDays: number;
  bestSeason: string;
  altitude: string;
  difficulty: string;
  gender: string;
  ageMin: number;
  ageMax: number | null;
  groupMin: number;
  groupMax: number;
  departures: DraftDeparture[];
  departureHour: number;
  departureMinute: number;
  rooms: RoomOption[];
  roomPolicy: string;
  roomNote: string;
  deposit: number;
  compareAt: number | null;
  addOns: AddOn[];
  inclusions: string[];
  exclusions: string[];
  refund: RefundPreset;
  facts: Json[];
  faqs: Json[];
  packing: Record<string, string[]>;
  captainName: string;
  captainRole: string;
  captainBio: string;
  languages: string[];
  certifications: string[];
  seed: number;
}

/* ------------------------------------------------------------- validators */

// Saving a draft is lenient about completeness (autosave runs on every edit)
// but strict about shape and size: anything stored is well-formed and bounded.

function text(v: unknown, name: string, max: number): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw invalidInput(`${name} must be text.`);
  assertWellFormed(v, name);
  if (v.length > max) throw invalidInput(`${name} is too long (at most ${max} characters).`);
  return v;
}

function texts(v: unknown, name: string, maxItems: number, maxLen: number): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw invalidInput(`${name} must be a list.`);
  if (v.length > maxItems) throw invalidInput(`${name} can have at most ${maxItems} items.`);
  return v.map((x, i) => text(x, `${name} #${i + 1}`, maxLen));
}

function whole(v: unknown, name: string, min: number, max: number, fallback?: number): number {
  if ((v === undefined || v === null) && fallback !== undefined) return fallback;
  if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max) {
    throw invalidInput(`${name} must be a whole number between ${min} and ${max}.`);
  }
  return v;
}

function optWhole(v: unknown, name: string, min: number, max: number): number | null {
  if (v === undefined || v === null) return null;
  return whole(v, name, min, max);
}

function pick<T extends string>(v: unknown, name: string, options: readonly T[], fallback?: T): T {
  if ((v === undefined || v === null) && fallback !== undefined) return fallback;
  if (!options.includes(v as T)) throw invalidInput(`${name} is not supported.`);
  return v as T;
}

function flag(v: unknown, fallback: boolean): boolean {
  if (v === undefined || v === null) return fallback;
  if (typeof v !== "boolean") throw invalidInput("A yes/no field is invalid.");
  return v;
}

function list<T>(v: unknown, name: string, maxItems: number, each: (x: Json, i: number) => T): T[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw invalidInput(`${name} must be a list.`);
  if (v.length > maxItems) throw invalidInput(`${name} can have at most ${maxItems} items.`);
  return v.map((x, i) => {
    if (!x || typeof x !== "object" || Array.isArray(x)) throw invalidInput(`${name} #${i + 1} is invalid.`);
    return each(x as Json, i);
  });
}

const LOCAL_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,159}$/;
function localId(v: unknown, name: string): string {
  if (typeof v !== "string" || !LOCAL_ID.test(v)) throw invalidInput(`${name} has an invalid id.`);
  return v;
}

function instant(v: unknown, name: string): string {
  if (typeof v !== "string" || v.length > 40 || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/.test(v)) {
    throw invalidInput(`${name} must be a date-time with a time zone.`);
  }
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) throw invalidInput(`${name} is not a valid date.`);
  return new Date(ms).toISOString();
}

function coordinate(v: unknown, name: string, limit: number): number | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > limit) {
    throw invalidInput(`${name} must be a number between -${limit} and ${limit}.`);
  }
  return v;
}

function point(x: Json, i: number, what: string): Point {
  const p: Point = {
    id: localId(x.id, `${what} #${i + 1}`),
    name: text(x.name, `${what} name`, 80),
    landmark: text(x.landmark, `${what} landmark`, 160),
    time: text(x.time, `${what} time`, 40),
  };
  const lat = coordinate(x.lat, `${what} #${i + 1} latitude`, 90);
  const lng = coordinate(x.lng, `${what} #${i + 1} longitude`, 180);
  if ((lat === undefined) !== (lng === undefined)) {
    throw invalidInput(`${what} #${i + 1}: give both latitude and longitude, or neither.`);
  }
  if (lat !== undefined && lng !== undefined) {
    p.lat = lat;
    p.lng = lng;
  }
  return p;
}

/** Parses and bounds a draft map. Throws INVALID_INPUT on any malformed field. */
export function parseTripDraft(value: unknown): TripDraftWire {
  const d = obj(value);
  const ageMin = whole(d.ageMin, "Minimum age", 0, 99, 18);
  const packingRaw = d.packing === undefined || d.packing === null ? {} : obj(d.packing);
  const packingKeys = Object.keys(packingRaw);
  if (packingKeys.length > 12) throw invalidInput("Packing can have at most 12 categories.");
  const packing: Record<string, string[]> = {};
  for (const k of packingKeys) {
    const key = text(k, "Packing category", 40).trim();
    if (!key || key.includes(".") || key.includes("/")) throw invalidInput("A packing category name is invalid.");
    packing[key] = texts(packingRaw[k], `Packing (${key})`, 40, 120);
  }
  return {
    title: text(d.title, "Title", 60),
    tagline: text(d.tagline, "Tagline", 110),
    destination: text(d.destination, "Destination", 60),
    region: pick(d.region, "Region", TRIP_REGIONS, "south"),
    style: pick(d.style, "Trip style", TRIP_STYLES, "weekend"),
    startCity: text(d.startCity, "Starting city", 40),
    route: texts(d.route, "Route", 20, 60),
    highlights: texts(d.highlights, "Highlights", 12, 140),
    days: list(d.days, "Itinerary", 30, (x, i) => ({
      title: text(x.title, `Day ${i + 1} title`, 80),
      summary: text(x.summary, `Day ${i + 1} summary`, 600),
      activities: list(x.activities, `Day ${i + 1} activities`, 30, (a) => ({
        time: text(a.time, "Activity time", 30),
        title: text(a.title, "Activity", 120),
        detail: text(a.detail, "Activity detail", 400),
        icon: text(a.icon, "Activity icon", 60),
      })),
      meals: texts(x.meals, `Day ${i + 1} meals`, 4, 20).map((m) => pick(m, "Meal", MEALS)),
      mealPlan: list(x.mealPlan, `Day ${i + 1} meals`, 6, (m) => ({
        meal: pick(m.meal, "Meal", MEALS),
        time: text(m.time, "Meal time", 30),
        place: text(m.place, "Meal place", 120),
        menu: text(m.menu, "Menu", 400),
        diets: texts(m.diets, "Meal diets", 5, 20).map((v) => pick(v, "Diet", DIETS)),
      })),
      stay: text(x.stay, `Day ${i + 1} stay`, 120),
      travel: text(x.travel, `Day ${i + 1} travel`, 120),
      overnightTransit: flag(x.overnightTransit, false),
    })),
    stays: list(d.stays, "Stays", 20, (x) => ({
      name: text(x.name, "Stay name", 80),
      type: pick(x.type, "Stay type", STAY_TYPES, "homestay"),
      location: text(x.location, "Stay location", 80),
      nights: whole(x.nights, "Nights", 0, 30, 1),
      note: text(x.note, "Stay note", 300),
    })),
    vehicles: list(d.vehicles, "Vehicles", 10, (x) => ({
      type: pick(x.type, "Vehicle type", VEHICLE_TYPES),
      leg: text(x.leg, "Vehicle leg", 120),
      model: text(x.model, "Vehicle model", 80),
      seats: whole(x.seats, "Vehicle seats", 0, 200, 0),
      ac: flag(x.ac, true),
      features: texts(x.features, "Vehicle features", 12, 60),
    })),
    transport: text(d.transport, "Transport", 80),
    diets: texts(d.diets, "Diets", 5, 20).map((v) => pick(v, "Diet", DIETS)),
    foodNote: text(d.foodNote, "Food note", 400),
    drops: list(d.drops, "Drop points", 10, (x, i) => point(x, i, "Drop point")),
    pickups: list(d.pickups, "Pickup points", 10, (x, i) => point(x, i, "Pickup point")),
    reportingNote: text(d.reportingNote, "Reporting note", 300),
    returnNote: text(d.returnNote, "Return note", 300),
    goodies: list(d.goodies, "Goodies", 12, (x) => ({
      title: text(x.title, "Goodie", 80),
      moment: pick(x.moment, "Goodie moment", GOODIE_MOMENTS, "welcome"),
      detail: text(x.detail, "Goodie detail", 200),
    })),
    rules: texts(d.rules, "Rules", 20, 200),
    luggageNote: text(d.luggageNote, "Luggage note", 300),
    bookingCutoffDays: whole(d.bookingCutoffDays, "Booking cut-off", 0, 30, 2),
    bestSeason: text(d.bestSeason, "Best season", 60),
    altitude: text(d.altitude, "Altitude", 30),
    difficulty: pick(d.difficulty, "Difficulty", DIFFICULTIES, "light"),
    gender: pick(d.gender, "Who can join", GENDER_FORMATS, "open"),
    ageMin,
    ageMax: optWhole(d.ageMax, "Maximum age", 0, 120),
    groupMin: whole(d.groupMin, "Minimum group", 1, 100, 8),
    groupMax: whole(d.groupMax, "Maximum group", 1, 100, 20),
    departures: list(d.departures, "Departures", 60, (x, i) => ({
      id: localId(x.id, `Departure #${i + 1}`),
      start: instant(x.start, `Departure #${i + 1} start`),
      end: instant(x.end, `Departure #${i + 1} end`),
      seatsTotal: whole(x.seatsTotal, "Seats", 1, 100),
      priceDelta: whole(x.priceDelta, "Price change", -1_000_000, 1_000_000, 0),
      longWeekend: text(x.longWeekend, "Long weekend", 40) || null,
    })),
    departureHour: whole(d.departureHour, "Departure hour", 0, 23, 21),
    departureMinute: whole(d.departureMinute, "Departure minute", 0, 59, 0),
    rooms: list(d.rooms, "Room options", 8, (x, i) => ({
      id: localId(x.id, `Room option #${i + 1}`),
      label: text(x.label, "Room label", 40),
      occupancy: whole(x.occupancy, "Sharing", 1, 12),
      price: whole(x.price, "Room price", 0, 10_000_000),
      beds: optWhole(x.beds, "Beds", 0, 200),
    })),
    roomPolicy: pick(d.roomPolicy, "Room policy", ROOM_POLICIES, "guaranteed"),
    roomNote: text(d.roomNote, "Room note", 300),
    deposit: whole(d.deposit, "Booking amount", 0, 10_000_000, 0),
    compareAt: optWhole(d.compareAt, "Original price", 0, 10_000_000),
    addOns: list(d.addOns, "Add-ons", 12, (x, i) => ({
      id: localId(x.id, `Add-on #${i + 1}`),
      title: text(x.title, "Add-on", 80),
      description: text(x.description, "Add-on description", 300),
      price: whole(x.price, "Add-on price", 0, 10_000_000),
      icon: text(x.icon, "Add-on icon", 60),
    })),
    inclusions: texts(d.inclusions, "Inclusions", 30, 160),
    exclusions: texts(d.exclusions, "Exclusions", 30, 160),
    refund: pick(d.refund, "Refund policy", REFUND_PRESETS, "standard"),
    facts: list(d.facts, "Good to know", 12, (x) => ({
      icon: text(x.icon, "Icon", 60),
      title: text(x.title, "Title", 60),
      text: text(x.text, "Text", 400),
    })),
    faqs: list(d.faqs, "FAQs", 20, (x) => ({ q: text(x.q, "Question", 200), a: text(x.a, "Answer", 800) })),
    packing,
    captainName: text(d.captainName, "Captain name", 40),
    captainRole: text(d.captainRole, "Captain role", 40),
    captainBio: text(d.captainBio, "Captain bio", 400),
    languages: texts(d.languages, "Languages", 10, 30),
    certifications: texts(d.certifications, "Certifications", 10, 80),
    seed: whole(d.seed, "Seed", 0, 1_000_000_000, 0),
  };
}

/**
 * Completeness check at submission (mirrors `TripDraft.errorsFor`). Returns
 * the first problem as business copy, or null when the draft can be reviewed.
 * [liveDepartureIds] are departures already published (a revision of a live
 * trip): they are exempt from the lead-time rule.
 */
export function firstIncomplete(d: TripDraftWire, nowMs: number, liveDepartureIds: ReadonlySet<string> = new Set()): string | null {
  const len = (v: string, min: number) => v.trim().length >= min;
  if (!len(d.title, 6)) return "Basics: add a title of at least 6 characters.";
  if (!len(d.destination, 3)) return "Basics: add the destination.";
  if (!len(d.startCity, 2)) return "Basics: add the starting city.";
  if (d.route.length < 2) return "Basics: add at least two stops.";
  if (d.highlights.length < 3) return "Basics: add at least three highlights.";
  if (d.days.length < 2) return "Itinerary: a trip has at least two days.";
  for (let i = 0; i < d.days.length; i++) {
    const day = d.days[i] as { title: string; activities: unknown[]; stay: string; overnightTransit: boolean; mealPlan: Array<{ time: string }> };
    if (!len(day.title, 3)) return `Itinerary: give day ${i + 1} a title.`;
    if (day.activities.length === 0) return `Itinerary: add at least one activity to day ${i + 1}.`;
    if (i < d.days.length - 1 && !day.overnightTransit && !day.stay.trim()) return `Itinerary: say where travellers sleep on day ${i + 1}.`;
    if (day.mealPlan.some((m) => !m.time.trim())) return `Food: add a time for every meal on day ${i + 1}.`;
  }
  const transit = d.days.slice(0, -1).filter((x) => (x as { overnightTransit: boolean }).overnightTransit).length;
  const needed = Math.max(0, d.days.length - 1) - transit;
  const stayNights = d.stays.reduce((s, x) => s + (x as { nights: number }).nights, 0);
  if (stayNights !== needed) return `Stays: stays cover ${stayNights} nights but the trip needs ${needed}.`;
  if (d.vehicles.length === 0) return "Stays & vehicles: add the vehicle travellers will ride in.";
  const hasMeals = d.days.some((x) => {
    const day = x as { meals: string[]; mealPlan: unknown[] };
    return day.meals.length > 0 || day.mealPlan.length > 0;
  });
  if (hasMeals && d.diets.length === 0) return "Food: say which diets the meals cater for.";
  if (d.pickups.length === 0) return "Pickup & drop: add at least one pickup point.";
  if (d.drops.length === 0) return "Pickup & drop: add where the trip ends.";
  if (d.groupMin < 2) return "Group: the minimum group is 2.";
  if (d.groupMax < d.groupMin) return "Group: the maximum can't be below the minimum.";
  if (d.groupMax > 60) return "Group: small groups only, 60 at most.";
  if (d.ageMin < 16) return "Group: overnight trips are 16+.";
  if (d.ageMax !== null && d.ageMax < d.ageMin + 2) return "Group: the upper age must be above the minimum.";
  if (d.departures.length === 0) return "Departures: add at least one departure date.";
  const earliest = nowMs + MIN_LEAD_DAYS * DAY_MS;
  const daysSeen = new Set<string>();
  for (const dep of d.departures) {
    // Departures already on sale (a revision of a live trip) keep their dates.
    if (!liveDepartureIds.has(dep.id) && Date.parse(dep.start) < earliest) return "Departures: departures must be at least 7 days out.";
    if (Date.parse(dep.end) <= Date.parse(dep.start)) return "Departures: a departure ends before it starts.";
    if (dep.seatsTotal < d.groupMin || dep.seatsTotal > d.groupMax) return `Departures: seats per departure must be between ${d.groupMin} and ${d.groupMax}.`;
    // Calendar day in India (trips are sold in IST).
    daysSeen.add(new Date(Date.parse(dep.start) + 330 * 60_000).toISOString().slice(0, 10));
  }
  if (daysSeen.size !== d.departures.length) return "Departures: two departures leave on the same day.";
  if (new Set(d.departures.map((x) => x.id)).size !== d.departures.length) return "Departures: two departures share an id.";
  if (d.rooms.length === 0) return "Pricing: add at least one room-sharing option.";
  if (d.rooms.some((r) => r.price < 500)) return "Pricing: prices start at ₹500 per person.";
  if (new Set(d.rooms.map((r) => r.id)).size !== d.rooms.length) return "Pricing: two room options share an id.";
  if (d.rooms.every((r) => r.beds !== null) && d.rooms.reduce((s, r) => s + (r.beds ?? 0), 0) < d.groupMax) {
    return `Pricing: beds across room types are fewer than the ${d.groupMax} seats.`;
  }
  if (d.rooms.some((r) => r.beds !== null && r.beds % r.occupancy !== 0)) return "Pricing: beds must fill whole rooms.";
  const from = Math.min(...d.rooms.map((r) => r.price));
  if (d.deposit > from) return "Pricing: the booking amount can't exceed the cheapest price.";
  if (d.compareAt !== null && d.compareAt <= from) return "Pricing: the original price must be higher than the price.";
  if (d.inclusions.length < 3) return "Inclusions: list at least three inclusions.";
  if (d.exclusions.length === 0) return "Inclusions: list at least one exclusion.";
  if (d.rules.length === 0) return "Policies: add at least one house rule.";
  if (d.facts.length === 0) return "Policies: add at least one “good to know”.";
  if (Object.values(d.packing).reduce((s, l) => s + l.length, 0) < 3) return "Packing: add at least three items.";
  if (!len(d.captainName, 3)) return "Captain: add the captain's name.";
  if (!len(d.captainBio, 40)) return "Captain: add a bio of at least 40 characters.";
  if (d.languages.length === 0) return "Captain: add at least one language.";
  return null;
}

export const priceFrom = (d: Pick<TripDraftWire, "rooms">): number | null =>
  d.rooms.length === 0 ? null : Math.min(...d.rooms.map((r) => r.price));

/** Trip content as published: the draft without its departures. */
export function tripContent(d: TripDraftWire): Json {
  const { departures: _drop, ...rest } = d;
  void _drop;
  return rest as unknown as Json;
}

/* ------------------------------------------------------------- pricing */

export interface TripQuote {
  perPerson: number;
  travellers: number;
  addOnsTotal: number;
  groupDiscount: number;
  gst: number;
  total: number;
  dueNow: number;
}

/** Port of PULSE `TripQuote.of` (whole rupees). */
export function quoteTrip(input: {
  room: RoomOption;
  priceDelta: number;
  travellers: number;
  addOns: AddOn[];
  addOnIds: string[];
  depositPerPerson: number;
  payInFull: boolean;
}): TripQuote {
  const perPerson = input.room.price + input.priceDelta;
  const base = perPerson * input.travellers;
  const chosen = new Set(input.addOnIds);
  const addOnsTotal = input.addOns.filter((a) => chosen.has(a.id)).reduce((s, a) => s + a.price * input.travellers, 0);
  const groupDiscount = input.travellers >= 4 ? Math.round(base * 0.05) : 0;
  const taxable = base + addOnsTotal - groupDiscount;
  const gst = Math.round(taxable * 0.05);
  const total = taxable + gst;
  const deposit = input.depositPerPerson * input.travellers;
  return {
    perPerson,
    travellers: input.travellers,
    addOnsTotal,
    groupDiscount,
    gst,
    total,
    dueNow: input.payInFull || deposit >= total ? total : deposit,
  };
}

export function depositPerPerson(d: Pick<TripDraftWire, "deposit" | "rooms">): number {
  const from = priceFrom(d) ?? 0;
  return Math.max(0, Math.min(d.deposit, from));
}

/** Port of PULSE `Trip.refundPercent`. */
export function refundPercent(preset: RefundPreset, daysBefore: number): number {
  const tiers = [...REFUND_TIERS[preset]].sort((a, b) => b[0] - a[0]);
  for (const [days, percent] of tiers) if (daysBefore >= days) return percent;
  return 0;
}

/** Whole days between now and [startMs], truncated like Dart's `Duration.inDays`. */
export const daysUntil = (startMs: number, nowMs: number): number => Math.trunc((startMs - nowMs) / DAY_MS);

/** Content stored on a published trip, parsed back for server-side checks. */
export function contentOf(trip: Json): TripDraftWire {
  const c = trip.content;
  if (!c || typeof c !== "object") throw new DomainError("INTERNAL", "This trip is missing its details.");
  return { ...(c as TripDraftWire), departures: [] };
}

/** Booking reference shown to travellers and organizers, e.g. "PLS-TR-48K2". */
export function tripReference(random: (n: number) => number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += chars[random(chars.length)];
  return `PLS-TR-${code}`;
}
