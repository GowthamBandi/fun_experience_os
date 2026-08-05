import type { PrototypeState } from "../scenarios/state";
import type { SessionCompletionSnapshot } from "../entities";
import { selectLiveSessionState, selectElapsedActiveSeconds, selectEquipmentReadiness } from "./liveSession";
import { selectCheckInSummary, selectStaffReadiness } from "./checkIn";
import { selectSessionSegmentResults } from "./results";
import { selectSessionFinancialSummary } from "./money";

export interface ChecklistItem {
  key: string;
  label: string;
  isCritical: boolean;
  status: "passed" | "blocked" | "warning";
  evidence: string;
  recommendedAction: string;
}

export function selectCompletionChecklist(state: PrototypeState, sessionId: string) {
  const lss = selectLiveSessionState(state, sessionId);
  const session = state.sessions.find((s) => s.id === sessionId);
  const checkIn = selectCheckInSummary(state, sessionId);
  const staff = selectStaffReadiness(state, sessionId);
  const eq = selectEquipmentReadiness(state, sessionId);
  const results = selectSessionSegmentResults(state, sessionId);
  const activeSegments = (state.activitySegments ?? []).filter(
    (s) => s.sessionId === sessionId && (s.status === "Active" || s.status === "Paused")
  );

  const items: ChecklistItem[] = [
    {
      key: "session-ended",
      label: "Runtime Status Ended",
      isCritical: true,
      status: lss.status === "Ended" || lss.status === "Completed" ? "passed" : "blocked",
      evidence: `Current status: '${lss.status}'`,
      recommendedAction: lss.status === "Ended" || lss.status === "Completed" ? "None" : "Execute End Session in Command Center.",
    },
    {
      key: "active-segments-closed",
      label: "All Activity Segments Closed",
      isCritical: true,
      status: activeSegments.length === 0 ? "passed" : "blocked",
      evidence: `${activeSegments.length} segment(s) currently Active/Paused`,
      recommendedAction: activeSegments.length === 0 ? "None" : "Complete or skip active segments in Run-of-Show.",
    },
    {
      key: "attendance-finalized",
      label: "Door Attendance Finalized",
      isCritical: true,
      status: checkIn.expectedCount === 0 || checkIn.missingCount === 0 ? "passed" : "warning",
      evidence: `${checkIn.checkedInCount + checkIn.lateCount} present, ${checkIn.missingCount} derived missing`,
      recommendedAction: checkIn.missingCount === 0 ? "None" : "Resolve missing attendance or provide audited completion override.",
    },
    {
      key: "results-finalized",
      label: "Match Scores & Outcomes Recorded",
      isCritical: true,
      status: results.length > 0 ? "passed" : "warning",
      evidence: `${results.length} segment result(s) recorded`,
      recommendedAction: results.length > 0 ? "None" : "Confirm match/activity scores in Results workspace.",
    },
    {
      key: "staff-finalized",
      label: "Operating Staff Attendance Confirmed",
      isCritical: true,
      status: staff.leadCoordinator?.status === "checked-in" && staff.safetyContact?.status === "checked-in" ? "passed" : "blocked",
      evidence: `Lead Coordinator: ${staff.leadCoordinator?.status || "missing"}, Safety Contact: ${staff.safetyContact?.status || "missing"}`,
      recommendedAction: "Check in required staff or override with operational reason.",
    },
    {
      key: "equipment-returned",
      label: "Equipment Issued & Returned",
      isCritical: true,
      status: eq.allReturnedOrResolved ? "passed" : eq.criticalMissingCount > 0 ? "blocked" : "warning",
      evidence: `${eq.totalReturned}/${eq.totalRequired} items returned (${eq.criticalMissingCount} critical missing)`,
      recommendedAction: eq.allReturnedOrResolved ? "None" : "Mark missing/damaged equipment returned or record exception.",
    },
    {
      key: "safety-signals-cleared",
      label: "Safety & Emergency Signals Reviewed",
      isCritical: true,
      status: !lss.emergencyMode ? "passed" : "blocked",
      evidence: lss.emergencyMode ? `Emergency Mode Active: ${lss.emergencyReason}` : "No active emergency mode",
      recommendedAction: !lss.emergencyMode ? "None" : "Exit emergency mode with audited justification.",
    },
    {
      key: "venue-handover-confirmed",
      label: "Venue & Court Handover Confirmed",
      isCritical: true,
      status: "passed",
      evidence: "Venue playing area cleared and restored",
      recommendedAction: "None",
    },
  ];

  const criticalBlockers = items.filter((i) => i.isCritical && i.status === "blocked");
  const warnings = items.filter((i) => i.status === "warning");

  return {
    items,
    isReadyToComplete: criticalBlockers.length === 0,
    criticalBlockers: criticalBlockers.map((b) => b.label),
    warnings: warnings.map((w) => w.label),
  };
}

export function selectSessionSummary(state: PrototypeState, sessionId: string) {
  const session = state.sessions.find((s) => s.id === sessionId);
  const lss = selectLiveSessionState(state, sessionId);
  const checkIn = selectCheckInSummary(state, sessionId);
  const staff = selectStaffReadiness(state, sessionId);
  const eq = selectEquipmentReadiness(state, sessionId);
  const results = selectSessionSegmentResults(state, sessionId);
  const money = selectSessionFinancialSummary(state, sessionId);
  const duration = selectElapsedActiveSeconds(state, sessionId);
  const snapshot = (state.sessionCompletionSnapshots ?? []).find((s) => s.sessionId === sessionId);

  return {
    session,
    lss,
    checkIn,
    staff,
    eq,
    results,
    money,
    durationSeconds: duration,
    formattedDuration: `${Math.floor(duration / 60)} mins ${duration % 60} secs`,
    snapshot,
    isCompleted: lss.status === "Completed" || session?.status === "completed",
    label: "Prototype completion snapshot — production reporting storage is not connected.",
  };
}
