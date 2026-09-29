/**
 * Dispute commands: submitted → under review ⇄ evidence requested →
 * upheld | partially upheld | rejected → closed.
 */
import type { PrototypeState } from "../scenarios/state";
import type { Dispute, DisputeType } from "../entities";
import { nextId, pushAudit, pushSignal } from "./helpers";
import { isoNow, refuse, type CommandResult } from "./outcome";
import { authorizeSafetyAction, canPerformSafetyAction, type SafetyAction } from "@/lib/safety/access";
import {
  validateDisputeResolution,
  validateDisputeSubmission,
  OPEN_DISPUTE_STATUSES,
  DECIDED_DISPUTE_STATUSES,
  type DisputeOutcome,
} from "../validators/disputeValidation";

/** Territory of the record a dispute concerns (for scoped roles). */
export function disputeTerritory(state: PrototypeState, d: Pick<Dispute, "tournamentId" | "sessionId">): string | undefined {
  if (d.tournamentId) return state.tournaments.find((t) => t.id === d.tournamentId)?.territoryId;
  if (d.sessionId) return state.sessions.find((s) => s.id === d.sessionId)?.territoryId;
  return undefined;
}

function guard(state: PrototypeState, actorId: string, action: SafetyAction, territoryId?: string): string | undefined {
  const auth = authorizeSafetyAction(state, actorId, action, { territoryId });
  return auth.ok ? undefined : auth.error;
}

function patch(state: PrototypeState, id: string, change: Partial<Dispute>): PrototypeState {
  return { ...state, disputes: state.disputes.map((d) => (d.id === id ? { ...d, ...change, updatedAt: isoNow() } : d)) };
}

const stamp = (label: string, text: string) => `${label} (${new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}): ${text.trim()}`;

export interface DisputeInput {
  type: DisputeType;
  reason: string;
  /** Who raised it: team captain, customer, staff member. */
  submittedBy: string;
  relatedEntityType: string;
  relatedEntityId: string;
  tournamentId?: string;
  matchId?: string;
  sessionId?: string;
  bookingId?: string;
}

/** 1. Log a dispute raised by a participant, customer or staff member. */
export function submitDispute(state: PrototypeState, params: DisputeInput, operatorId: string): CommandResult<{ id: string }> {
  const denied = guard(state, operatorId, "dispute.submit", disputeTerritory(state, params));
  if (denied) return refuse(state, denied);
  const check = validateDisputeSubmission(params);
  if (!check.isValid) return refuse(state, check.error!);

  const disputes = state.disputes ?? [];
  const id = nextId("disp", disputes.map((d) => d.id));
  const now = isoNow();
  const dispute: Dispute = {
    id,
    type: params.type,
    status: "submitted",
    reason: params.reason.trim(),
    relatedEntityType: params.relatedEntityType,
    relatedEntityId: params.relatedEntityId,
    tournamentId: params.tournamentId,
    matchId: params.matchId,
    sessionId: params.sessionId,
    bookingId: params.bookingId,
    submittedBy: params.submittedBy.trim(),
    submittedAt: now,
    recordedBy: operatorId,
    createdAt: now,
    updatedAt: now,
  };
  let next: PrototypeState = { ...state, disputes: [...disputes, dispute] };
  next = pushAudit(next, { action: "Dispute Submitted", description: `Logged dispute ${id} (${params.type}) raised by ${dispute.submittedBy}.`, operatorId, sessionId: params.sessionId });
  next = pushSignal(next, { kind: "alert", message: `New dispute ${id}: ${params.type.replace(/-/g, " ")}`, sessionId: params.sessionId });
  return { state: next, id };
}

