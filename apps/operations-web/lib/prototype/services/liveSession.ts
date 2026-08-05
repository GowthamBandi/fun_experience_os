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
} from "../validators/liveSessionValidation";
import { selectLiveSessionState, selectElapsedActiveSeconds } from "../selectors/liveSession";
import { selectCompletionChecklist, selectSessionSummary } from "../selectors/completion";
import { selectCheckInSummary, selectStaffReadiness } from "../selectors/checkIn";
import { pushAudit, pushSignal } from "./helpers";

/** Correction 1: Live Clock Calculation & Transition Engine */
export function openSession(
  state: PrototypeState,
  sessionId: string,
  operatorId: string = "op-master"
): { state: PrototypeState; error?: string } {
  const lss = selectLiveSessionState(state, sessionId);
  const check = validateStateTransition(lss.status, "Opening");
  if (!check.isValid) return { state, error: check.error };

  const now = new Date().toISOString();
  const updatedLss: LiveSessionState = {
    ...lss,
    status: "Opening",
    updatedAt: now,
  };

  const updatedSessions = state.sessions.map((s) =>
    s.id === sessionId ? { ...s, status: "live" as const } : s
  );

  let next: PrototypeState = {
    ...state,
    sessions: updatedSessions,
    liveSessionStates: [
      ...(state.liveSessionStates ?? []).filter((l) => l.sessionId !== sessionId),
      updatedLss,
    ],
  };

  next = pushAudit(next, {
    sessionId,
    action: "open-session",
    operatorId,
    description: `Opened live session workspace for session ${sessionId}`,
  });

  return { state: next };
}

export function startLiveSession(
  state: PrototypeState,
  sessionId: string,
  operatorId: string = "op-master"
): { state: PrototypeState; error?: string } {
  const lss = selectLiveSessionState(state, sessionId);
  const targetStatus = lss.status === "Ready" ? "Opening" : lss.status;

  if (targetStatus === "Opening") {
    const openRes = openSession(state, sessionId, operatorId);
    if (openRes.error) return openRes;
    state = openRes.state;
  }

  const currentLss = selectLiveSessionState(state, sessionId);
  const now = new Date().toISOString();

  const updatedLss: LiveSessionState = {
    ...currentLss,
    status: "Live",
    activeStartedAt: now,
    pausedAt: undefined,
    resumedAt: now,
    updatedAt: now,
  };

  const updatedSessions = state.sessions.map((s) =>
    s.id === sessionId ? { ...s, status: "live" as const } : s
  );

  let next: PrototypeState = {
    ...state,
    sessions: updatedSessions,
    liveSessionStates: [
      ...(state.liveSessionStates ?? []).filter((l) => l.sessionId !== sessionId),
      updatedLss,
    ],
  };

  next = pushAudit(next, {
    sessionId,
    action: "start-live-session",
    operatorId,
    description: `Started live session clock for session ${sessionId}`,
  });

  next = pushSignal(next, {
    kind: "system",
    sessionId,
    message: `Live session ${sessionId} clock started`,
    at: "Just now",
  });

  return { state: next };
}

/** Correction 1: Pause Live Session without Double-Counting */
export function pauseLiveSession(
  state: PrototypeState,
  sessionId: string,
  reason: string,
  operatorId: string = "op-master"
): { state: PrototypeState; error?: string } {
  if (!reason || !reason.trim()) {
    return { state, error: "Mandatory operational pause reason is required." };
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
  operatorId: string = "op-master"
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

  if (!reason || !reason.trim() || !immediateAction || !immediateAction.trim()) {
    return { state, error: "Mandatory emergency reason and immediate action are required." };
  }

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
    action: "enter-emergency-mode",
    operatorId,
    description: `EMERGENCY MODE ACTIVATED: ${reason}. Action: ${immediateAction}`,
  });

  next = pushSignal(next, {
    kind: "alert",
    sessionId,
    message: `SAFETY EMERGENCY SIGNAL: ${reason}`,
    at: "Just now",
  });

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

  if (!exitReason || !exitReason.trim()) {
    return { state, error: "Mandatory emergency exit justification is required." };
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
    pauseReason: `Post-Emergency Hold: ${exitReason.trim()}`,
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
    description: `Exited emergency mode to Paused state: ${exitReason}`,
  });

  return { state: next };
}

