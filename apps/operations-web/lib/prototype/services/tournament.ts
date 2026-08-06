import type { PrototypeState } from "../scenarios/state";
import type {
  Tournament,
  TournamentMatch,
  TournamentStatus,
  TournamentMatchStatus,
  TournamentMatchResultType,
  TournamentMatchResultRevision
} from "../entities";
import { uid, nextId, pushAudit, pushSignal } from "./helpers";

/** 1. Create Tournament (Wizard Output) */
export function createTournament(
  state: PrototypeState,
  params: {
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
    seedingMethod: string;
    verificationRequirement?: string;
    prizePlaceholder?: string;
    scheduledStart?: string;
    registrationClosesAt?: string;
  },
  operatorId: string = "op-master"
): PrototypeState {
  const tournaments = state.tournaments ?? [];
  const id = nextId("tr", tournaments.map((t) => t.id));

  const newTournament: Tournament = {
    id,
    name: params.name,
    code: params.code,
    experienceTemplateId: params.experienceTemplateId,
    territoryId: params.territoryId,
    cityId: params.cityId,
    venueId: params.venueId,
    playingAreaIds: params.playingAreaIds ?? [],
    sessionIds: [],
    format: params.format,
    status: "draft",
    teamIds: [],
    minimumTeams: params.minimumTeams ?? 4,
    maximumTeams: params.maximumTeams ?? 8,
    matchDuration: params.matchDuration,
    breakDuration: params.breakDuration,
    seedingMethod: params.seedingMethod,
    verificationRequirement: params.verificationRequirement ?? "referee",
    prizePlaceholder: params.prizePlaceholder,
    scheduledStart: params.scheduledStart,
    registrationClosesAt: params.registrationClosesAt,
    createdBy: operatorId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    /* deprecated compatibility */
    teams: [],
    teamCount: 0
  };

  let next = {
    ...state,
    tournaments: [...tournaments, newTournament]
  };

  next = pushAudit(next, {
    action: "Tournament Created",
    description: `Created tournament "${params.name}" (${id}) in draft.`,
    operatorId
  });

  return next;
}

/** 2. Assign Tournament Teams */
export function assignTournamentTeams(
  state: PrototypeState,
  tournamentId: string,
  teamIds: string[],
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    tournaments: state.tournaments.map((t) => {
      if (t.id !== tournamentId) return t;
      return {
        ...t,
        teamIds,
        teamCount: teamIds.length,
        teams: teamIds,
        status: (t.status === "draft" ? "teams-ready" : t.status) as TournamentStatus,
        updatedAt: new Date().toISOString()
      };
    })
  };

  next = pushAudit(next, {
    action: "Tournament Teams Assigned",
    description: `Assigned ${teamIds.length} teams to tournament ${tournamentId}.`,
    operatorId
  });

  return next;
}

