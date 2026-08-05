import type { PrototypeState } from "../scenarios/state";
import { selectPreRevealPreview, selectPostRevealPreview } from "./reveal";
import { requestEmergencyIdentityAccess } from "../services/emergencyAccess";

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

export function verifyEmergencyAccessRoleRestrictions(
  state: PrototypeState
): { compliant: boolean; violations: string[] } {
  const violations: string[] = [];

  const allowedRoles = ["platform-owner", "super-admin", "safety", "ops-manager"];
  const forbiddenRoles = ["finance", "marketing", "analyst", "venue-manager", "coordinator", "regional-partner", "city-manager", "staff"];

  // Test allowed roles
  allowedRoles.forEach((roleId) => {
    const res = requestEmergencyIdentityAccess(state, {
      operatorId: `op-${roleId}`,
      operatorRole: roleId,
      reason: "Medical emergency verification",
    });
    if (res.error) {
      violations.push(`Role test failure: Allowed role '${roleId}' was wrongly rejected: ${res.error}`);
    }
  });

  // Test forbidden roles
  forbiddenRoles.forEach((roleId) => {
    const res = requestEmergencyIdentityAccess(state, {
      operatorId: `op-${roleId}`,
      operatorRole: roleId,
      reason: "Medical emergency verification",
    });
    if (!res.error) {
      violations.push(`Security Violation: Disallowed role '${roleId}' was wrongly granted emergency identity access!`);
    }
  });

  return {
    compliant: violations.length === 0,
    violations,
  };
}
