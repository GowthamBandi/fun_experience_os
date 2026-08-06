import type { PrototypeState } from "../scenarios/state";
import type { Dispute } from "../entities";
import { sessionTitle } from "./lookups";

export interface DisputeRow {
  id: string;
  type: string;
  status: string;
  submittedBy: string;
  submittedAt: string;
  reason: string;
  reviewerId?: string;
  relatedEntityId: string;
  relatedEntityType: string;
}

export function disputeRows(state: PrototypeState, territoryId?: string): DisputeRow[] {
  const list = state.disputes ?? [];
  // Filter by territory if linked to session/tournament in that territory
  const filtered = list.filter((d) => {
    if (!territoryId) return true;
    if (d.tournamentId) {
      const t = state.tournaments.find((x) => x.id === d.tournamentId);
      return t?.territoryId === territoryId;
    }
    if (d.sessionId) {
      const s = state.sessions.find((x) => x.id === d.sessionId);
      return s?.territoryId === territoryId;
    }
    return true;
  });

  return filtered.map((d) => ({
    id: d.id,
    type: d.type,
    status: d.status,
    submittedBy: d.submittedBy,
    submittedAt: d.submittedAt,
    reason: d.reason,
    reviewerId: d.reviewerId,
    relatedEntityId: d.relatedEntityId,
    relatedEntityType: d.relatedEntityType
  }));
}

export function disputeDetail(state: PrototypeState, id: string) {
  const d = state.disputes?.find((x) => x.id === id);
  if (!d) return undefined;
  
  const session = d.sessionId ? state.sessions.find((s) => s.id === d.sessionId) : undefined;
  const tournament = d.tournamentId ? state.tournaments.find((t) => t.id === d.tournamentId) : undefined;
  const match = d.matchId ? state.tournamentMatches.find((m) => m.id === d.matchId) : undefined;
  const exceptions = (state.refundExceptions ?? []).filter((re) => re.disputeId === id);

  return {
    ...d,
    sessionName: session ? sessionTitle(state, session.id) : undefined,
    tournamentName: tournament?.name,
    matchLabel: match ? `${match.roundLabel} - Match ${match.matchNumber}` : undefined,
    exceptions
  };
}

export function disputeQueue(state: PrototypeState, territoryId?: string): Dispute[] {
  const list = state.disputes ?? [];
  return list.filter((d) => {
    if (d.status === "closed" || d.status === "upheld" || d.status === "rejected") return false;
    if (!territoryId) return true;
    if (d.tournamentId) {
      const t = state.tournaments.find((x) => x.id === d.tournamentId);
      return t?.territoryId === territoryId;
    }
    if (d.sessionId) {
      const s = state.sessions.find((x) => x.id === d.sessionId);
      return s?.territoryId === territoryId;
    }
    return true;
  });
}
