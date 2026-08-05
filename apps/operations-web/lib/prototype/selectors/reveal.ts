import type { PrototypeState } from "../scenarios/state";
import { selectSessionParticipantPool } from "./identity";
import { selectSessionTeams, selectUnassignedParticipants } from "./teams";
import { sessionCapacityLedger } from "./capacity";
import { sessionTitle } from "./lookups";

export interface ParticipantReadinessStatus {
  bookingId: string;
  alias: string;
  isEligible: boolean;
  hasTempIdentity: boolean;
  isIdentityLocked: boolean;
  hasTeamAssigned: boolean;
  isTeamLocked: boolean;
  isRevealEligible: boolean;
  blockedReason?: string;
}

export interface RevealReadinessReport {
  isReadyToReveal: boolean;
  criticalBlockers: string[];
  warnings: string[];
  participantStatuses: ParticipantReadinessStatus[];
}

export function calculateRevealReadiness(
  state: PrototypeState,
  sessionId: string
): RevealReadinessReport {
  const session = state.sessions.find((s) => s.id === sessionId);
  const criticalBlockers: string[] = [];
  const warnings: string[] = [];

  if (!session) {
    return {
      isReadyToReveal: false,
      criticalBlockers: ["Session does not exist."],
      warnings: [],
      participantStatuses: [],
    };
  }

  // 1. Session is not cancelled or completed
  if (session.status === "cancelled" || session.status === "archived") {
    criticalBlockers.push("Session is cancelled or archived.");
  }
  if (session.status === "completed") {
    criticalBlockers.push("Session is already completed.");
  }

  // 2. Booking window closed or override
  // In prototype, we permit booking-closed or explicit override
  if (session.status !== "booking-closed" && session.status !== "reveal-pending" && session.status !== "full") {
    warnings.push(`Booking window status is '${session.status}' (expected 'booking-closed' or 'full').`);
  }

  // 3. Pool finalized
  const pool = selectSessionParticipantPool(state, sessionId);
  const eligible = pool.filter((p) => p.isEligible);
  if (eligible.length === 0) {
    criticalBlockers.push("No confirmed eligible participants in session pool.");
  }

  // 4. Temporary identities generated and locked
  const missingIdentities = eligible.filter((p) => !p.temporaryIdentity || p.temporaryIdentity.status === "not-generated");
  if (missingIdentities.length > 0) {
    criticalBlockers.push(`${missingIdentities.length} participants missing temporary identities.`);
  }

  const unlockedIdentities = eligible.filter((p) => p.temporaryIdentity && p.temporaryIdentity.status !== "locked");
  if (unlockedIdentities.length > 0) {
    criticalBlockers.push(`${unlockedIdentities.length} temporary identities are not locked.`);
  }

  // 5. Teams generated and locked
  const unassigned = selectUnassignedParticipants(state, sessionId);
  if (unassigned.length > 0) {
    criticalBlockers.push(`${unassigned.length} eligible participants are unassigned to teams.`);
  }

  const teams = selectSessionTeams(state, sessionId);
  const unlockedTeams = teams.filter((t) => t.team.status !== "locked");
  if (unlockedTeams.length > 0 && teams.length > 0) {
    criticalBlockers.push(`${unlockedTeams.length} teams are not locked.`);
  }

  // 6. Venue & Playing area confirmed
  const venue = state.venues.find((v) => v.id === session.venueId);
  const playingArea = state.playingAreas.find((pa) => pa.id === session.playingAreaId);
  if (!venue || venue.status !== "ready") {
    criticalBlockers.push("Venue is not ready or verified.");
  }
  if (!playingArea || playingArea.status !== "active") {
    criticalBlockers.push("Playing area is not active.");
  }

  // 7. Required staff assigned
  if (!session.leadCoordinatorId) {
    criticalBlockers.push("Lead Coordinator is not assigned.");
  }

  // 8. Safety contact assigned
  if (!session.safetyContactId) {
    criticalBlockers.push("Safety Contact is not assigned.");
  }

  // Per-participant readiness status (Correction 6)
  const participantStatuses: ParticipantReadinessStatus[] = pool.map((p) => {
    const hasTemp = !!p.temporaryIdentity && p.temporaryIdentity.status !== "not-generated";
    const isTempLocked = p.temporaryIdentity?.status === "locked";
    const hasTeam = !!p.teamId;
    const isTeamLocked = teams.some((t) => t.team.id === p.teamId && t.team.status === "locked");

    const isRevealEligible = p.isEligible && hasTemp && isTempLocked && hasTeam && isTeamLocked;

    let blockedReason: string | undefined;
    if (!p.isEligible) blockedReason = p.blockedReason || "Ineligible booking";
    else if (!hasTemp) blockedReason = "Missing temporary identity";
    else if (!isTempLocked) blockedReason = "Temporary identity not locked";
    else if (!hasTeam) blockedReason = "Unassigned to team";
    else if (!isTeamLocked) blockedReason = "Team not locked";

    return {
      bookingId: p.booking.id,
      alias: p.booking.alias,
      isEligible: p.isEligible,
      hasTempIdentity: hasTemp,
      isIdentityLocked: isTempLocked,
      hasTeamAssigned: hasTeam,
      isTeamLocked,
      isRevealEligible,
      blockedReason,
    };
  });

  return {
    isReadyToReveal: criticalBlockers.length === 0,
    criticalBlockers,
    warnings,
    participantStatuses,
  };
}