/** 3. Generate Single Elimination Bracket */
export function generateSingleEliminationBracket(
  state: PrototypeState,
  tournamentId: string,
  operatorId: string = "op-master"
): PrototypeState {
  const tournament = state.tournaments.find((t) => t.id === tournamentId);
  if (!tournament) return state;

  const teamIds = tournament.teamIds ?? [];
  if (teamIds.length < 2) return state;

  // Determine rounds and structure
  // Let's build brackets. For N teams:
  // We need next power of 2: P = 2 ^ ceil(log2(N))
  // Round 1 matches: P / 2
  const N = teamIds.length;
  const P = Math.pow(2, Math.ceil(Math.log2(N)));
  
  // Setup matches array
  const matches: TournamentMatch[] = [];
  const existingMatches = (state.tournamentMatches ?? []).filter((m) => m.tournamentId !== tournamentId);

  // Labels based on round depth
  const getRoundLabel = (roundNum: number, totalRounds: number): string => {
    if (roundNum === totalRounds) return "Final";
    if (roundNum === totalRounds - 1) return "Semi-finals";
    if (roundNum === totalRounds - 2) return "Quarter-finals";
    return `Round ${roundNum}`;
  };

  const totalRounds = Math.ceil(Math.log2(N));

  // Generate placeholders for all rounds
  // Let's create matches from final backwards to make nextMatchId wiring easy
  // final: 1 match
  // semis: 2 matches (pointing to final)
  // quarters: 4 matches (pointing to semis)
  // etc.
  const roundsMatchesCount = [];
  let currentCount = 1;
  for (let r = totalRounds; r >= 1; r--) {
    roundsMatchesCount[r] = currentCount;
    currentCount *= 2;
  }

  // Create match objects from Final (Round totalRounds) down to Round 1
  const matchesByRound: { [key: number]: TournamentMatch[] } = {};

  for (let r = totalRounds; r >= 1; r--) {
    const count = roundsMatchesCount[r];
    matchesByRound[r] = [];
    for (let m = 0; m < count; m++) {
      const matchId = `m-${tournamentId}-${r}-${m + 1}`;
      
      // Calculate next match ID (in next round)
      let nextMatchId: string | undefined;
      if (r < totalRounds) {
        const nextMatchIndex = Math.floor(m / 2) + 1;
        nextMatchId = `m-${tournamentId}-${r + 1}-${nextMatchIndex}`;
      }

      const match: TournamentMatch = {
        id: matchId,
        tournamentId,
        roundNumber: r,
        matchNumber: m + 1,
        roundLabel: getRoundLabel(r, totalRounds),
        status: "scheduled",
        nextMatchId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        /* deprecated compatibility */
        round: getRoundLabel(r, totalRounds)
      };

      matchesByRound[r].push(match);
    }
  }

  // Assign Round 1 teams
  const round1Matches = matchesByRound[1];
  for (let i = 0; i < round1Matches.length; i++) {
    const match = round1Matches[i];
    const teamAIndex = i * 2;
    const teamBIndex = i * 2 + 1;

    match.teamAId = teamIds[teamAIndex];
    match.teamA = teamIds[teamAIndex]; // deprecated compat

    if (teamBIndex < N) {
      match.teamBId = teamIds[teamBIndex];
      match.teamB = teamIds[teamBIndex]; // deprecated compat
    } else {
      // Bye
      match.isBye = true;
      match.status = "completed";
      match.winnerTeamId = match.teamAId;
      match.winner = match.teamAId; // deprecated compat
      match.resultType = "bye";
      match.scoreA = 0;
      match.scoreB = 0;
    }
  }

  // Auto-advance byes to Round 2
  if (totalRounds > 1) {
    round1Matches.forEach((m) => {
      if (m.isBye && m.nextMatchId) {
        const nextRoundMatches = matchesByRound[2];
        const nextMatch = nextRoundMatches.find((nm) => nm.id === m.nextMatchId);
        if (nextMatch) {
          // If match number is odd, it goes to teamAId of next match, else teamBId
          const isA = (m.matchNumber % 2) !== 0;
          if (isA) {
            nextMatch.teamAId = m.winnerTeamId;
            nextMatch.teamA = m.winnerTeamId; // deprecated compat
          } else {
            nextMatch.teamBId = m.winnerTeamId;
            nextMatch.teamB = m.winnerTeamId; // deprecated compat
          }
        }
      }
    });
  }

  // Flatten matches
  const newMatches: TournamentMatch[] = [];
  for (let r = 1; r <= totalRounds; r++) {
    newMatches.push(...matchesByRound[r]);
  }

  let next = {
    ...state,
    tournaments: state.tournaments.map((t) =>
      t.id === tournamentId
        ? {
            ...t,
            status: "bracket-ready" as TournamentStatus,
            updatedAt: new Date().toISOString()
          }
        : t
    ),
    tournamentMatches: [...existingMatches, ...newMatches]
  };

  next = pushAudit(next, {
    action: "Tournament Bracket Generated",
    description: `Generated single elimination bracket with ${newMatches.length} matches for tournament ${tournamentId}.`,
    operatorId
  });

  return next;
}

