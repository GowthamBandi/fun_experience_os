import type { PrototypeState } from "../scenarios/state";
import type { LiveSessionState, ActivitySegment } from "../entities";
import { selectSessionOpenReadiness } from "./checkIn";

export function selectLiveSessionState(state: PrototypeState, sessionId: string): LiveSessionState {
  const existing = (state.liveSessionStates ?? []).find((l) => l.sessionId === sessionId);
  if (existing) return existing;

  const session = state.sessions.find((s) => s.id === sessionId);
  return {
    id: `lss-${sessionId}`,
    sessionId,
    // A session completed outside the live workflow is read-only here too.
    status: session?.status === "completed" ? "Completed" : "Ready",
    accumulatedActiveSeconds: 0,
    emergencyMode: false,
    currentStage: "Pre-session handover",
    operationalOwnerId: session?.leadCoordinatorId ?? "",
    updatedAt: new Date(0).toISOString(),
  };
}

/** Active running time: banked seconds plus the current live interval. Never double-counts across reloads. */
export function selectElapsedActiveSeconds(state: PrototypeState, sessionId: string, nowMs: number = Date.now()): number {
  const lss = selectLiveSessionState(state, sessionId);
  const base = lss.accumulatedActiveSeconds ?? 0;

  if (lss.status === "Live" && lss.activeStartedAt) {
    const started = new Date(lss.activeStartedAt).getTime();
    if (!isNaN(started) && nowMs >= started) return base + Math.floor((nowMs - started) / 1000);
  }
  return base;
}

export function selectCurrentActivitySegment(state: PrototypeState, sessionId: string): ActivitySegment | undefined {
  const segments = (state.activitySegments ?? []).filter((s) => s.sessionId === sessionId).sort((a, b) => a.sequence - b.sequence);
  return segments.find((s) => s.status === "Active") ?? segments.find((s) => s.status === "Paused") ?? segments.find((s) => s.status === "Ready");
}

export function selectSegmentProgress(state: PrototypeState, sessionId: string) {
  const segments = (state.activitySegments ?? []).filter((s) => s.sessionId === sessionId);
  const completed = segments.filter((s) => s.status === "Completed" || s.status === "Skipped").length;
  const total = segments.length;
  return { total, completed, percent: total > 0 ? Math.round((completed / total) * 100) : 0 };
}

export function selectEquipmentReadiness(state: PrototypeState, sessionId: string) {
  const items = (state.equipmentCheckItems ?? []).filter((e) => e.sessionId === sessionId);
  const criticalMissing = items.filter((e) => e.isCritical && e.missingCount > 0);
  const totalRequired = items.reduce((sum, e) => sum + e.requiredCount, 0);
  const totalReturned = items.reduce((sum, e) => sum + e.returnedCount, 0);
  const outstanding = items.filter((e) => e.issuedCount !== e.returnedCount + e.missingCount + e.damagedCount);

  return {
    items,
    isReady: criticalMissing.length === 0,
    criticalMissingCount: criticalMissing.length,
    criticalMissingNames: criticalMissing.map((e) => e.equipmentName),
    totalRequired,
    totalReturned,
    outstandingCount: outstanding.length,
    exceptionCount: items.filter((e) => e.missingCount > 0 || e.damagedCount > 0).length,
    allReturnedOrResolved: outstanding.length === 0,
  };
}

export function selectLiveSessionActionAvailability(state: PrototypeState, sessionId: string) {
  const lss = selectLiveSessionState(state, sessionId);
  const handover = selectSessionOpenReadiness(state, sessionId);
  const eq = selectEquipmentReadiness(state, sessionId);
  const session = state.sessions.find((s) => s.id === sessionId);

  const isCompleted = lss.status === "Completed" || session?.status === "completed";
  const isCancelled = session?.status === "cancelled";
  const locked = isCompleted || isCancelled;

  return {
    canOpen: lss.status === "Ready" && eq.isReady && !locked,
    /** Opening needs an audited override when the handover checks are blocked. */
    openNeedsOverride: handover.status === "Blocked",
    canStart: lss.status === "Opening" && eq.isReady && !locked,
    canPause: lss.status === "Live" && !locked,
    canResume: lss.status === "Paused" && !lss.emergencyMode && !locked,
    canEmergency: (lss.status === "Live" || lss.status === "Paused") && !locked,
    canExitEmergency: lss.status === "Emergency",
    canEndSession: (lss.status === "Live" || lss.status === "Paused") && !locked,
    canCompleteSession: lss.status === "Ended" && !locked,
    hasStarted: lss.status !== "Ready" && lss.status !== "Opening",
    isRunning: lss.status === "Live" || lss.status === "Paused" || lss.status === "Emergency",
    isEnded: lss.status === "Ended" || lss.status === "Completed",
    isReadOnly: locked,
  };
}
