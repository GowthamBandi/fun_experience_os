/**
 * Event reminders: 24 hours and 2 hours before the start (API contract,
 * scheduled every 15 minutes). The notification id is the dedupe key, and a
 * reminder is only written if that id doesn't exist yet, so overlapping runs
 * never notify twice or reset a notification the customer already read.
 */

import { Timestamp, db, serverNow, COLLECTIONS } from "../platform/firestore";
import { notify } from "../platform/notify";
import type { BookingDoc, EventDoc } from "../bookings/reserveSeat";
import { C } from "./config";

const H = 3_600_000;

/** Same id formula as platform/notify.ts. */
const notificationId = (kind: string, dedupeKey: string, uid: string) =>
  `${kind}:${dedupeKey}:${uid}`.replace(/[/]/g, "_").slice(0, 700);

export async function sendEventReminders(): Promise<{ events: number; sent: number }> {
  const now = serverNow().toMillis();
  const events = await db()
    .collection(C.events)
    .where("status", "in", ["published", "booking-closed"])
    .where("startsAt", ">", Timestamp.fromMillis(now))
    .where("startsAt", "<=", Timestamp.fromMillis(now + 24 * H))
    .get();

  let sent = 0;
  for (const e of events.docs) {
    const event = e.data() as EventDoc;
    const startsIn = event.startsAt!.toMillis() - now;
    const window = startsIn <= 2 * H ? "2h" : "24h";
    const bookings = await db()
      .collection(C.bookings)
      .where("eventId", "==", e.id)
      .where("status", "==", "confirmed")
      .get();
    for (const b of bookings.docs) {
      const booking = b.data() as BookingDoc;
      if (!booking.customerUid) continue;
      const dedupeKey = `${e.id}-${window}`;
      const ref = db().collection(COLLECTIONS.userNotifications).doc(notificationId("event-reminder", dedupeKey, booking.customerUid));
      const wrote = await db().runTransaction(async (tx) => {
        if ((await tx.get(ref)).exists) return false;
        notify(tx, {
          recipientUid: booking.customerUid!,
          kind: "event-reminder",
          title: window === "2h" ? "Starting soon" : "Tomorrow",
          body:
            window === "2h"
              ? `${event.title ?? "Your event"} starts in about 2 hours. Keep your ticket QR ready.`
              : `${event.title ?? "Your event"} is coming up in the next 24 hours.`,
          dedupeKey,
          link: { type: "event", id: e.id },
        });
        return true;
      });
      if (wrote) sent++;
    }
  }
  return { events: events.size, sent };
}
