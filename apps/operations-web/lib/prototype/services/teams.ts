import type { PrototypeState } from "../scenarios/state";
import type { Team, TeamAssignment } from "../entities";
import { selectSessionParticipantPool } from "../selectors/identity";
import { validateTeamAssignment } from "../validators/teamValidation";
import { pushAudit, pushSignal } from "./helpers";

type Result = { state: PrototypeState; error?: string };

const TEAM_NAMES = ["Red Falcons", "Blue Vipers", "Gold Eagles", "Silver Panthers", "Green Titans", "Shadow Wolves", "Orange Comets", "Purple Rhinos"];
export const MAX_TEAMS = 12;
export const MIN_REASON_LENGTH = 5;

const sessionTeams = (state: PrototypeState, sessionId: string) => (state.teams ?? []).filter((t) => t.sessionId === sessionId);
const isFrozen = (t: Team) => t.status === "locked" || t.status === "revealed";

function buildTeams(sessionId: string, numTeams: number, teamCapacity: number, now: string): Team[] {
  return Array.from({ length: numTeams }, (_, i) => {
    const base = TEAM_NAMES[i % TEAM_NAMES.length];
    const name = i >= TEAM_NAMES.length ? `${base} ${Math.floor(i / TEAM_NAMES.length) + 1}` : base;
    return {
      id: `team-${sessionId}-${i + 1}`,
      sessionId,
      name,
      code: name
        .split(" ")
        .map((w) => w[0])
        .join(""),
      capacity: teamCapacity,
      status: "draft" as const,
      createdAt: now,
      updatedAt: now,
    };
  });
}

/** Supersede every active assignment in a session (history is kept, never deleted). */
function supersedeActive(state: PrototypeState, sessionId: string, reason: string, operatorId: string, now: string): TeamAssignment[] {
  return (state.teamAssignments ?? []).map((ta) =>
    ta.sessionId === sessionId && ta.status === "active" ? { ...ta, status: "removed" as const, movedAt: now, movedBy: operatorId, reason } : ta,
  );
}

/**
 * Create (or re-create) a session's teams. Existing members are released back to
 * the unassigned pool; their assignment history is preserved.
 */
export function createTeams(
  state: PrototypeState,
  sessionId: string,
  numTeams: number = 2,
  teamCapacity: number = 6,
  operatorId: string = "system",
): Result {
  if (!state.sessions.some((s) => s.id === sessionId)) return { state, error: "Session not found." };
  if (!Number.isInteger(numTeams) || numTeams < 1 || numTeams > MAX_TEAMS) return { state, error: `Choose between 1 and ${MAX_TEAMS} teams.` };
  if (!Number.isInteger(teamCapacity) || teamCapacity < 1 || teamCapacity > 50) return { state, error: "Team size must be between 1 and 50." };

  const existing = sessionTeams(state, sessionId);
  if (existing.some(isFrozen)) return { state, error: "Teams are locked. Unlock them with a reason before rebuilding." };

  const eligible = selectSessionParticipantPool(state, sessionId).filter((p) => p.isEligible).length;
  if (numTeams * teamCapacity < eligible) {
    return { state, error: `${numTeams} teams of ${teamCapacity} seat only ${numTeams * teamCapacity} of ${eligible} confirmed participants.` };
  }

  const now = new Date().toISOString();
  const hadMembers = (state.teamAssignments ?? []).some((ta) => ta.sessionId === sessionId && ta.status === "active");
  let next: PrototypeState = {
    ...state,
    teams: [...(state.teams ?? []).filter((t) => t.sessionId !== sessionId), ...buildTeams(sessionId, numTeams, teamCapacity, now)],
    teamAssignments: hadMembers ? supersedeActive(state, sessionId, "Teams rebuilt", operatorId, now) : state.teamAssignments,
  };

  next = pushAudit(next, {
    sessionId,
    action: "create-teams",
    operatorId,
    description: `Set up ${numTeams} teams of ${teamCapacity} for session ${sessionId}${hadMembers ? " (previous members released)" : ""}.`,
  });
  return { state: next };
}

