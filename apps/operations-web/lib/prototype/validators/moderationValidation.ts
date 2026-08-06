import type { PrototypeState } from "../scenarios/state";
import type { ModerationCase, ModerationAction, ModerationActionType } from "../entities";

export function validateModerationActionProposal(
  state: PrototypeState,
  params: {
    caseId: string;
    type: ModerationActionType;
    reason: string;
  }
): { isValid: boolean; error?: string } {
  const mCase = (state.moderationCases ?? []).find((c) => c.id === params.caseId);
  if (!mCase) return { isValid: false, error: "Moderation case does not exist." };

  if (!params.type) return { isValid: false, error: "Moderation action type must be specified." };
  if (!params.reason || params.reason.trim().length < 10) {
    return { isValid: false, error: "Detailed reasoning for the proposed action is required (at least 10 characters)." };
  }
  return { isValid: true };
}

export function validateActionApprovalAuthority(
  action: ModerationAction,
  operatorRole: string
): { isValid: boolean; error?: string } {
  if (action.type === "permanent-ban") {
    // Only platform-owner can approve permanent bans
    if (operatorRole !== "platform-owner") {
      return { isValid: false, error: "Only the Platform Owner is authorized to approve permanent account bans." };
    }
  }

  if (action.type === "temporary-suspension") {
    if (operatorRole !== "platform-owner" && operatorRole !== "hq-operations") {
      return { isValid: false, error: "Only HQ Operations or Platform Owner can approve temporary suspensions." };
    }
  }

  return { isValid: true };
}
