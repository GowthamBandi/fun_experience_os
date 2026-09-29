import type { PrototypeState } from "../scenarios/state";
import { selectLiveSessionState, selectElapsedActiveSeconds, selectEquipmentReadiness } from "./liveSession";
import { selectCheckInSummary, selectStaffReadiness } from "./checkIn";
import { selectResultsProgress, selectSessionSegmentResults } from "./results";
import { selectSessionFinancialSummary } from "./money";

export interface ChecklistItem {
  key: string;
  label: string;
  isCritical: boolean;
  status: "passed" | "blocked" | "warning";
  evidence: string;
  recommendedAction: string;
  /** Workspace tab where the item is resolved. */
  fixTab?: "live" | "check-in" | "results";
}

export function selectCompletionChecklist(state: PrototypeState, sessionId: string) {
  const lss = selectLiveSessionState(state, sessionId);
  const checkIn = selectCheckInSummary(state, sessionId);
  const staff = selectStaffReadiness(state, sessionId);
  const eq = selectEquipmentReadiness(state, sessionId);
  const results = selectResultsProgress(state, sessionId);
  const openSegments = results.segments.filter((s) => s.status === "Active" || s.status === "Paused");
  const ended = lss.status === "Ended" || lss.status === "Completed";

  const items: ChecklistItem[] = [
    {
      key: "session-ended",
      label: "Session ended",
      isCritical: true,
      status: ended ? "passed" : "blocked",
      evidence: ended ? "The clock is stopped." : `The session is ${lss.status.toLowerCase()}.`,
      recommendedAction: ended ? "" : "End the session on the Run tab.",
      fixTab: "live",
    },
    {
      key: "active-segments-closed",
      label: "All steps closed",
      isCritical: true,
      status: openSegments.length === 0 ? "passed" : "blocked",
      evidence: openSegments.length === 0 ? "No step is running." : `${openSegments.map((s) => s.name).join(", ")} still open.`,
      recommendedAction: openSegments.length === 0 ? "" : "Finish or skip the open step on the Run tab.",
      fixTab: "live",
    },
    {
      key: "results-finalized",
      label: "Results confirmed",
      isCritical: true,
      status: results.isComplete ? "passed" : "blocked",
      evidence:
        results.requiredCount === 0
          ? "No scored steps ran."
          : `${results.confirmedCount} of ${results.requiredCount} scored steps confirmed.`,
      recommendedAction: results.isComplete ? "" : "Confirm the outstanding results on the Results tab.",
      fixTab: "results",
    },
    {
      key: "attendance-finalized",
      label: "Attendance settled",
      isCritical: false,
      status: checkIn.awaitingCount === 0 ? "passed" : "warning",
      evidence: `${checkIn.presentCount} present · ${checkIn.noShowCount} no-show · ${checkIn.awaitingCount} not marked`,
      recommendedAction: checkIn.awaitingCount === 0 ? "" : "Mark the remaining participants as no-show or checked in.",
      fixTab: "check-in",
    },
    {
      key: "staff-finalized",
      label: "Lead and safety staff checked in",
      isCritical: true,
      status: staff.isLeadPresent && staff.isSafetyPresent ? "passed" : "blocked",
      evidence: `Lead: ${staff.leadCoordinator ? `${staff.leadCoordinator.name} (${staff.leadCoordinator.status.replace(/-/g, " ")})` : "not assigned"} · Safety: ${
        staff.safetyContact ? `${staff.safetyContact.name} (${staff.safetyContact.status.replace(/-/g, " ")})` : "not assigned"
      }`,
      recommendedAction: staff.isStaffReady ? "" : "Check in the required staff on the Check-in tab, or complete with an override reason.",
      fixTab: "check-in",
    },
    {
      key: "equipment-returned",
      label: "Equipment returned or accounted for",
      isCritical: true,
      status: eq.allReturnedOrResolved && eq.criticalMissingCount === 0 ? "passed" : eq.criticalMissingCount > 0 ? "blocked" : "warning",
      evidence:
        eq.items.length === 0
          ? "No equipment tracked for this session."
          : `${eq.totalReturned}/${eq.totalRequired} returned · ${eq.exceptionCount} exception(s) · ${eq.criticalMissingCount} critical missing`,
      recommendedAction: eq.allReturnedOrResolved ? "" : "Record returned, missing or damaged counts on the Run tab.",
      fixTab: "live",
    },
    {
      key: "safety-signals-cleared",
      label: "No active emergency",
      isCritical: true,
      status: !lss.emergencyMode ? "passed" : "blocked",
      evidence: lss.emergencyMode ? `Emergency active: ${lss.emergencyReason}` : "No emergency in progress.",
      recommendedAction: !lss.emergencyMode ? "" : "Close the emergency with a reason on the Run tab.",
      fixTab: "live",
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

export function formatDuration(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s} s`;
  return `${s} s`;
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
    formattedDuration: formatDuration(duration),
    snapshot,
    isCompleted: lss.status === "Completed" || session?.status === "completed",
  };
}
