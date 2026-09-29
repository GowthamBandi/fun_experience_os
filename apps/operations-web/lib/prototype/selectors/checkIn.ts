import type { PrototypeState } from "../scenarios/state";
import type { CrewMember } from "../entities";
import { selectSessionParticipantPool } from "./identity";

/* ------------------------------------------------------------------
   Session people
   A session's lead coordinator and safety contact are referenced by
   CREW id (c-*). Older workspaces stored OPERATOR ids (op-*). Every
   readiness, check-in, completion and emergency-permission rule
   resolves people through `resolveSessionPerson`, which accepts either
   and links an operator to the crew member with the same name.
------------------------------------------------------------------- */

export interface SessionPerson {
  /** The raw id stored on the session. */
  ref: string;
  name: string;
  /** Crew record for this person, when one exists (needed for check-in). */
  crewId?: string;
  crewStatus?: CrewMember["status"];
  /** Console operator account for this person, when one exists (needed for permissions). */
  operatorId?: string;
  isCheckedIn: boolean;
}

const sameName = (a?: string, b?: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

export function resolveSessionPerson(state: PrototypeState, ref: string | undefined | null): SessionPerson | null {
  if (!ref) return null;
  const crew = state.crew ?? [];
  const operators = state.operators ?? [];

  const crewMember = crew.find((c) => c.id === ref);
  if (crewMember) {
    const op = operators.find((o) => sameName(o.name, crewMember.name));
    return {
      ref,
      name: crewMember.name,
      crewId: crewMember.id,
      crewStatus: crewMember.status,
      operatorId: op?.id,
      isCheckedIn: crewMember.status === "checked-in",
    };
  }

  const op = operators.find((o) => o.id === ref);
  if (op) {
    const linked = crew.find((c) => sameName(c.name, op.name));
    return {
      ref,
      name: op.name,
      crewId: linked?.id,
      crewStatus: linked?.status,
      operatorId: op.id,
      isCheckedIn: linked?.status === "checked-in",
    };
  }

  return null;
}

/** True when `operatorId` is the person assigned as the session's lead coordinator (crew or operator reference). */
export function isSessionLeadCoordinator(state: PrototypeState, sessionId: string, operatorId: string): boolean {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session?.leadCoordinatorId || !operatorId) return false;
  if (session.leadCoordinatorId === operatorId) return true;
  const person = resolveSessionPerson(state, session.leadCoordinatorId);
  return !!person?.operatorId && person.operatorId === operatorId;
}

/* ------------------------------ attendance ------------------------------ */

export function selectCheckInSummary(state: PrototypeState, sessionId: string) {
  const pool = selectSessionParticipantPool(state, sessionId);
  const eligible = pool.filter((p) => p.isEligible);
  const eligibleIds = new Set(eligible.map((p) => p.booking.id));
  const checkIns = (state.checkInRecords ?? []).filter((c) => c.sessionId === sessionId && eligibleIds.has(c.bookingId));
  const session = state.sessions.find((s) => s.id === sessionId);

  const checkedInCount = checkIns.filter((c) => c.status === "checked-in").length;
  const lateCount = checkIns.filter((c) => c.status === "late").length;
  const noShowCount = checkIns.filter((c) => c.status === "no-show").length;
  const deniedCount = checkIns.filter((c) => c.status === "denied").length;

  // Checked-in and late both count as present.
  const presentCount = checkedInCount + lateCount;

  // Not yet accounted for: an eligible participant with no decision at the door
  // (no record, or a record still "expected").
  const decided = new Set(checkIns.filter((c) => c.status !== "expected").map((c) => c.bookingId));
  const awaitingCount = eligible.filter((p) => !decided.has(p.booking.id)).length;
  const isCheckInOpen =
    session?.status === "check-in-open" || session?.status === "revealed" || session?.status === "live" || session?.status === "completed";
  const missingCount = isCheckInOpen ? awaitingCount : 0;

  return {
    expectedCount: eligible.length,
    checkedInCount,
    lateCount,
    presentCount,
    noShowCount,
    deniedCount,
    awaitingCount,
    missingCount,
    checkInRate: eligible.length > 0 ? Math.round((presentCount / eligible.length) * 100) : 0,
  };
}

/* -------------------------------- staff -------------------------------- */

