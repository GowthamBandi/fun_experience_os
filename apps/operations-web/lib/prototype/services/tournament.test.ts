import { describe, it, expect } from "vitest";
import { getInitialState } from "../scenarios/initial";
import { applyScenario } from "../scenarios/definitions";
import { migrateState } from "../migrations";
import type { PrototypeState } from "../scenarios/state";
import {
  createTournament,
  assignTournamentTeams,
  generateSingleEliminationBracket,
  publishTournament,
  assignMatchReferee,
  startTournamentMatch,
  confirmTournamentMatchResult,
  verifyTournamentMatchResult,
  correctTournamentMatchResult,
  declareWalkover,
  disqualifyTeam,
  abandonMatch,
  completeTournament,
  seedOrder,
  migrateLegacyTournaments,
} from "./tournament";

const OWNER = "op-1"; // Platform Owner
const OPS = "op-5"; // Operations Manager, Hyderabad Central
const COORD = "op-7"; // Event Coordinator, Hyderabad Central
const SAFETY = "op-9"; // Safety officer: no tournament rights

function ok<T extends { state: PrototypeState; error?: string }>(r: T): PrototypeState {
  expect(r.error).toBeUndefined();
  return r.state;
}

/** Create a published 5-team knockout in Hyderabad Central with referees on every playable match. */
function setup(teams = ["Alpha", "Bravo", "Charlie", "Delta", "Echo"]) {
  let state = getInitialState();
  const created = createTournament(
    state,
    { name: "Test Cup", code: "TST-1", territoryId: "hvd-central", venueId: "v-1", format: "single-elimination", matchDuration: 20, breakDuration: 5, seedingMethod: "seeded", minimumTeams: 2, maximumTeams: 8 },
    OPS,
  );
  state = ok(created);
  const id = created.id!;
  state = ok(assignTournamentTeams(state, id, teams.map((name) => ({ name })), OPS));
  state = ok(generateSingleEliminationBracket(state, id, OPS));
  state = ok(publishTournament(state, id, OPS));
  for (const m of state.tournamentMatches.filter((x) => x.tournamentId === id && !x.isBye)) {
    state = ok(assignMatchReferee(state, id, m.id, "c-2", COORD));
  }
  const t = state.tournaments.find((x) => x.id === id)!;
  const matches = () => state.tournamentMatches.filter((m) => m.tournamentId === id);
  return { get state() { return state; }, set state(s) { state = s; }, id, t, matches };
}

