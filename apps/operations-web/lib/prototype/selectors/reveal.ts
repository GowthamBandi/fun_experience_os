import type { PrototypeState } from "../scenarios/state";
import { selectSessionParticipantPool } from "./identity";
import { selectSessionTeams, selectUnassignedParticipants } from "./teams";
import { sessionCapacityLedger } from "./capacity";
import { sessionTitle } from "./lookups";
import { resolveSessionPerson } from "./checkIn";

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

export interface RevealCheck {
  key: string;
  label: string;
  passed: boolean;
  /** Blocking checks stop the reveal unless an audited override reason is given. */
  blocking: boolean;
  detail: string;
}

export interface RevealReadinessReport {
  isReadyToReveal: boolean;
  checks: RevealCheck[];
  criticalBlockers: string[];
  warnings: string[];
  participantStatuses: ParticipantReadinessStatus[];
}

const REVEALED = new Set(["revealed", "check-in-open", "live", "completed"]);

export function calculateRevealReadiness(state: PrototypeState, sessionId: string): RevealReadinessReport {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) {
    return { isReadyToReveal: false, checks: [], criticalBlockers: ["Session does not exist."], warnings: [], participantStatuses: [] };
  }

  const pool = selectSessionParticipantPool(state, sessionId);
  const eligible = pool.filter((p) => p.isEligible);
  const teams = selectSessionTeams(state, sessionId);
  const unassigned = selectUnassignedParticipants(state, sessionId);
  const venue = state.venues.find((v) => v.id === session.venueId);
  const playingArea = state.playingAreas.find((pa) => pa.id === session.playingAreaId);
  const lead = resolveSessionPerson(state, session.leadCoordinatorId);
  const safety = resolveSessionPerson(state, session.safetyContactId);

  const hasCode = (p: (typeof pool)[number]) => !!p.temporaryIdentity && p.temporaryIdentity.status !== "not-generated" && p.temporaryIdentity.status !== "revoked";
  const withoutCode = eligible.filter((p) => !hasCode(p));
  const unlockedCodes = eligible.filter((p) => hasCode(p) && p.temporaryIdentity!.status === "generated");
  const unlockedTeams = teams.filter((t) => t.team.status !== "locked" && t.team.status !== "revealed");
  const closedStatuses = ["cancelled", "archived", "completed"];
  const bookingClosed = ["booking-closed", "reveal-pending", "full"].includes(session.status);

  const checks: RevealCheck[] = [
    {
      key: "session-open",
      label: "Session is active",
      passed: !closedStatuses.includes(session.status),
      blocking: true,
      detail: closedStatuses.includes(session.status) ? `The session is ${session.status}.` : "Not cancelled or completed.",
    },
    {
      key: "not-revealed",
      label: "Not revealed yet",
      passed: !REVEALED.has(session.status),
      blocking: true,
      detail: REVEALED.has(session.status) ? "The reveal has already happened." : `Scheduled for ${session.revealAt}.`,
    },
    {
      key: "bookings-closed",
      label: "Bookings closed",
      passed: bookingClosed || REVEALED.has(session.status),
      blocking: false,
      detail: bookingClosed ? "No new participants will join." : REVEALED.has(session.status) ? "The reveal has been sent." : `Bookings are ${session.status.replace(/-/g, " ")} — anyone who joins later needs a code and a team.`,
    },
    {
      key: "participants",
      label: "Confirmed participants",
      passed: eligible.length > 0,
      blocking: true,
      detail: `${eligible.length} confirmed place(s).`,
    },
    {
      key: "codes",
      label: "Everyone has a code",
      passed: eligible.length > 0 && withoutCode.length === 0,
      blocking: true,
      detail: withoutCode.length ? `${withoutCode.length} participant(s) without a code.` : "All codes generated.",
    },
    {
      key: "codes-locked",
      label: "Codes locked",
      passed: eligible.length > 0 && withoutCode.length === 0 && unlockedCodes.length === 0,
      blocking: true,
      detail: unlockedCodes.length ? `${unlockedCodes.length} code(s) not locked.` : withoutCode.length ? "Generate codes first." : "All codes locked.",
    },
    {
      key: "teams",
      label: "Everyone has a team",
      passed: teams.length > 0 && unassigned.length === 0,
      blocking: true,
      detail: teams.length === 0 ? "No teams yet." : unassigned.length ? `${unassigned.length} participant(s) without a team.` : `${teams.length} teams.`,
    },
    {
      key: "teams-locked",
      label: "Teams locked",
      passed: teams.length > 0 && unlockedTeams.length === 0,
      blocking: true,
      detail: teams.length === 0 ? "No teams yet." : unlockedTeams.length ? `${unlockedTeams.length} team(s) not locked.` : "All teams locked.",
    },
    {
      key: "venue",
      label: "Venue and playing area ready",
      passed: venue?.status === "ready" && playingArea?.status === "active",
      blocking: true,
      detail: `${venue?.name ?? "Venue missing"} (${venue?.status ?? "—"}) · ${playingArea?.name ?? "Area missing"} (${playingArea?.status ?? "—"})`,
    },
    {
      key: "lead",
      label: "Lead coordinator assigned",
      passed: !!lead,
      blocking: true,
      detail: lead ? lead.name : "Assign one in Staffing.",
    },
    {
      key: "safety",
      label: "Safety contact assigned",
      passed: !!safety,
      blocking: true,
      detail: safety ? safety.name : "Assign one in Staffing.",
    },
  ];

  const criticalBlockers = checks.filter((c) => !c.passed && c.blocking).map((c) => `${c.label}: ${c.detail}`);
  const warnings = checks.filter((c) => !c.passed && !c.blocking).map((c) => `${c.label}: ${c.detail}`);

  const participantStatuses: ParticipantReadinessStatus[] = pool.map((p) => {
    const hasTemp = hasCode(p);
    const isTempLocked = p.temporaryIdentity?.status === "locked" || p.temporaryIdentity?.status === "revealed";
    const hasTeam = !!p.teamId;
    const isTeamLocked = teams.some((t) => t.team.id === p.teamId && (t.team.status === "locked" || t.team.status === "revealed"));
    const isRevealEligible = p.isEligible && hasTemp && isTempLocked && hasTeam && isTeamLocked;

    let blockedReason: string | undefined;
    if (!p.isEligible) blockedReason = p.blockedReason || "Not confirmed";
    else if (!hasTemp) blockedReason = "No code";
    else if (!isTempLocked) blockedReason = "Code not locked";
    else if (!hasTeam) blockedReason = "No team";
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

  return { isReadyToReveal: criticalBlockers.length === 0, checks, criticalBlockers, warnings, participantStatuses };
}

/** What a participant sees before the reveal: no teams, codes or teammates. */
export function selectPreRevealPreview(state: PrototypeState, sessionId: string) {
  const session = state.sessions.find((s) => s.id === sessionId);
  const ledger = sessionCapacityLedger(state, sessionId);

  return {
    sessionTitle: sessionTitle(state, sessionId),
    date: session?.date ?? "",
    startTime: session?.startTime ?? "",
    joinedCount: ledger.confirmedPaidBookings + ledger.confirmedComplimentaryBookings,
    maxCapacity: ledger.sellableCapacity,
    revealTime: session?.revealAt ?? "",
  };
}

/** What one participant sees after the reveal: their code, team and teammates' codes — never names or contact details. */
export function selectPostRevealPreview(state: PrototypeState, sessionId: string, bookingId: string) {
  const session = state.sessions.find((s) => s.id === sessionId);
  const pool = selectSessionParticipantPool(state, sessionId);
  const participant = pool.find((p) => p.booking.id === bookingId);
  if (!session || !participant) return null;
  const venue = state.venues.find((v) => v.id === session.venueId);
  const playingArea = state.playingAreas.find((pa) => pa.id === session.playingAreaId);

  const teammates = participant.teamId
    ? pool
        .filter((p) => p.teamId === participant.teamId && p.booking.id !== bookingId)
        .map((p) => ({ temporaryCode: p.temporaryIdentity?.temporaryCode ?? "", alias: p.booking.alias }))
    : [];

  return {
    temporaryCode: participant.temporaryIdentity?.temporaryCode ?? "",
    alias: participant.booking.alias,
    teamName: participant.teamName ?? "",
    teammates,
    venueName: venue?.name ?? "",
    venueAddress: venue?.address ?? "",
    playingAreaName: playingArea?.name ?? "",
    reportingTime: session.checkInOpensAt,
    startTime: session.startTime,
    equipmentChecklist: session.equipmentChecklist ?? [],
  };
}
