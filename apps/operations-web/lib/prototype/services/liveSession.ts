import type { PrototypeState } from "../scenarios/state";
import type {
  LiveSessionState,
  ActivitySegment,
  SegmentResult,
  ResultRevision,
  LiveOperationalNote,
  EquipmentCheckItem,
  SessionCompletionSnapshot,
  ResultType,
  TeamScore,
  LiveNoteType,
  LiveNoteSeverity,
  EquipmentItemStatus,
} from "../entities";
import {
  validateStateTransition,
  validateEmergencyRolePermission,
  validateSegmentActivation,
  validateResultEntry,
  validateSessionOpenReadiness,
} from "../validators/liveSessionValidation";
import { selectLiveSessionState, selectEquipmentReadiness } from "../selectors/liveSession";
import { selectCompletionChecklist, selectSessionSummary } from "../selectors/completion";
import { pushAudit, pushSignal } from "./helpers";

const MIN_REASON = 5;
const locked = (state: PrototypeState, sessionId: string) => {
  const lss = selectLiveSessionState(state, sessionId);
  const session = state.sessions.find((s) => s.id === sessionId);
  return lss.status === "Completed" || session?.status === "completed" || session?.status === "cancelled";
};
const saveLss = (state: PrototypeState, lss: LiveSessionState): PrototypeState["liveSessionStates"] => [
  ...(state.liveSessionStates ?? []).filter((l) => l.sessionId !== lss.sessionId),
  lss,
];

/**
 * Hand the session over to live operations (Ready → Opening).
 * The handover checks must pass, or an audited override reason is given.
 * Cancelled/completed sessions and missing critical equipment cannot be overridden.
 */
export function openSession(
  state: PrototypeState,
  sessionId: string,
  overrideReason?: string,
  operatorId: string = "system"
): { state: PrototypeState; error?: string } {
  if (!state.sessions.some((s) => s.id === sessionId)) return { state, error: "Session not found." };
  const lss = selectLiveSessionState(state, sessionId);
  const check = validateStateTransition(lss.status, "Opening");
  if (!check.isValid) return { state, error: check.error };

  const readiness = validateSessionOpenReadiness(state, sessionId);
  const override = overrideReason?.trim() ?? "";
  if (!readiness.isValid) {
    if (readiness.hardBlock) return { state, error: readiness.error };
    if (!override) return { state, error: `${readiness.error} Give an override reason to open anyway.` };
    if (override.length < MIN_REASON) return { state, error: `The override reason must be at least ${MIN_REASON} characters.` };
  }

  const now = new Date().toISOString();
  let next: PrototypeState = {
    ...state,
    sessions: state.sessions.map((s) => (s.id === sessionId ? { ...s, status: "live" as const } : s)),
    liveSessionStates: saveLss(state, { ...lss, status: "Opening", currentStage: "Opening", updatedAt: now }),
  };

  next = pushAudit(next, {
    sessionId,
    action: "open-session",
    operatorId,
    description: readiness.isValid
      ? `Opened session ${sessionId} for live operations.`
      : `Opened session ${sessionId} with override (${readiness.error}). Reason: ${override}`,
  });

  return { state: next };
}

/** Start the session clock (Opening → Live). From Ready, the session is opened first. */
export function startLiveSession(
  state: PrototypeState,
  sessionId: string,
  overrideReason?: string,
  operatorId: string = "system"
): { state: PrototypeState; error?: string } {
  if (locked(state, sessionId)) return { state, error: "This session is closed." };
  let working = state;
  if (selectLiveSessionState(working, sessionId).status === "Ready") {
    const opened = openSession(working, sessionId, overrideReason, operatorId);
    if (opened.error) return { state, error: opened.error };
    working = opened.state;
  }

  const lss = selectLiveSessionState(working, sessionId);
  const check = validateStateTransition(lss.status, "Live");
  if (!check.isValid || lss.status !== "Opening") {
    return { state, error: lss.status === "Paused" ? "The session is paused. Use Resume to continue the clock." : check.error ?? `The clock cannot start from '${lss.status}'.` };
  }
  if (!selectEquipmentReadiness(working, sessionId).isReady) {
    return { state, error: "Critical equipment is missing. Update the equipment list before starting." };
  }

  const now = new Date().toISOString();
  let next: PrototypeState = {
    ...working,
    sessions: working.sessions.map((s) => (s.id === sessionId ? { ...s, status: "live" as const } : s)),
    liveSessionStates: saveLss(working, {
      ...lss,
      status: "Live",
      currentStage: "Live",
      activeStartedAt: now,
      pausedAt: undefined,
      resumedAt: now,
      updatedAt: now,
    }),
  };

  next = pushAudit(next, { sessionId, action: "start-live-session", operatorId, description: `Started the clock for session ${sessionId}.` });
  next = pushSignal(next, { kind: "system", sessionId, message: `Session ${sessionId} is live` });
  return { state: next };
}