describe("tournament commands enforce roles and validation", () => {
  it("refuses creation without permission or with invalid input", () => {
    const s = getInitialState();
    const base = { name: "Cup", code: "CUP-1", territoryId: "hvd-central", venueId: "v-1", format: "single-elimination", matchDuration: 20, breakDuration: 5, seedingMethod: "seeded" as const };
    expect(createTournament(s, base, SAFETY).error).toMatch(/Only a/);
    expect(createTournament(s, { ...base, format: "round-robin" }, OPS).error).toMatch(/single-elimination/);
    expect(createTournament(s, { ...base, venueId: "v-4" }, OPS).error).toMatch(/territory/);
    expect(createTournament(s, { ...base, code: "SCK-2026" }, OPS).error).toMatch(/already used/);
    expect(createTournament(s, { ...base, territoryId: "blr-south", venueId: "v-4" }, OPS).error).toMatch(/territory/);
    const r = createTournament(s, base, OPS);
    expect(r.error).toBeUndefined();
    expect(r.state.tournaments.at(-1)?.status).toBe("draft");
  });

  it("stores teams as entrant ids, never names", () => {
    const x = setup(["Alpha", "Bravo", "Charlie", "Delta"]);
    const t = x.state.tournaments.find((tt) => tt.id === x.id)!;
    expect(t.entrants?.map((e) => e.name)).toEqual(["Alpha", "Bravo", "Charlie", "Delta"]);
    expect(t.teamIds.every((tid) => tid.startsWith(`${x.id}-team-`))).toBe(true);
    for (const m of x.matches()) {
      for (const ref of [m.teamAId, m.teamBId]) if (ref) expect(t.teamIds).toContain(ref);
    }
  });

  it("rejects duplicate team names and team changes after publishing", () => {
    const s = ok(createTournament(getInitialState(), { name: "Dup Cup", code: "DUP-1", territoryId: "hvd-central", venueId: "v-1", format: "single-elimination", matchDuration: 20, breakDuration: 5, seedingMethod: "seeded" }, OPS));
    const id = s.tournaments.at(-1)!.id;
    expect(assignTournamentTeams(s, id, [{ name: "A1" }, { name: "a1" }], OPS).error).toMatch(/already entered/);
    const x = setup();
    expect(assignTournamentTeams(x.state, x.id, [{ name: "New" }], OPS).error).toMatch(/locked/);
  });

  it("generates a seeded bracket with byes for top seeds and no empty matches", () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    const x = setup();
    const r1 = x.matches().filter((m) => m.roundNumber === 1);
    expect(r1).toHaveLength(4);
    expect(r1.every((m) => m.teamAId || m.teamBId)).toBe(true);
    const byes = r1.filter((m) => m.isBye);
    expect(byes).toHaveLength(3);
    // Byes advanced into round two.
    const r2 = x.matches().filter((m) => m.roundNumber === 2);
    expect(r2.flatMap((m) => [m.teamAId, m.teamBId]).filter(Boolean)).toHaveLength(3);
    expect(x.matches().find((m) => m.roundNumber === 3)?.roundLabel).toBe("Final");
  });

  it("refuses bracket generation below the minimum team count", () => {
    let s = getInitialState();
    const c = createTournament(s, { name: "Small Cup", code: "SML-1", territoryId: "hvd-central", venueId: "v-1", format: "single-elimination", matchDuration: 20, breakDuration: 5, seedingMethod: "seeded", minimumTeams: 4 }, OPS);
    s = ok(c);
    s = ok(assignTournamentTeams(s, c.id!, [{ name: "One" }, { name: "Two" }], OPS));
    expect(generateSingleEliminationBracket(s, c.id!, OPS).error).toMatch(/at least 4 teams/);
    expect(publishTournament(s, c.id!, OPS).error).toMatch(/Generate the bracket/);
  });

  it("runs a match: start requires referee, result requires a winner with the higher score, verification advances", () => {
    const x = setup(["Aces", "Bulls", "Colts", "Dukes"]);
    const [m1] = x.matches().filter((m) => m.roundNumber === 1);
    const noRef = { ...x.state, tournamentMatches: x.state.tournamentMatches.map((m) => (m.id === m1.id ? { ...m, refereeId: undefined } : m)) };
    expect(startTournamentMatch(noRef, x.id, m1.id, COORD).error).toMatch(/referee/);
    expect(startTournamentMatch(x.state, x.id, m1.id, SAFETY).error).toMatch(/Only a/);
    x.state = ok(startTournamentMatch(x.state, x.id, m1.id, COORD));
    expect(x.state.tournaments.find((t) => t.id === x.id)?.status).toBe("live");

    const base = { tournamentId: x.id, matchId: m1.id };
    expect(confirmTournamentMatchResult(x.state, { ...base, scoreA: 3, scoreB: 3, winnerTeamId: m1.teamAId! }, COORD).error).toMatch(/draw/);
    expect(confirmTournamentMatchResult(x.state, { ...base, scoreA: 1, scoreB: 3, winnerTeamId: m1.teamAId! }, COORD).error).toMatch(/higher score/);
    expect(confirmTournamentMatchResult(x.state, { ...base, scoreA: -1, scoreB: 3, winnerTeamId: m1.teamBId! }, COORD).error).toMatch(/whole numbers/);
    expect(confirmTournamentMatchResult(x.state, { ...base, scoreA: 5, scoreB: 3, winnerTeamId: "someone" }, COORD).error).toMatch(/one of the two teams/);
    x.state = ok(confirmTournamentMatchResult(x.state, { ...base, scoreA: 5, scoreB: 3, winnerTeamId: m1.teamAId! }, COORD));
    expect(x.state.tournamentMatches.find((m) => m.id === m1.id)?.status).toBe("awaiting-verification");

    x.state = ok(verifyTournamentMatchResult(x.state, x.id, m1.id, OPS));
    const final = x.matches().find((m) => m.id === m1.nextMatchId)!;
    expect(final.teamAId).toBe(m1.teamAId);
    expect(verifyTournamentMatchResult(x.state, x.id, m1.id, OPS).error).toMatch(/awaiting verification/);
  });

  it("dual verification needs a second person", () => {
    const x = setup(["Aces", "Bulls"]);
    x.state = { ...x.state, tournaments: x.state.tournaments.map((t) => (t.id === x.id ? { ...t, verificationRequirement: "dual" } : t)) };
    const [m] = x.matches();
    x.state = ok(startTournamentMatch(x.state, x.id, m.id, COORD));
    x.state = ok(confirmTournamentMatchResult(x.state, { tournamentId: x.id, matchId: m.id, scoreA: 2, scoreB: 0, winnerTeamId: m.teamAId! }, COORD));
    expect(verifyTournamentMatchResult(x.state, x.id, m.id, COORD).error).toMatch(/second person/);
    expect(verifyTournamentMatchResult(x.state, x.id, m.id, OPS).error).toBeUndefined();
  });

  it("corrections need a reason and replace the advanced winner; blocked once the next match started", () => {
    const x = setup(["Aces", "Bulls", "Colts", "Dukes"]);
    const [m1, m2] = x.matches().filter((m) => m.roundNumber === 1);
    for (const m of [m1, m2]) {
      x.state = ok(startTournamentMatch(x.state, x.id, m.id, COORD));
      x.state = ok(confirmTournamentMatchResult(x.state, { tournamentId: x.id, matchId: m.id, scoreA: 2, scoreB: 1, winnerTeamId: m.teamAId! }, COORD));
      x.state = ok(verifyTournamentMatchResult(x.state, x.id, m.id, OPS));
    }
    const correction = { tournamentId: x.id, matchId: m1.id, scoreA: 1, scoreB: 2, winnerTeamId: m1.teamBId!, reason: "short" };
    expect(correctTournamentMatchResult(x.state, correction, OPS).error).toMatch(/reason/);
    expect(correctTournamentMatchResult(x.state, { ...correction, reason: "Scorer swapped the two columns" }, COORD).error).toMatch(/Only a/);
    const fixed = ok(correctTournamentMatchResult(x.state, { ...correction, reason: "Scorer swapped the two columns" }, OPS));
    const final = fixed.tournamentMatches.find((m) => m.id === m1.nextMatchId)!;
    expect(final.teamAId).toBe(m1.teamBId);
    expect(fixed.tournamentMatches.find((m) => m.id === m1.id)?.resultRevisions).toHaveLength(2);

    const started = ok(startTournamentMatch(x.state, x.id, final.id, COORD));
    expect(correctTournamentMatchResult(started, { ...correction, reason: "Scorer swapped the two columns" }, OPS).error).toMatch(/already started/);
  });

  it("walkover, disqualification and abandonment validate reasons and states", () => {
    const x = setup(["Aces", "Bulls", "Colts", "Dukes"]);
    const [m1, m2] = x.matches().filter((m) => m.roundNumber === 1);
    expect(declareWalkover(x.state, x.id, m1.id, m1.teamAId!, "no", COORD).error).toMatch(/reason/);
    expect(declareWalkover(x.state, x.id, m1.id, "ghost", "Opponent never checked in", COORD).error).toMatch(/one of the two teams/);
    x.state = ok(declareWalkover(x.state, x.id, m1.id, m1.teamAId!, "Opponent never checked in", COORD));
    expect(x.matches().find((m) => m.id === m1.nextMatchId)?.teamAId).toBe(m1.teamAId);
    expect(declareWalkover(x.state, x.id, m1.id, m1.teamAId!, "Opponent never checked in", COORD).error).toMatch(/before the match has a result/);

    expect(disqualifyTeam(x.state, x.id, m2.teamBId!, "Fielded an unregistered player", COORD).error).toMatch(/Only a/);
    x.state = ok(disqualifyTeam(x.state, x.id, m2.teamBId!, "Fielded an unregistered player", OPS));
    const m2After = x.matches().find((m) => m.id === m2.id)!;
    expect(m2After.status).toBe("disqualified");
    expect(m2After.winnerTeamId).toBe(m2.teamAId);
    expect(x.state.tournaments.find((t) => t.id === x.id)?.entrants?.find((e) => e.id === m2.teamBId)?.status).toBe("disqualified");
    expect(disqualifyTeam(x.state, x.id, m2.teamBId!, "Fielded an unregistered player", OPS).error).toMatch(/already disqualified/);

    const final = x.matches().find((m) => m.roundNumber === 2)!;
    expect(abandonMatch(x.state, x.id, final.id, "rain", COORD).error).toMatch(/reason/);
    x.state = ok(abandonMatch(x.state, x.id, final.id, "Floodlights failed at the venue", COORD));
    expect(completeTournament(x.state, x.id, OPS).error).toMatch(/final has no winner/);
  });

  it("completes only when every match is decided, and names the final's winner champion", () => {
    const x = setup(["Aces", "Bulls"]);
    const [m] = x.matches();
    expect(completeTournament(x.state, x.id, OPS).error).toMatch(/still to be played/);
    x.state = ok(startTournamentMatch(x.state, x.id, m.id, COORD));
    x.state = ok(confirmTournamentMatchResult(x.state, { tournamentId: x.id, matchId: m.id, scoreA: 0, scoreB: 2, winnerTeamId: m.teamBId! }, COORD));
    expect(completeTournament(x.state, x.id, OPS).error).toMatch(/awaiting verification/);
    x.state = ok(verifyTournamentMatchResult(x.state, x.id, m.id, OPS));
    expect(completeTournament(x.state, x.id, COORD).error).toMatch(/Only a/);
    const done = completeTournament(x.state, x.id, OPS);
    expect(done.error).toBeUndefined();
    expect(done.championId).toBe(m.teamBId);
    expect(done.state.tournaments.find((t) => t.id === x.id)?.status).toBe("completed");
  });
});