/** Fisher–Yates shuffle. `random` is injectable for tests. */
function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Randomly distribute every confirmed participant across the session's teams.
 * When the session has no teams yet, two teams sized for the pool are created
 * and saved in the same change.
 */
export function allocateTeamsRandomly(
  state: PrototypeState,
  sessionId: string,
  operatorId: string = "system",
  random: () => number = Math.random,
): Result {
  if (!state.sessions.some((s) => s.id === sessionId)) return { state, error: "Session not found." };
  const eligible = selectSessionParticipantPool(state, sessionId).filter((p) => p.isEligible);
  if (eligible.length === 0) return { state, error: "No confirmed participants to allocate yet." };

  let working = state;
  let createdTeams = false;
  if (sessionTeams(working, sessionId).length === 0) {
    const created = createTeams(working, sessionId, 2, Math.max(6, Math.ceil(eligible.length / 2)), operatorId);
    if (created.error) return { state, error: created.error };
    working = created.state; // the new teams are part of the result, not a throwaway copy
    createdTeams = true;
  }

  const teams = sessionTeams(working, sessionId);
  if (teams.some(isFrozen)) return { state, error: "Teams are locked. Unlock them with a reason before re-allocating." };
  const capacity = teams.reduce((sum, t) => sum + t.capacity, 0);
  if (capacity < eligible.length) {
    return { state, error: `Teams seat ${capacity} but ${eligible.length} participants are confirmed. Add teams or raise the team size.` };
  }

  const now = new Date().toISOString();
  const identities = working.temporaryIdentities ?? [];
  const counts = new Map(teams.map((t) => [t.id, 0]));
  const newAssignments: TeamAssignment[] = [];
  shuffle(eligible, random).forEach((p, idx) => {
    // Round-robin, skipping teams that are full (teams may have different sizes).
    let team = teams[idx % teams.length];
    for (let k = 0; (counts.get(team.id) ?? 0) >= team.capacity && k < teams.length; k++) team = teams[(idx + k + 1) % teams.length];
    counts.set(team.id, (counts.get(team.id) ?? 0) + 1);
    newAssignments.push({
      id: `ta-${p.booking.id}-${Date.now().toString(36)}-${idx}`,
      sessionId,
      teamId: team.id,
      bookingId: p.booking.id,
      temporaryIdentityId: identities.find((t) => t.bookingId === p.booking.id && t.sessionId === sessionId)?.id,
      assignmentMethod: "random",
      assignedAt: now,
      status: "active",
    });
  });

  let next: PrototypeState = {
    ...working,
    teams: (working.teams ?? []).map((t) => (t.sessionId === sessionId ? { ...t, status: "allocated" as const, updatedAt: now } : t)),
    teamAssignments: [...supersedeActive(working, sessionId, "Re-allocated randomly", operatorId, now), ...newAssignments],
  };

  next = pushAudit(next, {
    sessionId,
    action: "allocate-teams-randomly",
    operatorId,
    description: `Randomly allocated ${eligible.length} participants across ${teams.length} teams${createdTeams ? " (teams created automatically)" : ""}.`,
  });
  next = pushSignal(next, { kind: "system", sessionId, message: `Teams allocated for session ${sessionId}` });
  return { state: next };
}

