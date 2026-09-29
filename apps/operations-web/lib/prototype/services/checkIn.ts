import type { PrototypeState } from "../scenarios/state";
import type { CheckInRecord, CheckInStatus, CheckInMethod } from "../entities";
import { validateCheckInTransition } from "../validators/checkInValidation";
import { selectSessionParticipantPool } from "../selectors/identity";
import { resolveSessionPerson } from "../selectors/checkIn";
import { pushAudit, pushSignal } from "./helpers";

type Result = { state: PrototypeState; error?: string };

/**
 * Open door check-in: creates an "expected" record for every confirmed
 * participant and moves a revealed session to check-in-open.
 */
export function createCheckInRecords(state: PrototypeState, sessionId: string, operatorId: string = "system"): Result {
  const session = state.sessions.find((s) => s.id === sessionId);
  if (!session) return { state, error: "Session not found." };
  if (!["revealed", "check-in-open", "live"].includes(session.status)) {
    return { state, error: "Check-in opens after the reveal. Reveal teams first." };
  }

  const eligible = selectSessionParticipantPool(state, sessionId).filter((p) => p.isEligible);
  if (eligible.length === 0) return { state, error: "No confirmed participants to expect at the door." };

  const existing = state.checkInRecords ?? [];
  const known = new Set(existing.filter((c) => c.sessionId === sessionId).map((c) => c.bookingId));
  const now = new Date().toISOString();
  const newRecords: CheckInRecord[] = eligible
    .filter((p) => !known.has(p.booking.id))
    .map((p) => ({
      id: `chk-${p.booking.id}`,
      sessionId,
      bookingId: p.booking.id,
      temporaryIdentityId: p.temporaryIdentity?.id,
      status: "expected" as const,
      updatedAt: now,
    }));

  const opens = session.status === "revealed";
  if (newRecords.length === 0 && !opens) return { state, error: "Check-in is already open and every participant is on the door list." };

  let next: PrototypeState = {
    ...state,
    sessions: opens ? state.sessions.map((s) => (s.id === sessionId ? { ...s, status: "check-in-open" as const } : s)) : state.sessions,
    checkInRecords: [...existing, ...newRecords],
  };
  next = pushAudit(next, {
    sessionId,
    action: "create-check-in-records",
    operatorId,
    description: `${opens ? "Opened door check-in. " : ""}Added ${newRecords.length} participant(s) to the door list.`,
  });
  return { state: next };
}

export function updateCheckInStatus(
  state: PrototypeState,
  params: {
    sessionId: string;
    bookingId: string;
    targetStatus: CheckInStatus;
    method?: CheckInMethod;
    denialReason?: string;
    auditOverrideReason?: string;
    operatorId?: string;
  },
): Result {
  const { sessionId, bookingId, targetStatus, method = "manual-override", denialReason, auditOverrideReason, operatorId = "system" } = params;

  if (auditOverrideReason !== undefined && auditOverrideReason.trim().length < 5) {
    return { state, error: "Give a correction reason of at least 5 characters." };
  }
  const validation = validateCheckInTransition(state, bookingId, targetStatus, denialReason, !!auditOverrideReason?.trim(), sessionId);
  if (!validation.isValid) return { state, error: validation.error };

  const now = new Date().toISOString();
  const apply = (c: CheckInRecord): CheckInRecord => ({
    ...c,
    status: targetStatus,
    method,
    checkedInAt: targetStatus === "checked-in" ? now : c.checkedInAt,
    markedLateAt: targetStatus === "late" ? now : c.markedLateAt,
    markedNoShowAt: targetStatus === "no-show" ? now : c.markedNoShowAt,
    deniedAt: targetStatus === "denied" ? now : c.deniedAt,
    denialReason: targetStatus === "denied" ? denialReason?.trim() : c.denialReason,
    note: auditOverrideReason?.trim() || c.note,
    handledBy: operatorId,
    updatedAt: now,
  });

  const existing = state.checkInRecords ?? [];
  const found = existing.some((c) => c.bookingId === bookingId && c.sessionId === sessionId);
  const records = found
    ? existing.map((c) => (c.bookingId === bookingId && c.sessionId === sessionId ? apply(c) : c))
    : [
        ...existing,
        apply({
          id: `chk-${bookingId}`,
          sessionId,
          bookingId,
          temporaryIdentityId: (state.temporaryIdentities ?? []).find((t) => t.bookingId === bookingId && t.sessionId === sessionId)?.id,
          status: "expected",
          updatedAt: now,
        }),
      ];

  // Keep the booking's attendance flags in step with the door record.
  const bookings = state.bookings.map((b) =>
    b.id === bookingId ? { ...b, checkedIn: targetStatus === "checked-in" || targetStatus === "late", noShow: targetStatus === "no-show" } : b,
  );

  const alias = state.bookings.find((b) => b.id === bookingId)?.alias ?? bookingId;
  let next: PrototypeState = { ...state, bookings, checkInRecords: records };
  next = pushAudit(next, {
    sessionId,
    action: `checkin-status-${targetStatus}`,
    operatorId,
    description: `${alias}: ${targetStatus.replace(/-/g, " ")}${targetStatus === "denied" ? ` — ${denialReason?.trim()}` : ""}${
      auditOverrideReason?.trim() ? ` (correction: ${auditOverrideReason.trim()})` : ""
    }`,
  });
  if (targetStatus === "checked-in" || targetStatus === "late") {
    next = pushSignal(next, { kind: "join", sessionId, message: `${alias} arrived (${targetStatus.replace(/-/g, " ")})` });
  }
  return { state: next };
}

/**
 * Check in a session's staff member. Accepts a crew id or a legacy operator id;
 * the person must have a crew record.
 */
export function checkInStaff(state: PrototypeState, sessionId: string, personRef: string, operatorId: string = "system"): Result {
  const person = resolveSessionPerson(state, personRef);
  if (!person) return { state, error: "That staff member was not found." };
  if (!person.crewId) return { state, error: `${person.name} has no staff record, so they cannot be checked in. Assign a crew member in Staffing.` };
  if (person.isCheckedIn) return { state, error: `${person.name} is already checked in.` };

  let next: PrototypeState = {
    ...state,
    crew: (state.crew ?? []).map((c) => (c.id === person.crewId ? { ...c, status: "checked-in" as const } : c)),
  };
  next = pushAudit(next, { sessionId, action: "check-in-staff", operatorId, description: `${person.name} checked in for session ${sessionId}.` });
  return { state: next };
}
