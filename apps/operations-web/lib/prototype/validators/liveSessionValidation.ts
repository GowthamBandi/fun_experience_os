import type { PrototypeState } from "../scenarios/state";
import type { LiveSessionStatus, ResultType, TeamScore } from "../entities";
import { selectSessionOpenReadiness } from "../selectors/checkIn";
import { selectEquipmentReadiness } from "../selectors/liveSession";

export function validateSessionOpenReadiness(
  state: PrototypeState,
  sessionId: string
): { isValid: boolean; error?: string } {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return { isValid: false, error: "Session not found." };

  if (session.status === "cancelled" || session.status === "completed") {
    return { isValid: false, error: `Cannot open session with status '${session.status}'.` };
  }

  const handover = selectSessionOpenReadiness(state, sessionId);
  if (handover.status === "Blocked") {
    return { isValid: false, error: `Session open blocked: ${handover.reasons.join("; ")}` };
  }

  const eq = selectEquipmentReadiness(state, sessionId);
  if (!eq.isReady) {
    return { isValid: false, error: `Session open blocked by missing critical equipment: ${eq.criticalMissingNames.join(", ")}` };
  }

  return { isValid: true };
}

/** Correction 2: State Machine Guarded Transitions */
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
    return {
      isValid: false,
      error: `Invalid live session transition: Cannot transition from '${currentStatus}' to '${targetStatus}'.`,
    };
  }

  return { isValid: true };
}

/** Correction 9: Emergency Role Rule & Derived Lead Coordinator Permission */
export function validateEmergencyRolePermission(
  state: PrototypeState,
  sessionId: string,
  operatorId: string,
  operatorRole: string
): { isValid: boolean; error?: string } {
  const session = state.sessions.find((s) => s.id === sessionId);

  // Check if user is the assigned Lead Coordinator for THIS EXACT session
  const isAssignedLeadCoordinator =
    (operatorRole === "coordinator" || operatorRole === "lead-coordinator" || operatorRole === "staff") &&
    session?.leadCoordinatorId === operatorId;

  const allowed =
    operatorRole === "platform-owner" ||
    operatorRole === "super-admin" ||
    operatorRole === "safety" ||
    operatorRole === "ops-manager" ||
    isAssignedLeadCoordinator;

  if (!allowed) {
    return {
      isValid: false,
      error: `Access Denied: Role '${operatorRole}' is not authorized for emergency control on session ${sessionId}. (Prototype role simulation — not production authorization.)`,
    };
  }

  return { isValid: true };
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

/** Correction 5, 6 & 7: Result Validation & Non-Negative Scores */
export function validateResultEntry(
  state: PrototypeState,
  params: {
    sessionId: string;
    segmentId: string;
    resultType: ResultType;
    teamScores?: TeamScore[];
    winnerTeamId?: string;
    isCorrection?: boolean;
    correctionReason?: string;
  }
): { isValid: boolean; error?: string } {
  const { sessionId, segmentId, resultType, teamScores, winnerTeamId, isCorrection, correctionReason } = params;

  const segment = (state.activitySegments ?? []).find((s) => s.id === segmentId && s.sessionId === sessionId);
  if (!segment) return { isValid: false, error: "Segment does not belong to session." };

  if (isCorrection && (!correctionReason || !correctionReason.trim())) {
    return { isValid: false, error: "Correction reason is mandatory when revising a confirmed result." };
  }

  if (resultType === "score" && teamScores) {
    for (const ts of teamScores) {
      if (typeof ts.score !== "number" || isNaN(ts.score) || ts.score < 0) {
        return { isValid: false, error: `Invalid score for team '${ts.teamId}': Score values cannot be negative.` };
      }
    }

    if (winnerTeamId && teamScores.length >= 2) {
      const winnerScore = teamScores.find((t) => t.teamId === winnerTeamId)?.score ?? 0;
      const otherScores = teamScores.filter((t) => t.teamId !== winnerTeamId).map((t) => t.score);
      const maxOther = Math.max(...otherScores);
      if (winnerScore <= maxOther) {
        return { isValid: false, error: `Winner score (${winnerScore}) must be strictly greater than opponent max score (${maxOther}).` };
      }
    }
  }

  if (resultType === "draw" && winnerTeamId) {
    return { isValid: false, error: "Draw result cannot also have a winner team declared." };
  }

  return { isValid: true };
}
