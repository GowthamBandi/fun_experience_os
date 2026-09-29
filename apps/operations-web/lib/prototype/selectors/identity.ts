import type { PrototypeState } from "../scenarios/state";
import type { Booking, CheckInStatus, EmergencyAccessLog, IdentityPattern, TemporaryIdentity } from "../entities";

export interface ParticipantPoolItem {
  booking: Booking;
  temporaryIdentity?: TemporaryIdentity;
  teamId?: string;
  teamName?: string;
  checkInStatus: CheckInStatus;
  isEligible: boolean;
  blockedReason?: string;
}

/** A booking holds a seat at the session and can receive an identity, a team and a check-in. */
export function isEligibleBooking(b: Booking): boolean {
  return b.status === "confirmed" || b.status === "payment-confirmed" || b.status === "checked-in" || b.bookingType === "complimentary";
}

function ineligibleReason(b: Booking): string {
  if (b.status.includes("cancelled")) return "Booking cancelled";
  if (b.status === "payment-failed") return "Payment failed";
  if (b.status.startsWith("waitlist") || b.status === "waitlisted") return "On the waitlist";
  if (b.status === "refunded" || b.status === "refund-pending") return "Refunded";
  if (b.status === "reservation-expired") return "Reservation expired";
  return "Payment not confirmed";
}

export function selectSessionParticipantPool(state: PrototypeState, sessionId: string): ParticipantPoolItem[] {
  const sessionBookings = state.bookings.filter((b) => b.sessionId === sessionId);
  const tempIdentities = (state.temporaryIdentities ?? []).filter((t) => t.sessionId === sessionId);
  const assignments = (state.teamAssignments ?? []).filter((ta) => ta.sessionId === sessionId && ta.status === "active");
  const teams = (state.teams ?? []).filter((t) => t.sessionId === sessionId);
  const checkIns = (state.checkInRecords ?? []).filter((c) => c.sessionId === sessionId);

  return sessionBookings.map((b) => {
    const activeAssignment = assignments.find((ta) => ta.bookingId === b.id);
    const teamObj = activeAssignment ? teams.find((t) => t.id === activeAssignment.teamId) : undefined;
    const isEligible = isEligibleBooking(b);
    return {
      booking: b,
      temporaryIdentity: tempIdentities.find((t) => t.bookingId === b.id),
      teamId: teamObj?.id,
      teamName: teamObj?.name,
      checkInStatus: checkIns.find((c) => c.bookingId === b.id)?.status ?? "expected",
      isEligible,
      blockedReason: isEligible ? undefined : ineligibleReason(b),
    };
  });
}

export function selectSessionIdentitySummary(state: PrototypeState, sessionId: string) {
  const pool = selectSessionParticipantPool(state, sessionId);
  const eligible = pool.filter((p) => p.isEligible);
  const has = (p: ParticipantPoolItem, ...statuses: TemporaryIdentity["status"][]) => !!p.temporaryIdentity && statuses.includes(p.temporaryIdentity.status);
  const generated = eligible.filter((p) => has(p, "generated", "locked", "revealed"));
  const locked = eligible.filter((p) => has(p, "locked"));
  const revealed = eligible.filter((p) => has(p, "revealed"));
  const revoked = eligible.filter((p) => has(p, "revoked"));

  return {
    totalBookings: pool.length,
    eligibleCount: eligible.length,
    generatedCount: generated.length,
    lockedCount: locked.length,
    revealedCount: revealed.length,
    revokedCount: revoked.length,
    missingIdentityCount: eligible.length - generated.length,
    isFullyLocked: eligible.length > 0 && locked.length + revealed.length === eligible.length,
  };
}

export function selectIdentityPatternList(state: PrototypeState): IdentityPattern[] {
  return state.identityPatterns ?? [];
}

/** Where a pattern is used: identities generated with it, grouped by session. */
export function selectIdentityPatternUsage(state: PrototypeState, patternId: string) {
  const ids = (state.temporaryIdentities ?? []).filter((t) => t.patternId === patternId);
  const bySession = new Map<string, number>();
  ids.forEach((t) => bySession.set(t.sessionId, (bySession.get(t.sessionId) ?? 0) + 1));
  return {
    identityCount: ids.length,
    sessions: [...bySession.entries()].map(([sessionId, count]) => ({ sessionId, count })),
  };
}

