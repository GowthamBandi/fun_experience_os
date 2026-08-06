import type { PrototypeState } from "../scenarios/state";
import type { Tournament, TournamentMatch } from "../entities";

export function validateTournamentTeamUniqueness(
  state: PrototypeState,
  tournamentId: string,
  teamIds: string[]
): { isValid: boolean; error?: string } {
  const seen = new Set<string>();
  for (const id of teamIds) {
    if (seen.has(id)) {
      return { isValid: false, error: `Duplicate team ID detected: "${id}".` };
    }
    seen.add(id);
  }
  return { isValid: true };
}

export function validateMatchReadiness(
  state: PrototypeState,
  match: TournamentMatch
): { isValid: boolean; error?: string } {
  if (!match.teamAId || !match.teamBId) {
    return { isValid: false, error: "Match does not have two participating teams assigned yet." };
  }
  if (!match.refereeId) {
    return { isValid: false, error: "Match requires an assigned referee." };
  }
  return { isValid: true };
}

export function validateMatchResultConfirmation(
  state: PrototypeState,
  match: TournamentMatch,
  scoreA: number,
  scoreB: number,
  winnerTeamId: string
): { isValid: boolean; error?: string } {
  if (scoreA === scoreB && !winnerTeamId) {
    return { isValid: false, error: "Draws are not allowed in knockout matches; a winner must be declared." };
  }
  if (winnerTeamId !== match.teamAId && winnerTeamId !== match.teamBId) {
    return { isValid: false, error: `Winner "${winnerTeamId}" is not a participant in this match.` };
  }
  return { isValid: true };
}