/** Correction 12: End Session Workflow */
export function endLiveSession(
  state: PrototypeState,
  sessionId: string,
  operatorId: string = "op-master"
): { state: PrototypeState; error?: string } {
  const lss = selectLiveSessionState(state, sessionId);
  const check = validateStateTransition(lss.status, "Ending");
  if (!check.isValid) return { state, error: check.error };

  const now = new Date();
  const nowStr = now.toISOString();

  let activeDelta = 0;
  if (lss.activeStartedAt) {
    const startMs = new Date(lss.activeStartedAt).getTime();
    if (!isNaN(startMs) && now.getTime() >= startMs) {
      activeDelta = Math.floor((now.getTime() - startMs) / 1000);
    }
  }

  const updatedLss: LiveSessionState = {
    ...lss,
    status: "Ended",
    accumulatedActiveSeconds: (lss.accumulatedActiveSeconds ?? 0) + activeDelta,
    activeStartedAt: undefined,
    endedAt: nowStr,
    updatedAt: nowStr,
  };

  // Close active or paused segments
  const updatedSegments = (state.activitySegments ?? []).map((s) =>
    s.sessionId === sessionId && (s.status === "Active" || s.status === "Paused")
      ? { ...s, status: "Completed" as const, actualEnd: nowStr, updatedAt: nowStr }
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
    action: "end-live-session",
    operatorId,
    description: `Ended live session operations for session ${sessionId}. Total duration: ${updatedLss.accumulatedActiveSeconds}s`,
  });

  return { state: next };
}

/* ------------------- Run-of-Show Segment Services ------------------- */

