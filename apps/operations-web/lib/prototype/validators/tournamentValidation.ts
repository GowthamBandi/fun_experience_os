/**
 * Tournament business rules. Every tournament command in
 * services/tournament.ts runs the matching validator before changing state.
 */
import type { PrototypeState } from "../scenarios/state";
import type { Tournament, TournamentMatch, TournamentMatchStatus } from "../entities";

export type RuleCheck = { isValid: boolean; error?: string };

const ok: RuleCheck = { isValid: true };
const fail = (error: string): RuleCheck => ({ isValid: false, error });

/** Match states that carry a final outcome. */
export const DECIDED_MATCH_STATUSES: TournamentMatchStatus[] = ["completed", "verified", "walkover", "disqualified"];
/** Match states that are finished one way or another (no further play). */
export const FINISHED_MATCH_STATUSES: TournamentMatchStatus[] = [...DECIDED_MATCH_STATUSES, "abandoned", "cancelled"];
/** Match states in which the match can still be played or administratively decided. */
export const OPEN_MATCH_STATUSES: TournamentMatchStatus[] = ["scheduled", "ready", "live", "paused"];

const EDITABLE_TEAM_STATUSES: Tournament["status"][] = ["draft", "registration-open", "registration-closed", "teams-ready", "bracket-ready"];

export const MIN_REASON = 10;

export function validateReason(reason: string | undefined, what: string): RuleCheck {
  if (!reason || reason.trim().length < MIN_REASON) return fail(`Give a reason for the ${what} (at least ${MIN_REASON} characters).`);
  return ok;
}

export function validateTournamentCreation(
  state: PrototypeState,
  params: { name: string; code: string; venueId: string; territoryId: string; format: string; matchDuration: number; breakDuration: number; minimumTeams?: number; maximumTeams?: number },
): RuleCheck {
  if (!params.name || params.name.trim().length < 3) return fail("Enter a tournament name (at least 3 characters).");
  if (!params.code || !/^[A-Z0-9-]{3,16}$/.test(params.code.trim())) return fail("Enter a short code of 3–16 capital letters, digits or dashes (for example MTT-2026).");
  if ((state.tournaments ?? []).some((t) => t.code?.toUpperCase() === params.code.trim().toUpperCase())) {
    return fail(`The code ${params.code.trim()} is already used by another tournament.`);
  }
  const venue = (state.venues ?? []).find((v) => v.id === params.venueId);
  if (!venue) return fail("Choose the venue where the tournament will be played.");
  if (venue.territoryId !== params.territoryId) return fail("The venue must belong to the tournament's territory.");
  if (params.format !== "single-elimination") return fail("Only single-elimination knockouts are supported. Round-robin is not available yet.");
  if (!Number.isFinite(params.matchDuration) || params.matchDuration < 5 || params.matchDuration > 240) return fail("Match duration must be between 5 and 240 minutes.");
  if (!Number.isFinite(params.breakDuration) || params.breakDuration < 0 || params.breakDuration > 120) return fail("Break duration must be between 0 and 120 minutes.");
  const min = params.minimumTeams ?? 2;
  const max = params.maximumTeams ?? 64;
  if (min < 2) return fail("A knockout needs at least 2 teams.");
  if (max > 64) return fail("A knockout can have at most 64 teams.");
  if (min > max) return fail("Minimum teams cannot be more than maximum teams.");
  return ok;
}

export function validateTournamentTeamUniqueness(state: PrototypeState, tournamentId: string, teamIds: string[]): RuleCheck {
  const seen = new Set<string>();
  for (const id of teamIds) {
    if (seen.has(id)) return fail(`That team is already entered.`);
    seen.add(id);
  }
  return ok;
}

export function validateTeamChange(state: PrototypeState, tournament: Tournament, names: string[]): RuleCheck {
  if (!EDITABLE_TEAM_STATUSES.includes(tournament.status)) {
    return fail("Teams are locked once the tournament is published. Use walkover or disqualification instead.");
  }
  const cleaned = names.map((n) => n.trim());
  if (cleaned.some((n) => n.length < 2)) return fail("Team names need at least 2 characters.");
  const lower = cleaned.map((n) => n.toLowerCase());
  const dupe = lower.find((n, i) => lower.indexOf(n) !== i);
  if (dupe) return fail(`"${cleaned[lower.indexOf(dupe)]}" is already entered.`);
  const max = tournament.maximumTeams ?? 64;
  if (cleaned.length > max) return fail(`This tournament allows at most ${max} teams.`);
  return ok;
}

