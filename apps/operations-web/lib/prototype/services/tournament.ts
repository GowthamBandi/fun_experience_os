/**
 * Tournament commands (single-elimination knockouts).
 *
 * Every command authorises the acting operator (lib/tournaments/access.ts),
 * runs the matching validator (validators/tournamentValidation.ts) and returns
 * `{ state, error }`. On refusal the state is returned unchanged.
 */
import type { PrototypeState } from "../scenarios/state";
import type {
  Tournament,
  TournamentEntrant,
  TournamentMatch,
  TournamentStatus,
  TournamentMatchResultRevision,
} from "../entities";
import { nextId, pushAudit, pushSignal } from "./helpers";
import { isoNow, refuse, type CommandResult } from "./outcome";
import { authorizeTournamentAction, type TournamentAction } from "@/lib/tournaments/access";
import {
  validateAbandon,
  validateBracketGeneration,
  validateDisqualification,
  validateMatchReadiness,
  validateMatchResultConfirmation,
  validateMatchStart,
  validatePublish,
  validateRefereeAssignment,
  validateResultCorrection,
  validateResultVerification,
  validateTeamChange,
  validateTournamentCompletion,
  validateTournamentCreation,
  validateTournamentRunning,
  validateWalkover,
  OPEN_MATCH_STATUSES,
} from "../validators/tournamentValidation";

/* --------------------------------- helpers -------------------------------- */

/** Display name of an entrant; falls back to the raw id for legacy data. */
export function entrantName(tournament: Pick<Tournament, "entrants"> | undefined, teamId?: string): string {
  if (!teamId) return "TBD";
  return tournament?.entrants?.find((e) => e.id === teamId)?.name ?? teamId;
}

function load(state: PrototypeState, tournamentId: string) {
  return (state.tournaments ?? []).find((t) => t.id === tournamentId);
}

function loadMatch(state: PrototypeState, tournamentId: string, matchId: string) {
  return (state.tournamentMatches ?? []).find((m) => m.id === matchId && m.tournamentId === tournamentId);
}

function guard(state: PrototypeState, actorId: string, action: TournamentAction, scope?: { territoryId?: string }): string | undefined {
  const auth = authorizeTournamentAction(state, actorId, action, scope?.territoryId);
  return auth.ok ? undefined : auth.error;
}

function patchMatch(state: PrototypeState, matchId: string, patch: Partial<TournamentMatch>): PrototypeState {
  return {
    ...state,
    tournamentMatches: state.tournamentMatches.map((m) => (m.id === matchId ? { ...m, ...patch, updatedAt: isoNow() } : m)),
  };
}

function patchTournament(state: PrototypeState, tournamentId: string, patch: Partial<Tournament>): PrototypeState {
  return {
    ...state,
    tournaments: state.tournaments.map((t) => (t.id === tournamentId ? { ...t, ...patch, updatedAt: isoNow() } : t)),
  };
}

const matchLabel = (m: TournamentMatch) => `${m.roundLabel ?? `Round ${m.roundNumber}`} · match ${m.matchNumber}`;

/** Standard bracket order: seed 1 meets the lowest seed, top seeds meet as late as possible. */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

function roundLabel(round: number, totalRounds: number): string {
  if (round === totalRounds) return "Final";
  if (round === totalRounds - 1) return "Semi-finals";
  if (round === totalRounds - 2) return "Quarter-finals";
  return `Round ${round}`;
}

/* --------------------------------- commands -------------------------------- */

export interface TournamentInput {
  name: string;
  code: string;
  experienceTemplateId?: string;
  territoryId: string;
  cityId?: string;
  venueId: string;
  playingAreaIds?: string[];
  format: string;
  minimumTeams?: number;
  maximumTeams?: number;
  matchDuration: number;
  breakDuration: number;
  seedingMethod: "random" | "seeded";
  verificationRequirement?: "referee" | "dual";
  prizePlaceholder?: string;
  scheduledStart?: string;
  registrationClosesAt?: string;
}

