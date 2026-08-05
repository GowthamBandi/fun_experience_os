import type { PrototypeState } from "../scenarios/state";
import { sessionCapacityLedger } from "./capacity";

export interface OperationsAlert {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  type:
    | "capacity-warning"
    | "venue-overbooked"
    | "heavy-waitlist"
    | "refund-spike"
    | "payment-failure-spike"
    | "below-breakeven"
    | "crew-shortage"
    | "revenue-risk"
    | "identity-generation-incomplete"
    | "unassigned-participants"
    | "reveal-blocked"
    | "checkin-below-minimum"
    | "session-unopened"
    | "session-running-late"
    | "minimum-attendance-risk"
    | "missing-staff"
    | "critical-equipment-missing"
    | "session-paused-too-long"
    | "emergency-active"
    | "result-incomplete"
    | "completion-blocked";
  title: string;
  trigger: string;
  evidence: string;
  impact: string;
  recommendedAction: string;
  relatedEntityIds: string[];
  generatedAt: string;
  status: "active" | "acknowledged" | "resolved" | "dismissed";
}

/**
 * OPERATIONS INTELLIGENCE GENERATOR
 *
 * Automatically inspects PrototypeState and derives real-time operational alerts.
 * These are not static decorative text — they derive strictly from actual state data.
 */