export function validateBracketGeneration(state: PrototypeState, tournament: Tournament): RuleCheck {
  if (tournament.format !== "single-elimination") return fail("Only single-elimination brackets can be generated. Change the format first.");
  if (!["draft", "registration-open", "registration-closed", "teams-ready", "bracket-ready"].includes(tournament.status)) {
    return fail("The bracket is locked once the tournament is published.");
  }
  const teams = tournament.teamIds ?? [];
  const min = Math.max(2, tournament.minimumTeams ?? 2);
  if (teams.length < min) return fail(`Enter at least ${min} teams before generating the bracket (currently ${teams.length}).`);
  const uniq = validateTournamentTeamUniqueness(state, tournament.id, teams);
  if (!uniq.isValid) return uniq;
  const started = (state.tournamentMatches ?? []).some(
    (m) => m.tournamentId === tournament.id && !m.isBye && m.status !== "scheduled" && m.status !== "ready",
  );
  if (started) return fail("Matches have already been played; the bracket can't be regenerated.");
  return ok;
}

export function validatePublish(state: PrototypeState, tournament: Tournament): RuleCheck {
  if (tournament.status !== "bracket-ready") return fail("Generate the bracket before publishing.");
  const matches = (state.tournamentMatches ?? []).filter((m) => m.tournamentId === tournament.id);
  if (!matches.length) return fail("There are no matches to publish. Generate the bracket first.");
  return ok;
}

export function validateTournamentRunning(tournament: Tournament): RuleCheck {
  if (tournament.status === "completed" || tournament.status === "cancelled" || tournament.status === "archived") {
    return fail(`This tournament is ${tournament.status}; matches can no longer change.`);
  }
  if (!["published", "live", "paused", "awaiting-verification"].includes(tournament.status)) {
    return fail("Publish the tournament before running matches.");
  }
  return ok;
}

export function validateMatchReadiness(state: PrototypeState, match: TournamentMatch): RuleCheck {
  if (!match.teamAId || !match.teamBId) return fail("Both teams must be known before the match can start.");
  if (!match.refereeId) return fail("Assign a referee before starting the match.");
  return ok;
}

export function validateMatchStart(state: PrototypeState, tournament: Tournament, match: TournamentMatch): RuleCheck {
  const running = validateTournamentRunning(tournament);
  if (!running.isValid) return running;
  if (match.status !== "scheduled" && match.status !== "ready") return fail(`This match is ${match.status.replace(/-/g, " ")} and can't be started.`);
  return validateMatchReadiness(state, match);
}

export function validateRefereeAssignment(state: PrototypeState, match: TournamentMatch, refereeId: string): RuleCheck {
  if (FINISHED_MATCH_STATUSES.includes(match.status)) return fail("This match is finished; the referee can't change.");
  const known = (state.crew ?? []).some((c) => c.id === refereeId) || (state.operators ?? []).some((o) => o.id === refereeId);
  if (!known) return fail("Choose a referee from the crew or operator list.");
  return ok;
}

export function validateMatchResultConfirmation(
  state: PrototypeState,
  match: TournamentMatch,
  scoreA: number,
  scoreB: number,
  winnerTeamId: string,
): RuleCheck {
  if (match.status !== "live" && match.status !== "paused") return fail("Results can only be recorded for a match that is live or paused.");
  return validateScoreLine(match, scoreA, scoreB, winnerTeamId);
}

export function validateScoreLine(match: TournamentMatch, scoreA: number, scoreB: number, winnerTeamId: string): RuleCheck {
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB) || scoreA < 0 || scoreB < 0) return fail("Scores must be whole numbers of 0 or more.");
  if (!winnerTeamId) return fail("Choose the winning team.");
  if (winnerTeamId !== match.teamAId && winnerTeamId !== match.teamBId) return fail("The winner must be one of the two teams in this match.");
  if (scoreA === scoreB) return fail("Knockout matches can't end in a draw. Record the tie-break result so one team wins.");
  const expected = scoreA > scoreB ? match.teamAId : match.teamBId;
  if (expected !== winnerTeamId) return fail("The winner must be the team with the higher score.");
  return ok;
}

