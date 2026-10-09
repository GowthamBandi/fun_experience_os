"use client";

import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, type Query } from "firebase/firestore";
import { getFirebaseClient } from "./firebase/client";
import { str } from "./events";
import { toCustomer, type CustomerLookup, type CustomerRow } from "./customers";

// Query builders for Customers search and Customer 360. Kept in lib/ so
// firebase/scripts/check-indexes.mjs sees them (entries M31–M38).
const col = (name: string) => collection(getFirebaseClient().firestore, name);
const db = () => getFirebaseClient().firestore;

/** Newest users first; operators are filtered out client-side (customers carry no scope field). */
export const newestUsersQuery = (): Query => query(col("users"), orderBy("createdAt", "desc"));

export const customerBookingsQuery = (uid: string): Query => query(col("bookings"), where("customerUid", "==", uid), orderBy("createdAt", "desc"));

export const customerPaymentsQuery = (uid: string): Query => query(col("payments"), where("customerUid", "==", uid), orderBy("createdAt", "desc"));

export const customerRefundsQuery = (uid: string): Query => query(col("refunds"), where("customerUid", "==", uid), orderBy("createdAt", "desc"));

/** Published and hidden reviews the customer wrote, newest first. */
export const customerReviewsQuery = (uid: string): Query => query(col("reviews"), where("authorUid", "==", uid), orderBy("updatedAt", "desc"));

/** Holds are keyed user_{uid}; a query keeps any future subject type that names the same uid. */
export const customerLegalHoldsQuery = (uid: string): Query => query(col("legalHolds"), where("subjectId", "==", uid));

/** The customers a phone, ID or booking reference points at (each read capped at 5 documents). */
export async function lookupCustomers(lookup: CustomerLookup): Promise<CustomerRow[]> {
  if (lookup.kind === "phone") {
    const snap = await getDocs(query(col("users"), where("phone", "==", lookup.value), limit(5)));
    return snap.docs.map((d) => toCustomer(d.id, d.data()));
  }
  if (lookup.kind === "id") {
    const snap = await getDoc(doc(db(), "users", lookup.value));
    return snap.exists() ? [toCustomer(snap.id, snap.data())] : [];
  }
  if (lookup.kind === "reference") {
    const bookings = await getDocs(query(col("bookings"), where("reference", "==", lookup.value), limit(5)));
    const uids = [...new Set(bookings.docs.map((d) => str(d.data().customerUid)).filter((u): u is string => !!u))];
    const users = await Promise.all(uids.map((uid) => getDoc(doc(db(), "users", uid))));
    return users.filter((u) => u.exists()).map((u) => toCustomer(u.id, u.data()!));
  }
  return [];
}

/** publicProfiles.displayName per uid (null when missing). */
export async function fetchDisplayNames(uids: string[]): Promise<Record<string, string | null>> {
  const snaps = await Promise.all(uids.map((uid) => getDoc(doc(db(), "publicProfiles", uid))));
  return Object.fromEntries(snaps.map((s, i) => [uids[i], str(s.data()?.displayName)]));
}

/** events.title per id (null when missing). */
export async function fetchEventTitles(ids: string[]): Promise<Record<string, string | null>> {
  const snaps = await Promise.all(ids.map((id) => getDoc(doc(db(), "events", id))));
  return Object.fromEntries(snaps.map((s, i) => [ids[i], str(s.data()?.title)]));
}

/** customerSafety/{uid}: owner-only under firestore.rules today, so this normally rejects with permission-denied. */
export async function readCustomerSafety(uid: string): Promise<Record<string, unknown> | null> {
  const snap = await getDoc(doc(db(), "customerSafety", uid));
  return snap.exists() ? snap.data() : null;
}
