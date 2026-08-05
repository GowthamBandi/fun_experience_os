import type { PrototypeState } from "../scenarios/state";
import type { CheckInRecord, CheckInStatus, CheckInMethod } from "../entities";
import { validateCheckInTransition } from "../validators/checkInValidation";
import { selectSessionParticipantPool } from "../selectors/identity";
import { pushAudit, pushSignal } from "./helpers";

export function createCheckInRecords(
  state: PrototypeState,
  sessionId: string,
  operatorId: string = "op-master"
): PrototypeState {
  const pool = selectSessionParticipantPool(state, sessionId);
  const eligible = pool.filter((p) => p.isEligible);
  const existing = state.checkInRecords ?? [];
  const existingBookingIds = new Set(existing.filter((c) => c.sessionId === sessionId).map((c) => c.bookingId));

  const newRecords: CheckInRecord[] = [];

  eligible.forEach((p) => {
    if (!existingBookingIds.has(p.booking.id)) {
      newRecords.push({
        id: `chk-${p.booking.id}`,
        sessionId,
        bookingId: p.booking.id,
        temporaryIdentityId: p.temporaryIdentity?.id,
        status: "expected",
        updatedAt: new Date().toISOString(),
      });
    }
  });

  if (newRecords.length === 0) return state;

  let next = {
    ...state,
    checkInRecords: [...existing, ...newRecords],
  };

  next = pushAudit(next, {
    sessionId,
    action: "create-check-in-records",
    operatorId,
    description: `Initialized check-in records for ${newRecords.length} expected participants`,
  });

  return next;
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
  }
): { state: PrototypeState; error?: string } {
  const {
    sessionId,
    bookingId,
    targetStatus,
    method = "manual-override",
    denialReason,
    auditOverrideReason,
    operatorId = "op-master",
  } = params;

  const validation = validateCheckInTransition(state, bookingId, targetStatus, denialReason, !!auditOverrideReason);
  if (!validation.isValid) {
    return { state, error: validation.error };
  }

  const existing = state.checkInRecords ?? [];
  const now = new Date().toISOString();

  let found = false;
  const updatedRecords = existing.map((c) => {
    if (c.bookingId === bookingId && c.sessionId === sessionId) {
      found = true;
      return {
        ...c,
        status: targetStatus,
        method,
        checkedInAt: targetStatus === "checked-in" ? now : c.checkedInAt,
        markedLateAt: targetStatus === "late" ? now : c.markedLateAt,
        markedNoShowAt: targetStatus === "no-show" ? now : c.markedNoShowAt,
        deniedAt: targetStatus === "denied" ? now : c.deniedAt,
        denialReason: targetStatus === "denied" ? denialReason : c.denialReason,
        handledBy: operatorId,
        updatedAt: now,
      };
    }
    return c;
  });

  if (!found) {
    const tempIdObj = (state.temporaryIdentities ?? []).find((t) => t.bookingId === bookingId);
    updatedRecords.push({
      id: `chk-${bookingId}`,
      sessionId,
      bookingId,
      temporaryIdentityId: tempIdObj?.id,
      status: targetStatus,
      method,
      checkedInAt: targetStatus === "checked-in" ? now : undefined,
      markedLateAt: targetStatus === "late" ? now : undefined,
      markedNoShowAt: targetStatus === "no-show" ? now : undefined,
      deniedAt: targetStatus === "denied" ? now : undefined,
      denialReason: targetStatus === "denied" ? denialReason : undefined,
      handledBy: operatorId,
      updatedAt: now,
    });
  }

  // Update legacy checkedIn/noShow flags on booking for backward compatibility
  const updatedBookings = state.bookings.map((b) => {
    if (b.id === bookingId) {
      return {
        ...b,
        checkedIn: targetStatus === "checked-in" || targetStatus === "late",
        noShow: targetStatus === "no-show",
      };
    }
    return b;
  });

  let next: PrototypeState = {
    ...state,
    bookings: updatedBookings,
    checkInRecords: updatedRecords,
  };

  next = pushAudit(next, {
    sessionId,
    action: `checkin-status-${targetStatus}`,
    operatorId,
    description: auditOverrideReason
      ? `Updated check-in status of booking ${bookingId} to '${targetStatus}' via method '${method}' with override: ${auditOverrideReason}`
      : `Updated check-in status of booking ${bookingId} to '${targetStatus}' via method '${method}'`,
  });

  if (targetStatus === "checked-in" || targetStatus === "late") {
    next = pushSignal(next, {
      kind: "join",
      sessionId,
      message: `Participant checked in (${targetStatus}) for session ${sessionId}`,
      at: "Just now",
    });
  }

  return { state: next };
}

export function checkInStaff(
  state: PrototypeState,
  sessionId: string,
  crewId: string,
  operatorId: string = "op-master"
): PrototypeState {
  const crew = (state.crew ?? []).map((c) =>
    c.id === crewId ? { ...c, status: "checked-in" as const } : c
  );

  let next = { ...state, crew };

  next = pushAudit(next, {
    sessionId,
    action: "check-in-staff",
    operatorId,
    description: `Staff member ${crewId} checked in for session ${sessionId}`,
  });

  return next;
}
