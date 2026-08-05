import type { PrototypeState } from "../scenarios/state";
import { selectPreRevealPreview, selectPostRevealPreview } from "./reveal";

const FORBIDDEN_KEYS = [
  "legalName",
  "phone",
  "email",
  "dateOfBirth",
  "identityDocument",
  "emergencyContact",
  "privateOperationalNote",
];

export function verifyParticipantPrivacyCompliance(
  state: PrototypeState,
  sessionId: string,
  bookingId: string
): { compliant: boolean; violations: string[] } {
  const violations: string[] = [];

  const prePreview = selectPreRevealPreview(state, sessionId);
  const postPreview = selectPostRevealPreview(state, sessionId, bookingId);

  const checkObject = (obj: any, path: string) => {
    if (!obj || typeof obj !== "object") return;
    Object.keys(obj).forEach((key) => {
      if (FORBIDDEN_KEYS.includes(key)) {
        violations.push(`Privacy Violation in ${path}: Forbidden property '${key}' found.`);
      }
      if (typeof obj[key] === "object" && obj[key] !== null) {
        checkObject(obj[key], `${path}.${key}`);
      }
    });
  };

  checkObject(prePreview, "PreRevealPreview");
  checkObject(postPreview, "PostRevealPreview");

  return {
    compliant: violations.length === 0,
    violations,
  };
}
