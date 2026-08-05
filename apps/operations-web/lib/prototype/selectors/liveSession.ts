import type { PrototypeState } from "../scenarios/state";
import type { LiveSessionState, ActivitySegment, EquipmentCheckItem } from "../entities";
import { selectSessionOpenReadiness } from "./checkIn";

export function selectLiveSessionState(state: PrototypeState, sessionId: string): LiveSessionState {
  const existing = (state.liveSessionStates ?? []).find((l) => l.sessionId === sessionId);
  if (existing) return existing;

  // Fallback default LiveSessionState
  return {
    id: `lss-${sessionId}`,
    sessionId,
    status: "Ready",
    accumulatedActiveSeconds: 0,
    emergencyMode: false,
    currentStage: "Pre-session Handover",
    operationalOwnerId: "op-master",
    updatedAt: new Date().toISOString(),
  };
}

/** Correction 1: Exact Clock Equation (Prevents double counting across refresh) */
export function selectElapsedActiveSeconds(state: PrototypeState, sessionId: string): number {
  const lss = selectLiveSessionState(state, sessionId);
  const base = lss.accumulatedActiveSeconds ?? 0;

  if (lss.status === "Live" && lss.activeStartedAt) {
    const started = new Date(lss.activeStartedAt).getTime();
    const now = Date.now();
    if (!isNaN(started) && now >= started) {
      const activeDelta = Math.floor((now - started) / 1000);
      return base + activeDelta;
    }
  }

  return base;
}

export function selectCurrentActivitySegment(state: PrototypeState, sessionId: string): ActivitySegment | undefined {
  const segments = (state.activitySegments ?? []).filter((s) => s.sessionId === sessionId);
  return segments.find((s) => s.status === "Active") ?? segments.find((s) => s.status === "Paused") ?? segments.find((s) => s.status === "Ready");
}

export function selectSegmentProgress(state: PrototypeState, sessionId: string) {
  const segments = (state.activitySegments ?? []).filter((s) => s.sessionId === sessionId);
  const completed = segments.filter((s) => s.status === "Completed" || s.status === "Skipped").length;
  const total = segments.length;
  return {
    total,
    completed,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

export function selectEquipmentReadiness(state: PrototypeState, sessionId: string) {
  const items = (state.equipmentCheckItems ?? []).filter((e) => e.sessionId === sessionId);
  const criticalMissing = items.filter((e) => e.isCritical && e.missingCount > 0);
  const totalRequired = items.reduce((sum, e) => sum + e.requiredCount, 0);
  const totalReturned = items.reduce((sum, e) => sum + e.returnedCount, 0);

  return {
    items,
    isReady: criticalMissing.length === 0,
    criticalMissingCount: criticalMissing.length,
    criticalMissingNames: criticalMissing.map((e) => e.equipmentName),
    totalRequired,
    totalReturned,
    allReturnedOrResolved: items.every((e) => e.issuedCount === e.returnedCount + e.missingCount + e.damagedCount),
  };
}

export function selectLiveSessionActionAvailability(state: PrototypeState, sessionId: string) {
  const lss = selectLiveSessionState(state, sessionId);
  const handover = selectSessionOpenReadiness(state, sessionId);
  const eq = selectEquipmentReadiness(state, sessionId);
  const session = state.sessions.find((s) => s.id === sessionId);

  const isCompleted = lss.status === "Completed" || session?.status === "completed";
  const isEnded = lss.status === "Ended" || lss.status === "Completed";

  return {
    canOpen: lss.status === "Ready" && handover.status !== "Blocked" && eq.isReady && !isCompleted,
    canStart: (lss.status === "Opening" || lss.status === "Ready") && eq.isReady && !isCompleted,
    canPause: lss.status === "Live" && !isCompleted,
    canResume: lss.status === "Paused" && !lss.emergencyMode && !isCompleted,
    canEmergency: (lss.status === "Live" || lss.status === "Paused") && !isCompleted,
    canExitEmergency: lss.status === "Emergency",
    canEndSession: (lss.status === "Live" || lss.status === "Paused") && !isCompleted,
    canCompleteSession: (lss.status === "Ended") && !isCompleted,
    isReadOnly: isCompleted,
  };
}
