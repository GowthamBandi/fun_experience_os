import type { PrototypeState } from "../scenarios/state";
import type { Booking, TemporaryIdentity, IdentityPattern } from "../entities";

export interface ParticipantPoolItem {
  booking: Booking;
  temporaryIdentity?: TemporaryIdentity;
  teamId?: string;
  teamName?: string;
  checkInStatus: "expected" | "checked-in" | "late" | "missing" | "no-show" | "denied";
  isEligible: boolean;
  blockedReason?: string;
}

export function selectSessionParticipantPool(
  state: PrototypeState,
  sessionId: string
): ParticipantPoolItem[] {
  const sessionBookings = state.bookings.filter((b) => b.sessionId === sessionId);
  const tempIdentities = state.temporaryIdentities ?? [];
  const assignments = (state.teamAssignments ?? []).filter((ta) => ta.sessionId === sessionId && ta.status === "active");
  const teams = (state.teams ?? []).filter((t) => t.sessionId === sessionId);
  const checkIns = (state.checkInRecords ?? []).filter((c) => c.sessionId === sessionId);

  return sessionBookings.map((b) => {
    const tempIdObj = tempIdentities.find((t) => t.bookingId === b.id);
    const activeAssignment = assignments.find((ta) => ta.bookingId === b.id);
    const teamObj = activeAssignment ? teams.find((t) => t.id === activeAssignment.teamId) : undefined;
    const checkInObj = checkIns.find((c) => c.bookingId === b.id);

    // Dynamic missing calculation per Correction 2:
    // missing = check-in open AND participant is expected AND status NOT in [checked-in, late, no-show, denied]
    let status = checkInObj?.status ?? "expected";
    if (status === "expected" && (b.status === "cancelled" || b.status === "cancelled-user" || b.status === "cancelled-company")) {
      // Ineligible
    }

    const isEligible =
      b.status === "confirmed" ||
      b.status === "payment-confirmed" ||
      b.bookingType === "complimentary";

    let blockedReason: string | undefined;
    if (!isEligible) {
      blockedReason = b.status.includes("cancelled")
        ? "Booking cancelled"
        : b.status === "payment-failed"
        ? "Payment failed"
        : "Payment pending / unconfirmed";
    }

    return {
      booking: b,
      temporaryIdentity: tempIdObj,
      teamId: activeAssignment?.teamId,
      teamName: teamObj?.name,
      checkInStatus: status,
      isEligible,
      blockedReason,
    };
  });
}

export function selectSessionIdentitySummary(state: PrototypeState, sessionId: string) {
  const pool = selectSessionParticipantPool(state, sessionId);
  const eligible = pool.filter((p) => p.isEligible);
  const generated = eligible.filter((p) => p.temporaryIdentity?.status === "generated" || p.temporaryIdentity?.status === "locked");
  const locked = eligible.filter((p) => p.temporaryIdentity?.status === "locked");
  const revealed = eligible.filter((p) => p.temporaryIdentity?.status === "revealed");

  return {
    totalBookings: pool.length,
    eligibleCount: eligible.length,
    generatedCount: generated.length,
    lockedCount: locked.length,
    revealedCount: revealed.length,
    missingIdentityCount: eligible.length - generated.length,
    isFullyLocked: eligible.length > 0 && locked.length === eligible.length,
  };
}

export function selectIdentityPatternList(state: PrototypeState): IdentityPattern[] {
  return state.identityPatterns ?? [];
}