/** Pre-Reveal Preview Payload: Zero private identity fields! */
export function selectPreRevealPreview(state: PrototypeState, sessionId: string) {
  const session = state.sessions.find((s) => s.id === sessionId);
  const ledger = sessionCapacityLedger(state, sessionId);

  return {
    sessionTitle: sessionTitle(state, sessionId),
    status: session?.status ?? "draft",
    joinedCount: ledger.confirmedPaidBookings,
    maxCapacity: ledger.sellableCapacity,
    revealTime: session?.revealAt ?? "T-60 mins",
    checklist: [
      "Registration confirmed",
      "Playing area assigned & pre-inspected",
      "Lead coordinator assigned",
      "Equipments verified",
    ],
    // Explicit privacy assertion: NO legal name, phone, email, or team identities!
  };
}

/** Post-Reveal Preview Payload: Anonymized participant perspective! */
export function selectPostRevealPreview(state: PrototypeState, sessionId: string, bookingId: string) {
  const session = state.sessions.find((s) => s.id === sessionId);
  const pool = selectSessionParticipantPool(state, sessionId);
  const participant = pool.find((p) => p.booking.id === bookingId);
  const venue = state.venues.find((v) => v.id === session?.venueId);
  const playingArea = state.playingAreas.find((pa) => pa.id === session?.playingAreaId);

  // Teammates: return ONLY temporary aliases and temporary codes! NO LEGAL NAMES/PHONES!
  const teammates = pool
    .filter((p) => p.teamId === participant?.teamId && p.booking.id !== bookingId)
    .map((p) => ({
      temporaryCode: p.temporaryIdentity?.temporaryCode ?? "CR-??",
      alias: p.booking.alias,
    }));

  return {
    temporaryCode: participant?.temporaryIdentity?.temporaryCode ?? "CR-07",
    alias: participant?.booking.alias ?? "Participant",
    teamName: participant?.teamName ?? "Unassigned",
    teammates,
    venueName: venue?.name ?? "Venue TBD",
    venueAddress: venue?.address ?? "Address TBD",
    playingAreaName: playingArea?.name ?? "Court 1",
    reportingTime: session?.checkInOpensAt ?? "18:30",
    startTime: session?.startTime ?? "19:00",
    checkInInstructions: "Arrive 15 mins early. Show your Temporary ID code or QR scan at the entrance desk.",
    equipmentChecklist: session?.equipmentChecklist ?? ["Non-marking sports shoes", "Comfortable sportswear"],
  };
}
