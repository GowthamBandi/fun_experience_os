import { db } from "../platform/firestore";

/** Trip collections (docs/FIRESTORE_DATA_MODEL.md → Trips). */
export const T = {
  /** The organizer's builder state and review status, keyed by the app's hostTripId. */
  tripDrafts: "tripDrafts",
  /** Approved, customer-facing trips. Public to signed-in people. */
  trips: "trips",
  /** One dated batch of a trip with its seat and bed counters. Public. */
  tripDepartures: "tripDepartures",
  /** A customer's booking, including traveller details. Owner + admins only. */
  tripBookings: "tripBookings",
  tripPayments: "tripPayments",
  tripRefunds: "tripRefunds",
  /** Organizer messages to a departure. */
  tripUpdates: "tripUpdates",
  /** `{departureId}__{uid}`: who may read a departure's updates. */
  tripTravellers: "tripTravellers",
} as const;

export const draftRef = (id: string) => db().collection(T.tripDrafts).doc(id);
export const tripRef = (id: string) => db().collection(T.trips).doc(id);
export const departureRef = (id: string) => db().collection(T.tripDepartures).doc(id);
export const tripBookingRef = (id: string) => db().collection(T.tripBookings).doc(id);
export const tripPaymentRef = (id: string) => db().collection(T.tripPayments).doc(id);
export const tripRefundRef = (id: string) => db().collection(T.tripRefunds).doc(id);
export const travellerRef = (departureId: string, uid: string) => db().collection(T.tripTravellers).doc(`${departureId}__${uid}`);

/** Published trip id for a host trip: stable across revisions. */
export const tripIdFor = (hostTripId: string) => `t-${hostTripId}`.slice(0, 128);