/** 1. Create a draft tournament. */
export function createTournament(state: PrototypeState, params: TournamentInput, operatorId: string): CommandResult<{ id: string }> {
  const denied = guard(state, operatorId, "tournament.create", { territoryId: params.territoryId });
  if (denied) return refuse(state, denied);
  const check = validateTournamentCreation(state, params);
  if (!check.isValid) return refuse(state, check.error!);

  const tournaments = state.tournaments ?? [];
  const id = nextId("tr", tournaments.map((t) => t.id));
  const venue = state.venues.find((v) => v.id === params.venueId);
  const tournament: Tournament = {
    id,
    name: params.name.trim(),
    code: params.code.trim().toUpperCase(),
    experienceTemplateId: params.experienceTemplateId,
    territoryId: params.territoryId,
    cityId: params.cityId ?? venue?.cityId,
    venueId: params.venueId,
    playingAreaIds: params.playingAreaIds ?? [],
    sessionIds: [],
    format: params.format,
    status: "draft",
    teamIds: [],
    entrants: [],
    minimumTeams: params.minimumTeams ?? 4,
    maximumTeams: params.maximumTeams ?? 16,
    matchDuration: params.matchDuration,
    breakDuration: params.breakDuration,
    seedingMethod: params.seedingMethod,
    verificationRequirement: params.verificationRequirement ?? "referee",
    prizePlaceholder: params.prizePlaceholder?.trim() || undefined,
    scheduledStart: params.scheduledStart,
    registrationClosesAt: params.registrationClosesAt,
    createdBy: operatorId,
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };

  let next: PrototypeState = { ...state, tournaments: [...tournaments, tournament] };
  next = pushAudit(next, { action: "Tournament Created", description: `Created tournament "${tournament.name}" (${id}) as a draft.`, operatorId });
  return { state: next, id };
}

/**
 * 2. Set the tournament's entrants (in seed order). Existing entrants keep
 * their ids; new names get new ids. Changing teams after the bracket was
 * generated discards the unplayed bracket.
 */
