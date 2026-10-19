/**
 * Trip waitlist: a person asks to hear when a sold-out departure has a seat
 * again. One document per person and departure
 * (`tripWaitlist/{departureId}__{uid}`), written only here; the owner reads
 * their own to show "On waitlist".
 *
 * The alert is one-shot and first-come: when a departure goes from not
 * bookable to bookable (a cancellation, an expired hold, extra seats, sales
 * reopened), everyone waiting gets a notification and their entry is
 * removed. Booking is still the normal race; the waitlist holds no seat.
 */

import { precondition } from "../platform/errors";
import { db, type Timestamp } from "../platform/firestore";
import { docId, obj, requestId } from "../platform/callable";
import { notify } from "../platform/notify";
import { notFoundHere, runCommand, type Json } from "../catalog/common";
import { DAY_MS, contentOf } from "./model";
import { T, departureRef, travellerRef, tripRef, waitlistRef } from "./refs";

/** Seats a departure can still sell right now (ignores the booking cut-off). */
export function openSeats(dep: Json | undefined): number {
  if (!dep || dep.cancelled === true || dep.salesClosed === true) return 0;
  return Math.max(0, ((dep.seatsTotal as number) ?? 0) - ((dep.seatsTaken as number) ?? 0));
}

/** A departure that could not be booked is bookable again. */
export function seatOpened(before: Json | undefined, after: Json | undefined): boolean {
  return openSeats(before) === 0 && openSeats(after) > 0;
}

const cutoffPassed = (dep: Json, trip: Json, nowMs: number) =>
  (dep.start as Timestamp).toMillis() - contentOf(trip).bookingCutoffDays * DAY_MS <= nowMs;

// ---------------------------------------------------------- joinTripWaitlist

export async function joinTripWaitlistCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const departureId = docId(d.departureId, "departureId");
  return runCommand("trips.waitlist-joined", uid, rid, async (tx, now) => {
    const dSnap = await tx.get(departureRef(departureId));
    if (!dSnap.exists) throw notFoundHere("departure");
    const dep = dSnap.data()!;
    const [tSnap, tvSnap, wSnap] = await Promise.all([
      tx.get(tripRef(dep.tripId as string)),
      tx.get(travellerRef(departureId, uid)),
      tx.get(waitlistRef(departureId, uid)),
    ]);
    if (!tSnap.exists || tSnap.data()!.status !== "live") throw notFoundHere("trip");
    if (dep.cancelled === true) throw precondition("This departure was cancelled.", "Pick another date.");
    if (cutoffPassed(dep, tSnap.data()!, now.toMillis())) throw precondition("Bookings for this date have closed.", "Pick another date.");
    if (((tvSnap.data()?.bookings as number) ?? 0) > 0) throw precondition("You’re already booked on this date.");
    if (openSeats(dep) > 0) throw precondition("Seats are open on this date.", "Book it instead.");
    if (!wSnap.exists) {
      tx.create(waitlistRef(departureId, uid), { departureId, tripId: dep.tripId, orgId: dep.orgId ?? null, uid, createdAt: now });
    }
    return { departureId, waitlisted: true };
  });
}

// --------------------------------------------------------- leaveTripWaitlist

export async function leaveTripWaitlistCommand(uid: string, data: unknown) {
  const d = obj(data);
  const departureId = docId(d.departureId, "departureId");
  // Deleting your own entry is naturally idempotent: no receipt needed.
  await waitlistRef(departureId, uid).delete();
  return { departureId, waitlisted: false };
}

// ------------------------------------------------------- notifyTripWaitlist

/**
 * Alerts everyone waiting on [departureId] if it can be booked now, and
 * removes their entries. A cancelled departure just clears its waitlist.
 * Safe to re-run: notified entries are gone and notifications dedupe on the
 * entry's creation time.
 */
export async function notifyTripWaitlist(departureId: string): Promise<{ notified: number; cleared: number }> {
  const dSnap = await departureRef(departureId).get();
  const dep = dSnap.data();
  const waiting = await db().collection(T.tripWaitlist).where("departureId", "==", departureId).limit(500).get();
  if (waiting.empty) return { notified: 0, cleared: 0 };
  const tSnap = dep ? await tripRef(dep.tripId as string).get() : null;
  const trip = tSnap?.exists ? tSnap.data()! : null;
  const gone = !dep || dep.cancelled === true || !trip || trip.status !== "live" || cutoffPassed(dep, trip, Date.now());
  if (!gone && openSeats(dep) === 0) return { notified: 0, cleared: 0 };
  const title = (trip?.title as string | undefined) ?? "your trip";
  const date = dep ? (dep.start as Timestamp).toDate().toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "";
  let notified = 0;
  for (let i = 0; i < waiting.docs.length; i += 200) {
    const batch = db().batch();
    for (const w of waiting.docs.slice(i, i + 200)) {
      if (!gone) {
        const left = openSeats(dep);
        notify(batch, {
          recipientUid: w.data().uid as string,
          kind: "trip-waitlist",
          title: `A seat opened on ${title}`,
          body: `${date}: ${left} ${left === 1 ? "seat is" : "seats are"} free again. Book soon — it’s first come, first served.`,
          dedupeKey: `${departureId}:${(w.data().createdAt as Timestamp | undefined)?.toMillis() ?? 0}`,
          link: { type: "trip-departure", id: departureId },
        });
        notified++;
      }
      batch.delete(w.ref);
    }
    await batch.commit();
  }
  return { notified, cleared: waiting.size };
}
