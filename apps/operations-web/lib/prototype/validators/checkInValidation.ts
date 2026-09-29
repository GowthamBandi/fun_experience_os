import type { PrototypeState } from "../scenarios/state";
import type { CheckInStatus } from "../entities";
import { isEligibleBooking } from "../selectors/identity";

const LABEL: Record<CheckInStatus, string> = {
  expected: "expected",
  "checked-in": "checked in",
  late: "late",
  "no-show": "no-show",
  denied: "denied entry",
};

export function validateCheckInTransition(
  state: PrototypeState,
  bookingId: string,
  targetStatus: CheckInStatus,
  denialReason?: string,
  hasAuditedOverride?: boolean,
  sessionId?: string,
): { isValid: boolean; error?: string } {
  const booking = state.bookings.find((b) => b.id === bookingId);
  if (!booking) return { isValid: false, error: "Booking record not found." };
  if (sessionId && booking.sessionId !== sessionId) return { isValid: false, error: `${booking.alias} is not booked on this session.` };

  const session = state.sessions.find((s) => s.id === booking.sessionId);
  if (session?.status === "completed" || session?.status === "cancelled") {
    return { isValid: false, error: `The session is ${session.status}; attendance can no longer change.` };
  }

  if (!isEligibleBooking(booking)) {
    return { isValid: false, error: `${booking.alias} does not hold a confirmed place (${booking.status.replace(/-/g, " ")}).` };
  }

  if (targetStatus === "denied" && (!denialReason || denialReason.trim().length < 5)) {
    return { isValid: false, error: "Give a reason (at least 5 characters) when denying entry." };
  }

  const checkInRecord = (state.checkInRecords ?? []).find((c) => c.bookingId === bookingId && c.sessionId === booking.sessionId);
  const currentStatus = checkInRecord?.status ?? "expected";

  if (currentStatus === targetStatus) {
    return { isValid: false, error: `${booking.alias} is already ${LABEL[targetStatus]}.` };
  }

  if ((currentStatus === "no-show" || currentStatus === "denied") && (targetStatus === "checked-in" || targetStatus === "late") && !hasAuditedOverride) {
    return { isValid: false, error: `${booking.alias} was marked ${LABEL[currentStatus]}. A correction reason is required to admit them.` };
  }

  return { isValid: true };
}
