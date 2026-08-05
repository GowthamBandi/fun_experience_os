import type { PrototypeState } from "../scenarios/state";
import type { ScheduledSession, Booking } from "../entities";

export interface SessionCapacityLedger {
  sessionId: string;
  maxPhysicalCapacity: number;
  blockedSlots: number;
  compSlots: number;
  sellableCapacity: number;
  activeReservationHolds: number;
  waitlistOfferHolds: number;
  confirmedPaidBookings: number;
  confirmedComplimentaryBookings: number;
  occupiedSellableCapacity: number;
  physicalOccupancy: number;
  remainingSellableCapacity: number;
  waitlistCount: number;
  minViableAttendance: number;
  targetAttendance: number;
  breakEvenAttendance: number;
  fillRate: number;
  occupancyStatus: "healthy" | "almost-full" | "full" | "overbooked" | "under-minimum";
  isSchedulable: boolean;
}

/**
 * AUTHORITATIVE CAPACITY ENGINE
 *
 * Single source of truth for all capacity math in the platform.
 * Capacity is an authoritative derived model — never persisted as mutable values.
 *
 * Invariants enforced:
 * 1. Remaining capacity can never be negative.
 * 2. Physical occupancy is tracked against physical venue/playing-area capacity.
 * 3. Expired, cancelled, failed, or waitlisted (without offer hold) bookings consume 0 capacity.
 * 4. Checked-in participants are confirmed and do not double-count.
 */
