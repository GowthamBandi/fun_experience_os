import type { PrototypeState } from "../scenarios/state";
import type { ModerationAction, RefundException } from "../entities";
import { evaluateSubjectEligibility, moderationActionState } from "../services/moderation";
import { operatorName, sessionTitle } from "./lookups";
import { toMillis } from "@/lib/safety/time";

export interface ModerationActionRow extends ModerationAction {
  effectiveState: ReturnType<typeof moderationActionState>;
  proposerName: string;
  approverName?: string;
  scopeLabel: string;
}

function scopeLabel(state: PrototypeState, a: ModerationAction): string {
  if (a.scope === "platform" || !a.scopeEntityId) return "Whole platform";
  if (a.scope === "venue") return state.venues.find((v) => v.id === a.scopeEntityId)?.name ?? a.scopeEntityId;
  if (a.scope === "territory") return state.territories.find((t) => t.id === a.scopeEntityId)?.name ?? a.scopeEntityId;
  if (a.scope === "tournament") return state.tournaments.find((t) => t.id === a.scopeEntityId)?.name ?? a.scopeEntityId;
  if (a.scope === "city") return state.cities.find((c) => c.id === a.scopeEntityId)?.name ?? a.scopeEntityId;
  return a.scopeEntityId;
}

export function moderationActionRows(state: PrototypeState, now: number = Date.now()): ModerationActionRow[] {
  return (state.moderationActions ?? []).map((a) => ({
    ...a,
    effectiveState: moderationActionState(a, now),
    proposerName: operatorName(state, a.createdBy),
    approverName: a.approvedBy ? operatorName(state, a.approvedBy) : undefined,
    scopeLabel: scopeLabel(state, a),
  }));
}

export function moderationCaseRows(state: PrototypeState, now: number = Date.now()) {
  const actions = moderationActionRows(state, now);
  const ORDER: Record<string, number> = { "action-proposed": 0, open: 1, reviewing: 1, monitoring: 2, approved: 3, rejected: 3, closed: 4 };
  return (state.moderationCases ?? [])
    .map((c) => {
      const mine = actions.filter((a) => a.caseId === c.id);
      return {
        ...c,
        subject: c.subjectTemporaryId || c.subjectPersonId || "Unknown subject",
        reviewerName: c.assignedReviewerId ? operatorName(state, c.assignedReviewerId) : undefined,
        pending: mine.find((a) => a.status === "proposed"),
        inForce: mine.filter((a) => a.effectiveState === "in-force" || a.effectiveState === "scheduled"),
        history: mine,
      };
    })
    .sort((a, b) => (ORDER[a.status] ?? 5) - (ORDER[b.status] ?? 5) || (toMillis(b.updatedAt) || 0) - (toMillis(a.updatedAt) || 0));
}

export function moderationCaseDetail(state: PrototypeState, caseId: string, now: number = Date.now()) {
  return moderationCaseRows(state, now).find((c) => c.id === caseId);
}

export function subjectEligibility(
  state: PrototypeState,
  subjectId: string,
  context: { sessionId?: string; venueId?: string; territoryId?: string; tournamentId?: string },
  now: number = Date.now(),
): { isEligible: boolean; blockReason?: string } {
  return evaluateSubjectEligibility(state, subjectId, context, now);
}

export interface RefundExceptionRow extends RefundException {
  recommendedByName: string;
  decidedByName?: string;
  contextLabel: string;
  territoryId?: string;
}

export function refundExceptionRows(state: PrototypeState, territoryId?: string): RefundExceptionRow[] {
  const ORDER: Record<string, number> = { recommended: 0, "under-review": 0, approved: 1, completed: 2, rejected: 2 };
  return (state.refundExceptions ?? [])
    .map((re) => {
      const session = re.sessionId ? state.sessions.find((s) => s.id === re.sessionId) : undefined;
      const tournament = re.tournamentId ? state.tournaments.find((t) => t.id === re.tournamentId) : undefined;
      const incident = re.incidentId ? state.incidents.find((i) => i.id === re.incidentId) : undefined;
      const terr = session?.territoryId ?? tournament?.territoryId ?? incident?.territoryId;
      return {
        ...re,
        territoryId: terr,
        recommendedByName: operatorName(state, re.recommendedBy),
        decidedByName: re.approvedBy ? operatorName(state, re.approvedBy) : re.rejectedBy ? operatorName(state, re.rejectedBy) : undefined,
        contextLabel: [incident?.incidentCode, session ? sessionTitle(state, session.id) : tournament?.name, re.bookingId ? `booking ${re.bookingId}` : undefined].filter(Boolean).join(" · ") || "Not linked",
      };
    })
    .filter((re) => !territoryId || !re.territoryId || re.territoryId === territoryId)
    .sort((a, b) => (ORDER[a.status] ?? 3) - (ORDER[b.status] ?? 3) || (toMillis(b.recommendedAt) || 0) - (toMillis(a.recommendedAt) || 0));
}
