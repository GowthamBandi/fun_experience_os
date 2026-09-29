import type { PrototypeState } from "../scenarios/state";
import type { LiveSessionStatus, ResultType, TeamScore } from "../entities";
import { isSessionLeadCoordinator, selectSessionOpenReadiness } from "../selectors/checkIn";
import { selectEquipmentReadiness } from "../selectors/liveSession";

/**
 * Can the session be opened for live operations?
 * `hardBlock` problems (cancelled/completed session, missing critical equipment)
 * cannot be overridden; readiness problems can, with an audited reason.
 */
export function validateSessionOpenReadiness(
  state: PrototypeState,
  sessionId: string
): { isValid: boolean; error?: string; hardBlock?: boolean } {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return { isValid: false, error: "Session not found.", hardBlock: true };

  if (session.status === "cancelled" || session.status === "completed" || session.status === "archived") {
    return { isValid: false, error: `The session is ${session.status} and cannot be opened.`, hardBlock: true };
  }

  const eq = selectEquipmentReadiness(state, sessionId);
  if (!eq.isReady) {
    return { isValid: false, error: `Critical equipment is missing: ${eq.criticalMissingNames.join(", ")}. Update the equipment list first.`, hardBlock: true };
  }

  const handover = selectSessionOpenReadiness(state, sessionId);
  if (handover.status === "Blocked") {
    const blocking = handover.checks.filter((c) => !c.passed && c.blocking).map((c) => c.label.toLowerCase());
    return { isValid: false, error: `Not ready to open: ${blocking.join("; ")}.` };
  }

  return { isValid: true };
}

/** Live session state machine. Emergency always returns to Paused. */
export function validateStateTransition(
  currentStatus: LiveSessionStatus,
  targetStatus: LiveSessionStatus
): { isValid: boolean; error?: string } {
  const allowedTransitions: Record<LiveSessionStatus, LiveSessionStatus[]> = {
    Ready: ["Opening"],
    Opening: ["Live"],
    Live: ["Paused", "Emergency", "Ending"],
    Paused: ["Live", "Emergency", "Ending"],
    Emergency: ["Paused"], // Correction 2: Emergency exit MUST return to Paused!
    Ending: ["Ended"],
    Ended: ["Completed"],
    Completed: [], // Completed is read-only
  };

  const allowed = allowedTransitions[currentStatus] ?? [];
  if (!allowed.includes(targetStatus)) {
    const label = (s: LiveSessionStatus) => s.toLowerCase();
    return {
      isValid: false,
      error: `The session is ${label(currentStatus)}; it cannot move to ${label(targetStatus)}.`,
    };
  }

  return { isValid: true };
}

/** Roles that may take emergency control of any session. */
export const EMERGENCY_CONTROL_ROLES = ["platform-owner", "super-admin", "safety", "ops-manager"] as const;

/**
 * Emergency control is allowed for platform owners, super admins, safety and
 * operations managers, and for the session's own lead coordinator (whatever
 * their role). `operatorRole` is the role id of the signed-in operator.
 */
export function validateEmergencyRolePermission(
  state: PrototypeState,
  sessionId: string,
  operatorId: string,
  operatorRole: string
): { isValid: boolean; error?: string } {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return { isValid: false, error: "Session not found." };

  if ((EMERGENCY_CONTROL_ROLES as readonly string[]).includes(operatorRole)) return { isValid: true };
  if (isSessionLeadCoordinator(state, sessionId, operatorId)) return { isValid: true };

  return {
    isValid: false,
    error: "Only a platform owner, super admin, safety officer, operations manager or this session's lead coordinator can use emergency controls.",
  };
}

