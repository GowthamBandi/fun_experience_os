import type { PrototypeState } from "../scenarios/state";
import type { ModerationCase, ModerationAction, RefundException } from "../entities";
import { evaluateSubjectEligibility } from "../services/moderation";

export function moderationCaseDetail(state: PrototypeState, caseId: string) {
  const mCase = (state.moderationCases ?? []).find((c) => c.id === caseId);
  if (!mCase) return undefined;

  const incidents = (state.incidents ?? []).filter((i) => mCase.relatedIncidentIds?.includes(i.id));
  const disputes = (state.disputes ?? []).filter((d) => mCase.relatedDisputeIds?.includes(d.id));
  const proposedActions = (state.moderationActions ?? []).filter((a) => a.caseId === caseId);

  return {
    ...mCase,
    incidents,
    disputes,
    proposedActions
  };
}

export function activeRestrictions(state: PrototypeState, subjectId: string): ModerationAction[] {
  return (state.moderationActions ?? []).filter(
    (a) =>
      a.status === "active" &&
      (a.subjectTemporaryId === subjectId || a.subjectPersonId === subjectId)
  );
}

export function subjectEligibility(
  state: PrototypeState,
  subjectId: string,
  context: {
    sessionId?: string;
    venueId?: string;
    territoryId?: string;
    tournamentId?: string;
  }
): { isEligible: boolean; blockReason?: string } {
  return evaluateSubjectEligibility(state, subjectId, context);
}

export function refundExceptionQueue(state: PrototypeState, territoryId?: string): RefundException[] {
  const list = state.refundExceptions ?? [];
  return list.filter((re) => {
    if (re.status !== "recommended" && re.status !== "under-review") return false;
    if (!territoryId) return true;
    if (re.sessionId) {
      const s = state.sessions.find((x) => x.id === re.sessionId);
      return s?.territoryId === territoryId;
    }
    if (re.tournamentId) {
      const t = state.tournaments.find((x) => x.id === re.tournamentId);
      return t?.territoryId === territoryId;
    }
    return true;
  });
}