/** Correction 1: Pause Live Session without Double-Counting */
export function pauseLiveSession(
  state: PrototypeState,
  sessionId: string,
  reason: string,
  operatorId: string = "system"
): { state: PrototypeState; error?: string } {
  if (!reason || !reason.trim()) {
    return { state, error: "Give a reason for pausing." };
  }

  const lss = selectLiveSessionState(state, sessionId);
  const check = validateStateTransition(lss.status, "Paused");
  if (!check.isValid) return { state, error: check.error };

  const now = new Date();
  const nowStr = now.toISOString();

  // Accumulate active interval since activeStartedAt once
  let activeDelta = 0;
  if (lss.activeStartedAt) {
    const startMs = new Date(lss.activeStartedAt).getTime();
    if (!isNaN(startMs) && now.getTime() >= startMs) {
      activeDelta = Math.floor((now.getTime() - startMs) / 1000);
    }
  }

  const updatedLss: LiveSessionState = {
    ...lss,
    status: "Paused",
    accumulatedActiveSeconds: (lss.accumulatedActiveSeconds ?? 0) + activeDelta,
    activeStartedAt: undefined, // Clear activeStartedAt
    pausedAt: nowStr,
    pauseReason: reason.trim(),
    updatedAt: nowStr,
  };

  // Pause any currently active segment per Correction 8
  const updatedSegments = (state.activitySegments ?? []).map((s) =>
    s.sessionId === sessionId && s.status === "Active"
      ? { ...s, status: "Paused" as const, updatedAt: nowStr }
      : s
  );

  let next: PrototypeState = {
    ...state,
    liveSessionStates: [
      ...(state.liveSessionStates ?? []).filter((l) => l.sessionId !== sessionId),
      updatedLss,
    ],
    activitySegments: updatedSegments,
  };

  next = pushAudit(next, {
    sessionId,
    action: "pause-live-session",
    operatorId,
    description: `Paused live session ${sessionId}: ${reason}. Accumulated active time: ${updatedLss.accumulatedActiveSeconds}s`,
  });

  return { state: next };
}

export function resumeLiveSession(
  state: PrototypeState,
  sessionId: string,
  operatorId: string = "system"
): { state: PrototypeState; error?: string } {
  const lss = selectLiveSessionState(state, sessionId);
  const check = validateStateTransition(lss.status, "Live");
  if (!check.isValid) return { state, error: check.error };

  const nowStr = new Date().toISOString();

  const updatedLss: LiveSessionState = {
    ...lss,
    status: "Live",
    activeStartedAt: nowStr, // Start new active interval
    pausedAt: undefined,
    resumedAt: nowStr,
    pauseReason: undefined,
    updatedAt: nowStr,
  };

  // Resume paused segment if one exists
  const updatedSegments = (state.activitySegments ?? []).map((s) =>
    s.sessionId === sessionId && s.status === "Paused"
      ? { ...s, status: "Active" as const, updatedAt: nowStr }
      : s
  );

  let next: PrototypeState = {
    ...state,
    liveSessionStates: [
      ...(state.liveSessionStates ?? []).filter((l) => l.sessionId !== sessionId),
      updatedLss,
    ],
    activitySegments: updatedSegments,
  };

  next = pushAudit(next, {
    sessionId,
    action: "resume-live-session",
    operatorId,
    description: `Resumed live session ${sessionId}`,
  });

  return { state: next };
}

