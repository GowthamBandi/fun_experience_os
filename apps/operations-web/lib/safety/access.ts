import type { RoleId } from "@/lib/types";

export type SafetyAction =
  | "report-incident"
  | "triage-incident"
  | "assign-investigator"
  | "escalate-incident"
  | "close-incident"
  | "submit-dispute"
  | "decide-dispute"
  | "propose-moderation"
  | "approve-moderation-warning"
  | "approve-moderation-suspension"
  | "approve-moderation-ban"
  | "recommend-refund"
  | "approve-refund-exception";

/**
 * Gated role-access policy matrix for SA-P2H operations.
 */
export function canPerformSafetyAction(roleId: RoleId, action: SafetyAction): boolean {
  switch (action) {
    case "report-incident":
    case "submit-dispute":
    case "recommend-refund":
      // All roles can report incidents, submit disputes, or recommend refund exceptions
      return true;

    case "triage-incident":
    case "assign-investigator":
    case "escalate-incident":
    case "propose-moderation":
      // Lead coordinator and above can triage, assign investigator, escalate, or propose actions
      return [
        "platform-owner",
        "hq-operations",
        "territory-manager",
        "city-manager",
        "venue-manager",
        "lead-coordinator"
      ].includes(roleId);

    case "close-incident":
    case "decide-dispute":
    case "approve-moderation-warning":
      // Venue managers and above can resolve cases/warnings or close incidents
      return [
        "platform-owner",
        "hq-operations",
        "territory-manager",
        "city-manager",
        "venue-manager"
      ].includes(roleId);

    case "approve-moderation-suspension":
    case "approve-refund-exception":
      // Territory manager and above can approve suspensions or finance refund exceptions
      return ["platform-owner", "hq-operations", "territory-manager"].includes(roleId);

    case "approve-moderation-ban":
      // Platform Owner only for permanent bans
      return roleId === "platform-owner";

    default:
      return false;
  }
}
