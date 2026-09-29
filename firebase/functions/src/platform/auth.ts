/**
 * Caller identity for callable functions.
 *
 * The actor of every command is resolved here from the verified Firebase Auth
 * token — never from the request body.
 *
 * TWO LEVELS OF CHECK
 *  - `requireActor` / `requireAdmin` (synchronous) trust the verified ID token:
 *    signed in, email verified, `disabled` claim not set, role claim present.
 *  - `requireCurrentActor` (async) additionally asks Firebase Auth for the
 *    user record — the server-side equivalent of `verifyIdToken(token, true)`:
 *      * the account must not be disabled in Firebase Auth,
 *      * the token must have been issued after `tokensValidAfterTime`
 *        (i.e. after the last `revokeRefreshTokens`), and
 *      * the role in the token must still match the role in the user's
 *        current custom claims (a demoted operator cannot keep acting on a
 *        token minted before the demotion).
 *    It costs one Auth Admin lookup per command, which is why it is used for
 *    every state-changing command but not for health checks.
 */

import type { CallableContext } from "firebase-functions/v1/https";
import { getAuth } from "firebase-admin/auth";
import { app } from "./firestore";
import { notAuthenticated, notPermitted } from "./errors";

export const ADMIN_ROLES = ["platform-owner", "super-admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * Roles that may take a seat through the `reserveSeat` callable. Mirrors the
 * console's /bookings route (apps/operations-web/lib/nav.ts) minus `finance`,
 * which may view bookings but does not create them.
 */
export const BOOKING_ROLES = [
  "platform-owner",
  "super-admin",
  "city-manager",
  "ops-manager",
  "coordinator",
  "support",
] as const;

export interface VerifiedActor {
  uid: string;
  roleId: string;
  email?: string;
  displayName?: string;
  scope?: string;
  franchiseId?: string | null;
  territoryIds?: string[];
}

/** A verified actor with the name recorded on audit events and decisions. */
export interface CommandActor extends VerifiedActor {
  /** Human-readable actor name for audit trails: token name, else email, else uid. */
  displayName: string;
}

function tokenString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function requireActor(context: CallableContext): CommandActor {
  if (!context.auth) throw notAuthenticated();
  const token = context.auth.token;
  const roleId = String(token.roleId ?? token.role ?? "");
  const disabled = token.disabled === true;
  const emailVerified = token.email_verified === true;
  if (disabled || !emailVerified) throw notPermitted("use the admin console");
  const email = tokenString(token.email);
  return {
    uid: context.auth.uid,
    roleId,
    email,
    displayName: tokenString(token.name) ?? email ?? context.auth.uid,
    scope: tokenString(token.scope),
    franchiseId: tokenString(token.franchiseId) ?? null,
    territoryIds: Array.isArray(token.territoryIds) ? token.territoryIds.filter((t: unknown): t is string => typeof t === "string") : [],
  };
}

export function requireAdmin(context: CallableContext, action: string): CommandActor {
  const actor = requireActor(context);
  if (!ADMIN_ROLES.includes(actor.roleId as AdminRole)) throw notPermitted(action);
  return actor;
}

/**
 * Token checks + role gate + live account check (disabled / revoked / role
 * changed). Use for every privileged, state-changing command.
 */
export async function requireCurrentActor(
  context: CallableContext,
  roles: readonly string[],
  action: string
): Promise<CommandActor> {
  const actor = requireActor(context);
  if (!roles.includes(actor.roleId)) throw notPermitted(action);

  let user;
  try {
    user = await getAuth(app()).getUser(actor.uid);
  } catch (error) {
    if ((error as { code?: string }).code === "auth/user-not-found") {
      throw notAuthenticated("This account no longer exists.");
    }
    throw error;
  }
  if (user.disabled) throw notPermitted("use a disabled account");

  const authTimeSeconds = Number(context.auth?.token.auth_time ?? context.auth?.token.iat ?? 0);
  const validSince = user.tokensValidAfterTime ? Date.parse(user.tokensValidAfterTime) : 0;
  if (Number.isFinite(validSince) && authTimeSeconds * 1000 < validSince) {
    throw notAuthenticated("Your session was ended by an administrator.", { reason: "token-revoked" });
  }

  const claims = user.customClaims ?? {};
  const currentRole = String(claims.roleId ?? claims.role ?? "");
  if (claims.disabled === true) throw notPermitted("use a disabled account");
  if (currentRole !== actor.roleId) {
    throw notAuthenticated("Your access level changed since you signed in.", { reason: "role-changed" });
  }
  return actor;
}
