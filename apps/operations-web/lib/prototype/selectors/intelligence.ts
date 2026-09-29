import type { PrototypeState } from "../scenarios/state";
import type { ScheduledSession } from "../entities";
import { sessionCapacityLedger } from "./capacity";
import { sessionTitle, venueName } from "./lookups";
import { canonicalBookingStatus, isoMillis } from "./status";
import {
  AWAITING_APPROVAL_REFUND_STATUSES,
  AWAITING_PAYOUT_REFUND_STATUSES,
  selectReconciliationIssues,
} from "./money";

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
    | "refund-payout-pending"
    | "reconciliation-mismatch"
    | "holds-expiring"
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
const SEVERITY_ORDER: Record<OperationsAlert["severity"], number> = { critical: 0, high: 1, medium: 2, low: 3 };
const OPEN_FOR_BOOKING = new Set(["scheduled", "published", "booking-open", "almost-full", "full"]);
const FINISHED = new Set(["cancelled", "archived", "completed"]);
const rupees = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export function generateOperationsAlerts(state: PrototypeState, nowIso: string = new Date().toISOString()): OperationsAlert[] {
  const alerts: OperationsAlert[] = [];
  const nowStr = nowIso;
  const now = Date.parse(nowIso);
  const label = (s: ScheduledSession) => `${sessionTitle(state, s.id)} · ${venueName(state, s.venueId)} (${s.date} ${s.startTime})`;
  const upcoming = (s: ScheduledSession) => !FINISHED.has(s.status) && (s.date === "Today" || s.date === "Tomorrow");

  // 1. Capacity, waitlist and break-even — only for sessions that have not finished.
  state.sessions.forEach((s) => {
    if (FINISHED.has(s.status)) return;
    const ledger = sessionCapacityLedger(state, s.id);

    if (ledger.occupancyStatus === "overbooked") {
      alerts.push({
        id: `alert-overbook-${s.id}`,
        severity: "critical",
        type: "venue-overbooked",
        title: `Overbooked: ${label(s)}`,
        trigger: "More seats are taken than the session can hold",
        evidence: `${ledger.physicalOccupancy} seats taken for a capacity of ${ledger.maxPhysicalCapacity}`,
        impact: "Participants may be turned away at check-in",
        recommendedAction: "Release unpaid holds or move participants to another session",
        relatedEntityIds: [s.id, s.venueId],
        generatedAt: nowStr,
        status: "active",
      });
    }

    if (ledger.waitlistCount > 0 && ledger.remainingSellableCapacity > 0 && OPEN_FOR_BOOKING.has(s.status)) {
      alerts.push({
        id: `alert-waitlist-free-${s.id}`,
        severity: "high",
        type: "heavy-waitlist",
        title: `Free seats while people wait: ${label(s)}`,
        trigger: `${ledger.remainingSellableCapacity} free seat${ledger.remainingSellableCapacity === 1 ? "" : "s"} and ${ledger.waitlistCount} on the waitlist`,
        evidence: `Waitlist ${ledger.waitlistCount}, free seats ${ledger.remainingSellableCapacity}`,
        impact: "Seats may go unsold while customers are waiting",
        recommendedAction: "Open the session's waitlist and offer the next seat",
        relatedEntityIds: [s.id],
        generatedAt: nowStr,
        status: "active",
      });
    } else if (ledger.waitlistCount >= 2 && ledger.remainingSellableCapacity === 0) {
      alerts.push({
        id: `alert-waitlist-${s.id}`,
        severity: "medium",
        type: "heavy-waitlist",
        title: `${ledger.waitlistCount} people waiting: ${label(s)}`,
        trigger: `Session is full with ${ledger.waitlistCount} people on the waitlist`,
        evidence: `Waitlist ${ledger.waitlistCount}, capacity ${ledger.sellableCapacity}`,
        impact: "Demand is higher than capacity",
        recommendedAction: "Release blocked seats or schedule another session at this time",
        relatedEntityIds: [s.id],
        generatedAt: nowStr,
        status: "active",
      });
    }

    if (upcoming(s) && OPEN_FOR_BOOKING.has(s.status) && s.date === "Today" && ledger.physicalOccupancy < ledger.minViableAttendance) {
      alerts.push({
        id: `alert-minimum-${s.id}`,
        severity: "high",
        type: "minimum-attendance-risk",
        title: `Below minimum attendance: ${label(s)}`,
        trigger: `${ledger.physicalOccupancy} seats taken; the session needs ${ledger.minViableAttendance} to run`,
        evidence: `${ledger.physicalOccupancy} of ${ledger.minViableAttendance} minimum seats`,
        impact: "The session may have to be cancelled and refunded",
        recommendedAction: "Promote the session now, or decide early whether to cancel it",
        relatedEntityIds: [s.id],
        generatedAt: nowStr,
        status: "active",
      });
    } else if (upcoming(s) && OPEN_FOR_BOOKING.has(s.status) && ledger.physicalOccupancy < ledger.breakEvenAttendance) {
      alerts.push({
        id: `alert-breakeven-${s.id}`,
        severity: "medium",
        type: "below-breakeven",
        title: `Below break-even: ${label(s)}`,
        trigger: `${ledger.physicalOccupancy} seats taken; ${ledger.breakEvenAttendance} needed to break even`,
        evidence: `${ledger.physicalOccupancy} of ${ledger.breakEvenAttendance} break-even seats`,
        impact: "The session will run at a loss at current bookings",
        recommendedAction: "Promote the session or merge it with a nearby time slot",
        relatedEntityIds: [s.id],
        generatedAt: nowStr,
        status: "active",
      });
    }
  });

  // 2. Seat holds about to expire (ISO expiry, next 5 minutes).
  const expiringSoon = state.bookings.filter((b) => {
    if (canonicalBookingStatus(b.status) !== "payment-pending") return false;
    const ms = isoMillis(b.reservationExpiresAt);
    return !Number.isNaN(ms) && ms > now && ms - now <= 5 * 60_000;
  });
  if (expiringSoon.length > 0) {
    alerts.push({
      id: "alert-holds-expiring",
      severity: "medium",
      type: "holds-expiring",
      title: `${expiringSoon.length} unpaid seat hold${expiringSoon.length === 1 ? "" : "s"} expire within 5 minutes`,
      trigger: "Payment has not been recorded for these holds",
      evidence: expiringSoon.map((b) => b.alias).join(", "),
      impact: "The seats will be released automatically when the hold runs out",
      recommendedAction: "Record the payments that have been received, with their reference",
      relatedEntityIds: expiringSoon.map((b) => b.id),
      generatedAt: nowStr,
      status: "active",
    });
  }

  // 3. Failed payments on sessions that are still running or upcoming.
  const openSessions = new Set(state.sessions.filter((s) => !FINISHED.has(s.status)).map((s) => s.id));
  const failedPayments = (state.payments ?? []).filter((p) => p.status === "failed" && openSessions.has(p.sessionId));
  if (failedPayments.length >= 2) {
    alerts.push({
      id: "alert-pay-failures",
      severity: "high",
      type: "payment-failure-spike",
      title: `${failedPayments.length} failed payments on upcoming sessions`,
      trigger: `${failedPayments.length} payments were recorded as failed`,
      evidence: failedPayments.map((p) => p.failureReason ?? p.id).slice(0, 3).join("; "),
      impact: "Customers may believe they are booked",
      recommendedAction: "Contact the customers and take payment again, or release their bookings",
      relatedEntityIds: failedPayments.map((p) => p.id),
      generatedAt: nowStr,
      status: "active",
    });
  }

  // 4. Refunds waiting for approval, and approved refunds waiting to be paid out.
  const awaitingApproval = (state.refunds ?? []).filter((r) => AWAITING_APPROVAL_REFUND_STATUSES.has(r.status));
  if (awaitingApproval.length > 0) {
    const total = awaitingApproval.reduce((a, r) => a + r.amount, 0);
    alerts.push({
      id: "alert-refund-spike",
      severity: "medium",
      type: "refund-spike",
      title: `${awaitingApproval.length} refund${awaitingApproval.length === 1 ? "" : "s"} waiting for approval (${rupees(total)})`,
      trigger: "Refund requests are waiting for a Finance decision",
      evidence: `${awaitingApproval.length} requests totalling ${rupees(total)}`,
      impact: "Customers are waiting for their money",
      recommendedAction: "Open Money → Refunds and approve or reject each request",
      relatedEntityIds: awaitingApproval.map((r) => r.id),
      generatedAt: nowStr,
      status: "active",
    });
  }
  const awaitingPayout = (state.refunds ?? []).filter((r) => AWAITING_PAYOUT_REFUND_STATUSES.has(r.status));
  if (awaitingPayout.length > 0) {
    const total = awaitingPayout.reduce((a, r) => a + r.amount, 0);
    alerts.push({
      id: "alert-refund-payout",
      severity: "medium",
      type: "refund-payout-pending",
      title: `${awaitingPayout.length} approved refund${awaitingPayout.length === 1 ? "" : "s"} not yet paid out (${rupees(total)})`,
      trigger: "Refunds were approved but the payout has not been recorded",
      evidence: `${awaitingPayout.length} refunds totalling ${rupees(total)}`,
      impact: "Approved money has not reached the customer",
      recommendedAction: "Pay the refund out and record it with its reference in Money → Refunds",
      relatedEntityIds: awaitingPayout.map((r) => r.id),
      generatedAt: nowStr,
      status: "active",
    });
  }

  // 5. Payment records that do not match their bookings.
  const mismatches = selectReconciliationIssues(state).filter((i) => i.severity === "high");
  if (mismatches.length > 0) {
    alerts.push({
      id: "alert-reconciliation",
      severity: "high",
      type: "reconciliation-mismatch",
      title: `${mismatches.length} payment record${mismatches.length === 1 ? "" : "s"} don't match their booking`,
      trigger: "Payments and bookings disagree",
      evidence: mismatches.map((m) => m.title).slice(0, 2).join("; "),
      impact: "Revenue and refunds may be wrong",
      recommendedAction: "Open Money → Reconciliation and resolve each item",
      relatedEntityIds: mismatches.map((m) => m.bookingId ?? m.paymentId ?? m.id),
      generatedAt: nowStr,
      status: "active",
    });
  }

  // 6. Upcoming sessions without a lead coordinator.
  const unassignedSessions = state.sessions.filter((s) => upcoming(s) && !s.leadCoordinatorId);
  if (unassignedSessions.length >= 1) {
    alerts.push({
      id: "alert-crew-shortage",
      severity: "high",
      type: "crew-shortage",
      title: `${unassignedSessions.length} upcoming session${unassignedSessions.length === 1 ? " has" : "s have"} no lead coordinator`,
      trigger: "No lead coordinator assigned",
      evidence: unassignedSessions.map(label).join(", "),
      impact: "The session cannot start without a lead coordinator",
      recommendedAction: "Open Staffing and assign a lead coordinator",
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
        title: `Critical equipment missing: ${sessionTitle(state, lss.sessionId)}`,
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
        title: `Emergency mode active: ${sessionTitle(state, lss.sessionId)}`,
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
        title: `Session paused: ${sessionTitle(state, lss.sessionId)}`,
        trigger: `Live session currently paused (${lss.pauseReason || "Operational delay"})`,
        evidence: `Pause reason: ${lss.pauseReason || "Operational delay"}`,
        impact: "Run-of-show timeline delay; venue playing area slot risk",
        recommendedAction: "Resolve the reason for the pause and resume the session from its live page",
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
        title: `Critical incident not acknowledged: ${i.incidentCode || i.id}`,
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
        title: `Incident needs triage: ${i.incidentCode || i.id}`,
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
        title: `No investigator assigned: ${i.incidentCode || i.id}`,
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
      title: `${pendingVerifications.length} match results waiting for verification`,
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
      title: `${pendingRex.length} exception refund${pendingRex.length === 1 ? "" : "s"} waiting for Finance`,
      trigger: `${pendingRex.length} refund exceptions awaiting Finance review`,
      evidence: `Recommended exceptions: ${pendingRex.length}`,
      impact: "Customer credit delayed; unresolved customer service issues",
      recommendedAction: "Open Money → Refunds and approve or reject each exception",
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
      title: `${pendingEvidence.length} evidence item${pendingEvidence.length === 1 ? "" : "s"} still to collect`,
      trigger: `${pendingEvidence.length} evidence placeholders awaiting document upload`,
      evidence: `Pending evidence IDs: ${pendingEvidence.map((e) => e.id).join(", ")}`,
      impact: "Incident investigation cannot be fully completed or reviewed",
      recommendedAction: "Collect and upload the requested incident evidence files",
      relatedEntityIds: pendingEvidence.map((e) => e.id),
      generatedAt: nowStr,
      status: "active"
    });
  }

  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
