/**
 * Trust & Safety permission matrix.
 *
 * One typed table over the real `RoleId` union decides who may take each
 * incident, dispute, moderation and refund-exception action. The UI reads it
 * to enable or explain buttons; the services in `lib/prototype/services`
 * enforce it again with the acting operator resolved from `state.operators`,
 * so a command can never succeed just because a button was reachable.
 *
 * Source: docs/admin/15-franchise-operating-model.md §2.2, §3, §4 and the
 * escalation table (§6) — Safety & Moderation Officer owns incidents, reports
 * and bans; chain roles (City Manager, Operations Manager, Coordinator) are
 * first responders inside their own territory; Customer Support takes dispute
 * intake; Finance approves money exceptions; Platform Owner and Super Admin
 * hold every permission. Permanent platform bans need a Platform Owner or
 * Super Admin (OQ-SA-008 resolved conservatively).
 */
import type { RoleId } from "@/lib/types";
import type { PrototypeState } from "@/lib/prototype/scenarios/state";
import type { OperatorAccount } from "@/lib/prototype/entities";

export type SafetyAction =
  | "incident.report"
  | "incident.acknowledge"
  | "incident.triage"
  | "incident.assign"
  | "incident.escalate"
  | "incident.investigate"
  | "incident.resolve"
  | "incident.close"
  | "incident.evidence"
  | "incident.follow-up"
  | "dispute.submit"
  | "dispute.assign"
  | "dispute.request-evidence"
  | "dispute.decide"
  | "dispute.close"
  | "moderation.open-case"
  | "moderation.propose"
  | "moderation.approve"
  | "moderation.approve-ban"
  | "moderation.reject"
  | "moderation.revoke"
  | "moderation.revoke-ban"
  | "refund-exception.recommend"
  | "refund-exception.decide";

const OWNERS = ["platform-owner", "super-admin"] as const satisfies readonly RoleId[];
const SAFETY_DESK = [...OWNERS, "safety"] as const satisfies readonly RoleId[];
/** Chain roles that respond to incidents on the floor, limited to their own territory. */
const FIRST_RESPONDERS = ["city-manager", "ops-manager", "coordinator"] as const satisfies readonly RoleId[];

export const SAFETY_PERMISSIONS: Record<SafetyAction, readonly RoleId[]> = {
  "incident.report": [...SAFETY_DESK, ...FIRST_RESPONDERS, "venue-manager", "staff", "support"],
  "incident.acknowledge": [...SAFETY_DESK, ...FIRST_RESPONDERS],
  "incident.triage": [...SAFETY_DESK, ...FIRST_RESPONDERS],
  "incident.evidence": [...SAFETY_DESK, ...FIRST_RESPONDERS],
  "incident.assign": SAFETY_DESK,
  "incident.escalate": SAFETY_DESK,
  "incident.investigate": SAFETY_DESK,
  "incident.resolve": SAFETY_DESK,
  "incident.close": SAFETY_DESK,
  "incident.follow-up": SAFETY_DESK,

  "dispute.submit": [...SAFETY_DESK, "support", ...FIRST_RESPONDERS],
  "dispute.assign": SAFETY_DESK,
  "dispute.request-evidence": SAFETY_DESK,
  "dispute.decide": SAFETY_DESK,
  "dispute.close": SAFETY_DESK,

  "moderation.open-case": SAFETY_DESK,
  "moderation.propose": SAFETY_DESK,
  "moderation.approve": SAFETY_DESK,
  "moderation.approve-ban": OWNERS,
  "moderation.reject": SAFETY_DESK,
  "moderation.revoke": SAFETY_DESK,
  "moderation.revoke-ban": OWNERS,

  "refund-exception.recommend": [...SAFETY_DESK, "city-manager", "ops-manager"],
  "refund-exception.decide": [...OWNERS, "finance"],
};

/** Roles whose safety permissions only apply inside their own territory. */
export const TERRITORY_SCOPED_ROLES: readonly RoleId[] = ["city-manager", "ops-manager", "coordinator", "venue-manager", "staff"];

const ROLE_LABEL: Record<RoleId, string> = {
  "platform-owner": "Platform Owner",
  "super-admin": "Super Admin",
  "regional-partner": "Regional Franchise Partner",
  "city-manager": "City Manager",
  "ops-manager": "Operations Manager",
  "venue-manager": "Venue Manager",
  coordinator: "Event Coordinator",
  staff: "Staff",
  support: "Customer Support",
  safety: "Safety & Moderation Officer",
  finance: "Finance Manager",
  marketing: "Marketing Manager",
  analyst: "Analyst",
};