export function assignTournamentTeams(
  state: PrototypeState,
  tournamentId: string,
  teams: Array<{ id?: string; name: string }>,
  operatorId: string,
): CommandResult {
  const t = load(state, tournamentId);
  if (!t) return refuse(state, "This tournament no longer exists.");
  const denied = guard(state, operatorId, "tournament.teams", t);
  if (denied) return refuse(state, denied);
  const check = validateTeamChange(state, t, teams.map((x) => x.name));
  if (!check.isValid) return refuse(state, check.error!);

  const existing = t.entrants ?? [];
  let counter = existing.reduce((max, e) => {
    const m = e.id.match(/-team-(\d+)$/);
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0);
  const entrants: TournamentEntrant[] = teams.map((team, i) => {
    const prev = team.id ? existing.find((e) => e.id === team.id) : undefined;
    if (prev) return { ...prev, name: team.name.trim(), seed: i + 1 };
    counter += 1;
    return { id: `${tournamentId}-team-${counter}`, name: team.name.trim(), seed: i + 1, status: "active" };
  });
  const teamIds = entrants.map((e) => e.id);
  const min = Math.max(2, t.minimumTeams ?? 2);
  const status: TournamentStatus = teamIds.length >= min ? "teams-ready" : "draft";
  const hadBracket = t.status === "bracket-ready";

  let next = patchTournament(state, tournamentId, { entrants, teamIds, status });
  if (hadBracket) next = { ...next, tournamentMatches: next.tournamentMatches.filter((m) => m.tournamentId !== tournamentId) };
  next = pushAudit(next, {
    action: "Tournament Teams Updated",
    description: `${t.name}: ${teamIds.length} team${teamIds.length === 1 ? "" : "s"} entered${hadBracket ? "; the unpublished bracket was discarded and must be regenerated" : ""}.`,
    operatorId,
  });
  return { state: next };
}

/** 3. Generate the single-elimination bracket (with byes for non-power-of-two fields). */
export function generateSingleEliminationBracket(
  state: PrototypeState,
  tournamentId: string,
  operatorId: string,
  rng: () => number = Math.random,
): CommandResult {
  const t = load(state, tournamentId);
  if (!t) return refuse(state, "This tournament no longer exists.");
  const denied = guard(state, operatorId, "tournament.bracket", t);
  if (denied) return refuse(state, denied);
  const check = validateBracketGeneration(state, t);
  if (!check.isValid) return refuse(state, check.error!);

  const entrants = [...t.teamIds];
  if (t.seedingMethod !== "seeded") {
    for (let i = entrants.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [entrants[i], entrants[j]] = [entrants[j], entrants[i]];
    }
  }
  const n = entrants.length;
  const size = Math.pow(2, Math.ceil(Math.log2(n)));
  const totalRounds = Math.log2(size);
  const order = seedOrder(size);
  const created = isoNow();

  const byRound: TournamentMatch[][] = [];
  for (let r = 1; r <= totalRounds; r++) {
    const count = size / Math.pow(2, r);
    byRound[r] = Array.from({ length: count }, (_, i) => ({
      id: `${tournamentId}-r${r}-m${i + 1}`,
      tournamentId,
      roundNumber: r,
      matchNumber: i + 1,
      roundLabel: roundLabel(r, totalRounds),
      status: "scheduled" as const,
      nextMatchId: r < totalRounds ? `${tournamentId}-r${r + 1}-m${Math.floor(i / 2) + 1}` : undefined,
      createdAt: created,
      updatedAt: created,
    }));
  }

  // Place seeds into round one; seeds beyond the field are byes.
  byRound[1].forEach((m, i) => {
    const a = order[i * 2];
    const b = order[i * 2 + 1];
    m.teamAId = a <= n ? entrants[a - 1] : undefined;
    m.teamBId = b <= n ? entrants[b - 1] : undefined;
    if (!m.teamAId || !m.teamBId) {
      m.isBye = true;
      m.status = "completed";
      m.resultType = "bye";
      m.winnerTeamId = m.teamAId ?? m.teamBId;
    }
  });
  if (totalRounds > 1) {
    byRound[1].filter((m) => m.isBye).forEach((m) => {
      const target = byRound[2].find((x) => x.id === m.nextMatchId)!;
      if (m.matchNumber % 2 === 1) target.teamAId = m.winnerTeamId;
      else target.teamBId = m.winnerTeamId;
    });
  }

  // Indicative schedule: rounds run in order, matches in a round share the playing areas.
  const start = t.scheduledStart ? new Date(t.scheduledStart).getTime() : NaN;
  if (Number.isFinite(start)) {
    const lanes = Math.max(1, t.playingAreaIds?.length ?? 1);
    const slot = (t.matchDuration + t.breakDuration) * 60000;
    let offset = 0;
    for (let r = 1; r <= totalRounds; r++) {
      const playable = byRound[r].filter((m) => !m.isBye);
      playable.forEach((m, i) => {
        m.scheduledAt = new Date(start + offset + Math.floor(i / lanes) * slot).toISOString();
        if (t.playingAreaIds?.length) m.playingAreaId = t.playingAreaIds[i % lanes];
      });
      offset += Math.ceil(playable.length / lanes) * slot;
    }
  }

  const matches = byRound.slice(1).flat();
  let next: PrototypeState = {
    ...patchTournament(state, tournamentId, { status: "bracket-ready" }),
  };
  next = { ...next, tournamentMatches: [...next.tournamentMatches.filter((m) => m.tournamentId !== tournamentId), ...matches] };
  const byes = matches.filter((m) => m.isBye).length;
  next = pushAudit(next, {
    action: "Tournament Bracket Generated",
    description: `${t.name}: ${n}-team knockout, ${matches.length - byes} matches over ${totalRounds} round${totalRounds === 1 ? "" : "s"}${byes ? `, ${byes} bye${byes === 1 ? "" : "s"}` : ""} (${t.seedingMethod === "seeded" ? "seeded" : "random draw"}).`,
    operatorId,
  });
  return { state: next };
}

/** 4. Publish: locks teams and bracket and opens match day. */
export function publishTournament(state: PrototypeState, tournamentId: string, operatorId: string): CommandResult {
  const t = load(state, tournamentId);
  if (!t) return refuse(state, "This tournament no longer exists.");
  const denied = guard(state, operatorId, "tournament.publish", t);
  if (denied) return refuse(state, denied);
  const check = validatePublish(state, t);
  if (!check.isValid) return refuse(state, check.error!);

  let next = patchTournament(state, tournamentId, { status: "published" });
  next = pushAudit(next, { action: "Tournament Published", description: `Published ${t.name}; teams and bracket are now locked.`, operatorId });
  next = pushSignal(next, { kind: "system", message: `Tournament published: ${t.name}` });
  return { state: next };
}

/** 5. Assign a referee to a match. */
export function assignMatchReferee(state: PrototypeState, tournamentId: string, matchId: string, refereeId: string, operatorId: string): CommandResult {
  const t = load(state, tournamentId);
  const m = loadMatch(state, tournamentId, matchId);
  if (!t || !m) return refuse(state, "This match no longer exists.");
  const denied = guard(state, operatorId, "match.referee", t);
  if (denied) return refuse(state, denied);
  const check = validateRefereeAssignment(state, m, refereeId);
  if (!check.isValid) return refuse(state, check.error!);

  let next = patchMatch(state, matchId, { refereeId });
  next = pushAudit(next, { action: "Match Referee Assigned", description: `${t.name} ${matchLabel(m)}: referee ${refereeId}.`, operatorId });
  return { state: next };
}

/** 6. Mark a scheduled match ready (teams, referee and area confirmed) or back to scheduled. */
export function updateMatchReadiness(state: PrototypeState, tournamentId: string, matchId: string, status: "scheduled" | "ready", operatorId: string): CommandResult {
  const t = load(state, tournamentId);
  const m = loadMatch(state, tournamentId, matchId);
  if (!t || !m) return refuse(state, "This match no longer exists.");
  const denied = guard(state, operatorId, "match.run", t);
  if (denied) return refuse(state, denied);
  if (m.status !== "scheduled" && m.status !== "ready") return refuse(state, "Only a match that hasn't started can change readiness.");
  if (status === "ready") {
    const ready = validateMatchReadiness(state, m);
    if (!ready.isValid) return refuse(state, ready.error!);
  }
  let next = patchMatch(state, matchId, { status });
  next = pushAudit(next, { action: "Match Readiness Updated", description: `${t.name} ${matchLabel(m)} marked ${status}.`, operatorId });
  return { state: next };
}

/** 7. Start a match. The first match start takes the tournament live. */
export function startTournamentMatch(state: PrototypeState, tournamentId: string, matchId: string, operatorId: string): CommandResult {
  const t = load(state, tournamentId);
  const m = loadMatch(state, tournamentId, matchId);
  if (!t || !m) return refuse(state, "This match no longer exists.");
  const denied = guard(state, operatorId, "match.run", t);
  if (denied) return refuse(state, denied);
  const check = validateMatchStart(state, t, m);
  if (!check.isValid) return refuse(state, check.error!);

  let next = patchMatch(state, matchId, { status: "live", startedAt: isoNow() });
  next = patchTournament(next, tournamentId, { status: "live", actualStart: t.actualStart || isoNow() });
  next = pushAudit(next, {
    action: "Match Started",
    description: `${t.name} ${matchLabel(m)}: ${entrantName(t, m.teamAId)} v ${entrantName(t, m.teamBId)} started.`,
    operatorId,
  });
  next = pushSignal(next, { kind: "join", message: `${t.name}: ${entrantName(t, m.teamAId)} v ${entrantName(t, m.teamBId)} is live` });
  return { state: next };
}

/** 8. Pause a live match. */
export function pauseTournamentMatch(state: PrototypeState, tournamentId: string, matchId: string, operatorId: string): CommandResult {
  const t = load(state, tournamentId);
  const m = loadMatch(state, tournamentId, matchId);
  if (!t || !m) return refuse(state, "This match no longer exists.");
  const denied = guard(state, operatorId, "match.run", t);
  if (denied) return refuse(state, denied);
  if (m.status !== "live") return refuse(state, "Only a live match can be paused.");
  let next = patchMatch(state, matchId, { status: "paused" });
  next = pushAudit(next, { action: "Match Paused", description: `${t.name} ${matchLabel(m)} paused.`, operatorId });
  return { state: next };
}

/** 9. Resume a paused match. */
export function resumeTournamentMatch(state: PrototypeState, tournamentId: string, matchId: string, operatorId: string): CommandResult {
  const t = load(state, tournamentId);
  const m = loadMatch(state, tournamentId, matchId);
  if (!t || !m) return refuse(state, "This match no longer exists.");
  const denied = guard(state, operatorId, "match.run", t);
  if (denied) return refuse(state, denied);
  if (m.status !== "paused") return refuse(state, "Only a paused match can be resumed.");
  const running = validateTournamentRunning(t);
  if (!running.isValid) return refuse(state, running.error!);
  let next = patchMatch(state, matchId, { status: "live" });
  next = pushAudit(next, { action: "Match Resumed", description: `${t.name} ${matchLabel(m)} resumed.`, operatorId });
  return { state: next };
}

export interface MatchResultInput {
  tournamentId: string;
  matchId: string;
  scoreA: number;
  scoreB: number;
  winnerTeamId: string;
  note?: string;
}

/** 10. Record the result of a live or paused match; it then waits for verification. */
export function confirmTournamentMatchResult(state: PrototypeState, params: MatchResultInput, operatorId: string): CommandResult {
  const t = load(state, params.tournamentId);
  const m = loadMatch(state, params.tournamentId, params.matchId);
  if (!t || !m) return refuse(state, "This match no longer exists.");
  const denied = guard(state, operatorId, "match.result", t);
  if (denied) return refuse(state, denied);
  const running = validateTournamentRunning(t);
  if (!running.isValid) return refuse(state, running.error!);
  const check = validateMatchResultConfirmation(state, m, params.scoreA, params.scoreB, params.winnerTeamId);
  if (!check.isValid) return refuse(state, check.error!);

  const revisions = m.resultRevisions ?? [];
  const revision: TournamentMatchResultRevision = {
    revisionNumber: revisions.length + 1,
    scoreA: params.scoreA,
    scoreB: params.scoreB,
    winnerTeamId: params.winnerTeamId,
    resultType: "score",
    reason: params.note?.trim() || undefined,
    recordedBy: operatorId,
    recordedAt: isoNow(),
  };
  let next = patchMatch(state, m.id, {
    status: "awaiting-verification",
    scoreA: params.scoreA,
    scoreB: params.scoreB,
    winnerTeamId: params.winnerTeamId,
    resultType: "score",
    resultRevisions: [...revisions, revision],
    endedAt: isoNow(),
  });
  next = pushAudit(next, {
    action: "Match Result Recorded",
    description: `${t.name} ${matchLabel(m)}: ${entrantName(t, m.teamAId)} ${params.scoreA}–${params.scoreB} ${entrantName(t, m.teamBId)}, winner ${entrantName(t, params.winnerTeamId)}. Awaiting verification.`,
    operatorId,
  });
  next = pushSignal(next, { kind: "alert", message: `${t.name}: result waiting for verification (${matchLabel(m)})` });
  return { state: next };
}

/** 11. Verify a recorded result and advance the winner. */
export function verifyTournamentMatchResult(state: PrototypeState, tournamentId: string, matchId: string, operatorId: string): CommandResult {
  const t = load(state, tournamentId);
  const m = loadMatch(state, tournamentId, matchId);
  if (!t || !m) return refuse(state, "This match no longer exists.");
  const denied = guard(state, operatorId, "match.verify", t);
  if (denied) return refuse(state, denied);
  const check = validateResultVerification(m, operatorId, t.verificationRequirement);
  if (!check.isValid) return refuse(state, check.error!);

  const revisions = (m.resultRevisions ?? []).map((r, i, all) => (i === all.length - 1 ? { ...r, verifiedBy: operatorId, verifiedAt: isoNow() } : r));
  let next = patchMatch(state, matchId, { status: "verified", verifiedAt: isoNow(), verifiedBy: operatorId, resultRevisions: revisions });
  next = pushAudit(next, { action: "Match Result Verified", description: `${t.name} ${matchLabel(m)}: result verified, ${entrantName(t, m.winnerTeamId)} advance.`, operatorId });
  next = advanceVerifiedWinner(next, tournamentId, matchId, operatorId);
  return { state: next };
}

export interface MatchCorrectionInput extends MatchResultInput {
  reason: string;
}

/** 12. Audited correction of a recorded result. Replaces the advanced winner downstream. */
export function correctTournamentMatchResult(state: PrototypeState, params: MatchCorrectionInput, operatorId: string): CommandResult {
  const t = load(state, params.tournamentId);
  const m = loadMatch(state, params.tournamentId, params.matchId);
  if (!t || !m) return refuse(state, "This match no longer exists.");
  const denied = guard(state, operatorId, "match.correct", t);
  if (denied) return refuse(state, denied);
  if (t.status === "completed") return refuse(state, "The tournament is complete; results can no longer be corrected.");
  const check = validateResultCorrection(state, m, params);
  if (!check.isValid) return refuse(state, check.error!);

  const revisions = m.resultRevisions ?? [];
  const revision: TournamentMatchResultRevision = {
    revisionNumber: revisions.length + 1,
    scoreA: params.scoreA,
    scoreB: params.scoreB,
    winnerTeamId: params.winnerTeamId,
    resultType: "score",
    reason: params.reason.trim(),
    recordedBy: operatorId,
    recordedAt: isoNow(),
    verifiedBy: operatorId,
    verifiedAt: isoNow(),
  };
  let next = patchMatch(state, m.id, {
    status: "verified",
    scoreA: params.scoreA,
    scoreB: params.scoreB,
    winnerTeamId: params.winnerTeamId,
    resultType: "score",
    resultRevisions: [...revisions, revision],
    verifiedAt: isoNow(),
    verifiedBy: operatorId,
  });
  next = pushAudit(next, {
    action: "Match Result Corrected",
    description: `${t.name} ${matchLabel(m)} corrected to ${params.scoreA}–${params.scoreB}, winner ${entrantName(t, params.winnerTeamId)}. Reason: ${params.reason.trim()}`,
    operatorId,
  });
  next = advanceVerifiedWinner(next, params.tournamentId, params.matchId, operatorId);
  return { state: next };
}

/** 13. Administrative walkover (opponent absent, withdrew or ineligible). */
export function declareWalkover(state: PrototypeState, tournamentId: string, matchId: string, winnerTeamId: string, reason: string, operatorId: string): CommandResult {
  const t = load(state, tournamentId);
  const m = loadMatch(state, tournamentId, matchId);
  if (!t || !m) return refuse(state, "This match no longer exists.");
  const denied = guard(state, operatorId, "match.walkover", t);
  if (denied) return refuse(state, denied);
  const running = validateTournamentRunning(t);
  if (!running.isValid) return refuse(state, running.error!);
  const check = validateWalkover(m, winnerTeamId, reason);
  if (!check.isValid) return refuse(state, check.error!);

  let next = patchMatch(state, matchId, {
    status: "walkover",
    winnerTeamId,
    scoreA: undefined,
    scoreB: undefined,
    resultType: "walkover",
    walkoverReason: reason.trim(),
    endedAt: isoNow(),
    verifiedAt: isoNow(),
    verifiedBy: operatorId,
  });
  next = pushAudit(next, { action: "Match Walkover Declared", description: `${t.name} ${matchLabel(m)}: walkover to ${entrantName(t, winnerTeamId)}. Reason: ${reason.trim()}`, operatorId });
  next = advanceVerifiedWinner(next, tournamentId, matchId, operatorId);
  return { state: next };
}

/** 14. Disqualify a team: its open match is awarded to the opponent. */
export function disqualifyTeam(state: PrototypeState, tournamentId: string, teamId: string, reason: string, operatorId: string): CommandResult {
  const t = load(state, tournamentId);
  if (!t) return refuse(state, "This tournament no longer exists.");
  const denied = guard(state, operatorId, "team.disqualify", t);
  if (denied) return refuse(state, denied);
  const check = validateDisqualification(state, t, teamId, reason);
  if (!check.isValid) return refuse(state, check.error!);

  const affected = state.tournamentMatches.filter(
    (m) => m.tournamentId === tournamentId && OPEN_MATCH_STATUSES.includes(m.status) && (m.teamAId === teamId || m.teamBId === teamId),
  );
  let next = patchTournament(state, tournamentId, {
    entrants: (t.entrants ?? []).map((e) => (e.id === teamId ? { ...e, status: "disqualified" as const, disqualifiedReason: reason.trim() } : e)),
  });
  for (const m of affected) {
    const opponent = m.teamAId === teamId ? m.teamBId : m.teamAId;
    if (opponent) {
      next = patchMatch(next, m.id, {
        status: "disqualified",
        disqualifiedTeamId: teamId,
        winnerTeamId: opponent,
        resultType: "disqualification",
        disqualificationReason: reason.trim(),
        endedAt: isoNow(),
        verifiedAt: isoNow(),
        verifiedBy: operatorId,
      });
      next = advanceVerifiedWinner(next, tournamentId, m.id, operatorId);
    } else {
      // Opponent not known yet: vacate the slot; the eventual opponent will need a walkover.
      next = patchMatch(next, m.id, {
        teamAId: m.teamAId === teamId ? undefined : m.teamAId,
        teamBId: m.teamBId === teamId ? undefined : m.teamBId,
        disqualifiedTeamId: teamId,
        disqualificationReason: reason.trim(),
      });
    }
  }
  next = pushAudit(next, { action: "Team Disqualified", description: `${t.name}: ${entrantName(t, teamId)} disqualified. Reason: ${reason.trim()}`, operatorId });
  next = pushSignal(next, { kind: "alert", message: `${t.name}: ${entrantName(t, teamId)} disqualified` });
  return { state: next };
}

/** 15. Abandon a match (no winner advances; the next match is decided by walkover or replay). */
export function abandonMatch(state: PrototypeState, tournamentId: string, matchId: string, reason: string, operatorId: string): CommandResult {
  const t = load(state, tournamentId);
  const m = loadMatch(state, tournamentId, matchId);
  if (!t || !m) return refuse(state, "This match no longer exists.");
  const denied = guard(state, operatorId, "match.abandon", t);
  if (denied) return refuse(state, denied);
  const check = validateAbandon(m, reason);
  if (!check.isValid) return refuse(state, check.error!);

  let next = patchMatch(state, matchId, { status: "abandoned", resultType: "abandonment", abandonReason: reason.trim(), endedAt: isoNow(), winnerTeamId: undefined });
  next = pushAudit(next, { action: "Match Abandoned", description: `${t.name} ${matchLabel(m)} abandoned. Reason: ${reason.trim()}`, operatorId });
  next = pushSignal(next, { kind: "alert", message: `${t.name}: ${matchLabel(m)} abandoned` });
  return { state: next };
}

/**
 * Move a decided match's winner into its slot in the next match (pure helper,
 * called by verify, correct, walkover and disqualify). Odd match numbers feed
 * the A slot, even numbers the B slot, matching the generated bracket.
 */
export function advanceVerifiedWinner(state: PrototypeState, tournamentId: string, matchId: string, operatorId: string): PrototypeState {
  const match = loadMatch(state, tournamentId, matchId);
  if (!match || !match.winnerTeamId || !match.nextMatchId) return state;
  const target = loadMatch(state, tournamentId, match.nextMatchId);
  if (!target || !OPEN_MATCH_STATUSES.includes(target.status)) return state;
  const slot = match.matchNumber % 2 === 1 ? "teamAId" : "teamBId";
  if (target[slot] === match.winnerTeamId) return state;
  const t = load(state, tournamentId);
  const next = patchMatch(state, target.id, { [slot]: match.winnerTeamId });
  return pushAudit(next, {
    action: "Winner Advanced",
    description: `${t?.name ?? tournamentId}: ${entrantName(t, match.winnerTeamId)} advance to ${matchLabel(target)}.`,
    operatorId,
  });
}

/** 16. Complete the tournament. The champion is the final's winner. */
export function completeTournament(state: PrototypeState, tournamentId: string, operatorId: string): CommandResult<{ championId: string }> {
  const t = load(state, tournamentId);
  if (!t) return refuse(state, "This tournament no longer exists.");
  const denied = guard(state, operatorId, "tournament.complete", t);
  if (denied) return refuse(state, denied);
  const check = validateTournamentCompletion(state, t);
  if (!check.isValid || !check.championId) return refuse(state, check.error ?? "The champion could not be determined.");

  let next = patchTournament(state, tournamentId, { status: "completed", winnerTeamId: check.championId, endedAt: isoNow() });
  next = pushAudit(next, { action: "Tournament Completed", description: `${t.name} completed. Champion: ${entrantName(t, check.championId)}.`, operatorId });
  next = pushSignal(next, { kind: "close", message: `${t.name} complete — champion ${entrantName(t, check.championId)}` });
  return { state: next, championId: check.championId };
}

/* -------------------------------- migration -------------------------------- */

/**
 * Data migration: tournaments whose teams were stored by display name get
 * entrant records with stable ids, and every match slot, winner and champion
 * is rewritten to those ids. Deprecated mirror fields (teams, teamCount,
 * date, linkedSessionId, brackets; teamA/teamB/winner/round on matches) are
 * folded into the canonical fields and removed. Idempotent.
 */
export function migrateLegacyTournaments(state: PrototypeState): PrototypeState {
  const tournaments = state.tournaments ?? [];
  let matches = state.tournamentMatches ?? [];
  const nextTournaments = tournaments.map((t) => {
    const legacy = t as Tournament & { teams?: string[]; teamCount?: number; date?: string; linkedSessionId?: string; brackets?: TournamentMatch[] };
    const own = matches.filter((m) => m.tournamentId === t.id);
    const entrants: TournamentEntrant[] = [...(t.entrants ?? [])];
    const byId = new Set(entrants.map((e) => e.id));
    const byName = new Map<string, string>();
    let counter = entrants.reduce((max, e) => {
      const m = e.id.match(/-team-(\d+)$/);
      return m ? Math.max(max, parseInt(m[1], 10)) : max;
    }, 0);
    const idFor = (ref?: string): string | undefined => {
      if (!ref) return undefined;
      if (byId.has(ref)) return ref;
      const known = byName.get(ref) ?? entrants.find((e) => e.name === ref)?.id;
      if (known) return known;
      counter += 1;
      const id = `${t.id}-team-${counter}`;
      entrants.push({ id, name: ref, seed: entrants.length + 1, status: "active" });
      byId.add(id);
      byName.set(ref, id);
      return id;
    };
    const rawTeams = t.teamIds?.length ? t.teamIds : legacy.teams ?? [];
    const teamIds = rawTeams.map((r) => idFor(r)!).filter((x, i, all) => all.indexOf(x) === i);
    matches = matches.map((m) => {
      if (m.tournamentId !== t.id) return m;
      const { teamA, teamB, winner, round, ...rest } = m;
      const a = idFor(m.teamAId ?? teamA);
      const b = idFor(m.teamBId ?? teamB);
      const w = idFor(m.winnerTeamId ?? winner);
      const verifiedLegacy = m.status === "completed" && !m.isBye && !!m.verifiedAt;
      return {
        ...rest,
        roundLabel: m.roundLabel ?? round,
        teamAId: a,
        teamBId: b,
        winnerTeamId: w,
        disqualifiedTeamId: idFor(m.disqualifiedTeamId),
        status: verifiedLegacy ? ("verified" as const) : m.status,
      };
    });
    for (const m of own) {
      for (const ref of [m.teamAId ?? m.teamA, m.teamBId ?? m.teamB]) {
        const id = idFor(ref);
        if (id && !teamIds.includes(id)) teamIds.push(id);
      }
    }
    const { teams: _teams, teamCount: _count, date, linkedSessionId, brackets: _brackets, ...canonical } = legacy;
    void _teams; void _count; void _brackets;
    return {
      ...canonical,
      teamIds,
      entrants,
      winnerTeamId: idFor(t.winnerTeamId),
      scheduledStart: t.scheduledStart ?? date,
      sessionIds: t.sessionIds?.length ? t.sessionIds : linkedSessionId ? [linkedSessionId] : t.sessionIds ?? [],
    } as Tournament;
  });
  return { ...state, tournaments: nextTournaments, tournamentMatches: matches };
}