describe("tournament data", () => {
  it("seed and Tournament Day scenario reference entrant ids everywhere", () => {
    const state = applyScenario("Tournament Day", migrateState(getInitialState()));
    for (const m of state.tournamentMatches) {
      const t = state.tournaments.find((x) => x.id === m.tournamentId)!;
      const ids = new Set(t.entrants?.map((e) => e.id));
      for (const ref of [m.teamAId, m.teamBId, m.winnerTeamId]) if (ref) expect(ids.has(ref)).toBe(true);
    }
    expect(state.tournamentMatches.find((m) => m.id === "m-2")?.status).toBe("awaiting-verification");
    expect(state.tournamentMatches.find((m) => m.id === "m-6")?.teamBId).toBe("tr-2-team-3");
  });

  it("migration converts name-based teams to entrant ids idempotently", () => {
    const legacy = getInitialState();
    legacy.tournaments = [
      { id: "tr-9", name: "Legacy", code: "LEG-1", territoryId: "hvd-central", venueId: "v-1", format: "single-elimination", status: "live", teamIds: ["Red", "Blue"], teams: ["Red", "Blue"], teamCount: 2, matchDuration: 20, breakDuration: 5, seedingMethod: "random", winnerTeamId: undefined, date: "Today" },
    ];
    legacy.tournamentMatches = [
      { id: "mx", tournamentId: "tr-9", roundNumber: 1, matchNumber: 1, round: "Final", teamAId: "Red", teamBId: "Blue", teamA: "Red", teamB: "Blue", winnerTeamId: "Blue", winner: "Blue", status: "completed", verifiedAt: "Today", scoreA: 1, scoreB: 2 },
    ];
    const once = migrateLegacyTournaments(legacy);
    const t = once.tournaments[0];
    expect(t.entrants?.map((e) => e.name)).toEqual(["Red", "Blue"]);
    const m = once.tournamentMatches[0];
    expect(m.teamAId).toBe(t.entrants![0].id);
    expect(m.winnerTeamId).toBe(t.entrants![1].id);
    expect(m.status).toBe("verified");
    expect(m.roundLabel).toBe("Final");
    expect("teamA" in m).toBe(false);
    expect("teams" in t).toBe(false);
    expect(t.scheduledStart).toBe("Today");
    const twice = migrateLegacyTournaments(once);
    expect(twice.tournaments).toEqual(once.tournaments);
    expect(twice.tournamentMatches).toEqual(once.tournamentMatches);
  });
});
