import type { PrototypeState } from "../scenarios/state";
import type { Dispute, DisputeType } from "../entities";

export function validateDisputeSubmission(
  params: {
    type: DisputeType;
    reason: string;
    relatedEntityType: string;
    relatedEntityId: string;
    submittedBy: string;
  }
): { isValid: boolean; error?: string } {
  if (!params.type) return { isValid: false, error: "Dispute type is required." };
  if (!params.reason || params.reason.trim().length < 10) {
    return { isValid: false, error: "Detailed dispute reasoning is required (at least 10 characters)." };
  }
  if (!params.relatedEntityType || !params.relatedEntityId) {
    return { isValid: false, error: "Dispute must be linked to a valid system entity." };
  }
  if (!params.submittedBy) return { isValid: false, error: "Submitter identity is required." };
  return { isValid: true };
}

export function validateDisputeResolution(
  dispute: Dispute,
  decision: string,
  decisionReason: string
): { isValid: boolean; error?: string } {
  if (!decision || decision.trim().length < 5) {
    return { isValid: false, error: "A clear decision outcome must be specified." };
  }
  if (!decisionReason || decisionReason.trim().length < 10) {
    return { isValid: false, error: "A detailed justification/reasoning for the decision is required (at least 10 characters)." };
  }
  return { isValid: true };
}
