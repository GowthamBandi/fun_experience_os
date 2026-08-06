import type { PrototypeState } from "../scenarios/state";
import { sessionCapacityLedger } from "./capacity";

export interface OperationsAlert {
  id: string;
  severity: "low" | "medium" | "high" | "critical";
  type:
    | "critical-incident-unacknowledged"
    | "triage-overdue"
    | "investigation-overdue"
    | "repeated-venue-incidents"
    | "repeated-participant-misconduct"
    | "tournament-behind-schedule"
    | "result-verification-backlog"
    | "referee-shortage"
    | "abandoned-match-unresolved"
    | "refund-exception-pending"
    | "evidence-placeholder-incomplete"
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

  // ==========================================
  // SA-P2H: TOURNAMENT & SAFETY INCIDENT ALERTS
  // ==========================================

  // 1. Critical Incident Unacknowledged
  (state.incidents ?? []).forEach((i) => {
    if (i.severity === "critical" && i.status === "reported") {
      alerts.push({
        id: `alert-critical-unack-${i.id}`,
        severity: "critical",
        type: "critical-incident-unacknowledged",
        title: `Critical Incident Awaiting Ack: ${i.incidentCode || i.id}`,
        trigger: `Critical severity incident reported at ${i.reportedAt || i.time} not yet acknowledged`,
        evidence: `Incident code: ${i.incidentCode || i.id}, Status: ${i.status}`,
        impact: "Safety hazard escalation delay; customer liability exposure",
        recommendedAction: "Acknowledge the incident immediately and assign dispatcher",
        relatedEntityIds: [i.id],
        generatedAt: nowStr,
        status: "active"
      });
    }
  });

  // 2. Triage Overdue
  (state.incidents ?? []).forEach((i) => {
    if (
      (i.severity === "critical" || i.severity === "high") &&
      (i.status === "reported" || i.status === "acknowledged")
    ) {
      alerts.push({
        id: `alert-triage-overdue-${i.id}`,
        severity: "high",
        type: "triage-overdue",
        title: `Incident Triage Overdue: ${i.incidentCode || i.id}`,
        trigger: `Severe incident (${i.severity}) remains untriaged after report`,
        evidence: `Severity: ${i.severity}, Status: ${i.status}`,
        impact: "Unresolved immediate risk to participants and operations",
        recommendedAction: "Complete the triage checklist to assess risk and document actions",
        relatedEntityIds: [i.id],
        generatedAt: nowStr,
        status: "active"
      });
    }
  });

  // 3. Investigation Overdue
  (state.incidents ?? []).forEach((i) => {
    if (
      (i.severity === "critical" || i.severity === "high") &&
      (i.status === "triaged" || i.status === "active") &&
      !i.investigatorId
    ) {
      alerts.push({
        id: `alert-investigation-overdue-${i.id}`,
        severity: "high",
        type: "investigation-overdue",
        title: `Investigation Assignment Pending: ${i.incidentCode || i.id}`,
        trigger: `Incident status is ${i.status} but no investigator has been assigned`,
        evidence: `Incident: ${i.incidentCode || i.id}, Investigator: None`,
        impact: "Case resolution stalls; unresolved liability and safety concerns",
        recommendedAction: "Assign a lead investigator to compile evidence and resolution plan",
        relatedEntityIds: [i.id],
        generatedAt: nowStr,
        status: "active"
      });
    }
  });

  // 4. Repeated Venue Incidents
  const venueCounts: { [key: string]: number } = {};
  (state.incidents ?? []).forEach((i) => {
    if (i.venueId) {
      venueCounts[i.venueId] = (venueCounts[i.venueId] || 0) + 1;
    }
  });
  Object.entries(venueCounts).forEach(([vId, count]) => {
    if (count >= 3) {
      alerts.push({
        id: `alert-venue-incidents-${vId}`,
        severity: "high",
        type: "repeated-venue-incidents",
        title: `Repeated Venue Safety Issues: ${vId}`,
        trigger: `${count} safety incidents recorded at this venue`,
        evidence: `Incident count: ${count}`,
        impact: "Systemic venue hazards; potential compliance or liability risk",
        recommendedAction: "Initiate comprehensive venue safety review with facility manager",
        relatedEntityIds: [vId],
        generatedAt: nowStr,
        status: "active"
      });
    }
  });

  // 5. Repeated Participant Misconduct
  const subjectCounts: { [key: string]: number } = {};
  (state.incidents ?? []).forEach((i) => {
    const category = i.category || i.type || "";
    if (
      (category === "misconduct" || category.toLowerCase().includes("misconduct")) &&
      i.participantTemporaryIds
    ) {
      i.participantTemporaryIds.forEach((pId) => {
        subjectCounts[pId] = (subjectCounts[pId] || 0) + 1;
      });
    }
  });
  Object.entries(subjectCounts).forEach(([pId, count]) => {
    if (count >= 2) {
      alerts.push({
        id: `alert-subject-misconduct-${pId}`,
        severity: "high",
        type: "repeated-participant-misconduct",
        title: `Repeated Misconduct Alert: ${pId}`,
        trigger: `${count} misconduct incidents linked to this temporary ID`,
        evidence: `Disruptions: ${count}`,
        impact: "Disruptive presence; participant safety and experience risk",
        recommendedAction: "Initiate moderation case and propose warning or temporary suspension",
        relatedEntityIds: [pId],
        generatedAt: nowStr,
        status: "active"
      });
    }
  });