/** Move one participant to another team. The previous assignment is kept as history. */
export function moveTeamParticipant(
  state: PrototypeState,
  params: { sessionId: string; bookingId: string; targetTeamId: string; reason: string; operatorId?: string },
): Result {
  const { sessionId, bookingId, targetTeamId, reason, operatorId = "system" } = params;
  if (!reason || reason.trim().length < MIN_REASON_LENGTH) {
    return { state, error: `Give a reason (at least ${MIN_REASON_LENGTH} characters) for moving a participant.` };
  }
  const check = validateTeamAssignment(state, sessionId, targetTeamId, bookingId);
  if (!check.isValid) return { state, error: check.error };

  const source = (state.teamAssignments ?? []).find((ta) => ta.sessionId === sessionId && ta.bookingId === bookingId && ta.status === "active");
  const sourceTeam = source ? sessionTeams(state, sessionId).find((t) => t.id === source.teamId) : undefined;
  if (sourceTeam && isFrozen(sourceTeam)) {
    return { state, error: "The participant's current team is locked. Unlock teams with a reason first." };
  }

  const now = new Date().toISOString();
  const targetTeam = sessionTeams(state, sessionId).find((t) => t.id === targetTeamId)!;
  const assignments = (state.teamAssignments ?? []).map((ta) =>
    ta.bookingId === bookingId && ta.sessionId === sessionId && ta.status === "active"
      ? { ...ta, status: "moved" as const, movedAt: now, movedBy: operatorId, reason: reason.trim() }
      : ta,
  );
  const newAssignment: TeamAssignment = {
    id: `ta-${bookingId}-${Date.now().toString(36)}`,
    sessionId,
    teamId: targetTeamId,
    bookingId,
    temporaryIdentityId: (state.temporaryIdentities ?? []).find((t) => t.bookingId === bookingId && t.sessionId === sessionId)?.id,
    assignmentMethod: "manual",
    assignedAt: now,
    status: "active",
  };

  let next: PrototypeState = {
    ...state,
    teams: (state.teams ?? []).map((t) => (t.id === targetTeamId && t.status === "draft" ? { ...t, status: "allocated" as const, updatedAt: now } : t)),
    teamAssignments: [...assignments, newAssignment],
  };
  next = pushAudit(next, {
    sessionId,
    action: "move-team-participant",
    operatorId,
    description: `Moved ${bookingId} to '${targetTeam.name}'. Reason: ${reason.trim()}`,
  });
  return { state: next };
}

/** Swap two participants between teams. Capacity is unchanged, so full teams can swap. */
export function swapTeamParticipants(
  state: PrototypeState,
  params: { sessionId: string; bookingIdA: string; bookingIdB: string; reason: string; operatorId?: string },
): Result {
  const { sessionId, bookingIdA, bookingIdB, reason, operatorId = "system" } = params;
  if (!reason || reason.trim().length < MIN_REASON_LENGTH) {
    return { state, error: `Give a reason (at least ${MIN_REASON_LENGTH} characters) for swapping participants.` };
  }
  if (bookingIdA === bookingIdB) return { state, error: "Choose two different participants." };

  const active = (state.teamAssignments ?? []).filter((ta) => ta.sessionId === sessionId && ta.status === "active");
  const a = active.find((ta) => ta.bookingId === bookingIdA);
  const b = active.find((ta) => ta.bookingId === bookingIdB);
  if (!a || !b) return { state, error: "Both participants must already be in a team to swap." };
  if (a.teamId === b.teamId) return { state, error: "Both participants are in the same team." };

  const checkA = validateTeamAssignment(state, sessionId, b.teamId, bookingIdA, { ignoreCapacity: true });
  if (!checkA.isValid) return { state, error: checkA.error };
  const checkB = validateTeamAssignment(state, sessionId, a.teamId, bookingIdB, { ignoreCapacity: true });
  if (!checkB.isValid) return { state, error: checkB.error };

  const now = new Date().toISOString();
  const why = reason.trim();
  const assignments = (state.teamAssignments ?? []).map((ta) =>
    ta.id === a.id || ta.id === b.id ? { ...ta, status: "moved" as const, movedAt: now, movedBy: operatorId, reason: `Swap: ${why}` } : ta,
  );
  const make = (src: TeamAssignment, teamId: string, n: number): TeamAssignment => ({
    id: `ta-${src.bookingId}-${Date.now().toString(36)}-${n}`,
    sessionId,
    teamId,
    bookingId: src.bookingId,
    temporaryIdentityId: src.temporaryIdentityId,
    assignmentMethod: "manual",
    assignedAt: now,
    status: "active",
  });

  let next: PrototypeState = { ...state, teamAssignments: [...assignments, make(a, b.teamId, 1), make(b, a.teamId, 2)] };
  next = pushAudit(next, {
    sessionId,
    action: "swap-team-participants",
    operatorId,
    description: `Swapped ${bookingIdA} and ${bookingIdB} between teams. Reason: ${why}`,
  });
  return { state: next };
}

