/**
 * Moderation cases and actions.
 *
 * Case: open → action-proposed → approved | reviewing (after a rejection) → closed.
 * Action: proposed → active (or approved, if it takes effect later) → revoked;
 * proposed → rejected. Expiry is evaluated at read time: an action past its
 * expiry date no longer blocks the subject.
 */
import type { PrototypeState } from "../scenarios/state";
import type {
  ModerationCase,
  ModerationCaseCategory,
  ModerationCaseSeverity,
  ModerationAction,
  ModerationActionType,
  ModerationScope,
} from "../entities";
import { nextId, pushAudit, pushSignal } from "./helpers";
import { isoNow, refuse, type CommandResult } from "./outcome";
import { authorizeSafetyAction, type SafetyAction } from "@/lib/safety/access";
import {
  validateActionApprovalAuthority,
  validateModerationActionProposal,
  parseModerationDate,
  BLOCKING_ACTIONS,
} from "../validators/moderationValidation";

const subjectOf = (x: { subjectTemporaryId?: string; subjectPersonId?: string }) => x.subjectTemporaryId || x.subjectPersonId || "unknown subject";
const label = (t: ModerationActionType) => t.replace(/-/g, " ");

function guard(state: PrototypeState, actorId: string, action: SafetyAction): { error?: string; role?: string } {
  const auth = authorizeSafetyAction(state, actorId, action);
  return auth.ok ? { role: auth.actor.role } : { error: auth.error };
}

export interface ModerationCaseInput {
  subjectTemporaryId?: string;
  subjectPersonId?: string;
  relatedIncidentIds?: string[];
  relatedSessionIds?: string[];
  relatedTournamentIds?: string[];
  relatedDisputeIds?: string[];
  category: ModerationCaseCategory;
  severity: ModerationCaseSeverity;
  originType: string;
  originId: string;
  notes: string;
}

/** 1. Open a moderation case about a participant. */
export function createModerationCase(state: PrototypeState, params: ModerationCaseInput, operatorId: string): CommandResult<{ id: string }> {
  const g = guard(state, operatorId, "moderation.open-case");
  if (g.error) return refuse(state, g.error);
  const subject = (params.subjectTemporaryId || params.subjectPersonId || "").trim();
  if (subject.length < 2) return refuse(state, "Enter the participant's temporary ID or person reference.");
  if (!params.category) return refuse(state, "Choose the case category.");
  if (!params.severity) return refuse(state, "Choose the case severity.");
  if (!params.notes || params.notes.trim().length < 10) return refuse(state, "Summarise why the case is being opened (at least 10 characters).");

  const cases = state.moderationCases ?? [];
  const id = nextId("mod-case", cases.map((c) => c.id));
  const now = isoNow();
  const mCase: ModerationCase = {
    id,
    subjectTemporaryId: params.subjectTemporaryId?.trim() || undefined,
    subjectPersonId: params.subjectPersonId?.trim() || undefined,
    relatedIncidentIds: params.relatedIncidentIds ?? [],
    relatedSessionIds: params.relatedSessionIds ?? [],
    relatedTournamentIds: params.relatedTournamentIds ?? [],
    relatedDisputeIds: params.relatedDisputeIds ?? [],
    category: params.category,
    severity: params.severity,
    status: "open",
    assignedReviewerId: operatorId,
    originType: params.originType,
    originId: params.originId,
    notes: params.notes.trim(),
    createdAt: now,
    updatedAt: now,
  };
  let next: PrototypeState = { ...state, moderationCases: [...cases, mCase] };
  next = pushAudit(next, { action: "Moderation Case Opened", description: `Opened moderation case ${id} about ${subject} (${params.category}, ${params.severity}).`, operatorId });
  return { state: next, id };
}

export interface ModerationProposalInput {
  caseId: string;
  type: ModerationActionType;
  reason: string;
  scope: ModerationScope;
  scopeEntityId?: string;
  effectiveDate: string;
  expiryDate?: string;
}

/** 2. Propose an action on the case's subject. */
export function proposeModerationAction(state: PrototypeState, params: ModerationProposalInput, operatorId: string): CommandResult<{ id: string }> {
  const g = guard(state, operatorId, "moderation.propose");
  if (g.error) return refuse(state, g.error);
  const check = validateModerationActionProposal(state, params);
  if (!check.isValid) return refuse(state, check.error!);
  const mCase = state.moderationCases.find((c) => c.id === params.caseId)!;

  const actions = state.moderationActions ?? [];
  const id = nextId("mod-act", actions.map((a) => a.id));
  const now = isoNow();
  const action: ModerationAction = {
    id,
    caseId: params.caseId,
    type: params.type,
    subjectTemporaryId: mCase.subjectTemporaryId,
    subjectPersonId: mCase.subjectPersonId,
    reason: params.reason.trim(),
    evidenceIds: mCase.evidencePlaceholderIds,
    scope: params.scope,
    scopeEntityId: params.scope === "platform" ? undefined : params.scopeEntityId,
    effectiveDate: new Date(parseModerationDate(params.effectiveDate)).toISOString(),
    expiryDate: params.expiryDate ? new Date(parseModerationDate(params.expiryDate)).toISOString() : undefined,
    status: "proposed",
    createdBy: operatorId,
    createdAt: now,
    updatedAt: now,
  };
  let next: PrototypeState = {
    ...state,
    moderationActions: [...actions, action],
    moderationCases: state.moderationCases.map((c) =>
      c.id === params.caseId ? { ...c, status: "action-proposed" as const, recommendedAction: params.type, updatedAt: now } : c,
    ),
  };
  next = pushAudit(next, { action: "Moderation Action Proposed", description: `Proposed ${label(params.type)} (${id}) for ${subjectOf(mCase)} on case ${params.caseId}.`, operatorId });
  return { state: next, id };
}

