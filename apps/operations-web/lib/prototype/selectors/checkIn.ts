import type { PrototypeState } from "../scenarios/state";
import { selectSessionParticipantPool } from "./identity";
import { calculateRevealReadiness } from "./reveal";

export function selectCheckInSummary(state: PrototypeState, sessionId: string) {
  const pool = selectSessionParticipantPool(state, sessionId);
  const eligible = pool.filter((p) => p.isEligible);
  const checkIns = (state.checkInRecords ?? []).filter((c) => c.sessionId === sessionId);
  const session = state.sessions.find((s) => s.id === sessionId);

  const checkedInCount = checkIns.filter((c) => c.status === "checked-in").length;
  const lateCount = checkIns.filter((c) => c.status === "late").length;
  const noShowCount = checkIns.filter((c) => c.status === "no-show").length;
  const deniedCount = checkIns.filter((c) => c.status === "denied").length;

  // Both checked-in and late count as present per Correction 2!
  const presentCount = checkedInCount + lateCount;

  // Derive missing dynamically:
  // check-in open AND expected AND status NOT in [checked-in, late, no-show, denied]
  const isCheckInOpen = session?.status === "check-in-open" || session?.status === "revealed" || session?.status === "live";
  const accountedIds = new Set(checkIns.map((c) => c.bookingId));
  const missingCount = isCheckInOpen
    ? eligible.filter((p) => !accountedIds.has(p.booking.id)).length
    : 0;

  return {
    expectedCount: eligible.length,
    checkedInCount,
    lateCount,
    presentCount,
    noShowCount,
    deniedCount,
    missingCount,
    checkInRate: eligible.length > 0 ? Math.round((presentCount / eligible.length) * 100) : 0,
  };
}

export function selectStaffReadiness(state: PrototypeState, sessionId: string) {
  const session = state.sessions.find((s) => s.id === sessionId);
  const crew = state.crew ?? [];

  const lead = crew.find((c) => c.id === session?.leadCoordinatorId);
  const safety = crew.find((c) => c.id === session?.safetyContactId);

  const isLeadPresent = lead?.status === "checked-in" || lead?.status === "assigned";
  const isSafetyPresent = safety?.status === "checked-in" || safety?.status === "assigned";

  return {
    leadCoordinator: lead ? { name: lead.name, status: lead.status } : null,
    safetyContact: safety ? { name: safety.name, status: safety.status } : null,
    isLeadPresent,
    isSafetyPresent,
    isStaffReady: isLeadPresent && isSafetyPresent,
  };
}

export interface HandoverReadinessReport {
  status: "Ready" | "At Risk" | "Blocked";
  reasons: string[];
  recommendedAction: string;
}

export function selectSessionOpenReadiness(
  state: PrototypeState,
  sessionId: string
): HandoverReadinessReport {
  const session = state.sessions.find((s) => s.id === sessionId);
  const summary = selectCheckInSummary(state, sessionId);
  const staff = selectStaffReadiness(state, sessionId);
  const revealReport = calculateRevealReadiness(state, sessionId);
  const venue = state.venues.find((v) => v.id === session?.venueId);
  const playingArea = state.playingAreas.find((pa) => pa.id === session?.playingAreaId);

  const reasons: string[] = [];

  if (!session) {
    return {
      status: "Blocked",
      reasons: ["Session does not exist."],
      recommendedAction: "Verify session ID.",
    };
  }

  // Handover criteria per Correction 8:
  // 1. Reveal completed or approved override
  if (session.status !== "revealed" && session.status !== "check-in-open") {
    reasons.push(`Session state is '${session.status}' (must be revealed or check-in-open).`);
  }

  // 2. Minimum viable attendance met
  const minAttendance = session.minParticipants ?? 4;
  if (summary.presentCount < minAttendance) {
    reasons.push(`Present participants (${summary.presentCount}) below minimum viable attendance (${minAttendance}).`);
  }

  // 3. Required lead coordinator present
  if (!staff.isLeadPresent) {
    reasons.push("Lead Coordinator is not checked in.");
  }

  // 4. Required safety role present
  if (!staff.isSafetyPresent) {
    reasons.push("Safety Contact is not checked in.");
  }

  // 5. Venue and playing area ready
  if (venue?.status !== "ready") {
    reasons.push("Venue status is not ready.");
  }
  if (playingArea?.status !== "active") {
    reasons.push("Playing area status is not active.");
  }

  if (reasons.length === 0) {
    return {
      status: "Ready",
      reasons: ["All operational conditions satisfied for Live Operations handover."],
      recommendedAction: "Proceed to hand over to Live Operations.",
    };
  }

  const hasCritical = reasons.some((r) => r.includes("below minimum") || r.includes("Lead Coordinator") || r.includes("Venue"));
  return {
    status: hasCritical ? "Blocked" : "At Risk",
    reasons,
    recommendedAction: hasCritical
      ? "Resolve critical staffing/venue/attendance blockers before handover."
      : "Review warnings and prepare door check-in.",
  };
}
