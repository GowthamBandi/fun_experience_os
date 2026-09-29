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
