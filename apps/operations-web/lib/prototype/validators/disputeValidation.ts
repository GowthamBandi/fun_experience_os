import type { Dispute, DisputeStatus, DisputeType } from "../entities";

type Check = { isValid: boolean; error?: string };
const ok: Check = { isValid: true };
const fail = (error: string): Check => ({ isValid: false, error });

export type DisputeOutcome = Extract<DisputeStatus, "upheld" | "partially-upheld" | "rejected">;
export const DISPUTE_OUTCOMES: DisputeOutcome[] = ["upheld", "partially-upheld", "rejected"];
export const OPEN_DISPUTE_STATUSES: DisputeStatus[] = ["submitted", "under-review", "evidence-requested", "decision-pending"];
export const DECIDED_DISPUTE_STATUSES: DisputeStatus[] = ["upheld", "partially-upheld", "rejected"];

export function validateDisputeSubmission(params: {
  type: DisputeType;
  reason: string;
  relatedEntityType: string;
  relatedEntityId: string;
  submittedBy: string;
}): Check {
  if (!params.type) return fail("Choose the dispute type.");
  if (!params.reason || params.reason.trim().length < 10) return fail("Describe the dispute (at least 10 characters).");
  if (!params.relatedEntityType || !params.relatedEntityId) return fail("Link the dispute to the match, session, booking or tournament it concerns.");
  if (!params.submittedBy || params.submittedBy.trim().length < 2) return fail("Record who raised the dispute (for example the team captain or customer).");
  return ok;
}

export function validateDisputeResolution(dispute: Dispute, outcome: DisputeOutcome, decision: string, decisionReason: string): Check {
  if (!OPEN_DISPUTE_STATUSES.includes(dispute.status)) return fail(`This dispute is already ${dispute.status.replace(/-/g, " ")}.`);
  if (!dispute.reviewerId) return fail("Assign a reviewer before recording a decision.");
  if (!DISPUTE_OUTCOMES.includes(outcome)) return fail("Choose the outcome: upheld, partially upheld or rejected.");
  if (!decision || decision.trim().length < 5) return fail("State the decision (at least 5 characters).");
  if (!decisionReason || decisionReason.trim().length < 10) return fail("Explain the reasoning for the decision (at least 10 characters).");
  return ok;
}
