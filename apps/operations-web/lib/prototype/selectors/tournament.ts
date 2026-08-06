import type { PrototypeState } from "../scenarios/state";
import type { Tournament, TournamentMatch } from "../entities";
import { venueName } from "./lookups";

export interface TournamentRow {
  id: string;
  name: string;
  code: string;
  status: string;
  venueName: string;
  format: string;
  teamsCount: number;
  scheduledStart?: string;
  progressPercent: number;
}

export function tournamentRows(state: PrototypeState, territoryId?: string): TournamentRow[] {
  const list = territoryId ? state.tournaments.filter((t) => t.territoryId === territoryId) : state.tournaments;
  return list.map((t) => {
    const progress = tournamentProgress(state, t.id);
    return {
      id: t.id,
      name: t.name,
      code: t.code || "—",
      status: t.status,
      venueName: venueName(state, t.venueId),
      format: t.format,
      teamsCount: t.teamIds?.length ?? 0,
      scheduledStart: t.scheduledStart,
      progressPercent: progress.progressPercent
    };
  });
}

export function tournamentDetail(state: PrototypeState, id: string) {
  const t = state.tournaments.find((x) => x.id === id);
  if (!t) return undefined;
  const matches = (state.tournamentMatches ?? []).filter((m) => m.tournamentId === id);
  return {
    ...t,
    venueName: venueName(state, t.venueId),
    matches
  };
}

export function tournamentProgress(state: PrototypeState, tournamentId: string) {
  const matches = (state.tournamentMatches ?? []).filter((m) => m.tournamentId === tournamentId);
  if (!matches.length) return { total: 0, completed: 0, progressPercent: 0 };
  const completed = matches.filter((m) => m.status === "completed" || m.status === "verified" || m.status === "walkover").length;
  return {
    total: matches.length,
    completed,
    progressPercent: Math.round((completed / matches.length) * 100)
  };
}

export function matchReadiness(state: PrototypeState, matchId: string): { isReady: boolean; reason?: string } {
  const m = state.tournamentMatches.find((x) => x.id === matchId);
  if (!m) return { isReady: false, reason: "Match not found" };
  if (!m.teamAId || !m.teamBId) return { isReady: false, reason: "Teams not yet populated (waiting for previous round results)" };
  if (!m.refereeId) return { isReady: false, reason: "No referee assigned" };
  return { isReady: true };
}

export function verificationQueue(state: PrototypeState, territoryId?: string): TournamentMatch[] {
  const matches = state.tournamentMatches ?? [];
  return matches.filter((m) => {
    if (m.status !== "awaiting-verification") return false;
    if (territoryId) {
      const t = state.tournaments.find((tx) => tx.id === m.tournamentId);
      return t?.territoryId === territoryId;
    }
    return true;
  });
}

export function tournamentCompletionReadiness(state: PrototypeState, tournamentId: string): { canComplete: boolean; reason?: string } {
  const matches = (state.tournamentMatches ?? []).filter((m) => m.tournamentId === tournamentId);
  if (!matches.length) return { canComplete: false, reason: "No matches generated yet" };

  const unresolved = matches.filter((m) => !["completed", "verified", "walkover", "disqualified", "abandoned"].includes(m.status));
  if (unresolved.length > 0) {
    return { canComplete: false, reason: `${unresolved.length} matches are still unresolved or in progress.` };
  }

  // Find final match
  const finalMatch = matches.find((m) => m.roundLabel === "Final" || m.round === "Final");
  if (!finalMatch || !finalMatch.winnerTeamId) {
    return { canComplete: false, reason: "Final match is not completed or has no declared winner." };
  }

  return { canComplete: true };
}

export function tournamentCommandMetrics(state: PrototypeState, territoryId?: string) {
  const list = territoryId ? state.tournaments.filter((t) => t.territoryId === territoryId) : state.tournaments;
  const activeTournaments = list.filter((t) => t.status === "live").length;
  const totalTournaments = list.length;
  const vQueue = verificationQueue(state, territoryId).length;

  return {
    activeTournaments,
    totalTournaments,
    verificationBacklog: vQueue,
    upcomingCount: list.filter((t) => t.status === "published" || t.status === "teams-ready").length
  };
}
