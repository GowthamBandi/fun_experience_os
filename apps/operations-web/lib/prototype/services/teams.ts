import type { PrototypeState } from "../scenarios/state";
import type { Team, TeamAssignment, AssignmentMethod } from "../entities";
import { selectSessionParticipantPool } from "../selectors/identity";
import { pushAudit, pushSignal } from "./helpers";

export function createTeams(
  state: PrototypeState,
  sessionId: string,
  numTeams: number = 2,
  teamCapacity: number = 6,
  operatorId: string = "op-master"
): PrototypeState {
  const existingTeams = (state.teams ?? []).filter((t) => t.sessionId !== sessionId);
  const teamNames = ["Red Falcons", "Blue Vipers", "Gold Eagles", "Silver Panthers", "Green Titans", "Shadow Wolves"];

  const newTeams: Team[] = [];
  for (let i = 0; i < numTeams; i++) {
    const name = teamNames[i % teamNames.length] + (i >= teamNames.length ? ` ${Math.floor(i / teamNames.length) + 1}` : "");
    newTeams.push({
      id: `team-${sessionId}-${i + 1}`,
      sessionId,
      name,
      code: name.split(" ").map((w) => w[0]).join(""),
      capacity: teamCapacity,
      status: "draft",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  let next = {
    ...state,
    teams: [...existingTeams, ...newTeams],
  };

  next = pushAudit(next, {
    sessionId,
    action: "create-teams",
    operatorId,
    description: `Created ${numTeams} teams with capacity ${teamCapacity} for session ${sessionId}`,
  });

  return next;
}

export function allocateTeamsRandomly(
  state: PrototypeState,
  sessionId: string,
  operatorId: string = "op-master"
): PrototypeState {
  const pool = selectSessionParticipantPool(state, sessionId);
  const eligible = pool.filter((p) => p.isEligible);
  let teams = (state.teams ?? []).filter((t) => t.sessionId === sessionId);

  if (teams.length === 0) {
    // Auto-initialize 2 teams if none exist
    const defaultState = createTeams(state, sessionId, 2, Math.max(6, Math.ceil(eligible.length / 2)), operatorId);
    teams = (defaultState.teams ?? []).filter((t) => t.sessionId === sessionId);
  }

  if (eligible.length === 0 || teams.length === 0) return state;

  // Shuffle eligible participants randomly
  const shuffled = [...eligible].sort(() => Math.random() - 0.5);

  const existingAssignments = (state.teamAssignments ?? []).filter((ta) => ta.sessionId !== sessionId);
  const tempIdentities = state.temporaryIdentities ?? [];
  const newAssignments: TeamAssignment[] = [];

  shuffled.forEach((p, idx) => {
    const targetTeam = teams[idx % teams.length];
    const tempIdObj = tempIdentities.find((t) => t.bookingId === p.booking.id);

    newAssignments.push({
      id: `ta-${p.booking.id}-${Date.now()}`,
      sessionId,
      teamId: targetTeam.id,
      bookingId: p.booking.id,
      temporaryIdentityId: tempIdObj?.id,
      assignmentMethod: "random",
      assignedAt: new Date().toISOString(),
      status: "active",
    });
  });

  const updatedTeams = (state.teams ?? []).map((t) =>
    t.sessionId === sessionId ? { ...t, status: "allocated" as const, updatedAt: new Date().toISOString() } : t
  );

  let next: PrototypeState = {
    ...state,
    teams: updatedTeams,
    teamAssignments: [...existingAssignments, ...newAssignments],
  };

  next = pushAudit(next, {
    sessionId,
    action: "allocate-teams-randomly",
    operatorId,
    description: `Randomly allocated ${eligible.length} participants across ${teams.length} teams`,
  });

  next = pushSignal(next, {
    kind: "system",
    sessionId,
    message: `Random team allocation completed for session ${sessionId}`,
    at: "Just now",
  });

  return next;
}

/** Move Participant: Preserves assignment history per Correction 4! */
export function moveTeamParticipant(
  state: PrototypeState,
  params: {
    sessionId: string;
    bookingId: string;
    targetTeamId: string;
    reason: string;
    operatorId?: string;
  }
): { state: PrototypeState; error?: string } {
  const { sessionId, bookingId, targetTeamId, reason, operatorId = "op-master" } = params;

  if (!reason || !reason.trim()) {
    return { state, error: "Reason is mandatory when moving a participant between teams." };
  }

  const teams = (state.teams ?? []).filter((t) => t.sessionId === sessionId);
  const targetTeam = teams.find((t) => t.id === targetTeamId);
  if (!targetTeam) return { state, error: "Target team does not exist." };

  const currentAssignments = (state.teamAssignments ?? []).filter((ta) => ta.sessionId === sessionId && ta.status === "active");
  const targetTeamCount = currentAssignments.filter((ta) => ta.teamId === targetTeamId).length;
  if (targetTeamCount >= targetTeam.capacity) {
    return { state, error: `Team '${targetTeam.name}' is already at maximum capacity (${targetTeam.capacity}).` };
  }

  // 1. Supersede previous active assignment (mark status: "moved")
  const updatedAssignments = (state.teamAssignments ?? []).map((ta) =>
    ta.bookingId === bookingId && ta.sessionId === sessionId && ta.status === "active"
      ? {
          ...ta,
          status: "moved" as const,
          movedAt: new Date().toISOString(),
          movedBy: operatorId,
          reason,
        }
      : ta
  );

  // 2. Create new active assignment
  const tempIdObj = (state.temporaryIdentities ?? []).find((t) => t.bookingId === bookingId);
  const newAssignment: TeamAssignment = {
    id: `ta-${bookingId}-${Date.now()}`,
    sessionId,
    teamId: targetTeamId,
    bookingId,
    temporaryIdentityId: tempIdObj?.id,
    assignmentMethod: "manual",
    assignedAt: new Date().toISOString(),
    status: "active",
  };

  let next: PrototypeState = {
    ...state,
    teamAssignments: [...updatedAssignments, newAssignment],
  };

  next = pushAudit(next, {
    sessionId,
    action: "move-team-participant",
    operatorId,
    description: `Moved participant ${bookingId} to team '${targetTeam.name}' (${targetTeamId}). Reason: ${reason}`,
  });

  return { state: next };
}

export function swapTeamParticipants(
  state: PrototypeState,
  params: {
    sessionId: string;
    bookingIdA: string;
    bookingIdB: string;
    reason: string;
    operatorId?: string;
  }
): { state: PrototypeState; error?: string } {
  const { sessionId, bookingIdA, bookingIdB, reason, operatorId = "op-master" } = params;

  if (!reason || !reason.trim()) {
    return { state, error: "Reason is mandatory when swapping participants." };
  }

  const active = (state.teamAssignments ?? []).filter((ta) => ta.sessionId === sessionId && ta.status === "active");
  const assignA = active.find((ta) => ta.bookingId === bookingIdA);
  const assignB = active.find((ta) => ta.bookingId === bookingIdB);

  if (!assignA || !assignB) {
    return { state, error: "Both participants must have active team assignments to swap." };
  }

  const res1 = moveTeamParticipant(state, {
    sessionId,
    bookingId: bookingIdA,
    targetTeamId: assignB.teamId,
    reason: `Swap with ${bookingIdB}: ${reason}`,
    operatorId,
  });

  if (res1.error) return res1;

  const res2 = moveTeamParticipant(res1.state, {
    sessionId,
    bookingId: bookingIdB,
    targetTeamId: assignA.teamId,
    reason: `Swap with ${bookingIdA}: ${reason}`,
    operatorId,
  });

  return res2;
}

export function lockTeams(
  state: PrototypeState,
  sessionId: string,
  operatorId: string = "op-master"
): PrototypeState {
  const teams = (state.teams ?? []).map((t) =>
    t.sessionId === sessionId && t.status === "allocated"
      ? { ...t, status: "locked" as const, lockedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
      : t
  );

  let next = { ...state, teams };

  next = pushAudit(next, {
    sessionId,
    action: "lock-teams",
    operatorId,
    description: `Locked team assignments for session ${sessionId}`,
  });

  return next;
}

export function unlockTeamsWithOverride(
  state: PrototypeState,
  sessionId: string,
  reason: string,
  operatorId: string = "op-master"
): PrototypeState {
  const teams = (state.teams ?? []).map((t) =>
    t.sessionId === sessionId && t.status === "locked"
      ? { ...t, status: "allocated" as const, updatedAt: new Date().toISOString() }
      : t
  );

  let next = { ...state, teams };

  next = pushAudit(next, {
    sessionId,
    action: "unlock-teams-override",
    operatorId,
    description: `Unlocked teams with audited override: ${reason}`,
  });

  return next;
}
