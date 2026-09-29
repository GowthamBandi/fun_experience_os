import type { PrototypeState } from "../scenarios/state";
import type { IdentityPattern } from "../entities";
import { isEligibleBooking } from "../selectors/identity";

export const IDENTITY_SEPARATORS = ["-", "#", ".", ""] as const;

/**
 * A temporary identity must never carry personal data. Codes are built only
 * from a letters-only prefix, a fixed separator and a sequence number, so a
 * pattern cannot embed phone, birth-date or name fragments.
 */
export function validatePatternSafety(
  pattern: Pick<IdentityPattern, "prefix" | "separator" | "numberLength">,
): { safe: boolean; reason?: string } {
  const prefix = pattern.prefix ?? "";
  if (!/^[A-Za-z]{2,8}$/.test(prefix)) {
    return { safe: false, reason: "Prefix must be 2–8 letters (A–Z). Digits and symbols are not allowed because they can carry personal data." };
  }
  if (!(IDENTITY_SEPARATORS as readonly string[]).includes(pattern.separator)) {
    return { safe: false, reason: "Separator must be a hyphen, hash, dot or nothing." };
  }
  if (!Number.isInteger(pattern.numberLength) || pattern.numberLength < 2 || pattern.numberLength > 4) {
    return { safe: false, reason: "Number length must be 2, 3 or 4 digits." };
  }
  return { safe: true };
}

/** Largest sequence number a pattern can produce. */
export const patternCapacity = (numberLength: number) => 10 ** numberLength - 1;

export function validateIdentityGeneration(
  state: PrototypeState,
  sessionId: string,
  bookingId: string,
): { isValid: boolean; error?: string } {
  const session = state.sessions.find((s) => s.id === sessionId);
  const booking = state.bookings.find((b) => b.id === bookingId);
  const existing = (state.temporaryIdentities ?? []).find((t) => t.bookingId === bookingId && t.sessionId === sessionId);

  if (!session) return { isValid: false, error: "Session does not exist." };
  if (!booking || booking.sessionId !== sessionId) return { isValid: false, error: "Booking does not belong to this session." };
  if (!isEligibleBooking(booking)) return { isValid: false, error: `Booking ${booking.alias} is not confirmed.` };
  if (existing?.status === "locked") return { isValid: false, error: "Temporary identity is locked." };
  if (existing?.status === "revealed") return { isValid: false, error: "Temporary identity has already been revealed." };

  return { isValid: true };
}
