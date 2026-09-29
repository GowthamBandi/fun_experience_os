import type { PrototypeState } from "../scenarios/state";
import type { ModerationAction, ModerationActionType, ModerationScope } from "../entities";
import type { RoleId } from "@/lib/types";
import { canPerformSafetyAction, safetyDenialReason } from "@/lib/safety/access";

type Check = { isValid: boolean; error?: string };
const ok: Check = { isValid: true };
const fail = (error: string): Check => ({ isValid: false, error });

/** Actions whose approval needs a second person (the proposer can't approve their own). */
export const FOUR_EYES_ACTIONS: ModerationActionType[] = ["temporary-suspension", "permanent-ban"];
/** Actions that must carry an expiry date. */
export const EXPIRING_ACTIONS: ModerationActionType[] = ["temporary-suspension", "venue-restriction", "activity-restriction"];
/** Actions that change what a participant may book (warnings and notes do not). */
export const BLOCKING_ACTIONS: ModerationActionType[] = ["temporary-suspension", "permanent-ban", "venue-restriction", "activity-restriction"];

/** Parse an ISO date/datetime (or YYYY-MM-DD). Returns NaN for free text such as "Next week". */
export function parseModerationDate(value?: string): number {
  if (!value) return NaN;
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : NaN;
}

export function validateModerationActionProposal(
  state: PrototypeState,
  params: {
    caseId: string;
    type: ModerationActionType;
    reason: string;
    scope: ModerationScope;
    scopeEntityId?: string;
    effectiveDate: string;
    expiryDate?: string;
  },
): Check {
  const mCase = (state.moderationCases ?? []).find((c) => c.id === params.caseId);
  if (!mCase) return fail("This moderation case no longer exists.");
  if (mCase.status === "closed") return fail("This case is closed. Open a new case to propose another action.");
  if (!mCase.subjectTemporaryId && !mCase.subjectPersonId) return fail("The case has no subject to act on.");
  if ((state.moderationActions ?? []).some((a) => a.caseId === params.caseId && a.status === "proposed")) {
    return fail("This case already has a proposal waiting for a decision. Approve or reject it first.");
  }
  if (!params.type) return fail("Choose the action type.");
  if (!params.reason || params.reason.trim().length < 10) return fail("Explain the reason for the proposed action (at least 10 characters).");

  const effective = parseModerationDate(params.effectiveDate);
  if (!Number.isFinite(effective)) return fail("Choose the date the action takes effect.");
  const expiry = parseModerationDate(params.expiryDate);

  if (params.type === "permanent-ban") {
    if (params.scope !== "platform") return fail("A permanent ban always applies to the whole platform.");
    if (params.expiryDate) return fail("A permanent ban has no expiry date.");
  }
  if (EXPIRING_ACTIONS.includes(params.type)) {
    if (!Number.isFinite(expiry)) return fail("Choose when this action expires.");
    if (expiry <= effective) return fail("The expiry date must be after the effective date.");
  }
  if (params.type === "venue-restriction" && (params.scope !== "venue" || !params.scopeEntityId)) return fail("A venue restriction needs the venue it applies to.");
  if (params.type === "activity-restriction" && (!["tournament", "activity-category"].includes(params.scope) || !params.scopeEntityId)) {
    return fail("An activity restriction needs the tournament or activity it applies to.");
  }
  if (params.scope !== "platform" && !params.scopeEntityId) return fail(`Choose the ${params.scope.replace(/-/g, " ")} this action applies to.`);
  return ok;
}

/**
 * Who may approve a proposal: Safety desk for everything except permanent
 * bans (Platform Owner / Super Admin). Suspensions and bans need a second
 * person — the proposer can't approve their own.
 */
export function validateActionApprovalAuthority(action: ModerationAction, approverRole: RoleId, approverId?: string): Check {
  const needed = action.type === "permanent-ban" ? "moderation.approve-ban" : "moderation.approve";
  if (!canPerformSafetyAction(approverRole, needed)) return fail(safetyDenialReason(needed));
  if (approverId && FOUR_EYES_ACTIONS.includes(action.type) && action.createdBy === approverId) {
    return fail("Suspensions and bans need a second person: someone other than the proposer must approve.");
  }
  return ok;
}
