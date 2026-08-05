import type { PrototypeState } from "../scenarios/state";
import type { CheckInStatus } from "../entities";

export function validateCheckInTransition(
  state: PrototypeState,
  bookingId: string,
  targetStatus: CheckInStatus,
  denialReason?: string,
  hasAuditedOverride?: boolean
): { isValid: boolean; error?: string } {
  const booking = state.bookings.find((b) => b.id === bookingId);
  const checkInRecord = (state.checkInRecords ?? []).find((c) => c.bookingId === bookingId);

  if (!booking) return { isValid: false, error: "Booking record not found." };

  if (booking.status.includes("cancelled")) {
    return { isValid: false, error: "Cannot check in cancelled booking." };
  }

  if (targetStatus === "denied" && (!denialReason || !denialReason.trim())) {
    return { isValid: false, error: "Denial reason is mandatory when denying entry." };
  }

  const currentStatus = checkInRecord?.status ?? "expected";

  // Prevent redundant identical transitions
  if (currentStatus === targetStatus) {
    return { isValid: false, error: `Participant is already in '${targetStatus}' state.` };
  }

  // Allowed transitions per Correction 3:
  if (currentStatus === "no-show" && (targetStatus === "checked-in" || targetStatus === "late")) {
    if (!hasAuditedOverride) {
      return { isValid: false, error: "Audited correction required to check in a participant marked no-show." };
    }
  }

  if (currentStatus === "denied" && targetStatus === "checked-in") {
    if (!hasAuditedOverride) {
      return { isValid: false, error: "Audited override required to check in a denied participant." };
    }
  }

  return { isValid: true };
}