/** 2. Assign (or reassign) the reviewer. */
export function assignDisputeReviewer(state: PrototypeState, disputeId: string, reviewerId: string, operatorId: string): CommandResult {
  const d = state.disputes.find((x) => x.id === disputeId);
  if (!d) return refuse(state, "This dispute no longer exists.");
  const denied = guard(state, operatorId, "dispute.assign", disputeTerritory(state, d));
  if (denied) return refuse(state, denied);
  if (!OPEN_DISPUTE_STATUSES.includes(d.status)) return refuse(state, `This dispute is already ${d.status.replace(/-/g, " ")}.`);
  const reviewer = state.operators.find((o) => o.id === reviewerId);
  if (!reviewer || reviewer.status === "suspended") return refuse(state, "Choose an active operator as reviewer.");
  if (!canPerformSafetyAction(reviewer.role, "dispute.decide")) return refuse(state, `${reviewer.name} can't decide disputes in their role. Choose a Safety & Moderation Officer, Super Admin or Platform Owner.`);
  let next = patch(state, disputeId, { reviewerId, assignedAt: isoNow(), status: d.status === "submitted" ? "under-review" : d.status });
  next = pushAudit(next, { action: "Dispute Reviewer Assigned", description: `${reviewer.name} is reviewing dispute ${disputeId}.`, operatorId });
  return { state: next };
}

/** 3. Ask the parties for evidence. */
export function requestDisputeEvidence(state: PrototypeState, disputeId: string, request: string, operatorId: string): CommandResult {
  const d = state.disputes.find((x) => x.id === disputeId);
  if (!d) return refuse(state, "This dispute no longer exists.");
  const denied = guard(state, operatorId, "dispute.request-evidence", disputeTerritory(state, d));
  if (denied) return refuse(state, denied);
  if (d.status !== "under-review" && d.status !== "evidence-requested") return refuse(state, "Evidence can be requested while the dispute is under review.");
  if (!d.reviewerId) return refuse(state, "Assign a reviewer first.");
  if (!request || request.trim().length < 10) return refuse(state, "Say what evidence is needed (at least 10 characters).");
  let next = patch(state, disputeId, {
    status: "evidence-requested",
    evidenceRequested: true,
    evidenceRequestedAt: isoNow(),
    notes: d.notes ? `${d.notes}\n${stamp("Evidence requested", request)}` : stamp("Evidence requested", request),
  });
  next = pushAudit(next, { action: "Dispute Evidence Requested", description: `Requested evidence for dispute ${disputeId}: ${request.trim()}`, operatorId });
  return { state: next };
}

export interface DisputeDecisionInput {
  disputeId: string;
  outcome: DisputeOutcome;
  decision: string;
  decisionReason: string;
}

/** 4. Record the decision: upheld, partially upheld or rejected. */
export function decideDispute(state: PrototypeState, params: DisputeDecisionInput, operatorId: string): CommandResult {
  const d = state.disputes.find((x) => x.id === params.disputeId);
  if (!d) return refuse(state, "This dispute no longer exists.");
  const denied = guard(state, operatorId, "dispute.decide", disputeTerritory(state, d));
  if (denied) return refuse(state, denied);
  const check = validateDisputeResolution(d, params.outcome, params.decision, params.decisionReason);
  if (!check.isValid) return refuse(state, check.error!);
  let next = patch(state, params.disputeId, {
    status: params.outcome,
    decision: params.decision.trim(),
    decisionReason: params.decisionReason.trim(),
    decidedBy: operatorId,
    decidedAt: isoNow(),
  });
  next = pushAudit(next, {
    action: "Dispute Decided",
    description: `Dispute ${params.disputeId} ${params.outcome.replace(/-/g, " ")}: ${params.decision.trim()} Reason: ${params.decisionReason.trim()}`,
    operatorId,
  });
  return { state: next };
}

/** 5. Close a decided dispute. */
export function closeDispute(state: PrototypeState, disputeId: string, operatorId: string): CommandResult {
  const d = state.disputes.find((x) => x.id === disputeId);
  if (!d) return refuse(state, "This dispute no longer exists.");
  const denied = guard(state, operatorId, "dispute.close", disputeTerritory(state, d));
  if (denied) return refuse(state, denied);
  if (!DECIDED_DISPUTE_STATUSES.includes(d.status)) return refuse(state, d.status === "closed" ? "This dispute is already closed." : "Record a decision before closing the dispute.");
  let next = patch(state, disputeId, { status: "closed", closedAt: isoNow(), closedBy: operatorId });
  next = pushAudit(next, { action: "Dispute Closed", description: `Closed dispute ${disputeId} (${d.status.replace(/-/g, " ")}).`, operatorId });
  return { state: next };
}
