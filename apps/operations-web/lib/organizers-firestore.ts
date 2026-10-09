"use client";

import { collection, doc, getCountFromServer, getDoc, orderBy, query, where, type Query } from "firebase/firestore";
import { getFirebaseClient } from "./firebase/client";

// Query builders for the Organizers grid and Organizer 360. Kept in lib/ so
// firebase/scripts/check-indexes.mjs sees them (entries M11–M20).
const col = (name: string) => collection(getFirebaseClient().firestore, name);

export const publicOrganizersQuery = (): Query => query(col("publicOrganizers"));

export const orgEventsQuery = (orgId: string): Query => query(col("events"), where("orgId", "==", orgId), orderBy("startsAt", "desc"));

export const orgExperiencesQuery = (orgId: string): Query => query(col("experiences"), where("orgId", "==", orgId), orderBy("updatedAt", "desc"));

/** Published reviews, newest first (the existing reviews orgId + status + updatedAt index). */
export const orgReviewsQuery = (orgId: string): Query =>
  query(col("reviews"), where("orgId", "==", orgId), where("status", "==", "published"), orderBy("updatedAt", "desc"));

export const orgAgreementsQuery = (orgId: string): Query => query(col("commercialAgreements"), where("orgId", "==", orgId), orderBy("createdAt", "desc"));

export const orgCommercialsQuery = (orgId: string): Query => query(col("eventCommercials"), where("orgId", "==", orgId), orderBy("publishedAt", "desc"));

export const orgSettlementsQuery = (orgId: string): Query => query(col("settlements"), where("orgId", "==", orgId), orderBy("createdAt", "desc"));

export const orgMembershipsQuery = (orgId: string): Query => query(col("memberships"), where("orgId", "==", orgId));

/** Audit events that carry the org (bookings, payments, catalog, codes…). */
export const orgAuditQuery = (orgId: string): Query => query(col("auditEvents"), where("orgId", "==", orgId), orderBy("at", "desc"));

/** Audit events on the organizer record itself (governance status changes carry no orgId). */
export const orgResourceAuditQuery = (orgId: string): Query => query(col("auditEvents"), where("resourceId", "==", orgId), orderBy("at", "desc"));

/** Count aggregation: every event the org has, any status. */
export async function countOrgEvents(orgId: string): Promise<number> {
  const snap = await getCountFromServer(query(col("events"), where("orgId", "==", orgId)));
  return snap.data().count;
}

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * Team display: publicProfiles.displayName, and users.phone falling back to the
 * owner's organizerApplications/{uid}.phone (admins may read all three). Missing fields map to null.
 */
export async function fetchMemberPeople(uids: string[]): Promise<Record<string, { name: string | null; phone: string | null }>> {
  const db = getFirebaseClient().firestore;
  const rows = await Promise.all(
    uids.map((uid) => Promise.all([getDoc(doc(db, "publicProfiles", uid)), getDoc(doc(db, "users", uid)), getDoc(doc(db, "organizerApplications", uid))])),
  );
  return Object.fromEntries(
    rows.map(([profile, user, application], i) => [uids[i], { name: text(profile.data()?.displayName), phone: text(user.data()?.phone) ?? text(application.data()?.phone) }]),
  );
}

/** publicOrganizers.name per orgId, one read per distinct id (null when missing). */
export async function fetchOrganizerNames(ids: string[]): Promise<Record<string, string | null>> {
  const snaps = await Promise.all(ids.map((id) => getDoc(doc(getFirebaseClient().firestore, "publicOrganizers", id))));
  return Object.fromEntries(snaps.map((s, i) => {
    const name = s.data()?.name;
    return [ids[i], typeof name === "string" && name.trim() ? name.trim() : null];
  }));
}
