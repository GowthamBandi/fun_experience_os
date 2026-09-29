/**
 * RESERVATION HOLD SWEEPER.
 *
 * A sellable seat is taken as a 15-minute reservation hold (reserveSeat). If
 * payment does not confirm it in time, this job gives the seat back:
 *
 *   booking:  reservationStatus active → expired, status → reservation-expired,
 *             paymentStatus → not-started (same as the console's expireReservation)
 *   session:  occupancy.activeReservationHolds − 1 per booking (applyHoldReleased),
 *             derived remainingSellableCapacity / fillRate / occupancyStatus republished
 *
 * GUARANTEES
 *  - ONE TRANSACTION PER SESSION: the booking updates and the counter update
 *    commit together, so the projection never drifts from the ledger.
 *  - IDEMPOTENT: inside the transaction each booking is re-read and only
 *    released if it is still `active` and past its expiry. A second run, a
 *    concurrent run, or a payment that confirmed in the meantime changes nothing.
 *  - AUDITED: one `booking.hold-expired` event per booking, actor "system".
 *
 * Query: bookings where reservationStatus == "active" and
 * reservationExpiresAt <= now, ordered by reservationExpiresAt — served by the
 * composite index in firebase/firestore/firestore.indexes.json.
 */

import * as functions from "firebase-functions/v1";
import type { DocumentSnapshot, Timestamp } from "firebase-admin/firestore";
import { COLLECTIONS, bookingRef, db, serverNow, sessionRef } from "../platform/firestore";
import { SYSTEM_ACTOR, writeAudit } from "../platform/commands";
import { EMPTY_OCCUPANCY, applyHoldReleased, deriveCapacityLedger, type CapacityConfig, type OccupancyCounters } from "../domain/capacity";

export const HOLD_SWEEP_BATCH = 200;
const MAX_BATCHES_PER_RUN = 10;

export interface ReleaseSummary {
  scanned: number;
  released: number;
  sessions: number;
}

function isStillExpiredHold(snap: DocumentSnapshot, cutoffMillis: number): boolean {
  if (!snap.exists) return false;
  const data = snap.data()!;
  const expiresAt = data.reservationExpiresAt as Timestamp | null | undefined;
  return data.reservationStatus === "active" && !!expiresAt && typeof expiresAt.toMillis === "function" && expiresAt.toMillis() <= cutoffMillis;
}

/** Releases the given candidate bookings of one session in a single transaction. Returns how many were released. */
export async function releaseSessionHolds(sessionId: string, bookingIds: string[], cutoff: Timestamp): Promise<number> {
  return db().runTransaction(async (tx) => {
    const [sessionSnap, ...bookingSnaps] = await Promise.all([
      tx.get(sessionRef(sessionId)),
      ...bookingIds.map((id) => tx.get(bookingRef(id))),
    ]);
    const expired = bookingSnaps.filter((snap) => isStillExpiredHold(snap, cutoff.toMillis()));
    if (!expired.length) return 0;

    const now = serverNow();
    for (const snap of expired) {
      const booking = snap.data()!;
      tx.update(snap.ref, {
        reservationStatus: "expired",
        status: "reservation-expired",
        paymentStatus: "not-started",
        releasedAt: now,
        updatedAt: now,
        updatedBy: SYSTEM_ACTOR.uid,
      });
      writeAudit(tx, SYSTEM_ACTOR, {
        action: "booking.hold-expired",
        subject: `Reservation expired — ${String(booking.alias ?? snap.id)}`,
        summary: "Payment was not completed before the reservation hold ended, so the seat was released.",
        entityType: "booking",
        entityId: snap.id,
        before: { status: booking.status ?? null, reservationStatus: "active" },
        after: { status: "reservation-expired", reservationStatus: "expired" },
        context: { sessionId, territoryId: booking.territoryId ?? null },
      }, now);
    }

    // A booking whose session vanished is still released (the seat is gone
    // anyway); there are simply no counters to correct.
    if (sessionSnap.exists) {
      const session = sessionSnap.data() as { capacity: CapacityConfig; occupancy?: OccupancyCounters };
      let occupancy: OccupancyCounters = { ...EMPTY_OCCUPANCY, ...(session.occupancy ?? {}) };
      for (let i = 0; i < expired.length; i++) occupancy = applyHoldReleased(occupancy);
      const ledger = deriveCapacityLedger(session.capacity, occupancy);
      tx.update(sessionSnap.ref, {
        occupancy,
        remainingSellableCapacity: ledger.remainingSellableCapacity,
        fillRate: ledger.fillRate,
        occupancyStatus: ledger.occupancyStatus,
        updatedAt: now,
      });
    }
    return expired.length;
  });
}

export async function releaseExpiredHolds(options: { now?: Timestamp; batchSize?: number } = {}): Promise<ReleaseSummary> {
  const cutoff = options.now ?? serverNow();
  const batchSize = options.batchSize ?? HOLD_SWEEP_BATCH;
  const summary: ReleaseSummary = { scanned: 0, released: 0, sessions: 0 };

  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
    const snap = await db()
      .collection(COLLECTIONS.bookings)
      .where("reservationStatus", "==", "active")
      .where("reservationExpiresAt", "<=", cutoff)
      .orderBy("reservationExpiresAt", "asc")
      .limit(batchSize)
      .get();
    if (snap.empty) break;
    summary.scanned += snap.size;

    const bySession = new Map<string, string[]>();
    for (const doc of snap.docs) {
      const sessionId = String(doc.data().sessionId ?? "");
      if (!sessionId) continue;
      bySession.set(sessionId, [...(bySession.get(sessionId) ?? []), doc.id]);
    }
    let releasedThisBatch = 0;
    for (const [sessionId, bookingIds] of bySession) {
      const released = await releaseSessionHolds(sessionId, bookingIds, cutoff);
      releasedThisBatch += released;
      if (released) summary.sessions++;
    }
    summary.released += releasedThisBatch;
    // Nothing more to drain, or nothing in this batch could be released (avoid spinning).
    if (snap.size < batchSize || releasedThisBatch === 0) break;
  }
  return summary;
}

/** Every 5 minutes: give back seats whose reservation hold has run out. */
export const releaseExpiredHoldsJob = functions.pubsub
  .schedule("every 5 minutes")
  .timeZone("Asia/Kolkata")
  .onRun(async () => {
    const summary = await releaseExpiredHolds();
    functions.logger.info("releaseExpiredHolds", summary);
    return null;
  });