/** Correction 8 & 9: Emergency Mode & Derived Lead Coordinator Permission */
export function enterEmergencyMode(
  state: PrototypeState,
  params: {
    sessionId: string;
    reason: string;
    immediateAction: string;
    safetyContactConfirmed: boolean;
    operatorId: string;
    operatorRole: string;
  }
): { state: PrototypeState; error?: string } {
  const { sessionId, reason, immediateAction, safetyContactConfirmed, operatorId, operatorRole } = params;

  const roleCheck = validateEmergencyRolePermission(state, sessionId, operatorId, operatorRole);
  if (!roleCheck.isValid) return { state, error: roleCheck.error };

  if (!reason || reason.trim().length < MIN_REASON) return { state, error: "Describe what happened (at least 5 characters)." };
  if (!immediateAction || immediateAction.trim().length < 3) return { state, error: "Record the immediate action taken." };

  const lss = selectLiveSessionState(state, sessionId);
  const check = validateStateTransition(lss.status, "Emergency");
  if (!check.isValid) return { state, error: check.error };

  const now = new Date();
  const nowStr = now.toISOString();

  // Accumulate active time prior to emergency pause
  let activeDelta = 0;
  if (lss.activeStartedAt) {
    const startMs = new Date(lss.activeStartedAt).getTime();
    if (!isNaN(startMs) && now.getTime() >= startMs) {
      activeDelta = Math.floor((now.getTime() - startMs) / 1000);
    }
  }

  const updatedLss: LiveSessionState = {
    ...lss,
    status: "Emergency",
    emergencyMode: true,
    emergencyReason: reason.trim(),
    emergencyAction: immediateAction.trim(),
    safetyContactConfirmed,
    accumulatedActiveSeconds: (lss.accumulatedActiveSeconds ?? 0) + activeDelta,
    activeStartedAt: undefined,
    pausedAt: nowStr,
    updatedAt: nowStr,
  };

  // Pause active segments
  const updatedSegments = (state.activitySegments ?? []).map((s) =>
    s.sessionId === sessionId && s.status === "Active"
      ? { ...s, status: "Paused" as const, updatedAt: nowStr }
      : s
  );

  // The emergency is also written to the session's notes so it survives exit and appears in the summary.
  const emergencyNote: LiveOperationalNote = {
    id: `note-${sessionId}-${now.getTime().toString(36)}`,
    sessionId,
    type: "safety",
    severity: "critical",
    time: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    operatorId,
    note: `Emergency: ${reason.trim()} — action: ${immediateAction.trim()}${safetyContactConfirmed ? " (safety contact informed)" : ""}`,
    resolutionState: "open",
    followUpRequired: true,
    createdAt: nowStr,
  };

  let next: PrototypeState = {
    ...state,
    liveSessionStates: [
      ...(state.liveSessionStates ?? []).filter((l) => l.sessionId !== sessionId),
      updatedLss,
    ],
    activitySegments: updatedSegments,
    liveOperationalNotes: [...(state.liveOperationalNotes ?? []), emergencyNote],
  };

  next = pushAudit(next, {
    sessionId,
    action: "enter-emergency-mode",
    operatorId,
    description: `Emergency declared: ${reason.trim()}. Immediate action: ${immediateAction.trim()}`,
  });

  next = pushSignal(next, { kind: "alert", sessionId, message: `Emergency on session ${sessionId}: ${reason.trim()}` });

  return { state: next };
}

/** Correction 2: Exit Emergency Returns to Paused! */
export function exitEmergencyMode(
  state: PrototypeState,
  params: {
    sessionId: string;
    exitReason: string;
    operatorId: string;
    operatorRole: string;
  }
): { state: PrototypeState; error?: string } {
  const { sessionId, exitReason, operatorId, operatorRole } = params;

  const roleCheck = validateEmergencyRolePermission(state, sessionId, operatorId, operatorRole);
  if (!roleCheck.isValid) return { state, error: roleCheck.error };

  if (!exitReason || exitReason.trim().length < MIN_REASON) {
    return { state, error: "Explain why it is safe to continue (at least 5 characters)." };
  }

  const lss = selectLiveSessionState(state, sessionId);
  const check = validateStateTransition(lss.status, "Paused");
  if (!check.isValid) return { state, error: check.error };

  const nowStr = new Date().toISOString();

  const updatedLss: LiveSessionState = {
    ...lss,
    status: "Paused", // Returned to Paused per Correction 2!
    emergencyMode: false,
    emergencyReason: undefined,
    emergencyAction: undefined,
    pauseReason: `After emergency: ${exitReason.trim()}`,
    updatedAt: nowStr,
  };

  let next: PrototypeState = {
    ...state,
    liveSessionStates: [
      ...(state.liveSessionStates ?? []).filter((l) => l.sessionId !== sessionId),
      updatedLss,
    ],
  };

  next = pushAudit(next, {
    sessionId,
    action: "exit-emergency-mode",
    operatorId,
    description: `Emergency closed; session paused. Reason: ${exitReason.trim()}`,
  });

  return { state: next };
}