/** Lock teams once every confirmed participant has a team. */
export function lockTeams(state: PrototypeState, sessionId: string, operatorId: string = "system"): Result {
  const teams = sessionTeams(state, sessionId);
  if (teams.length === 0) return { state, error: "Set up teams before locking them." };
  if (teams.every(isFrozen)) return { state, error: "Teams are already locked." };

  const active = new Set((state.teamAssignments ?? []).filter((ta) => ta.sessionId === sessionId && ta.status === "active").map((ta) => ta.bookingId));
  const unassigned = selectSessionParticipantPool(state, sessionId).filter((p) => p.isEligible && !active.has(p.booking.id));
  if (unassigned.length > 0) {
    return { state, error: `${unassigned.length} confirmed participant(s) have no team: ${unassigned.slice(0, 3).map((p) => p.booking.alias).join(", ")}${unassigned.length > 3 ? "…" : ""}.` };
  }

  const now = new Date().toISOString();
  let next: PrototypeState = {
    ...state,
    teams: (state.teams ?? []).map((t) => (t.sessionId === sessionId && !isFrozen(t) ? { ...t, status: "locked" as const, lockedAt: now, updatedAt: now } : t)),
  };
  next = pushAudit(next, { sessionId, action: "lock-teams", operatorId, description: `Locked ${teams.length} teams for session ${sessionId}.` });
  return { state: next };
}

/** Unlock locked teams. Needs a reason; not possible after the reveal. */
export function unlockTeamsWithOverride(state: PrototypeState, sessionId: string, reason: string, operatorId: string = "system"): Result {
  if (!reason || reason.trim().length < MIN_REASON_LENGTH) return { state, error: `Give a reason (at least ${MIN_REASON_LENGTH} characters) for unlocking teams.` };
  const teams = sessionTeams(state, sessionId);
  if (teams.some((t) => t.status === "revealed")) return { state, error: "Teams have been revealed to participants. Cancel the reveal before changing teams." };
  if (!teams.some((t) => t.status === "locked")) return { state, error: "Teams are not locked." };

  const now = new Date().toISOString();
  let next: PrototypeState = {
    ...state,
    teams: (state.teams ?? []).map((t) => (t.sessionId === sessionId && t.status === "locked" ? { ...t, status: "allocated" as const, lockedAt: undefined, updatedAt: now } : t)),
  };
  next = pushAudit(next, { sessionId, action: "unlock-teams-override", operatorId, description: `Unlocked teams. Reason: ${reason.trim()}` });
  return { state: next };
}

/**
 * Data repair: earlier versions of random allocation saved assignments to
 * auto-created teams without saving the teams. Recreate any team an active
 * assignment points at. Idempotent.
 */
export function repairOrphanTeamAssignments(state: PrototypeState): PrototypeState {
  const known = new Set((state.teams ?? []).map((t) => t.id));
  const missing = new Map<string, string>();
  for (const ta of state.teamAssignments ?? []) {
    if (!known.has(ta.teamId) && !missing.has(ta.teamId)) missing.set(ta.teamId, ta.sessionId);
  }
  if (missing.size === 0) return state;

  const now = new Date().toISOString();
  const created: Team[] = [...missing.entries()].map(([id, sessionId]) => {
    const n = Number(id.match(/-(\d+)$/)?.[1] ?? 0);
    const name = n >= 1 ? TEAM_NAMES[(n - 1) % TEAM_NAMES.length] : `Team ${id}`;
    const members = (state.teamAssignments ?? []).filter((ta) => ta.teamId === id && ta.status === "active").length;
    return {
      id,
      sessionId,
      name,
      code: name
        .split(" ")
        .map((w) => w[0])
        .join(""),
      capacity: Math.max(6, members),
      status: "allocated",
      createdAt: now,
      updatedAt: now,
    };
  });
  return { ...state, teams: [...(state.teams ?? []), ...created] };
}