/** 4. Publish Tournament */
export function publishTournament(
  state: PrototypeState,
  tournamentId: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    tournaments: state.tournaments.map((t) => {
      if (t.id !== tournamentId) return t;
      return {
        ...t,
        status: "published" as TournamentStatus,
        updatedAt: new Date().toISOString()
      };
    })
  };

  next = pushAudit(next, {
    action: "Tournament Published",
    description: `Published tournament ${tournamentId} and opened scheduling/verification.`,
    operatorId
  });

  next = pushSignal(next, {
    kind: "system",
    message: `Tournament published: ${tournamentId}`
  });

  return next;
}

/** 5. Assign Match Referee */
export function assignMatchReferee(
  state: PrototypeState,
  tournamentId: string,
  matchId: string,
  refereeId: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    tournamentMatches: state.tournamentMatches.map((m) =>
      m.id === matchId && m.tournamentId === tournamentId
        ? { ...m, refereeId, updatedAt: new Date().toISOString() }
        : m
    )
  };

  next = pushAudit(next, {
    action: "Match Referee Assigned",
    description: `Assigned referee ${refereeId} to match ${matchId}.`,
    operatorId
  });

  return next;
}

/** 6. Update Match Readiness */
export function updateMatchReadiness(
  state: PrototypeState,
  tournamentId: string,
  matchId: string,
  status: "scheduled" | "ready",
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    tournamentMatches: state.tournamentMatches.map((m) =>
      m.id === matchId && m.tournamentId === tournamentId
        ? { ...m, status, updatedAt: new Date().toISOString() }
        : m
    )
  };

  next = pushAudit(next, {
    action: "Match Readiness Updated",
    description: `Set match ${matchId} status to ${status}.`,
    operatorId
  });

  return next;
}

/** 7. Start Tournament Match */
export function startTournamentMatch(
  state: PrototypeState,
  tournamentId: string,
  matchId: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    tournamentMatches: state.tournamentMatches.map((m) =>
      m.id === matchId && m.tournamentId === tournamentId
        ? { ...m, status: "live" as TournamentMatchStatus, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        : m
    ),
    tournaments: state.tournaments.map((t) => {
      if (t.id !== tournamentId) return t;
      return {
        ...t,
        status: (t.status === "published" || t.status === "bracket-ready" ? "live" : t.status) as TournamentStatus,
        actualStart: t.actualStart || new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    })
  };

  next = pushAudit(next, {
    action: "Match Started",
    description: `Started match ${matchId} in tournament ${tournamentId}.`,
    operatorId
  });

  next = pushSignal(next, {
    kind: "join",
    message: `Match is now live: ${matchId}`
  });

  return next;
}

/** 8. Pause Tournament Match */
export function pauseTournamentMatch(
  state: PrototypeState,
  tournamentId: string,
  matchId: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    tournamentMatches: state.tournamentMatches.map((m) =>
      m.id === matchId && m.tournamentId === tournamentId
        ? { ...m, status: "paused" as TournamentMatchStatus, updatedAt: new Date().toISOString() }
        : m
    )
  };

  next = pushAudit(next, {
    action: "Match Paused",
    description: `Paused match ${matchId} in tournament ${tournamentId}.`,
    operatorId
  });

  return next;
}

/** 9. Resume Tournament Match */
export function resumeTournamentMatch(
  state: PrototypeState,
  tournamentId: string,
  matchId: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    tournamentMatches: state.tournamentMatches.map((m) =>
      m.id === matchId && m.tournamentId === tournamentId
        ? { ...m, status: "live" as TournamentMatchStatus, updatedAt: new Date().toISOString() }
        : m
    )
  };

  next = pushAudit(next, {
    action: "Match Resumed",
    description: `Resumed match ${matchId} in tournament ${tournamentId}.`,
    operatorId
  });

  return next;
}