/** Example code for a pattern and sequence number. */
export function formatIdentityCode(pattern: Pick<IdentityPattern, "prefix" | "separator" | "numberLength">, n: number): string {
  return `${pattern.prefix}${pattern.separator}${String(n).padStart(pattern.numberLength, "0")}`;
}

/* ----------------------- emergency identity access ----------------------- */

/** Minutes an emergency identity grant stays open. */
export const EMERGENCY_ACCESS_MINUTES = 5;
/** Minimum characters for an emergency-access justification. */
export const EMERGENCY_REASON_MIN_LENGTH = 15;

export function isEmergencyAccessActive(log: EmergencyAccessLog, nowMs: number = Date.now()): boolean {
  if (log.status !== "active") return false;
  const exp = new Date(log.expiresAt).getTime();
  return Number.isFinite(exp) && exp > nowMs;
}

/** The signed-in operator's open grant for a booking, if any. Identity is shown only while this exists. */
export function selectActiveEmergencyAccess(
  state: PrototypeState,
  bookingId: string,
  operatorId: string,
  nowMs: number = Date.now(),
): EmergencyAccessLog | undefined {
  return (state.emergencyAccessLogs ?? [])
    .filter((l) => l.bookingId === bookingId && l.operatorId === operatorId && isEmergencyAccessActive(l, nowMs))
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt))[0];
}

export function selectBookingEmergencyAccessHistory(state: PrototypeState, bookingId: string): EmergencyAccessLog[] {
  return (state.emergencyAccessLogs ?? [])
    .filter((l) => l.bookingId === bookingId)
    .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
}

/**
 * The protected identity record held in this workspace for a booking.
 * Only rendered while an emergency grant is active.
 */
export function selectProtectedIdentity(state: PrototypeState, bookingId: string) {
  const b = state.bookings.find((x) => x.id === bookingId);
  if (!b) return null;
  return {
    participantAccountId: b.participantId ?? "Not linked",
    bookingReference: b.bookingCode ?? b.id,
    contactOnFile: b.phoneMask,
    paymentMethod: b.method ?? "—",
    bookedAt: b.createdAt,
  };
}

/* ------------------------- participant profile ------------------------- */

export function selectParticipantProfile(state: PrototypeState, bookingId: string) {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return null;
  const session = state.sessions.find((s) => s.id === booking.sessionId);
  const pool = selectSessionParticipantPool(state, booking.sessionId);
  const item = pool.find((p) => p.booking.id === bookingId);
  const checkIn = (state.checkInRecords ?? []).find((c) => c.bookingId === bookingId && c.sessionId === booking.sessionId);
  const revealed = item?.temporaryIdentity?.status === "revealed" || session?.status === "revealed" || session?.status === "check-in-open" || session?.status === "live" || session?.status === "completed";
  return {
    booking,
    session,
    temporaryCode: item?.temporaryIdentity && item.temporaryIdentity.status !== "revoked" ? item.temporaryIdentity.temporaryCode : "",
    identityStatus: item?.temporaryIdentity?.status ?? "not-generated",
    teamName: item?.teamName,
    checkInStatus: item?.checkInStatus ?? "expected",
    checkIn,
    isEligible: item?.isEligible ?? false,
    blockedReason: item?.blockedReason,
    isRevealed: !!revealed,
  };
}

/** Directory rows for every booking holding (or having held) a place. */
export function selectParticipantRows(state: PrototypeState) {
  const pools = new Map<string, Map<string, ParticipantPoolItem>>();
  const poolFor = (sessionId: string) => {
    let m = pools.get(sessionId);
    if (!m) {
      m = new Map(selectSessionParticipantPool(state, sessionId).map((p) => [p.booking.id, p]));
      pools.set(sessionId, m);
    }
    return m;
  };
  return state.bookings
    .filter((b) => !b.status.startsWith("waitlist") && b.status !== "waitlisted")
    .map((b) => {
      const item = poolFor(b.sessionId).get(b.id);
      const session = state.sessions.find((s) => s.id === b.sessionId);
      return {
        booking: b,
        session,
        temporaryCode: item?.temporaryIdentity && item.temporaryIdentity.status !== "revoked" ? item.temporaryIdentity.temporaryCode : "",
        identityStatus: item?.temporaryIdentity?.status ?? "not-generated",
        teamName: item?.teamName,
        checkInStatus: item?.checkInStatus ?? "expected",
        isEligible: item?.isEligible ?? false,
      };
    });
}
