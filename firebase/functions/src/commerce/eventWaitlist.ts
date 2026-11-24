/**
 * Waitlist for sold-out experiences (events), the same design as the trip
 * waitlist (trips/waitlist.ts): `eventWaitlist/{eventId}__{uid}`, written
 * only here, owner-readable to show "On the waitlist".
 *
 * One-shot and first-come: when a published event goes from no spots to
 * spots (a cancellation, an expired hold, more capacity), everyone waiting
 * is notified and their entry is removed. Booking stays the normal race;
 * the waitlist holds no spot. A cancelled or started event clears it.
 */

import * as functions from "firebase-functions/v1";
import { callable, docId, obj, requestId } from "../platform/callable";
import { requirePhoneUser } from "../platform/actors";
import { DomainError, precondition } from "../platform/errors";
import { db, type Timestamp } from "../platform/firestore";
import { notify } from "../platform/notify";
import { logInfo } from "../platform/log";
import { notFoundHere, runCommand, type Json } from "../catalog/common";
import { EMPTY_OCCUPANCY, deriveCapacityLedger, type CapacityConfig, type OccupancyCounters } from "../domain/capacity";

export const EVENT_WAITLIST = "eventWaitlist";
const ref = (eventId: string, uid: string) => db().collection(EVENT_WAITLIST).doc(`${eventId}__${uid}`);

/** Spots a published, not-yet-started event can still sell. */
export function eventOpenSpots(ev: Json | undefined, nowMs = Date.now()): number {
  if (!ev || ev.status !== "published") return 0;
  const starts = (ev.startsAt as Timestamp | undefined)?.toMillis() ?? 0;
  if (starts <= nowMs) return 0;
  const cap = ev.capacity as CapacityConfig | undefined;
  if (!cap) return 0;
  const occ: OccupancyCounters = { ...EMPTY_OCCUPANCY, ...((ev.occupancy as OccupancyCounters | undefined) ?? {}) };
  return deriveCapacityLedger(cap, occ).remainingSellableCapacity;
}

export function eventSpotOpened(before: Json | undefined, after: Json | undefined): boolean {
  return eventOpenSpots(before) === 0 && eventOpenSpots(after) > 0;
}

export async function joinEventWaitlistCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const eventId = docId(d.eventId, "eventId");
  return runCommand("commerce.waitlist-joined", uid, rid, async (tx, now) => {
    const evSnap = await tx.get(db().collection("events").doc(eventId));
    const ev = evSnap.data();
    if (!ev || !["published", "booking-closed"].includes(String(ev.status))) throw notFoundHere("event");
    if (ev.status !== "published") throw precondition("Bookings for this experience have closed.");
    if (((ev.startsAt as Timestamp | undefined)?.toMillis() ?? 0) <= now.toMillis()) throw precondition("This experience has started.");
    const mine = await tx.get(
      db().collection("bookings").where("eventId", "==", eventId).where("customerUid", "==", uid).where("status", "in", ["held", "confirmed"]).limit(1)
    );
    if (!mine.empty) throw precondition("You’re already booked on this experience.");
    // A spot opened between the sold-out screen and this tap: say so, so the
    // app can send them to book it rather than show an error.
    const open = eventOpenSpots(ev, now.toMillis());
    if (open > 0) {
      throw new DomainError("PRECONDITION", `Good news — ${open === 1 ? "a spot just opened" : `${open} spots just opened`}. Book it now, before someone else does.`, {
        nextStep: "Book it instead.",
        facts: { reason: "spots-open", spotsLeft: open },
      });
    }
    const w = await tx.get(ref(eventId, uid));
    if (!w.exists) tx.create(ref(eventId, uid), { eventId, orgId: ev.orgId ?? null, uid, createdAt: now });
    return { eventId, waitlisted: true };
  });
}

export async function leaveEventWaitlistCommand(uid: string, data: unknown) {
  const eventId = docId(obj(data).eventId, "eventId");
  await ref(eventId, uid).delete();
  return { eventId, waitlisted: false };
}

/** Notifies (and clears) everyone waiting when spots are open; clears it when the event is gone. */
export async function notifyEventWaitlist(eventId: string): Promise<{ notified: number; cleared: number }> {
  const evSnap = await db().collection("events").doc(eventId).get();
  const ev = evSnap.data();
  const waiting = await db().collection(EVENT_WAITLIST).where("eventId", "==", eventId).limit(500).get();
  if (waiting.empty) return { notified: 0, cleared: 0 };
  const startsMs = (ev?.startsAt as Timestamp | undefined)?.toMillis() ?? 0;
  const gone = !ev || ["cancelled", "completed", "live"].includes(String(ev.status)) || startsMs <= Date.now();
  const open = eventOpenSpots(ev);
  if (!gone && open === 0) return { notified: 0, cleared: 0 };
  const title = String(ev?.title ?? "an experience you wanted");
  let notified = 0;
  for (let i = 0; i < waiting.docs.length; i += 200) {
    const batch = db().batch();
    for (const w of waiting.docs.slice(i, i + 200)) {
      if (!gone) {
        notify(batch, {
          recipientUid: String(w.data().uid),
          kind: "event-changed",
          title: `A spot opened on ${title}`,
          body: `${open} ${open === 1 ? "spot is" : "spots are"} free again. Book soon — it’s first come, first served.`,
          dedupeKey: `wl-${eventId}:${(w.data().createdAt as Timestamp | undefined)?.toMillis() ?? 0}`,
          link: { type: "event", id: eventId },
        });
        notified++;
      }
      batch.delete(w.ref);
    }
    await batch.commit();
  }
  return { notified, cleared: waiting.size };
}

export const joinEventWaitlist = callable(async (data, context) => joinEventWaitlistCommand(requirePhoneUser(context).uid, data));
export const leaveEventWaitlist = callable(async (data, context) => leaveEventWaitlistCommand(requirePhoneUser(context).uid, data));

/** Fires when an event changes: alerts the waitlist when spots open, clears it when the event is gone. */
export const onEventSpotsChanged = functions
  .region("asia-south1")
  .runWith({ failurePolicy: true, timeoutSeconds: 120 })
  .firestore.document("events/{eventId}")
  .onUpdate(async (change, context) => {
    const before = change.before.data();
    const after = change.after.data();
    const gone = before?.status !== after?.status && ["cancelled", "completed", "live"].includes(String(after?.status));
    if (!eventSpotOpened(before, after) && !gone) return;
    const eventId = context.params.eventId as string;
    const out = await notifyEventWaitlist(eventId);
    if (out.cleared > 0) logInfo({ event: "job.completed", job: "onEventSpotsChanged", eventId, ...out });
  });