export function generateOperationsAlerts(state: PrototypeState): OperationsAlert[] {
  const alerts: OperationsAlert[] = [];
  const nowStr = "Live";

  // 1. Check Capacity & Waitlist Alerts for Active Sessions
  state.sessions.forEach((s) => {
    if (s.status === "cancelled" || s.status === "archived") return;

    const ledger = sessionCapacityLedger(state, s.id);

    // Overbooked alert
    if (ledger.occupancyStatus === "overbooked") {
      alerts.push({
        id: `alert-overbook-${s.id}`,
        severity: "critical",
        type: "venue-overbooked",
        title: `Physical Overbooking Alert: ${s.date} ${s.startTime}`,
        trigger: "Physical occupancy exceeds maximum venue playing-area capacity",
        evidence: `Occupancy: ${ledger.physicalOccupancy} / Max: ${ledger.maxPhysicalCapacity}`,
        impact: "Safety hazard and compliance violation at venue door",
        recommendedAction: "Cancel unconfirmed reservations or move participants to companion slot",
        relatedEntityIds: [s.id, s.venueId],
        generatedAt: nowStr,
        status: "active",
      });
    }

    // Heavy Waitlist alert
    if (ledger.waitlistCount >= 2) {
      alerts.push({
        id: `alert-waitlist-${s.id}`,
        severity: "medium",
        type: "heavy-waitlist",
        title: `High Waitlist Demand: Session ${s.id}`,
        trigger: `${ledger.waitlistCount} participants waiting in operational queue`,
        evidence: `Waitlist count: ${ledger.waitlistCount}, Remaining sellable: ${ledger.remainingSellableCapacity}`,
        impact: "Potential uncaptured revenue; customer delay dissatisfaction",
        recommendedAction: "Release blocked slots or dispatch waitlist offer to top entry",
        relatedEntityIds: [s.id],
        generatedAt: nowStr,
        status: "active",
      });
    }

    // Below Break-even alert
    if (
      ledger.occupiedSellableCapacity < ledger.breakEvenAttendance &&
      (s.status === "published" || s.status === "booking-open" || s.status === "almost-full")
    ) {
      alerts.push({
        id: `alert-breakeven-${s.id}`,
        severity: "high",
        type: "below-breakeven",
        title: `Session Below Break-Even: Session ${s.id}`,
        trigger: `Confirmed/held seats (${ledger.occupiedSellableCapacity}) below break-even (${ledger.breakEvenAttendance})`,
        evidence: `Attendance: ${ledger.occupiedSellableCapacity}/${ledger.breakEvenAttendance} required for break-even`,
        impact: "Session currently running at an operational net loss",
        recommendedAction: "Launch local promo boost or merge session with adjacent time slot",
        relatedEntityIds: [s.id],
        generatedAt: nowStr,
        status: "active",
      });
    }
  });

  // 2. Check Payment Failure Spike
  const failedPayments = (state.payments ?? []).filter((p) => p.status === "failed");
  if (failedPayments.length >= 2) {
    alerts.push({
      id: "alert-pay-failures",
      severity: "high",
      type: "payment-failure-spike",
      title: "Payment Failure Spike Detected",
      trigger: `${failedPayments.length} recent payment transaction failures recorded`,
      evidence: `Failed payment count: ${failedPayments.length}`,
      impact: "Reserved slots stuck in pending state; revenue leakage",
      recommendedAction: "Review payment gateway failure codes and expire stalled reservations",
      relatedEntityIds: failedPayments.map((p) => p.id),
      generatedAt: nowStr,
      status: "active",
    });
  }

  // 3. Check Refund Spike
  const pendingRefunds = (state.refunds ?? []).filter(
    (r) => r.status === "requested" || r.status === "under-review"
  );
  if (pendingRefunds.length >= 1) {
    alerts.push({
      id: "alert-refund-spike",
      severity: "medium",
      type: "refund-spike",
      title: "Pending Refund Approvals Require Action",
      trigger: `${pendingRefunds.length} refund requests awaiting Finance authorization`,
      evidence: `Pending refund count: ${pendingRefunds.length}`,
      impact: "Delayed customer reimbursement; pending financial liability",
      recommendedAction: "Open Refund Authorization Workspace and review request eligibility",
      relatedEntityIds: pendingRefunds.map((r) => r.id),
      generatedAt: nowStr,
      status: "active",
    });
  }

  // 4. Check Crew Shortage
  const unassignedSessions = state.sessions.filter(
    (s) => !s.leadCoordinatorId && s.status !== "cancelled" && s.status !== "archived"
  );
  if (unassignedSessions.length >= 1) {
    alerts.push({
      id: "alert-crew-shortage",
      severity: "high",
      type: "crew-shortage",
      title: "Unassigned Lead Coordinators",
      trigger: `${unassignedSessions.length} active sessions lack assigned Lead Coordinator`,
      evidence: `Sessions unassigned: ${unassignedSessions.map((s) => s.id).join(", ")}`,
      impact: "Door execution risk; session cannot commence without lead staffing",
      recommendedAction: "Open Staffing Module and assign available crew members",
      relatedEntityIds: unassignedSessions.map((s) => s.id),
      generatedAt: nowStr,
      status: "active",
    });
  }

  // 5. SA-P2G Live Session Alerts
  (state.liveSessionStates ?? []).forEach((lss) => {
    // Critical Equipment Missing Alert
    const eqItems = (state.equipmentCheckItems ?? []).filter((e) => e.sessionId === lss.sessionId);
    const criticalMissing = eqItems.filter((e) => e.isCritical && e.missingCount > 0);
    if (criticalMissing.length > 0) {
      alerts.push({
        id: `alert-eq-missing-${lss.sessionId}`,
        severity: "high",
        type: "critical-equipment-missing",
        title: `Critical Equipment Missing: Session ${lss.sessionId}`,
        trigger: "Critical session equipment unavailable or missing",
        evidence: `Missing items: ${criticalMissing.map((e) => `${e.equipmentName} (${e.missingCount})`).join(", ")}`,
        impact: "Active match or segment cannot commence safely without required equipment",
        recommendedAction: "Issue replacement equipment or adjust run plan",
        relatedEntityIds: [lss.sessionId],
        generatedAt: nowStr,
        status: "active",
      });
    }

    // Emergency Active Alert
    if (lss.status === "Emergency" || lss.emergencyMode) {
      alerts.push({
        id: `alert-emergency-${lss.sessionId}`,
        severity: "critical",
        type: "emergency-active",
        title: `Emergency Mode Active: Session ${lss.sessionId}`,
        trigger: `Emergency mode triggered: ${lss.emergencyReason || "Safety event"}`,
        evidence: `Reason: ${lss.emergencyReason || "Operational safety hold"}, Action: ${lss.emergencyAction || "None"}`,
        impact: "Live activity paused; requires safety clearance to resume",
        recommendedAction: "Confirm safety contact presence, complete emergency action, and exit emergency mode",
        relatedEntityIds: [lss.sessionId],
        generatedAt: nowStr,
        status: "active",
      });
    }

    // Session Paused Too Long Alert
    if (lss.status === "Paused") {
      alerts.push({
        id: `alert-paused-${lss.sessionId}`,
        severity: "medium",
        type: "session-paused-too-long",
        title: `Session Paused: Session ${lss.sessionId}`,
        trigger: `Live session currently paused (${lss.pauseReason || "Operational delay"})`,
        evidence: `Pause reason: ${lss.pauseReason || "Operational delay"}`,
        impact: "Run-of-show timeline delay; venue playing area slot risk",
        recommendedAction: "Resolve pause condition and click Resume in Command Center",
        relatedEntityIds: [lss.sessionId],
        generatedAt: nowStr,
        status: "active",
      });
    }
  });

  return alerts;
}
