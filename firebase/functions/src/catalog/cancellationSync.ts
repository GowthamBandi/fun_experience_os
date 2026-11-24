/**
 * When PULSE approves an experience revision that changes its cancellation
 * rules, the experience's upcoming events take the new rules, so NEW bookings
 * follow what the organizer set (docs/CANCELLATION_POLICY_CONTRACT.md: "later
 * edits by the organizer apply to new bookings only").
 *
 * Existing bookings never change: every booking made since rules were frozen
 * carries its own copy; a booking from before that (no `cancellation` on it)
 * reads the event's, so it is given the event's CURRENT rules first, then the
 * event moves on. Idempotent: an event already on the new rules is skipped,
 * and a booking that already has rules is never touched.
 */

import { COLLECTIONS, db, serverNow, type Timestamp } from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { resolveCancellation, sameRules, type CancellationRules } from "../commerce/cancellation";
import { eventRef, experienceRef, type Json } from "./common";

/** Events that can still take new bookings, now or once reviewed/published. */
const SYNCED_STATUSES = new Set(["draft", "changes-requested", "submitted", "approved", "published"]);
const BATCH = 400;

const startsAfter = (ev: Json, nowMs: number) => {
  const t = ev.startsAt as Timestamp | undefined;
  return !!t && typeof t.toMillis === "function" && t.toMillis() > nowMs;
};

/** Gives live bookings without frozen rules the rules they were made under. Returns how many. */
export async function freezeUnfrozenBookings(eventId: string, rules: CancellationRules): Promise<number> {
  const snap = await db()
    .collection(COLLECTIONS.bookings)
    .where("eventId", "==", eventId)
    .where("status", "in", ["held", "confirmed"])
    .get();
  const open = snap.docs.filter((d) => d.data().cancellation === undefined || d.data().cancellation === null);
  for (let i = 0; i < open.length; i += BATCH) {
    const batch = db().batch();
    for (const d of open.slice(i, i + BATCH)) batch.update(d.ref, { cancellation: rules });
    await batch.commit();
  }
  return open.length;
}

export interface CancellationSyncResult {
  experienceId: string;
  eventsUpdated: string[];
  bookingsFrozen: number;
}

export async function syncEventCancellation(experienceId: string, nowMs = Date.now()): Promise<CancellationSyncResult> {
  const out: CancellationSyncResult = { experienceId, eventsUpdated: [], bookingsFrozen: 0 };
  const x = (await experienceRef(experienceId).get()).data();
  if (!x || x.status !== "approved") return out;
  const next = resolveCancellation(x).rules;
  const events = await db().collection(COLLECTIONS.events).where("experienceId", "==", experienceId).get();
  for (const e of events.docs) {
    const ev = e.data();
    if (!SYNCED_STATUSES.has(String(ev.status)) || !startsAfter(ev, nowMs)) continue;
    const current = resolveCancellation(ev);
    if (sameRules(current.rules, next)) continue;
    out.bookingsFrozen += await freezeUnfrozenBookings(e.id, current.rules);
    const changed = await db().runTransaction(async (tx) => {
      const s = await tx.get(eventRef(e.id));
      const d = s.data();
      if (!d || d.experienceId !== experienceId || !SYNCED_STATUSES.has(String(d.status)) || !startsAfter(d, nowMs)) return false;
      const before = resolveCancellation(d);
      if (sameRules(before.rules, next)) return false;
      tx.update(eventRef(e.id), { cancellation: next, cancellationPolicy: next.preset, updatedAt: serverNow() });
      writeAudit(tx, {
        action: "catalog.event-cancellation-synced",
        actorUid: "system",
        actorRole: "system",
        resourceType: "event",
        resourceId: e.id,
        orgId: (d.orgId as string | undefined) ?? null,
        before: { cancellationPolicy: before.label, cancellation: before.rules },
        after: { cancellationPolicy: next.preset, cancellation: next },
        reason: "An approved experience revision changed the cancellation rules. New bookings follow them; existing bookings keep theirs.",
        source: "system",
      });
      return true;
    });
    if (changed) out.eventsUpdated.push(e.id);
  }
  return out;
}
