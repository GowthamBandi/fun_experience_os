/**
 * getOrganizerHistory: what an organizer has already run, for the public
 * organizer profile. Past events (that actually ran) and past trip
 * departures (that had travellers), newest first, each with its published
 * rating and up to three newest reviews from the `publicReviews` projection
 * (alias, rating, comment, date: never an account id).
 *
 * Reads (no new composite index): events by orgId with startsAt <= now,
 * newest first (index orgId ASC, startsAt DESC); tripDepartures by orgId
 * (single field, filtered in memory); publicReviews by orgId newest first
 * (index orgId ASC, createdAt DESC).
 */

import { callable, docId, obj } from "../platform/callable";
import { requireUser } from "../platform/actors";
import { consumeRateLimit } from "../platform/rateLimit";
import { COLLECTIONS, Timestamp, db } from "../platform/firestore";
import { T } from "../trips/refs";
import type { Json } from "./common";

export const HISTORY_MAX_ITEMS = 30;
export const HISTORY_REVIEWS_PER_ITEM = 3;
const HISTORY_REVIEW_SCAN = 500;
const HISTORY_EVENT_SCAN = 200;
const HISTORY_DEPARTURE_SCAN = 500;
/** An event that actually ran (not cancelled, draft, in review or rejected). */
const RAN = new Set(["published", "booking-closed", "live", "completed"]);

export interface HistoryReview { authorName: string; rating: number; comment: string; createdAt: string | null }
export interface HistoryItem {
  kind: "event" | "trip";
  id: string;
  experienceId: string | null;
  tripId: string | null;
  title: string;
  category: string | null;
  place: string;
  startsAt: string | null;
  endsAt: string | null;
  ratingCount: number;
  ratingAverage: number | null;
  reviews: HistoryReview[];
}

const ms = (t: unknown) => (t instanceof Timestamp ? t.toMillis() : null);
const isoOf = (t: unknown) => (t instanceof Timestamp ? t.toDate().toISOString() : null);
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const round1 = (x: number) => Math.round(x * 10) / 10;

export async function getOrganizerHistoryQuery(data: unknown) {
  const d = obj(data);
  const orgId = docId(d.orgId, "orgId");
  const now = Date.now();

  const [org, events, departures, reviews] = await Promise.all([
    db().collection("publicOrganizers").doc(orgId).get(),
    db().collection(COLLECTIONS.events)
      .where("orgId", "==", orgId)
      .where("startsAt", "<=", Timestamp.fromMillis(now))
      .orderBy("startsAt", "desc")
      .limit(HISTORY_EVENT_SCAN)
      .get(),
    db().collection(T.tripDepartures).where("orgId", "==", orgId).limit(HISTORY_DEPARTURE_SCAN).get(),
    db().collection("publicReviews").where("orgId", "==", orgId).orderBy("createdAt", "desc").limit(HISTORY_REVIEW_SCAN).get(),
  ]);

  // Published reviews grouped by event / departure (already newest first).
  const byItem = new Map<string, { count: number; sum: number; latest: HistoryReview[] }>();
  for (const s of reviews.docs) {
    const r = s.data();
    const key = r.kind === "trip" ? `trip:${r.departureId}` : `event:${r.eventId}`;
    const rating = typeof r.rating === "number" ? r.rating : null;
    if (rating === null) continue;
    const g = byItem.get(key) ?? { count: 0, sum: 0, latest: [] };
    g.count++;
    g.sum += rating;
    if (g.latest.length < HISTORY_REVIEWS_PER_ITEM) {
      g.latest.push({ authorName: text(r.authorName) || "PULSE member", rating, comment: text(r.comment), createdAt: isoOf(r.createdAt) });
    }
    byItem.set(key, g);
  }
  const rated = (key: string) => {
    const g = byItem.get(key);
    return { ratingCount: g?.count ?? 0, ratingAverage: g && g.count > 0 ? round1(g.sum / g.count) : null, reviews: g?.latest ?? [] };
  };

  const items: Array<HistoryItem & { sortMs: number }> = [];
  for (const s of events.docs) {
    const e = s.data();
    const end = ms(e.endsAt);
    if (end === null || end >= now || !RAN.has(String(e.status))) continue;
    const venue = (e.venue ?? {}) as Json;
    const place = text(e.location) || [text(venue.area), text(venue.city)].filter(Boolean).join(", ");
    items.push({
      kind: "event", id: s.id, experienceId: (e.experienceId as string | undefined) ?? null, tripId: null,
      title: text(e.title) || text(e.name), category: (e.category as string | undefined) ?? null, place,
      startsAt: isoOf(e.startsAt), endsAt: isoOf(e.endsAt), ...rated(`event:${s.id}`), sortMs: end,
    });
  }

  const pastDeps = departures.docs.filter((s) => {
    const x = s.data();
    const end = ms(x.end);
    return end !== null && end < now && x.cancelled !== true && ((x.seatsTaken as number) ?? 0) > 0;
  });
  const tripIds = [...new Set(pastDeps.map((s) => String(s.data().tripId)))];
  const tripSnaps = tripIds.length ? await db().getAll(...tripIds.map((id) => db().collection(T.trips).doc(id))) : [];
  const tripsById = new Map(tripSnaps.filter((t) => t.exists).map((t) => [t.id, t.data()!]));
  for (const s of pastDeps) {
    const x = s.data();
    const tripId = String(x.tripId);
    const t = tripsById.get(tripId);
    const content = (t?.content ?? {}) as Json;
    items.push({
      kind: "trip", id: s.id, experienceId: null, tripId,
      title: text(t?.title), category: null, place: text(content.startCity) || text(t?.destination),
      startsAt: isoOf(x.start), endsAt: isoOf(x.end), ...rated(`trip:${s.id}`), sortMs: ms(x.end)!,
    });
  }

  items.sort((a, b) => b.sortMs - a.sortMs || a.id.localeCompare(b.id));
  const o = org.data() ?? {};
  return {
    orgId,
    items: items.slice(0, HISTORY_MAX_ITEMS).map(({ sortMs: _s, ...rest }) => rest),
    ratingCount: typeof o.ratingCount === "number" ? o.ratingCount : 0,
    ratingAverage: typeof o.ratingAverage === "number" ? o.ratingAverage : null,
  };
}

/** Any signed-in person (customers, organizers, console admins). */
export const getOrganizerHistory = callable(async (data, context) => {
  const uid = requireUser(context).uid;
  const d = obj(data);
  docId(d.orgId, "orgId"); // validate before spending the rate limit
  await consumeRateLimit({ bucket: `orghistory_${uid}`, limit: 120, windowSeconds: 10 * 60, message: "Too many requests. Please wait a minute." });
  return getOrganizerHistoryQuery(data);
});
