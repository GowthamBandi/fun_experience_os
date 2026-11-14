/**
 * The booking alias rule, mirrored from PULSE `AliasGenerator.validate`
 * (lib/src/features/booking/alias_generator.dart). The app checks first for a
 * friendly message; this is the boundary, so a direct callable can't book
 * under a phone number, markup or a 40-character string.
 */
export const ALIAS_MIN = 2;
export const ALIAS_MAX = 24;
const ALLOWED = /^[A-Za-z0-9 .'_-]+$/;

/** Message for an unacceptable alias, or null when it is fine. */
export function aliasProblem(raw: string): string | null {
  const value = raw.trim();
  if (value.length < ALIAS_MIN || value.length > ALIAS_MAX) {
    return `Use an alias between ${ALIAS_MIN} and ${ALIAS_MAX} characters.`;
  }
  if (!ALLOWED.test(value)) return "Use letters, numbers, spaces and . ' _ - only in your alias.";
  if (/\d{6,}/.test(value.replace(/ /g, ""))) return "Avoid phone numbers or IDs in your alias.";
  return null;
}