  // 6. Tournament Behind Schedule
  const liveTournaments = (state.tournaments ?? []).filter((t) => t.status === "live");
  liveTournaments.forEach((t) => {
    const matches = (state.tournamentMatches ?? []).filter(
      (m) => m.tournamentId === t.id && (m.status === "scheduled" || m.status === "live" || m.status === "paused")
    );
    if (matches.length > 0) {
      const pausedMatch = matches.find((m) => m.status === "paused");
      if (pausedMatch) {
        alerts.push({
          id: `alert-tr-delayed-${t.id}`,
          severity: "medium",
          type: "tournament-behind-schedule",
          title: `Tournament Match Stalled: ${t.name}`,
          trigger: `Match ${pausedMatch.id} is paused`,
          evidence: `Match: ${pausedMatch.roundLabel || "—"}, Status: paused`,
          impact: "Bracket scheduling delay; venue court lease overrun risk",
          recommendedAction: "Coordinate with referee to resume play or declare walkover/abandonment",
          relatedEntityIds: [t.id, pausedMatch.id],
          generatedAt: nowStr,
          status: "active"
        });
      }
    }
  });

  // 7. Result Verification Backlog
  const pendingVerifications = (state.tournamentMatches ?? []).filter((m) => m.status === "awaiting-verification");
  if (pendingVerifications.length >= 2) {
    alerts.push({
      id: "alert-verification-backlog",
      severity: "medium",
      type: "result-verification-backlog",
      title: "Match Result Verification Backlog",
      trigger: `${pendingVerifications.length} completed matches awaiting score verification`,
      evidence: `Pending matches: ${pendingVerifications.map((m) => m.id).join(", ")}`,
      impact: "Bracket progression blocked; tournament delays",
      recommendedAction: "Verify results immediately to advance winners to next round",
      relatedEntityIds: pendingVerifications.map((m) => m.id),
      generatedAt: nowStr,
      status: "active"
    });
  }

  // 8. Referee Shortage
  const activeTrs = (state.tournaments ?? []).filter((t) => t.status === "published" || t.status === "live");
  activeTrs.forEach((t) => {
    const unassignedMatches = (state.tournamentMatches ?? []).filter(
      (m) => m.tournamentId === t.id && !m.refereeId && !m.isBye
    );
    if (unassignedMatches.length > 0) {
      alerts.push({
        id: `alert-ref-shortage-${t.id}`,
        severity: "high",
        type: "referee-shortage",
        title: `Referee Assignment Pending: ${t.name}`,
        trigger: `${unassignedMatches.length} active bracket matches lack an assigned referee`,
        evidence: `Unassigned: ${unassignedMatches.map((m) => m.id).join(", ")}`,
        impact: "Matches cannot commence on schedule; bracket delay risk",
        recommendedAction: "Assign qualified crew member as referee in tournament manager",
        relatedEntityIds: [t.id],
        generatedAt: nowStr,
        status: "active"
      });
    }
  });

  // 9. Abandoned Match Unresolved
  const abandonedMatches = (state.tournamentMatches ?? []).filter((m) => m.status === "abandoned");
  abandonedMatches.forEach((m) => {
    alerts.push({
      id: `alert-abandoned-match-${m.id}`,
      severity: "high",
      type: "abandoned-match-unresolved",
      title: `Unresolved Abandoned Match: ${m.id}`,
      trigger: "Match was abandoned and has no resolution",
      evidence: `Match: ${m.id}, Reason: ${m.abandonReason || "None specified"}`,
      impact: "Tournament bracket progression blocked",
      recommendedAction: "Declare walkover or schedule replacement match in admin settings",
      relatedEntityIds: [m.tournamentId, m.id],
      generatedAt: nowStr,
      status: "active"
    });
  });

  // 10. Refund Exception Pending
  const pendingRex = (state.refundExceptions ?? []).filter((re) => re.status === "recommended");
  if (pendingRex.length > 0) {
    alerts.push({
      id: "alert-refund-exceptions-pending",
      severity: "medium",
      type: "refund-exception-pending",
      title: "Refund Exceptions Pending Approval",
      trigger: `${pendingRex.length} refund exceptions awaiting Finance review`,
      evidence: `Recommended exceptions: ${pendingRex.length}`,
      impact: "Customer credit delayed; unresolved customer service issues",
      recommendedAction: "Finance role must review and approve or reject recommended exceptions",
      relatedEntityIds: pendingRex.map((re) => re.id),
      generatedAt: nowStr,
      status: "active"
    });
  }

  // 11. Evidence Placeholder Incomplete
  const pendingEvidence = (state.evidenceItems ?? []).filter((e) => e.status === "pending");
  if (pendingEvidence.length > 0) {
    alerts.push({
      id: "alert-evidence-incomplete",
      severity: "low",
      type: "evidence-placeholder-incomplete",
      title: "Evidence Item Collection Pending",
      trigger: `${pendingEvidence.length} evidence placeholders awaiting document upload`,
      evidence: `Pending evidence IDs: ${pendingEvidence.map((e) => e.id).join(", ")}`,
      impact: "Incident investigation cannot be fully completed or reviewed",
      recommendedAction: "Collect and upload the requested incident evidence files",
      relatedEntityIds: pendingEvidence.map((e) => e.id),
      generatedAt: nowStr,
      status: "active"
    });
  }

  return alerts;
}