/** 10. Confirm Tournament Match Result */
export function confirmTournamentMatchResult(
  state: PrototypeState,
  params: {
    tournamentId: string;
    matchId: string;
    scoreA: number;
    scoreB: number;
    winnerTeamId: string;
    resultType: TournamentMatchResultType;
    reason?: string;
  },
  operatorId: string = "op-master"
): PrototypeState {
  const revisionEntry: TournamentMatchResultRevision = {
    revisionNumber: 1,
    scoreA: params.scoreA,
    scoreB: params.scoreB,
    winnerTeamId: params.winnerTeamId,
    resultType: params.resultType,
    reason: params.reason,
    recordedBy: operatorId,
    recordedAt: new Date().toISOString()
  };

  let next = {
    ...state,
    tournamentMatches: state.tournamentMatches.map((m) => {
      if (m.id !== params.matchId || m.tournamentId !== params.tournamentId) return m;
      const prevRevisions = m.resultRevisions ?? [];
      const newRevisionNum = prevRevisions.length + 1;
      const revisedEntry = { ...revisionEntry, revisionNumber: newRevisionNum };
      return {
        ...m,
        status: "awaiting-verification" as TournamentMatchStatus,
        scoreA: params.scoreA,
        scoreB: params.scoreB,
        winnerTeamId: params.winnerTeamId,
        winner: params.winnerTeamId, // deprecated compat
        resultType: params.resultType,
        resultRevisions: [...prevRevisions, revisedEntry],
        endedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    })
  };

  next = pushAudit(next, {
    action: "Match Result Confirmed",
    description: `Confirmed result for match ${params.matchId}: ${params.scoreA}–${params.scoreB}, winner: ${params.winnerTeamId}. Awaiting verification.`,
    operatorId
  });

  next = pushSignal(next, {
    kind: "alert",
    message: `Verification pending for match: ${params.matchId}`
  });

  return next;
}

/** 11. Verify Tournament Match Result */
export function verifyTournamentMatchResult(
  state: PrototypeState,
  tournamentId: string,
  matchId: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    tournamentMatches: state.tournamentMatches.map((m) => {
      if (m.id !== matchId || m.tournamentId !== tournamentId) return m;
      const revisions = m.resultRevisions ?? [];
      const updatedRevisions = revisions.map((r, i) =>
        i === revisions.length - 1 ? { ...r, verifiedBy: operatorId, verifiedAt: new Date().toISOString() } : r
      );
      return {
        ...m,
        status: "verified" as TournamentMatchStatus,
        verifiedAt: new Date().toISOString(),
        verifiedBy: operatorId,
        resultRevisions: updatedRevisions,
        updatedAt: new Date().toISOString()
      };
    })
  };

  next = pushAudit(next, {
    action: "Match Result Verified",
    description: `Verified result for match ${matchId}.`,
    operatorId
  });

  // Automatically advance winner if verification succeeds
  next = advanceVerifiedWinner(next, tournamentId, matchId, operatorId);

  return next;
}

