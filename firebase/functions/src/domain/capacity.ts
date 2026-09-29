/**
 * AUTHORITATIVE CAPACITY ENGINE — server-side.
 *
 * Ported from apps/operations-web/lib/prototype/selectors/capacity.ts.
 * The derivation rules are preserved exactly; only the INPUT SHAPE changed.
 *
 * WHY THE SHAPE CHANGED
 * ---------------------
 * The prototype derived the ledger by scanning every booking of a session.
 * That is correct but unusable as a Firestore transaction: it would read N
 * documents per booking attempt and abort whenever any unrelated booking of the
 * same session changed.
 *
 * Instead the session document carries a set of authoritative counters that are
 * only ever mutated inside the same transaction that mutates the corresponding
 * booking. The counters are a TRANSACTIONAL PROJECTION; the booking documents
 * remain the LEDGER OF RECORD. `recomputeOccupancyFromBookings` below is the
 * reconciliation function that rebuilds the projection from the record, and is
 * what a drift check runs. See ADR-0002.
 *
 * This module is pure: no Firestore, no clock, no I/O. It is the single
 * definition of capacity truth for every client of the platform.
 */

export type OccupancyStatus =
  | "healthy"
  | "almost-full"
  | "full"
  | "overbooked"
  | "under-minimum";

/** Static capacity configuration of a session. Set at scheduling time. */
export interface CapacityConfig {
  /** Hard physical limit of the playing area / venue. Never exceeded. */
  maxPhysicalCapacity: number;
  /** Seats withheld from sale (equipment, staff, accessibility hold). */
  blockedSlots: number;
  /** Complimentary allocation. Consumes physical, not sellable, capacity. */
  compSlots: number;
  minParticipants: number;
  targetParticipants: number;
}

/**
 * Live occupancy counters. Mutated ONLY inside a Firestore transaction that
 * also mutates the corresponding booking document.
 */
export interface OccupancyCounters {
  /** Non-complimentary bookings holding a reservation (reserved / payment-pending). */
  activeReservationHolds: number;
  /** Waitlist offers with a live countdown hold. */
  waitlistOfferHolds: number;
  confirmedPaidBookings: number;
  confirmedComplimentaryBookings: number;
  /** Waitlisted entries without an offer hold. Consume zero capacity. */
  waitlistCount: number;
}

export const EMPTY_OCCUPANCY: OccupancyCounters = {
  activeReservationHolds: 0,
  waitlistOfferHolds: 0,
  confirmedPaidBookings: 0,
  confirmedComplimentaryBookings: 0,
  waitlistCount: 0,
};

export interface CapacityLedger extends CapacityConfig, OccupancyCounters {
  sellableCapacity: number;
  occupiedSellableCapacity: number;
  physicalOccupancy: number;
  remainingSellableCapacity: number;
  remainingPhysicalCapacity: number;
  minViableAttendance: number;
  targetAttendance: number;
  breakEvenAttendance: number;
  fillRate: number;
  occupancyStatus: OccupancyStatus;
}

/**
 * Derives the full capacity ledger.
 *
 * Invariants (identical to the prototype engine):
 *  1. Remaining capacity can never be negative.
 *  2. Physical occupancy is tracked against physical venue capacity.
 *  3. Expired / cancelled / failed / plain-waitlisted bookings consume 0 capacity.
 *  4. Checked-in participants are confirmed and do not double-count.
 */
export function deriveCapacityLedger(
  config: CapacityConfig,
  occupancy: OccupancyCounters
): CapacityLedger {
  const maxPhysicalCapacity = Math.max(0, config.maxPhysicalCapacity);
  const blockedSlots = Math.max(0, config.blockedSlots);
  const compSlots = Math.max(0, config.compSlots);

  const sellableCapacity = Math.max(0, maxPhysicalCapacity - blockedSlots);

  const occupiedSellableCapacity =
    occupancy.activeReservationHolds +
    occupancy.waitlistOfferHolds +
    occupancy.confirmedPaidBookings;

  const physicalOccupancy =
    occupancy.confirmedPaidBookings +
    occupancy.confirmedComplimentaryBookings +
    occupancy.activeReservationHolds +
    occupancy.waitlistOfferHolds;

  const remainingSellableCapacity = Math.max(0, sellableCapacity - occupiedSellableCapacity);
  const remainingPhysicalCapacity = Math.max(0, maxPhysicalCapacity - physicalOccupancy);

  const minViableAttendance = config.minParticipants || 4;
  const targetAttendance = config.targetParticipants || maxPhysicalCapacity || 10;
  const breakEvenAttendance = Math.max(minViableAttendance, Math.ceil(targetAttendance * 0.6));

  const fillRate =
    sellableCapacity > 0
      ? Math.min(100, Math.round((occupiedSellableCapacity / sellableCapacity) * 100))
      : 0;

  let occupancyStatus: OccupancyStatus = "healthy";
  if (physicalOccupancy > maxPhysicalCapacity) {
    occupancyStatus = "overbooked";
  } else if (remainingSellableCapacity === 0) {
    occupancyStatus = "full";
  } else if (fillRate >= 85) {
    occupancyStatus = "almost-full";
  } else if (occupiedSellableCapacity < minViableAttendance) {
    occupancyStatus = "under-minimum";
  }

  return {
    maxPhysicalCapacity,
    blockedSlots,
    compSlots,
    minParticipants: config.minParticipants,
    targetParticipants: config.targetParticipants,
    ...occupancy,
    sellableCapacity,
    occupiedSellableCapacity,
    physicalOccupancy,
    remainingSellableCapacity,
    remainingPhysicalCapacity,
    minViableAttendance,
    targetAttendance,
    breakEvenAttendance,
    fillRate,
    occupancyStatus,
  };
}

