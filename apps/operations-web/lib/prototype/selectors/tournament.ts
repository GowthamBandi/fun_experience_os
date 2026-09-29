import type { PrototypeState } from "../scenarios/state";
import type { Tournament, TournamentMatch } from "../entities";
import { venueName, operatorName } from "./lookups";
import { entrantName } from "../services/tournament";
import { validateTournamentCompletion, FINISHED_MATCH_STATUSES, DECIDED_MATCH_STATUSES } from "../validators/tournamentValidation";


export interface TournamentRow {
  id: string;
  name: string;
  code: string;
  status: string;
  venueName: string;
  territoryId: string;
  format: string;
  teamsCount: number;
  scheduledStart?: string;
  progressPercent: number;
  playedMatches: number;
  totalMatches: number;
  liveMatches: number;
  awaitingVerification: number;
  currentRound?: string;
  championName?: string;
}

/** Matches that need to be played or decided (byes excluded). */
const playable = (matches: TournamentMatch[]) => matches.filter((m) => !m.isBye);

export function tournamentProgress(state: PrototypeState, tournamentId: string) {
  const matches = playable((state.tournamentMatches ?? []).filter((m) => m.tournamentId === tournamentId));
  const completed = matches.filter((m) => FINISHED_MATCH_STATUSES.includes(m.status)).length;
  return { total: matches.length, completed, progressPercent: matches.length ? Math.round((completed / matches.length) * 100) : 0 };
}

export function tournamentRows(state: PrototypeState, territoryId?: string): TournamentRow[] {
  const list = (state.tournaments ?? []).filter((t) => !territoryId || t.territoryId === territoryId);
  const ORDER: Record<string, number> = { live: 0, paused: 0, "awaiting-verification": 0, published: 1, "bracket-ready": 2, "teams-ready": 2, draft: 3, completed: 4, cancelled: 5, archived: 5 };
  return list
    .map((t) => {
      const matches = playable((state.tournamentMatches ?? []).filter((m) => m.tournamentId === t.id));
      const progress = tournamentProgress(state, t.id);
      const open = matches.filter((m) => !FINISHED_MATCH_STATUSES.includes(m.status)).sort((a, b) => a.roundNumber - b.roundNumber);
      return {
        id: t.id,
        name: t.name,
        code: t.code || "—",
        status: t.status,
        venueName: venueName(state, t.venueId),
        territoryId: t.territoryId,
        format: t.format,
        teamsCount: t.teamIds?.length ?? 0,
        scheduledStart: t.scheduledStart,
        progressPercent: progress.progressPercent,
        playedMatches: progress.completed,
        totalMatches: progress.total,
        liveMatches: matches.filter((m) => m.status === "live" || m.status === "paused").length,
        awaitingVerification: matches.filter((m) => m.status === "awaiting-verification").length,
        currentRound: open[0]?.roundLabel,
        championName: t.winnerTeamId ? entrantName(t, t.winnerTeamId) : undefined,
      };
    })
    .sort((a, b) => (ORDER[a.status] ?? 9) - (ORDER[b.status] ?? 9));
}

export interface BracketRound {
  roundNumber: number;
  label: string;
  matches: TournamentMatch[];
}

export function tournamentDetail(state: PrototypeState, id: string) {
  const t = (state.tournaments ?? []).find((x) => x.id === id);
  if (!t) return undefined;
  const matches = (state.tournamentMatches ?? []).filter((m) => m.tournamentId === id).sort((a, b) => a.roundNumber - b.roundNumber || a.matchNumber - b.matchNumber);
  const roundNums = [...new Set(matches.map((m) => m.roundNumber))].sort((a, b) => a - b);
  const rounds: BracketRound[] = roundNums.map((r) => {
    const ms = matches.filter((m) => m.roundNumber === r);
    return { roundNumber: r, label: ms[0]?.roundLabel ?? `Round ${r}`, matches: ms };
  });
  const entrants = (t.entrants?.length ? t.entrants : t.teamIds.map((tid, i) => ({ id: tid, name: tid, seed: i + 1, status: "active" as const })))
    .slice()
    .sort((a, b) => t.teamIds.indexOf(a.id) - t.teamIds.indexOf(b.id));
  return {
    ...t,
    entrants,
    venueName: venueName(state, t.venueId),
    createdByName: t.createdBy ? operatorName(state, t.createdBy) : undefined,
    matches,
    rounds,
    championName: t.winnerTeamId ? entrantName(t, t.winnerTeamId) : undefined,
  };
}

/** Human label for a match: "Semi-finals · Match 2". */
export const matchTitle = (m: TournamentMatch) => `${m.roundLabel ?? `Round ${m.roundNumber}`} · Match ${m.matchNumber}`;

export function verificationQueue(state: PrototypeState, territoryId?: string) {
  return (state.tournamentMatches ?? [])
    .filter((m) => m.status === "awaiting-verification")
    .map((m) => ({ match: m, tournament: state.tournaments.find((t) => t.id === m.tournamentId) }))
    .filter((x): x is { match: TournamentMatch; tournament: Tournament } => !!x.tournament && (!territoryId || x.tournament.territoryId === territoryId));
}

export function tournamentCompletionReadiness(state: PrototypeState, tournamentId: string): { canComplete: boolean; reason?: string; championId?: string } {
  const t = (state.tournaments ?? []).find((x) => x.id === tournamentId);
  if (!t) return { canComplete: false, reason: "Tournament not found." };
  const check = validateTournamentCompletion(state, t);
  return { canComplete: check.isValid, reason: check.error, championId: check.championId };
}

/** Final placings for a completed (or in-progress) knockout: champion, runner-up, semi-finalists. */
export function tournamentPlacings(state: PrototypeState, tournamentId: string) {
  const detail = tournamentDetail(state, tournamentId);
  if (!detail || !detail.rounds.length) return undefined;
  const final = detail.rounds[detail.rounds.length - 1].matches[0];
  const champion = final && DECIDED_MATCH_STATUSES.includes(final.status) ? final.winnerTeamId : undefined;
  const runnerUp = champion ? (final.teamAId === champion ? final.teamBId : final.teamAId) : undefined;
  const semis = detail.rounds.length > 1 ? detail.rounds[detail.rounds.length - 2].matches : [];
  const semiFinalists = semis
    .filter((m) => DECIDED_MATCH_STATUSES.includes(m.status) && m.winnerTeamId)
    .map((m) => (m.teamAId === m.winnerTeamId ? m.teamBId : m.teamAId))
    .filter((x): x is string => !!x);
  return { champion, runnerUp, semiFinalists, final };
}

export function tournamentCommandMetrics(state: PrototypeState, territoryId?: string) {
  const rows = tournamentRows(state, territoryId);
  return {
    activeTournaments: rows.filter((t) => ["live", "paused", "awaiting-verification"].includes(t.status)).length,
    totalTournaments: rows.length,
    verificationBacklog: verificationQueue(state, territoryId).length,
    upcomingCount: rows.filter((t) => ["published", "bracket-ready", "teams-ready", "draft"].includes(t.status)).length,
    liveMatches: rows.reduce((n, t) => n + t.liveMatches, 0),
  };
}
