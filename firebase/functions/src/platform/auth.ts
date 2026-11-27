import type { CallableContext } from "firebase-functions/v1/https";
import { DomainError, notAuthenticated, notPermitted } from "./errors";

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
  if (!hasOperatorSecondFactor(context.auth.token as Record<string, unknown>)) {
    throw new DomainError("NOT_PERMITTED", "Sign in again with your authenticator app code to use the admin console.", {
      nextStep: "Sign out, then sign in: after your password, enter the 6-digit code from your authenticator app.",
      facts: { reason: "second-factor-required" },
    });
  }
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

/**
 * True when the operator signed in with their authenticator-app code (the ID
 * token's firebase.sign_in_second_factor is "totp"). An SMS factor doesn't
 * count. The Auth emulator can't do TOTP, so the seeded @pulse.test logins
 * are exempt only in a local emulator on a demo- project: neither can exist
 * on a real project (same guard as the emulator payment provider).
 */
export function hasOperatorSecondFactor(
  token: Record<string, unknown>,
  env: { emulated: boolean; projectId: string } = {
    emulated: process.env.FUNCTIONS_EMULATOR === "true",
    projectId: process.env.GCLOUD_PROJECT ?? process.env.GCP_PROJECT ?? "",
  }
): boolean {
  const fb = (token.firebase ?? {}) as { sign_in_second_factor?: unknown };
  if (fb.sign_in_second_factor === "totp") return true;
  return env.emulated && env.projectId.startsWith("demo-") && typeof token.email === "string" && token.email.endsWith("@pulse.test");
}
