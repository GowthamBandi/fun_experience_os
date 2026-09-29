import type { PrototypeState } from "../scenarios/state";
import type { EmergencyAccessLog } from "../entities";
import { EMERGENCY_ACCESS_MINUTES, EMERGENCY_REASON_MIN_LENGTH, isEmergencyAccessActive } from "../selectors/identity";
import { pushAudit } from "./helpers";

/** Roles that may open a participant's protected identity record. */
export const EMERGENCY_IDENTITY_ROLES = ["platform-owner", "super-admin", "safety", "ops-manager"] as const;

/** Mark grants whose time has passed as expired (housekeeping, idempotent). */
function expireStale(logs: EmergencyAccessLog[], nowMs: number): EmergencyAccessLog[] {
  return logs.map((l) => (l.status === "active" && !isEmergencyAccessActive(l, nowMs) ? { ...l, status: "expired" as const } : l));
}

/**
 * Grant the signed-in operator time-limited access to one participant's
 * protected identity record. Every grant is written to the audit log.
 */
export function requestEmergencyIdentityAccess(
  state: PrototypeState,
  params: { sessionId?: string; bookingId?: string; operatorId: string; operatorRole: string; reason: string },
  nowMs: number = Date.now(),
): { state: PrototypeState; accessLog?: EmergencyAccessLog; error?: string } {
  const { sessionId, bookingId, operatorId, operatorRole } = params;
  const reason = params.reason?.trim() ?? "";

  if (!(EMERGENCY_IDENTITY_ROLES as readonly string[]).includes(operatorRole)) {
    return { state, error: "Only a platform owner, super admin, safety officer or operations manager can open a participant's identity." };
  }
  if (reason.length < EMERGENCY_REASON_MIN_LENGTH) {
    return { state, error: `Describe the emergency in at least ${EMERGENCY_REASON_MIN_LENGTH} characters. The reason is kept in the audit record.` };
  }
  const booking = bookingId ? state.bookings.find((b) => b.id === bookingId) : undefined;
  if (!booking) return { state, error: "Participant booking not found." };
  if (sessionId && booking.sessionId !== sessionId) return { state, error: "That participant is not booked on this session." };

  const logs = expireStale(state.emergencyAccessLogs ?? [], nowMs);
  const open = logs.find((l) => l.bookingId === booking.id && l.operatorId === operatorId && l.status === "active");
  if (open) return { state, error: "You already have open access to this participant. End it before requesting again." };

  const now = new Date(nowMs);
  const log: EmergencyAccessLog = {
    id: `emg-${nowMs.toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    sessionId: booking.sessionId,
    bookingId: booking.id,
    operatorId,
    operatorRole,
    reason,
    requestedAt: now.toISOString(),
    expiresAt: new Date(nowMs + EMERGENCY_ACCESS_MINUTES * 60_000).toISOString(),
    status: "active",
  };

  let next: PrototypeState = { ...state, emergencyAccessLogs: [...logs, log] };
  next = pushAudit(next, {
    sessionId: booking.sessionId,
    action: "request-emergency-access",
    operatorId,
    description: `Emergency identity access to ${booking.alias} (${booking.id}) for ${EMERGENCY_ACCESS_MINUTES} minutes by ${operatorId} (${operatorRole}). Reason: ${reason}`,
  });
  return { state: next, accessLog: log };
}

/** End a grant early. Only the operator who holds it (or a platform owner / super admin) can close it. */
export function closeEmergencyIdentityAccess(
  state: PrototypeState,
  logId: string,
  operatorId: string = "system",
  operatorRole: string = "",
  nowMs: number = Date.now(),
): { state: PrototypeState; error?: string } {
  const logs = expireStale(state.emergencyAccessLogs ?? [], nowMs);
  const log = logs.find((l) => l.id === logId);
  if (!log) return { state, error: "Access record not found." };
  if (log.status !== "active") return { state, error: `This access has already ${log.status === "expired" ? "expired" : "been closed"}.` };
  if (log.operatorId !== operatorId && operatorRole !== "platform-owner" && operatorRole !== "super-admin") {
    return { state, error: "Only the operator who opened this access can end it." };
  }

  const closedAt = new Date(nowMs).toISOString();
  let next: PrototypeState = {
    ...state,
    emergencyAccessLogs: logs.map((l) => (l.id === logId ? { ...l, status: "closed" as const, closedAt, closedBy: operatorId } : l)),
  };
  next = pushAudit(next, { sessionId: log.sessionId, action: "close-emergency-access", operatorId, description: `Closed emergency identity access ${logId}.` });
  return { state: next };
}
