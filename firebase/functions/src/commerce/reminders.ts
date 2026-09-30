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

export interface ReminderRunOptions {
  /** Events considered per run (soonest first). */
  maxEvents?: number;
  /** Reminder writes per run; the rest go out on the next run (15 min). */
  maxSends?: number;
}

/**
 * Bounded and resumable: at most `maxEvents` events and `maxSends` new
 * reminders per run. Existing reminders are detected with one batched read
 * (no transaction), so a run that resumes a large event only pays for what is
 * still missing. `truncated: true` means the budget ran out.
 */
export async function sendEventReminders(
  opts: ReminderRunOptions = {}
): Promise<{ events: number; sent: number; truncated: boolean }> {
  const maxEvents = opts.maxEvents ?? 200;
  const maxSends = opts.maxSends ?? 2000;
  const now = serverNow().toMillis();
  const events = await db()
    .collection(C.events)
    .where("status", "in", ["published", "booking-closed"])
    .where("startsAt", ">", Timestamp.fromMillis(now))
    .where("startsAt", "<=", Timestamp.fromMillis(now + 24 * H))
    .limit(maxEvents)
    .get();

  let sent = 0;
  let truncated = events.size === maxEvents;
  for (const e of events.docs) {
    if (sent >= maxSends) {
      truncated = true;
      break;
    }
    const event = e.data() as EventDoc;
    const startsIn = event.startsAt!.toMillis() - now;
    const window = startsIn <= 2 * H ? "2h" : "24h";
    const dedupeKey = `${e.id}-${window}`;
    const bookings = await db()
      .collection(C.bookings)
      .where("eventId", "==", e.id)
      .where("status", "==", "confirmed")
      .get();
    const recipients = [
      ...new Set(bookings.docs.map((b) => (b.data() as BookingDoc).customerUid).filter((u): u is string => !!u)),
    ];
    const col = db().collection(COLLECTIONS.userNotifications);
    for (let i = 0; i < recipients.length && sent < maxSends; i += 100) {
      const chunk = recipients.slice(i, i + 100);
      const refs = chunk.map((uid) => col.doc(notificationId("event-reminder", dedupeKey, uid)));
      const existing = await db().getAll(...refs);
      for (let j = 0; j < chunk.length; j++) {
        if (existing[j]!.exists) continue;
        if (sent >= maxSends) {
          truncated = true;
          break;
        }
        const uid = chunk[j]!;
        const ref = refs[j]!;
        // Re-checked inside the transaction: an overlapping run may have
        // written it since the batched read, and a reminder the customer
        // already read must never be reset.
        const wrote = await db().runTransaction(async (tx) => {
          if ((await tx.get(ref)).exists) return false;
          notify(tx, {
            recipientUid: uid,
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
  }
  return { events: events.size, sent, truncated };
}