/**
 * End the session: Live/Paused → Ending → Ended. Both transitions are validated;
 * the clock is banked and any open step is closed.
 */
export function endLiveSession(
  state: PrototypeState,
  sessionId: string,
  operatorId: string = "system"
): { state: PrototypeState; error?: string } {
  const lss = selectLiveSessionState(state, sessionId);
  if (lss.status === "Emergency") return { state, error: "Close the emergency before ending the session." };
  const toEnding = validateStateTransition(lss.status, "Ending");
  if (!toEnding.isValid) return { state, error: toEnding.error };
  const toEnded = validateStateTransition("Ending", "Ended");
  if (!toEnded.isValid) return { state, error: toEnded.error };

  const now = new Date();
  const nowStr = now.toISOString();
  let activeDelta = 0;
  if (lss.activeStartedAt) {
    const startMs = new Date(lss.activeStartedAt).getTime();
    if (!isNaN(startMs) && now.getTime() >= startMs) activeDelta = Math.floor((now.getTime() - startMs) / 1000);
  }

  const ended: LiveSessionState = {
    ...lss,
    status: "Ended",
    currentStage: "Ended",
    accumulatedActiveSeconds: (lss.accumulatedActiveSeconds ?? 0) + activeDelta,
    activeStartedAt: undefined,
    pausedAt: undefined,
    endedAt: nowStr,
    updatedAt: nowStr,
  };

  let next: PrototypeState = {
    ...state,
    liveSessionStates: saveLss(state, ended),
    activitySegments: (state.activitySegments ?? []).map((s) =>
      s.sessionId === sessionId && (s.status === "Active" || s.status === "Paused")
        ? { ...s, status: "Completed" as const, actualEnd: nowStr, updatedAt: nowStr }
        : s
    ),
  };

  next = pushAudit(next, {
    sessionId,
    action: "end-live-session",
    operatorId,
    description: `Ended session ${sessionId} (Live → Ending → Ended). Active time ${ended.accumulatedActiveSeconds}s.`,
  });
  return { state: next };
}

/* ------------------- Run-of-Show Segment Services ------------------- */

export function createActivitySegment(
  state: PrototypeState,
  input: {
    sessionId: string;
    name: string;
    type: ActivitySegment["type"];
    teamIds?: string[];
    notes?: string;
  },
  operatorId: string = "system"
): { state: PrototypeState; segment?: ActivitySegment; error?: string } {
  if (!state.sessions.some((s) => s.id === input.sessionId)) return { state, error: "Session not found." };
  if (locked(state, input.sessionId)) return { state, error: "This session is closed." };
  const lss = selectLiveSessionState(state, input.sessionId);
  if (lss.status === "Ended") return { state, error: "The session has ended; steps can no longer be added." };
  const name = input.name?.trim() ?? "";
  if (name.length < 2) return { state, error: "Give the step a name." };

  const existing = (state.activitySegments ?? []).filter((s) => s.sessionId === input.sessionId);
  const seq = existing.reduce((m, s) => Math.max(m, s.sequence), 0) + 1;
  const now = new Date().toISOString();
  const newSeg: ActivitySegment = {
    id: `seg-${input.sessionId}-${seq}-${Date.now().toString(36)}`,
    sessionId: input.sessionId,
    name,
    type: input.type,
    sequence: seq,
    status: "Planned",
    teamIds: input.teamIds,
    notes: input.notes,
    createdAt: now,
    updatedAt: now,
  };

  let next = { ...state, activitySegments: [...(state.activitySegments ?? []), newSeg] };
  next = pushAudit(next, { sessionId: input.sessionId, action: "create-activity-segment", operatorId, description: `Added step '${name}' (#${seq}).` });
  return { state: next, segment: newSeg };
}