export function sessionCapacityLedger(
  state: PrototypeState,
  sessionId: string
): SessionCapacityLedger {
  const session = state.sessions.find((s) => s.id === sessionId);
  const defaultLedger: SessionCapacityLedger = {
    sessionId,
    maxPhysicalCapacity: 0,
    blockedSlots: 0,
    compSlots: 0,
    sellableCapacity: 0,
    activeReservationHolds: 0,
    waitlistOfferHolds: 0,
    confirmedPaidBookings: 0,
    confirmedComplimentaryBookings: 0,
    occupiedSellableCapacity: 0,
    physicalOccupancy: 0,
    remainingSellableCapacity: 0,
    waitlistCount: 0,
    minViableAttendance: 0,
    targetAttendance: 0,
    breakEvenAttendance: 0,
    fillRate: 0,
    occupancyStatus: "healthy",
    isSchedulable: false,
  };

  if (!session) return defaultLedger;

  // 1. Physical Capacity Determination
  const playingArea = state.playingAreas.find((pa) => pa.id === session.playingAreaId);
  const maxPhysicalCapacity = playingArea?.maxCapacity || session.maxParticipants || 10;
  const blockedSlots = session.blockedSlots || 0;
  const compSlots = session.compSlots || 0;

  // 2. Sellable Capacity = max(0, Physical - Blocked)
  const sellableCapacity = Math.max(0, maxPhysicalCapacity - blockedSlots);

  // 3. Filter Bookings for Session
  const sessionBookings = state.bookings.filter((b) => b.sessionId === sessionId);

  // Active reservation holds (reserved or payment-pending, non-complimentary)
  const activeReservationHolds = sessionBookings.filter((b) => {
    if (b.bookingType === "complimentary") return false;
    if (b.reservationStatus === "active") return true;
    return b.status === "reserved" || b.status === "payment-pending";
  }).length;

  // Waitlist offer holds (active countdown hold)
  const waitlistOfferHolds = sessionBookings.filter(
    (b) => b.reservationStatus === "offer-hold" || b.status === "waitlist-offered"
  ).length;

  // Confirmed paid bookings
  const confirmedPaidBookings = sessionBookings.filter((b) => {
    if (b.bookingType === "complimentary") return false;
    return b.status === "confirmed" || b.paymentStatus === "confirmed";
  }).length;

  // Confirmed complimentary bookings
  const confirmedComplimentaryBookings = sessionBookings.filter((b) => {
    if (b.bookingType !== "complimentary" && b.status !== "complimentary") return false;
    return b.status === "confirmed" || b.paymentStatus === "confirmed" || b.status === "complimentary";
  }).length;

  // Waitlisted entries (0 capacity hold)
  const waitlistCount = sessionBookings.filter(
    (b) => b.status === "waitlisted" || b.status === "waitlist-joined"
  ).length;

  // 4. Occupancy Math
  const occupiedSellableCapacity =
    activeReservationHolds + waitlistOfferHolds + confirmedPaidBookings;

  const physicalOccupancy =
    confirmedPaidBookings +
    confirmedComplimentaryBookings +
    activeReservationHolds +
    waitlistOfferHolds;

  const remainingSellableCapacity = Math.max(0, sellableCapacity - occupiedSellableCapacity);

  const minViableAttendance = session.minParticipants || 4;
  const targetAttendance = session.targetParticipants || session.maxParticipants || 10;
  const breakEvenAttendance = Math.max(
    minViableAttendance,
    Math.ceil(targetAttendance * 0.6)
  );

  const fillRate =
    sellableCapacity > 0
      ? Math.min(100, Math.round((occupiedSellableCapacity / sellableCapacity) * 100))
      : 0;

  // Occupancy Status
  let occupancyStatus: SessionCapacityLedger["occupancyStatus"] = "healthy";
  if (physicalOccupancy > maxPhysicalCapacity) {
    occupancyStatus = "overbooked";
  } else if (remainingSellableCapacity === 0) {
    occupancyStatus = "full";
  } else if (fillRate >= 85) {
    occupancyStatus = "almost-full";
  } else if (occupiedSellableCapacity < minViableAttendance) {
    occupancyStatus = "under-minimum";
  }

  // Development Invariant Assertions
  if (process.env.NODE_ENV !== "production") {
    if (remainingSellableCapacity < 0) {
      console.error(`[CapacityEngine Error] Negative remaining capacity for session ${sessionId}`);
    }
    if (physicalOccupancy > maxPhysicalCapacity) {
      console.warn(`[CapacityEngine Alert] Physical occupancy exceeds max for session ${sessionId}`);
    }
  }

  return {
    sessionId,
    maxPhysicalCapacity,
    blockedSlots,
    compSlots,
    sellableCapacity,
    activeReservationHolds,
    waitlistOfferHolds,
    confirmedPaidBookings,
    confirmedComplimentaryBookings,
    occupiedSellableCapacity,
    physicalOccupancy,
    remainingSellableCapacity,
    waitlistCount,
    minViableAttendance,
    targetAttendance,
    breakEvenAttendance,
    fillRate,
    occupancyStatus,
    isSchedulable: session.status !== "cancelled" && session.status !== "archived",
  };
}

/**
 * Returns overall global capacity metrics across all active/scheduled sessions in state.
 */
export function globalCapacityMetrics(state: PrototypeState) {
  const activeSessions = state.sessions.filter(
    (s) => s.status !== "cancelled" && s.status !== "archived" && s.status !== "completed"
  );

  let totalSellable = 0;
  let totalOccupied = 0;
  let totalRemaining = 0;
  let totalWaitlist = 0;
  let fullSessions = 0;

  for (const s of activeSessions) {
    const ledger = sessionCapacityLedger(state, s.id);
    totalSellable += ledger.sellableCapacity;
    totalOccupied += ledger.occupiedSellableCapacity;
    totalRemaining += ledger.remainingSellableCapacity;
    totalWaitlist += ledger.waitlistCount;
    if (ledger.remainingSellableCapacity === 0) fullSessions++;
  }

  const overallFill =
    totalSellable > 0 ? Math.round((totalOccupied / totalSellable) * 100) : 0;

  return {
    activeSessionsCount: activeSessions.length,
    totalSellable,
    totalOccupied,
    totalRemaining,
    totalWaitlist,
    fullSessionsCount: fullSessions,
    overallFill,
  };
}