/** 3. Approve a proposal. Takes effect now, or on its effective date. */
export function approveModerationAction(state: PrototypeState, actionId: string, operatorId: string): CommandResult {
  const action = (state.moderationActions ?? []).find((a) => a.id === actionId);
  if (!action) return refuse(state, "This proposal no longer exists.");
  const g = guard(state, operatorId, "moderation.approve");
  if (g.error) return refuse(state, g.error);
  if (action.status !== "proposed") return refuse(state, `This action is already ${action.status}.`);
  const actor = state.operators.find((o) => o.id === operatorId)!;
  const authority = validateActionApprovalAuthority(action, actor.role, operatorId);
  if (!authority.isValid) return refuse(state, authority.error!);
  const expiry = parseModerationDate(action.expiryDate);
  if (Number.isFinite(expiry) && expiry <= Date.now()) return refuse(state, "This proposal's expiry date has already passed. Reject it and propose a new action.");

  const now = isoNow();
  const effective = parseModerationDate(action.effectiveDate);
  const status = Number.isFinite(effective) && effective > Date.now() ? "approved" : "active";
  let next: PrototypeState = {
    ...state,
    moderationActions: state.moderationActions.map((a) => (a.id === actionId ? { ...a, status, approvedBy: operatorId, approvedAt: now, updatedAt: now } : a)),
    moderationCases: state.moderationCases.map((c) =>
      c.id === action.caseId
        ? {
            ...c,
            status: "approved" as const,
            decision: `Approved ${label(action.type)}`,
            decisionReason: action.reason,
            decidedBy: operatorId,
            decidedAt: now,
            previousActionIds: [...new Set([...(c.previousActionIds ?? []), actionId])],
            updatedAt: now,
          }
        : c,
    ),
  };
  next = pushAudit(next, { action: "Moderation Action Approved", description: `Approved ${label(action.type)} (${actionId}) for ${subjectOf(action)}${status === "approved" ? `, effective ${new Date(effective).toLocaleDateString("en-IN", { dateStyle: "medium" })}` : ""}.`, operatorId });
  if (BLOCKING_ACTIONS.includes(action.type)) {
    next = pushSignal(next, { kind: "alert", message: `Moderation: ${label(action.type)} ${status === "active" ? "now active" : "scheduled"} for ${subjectOf(action)}` });
  }
  return { state: next };
}

/** 4. Reject a proposal with a reason; the case returns to review. */
export function rejectModerationAction(state: PrototypeState, actionId: string, reason: string, operatorId: string): CommandResult {
  const action = (state.moderationActions ?? []).find((a) => a.id === actionId);
  if (!action) return refuse(state, "This proposal no longer exists.");
  const g = guard(state, operatorId, "moderation.reject");
  if (g.error) return refuse(state, g.error);
  if (action.status !== "proposed") return refuse(state, `This action is already ${action.status}.`);
  if (!reason || reason.trim().length < 10) return refuse(state, "Explain why the proposal is rejected (at least 10 characters).");
  const now = isoNow();
  let next: PrototypeState = {
    ...state,
    moderationActions: state.moderationActions.map((a) =>
      a.id === actionId ? { ...a, status: "rejected" as const, rejectedBy: operatorId, rejectedAt: now, rejectionReason: reason.trim(), updatedAt: now } : a,
    ),
    moderationCases: state.moderationCases.map((c) =>
      c.id === action.caseId
        ? { ...c, status: "reviewing" as const, notes: `${c.notes ?? ""}\nProposal ${actionId} (${label(action.type)}) rejected: ${reason.trim()}`.trim(), updatedAt: now }
        : c,
    ),
  };
  next = pushAudit(next, { action: "Moderation Action Rejected", description: `Rejected ${label(action.type)} proposal ${actionId}. Reason: ${reason.trim()}`, operatorId });
  return { state: next };
}