/** Booking kinds that a seat request can take. */
export type SeatRequestKind = "sellable" | "complimentary";

export type SeatAdmission =
  | { admitted: true }
  | { admitted: false; reason: "sold-out" | "venue-full"; message: string };

/**
 * THE NO-OVERSELL DECISION.
 *
 * This is the single predicate that governs whether one more seat may be taken.
 * It is called inside the Firestore transaction, against counters read in that
 * same transaction. It is never called on the client for an authoritative answer.
 */
export function admitSeat(ledger: CapacityLedger, kind: SeatRequestKind): SeatAdmission {
  if (kind === "complimentary") {
    if (ledger.remainingPhysicalCapacity <= 0) {
      return {
        admitted: false,
        reason: "venue-full",
        message: "This venue is at its safe capacity, so no more places can be added.",
      };
    }
    return { admitted: true };
  }

  if (ledger.remainingSellableCapacity <= 0) {
    return {
      admitted: false,
      reason: "sold-out",
      message: "This session just sold out. No places are left.",
    };
  }
  if (ledger.remainingPhysicalCapacity <= 0) {
    return {
      admitted: false,
      reason: "venue-full",
      message: "This venue is at its safe capacity, so no more places can be added.",
    };
  }
  return { admitted: true };
}

/**
 * Applies a seat reservation to the counters. Pure — the caller persists.
 * A sellable booking begins life as a reservation hold, not a confirmed seat.
 */
export function applySeatReserved(
  occupancy: OccupancyCounters,
  kind: SeatRequestKind
): OccupancyCounters {
  if (kind === "complimentary") {
    return { ...occupancy, confirmedComplimentaryBookings: occupancy.confirmedComplimentaryBookings + 1 };
  }
  return { ...occupancy, activeReservationHolds: occupancy.activeReservationHolds + 1 };
}

/** Reservation hold converts to a confirmed paid seat. Net occupancy unchanged. */
export function applySeatConfirmed(occupancy: OccupancyCounters): OccupancyCounters {
  return {
    ...occupancy,
    activeReservationHolds: Math.max(0, occupancy.activeReservationHolds - 1),
    confirmedPaidBookings: occupancy.confirmedPaidBookings + 1,
  };
}

/** Reservation hold released without becoming a seat (expiry, payment failure, cancel). */
export function applyHoldReleased(occupancy: OccupancyCounters): OccupancyCounters {
  return {
    ...occupancy,
    activeReservationHolds: Math.max(0, occupancy.activeReservationHolds - 1),
  };
}

/** A confirmed seat is given up (cancellation, refund, company cancellation). */
export function applyConfirmedReleased(
  occupancy: OccupancyCounters,
  kind: SeatRequestKind
): OccupancyCounters {
  if (kind === "complimentary") {
    return {
      ...occupancy,
      confirmedComplimentaryBookings: Math.max(0, occupancy.confirmedComplimentaryBookings - 1),
    };
  }
  return {
    ...occupancy,
    confirmedPaidBookings: Math.max(0, occupancy.confirmedPaidBookings - 1),
  };
}

/**
 * RECONCILIATION — rebuilds the projection from the ledger of record.
 *
 * The booking documents are authoritative history; the session counters are a
 * transactional projection of them. Any divergence is a defect, and this
 * function is what detects it. Mirrors the prototype's classification rules.
 */
export interface BookingOccupancyFacts {
  bookingType: string;
  reservationStatus: string;
  status: string;
  paymentStatus: string;
}

export function recomputeOccupancyFromBookings(
  bookings: BookingOccupancyFacts[]
): OccupancyCounters {
  let activeReservationHolds = 0;
  let waitlistOfferHolds = 0;
  let confirmedPaidBookings = 0;
  let confirmedComplimentaryBookings = 0;
  let waitlistCount = 0;

  for (const b of bookings) {
    const isComp = b.bookingType === "complimentary" || b.status === "complimentary";
    const isConfirmed = b.status === "confirmed" || b.paymentStatus === "confirmed";

    if (b.reservationStatus === "offer-hold" || b.status === "waitlist-offered") {
      waitlistOfferHolds++;
      continue;
    }
    if (b.status === "waitlisted" || b.status === "waitlist-joined") {
      waitlistCount++;
      continue;
    }
    if (isComp) {
      if (isConfirmed || b.status === "complimentary") confirmedComplimentaryBookings++;
      continue;
    }
    if (isConfirmed) {
      confirmedPaidBookings++;
      continue;
    }
    if (
      b.reservationStatus === "active" ||
      b.status === "reserved" ||
      b.status === "payment-pending"
    ) {
      activeReservationHolds++;
    }
  }

  return {
    activeReservationHolds,
    waitlistOfferHolds,
    confirmedPaidBookings,
    confirmedComplimentaryBookings,
    waitlistCount,
  };
}

/** True when the projection has drifted from the record. */
export function occupancyDrift(
  projection: OccupancyCounters,
  recomputed: OccupancyCounters
): Array<{ field: keyof OccupancyCounters; projection: number; actual: number }> {
  const fields: Array<keyof OccupancyCounters> = [
    "activeReservationHolds",
    "waitlistOfferHolds",
    "confirmedPaidBookings",
    "confirmedComplimentaryBookings",
    "waitlistCount",
  ];
  return fields
    .filter((f) => projection[f] !== recomputed[f])
    .map((f) => ({ field: f, projection: projection[f], actual: recomputed[f] }));
}
