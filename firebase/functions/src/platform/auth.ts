import type { CallableContext } from "firebase-functions/v1/https";
import { notAuthenticated, notPermitted } from "./errors";

export const ADMIN_ROLES = ["platform-owner", "super-admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export interface VerifiedActor {
  uid: string;
  roleId: string;
  email?: string;
}

export function requireActor(context: CallableContext): VerifiedActor {
  if (!context.auth) throw notAuthenticated();
  const roleId = String(context.auth.token.roleId ?? context.auth.token.role ?? "");
  const disabled = context.auth.token.disabled === true;
  const emailVerified = context.auth.token.email_verified === true;
  if (disabled || !emailVerified) throw notPermitted("use the admin console");
  return {
    uid: context.auth.uid,
    roleId,
    email: typeof context.auth.token.email === "string" ? context.auth.token.email : undefined,
  };
}

export function requireAdmin(context: CallableContext, action: string): VerifiedActor {
  const actor = requireActor(context);
  if (!ADMIN_ROLES.includes(actor.roleId as AdminRole)) throw notPermitted(action);
  return actor;
}

/**
 * Named admin capabilities (docs/NOTIFICATION_CENTER_CONTRACT.md §5). Mirrored by
 * the console's lib/console/capabilities.ts MATRIX; its parity test reads this map.
 */
export const ADMIN_CAPABILITIES = {
  /** Announcements, notifications, audience previews and templates. */
  "announcements.manage": ["platform-owner", "super-admin"],
  /** setAccountStatus: pause / block / re-activate PULSE people. */
  "accounts.moderate": ["platform-owner", "super-admin"],
} as const satisfies Record<string, readonly AdminRole[]>;

export type AdminCapability = keyof typeof ADMIN_CAPABILITIES;

/** requireAdmin for a named capability: the caller's role must hold it. */
export function requireCapability(context: CallableContext, capability: AdminCapability | AdminCapability[]): VerifiedActor {
  const actor = requireActor(context);
  const wanted = Array.isArray(capability) ? capability : [capability];
  const ok = wanted.some((c) => (ADMIN_CAPABILITIES[c] as readonly string[]).includes(actor.roleId));
  if (!ok) throw notPermitted(wanted.join(" or "));
  return actor;
}
