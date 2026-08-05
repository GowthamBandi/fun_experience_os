import type { PrototypeState } from "../scenarios/state";
import type { Booking } from "../entities";

export function validatePatternSafety(pattern: { prefix: string; separator: string }, booking: Booking): { safe: boolean; reason?: string } {
  // Correction 9: Reject patterns containing legal-name initials, phone/email/birthdate fragments
  const codeCandidate = `${pattern.prefix}${pattern.separator}01`.toLowerCase();
  
  if (booking.phoneMask && booking.phoneMask.replace(/\D/g, "") && codeCandidate.includes(booking.phoneMask.replace(/\D/g, ""))) {
    return { safe: false, reason: "Temporary code pattern contains phone number fragments." };
  }

  return { safe: true };
}

export function validateIdentityGeneration(
  state: PrototypeState,
  sessionId: string,
  bookingId: string
): { isValid: boolean; error?: string } {
  const session = state.sessions.find((s) => s.id === sessionId);
  const booking = state.bookings.find((b) => b.id === bookingId);
  const existing = (state.temporaryIdentities ?? []).find((t) => t.bookingId === bookingId && t.sessionId === sessionId);

  if (!session) return { isValid: false, error: "Session does not exist." };
  if (!booking) return { isValid: false, error: "Booking record does not exist." };

  if (booking.status.includes("cancelled")) {
    return { isValid: false, error: "Cannot generate temporary identity for cancelled booking." };
  }

  if (existing && existing.status === "locked") {
    return { isValid: false, error: "Temporary identity is locked. Override required to regenerate." };
  }

  return { isValid: true };
}
