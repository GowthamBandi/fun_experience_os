/**
 * Hold expiry (ADR-0002 §5, ADR-0005 step 4; resolves BLOCKER-004).
 *
 * Expires `held` bookings past `holdExpiresAt`, one transaction per booking
 * that re-reads the booking and mutates it together with the event counters.
 * Running it twice (or concurrently) releases each hold exactly once.
 */

import { bookingRef, db, sessionRef, serverNow } from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { EMPTY_OCCUPANCY, applyHoldReleased, occupancyProjection } from "../domain/capacity";
import type { BookingDoc, EventDoc } from "../bookings/reserveSeat";
import { C } from "./config";
import { logWarn } from "../platform/log";

export async function releaseExpiredHolds(
  opts: { limit?: number } = {}
): Promise<{ scanned: number; expired: number; failed: number; more: boolean }> {
  const limit = opts.limit ?? 500;
  const now = serverNow();
  const snap = await db()
    .collection(C.bookings)
    .where("status", "==", "held")
    .where("holdExpiresAt", "<=", now)
    .limit(limit)
    .get();

  let expired = 0;
  let failed = 0;
  let lastError: unknown = null;
  for (const d of snap.docs) {
    // One booking's failure (e.g. contention with a concurrent payment) must
    // not strand the rest of the batch; it is retried on the next run.
    const done = await db().runTransaction(async (tx) => {
      const bSnap = await tx.get(bookingRef(d.id));
      const b = bSnap.data() as BookingDoc | undefined;
      const t = serverNow();
      if (!b || b.status !== "held" || !b.holdExpiresAt || b.holdExpiresAt.toMillis() > t.toMillis()) return false;
      const eSnap = await tx.get(sessionRef(b.eventId));
      const event = eSnap.data() as EventDoc | undefined;
      tx.update(bookingRef(d.id), { status: "expired", expiredAt: t, updatedAt: t });
      if (event) {
        const occ = applyHoldReleased({ ...EMPTY_OCCUPANCY, ...(event.occupancy ?? {}) }, b.spots ?? 1);
        tx.update(sessionRef(b.eventId), { ...occupancyProjection(event.capacity, occ), updatedAt: t });
      }
      writeAudit(tx, {
        action: "booking.hold-expired",
        actorUid: "system",
        actorRole: "system",
        resourceType: "booking",
        resourceId: d.id,
        orgId: b.orgId,
        before: { status: "held" },
        after: { status: "expired", spots: b.spots },
        source: "scheduler",
      });
      return true;
    }).catch((e: unknown) => {
      failed++;
      lastError = e;
      return false;
    });
    if (done) expired++;
  }
  if (failed > 0) {
    logWarn({ event: "holds.release-failed", failed, scanned: snap.size, error: String((lastError as Error)?.message ?? lastError).slice(0, 300) });
  }
  // `more`: the batch was full, so the next run (5 min) continues the backlog.
  return { scanned: snap.size, expired, failed, more: snap.size === limit };
}