export function validateResultVerification(match: TournamentMatch, verifierId: string, requirement?: string): RuleCheck {
  if (match.status !== "awaiting-verification") return fail("Only results awaiting verification can be verified.");
  const last = match.resultRevisions?.[match.resultRevisions.length - 1];
  if (requirement === "dual" && last?.recordedBy === verifierId) {
    return fail("This tournament needs a second person to verify results. Someone other than the scorer must verify.");
  }
  return ok;
}

export function validateResultCorrection(
  state: PrototypeState,
  match: TournamentMatch,
  params: { scoreA: number; scoreB: number; winnerTeamId: string; reason: string },
): RuleCheck {
  if (!["completed", "awaiting-verification", "verified"].includes(match.status)) return fail("Only a recorded score result can be corrected.");
  const line = validateScoreLine(match, params.scoreA, params.scoreB, params.winnerTeamId);
  if (!line.isValid) return line;
  const reason = validateReason(params.reason, "correction");
  if (!reason.isValid) return reason;
  if (match.nextMatchId && params.winnerTeamId !== match.winnerTeamId) {
    const next = (state.tournamentMatches ?? []).find((m) => m.id === match.nextMatchId);
    if (next && next.status !== "scheduled" && next.status !== "ready") {
      return fail(`The next match (${next.roundLabel ?? "next round"}) has already started, so the winner can't change. Correct or abandon that match first.`);
    }
  }
  return ok;
}

export function validateWalkover(match: TournamentMatch, winnerTeamId: string, reason: string): RuleCheck {
  if (!OPEN_MATCH_STATUSES.includes(match.status)) return fail("A walkover can only be declared before the match has a result.");
  if (!match.teamAId || !match.teamBId) {
    if (winnerTeamId && (winnerTeamId === match.teamAId || winnerTeamId === match.teamBId)) {
      // A walkover to the only known team is allowed (opponent never arrived from an abandoned match).
    } else {
      return fail("The walkover winner must be a team placed in this match.");
    }
  } else if (winnerTeamId !== match.teamAId && winnerTeamId !== match.teamBId) {
    return fail("The walkover winner must be one of the two teams in this match.");
  }
  return validateReason(reason, "walkover");
}

export function validateDisqualification(state: PrototypeState, tournament: Tournament, teamId: string, reason: string): RuleCheck {
  if (!tournament.teamIds.includes(teamId)) return fail("That team is not entered in this tournament.");
  const entrant = tournament.entrants?.find((e) => e.id === teamId);
  if (entrant?.status === "disqualified") return fail("That team is already disqualified.");
  if (tournament.status === "completed" || tournament.status === "cancelled") return fail("The tournament is finished; teams can no longer be disqualified.");
  const pending = (state.tournamentMatches ?? []).some(
    (m) => m.tournamentId === tournament.id && OPEN_MATCH_STATUSES.includes(m.status) && (m.teamAId === teamId || m.teamBId === teamId),
  );
  if (!pending) return fail("That team has no match left to play, so there is nothing to disqualify them from.");
  return validateReason(reason, "disqualification");
}

export function validateAbandon(match: TournamentMatch, reason: string): RuleCheck {
  if (!OPEN_MATCH_STATUSES.includes(match.status)) return fail("Only a match that hasn't finished can be abandoned.");
  return validateReason(reason, "abandonment");
}

export function validateTournamentCompletion(state: PrototypeState, tournament: Tournament): RuleCheck & { championId?: string } {
  if (tournament.status === "completed") return fail("This tournament is already complete.");
  const matches = (state.tournamentMatches ?? []).filter((m) => m.tournamentId === tournament.id);
  if (!matches.length) return fail("There are no matches yet.");
  const unverified = matches.filter((m) => m.status === "awaiting-verification");
  if (unverified.length) return fail(`${unverified.length} result${unverified.length === 1 ? " is" : "s are"} still awaiting verification.`);
  const open = matches.filter((m) => !FINISHED_MATCH_STATUSES.includes(m.status));
  if (open.length) return fail(`${open.length} match${open.length === 1 ? " is" : "es are"} still to be played or decided.`);
  const maxRound = Math.max(...matches.map((m) => m.roundNumber));
  const final = matches.find((m) => m.roundNumber === maxRound);
  if (!final?.winnerTeamId || !DECIDED_MATCH_STATUSES.includes(final.status)) {
    return fail("The final has no winner. Declare a walkover or replay before completing.");
  }
  return { isValid: true, championId: final.winnerTeamId };
}