export function startActivitySegment(
  state: PrototypeState,
  sessionId: string,
  segmentId: string,
  operatorId: string = "system"
): { state: PrototypeState; error?: string } {
  const lss = selectLiveSessionState(state, sessionId);
  if (lss.status !== "Live") {
    return { state, error: lss.status === "Paused" || lss.status === "Emergency" ? "Resume the session before starting a step." : "Start the session clock before starting a step." };
  }
  const check = validateSegmentActivation(state, sessionId, segmentId);
  if (!check.isValid) return { state, error: check.error };

  const nowStr = new Date().toISOString();
  let next = {
    ...state,
    activitySegments: (state.activitySegments ?? []).map((s) =>
      s.id === segmentId && s.sessionId === sessionId ? { ...s, status: "Active" as const, actualStart: s.actualStart || nowStr, updatedAt: nowStr } : s
    ),
  };
  const seg = (state.activitySegments ?? []).find((s) => s.id === segmentId);
  next = pushAudit(next, { sessionId, action: "start-activity-segment", operatorId, description: `Started step '${seg?.name ?? segmentId}'.` });
  return { state: next };
}

export function completeActivitySegment(
  state: PrototypeState,
  sessionId: string,
  segmentId: string,
  operatorId: string = "system"
): { state: PrototypeState; error?: string } {
  const seg = (state.activitySegments ?? []).find((s) => s.id === segmentId && s.sessionId === sessionId);
  if (!seg) return { state, error: "Step not found." };
  if (seg.status !== "Active" && seg.status !== "Paused") return { state, error: `'${seg.name}' is not running.` };

  const nowStr = new Date().toISOString();
  let next = {
    ...state,
    activitySegments: (state.activitySegments ?? []).map((s) =>
      s.id === segmentId ? { ...s, status: "Completed" as const, actualEnd: nowStr, updatedAt: nowStr } : s
    ),
  };
  next = pushAudit(next, { sessionId, action: "complete-activity-segment", operatorId, description: `Finished step '${seg.name}'.` });
  return { state: next };
}

export function skipActivitySegment(
  state: PrototypeState,
  sessionId: string,
  segmentId: string,
  reason: string,
  operatorId: string = "system"
): { state: PrototypeState; error?: string } {
  if (!reason || reason.trim().length < MIN_REASON) return { state, error: `Give a reason (at least ${MIN_REASON} characters) for skipping the step.` };
  const seg = (state.activitySegments ?? []).find((s) => s.id === segmentId && s.sessionId === sessionId);
  if (!seg) return { state, error: "Step not found." };
  if (seg.status === "Completed" || seg.status === "Skipped" || seg.status === "Cancelled") return { state, error: `'${seg.name}' is already ${seg.status.toLowerCase()}.` };
  if (seg.status === "Active" || seg.status === "Paused") return { state, error: `'${seg.name}' is running. Finish it instead of skipping.` };
  if (locked(state, sessionId)) return { state, error: "This session is closed." };

  const nowStr = new Date().toISOString();
  let next = {
    ...state,
    activitySegments: (state.activitySegments ?? []).map((s) =>
      s.id === segmentId ? { ...s, status: "Skipped" as const, skipReason: reason.trim(), updatedAt: nowStr } : s
    ),
  };
  next = pushAudit(next, { sessionId, action: "skip-activity-segment", operatorId, description: `Skipped step '${seg.name}'. Reason: ${reason.trim()}` });
  return { state: next };
}

/* ------------------- Score & Outcome Result Services ------------------- */

