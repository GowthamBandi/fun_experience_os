import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  CALLABLE_CAPABILITY,
  CONSOLE_ROLES,
  ROUTE_CAPABILITY,
  can,
  canViewRoute,
  gateSession,
  landingRoute,
  rolesAllowedFor,
  toConsoleRole,
  verificationCooldownRemaining,
  VERIFICATION_EMAIL_COOLDOWN_MS,
  type ConsoleCallable,
} from "@/lib/console/capabilities";
import { GOVERNANCE_ROUTES } from "@/lib/console/archived";
import { NAV, consoleNav } from "@/lib/nav";

const REPO = path.resolve(__dirname, "../../../..");
const backend = (rel: string) => path.join(REPO, rel);
const read = (rel: string) => readFileSync(backend(rel), "utf8");
const haveBackend = existsSync(backend("firebase/functions/src/platform/auth.ts"));

describe("role → capability matrix", () => {
  it("platform owners can do everything, including operator access", () => {
    for (const capability of ["governance.read", "governance.decide", "settlements.read", "audit.read", "access.read", "access.manage"] as const) {
      expect(can("platform-owner", capability)).toBe(true);
    }
  });
  it("super admins govern but cannot manage operator access", () => {
    expect(can("super-admin", "governance.decide")).toBe(true);
    expect(can("super-admin", "access.read")).toBe(true);
    expect(can("super-admin", "access.manage")).toBe(false);
  });
  it("auditors are read-only: audit trail and settlements, no actions", () => {
    expect(can("auditor", "audit.read")).toBe(true);
    expect(can("auditor", "settlements.read")).toBe(true);
    for (const capability of ["governance.read", "governance.decide", "access.read", "access.manage", "archived.view"] as const) {
      expect(can("auditor", capability)).toBe(false);
    }
  });
  it("no role (or an unknown role) can do nothing", () => {
    expect(can(null, "audit.read")).toBe(false);
    expect(toConsoleRole("customer")).toBeNull();
    expect(toConsoleRole("organizer-owner")).toBeNull();
    expect(toConsoleRole(undefined)).toBeNull();
    expect(toConsoleRole("auditor")).toBe("auditor");
  });
});

describe("callable parity with the backend", () => {
  it("every requireAdmin callable is allowed for exactly platform-owner and super-admin", () => {
    for (const callable of Object.keys(CALLABLE_CAPABILITY) as ConsoleCallable[]) {
      if (callable === "setOperatorAccess") continue;
      expect(rolesAllowedFor(callable)).toEqual(["platform-owner", "super-admin"]);
    }
  });
  it("setOperatorAccess is platform-owner only", () => {
    expect(rolesAllowedFor("setOperatorAccess")).toEqual(["platform-owner"]);
  });

  it.skipIf(!haveBackend)("ADMIN_ROLES in platform/auth.ts matches the console's decide roles", () => {
    const source = read("firebase/functions/src/platform/auth.ts");
    const match = source.match(/ADMIN_ROLES\s*=\s*\[([^\]]*)\]/);
    expect(match).not.toBeNull();
    const roles = [...match![1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    expect(roles.sort()).toEqual(rolesAllowedFor("decideCase").sort());
  });

  it.skipIf(!haveBackend)("every console callable that the backend guards with requireAdmin is mapped to governance.decide", () => {
    const files = [
      "firebase/functions/src/governance/callables.ts",
      "firebase/functions/src/commerce/functions.ts",
      "firebase/functions/src/catalog/events.ts",
      "firebase/functions/src/catalog/reviews.ts",
    ].map(read).join("\n");
    const guarded = ["decideCase", "setMarketplaceEntityStatus", "reissueOrganizerCode", "decideRefund", "buildSettlement", "decideSettlement", "proposeCommercialAgreement", "decideCommercialAgreement"];
    for (const name of guarded) {
      expect(files).toMatch(new RegExp(`export const ${name}\\b`));
      expect(CALLABLE_CAPABILITY[name as ConsoleCallable]).toBe("governance.decide");
    }
    expect(files).toContain('requireAdmin(context, "cancel events")');
    expect(files).toContain('requireAdmin(context, "moderate reviews")');
  });

  it.skipIf(!haveBackend)("setOperatorAccess requires platform-owner and accepts exactly the console roles", () => {
    const source = read("firebase/functions/src/auth/operatorAccess.ts");
    expect(source).toMatch(/actor\.roleId !== "platform-owner"/);
    const roles = [...(source.match(/const ROLES\s*=\s*\[([^\]]*)\]/)![1]!.matchAll(/"([^"]+)"/g))].map((m) => m[1]);
    expect(roles.sort()).toEqual([...CONSOLE_ROLES].sort());
  });

  it.skipIf(!existsSync(backend("firebase/firestore/firestore.rules")))("Firestore rules let auditors read what the auditor screens show, and nothing the console hides from them", () => {
    const rules = read("firebase/firestore/firestore.rules");
    expect(rules).toMatch(/function isAdmin\(\)[^\n]*\['platform-owner', 'super-admin'\]/);
    expect(rules).toMatch(/function isAuditor\(\)[^\n]*'auditor'/);
    const auditorCollections = [...rules.matchAll(/match \/(\w+)\/\{[^}]+\}\s*\{[^}]*isAuditor\(\)/g)].map((m) => m[1]);
    // Screens an auditor can open (/audit, /settlements) read exactly these collections.
    expect(auditorCollections).toEqual(expect.arrayContaining(["auditEvents", "settlements"]));
    // Governance collections stay admin-only, matching can("auditor", "governance.read") === false.
    for (const adminOnly of ["governanceCases", "organizers", "refunds", "reviews", "users", "events"]) {
      expect(auditorCollections).not.toContain(adminOnly);
    }
  });
});