const ACTION_LABEL: Record<SafetyAction, string> = {
  "incident.report": "report incidents",
  "incident.acknowledge": "acknowledge incidents",
  "incident.triage": "triage incidents",
  "incident.assign": "assign incident investigators",
  "incident.escalate": "escalate incidents",
  "incident.investigate": "update investigations",
  "incident.resolve": "resolve incidents",
  "incident.close": "close incidents",
  "incident.evidence": "add evidence to incidents",
  "incident.follow-up": "assign incident follow-ups",
  "dispute.submit": "log disputes",
  "dispute.assign": "assign dispute reviewers",
  "dispute.request-evidence": "request dispute evidence",
  "dispute.decide": "decide disputes",
  "dispute.close": "close disputes",
  "moderation.open-case": "open moderation cases",
  "moderation.propose": "propose moderation actions",
  "moderation.approve": "approve moderation actions",
  "moderation.approve-ban": "approve permanent platform bans",
  "moderation.reject": "reject moderation proposals",
  "moderation.revoke": "revoke moderation actions",
  "moderation.revoke-ban": "revoke permanent platform bans",
  "refund-exception.recommend": "recommend refund exceptions",
  "refund-exception.decide": "approve or reject refund exceptions",
};

export const roleLabel = (role: RoleId): string => ROLE_LABEL[role] ?? role;

export function canPerformSafetyAction(role: RoleId | undefined, action: SafetyAction): boolean {
  return !!role && SAFETY_PERMISSIONS[action].includes(role);
}

/** Plain-English sentence naming who may take an action. */
export function safetyDenialReason(action: SafetyAction): string {
  const roles = SAFETY_PERMISSIONS[action].map(roleLabel);
  const who = roles.length > 1 ? `${roles.slice(0, -1).join(", ")} or ${roles[roles.length - 1]}` : roles[0];
  return `Only a ${who} can ${ACTION_LABEL[action]}.`;
}

export type ActorCheck = { ok: true; actor: OperatorAccount } | { ok: false; error: string };

/** Resolve the acting operator from the workspace. Commands never trust a caller-supplied role. */
export function resolveActor(state: PrototypeState, actorId: string): ActorCheck {
  const actor = (state.operators ?? []).find((o) => o.id === actorId);
  if (!actor) return { ok: false, error: "Sign in as a console operator to take this action." };
  if (actor.status === "suspended") return { ok: false, error: "Your operator account is suspended. Ask a Platform Owner to reactivate it." };
  return { ok: true, actor };
}

/**
 * Service-side authorisation: resolves the actor's role and applies the
 * matrix plus territory scope for chain roles.
 */
export function authorizeSafetyAction(
  state: PrototypeState,
  actorId: string,
  action: SafetyAction,
  scope?: { territoryId?: string },
): ActorCheck {
  const check = resolveActor(state, actorId);
  if (!check.ok) return check;
  const { actor } = check;
  if (!canPerformSafetyAction(actor.role, action)) return { ok: false, error: safetyDenialReason(action) };
  if (scope?.territoryId && TERRITORY_SCOPED_ROLES.includes(actor.role) && actor.territoryId !== scope.territoryId) {
    return {
      ok: false,
      error: `As ${roleLabel(actor.role)} you can only ${ACTION_LABEL[action]} in your own territory. Ask a Safety & Moderation Officer to handle this one.`,
    };
  }
  return { ok: true, actor };
}

/** UI helper: is this action allowed for the signed-in operator on this record, and if not, why. */
export function safetyGate(
  role: RoleId | undefined,
  action: SafetyAction,
  opts?: { operatorTerritoryId?: string; recordTerritoryId?: string },
): { allowed: boolean; reason?: string } {
  if (!canPerformSafetyAction(role, action)) return { allowed: false, reason: safetyDenialReason(action) };
  if (
    role &&
    opts?.recordTerritoryId &&
    opts.operatorTerritoryId &&
    TERRITORY_SCOPED_ROLES.includes(role) &&
    opts.recordTerritoryId !== opts.operatorTerritoryId
  ) {
    return { allowed: false, reason: `This record is outside your territory. Only your own territory's incidents can be handled in your role.` };
  }
  return { allowed: true };
}
