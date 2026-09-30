/**
 * Console role → capability mapping (pure, unit-tested).
 *
 * This mirrors the server's authorization so the UI never offers an action
 * the backend will refuse. The server stays the authority:
 *
 *   - requireAdmin()            firebase/functions/src/platform/auth.ts
 *                               ADMIN_ROLES = platform-owner, super-admin
 *   - setOperatorAccess         firebase/functions/src/auth/operatorAccess.ts
 *                               platform-owner only
 *   - Firestore rules           isAdmin(): platform-owner, super-admin
 *                               isAuditor(): auditEvents, settlements, ledgerEntries (read only)
 *
 * tests/unit/capabilities.test.ts re-reads those backend files and fails if
 * the roles drift apart.
 */

import { isArchivedRoute, isGovernanceRoute } from "./archived";

export const CONSOLE_ROLES = ["platform-owner", "super-admin", "auditor"] as const;
export type ConsoleRole = (typeof CONSOLE_ROLES)[number];

export const ROLE_LABEL: Record<ConsoleRole, string> = {
  "platform-owner": "Platform Owner",
  "super-admin": "Super Admin",
  auditor: "Auditor (read-only)",
};

export type Capability =
  /** Read governance collections (cases, organizers, arenas, events, risk, refunds, reviews, commercials, policies, customers). */
  | "governance.read"
  /** Every requireAdmin() callable: decideCase, setMarketplaceEntityStatus, reissueOrganizerCode, decideRefund, buildSettlement, decideSettlement, adminCancelEvent, moderateReview, propose/decideCommercialAgreement. */
  | "governance.decide"
  | "settlements.read"
  | "audit.read"
  /** List operator accounts (users collection). */
  | "access.read"
  /** setOperatorAccess. */
  | "access.manage"
  /** The archived company-operated prototype (never in firebase-live). */
  | "archived.view";

const MATRIX: Record<ConsoleRole, readonly Capability[]> = {
  "platform-owner": ["governance.read", "governance.decide", "settlements.read", "audit.read", "access.read", "access.manage", "archived.view"],
  "super-admin": ["governance.read", "governance.decide", "settlements.read", "audit.read", "access.read", "archived.view"],
  auditor: ["settlements.read", "audit.read"],
};

export function toConsoleRole(raw: unknown): ConsoleRole | null {
  return typeof raw === "string" && (CONSOLE_ROLES as readonly string[]).includes(raw) ? (raw as ConsoleRole) : null;
}

export function can(role: ConsoleRole | null | undefined, capability: Capability): boolean {
  return !!role && MATRIX[role].includes(capability);
}

export function capabilitiesOf(role: ConsoleRole | null | undefined): readonly Capability[] {
  return role ? MATRIX[role] : [];
}

/** Server callable → the capability it requires (documentation + parity tests). */
export const CALLABLE_CAPABILITY = {
  decideCase: "governance.decide",
  setMarketplaceEntityStatus: "governance.decide",
  reissueOrganizerCode: "governance.decide",
  decideRefund: "governance.decide",
  buildSettlement: "governance.decide",
  decideSettlement: "governance.decide",
  adminCancelEvent: "governance.decide",
  moderateReview: "governance.decide",
  proposeCommercialAgreement: "governance.decide",
  decideCommercialAgreement: "governance.decide",
  setOperatorAccess: "access.manage",
} as const satisfies Record<string, Capability>;

export type ConsoleCallable = keyof typeof CALLABLE_CAPABILITY;

export function rolesAllowedFor(callable: ConsoleCallable): ConsoleRole[] {
  return CONSOLE_ROLES.filter((role) => can(role, CALLABLE_CAPABILITY[callable]));
}

/** Governance route → capability needed to open it. Sub-routes inherit. */
export const ROUTE_CAPABILITY: Record<string, Capability> = {
  "/": "governance.read",
  "/approvals": "governance.read",
  "/partners": "governance.read",
  "/arenas": "governance.read",
  "/events": "governance.read",
  "/customers": "governance.read",
  "/risk": "governance.read",
  "/reviews": "governance.read",
  "/refunds": "governance.read",
  "/settlements": "settlements.read",
  "/commercials": "governance.read",
  "/policies": "governance.read",
  "/audit": "audit.read",
  "/operators": "access.read",
};

function normalize(pathname: string): string {
  const path = (pathname.split(/[?#]/)[0] ?? "/").replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

export function routeCapability(pathname: string): Capability | null {
  const path = normalize(pathname);
  if (path === "/") return ROUTE_CAPABILITY["/"]!;
  const match = Object.keys(ROUTE_CAPABILITY)
    .filter((route) => route !== "/" && (path === route || path.startsWith(`${route}/`)))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ROUTE_CAPABILITY[match]! : null;
}

/**
 * Whether the role may open the route. Archived prototype routes additionally
 * need NEXT_PUBLIC_SHOW_ARCHIVED_PROTOTYPE (checked by the layout); unknown
 * governance routes are refused (fail closed).
 */
export function canViewRoute(role: ConsoleRole | null | undefined, pathname: string): boolean {
  if (isArchivedRoute(pathname)) return can(role, "archived.view");
  if (!isGovernanceRoute(pathname)) return false;
  const capability = routeCapability(pathname);
  return capability ? can(role, capability) : false;
}

/** Where a role lands after sign-in (or when it opens a route it can't see). */
export function landingRoute(role: ConsoleRole | null | undefined): string {
  if (can(role, "governance.read")) return "/";
  if (can(role, "audit.read")) return "/audit";
  return "/login";
}

/* ------------------------------------------------------------- session */

export type SessionGate =
  | { state: "ready"; role: ConsoleRole }
  /** Signed in, email not verified: offer "send verification email". */
  | { state: "unverified"; role: ConsoleRole | null }
  /** Claims say the account is disabled/suspended. */
  | { state: "disabled"; role: ConsoleRole | null }
  /** Verified, active, but no console role claim at all. */
  | { state: "no-role"; role: null }
  /** Verified, active, with a role claim the console does not support (e.g. a PULSE customer). */
  | { state: "unsupported-role"; role: null; rawRole: string };

/**
 * Decides what a signed-in user sees. Mirrors requireActor()/requireAdmin():
 * the server refuses unverified or disabled accounts before looking at roles,
 * so those states take precedence.
 */
export function gateSession(input: { emailVerified: boolean; claims: Record<string, unknown> }): SessionGate {
  const rawRole = String(input.claims.roleId ?? input.claims.role ?? "").trim();
  const role = toConsoleRole(rawRole);
  if (input.claims.disabled === true) return { state: "disabled", role };
  if (!input.emailVerified) return { state: "unverified", role };
  if (role) return { state: "ready", role };
  if (!rawRole) return { state: "no-role", role: null };
  return { state: "unsupported-role", role: null, rawRole };
}

/** Client-side throttle for "send verification email" (Firebase also rate-limits server-side). */
export const VERIFICATION_EMAIL_COOLDOWN_MS = 60_000;

export function verificationCooldownRemaining(lastSentAt: number | null, now: number, cooldownMs = VERIFICATION_EMAIL_COOLDOWN_MS): number {
  if (lastSentAt === null) return 0;
  return Math.max(0, lastSentAt + cooldownMs - now);
}
