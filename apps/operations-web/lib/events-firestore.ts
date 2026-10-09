"use client";

import { collection, getCountFromServer, orderBy, query, where, type Query } from "firebase/firestore";
import { getFirebaseClient } from "./firebase/client";
import { DRAFT_STATUSES, OPEN_STATUSES } from "./events";

// Query builders for the Events table and Event 360. Kept in lib/ so
// firebase/scripts/check-indexes.mjs sees them (entries M22–M31).
const col = (name: string) => collection(getFirebaseClient().firestore, name);

/** On sale or running, soonest first (the existing events status + startsAt index). Feeds Upcoming, Live and stale Past rows. */
export const openEventsQuery = (): Query => query(col("events"), where("status", "in", [...OPEN_STATUSES]), orderBy("startsAt", "asc"));

/** Completed, drafts & review, or cancelled: newest first. */
export const eventsByStatusQuery = (statuses: readonly string[]): Query =>
  query(col("events"), where("status", "in", [...statuses]), orderBy("startsAt", "desc"));

/** Every event scheduled from one experience (⌘K experience hits land on /events?experience=). */
export const experienceEventsQuery = (experienceId: string): Query => query(col("events"), where("experienceId", "==", experienceId), orderBy("startsAt", "desc"));

/** Count aggregations for the tabs that load on demand. */
export async function countEventTabs(): Promise<{ completed: number; drafts: number; cancelled: number }> {
  const n = async (statuses: readonly string[]) => (await getCountFromServer(query(col("events"), where("status", "in", [...statuses])))).data().count;
  const [completed, drafts, cancelled] = await Promise.all([n(["completed"]), n(DRAFT_STATUSES), n(["cancelled"])]);
  return { completed, drafts, cancelled };
}

export const eventBookingsQuery = (eventId: string): Query => query(col("bookings"), where("eventId", "==", eventId), orderBy("createdAt", "desc"));

/** Published and hidden reviews, newest first (the existing reviews eventId + status + updatedAt index). */
export const eventReviewsQuery = (eventId: string): Query =>
  query(col("reviews"), where("eventId", "==", eventId), where("status", "in", ["published", "hidden"]), orderBy("updatedAt", "desc"));

/** The audit trail of the event record (saved, submitted, published, phases, cancellation, governance). */
export const eventAuditQuery = (eventId: string): Query => query(col("auditEvents"), where("resourceId", "==", eventId), orderBy("at", "desc"));

/** Check-in: tickets with status "used" against admissible ones (valid or used); voided tickets are left out. */
export async function countEventTickets(eventId: string): Promise<{ checkedIn: number; admissible: number }> {
  const n = async (statuses: string[]) =>
    (await getCountFromServer(query(col("tickets"), where("eventId", "==", eventId), where("status", "in", statuses)))).data().count;
  const [checkedIn, admissible] = await Promise.all([n(["used"]), n(["valid", "used"])]);
  return { checkedIn, admissible };
}
