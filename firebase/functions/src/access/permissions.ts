/**
 * Organizer / staff authorization — WHAT × WHERE (ADR-0004).
 *
 * WHAT: an explicit permission list on the membership.
 * WHERE: an event scope (all events of the organizer, or listed event ids).
 *
 * Every privileged callable resolves the caller's membership fresh from
 * Firestore, so revocation and permission edits apply to the very next
 * request. Custom claims are never used for organizer/staff authority.
 */

import type { Transaction } from "firebase-admin/firestore";
import { COLLECTIONS, db, membershipId } from "../platform/firestore";
import { DomainError } from "../platform/errors";

export const PERMISSIONS = [
  "experiences.view",
  "experiences.edit",
  "experiences.submit",
  "events.view",
  "events.edit",
  "events.submit",
  "events.publish",
  "events.operate",
  "events.cancel",
  "attendees.view",
  "tickets.scan",
  "reviews.view",
  "reviews.respond",
  "refunds.view",
  "refunds.request",
  "earnings.view",
  "staff.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Permissions that are checked against the event scope. */
export const EVENT_SCOPED: ReadonlySet<Permission> = new Set<Permission>([
  "events.view",
  "events.edit",
  "events.submit",
  "events.publish",
  "events.operate",
  "events.cancel",
  "attendees.view",
  "tickets.scan",
  "reviews.view",
  "reviews.respond",
  "refunds.request",
]);

/** Organization-wide permissions: require owner or `eventScope.all`. */
export const ORG_WIDE: ReadonlySet<Permission> = new Set<Permission>([
  "experiences.view",
  "experiences.edit",
  "experiences.submit",
  "refunds.view",
  "earnings.view",
  "staff.manage",
]);

/** UI presets only; checks always read the explicit list. */
export const ROLE_TEMPLATES: Record<string, Permission[]> = {
  "check-in": ["events.view", "attendees.view", "tickets.scan"],
  "event-lead": ["events.view", "events.operate", "attendees.view", "tickets.scan", "reviews.view", "refunds.request"],
  manager: PERMISSIONS.filter((p) => p !== "staff.manage" && p !== "earnings.view"),
};

export type MembershipRole = "owner" | "staff";
export type MembershipStatus = "active" | "revoked";

export interface EventScope {
  all: boolean;
  eventIds: string[];
}

export interface Membership {
  orgId: string;
  uid: string;
  role: MembershipRole;
  status: MembershipStatus;
  permissions: Permission[];
  eventScope: EventScope;
  title?: string;
  version: number;
}

export function parsePermissions(value: unknown): Permission[] {
  if (!Array.isArray(value)) throw new DomainError("INVALID_INPUT", "Choose at least one permission.");
  const out = new Set<Permission>();
  for (const v of value) {
    if (!(PERMISSIONS as readonly string[]).includes(String(v))) {
      throw new DomainError("INVALID_INPUT", "One of the selected permissions isn't recognised.", { detail: { permission: v } });
    }
    out.add(v as Permission);
  }
  if (out.size === 0) throw new DomainError("INVALID_INPUT", "Choose at least one permission.");
  return [...out];
}

export function parseScope(value: unknown): EventScope {
  if (value === "all" || (value && typeof value === "object" && (value as EventScope).all === true)) {
    return { all: true, eventIds: [] };
  }
  const ids = Array.isArray(value) ? value : (value as { eventIds?: unknown } | null)?.eventIds;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new DomainError("INVALID_INPUT", "Assign at least one event, or all events.");
  }
  const clean = [...new Set(ids.map((i) => String(i)).filter((i) => /^[A-Za-z0-9_-]{4,128}$/.test(i)))];
  if (clean.length !== ids.length) throw new DomainError("INVALID_INPUT", "One of the assigned events isn't valid.");
  if (clean.length > 200) throw new DomainError("INVALID_INPUT", "Assign at most 200 events, or choose all events.");
  return { all: false, eventIds: clean };
}

/** Does this membership allow [permission] (optionally on [eventId])? */
export function allows(m: Membership | null, permission: Permission, eventId?: string): boolean {
  if (!m || m.status !== "active") return false;
  if (m.role === "owner") return true;
  if (!m.permissions.includes(permission)) return false;
  if (ORG_WIDE.has(permission)) return m.eventScope.all;
  if (EVENT_SCOPED.has(permission)) {
    if (m.eventScope.all) return true;
    if (!eventId) return false;
    return m.eventScope.eventIds.includes(eventId);
  }
  return true;
}

/**
 * The set of permissions [granter] may hand out. You can't grant what you
 * don't hold, and only owners can grant `staff.manage`.
 */
export function assertCanGrant(granter: Membership, permissions: Permission[], scope: EventScope): void {
  if (granter.role === "owner") return;
  for (const p of permissions) {
    if (p === "staff.manage" || !granter.permissions.includes(p)) {
      throw new DomainError("NOT_PERMITTED", "You can only grant permissions you hold yourself.", {
        nextStep: "Ask the organizer owner to grant this permission.",
        detail: { permission: p },
      });
    }
  }
  if (scope.all && !granter.eventScope.all) {
    throw new DomainError("NOT_PERMITTED", "You can only assign events you are assigned to.");
  }
  if (!scope.all && !granter.eventScope.all) {
    for (const id of scope.eventIds) {
      if (!granter.eventScope.eventIds.includes(id)) {
        throw new DomainError("NOT_PERMITTED", "You can only assign events you are assigned to.", { detail: { eventId: id } });
      }
    }
  }
}

export async function readMembership(orgId: string, uid: string, tx?: Transaction): Promise<Membership | null> {
  const ref = db().collection(COLLECTIONS.memberships).doc(membershipId(orgId, uid));
  const snap = tx ? await tx.get(ref) : await ref.get();
  return snap.exists ? (snap.data() as Membership) : null;
}

/** Resolves the caller's membership and enforces [permission] or throws. */
export async function requirePermission(
  uid: string,
  orgId: string,
  permission: Permission,
  opts: { eventId?: string; tx?: Transaction } = {}
): Promise<Membership> {
  const m = await readMembership(orgId, uid, opts.tx);
  if (!allows(m, permission, opts.eventId)) {
    throw new DomainError("NOT_PERMITTED", "You don't have access to do this for this organizer.", {
      nextStep: "Ask the organizer owner to update your access.",
      detail: { permission, orgId, eventId: opts.eventId ?? null },
    });
  }
  return m!;
}

export function actorRole(m: Membership): string {
  return `org:${m.orgId}:${m.role}`;
}