/** 5. Revoke an active or scheduled action. */
export function revokeModerationAction(state: PrototypeState, actionId: string, reason: string, operatorId: string): CommandResult {
  const action = (state.moderationActions ?? []).find((a) => a.id === actionId);
  if (!action) return refuse(state, "This action no longer exists.");
  const g = guard(state, operatorId, action.type === "permanent-ban" ? "moderation.revoke-ban" : "moderation.revoke");
  if (g.error) return refuse(state, g.error);
  if (action.status !== "active" && action.status !== "approved") return refuse(state, "Only an active or scheduled action can be revoked.");
  if (!reason || reason.trim().length < 10) return refuse(state, "Explain why the action is revoked (at least 10 characters).");
  const now = isoNow();
  let next: PrototypeState = {
    ...state,
    moderationActions: state.moderationActions.map((a) =>
      a.id === actionId ? { ...a, status: "revoked" as const, revokedBy: operatorId, revokedAt: now, revocationReason: reason.trim(), updatedAt: now } : a,
    ),
  };
  next = pushAudit(next, { action: "Moderation Action Revoked", description: `Revoked ${label(action.type)} ${actionId} for ${subjectOf(action)}. Reason: ${reason.trim()}`, operatorId });
  return { state: next };
}

/** 6. Close a case once nothing is pending on it. */
export function closeModerationCase(state: PrototypeState, caseId: string, note: string, operatorId: string): CommandResult {
  const mCase = (state.moderationCases ?? []).find((c) => c.id === caseId);
  if (!mCase) return refuse(state, "This case no longer exists.");
  const g = guard(state, operatorId, "moderation.propose");
  if (g.error) return refuse(state, g.error);
  if (mCase.status === "closed") return refuse(state, "This case is already closed.");
  if ((state.moderationActions ?? []).some((a) => a.caseId === caseId && a.status === "proposed")) return refuse(state, "Decide the pending proposal before closing the case.");
  if (!note || note.trim().length < 10) return refuse(state, "Summarise the case outcome (at least 10 characters).");
  const now = isoNow();
  let next: PrototypeState = {
    ...state,
    moderationCases: state.moderationCases.map((c) =>
      c.id === caseId ? { ...c, status: "closed" as const, decision: c.decision ?? note.trim(), notes: `${c.notes ?? ""}\nClosed: ${note.trim()}`.trim(), updatedAt: now } : c,
    ),
  };
  next = pushAudit(next, { action: "Moderation Case Closed", description: `Closed moderation case ${caseId}: ${note.trim()}`, operatorId });
  return { state: next };
}

/* ------------------------------ eligibility ------------------------------ */

/** The effective state of an action at `now`: expired or not yet effective actions don't apply. */
export function moderationActionState(a: ModerationAction, now: number = Date.now()): "proposed" | "scheduled" | "in-force" | "expired" | "ended" {
  if (a.status === "proposed") return "proposed";
  if (a.status === "rejected" || a.status === "revoked" || a.status === "expired") return a.status === "expired" ? "expired" : "ended";
  const expiry = parseModerationDate(a.expiryDate);
  if (Number.isFinite(expiry) && expiry <= now) return "expired";
  const effective = parseModerationDate(a.effectiveDate);
  if (Number.isFinite(effective) && effective > now) return "scheduled";
  return "in-force";
}

/**
 * Can this participant take part in the given context? Only actions that are
 * approved/active, already effective and not yet expired can block.
 * Suspensions apply to their scope (platform, or the matching territory/venue);
 * restrictions only apply when the context matches their target.
 */
export function evaluateSubjectEligibility(
  state: PrototypeState,
  subjectId: string,
  context: { sessionId?: string; venueId?: string; territoryId?: string; tournamentId?: string },
  now: number = Date.now(),
): { isEligible: boolean; blockReason?: string } {
  const inForce = (state.moderationActions ?? []).filter(
    (a) =>
      (a.status === "active" || a.status === "approved") &&
      (a.subjectTemporaryId === subjectId || a.subjectPersonId === subjectId) &&
      moderationActionState(a, now) === "in-force",
  );

  const ctxEntity = (scope: ModerationScope): string | undefined =>
    scope === "venue" ? context.venueId : scope === "territory" ? context.territoryId : scope === "tournament" ? context.tournamentId : undefined;

  for (const act of inForce) {
    if (act.type === "permanent-ban") return { isEligible: false, blockReason: `Permanent ban: ${act.reason}` };
    if (act.type === "temporary-suspension") {
      const target = ctxEntity(act.scope);
      // Platform-wide, or scoped and the context is inside (or unknown — err on the side of safety).
      if (act.scope === "platform" || !act.scopeEntityId || target === undefined || target === act.scopeEntityId) {
        const until = parseModerationDate(act.expiryDate);
        return { isEligible: false, blockReason: `Suspended${Number.isFinite(until) ? ` until ${new Date(until).toLocaleDateString("en-IN", { dateStyle: "medium" })}` : ""}: ${act.reason}` };
      }
    }
    if (act.type === "venue-restriction" && context.venueId && act.scopeEntityId === context.venueId) {
      return { isEligible: false, blockReason: `Restricted from this venue: ${act.reason}` };
    }
    if (act.type === "activity-restriction" && context.tournamentId && act.scopeEntityId === context.tournamentId) {
      return { isEligible: false, blockReason: `Restricted from this tournament: ${act.reason}` };
    }
  }
  return { isEligible: true };
}