export function createActivitySegment(
  state: PrototypeState,
  input: {
    sessionId: string;
    name: string;
    type: any;
    teamIds?: string[];
    notes?: string;
  },
  operatorId: string = "op-master"
): { state: PrototypeState; segment?: ActivitySegment; error?: string } {
  const existing = (state.activitySegments ?? []).filter((s) => s.sessionId === input.sessionId);
  const seq = existing.length + 1;

  const newSeg: ActivitySegment = {
    id: `seg-${input.sessionId}-${seq}-${Date.now()}`,
    sessionId: input.sessionId,
    name: input.name,
    type: input.type,
    sequence: seq,
    status: "Planned",
    teamIds: input.teamIds,
    notes: input.notes,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  let next = {
    ...state,
    activitySegments: [...(state.activitySegments ?? []), newSeg],
  };

  next = pushAudit(next, {
    sessionId: input.sessionId,
    action: "create-activity-segment",
    operatorId,
    description: `Created run-of-show segment '${newSeg.name}' (#${seq})`,
  });

  return { state: next, segment: newSeg };
}

export function startActivitySegment(
  state: PrototypeState,
  sessionId: string,
  segmentId: string,
  operatorId: string = "op-master"
): { state: PrototypeState; error?: string } {
  const check = validateSegmentActivation(state, sessionId, segmentId);
  if (!check.isValid) return { state, error: check.error };

  const nowStr = new Date().toISOString();
  const updatedSegments = (state.activitySegments ?? []).map((s) =>
    s.id === segmentId && s.sessionId === sessionId
      ? { ...s, status: "Active" as const, actualStart: s.actualStart || nowStr, updatedAt: nowStr }
      : s
  );

  let next = { ...state, activitySegments: updatedSegments };

  next = pushAudit(next, {
    sessionId,
    action: "start-activity-segment",
    operatorId,
    description: `Started activity segment ${segmentId}`,
  });

  return { state: next };
}

export function completeActivitySegment(
  state: PrototypeState,
  sessionId: string,
  segmentId: string,
  operatorId: string = "op-master"
): { state: PrototypeState; error?: string } {
  const nowStr = new Date().toISOString();
  const updatedSegments = (state.activitySegments ?? []).map((s) =>
    s.id === segmentId && s.sessionId === sessionId
      ? { ...s, status: "Completed" as const, actualEnd: nowStr, updatedAt: nowStr }
      : s
  );

  let next = { ...state, activitySegments: updatedSegments };

  next = pushAudit(next, {
    sessionId,
    action: "complete-activity-segment",
    operatorId,
    description: `Completed activity segment ${segmentId}`,
  });

  return { state: next };
}

export function skipActivitySegment(
  state: PrototypeState,
  sessionId: string,
  segmentId: string,
  reason: string,
  operatorId: string = "op-master"
): { state: PrototypeState; error?: string } {
  if (!reason || !reason.trim()) {
    return { state, error: "Mandatory skip reason is required." };
  }

  const nowStr = new Date().toISOString();
  const updatedSegments = (state.activitySegments ?? []).map((s) =>
    s.id === segmentId && s.sessionId === sessionId
      ? { ...s, status: "Skipped" as const, skipReason: reason.trim(), updatedAt: nowStr }
      : s
  );

  let next = { ...state, activitySegments: updatedSegments };

  next = pushAudit(next, {
    sessionId,
    action: "skip-activity-segment",
    operatorId,
    description: `Skipped activity segment ${segmentId}: ${reason}`,
  });

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
  const { sessionId, segmentId, resultType, teamScores, winnerTeamId, outcome, operatorId = "op-master" } = params;

  const val = validateResultEntry(state, { sessionId, segmentId, resultType, teamScores, winnerTeamId });
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
    return { state, error: "Confirmed result cannot be silently overwritten. Use Correct Result workflow." };
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
  operatorId: string = "op-master"
): { state: PrototypeState; error?: string } {
  const existing = (state.segmentResults ?? []).find((r) => r.segmentId === segmentId && r.sessionId === sessionId);
  if (!existing) return { state, error: "No draft result found to confirm." };

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
  const { sessionId, segmentId, resultType, teamScores, winnerTeamId, outcome, reason, operatorId = "op-master" } = params;

  const val = validateResultEntry(state, {
    sessionId,
    segmentId,
    resultType,
    teamScores,
    winnerTeamId,
    isCorrection: true,
    correctionReason: reason,
  });

  if (!val.isValid) return { state, error: val.error };

  const existing = (state.segmentResults ?? []).find((r) => r.segmentId === segmentId && r.sessionId === sessionId);
  if (!existing) return { state, error: "No existing result record found to correct." };

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
  operatorId: string = "op-master"
): { state: PrototypeState; note?: LiveOperationalNote; error?: string } {
  if (!input.note || !input.note.trim()) {
    return { state, error: "Operational note content is required." };
  }

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
  const { sessionId, equipmentId, status, issuedCount, missingCount, damagedCount, returnedCount, note, operatorId = "op-master" } = params;

  const existing = (state.equipmentCheckItems ?? []).find((e) => e.id === equipmentId && e.sessionId === sessionId);
  if (!existing) return { state, error: "Equipment item not found." };

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
  if (newMissing < 0 || newDamaged < 0) {
    return { state, error: "Missing and damaged counts cannot be negative." };
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

/** Correction 14 & 15: Session Completion & Snapshot Creation */
export function completeLiveSession(
  state: PrototypeState,
  sessionId: string,
  overrideReason?: string,
  operatorId: string = "op-master"
): { state: PrototypeState; error?: string } {
  const lss = selectLiveSessionState(state, sessionId);
  const checklist = selectCompletionChecklist(state, sessionId);

  if (!checklist.isReadyToComplete && (!overrideReason || !overrideReason.trim())) {
    return {
      state,
      error: `Completion blocked by checklist items: ${checklist.criticalBlockers.join("; ")}. Provide an audited override reason to proceed.`,
    };
  }

  const summary = selectSessionSummary(state, sessionId);
  const nowStr = new Date().toISOString();

  // Create Prototype Completion Snapshot per Correction 15
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
      staffCheckedIn: (summary.staff.leadCoordinator?.status === "checked-in" ? 1 : 0) + (summary.staff.safetyContact?.status === "checked-in" ? 1 : 0),
    },
    equipmentExceptions: summary.eq.items.filter((e) => e.missingCount > 0 || e.damagedCount > 0),
    safetySignals: lss.emergencyReason ? [lss.emergencyReason] : [],
    followUpItems: (state.liveOperationalNotes ?? []).filter((n) => n.sessionId === sessionId && n.followUpRequired).map((n) => n.note),
    label: "Prototype completion snapshot — production reporting storage is not connected.",
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
    description: overrideReason
      ? `Completed session ${sessionId} with audited override: ${overrideReason}`
      : `Completed session ${sessionId} and generated immutable completion snapshot`,
  });

  return { state: next };
}