export function createDraftResult(
  state: PrototypeState,
  params: {
    sessionId: string;
    segmentId: string;
    resultType: ResultType;
    teamScores?: TeamScore[];
    winnerTeamId?: string;
    outcome?: string;
    operatorId?: string;
  }
): { state: PrototypeState; error?: string } {
  const { sessionId, segmentId, resultType, teamScores, winnerTeamId, outcome, operatorId = "system" } = params;

  if (locked(state, sessionId)) return { state, error: "This session is closed; results are read-only." };
  const val = validateResultEntry(state, { sessionId, segmentId, resultType, teamScores, winnerTeamId, outcome });
  if (!val.isValid) return { state, error: val.error };

  const nowStr = new Date().toISOString();
  const initialRevision: ResultRevision = {
    revisionNumber: 1,
    resultType,
    teamScores,
    winnerTeamId,
    outcome,
    status: "Draft",
    recordedBy: operatorId,
    recordedAt: nowStr,
  };

  const existing = (state.segmentResults ?? []).find((r) => r.segmentId === segmentId);
  if (existing && existing.status === "Confirmed") {
    return { state, error: "This result is confirmed. Use Correct result and give a reason." };
  }

  const newResult: SegmentResult = {
    id: existing?.id || `res-${segmentId}`,
    sessionId,
    segmentId,
    resultType,
    teamScores,
    winnerTeamId,
    outcome,
    status: "Draft",
    recordedBy: operatorId,
    recordedAt: nowStr,
    revisions: existing ? [...existing.revisions, initialRevision] : [initialRevision],
    createdAt: existing?.createdAt || nowStr,
    updatedAt: nowStr,
  };

  const updatedResults = [
    ...(state.segmentResults ?? []).filter((r) => r.segmentId !== segmentId),
    newResult,
  ];

  let next = { ...state, segmentResults: updatedResults };

  next = pushAudit(next, {
    sessionId,
    action: "create-draft-result",
    operatorId,
    description: `Saved draft result for segment ${segmentId}`,
  });

  return { state: next };
}

export function confirmResult(
  state: PrototypeState,
  sessionId: string,
  segmentId: string,
  operatorId: string = "system"
): { state: PrototypeState; error?: string } {
  if (locked(state, sessionId)) return { state, error: "This session is closed; results are read-only." };
  const existing = (state.segmentResults ?? []).find((r) => r.segmentId === segmentId && r.sessionId === sessionId);
  if (!existing) return { state, error: "Save a draft result before confirming it." };
  if (existing.status !== "Draft") return { state, error: "This result is already confirmed." };

  const nowStr = new Date().toISOString();
  const updatedResult: SegmentResult = {
    ...existing,
    status: "Confirmed",
    updatedAt: nowStr,
  };

  const updatedResults = (state.segmentResults ?? []).map((r) =>
    r.id === existing.id ? updatedResult : r
  );

  let next = { ...state, segmentResults: updatedResults };

  next = pushAudit(next, {
    sessionId,
    action: "confirm-result",
    operatorId,
    description: `Confirmed final result for segment ${segmentId}`,
  });

  return { state: next };
}

/** Correction 6: Audited Result Revision Correction Flow */
export function correctResult(
  state: PrototypeState,
  params: {
    sessionId: string;
    segmentId: string;
    resultType: ResultType;
    teamScores?: TeamScore[];
    winnerTeamId?: string;
    outcome?: string;
    reason: string;
    operatorId?: string;
  }
): { state: PrototypeState; error?: string } {
  const { sessionId, segmentId, resultType, teamScores, winnerTeamId, outcome, reason, operatorId = "system" } = params;

  if (locked(state, sessionId)) return { state, error: "This session is closed; results are read-only." };
  const val = validateResultEntry(state, {
    sessionId,
    segmentId,
    resultType,
    teamScores,
    winnerTeamId,
    outcome,
    isCorrection: true,
    correctionReason: reason,
  });
  if (!val.isValid) return { state, error: val.error };

  const existing = (state.segmentResults ?? []).find((r) => r.segmentId === segmentId && r.sessionId === sessionId);
  if (!existing) return { state, error: "No result to correct." };
  if (existing.status === "Draft") return { state, error: "Draft results can be edited directly; corrections are for confirmed results." };

  const nowStr = new Date().toISOString();
  const nextRevNumber = existing.revisions.length + 1;

  const newRevision: ResultRevision = {
    revisionNumber: nextRevNumber,
    resultType,
    teamScores,
    winnerTeamId,
    outcome,
    status: "Corrected",
    recordedBy: operatorId,
    recordedAt: nowStr,
    reason: reason.trim(),
  };

  const correctedResult: SegmentResult = {
    ...existing,
    resultType,
    teamScores,
    winnerTeamId,
    outcome,
    status: "Corrected",
    correctedAt: nowStr,
    correctionReason: reason.trim(),
    revisions: [...existing.revisions, newRevision],
    updatedAt: nowStr,
  };

  const updatedResults = (state.segmentResults ?? []).map((r) =>
    r.id === existing.id ? correctedResult : r
  );

  let next = { ...state, segmentResults: updatedResults };

  next = pushAudit(next, {
    sessionId,
    action: "correct-result",
    operatorId,
    description: `Corrected result for segment ${segmentId} (Rev #${nextRevNumber}). Reason: ${reason}`,
  });

  return { state: next };
}