describe("route guard", () => {
  it("every governance route has a capability", () => {
    for (const route of GOVERNANCE_ROUTES) expect(ROUTE_CAPABILITY[route]).toBeDefined();
    expect(Object.keys(ROUTE_CAPABILITY).sort()).toEqual([...GOVERNANCE_ROUTES].sort());
  });
  it("admins see every governance route; auditors only audit, settlements and compliance/health views", () => {
    for (const item of NAV) {
      expect(canViewRoute("platform-owner", item.href)).toBe(true);
      expect(canViewRoute("super-admin", item.href)).toBe(true);
    }
    expect(consoleNav("auditor").map((item) => item.href)).toEqual(["/settlements", "/audit", "/legal-holds", "/system"]);
    expect(canViewRoute("auditor", "/")).toBe(false);
    expect(canViewRoute("auditor", "/refunds")).toBe(false);
    expect(canViewRoute("auditor", "/operators")).toBe(false);
    expect(canViewRoute("auditor", "/audit?x=1")).toBe(true);
  });
  it("auditors and unknown roles never reach the archived prototype", () => {
    expect(canViewRoute("auditor", "/missions")).toBe(false);
    expect(canViewRoute(null, "/missions")).toBe(false);
    expect(canViewRoute(null, "/")).toBe(false);
  });
  it("lands each role on a page it can open", () => {
    expect(landingRoute("platform-owner")).toBe("/");
    expect(landingRoute("super-admin")).toBe("/");
    expect(landingRoute("auditor")).toBe("/audit");
    expect(landingRoute(null)).toBe("/login");
    for (const role of CONSOLE_ROLES) expect(canViewRoute(role, landingRoute(role))).toBe(true);
  });
});

describe("session gate", () => {
  const verified = (claims: Record<string, unknown>) => gateSession({ emailVerified: true, claims });
  it("ready for the three console roles when verified and active", () => {
    for (const role of CONSOLE_ROLES) expect(verified({ roleId: role })).toEqual({ state: "ready", role });
  });
  it("accepts the legacy `role` claim like the server", () => {
    expect(verified({ role: "super-admin" })).toEqual({ state: "ready", role: "super-admin" });
  });
  it("unverified email takes precedence over role checks (server refuses first)", () => {
    expect(gateSession({ emailVerified: false, claims: { roleId: "super-admin" } })).toEqual({ state: "unverified", role: "super-admin" });
    expect(gateSession({ emailVerified: false, claims: {} })).toEqual({ state: "unverified", role: null });
  });
  it("disabled accounts are disabled even when unverified", () => {
    expect(gateSession({ emailVerified: false, claims: { roleId: "platform-owner", disabled: true } }).state).toBe("disabled");
    expect(verified({ roleId: "super-admin", disabled: true }).state).toBe("disabled");
  });
  it("verified with no role claim → no-role (ask a platform owner)", () => {
    expect(verified({})).toEqual({ state: "no-role", role: null });
    expect(verified({ roleId: "  " })).toEqual({ state: "no-role", role: null });
  });
  it("verified with an unsupported role → unsupported-role", () => {
    expect(verified({ roleId: "customer" })).toEqual({ state: "unsupported-role", role: null, rawRole: "customer" });
  });
});

describe("verification email cooldown", () => {
  it("allows the first send and throttles repeats", () => {
    expect(verificationCooldownRemaining(null, 1_000)).toBe(0);
    expect(verificationCooldownRemaining(1_000, 1_000)).toBe(VERIFICATION_EMAIL_COOLDOWN_MS);
    expect(verificationCooldownRemaining(1_000, 1_000 + VERIFICATION_EMAIL_COOLDOWN_MS)).toBe(0);
  });
});

describe("compliance and system routes", () => {
  it("legal holds and system health are readable by admins and auditors; only admins place holds", async () => {
    const { canViewRoute, rolesAllowedFor } = await import("@/lib/console/capabilities");
    for (const route of ["/legal-holds", "/system"]) {
      expect(canViewRoute("platform-owner", route)).toBe(true);
      expect(canViewRoute("super-admin", route)).toBe(true);
      expect(canViewRoute("auditor", route)).toBe(true);
      expect(canViewRoute(null, route)).toBe(false);
    }
    expect(rolesAllowedFor("setLegalHold")).toEqual(["platform-owner", "super-admin"]);
  });
});