/** 12. Correct Tournament Match Result (Audited correction with downstream impact) */
export function correctTournamentMatchResult(
  state: PrototypeState,
  params: {
    tournamentId: string;
    matchId: string;
    scoreA: number;
    scoreB: number;
    winnerTeamId: string;
    resultType: TournamentMatchResultType;
    reason: string;
  },
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    tournamentMatches: state.tournamentMatches.map((m) => {
      if (m.id !== params.matchId || m.tournamentId !== params.tournamentId) return m;
      const prevRevisions = m.resultRevisions ?? [];
      const newRevisionNum = prevRevisions.length + 1;
      const revision: TournamentMatchResultRevision = {
        revisionNumber: newRevisionNum,
        scoreA: params.scoreA,
        scoreB: params.scoreB,
        winnerTeamId: params.winnerTeamId,
        resultType: params.resultType,
        reason: params.reason,
        recordedBy: operatorId,
        recordedAt: new Date().toISOString(),
        verifiedBy: operatorId, // Auto-verified when done as a correction by admin
        verifiedAt: new Date().toISOString()
      };
      return {
        ...m,
        status: "verified" as TournamentMatchStatus,
        scoreA: params.scoreA,
        scoreB: params.scoreB,
        winnerTeamId: params.winnerTeamId,
        winner: params.winnerTeamId, // deprecated compat
        resultType: params.resultType,
        resultRevisions: [...prevRevisions, revision],
        verifiedAt: new Date().toISOString(),
        verifiedBy: operatorId,
        updatedAt: new Date().toISOString()
      };
    })
  };

  next = pushAudit(next, {
    action: "Match Result Corrected",
    description: `CORRECTION: Corrected match ${params.matchId} result: ${params.scoreA}–${params.scoreB}, winner: ${params.winnerTeamId}. Reason: ${params.reason}`,
    operatorId
  });

  // Re-run advancement logic with corrected winner
  next = advanceVerifiedWinner(next, params.tournamentId, params.matchId, operatorId);

  return next;
}

/** 13. Declare Walkover */
export function declareWalkover(
  state: PrototypeState,
  tournamentId: string,
  matchId: string,
  winnerTeamId: string,
  reason: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    tournamentMatches: state.tournamentMatches.map((m) => {
      if (m.id !== matchId || m.tournamentId !== tournamentId) return m;
      return {
        ...m,
        status: "walkover" as TournamentMatchStatus,
        winnerTeamId,
        winner: winnerTeamId, // deprecated compat
        scoreA: m.teamAId === winnerTeamId ? 1 : 0,
        scoreB: m.teamBId === winnerTeamId ? 1 : 0,
        resultType: "walkover" as TournamentMatchResultType,
        walkoverReason: reason,
        endedAt: new Date().toISOString(),
        verifiedAt: new Date().toISOString(),
        verifiedBy: operatorId,
        updatedAt: new Date().toISOString()
      };
    })
  };

  next = pushAudit(next, {
    action: "Match Walkover Declared",
    description: `Declared walkover in match ${matchId} for winner ${winnerTeamId}. Reason: ${reason}`,
    operatorId
  });

  // Advance winner immediately since walkovers are administrative
  next = advanceVerifiedWinner(next, tournamentId, matchId, operatorId);

  return next;
}

/** 14. Disqualify Team */
export function disqualifyTeam(
  state: PrototypeState,
  tournamentId: string,
  teamId: string,
  reason: string,
  operatorId: string = "op-master"
): PrototypeState {
  // Find current matches of team in this tournament
  // Mark current match as disqualified status, award opponent walkover/disqualification win
  let next = {
    ...state,
    tournamentMatches: state.tournamentMatches.map((m) => {
      if (m.tournamentId !== tournamentId) return m;
      if (m.status !== "completed" && m.status !== "verified") {
        if (m.teamAId === teamId) {
          return {
            ...m,
            status: "disqualified" as TournamentMatchStatus,
            disqualifiedTeamId: teamId,
            winnerTeamId: m.teamBId,
            winner: m.teamBId, // deprecated compat
            resultType: "disqualification" as TournamentMatchResultType,
            disqualificationReason: reason,
            endedAt: new Date().toISOString(),
            verifiedAt: new Date().toISOString(),
            verifiedBy: operatorId,
            updatedAt: new Date().toISOString()
          };
        } else if (m.teamBId === teamId) {
          return {
            ...m,
            status: "disqualified" as TournamentMatchStatus,
            disqualifiedTeamId: teamId,
            winnerTeamId: m.teamAId,
            winner: m.teamAId, // deprecated compat
            resultType: "disqualification" as TournamentMatchResultType,
            disqualificationReason: reason,
            endedAt: new Date().toISOString(),
            verifiedAt: new Date().toISOString(),
            verifiedBy: operatorId,
            updatedAt: new Date().toISOString()
          };
        }
      }
      return m;
    })
  };

  next = pushAudit(next, {
    action: "Team Disqualified",
    description: `Disqualified team ${teamId} from tournament ${tournamentId}. Reason: ${reason}`,
    operatorId
  });

  // Find the match we modified and advance the winner
  const modifiedMatches = next.tournamentMatches.filter(
    (m) => m.tournamentId === tournamentId && m.status === "disqualified" && m.disqualifiedTeamId === teamId
  );
  modifiedMatches.forEach((m) => {
    next = advanceVerifiedWinner(next, tournamentId, m.id, operatorId);
  });

  return next;
}