/* ------------------- Equipment & Notes Services ------------------- */

export function addLiveOperationalNote(
  state: PrototypeState,
  input: {
    sessionId: string;
    type: LiveNoteType;
    severity: LiveNoteSeverity;
    note: string;
    relatedSegmentId?: string;
    followUpRequired?: boolean;
  },
  operatorId: string = "system"
): { state: PrototypeState; note?: LiveOperationalNote; error?: string } {
  if (!input.note || input.note.trim().length < 3) return { state, error: "Write the note before saving it." };
  if (!state.sessions.some((s) => s.id === input.sessionId)) return { state, error: "Session not found." };
  if (locked(state, input.sessionId)) return { state, error: "This session is closed; notes are read-only." };

  const newNote: LiveOperationalNote = {
    id: `note-${input.sessionId}-${Date.now()}`,
    sessionId: input.sessionId,
    type: input.type,
    severity: input.severity,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    operatorId,
    relatedSegmentId: input.relatedSegmentId,
    note: input.note.trim(),
    resolutionState: "open",
    followUpRequired: input.followUpRequired ?? false,
    createdAt: new Date().toISOString(),
  };

  let next = {
    ...state,
    liveOperationalNotes: [...(state.liveOperationalNotes ?? []), newNote],
  };

  next = pushAudit(next, {
    sessionId: input.sessionId,
    action: "add-operational-note",
    operatorId,
    description: `Added ${input.severity} operational note (${input.type}): ${input.note}`,
  });

  return { state: next, note: newNote };
}

/** Correction 11: Equipment Counts & Status Validation */
export function updateEquipmentStatus(
  state: PrototypeState,
  params: {
    sessionId: string;
    equipmentId: string;
    status?: EquipmentItemStatus;
    issuedCount?: number;
    missingCount?: number;
    damagedCount?: number;
    returnedCount?: number;
    note?: string;
    operatorId?: string;
  }
): { state: PrototypeState; error?: string } {
  const { sessionId, equipmentId, status, issuedCount, missingCount, damagedCount, returnedCount, note, operatorId = "system" } = params;

  const existing = (state.equipmentCheckItems ?? []).find((e) => e.id === equipmentId && e.sessionId === sessionId);
  if (!existing) return { state, error: "Equipment item not found." };
  if (locked(state, sessionId)) return { state, error: "This session is closed; equipment records are read-only." };
  for (const [label, v] of [["Issued", issuedCount], ["Missing", missingCount], ["Damaged", damagedCount], ["Returned", returnedCount]] as const) {
    if (v !== undefined && (!Number.isInteger(v) || v < 0)) return { state, error: `${label} count must be a whole number of zero or more.` };
  }

  const newIssued = issuedCount ?? existing.issuedCount;
  const newMissing = missingCount ?? existing.missingCount;
  const newDamaged = damagedCount ?? existing.damagedCount;
  const newReturned = returnedCount ?? existing.returnedCount;
  const newStatus = status ?? existing.status;

  if (newIssued > existing.availableCount) {
    return { state, error: `Issued count (${newIssued}) cannot exceed available count (${existing.availableCount}).` };
  }
  if (newReturned > newIssued) {
    return { state, error: `Returned count (${newReturned}) cannot exceed issued count (${newIssued}).` };
  }
  if (newReturned + newMissing + newDamaged > newIssued) {
    return { state, error: `Returned, missing and damaged (${newReturned + newMissing + newDamaged}) cannot exceed issued (${newIssued}).` };
  }

  const nowStr = new Date().toISOString();
  const updatedItem: EquipmentCheckItem = {
    ...existing,
    status: newStatus,
    issuedCount: newIssued,
    missingCount: newMissing,
    damagedCount: newDamaged,
    returnedCount: newReturned,
    note: note ?? existing.note,
    updatedAt: nowStr,
  };

  const updatedItems = (state.equipmentCheckItems ?? []).map((e) =>
    e.id === equipmentId ? updatedItem : e
  );

  let next = { ...state, equipmentCheckItems: updatedItems };

  next = pushAudit(next, {
    sessionId,
    action: "update-equipment-status",
    operatorId,
    description: `Updated equipment '${existing.equipmentName}' to ${newStatus} (Issued: ${newIssued}, Returned: ${newReturned}, Missing: ${newMissing})`,
  });

  return { state: next };
}