export function selectStaffReadiness(state: PrototypeState, sessionId: string) {
  const session = state.sessions.find((s) => s.id === sessionId);
  const lead = resolveSessionPerson(state, session?.leadCoordinatorId);
  const safety = resolveSessionPerson(state, session?.safetyContactId);

  const view = (p: SessionPerson | null) =>
    p ? { name: p.name, status: p.crewStatus ?? "no-staff-record", crewId: p.crewId, operatorId: p.operatorId, ref: p.ref } : null;

  const isLeadPresent = !!lead?.isCheckedIn;
  const isSafetyPresent = !!safety?.isCheckedIn;

  return {
    leadCoordinator: view(lead),
    safetyContact: view(safety),
    isLeadAssigned: !!lead,
    isSafetyAssigned: !!safety,
    isLeadPresent,
    isSafetyPresent,
    presentCount: (isLeadPresent ? 1 : 0) + (isSafetyPresent ? 1 : 0),
    isStaffReady: isLeadPresent && isSafetyPresent,
  };
}

/* ------------------------- live handover readiness ------------------------- */

export interface ReadinessCheck {
  key: string;
  label: string;
  passed: boolean;
  /** Blocking checks stop the session opening unless an audited override is given. */
  blocking: boolean;
  detail: string;
}

export interface HandoverReadinessReport {
  status: "Ready" | "At Risk" | "Blocked";
  checks: ReadinessCheck[];
  reasons: string[];
  recommendedAction: string;
}

export function selectSessionOpenReadiness(state: PrototypeState, sessionId: string): HandoverReadinessReport {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) {
    return {
      status: "Blocked",
      checks: [],
      reasons: ["Session does not exist."],
      recommendedAction: "Check the session link.",
    };
  }

  const summary = selectCheckInSummary(state, sessionId);
  const staff = selectStaffReadiness(state, sessionId);
  const venue = state.venues.find((v) => v.id === session.venueId);
  const playingArea = state.playingAreas.find((pa) => pa.id === session.playingAreaId);
  const minAttendance = session.minParticipants ?? 4;
  const revealed = session.status === "revealed" || session.status === "check-in-open" || session.status === "live";

  const checks: ReadinessCheck[] = [
    {
      key: "revealed",
      label: "Teams revealed",
      passed: revealed,
      blocking: true,
      detail: revealed ? "Participants have their teams and codes." : `Session is '${session.status.replace(/-/g, " ")}' — trigger the reveal first.`,
    },
    {
      key: "attendance",
      label: "Minimum attendance reached",
      passed: summary.presentCount >= minAttendance,
      blocking: true,
      detail: `${summary.presentCount} present of ${minAttendance} needed (${summary.expectedCount} expected).`,
    },
    {
      key: "lead",
      label: "Lead coordinator checked in",
      passed: staff.isLeadPresent,
      blocking: true,
      detail: staff.leadCoordinator
        ? staff.leadCoordinator.crewId
          ? `${staff.leadCoordinator.name} — ${staff.leadCoordinator.status.replace(/-/g, " ")}`
          : `${staff.leadCoordinator.name} has no staff record to check in. Assign a crew member in Staffing.`
        : "No lead coordinator assigned.",
    },
    {
      key: "safety",
      label: "Safety contact checked in",
      passed: staff.isSafetyPresent,
      blocking: false,
      detail: staff.safetyContact
        ? staff.safetyContact.crewId
          ? `${staff.safetyContact.name} — ${staff.safetyContact.status.replace(/-/g, " ")}`
          : `${staff.safetyContact.name} has no staff record to check in. Assign a crew member in Staffing.`
        : "No safety contact assigned.",
    },
    {
      key: "venue",
      label: "Venue ready",
      passed: venue?.status === "ready",
      blocking: true,
      detail: venue ? `${venue.name} — ${venue.status}` : "Venue not found.",
    },
    {
      key: "area",
      label: "Playing area active",
      passed: playingArea?.status === "active",
      blocking: false,
      detail: playingArea ? `${playingArea.name} — ${playingArea.status}` : "Playing area not found.",
    },
  ];

  const failed = checks.filter((c) => !c.passed);
  const reasons = failed.map((c) => `${c.label}: ${c.detail}`);

  if (failed.length === 0) {
    return { status: "Ready", checks, reasons: [], recommendedAction: "Open the session and start the clock." };
  }

  const blocked = failed.some((c) => c.blocking);
  return {
    status: blocked ? "Blocked" : "At Risk",
    checks,
    reasons,
    recommendedAction: blocked
      ? "Resolve the blocking items, or open with an audited override reason."
      : "Review the warnings, then open the session.",
  };
}
