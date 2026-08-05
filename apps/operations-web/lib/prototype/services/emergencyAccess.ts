import type { PrototypeState } from "../scenarios/state";
import type { EmergencyAccessLog } from "../entities";
import { pushAudit } from "./helpers";

export function requestEmergencyIdentityAccess(
  state: PrototypeState,
  params: {
    sessionId?: string;
    bookingId?: string;
    operatorId: string;
    operatorRole: string;
    reason: string;
  }
): { state: PrototypeState; accessLog?: EmergencyAccessLog; error?: string } {
  const { sessionId, bookingId, operatorId, operatorRole, reason } = params;

  // Allowed roles per Correction 1: platform-owner, super-admin, safety, ops-manager ONLY
  const allowed =
    operatorRole === "super-admin" ||
    operatorRole === "safety" ||
    operatorRole === "ops-manager" ||
    operatorRole === "platform-owner";

  if (!allowed) {
    return {
      state,
      error: `Access Denied: Role '${operatorRole}' is not authorized to request emergency identity access.`,
    };
  }

  if (!reason || !reason.trim() || reason.trim().length < 5) {
    return {
      state,
      error: "Emergency Access Rejected: A valid non-empty operational reason is mandatory.",
    };
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString(); // 5-minute time-limited display

  const newLog: EmergencyAccessLog = {
    id: `emg-${Date.now()}`,
    sessionId,
    bookingId,
    operatorId,
    reason,
    requestedAt: now.toISOString(),
    expiresAt,
    status: "active",
  };

  let next = {
    ...state,
    emergencyAccessLogs: [...(state.emergencyAccessLogs ?? []), newLog],
  };

  next = pushAudit(next, {
    sessionId,
    action: "request-emergency-access",
    operatorId,
    description: `Emergency identity access granted for 5 mins to ${operatorId} (${operatorRole}). Justification: ${reason}`,
  });

  return { state: next, accessLog: newLog };
}

export function closeEmergencyIdentityAccess(
  state: PrototypeState,
  logId: string,
  operatorId: string = "op-master"
): PrototypeState {
  const logs = (state.emergencyAccessLogs ?? []).map((l) =>
    l.id === logId ? { ...l, status: "closed" as const } : l
  );

  let next = { ...state, emergencyAccessLogs: logs };

  next = pushAudit(next, {
    action: "close-emergency-access",
    operatorId,
    description: `Closed emergency access session ${logId}`,
  });

  return next;
}