/* ------------------- Session Completion & Snapshot ------------------- */

/**
 * Close the session and write its completion snapshot. The session must have
 * ended (Ended → Completed); unresolved checklist items need an audited reason.
 */
export function completeLiveSession(
  state: PrototypeState,
  sessionId: string,
  overrideReason?: string,
  operatorId: string = "system",
  closingNote?: string
): { state: PrototypeState; error?: string } {
  if (!state.sessions.some((s) => s.id === sessionId)) return { state, error: "Session not found." };
  const lss = selectLiveSessionState(state, sessionId);
  if (lss.status !== "Ended") {
    const t = validateStateTransition(lss.status, "Completed");
    return { state, error: lss.status === "Completed" ? "This session is already completed." : `End the session before completing it. ${t.error ?? ""}`.trim() };
  }
  const checklist = selectCompletionChecklist(state, sessionId);
  const override = overrideReason?.trim() ?? "";
  if (!checklist.isReadyToComplete) {
    if (!override) {
      return { state, error: `Completion blocked by checklist items: ${checklist.criticalBlockers.join("; ")}. Give an override reason to complete anyway.` };
    }
    if (override.length < MIN_REASON) return { state, error: `The override reason must be at least ${MIN_REASON} characters.` };
  }

  const summary = selectSessionSummary(state, sessionId);
  const nowStr = new Date().toISOString();

  const snapshot: SessionCompletionSnapshot = {
    sessionId,
    completedAt: nowStr,
    completedBy: operatorId,
    attendanceTotals: {
      expected: summary.checkIn.expectedCount,
      checkedIn: summary.checkIn.checkedInCount,
      late: summary.checkIn.lateCount,
      missing: summary.checkIn.missingCount,
      noShow: summary.checkIn.noShowCount,
      denied: summary.checkIn.deniedCount,
      fillRate: summary.checkIn.expectedCount > 0 ? Math.round(((summary.checkIn.checkedInCount + summary.checkIn.lateCount) / summary.checkIn.expectedCount) * 100) : 0,
    },
    durationSeconds: summary.durationSeconds,
    finalResults: summary.results,
    financialSummary: {
      grossRevenue: summary.money.grossCollected,
      refundsTotal: summary.money.totalRefunded,
      netTake: summary.money.netRevenue,
    },
    staffSummary: {
      leadCoordinator: summary.staff.leadCoordinator?.name || "Unassigned",
      safetyContact: summary.staff.safetyContact?.name || "Unassigned",
      staffCheckedIn: summary.staff.presentCount,
    },
    equipmentExceptions: summary.eq.items.filter((e) => e.missingCount > 0 || e.damagedCount > 0),
    safetySignals: (state.liveOperationalNotes ?? [])
      .filter((n) => n.sessionId === sessionId && (n.type === "safety" || n.severity === "critical"))
      .map((n) => `${n.time} — ${n.note}`),
    followUpItems: (state.liveOperationalNotes ?? []).filter((n) => n.sessionId === sessionId && n.followUpRequired).map((n) => n.note),
    label: "Completion snapshot recorded in this workspace",
    closingNote: closingNote?.trim() || undefined,
    overrideReason: !checklist.isReadyToComplete ? override : undefined,
  };

  const updatedLss: LiveSessionState = {
    ...lss,
    status: "Completed",
    completedAt: nowStr,
    updatedAt: nowStr,
  };

  const updatedSessions = state.sessions.map((s) =>
    s.id === sessionId ? { ...s, status: "completed" as const } : s
  );

  let next: PrototypeState = {
    ...state,
    sessions: updatedSessions,
    liveSessionStates: [
      ...(state.liveSessionStates ?? []).filter((l) => l.sessionId !== sessionId),
      updatedLss,
    ],
    sessionCompletionSnapshots: [
      ...(state.sessionCompletionSnapshots ?? []).filter((s) => s.sessionId !== sessionId),
      snapshot,
    ],
  };

  next = pushAudit(next, {
    sessionId,
    action: "complete-session",
    operatorId,
    description: !checklist.isReadyToComplete
      ? `Completed session ${sessionId} with override (${checklist.criticalBlockers.join("; ")}). Reason: ${override}`
      : `Completed session ${sessionId} and saved its completion snapshot.`,
  });

  return { state: next };
}