/** Correction 4: Single Active Segment Invariant */
export function validateSegmentActivation(
  state: PrototypeState,
  sessionId: string,
  targetSegmentId: string
): { isValid: boolean; error?: string } {
  const segments = (state.activitySegments ?? []).filter((s) => s.sessionId === sessionId);
  const target = segments.find((s) => s.id === targetSegmentId);

  if (!target) return { isValid: false, error: "Target segment does not exist." };

  if (target.status === "Completed" || target.status === "Skipped" || target.status === "Cancelled") {
    return { isValid: false, error: `Completed or skipped segment '${target.name}' cannot be restarted silently.` };
  }

  const currentlyActive = segments.find((s) => s.id !== targetSegmentId && (s.status === "Active" || s.status === "Paused"));
  if (currentlyActive) {
    return {
      isValid: false,
      error: `Cannot start segment '${target.name}': Segment '${currentlyActive.name}' is currently ${currentlyActive.status}. Only one segment may be active at a time.`,
    };
  }

  return { isValid: true };
}

/** Result rules: the step must have run, scores are whole non-negative numbers, the winner must lead. */
export function validateResultEntry(
  state: PrototypeState,
  params: {
    sessionId: string;
    segmentId: string;
    resultType: ResultType;
    teamScores?: TeamScore[];
    winnerTeamId?: string;
    outcome?: string;
    isCorrection?: boolean;
    correctionReason?: string;
  }
): { isValid: boolean; error?: string } {
  const { sessionId, segmentId, resultType, teamScores, winnerTeamId, outcome, isCorrection, correctionReason } = params;

  const segment = (state.activitySegments ?? []).find((s) => s.id === segmentId && s.sessionId === sessionId);
  if (!segment) return { isValid: false, error: "That step does not belong to this session." };
  if (segment.status === "Skipped" || segment.status === "Cancelled") {
    return { isValid: false, error: `'${segment.name}' was skipped, so it has no result.` };
  }
  if (segment.status === "Planned" || segment.status === "Ready") {
    return { isValid: false, error: `'${segment.name}' has not started yet. Start the step before recording its result.` };
  }

  if (isCorrection && (!correctionReason || correctionReason.trim().length < 5)) {
    return { isValid: false, error: "Give a reason (at least 5 characters) for correcting a confirmed result." };
  }

  const sessionTeamIds = new Set((state.teams ?? []).filter((t) => t.sessionId === sessionId).map((t) => t.id));
  if (winnerTeamId && resultType !== "outcome" && !sessionTeamIds.has(winnerTeamId)) {
    return { isValid: false, error: "The winner must be one of this session's teams." };
  }

  if (resultType === "score") {
    if (!teamScores || teamScores.length < 2) return { isValid: false, error: "Enter a score for at least two teams." };
    for (const ts of teamScores) {
      if (typeof ts.score !== "number" || !Number.isInteger(ts.score) || ts.score < 0) {
        return { isValid: false, error: "Scores must be whole numbers of zero or more. Score values cannot be negative." };
      }
      if (!sessionTeamIds.has(ts.teamId)) return { isValid: false, error: "Scores can only be recorded for this session's teams." };
    }
    if (new Set(teamScores.map((t) => t.teamId)).size !== teamScores.length) {
      return { isValid: false, error: "Each team can only appear once in the scores." };
    }
    if (winnerTeamId) {
      const winnerScore = teamScores.find((t) => t.teamId === winnerTeamId)?.score;
      if (winnerScore === undefined) return { isValid: false, error: "The winner must be one of the scored teams." };
      const maxOther = Math.max(...teamScores.filter((t) => t.teamId !== winnerTeamId).map((t) => t.score));
      if (winnerScore <= maxOther) {
        return { isValid: false, error: `Winner score (${winnerScore}) must be higher than every other team (${maxOther}).` };
      }
    }
  }

  if (resultType === "draw") {
    if (winnerTeamId) return { isValid: false, error: "A draw cannot also have a winner." };
    if (teamScores && teamScores.length >= 2 && new Set(teamScores.map((t) => t.score)).size !== 1) {
      return { isValid: false, error: "A draw needs equal scores." };
    }
  }

  if (resultType === "outcome" && !outcome?.trim()) {
    return { isValid: false, error: "Choose or describe the outcome." };
  }

  return { isValid: true };
}