/** 15. Abandon Match */
export function abandonMatch(
  state: PrototypeState,
  tournamentId: string,
  matchId: string,
  reason: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    tournamentMatches: state.tournamentMatches.map((m) =>
      m.id === matchId && m.tournamentId === tournamentId
        ? {
            ...m,
            status: "abandoned" as TournamentMatchStatus,
            resultType: "abandonment" as TournamentMatchResultType,
            abandonReason: reason,
            endedAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        : m
    )
  };

  next = pushAudit(next, {
    action: "Match Abandoned",
    description: `Match ${matchId} abandoned. Reason: ${reason}`,
    operatorId
  });

  next = pushSignal(next, {
    kind: "alert",
    message: `Match abandoned: ${matchId}`
  });

  return next;
}

/** 16. Advance Verified Winner */
export function advanceVerifiedWinner(
  state: PrototypeState,
  tournamentId: string,
  matchId: string,
  operatorId: string = "op-master"
): PrototypeState {
  const match = state.tournamentMatches.find((m) => m.id === matchId && m.tournamentId === tournamentId);
  if (!match || !match.winnerTeamId || !match.nextMatchId) return state;

  const winnerId = match.winnerTeamId;
  const nextMatchId = match.nextMatchId;

  let next = {
    ...state,
    tournamentMatches: state.tournamentMatches.map((m) => {
      if (m.id !== nextMatchId || m.tournamentId !== tournamentId) return m;

      // Determine if matchId is from a lower-numbered branch (teamAId) or higher-numbered branch (teamBId)
      // Standard heuristic: match number determines slot.
      // If our source match index is odd, we fill teamAId; if even, teamBId.
      const isA = (match.matchNumber % 2) !== 0;

      return {
        ...m,
        teamAId: isA ? winnerId : m.teamAId,
        teamA: isA ? winnerId : m.teamA, // deprecated compat
        teamBId: !isA ? winnerId : m.teamBId,
        teamB: !isA ? winnerId : m.teamB, // deprecated compat
        updatedAt: new Date().toISOString()
      };
    })
  };

  next = pushAudit(next, {
    action: "Winner Advanced",
    description: `Advanced team "${winnerId}" from match ${matchId} to ${nextMatchId}.`,
    operatorId
  });

  return next;
}

/** 17. Complete Tournament */
export function completeTournament(
  state: PrototypeState,
  tournamentId: string,
  winnerTeamId: string,
  operatorId: string = "op-master"
): PrototypeState {
  let next = {
    ...state,
    tournaments: state.tournaments.map((t) => {
      if (t.id !== tournamentId) return t;
      return {
        ...t,
        status: "completed" as TournamentStatus,
        winnerTeamId,
        endedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    })
  };

  next = pushAudit(next, {
    action: "Tournament Completed",
    description: `Tournament ${tournamentId} completed! Champion: "${winnerTeamId}".`,
    operatorId
  });

  next = pushSignal(next, {
    kind: "close",
    message: `Tournament completed! Champion: ${winnerTeamId}`
  });

  return next;
}
