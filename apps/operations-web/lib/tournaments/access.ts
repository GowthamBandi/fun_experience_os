/**
 * Tournament permission matrix (docs/admin/08-tournament-management.md,
 * docs/admin/15-franchise-operating-model.md §3).
 *
 * City and Operations Managers own a tournament's structure (entrants,
 * bracket, publishing, corrections, disqualifications, completion).
 * Event Coordinators run match day (referees, start/pause, verification,
 * walkovers, abandonment). Staff acting as referees enter scores.
 * Chain roles act only inside their own territory.
 */
import type { RoleId } from "@/lib/types";
import type { PrototypeState } from "@/lib/prototype/scenarios/state";
import { resolveActor, roleLabel, TERRITORY_SCOPED_ROLES, type ActorCheck } from "@/lib/safety/access";

export type TournamentAction =
  | "tournament.create"
  | "tournament.teams"
  | "tournament.bracket"
  | "tournament.publish"
  | "tournament.complete"
  | "match.referee"
  | "match.run"
  | "match.result"
  | "match.verify"
  | "match.correct"
  | "match.walkover"
  | "match.abandon"
  | "team.disqualify";

const OWNERS: RoleId[] = ["platform-owner", "super-admin"];
const MANAGERS: RoleId[] = [...OWNERS, "city-manager", "ops-manager"];
const MATCH_DAY: RoleId[] = [...MANAGERS, "coordinator"];

export const TOURNAMENT_PERMISSIONS: Record<TournamentAction, readonly RoleId[]> = {
  "tournament.create": MANAGERS,
  "tournament.teams": MANAGERS,
  "tournament.bracket": MANAGERS,
  "tournament.publish": MANAGERS,
  "tournament.complete": MANAGERS,
  "match.referee": MATCH_DAY,
  "match.run": MATCH_DAY,
  "match.result": [...MATCH_DAY, "staff"],
  "match.verify": MATCH_DAY,
  "match.correct": MANAGERS,
  "match.walkover": MATCH_DAY,
  "match.abandon": MATCH_DAY,
  "team.disqualify": MANAGERS,
};

const ACTION_LABEL: Record<TournamentAction, string> = {
  "tournament.create": "create tournaments",
  "tournament.teams": "change a tournament's teams",
  "tournament.bracket": "generate brackets",
  "tournament.publish": "publish tournaments",
  "tournament.complete": "complete tournaments",
  "match.referee": "assign referees",
  "match.run": "start, pause or resume matches",
  "match.result": "record match results",
  "match.verify": "verify match results",
  "match.correct": "correct verified results",
  "match.walkover": "declare walkovers",
  "match.abandon": "abandon matches",
  "team.disqualify": "disqualify teams",
};

export function canPerformTournamentAction(role: RoleId | undefined, action: TournamentAction): boolean {
  return !!role && TOURNAMENT_PERMISSIONS[action].includes(role);
}

export function tournamentDenialReason(action: TournamentAction): string {
  const roles = TOURNAMENT_PERMISSIONS[action].map(roleLabel);
  const who = roles.length > 1 ? `${roles.slice(0, -1).join(", ")} or ${roles[roles.length - 1]}` : roles[0];
  return `Only a ${who} can ${ACTION_LABEL[action]}.`;
}

export function authorizeTournamentAction(
  state: PrototypeState,
  actorId: string,
  action: TournamentAction,
  territoryId?: string,
): ActorCheck {
  const check = resolveActor(state, actorId);
  if (!check.ok) return check;
  const { actor } = check;
  if (!canPerformTournamentAction(actor.role, action)) return { ok: false, error: tournamentDenialReason(action) };
  if (territoryId && TERRITORY_SCOPED_ROLES.includes(actor.role) && actor.territoryId !== territoryId) {
    return { ok: false, error: `This tournament is outside your territory, so you can't ${ACTION_LABEL[action]} here.` };
  }
  return { ok: true, actor };
}

export function tournamentGate(
  role: RoleId | undefined,
  action: TournamentAction,
  opts?: { operatorTerritoryId?: string; tournamentTerritoryId?: string },
): { allowed: boolean; reason?: string } {
  if (!canPerformTournamentAction(role, action)) return { allowed: false, reason: tournamentDenialReason(action) };
  if (role && opts?.tournamentTerritoryId && opts.operatorTerritoryId && TERRITORY_SCOPED_ROLES.includes(role) && opts.tournamentTerritoryId !== opts.operatorTerritoryId) {
    return { allowed: false, reason: "This tournament is outside your territory." };
  }
  return { allowed: true };
}
