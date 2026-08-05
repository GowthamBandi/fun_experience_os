import type { PrototypeState } from "../scenarios/state";
import type { Team, TeamAssignment } from "../entities";
import { selectSessionParticipantPool } from "./identity";

export interface TeamWithMembers {
  team: Team;
  activeAssignments: TeamAssignment[];
  currentMemberCount: number;
  remainingCapacity: number;
  isFull: boolean;
}

export function selectSessionTeams(state: PrototypeState, sessionId: string): TeamWithMembers[] {
  const sessionTeams = (state.teams ?? []).filter((t) => t.sessionId === sessionId);
  const activeAssignments = (state.teamAssignments ?? []).filter((ta) => ta.sessionId === sessionId && ta.status === "active");

  return sessionTeams.map((t) => {
    const teamAssigned = activeAssignments.filter((ta) => ta.teamId === t.id);
    return {
      team: t,
      activeAssignments: teamAssigned,
      currentMemberCount: teamAssigned.length,
      remainingCapacity: Math.max(0, t.capacity - teamAssigned.length),
      isFull: teamAssigned.length >= t.capacity,
    };
  });
}

export function selectUnassignedParticipants(state: PrototypeState, sessionId: string) {
  const pool = selectSessionParticipantPool(state, sessionId);
  const eligible = pool.filter((p) => p.isEligible);
  const activeAssignments = (state.teamAssignments ?? []).filter((ta) => ta.sessionId === sessionId && ta.status === "active");
  const assignedBookingIds = new Set(activeAssignments.map((ta) => ta.bookingId));

  return eligible.filter((p) => !assignedBookingIds.has(p.booking.id));
}

export function selectTeamAllocationReadiness(state: PrototypeState, sessionId: string) {
  const pool = selectSessionParticipantPool(state, sessionId);
  const eligible = pool.filter((p) => p.isEligible);
  const teams = selectSessionTeams(state, sessionId);
  const unassigned = selectUnassignedParticipants(state, sessionId);

  const totalTeamCapacity = teams.reduce((acc, t) => acc + t.team.capacity, 0);
  const isCapacitySufficient = totalTeamCapacity >= eligible.length;
  const isFullyAssigned = unassigned.length === 0 && eligible.length > 0;
  const isLocked = teams.length > 0 && teams.every((t) => t.team.status === "locked");

  return {
    eligibleCount: eligible.length,
    teamsCount: teams.length,
    totalTeamCapacity,
    unassignedCount: unassigned.length,
    isCapacitySufficient,
    isFullyAssigned,
    isLocked,
    canAllocate: eligible.length > 0 && teams.length > 0 && isCapacitySufficient,
  };
}
