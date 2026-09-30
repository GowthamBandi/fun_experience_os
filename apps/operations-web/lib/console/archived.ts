/**
 * Archived operations prototype (ADR-0006).
 *
 * The console's production surface is the governance routes listed in
 * GOVERNANCE_ROUTES (the same hrefs as lib/nav.ts NAV). Every other route under
 * app/(console) belongs to the obsolete company-operated prototype: it renders
 * an archived notice unless NEXT_PUBLIC_SHOW_ARCHIVED_PROTOTYPE=true, and even
 * then it is never connected to production data (localStorage only).
 */

export const GOVERNANCE_ROUTES = [
  "/",
  "/approvals",
  "/partners",
  "/arenas",
  "/events",
  "/customers",
  "/risk",
  "/reviews",
  "/refunds",
  "/settlements",
  "/commercials",
  "/policies",
  "/legal-holds",
  "/system",
  "/audit",
  "/operators",
] as const;

function normalize(pathname: string): string {
  const path = (pathname.split(/[?#]/)[0] ?? "/").replace(/\/+$/, "");
  return path === "" ? "/" : path;
}

/** True when the path is a governance route (or a sub-route of one). "/" matches only itself. */
export function isGovernanceRoute(pathname: string): boolean {
  const path = normalize(pathname);
  return GOVERNANCE_ROUTES.some((route) => (route === "/" ? path === "/" : path === route || path.startsWith(`${route}/`)));
}

/** True for routes that belong to the archived company-operated prototype. */
export function isArchivedRoute(pathname: string): boolean {
  const path = normalize(pathname);
  if (path === "/login" || path.startsWith("/login/") || path === "/otp" || path === "/verifying") return false;
  return !isGovernanceRoute(path);
}

/**
 * Only the exact string "true" enables the archived pages (fail closed), and
 * never in a firebase-live build: production/staging operators must not be
 * able to reach the localStorage prototype even if the flag leaks into the
 * deployed environment (scripts/verify-production-env.mjs also refuses it).
 */
export function archivedPrototypeEnabled(
  flag: string | undefined = process.env.NEXT_PUBLIC_SHOW_ARCHIVED_PROTOTYPE,
  dataMode: string | undefined = process.env.NEXT_PUBLIC_DATA_MODE,
): boolean {
  return flag === "true" && dataMode !== "firebase-live";
}

export const ARCHIVED_BANNER =
  "Archived prototype (company-operated model, superseded by ADR-0003/0004) — not connected to production data.";
