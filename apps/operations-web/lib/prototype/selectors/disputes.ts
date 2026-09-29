import type { PrototypeState } from "../scenarios/state";
import type { Dispute } from "../entities";
import { sessionTitle, operatorName, territoryName } from "./lookups";
import { disputeTerritory } from "../services/disputes";
import { entrantName } from "../services/tournament";
import { toMillis } from "@/lib/safety/time";

export interface DisputeRow {
  id: string;
  type: string;
  status: string;
  submittedBy: string;
  submittedAt: string;
  reason: string;
  reviewerName?: string;
  contextLabel: string;
  territoryId?: string;
  territoryName: string;
}

const OPEN_ORDER: Record<string, number> = { submitted: 0, "under-review": 1, "evidence-requested": 2, "decision-pending": 3, upheld: 4, "partially-upheld": 4, rejected: 4, closed: 5 };

function contextOf(state: PrototypeState, d: Dispute): string {
  if (d.matchId) {
    const m = state.tournamentMatches.find((x) => x.id === d.matchId);
    const t = state.tournaments.find((x) => x.id === (m?.tournamentId ?? d.tournamentId));
    if (m && t) return `${t.name} · ${m.roundLabel ?? `Round ${m.roundNumber}`}: ${entrantName(t, m.teamAId)} v ${entrantName(t, m.teamBId)}`;
  }
  if (d.tournamentId) return state.tournaments.find((t) => t.id === d.tournamentId)?.name ?? d.tournamentId;
  if (d.sessionId) return sessionTitle(state, d.sessionId);
  if (d.bookingId) return `Booking ${d.bookingId}`;
  return `${d.relatedEntityType} ${d.relatedEntityId}`;
}

export function disputeRows(state: PrototypeState, territoryId?: string): DisputeRow[] {
  return (state.disputes ?? [])
    .map((d) => ({ d, terr: disputeTerritory(state, d) }))
    .filter(({ terr }) => !territoryId || !terr || terr === territoryId)
    .map(({ d, terr }) => ({
      id: d.id,
      type: d.type,
      status: d.status,
      submittedBy: d.submittedBy,
      submittedAt: d.submittedAt,
      reason: d.reason,
      reviewerName: d.reviewerId ? operatorName(state, d.reviewerId) : undefined,
      contextLabel: contextOf(state, d),
      territoryId: terr,
      territoryName: terr ? territoryName(state, terr) : "All territories",
    }))
    .sort((a, b) => (OPEN_ORDER[a.status] ?? 9) - (OPEN_ORDER[b.status] ?? 9) || (toMillis(b.submittedAt) || 0) - (toMillis(a.submittedAt) || 0));
}

export function disputeDetail(state: PrototypeState, id: string) {
  const d = state.disputes?.find((x) => x.id === id);
  if (!d) return undefined;
  const terr = disputeTerritory(state, d);
  return {
    ...d,
    contextLabel: contextOf(state, d),
    territoryId: terr,
    reviewerName: d.reviewerId ? operatorName(state, d.reviewerId) : undefined,
    decidedByName: d.decidedBy ? operatorName(state, d.decidedBy) : undefined,
    recordedByName: d.recordedBy ? operatorName(state, d.recordedBy) : undefined,
    exceptions: (state.refundExceptions ?? []).filter((re) => re.disputeId === id),
  };
}

export function openDisputeCount(state: PrototypeState, territoryId?: string): number {
  return disputeRows(state, territoryId).filter((d) => !["upheld", "partially-upheld", "rejected", "closed"].includes(d.status)).length;
}
