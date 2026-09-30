import { describe, expect, it } from "vitest";
import { archivedPrototypeEnabled, isArchivedRoute, isGovernanceRoute } from "@/lib/console/archived";
import { NAV, canAccess } from "@/lib/nav";

describe("archived route detection", () => {
  it("treats every NAV route (and sub-routes) as governance", () => {
    for (const item of NAV) {
      expect(isGovernanceRoute(item.href)).toBe(true);
      expect(isArchivedRoute(item.href)).toBe(false);
    }
    expect(isArchivedRoute("/approvals/anything")).toBe(false);
    expect(isArchivedRoute("/reviews/")).toBe(false);
  });
  it("archives the company-operated prototype routes", () => {
    for (const path of ["/missions", "/missions/m1/check-in", "/bookings/b1", "/staffing/todays-work", "/franchises", "/money/refunds", "/catalog/experiences/x", "/safety", "/tournaments/new", "/access"]) {
      expect(isArchivedRoute(path)).toBe(true);
    }
  });
  it("does not treat prefixes of governance routes as governance", () => {
    expect(isArchivedRoute("/refundsx")).toBe(true);
    expect(isArchivedRoute("/eventsarchive")).toBe(true);
  });
  it("never archives the auth routes", () => {
    expect(isArchivedRoute("/login")).toBe(false);
  });
  it("ignores query strings and hashes", () => {
    expect(isArchivedRoute("/?tab=1")).toBe(false);
    expect(isArchivedRoute("/missions?x=1")).toBe(true);
  });
  it("enables archived pages only for the exact string 'true'", () => {
    expect(archivedPrototypeEnabled("true")).toBe(true);
    expect(archivedPrototypeEnabled("TRUE")).toBe(false);
    expect(archivedPrototypeEnabled("1")).toBe(false);
    expect(archivedPrototypeEnabled(undefined)).toBe(false);
  });
  it("canAccess refuses archived routes unless the flag is set", () => {
    expect(canAccess("/missions", "super-admin")).toBe(false);
    expect(canAccess("/refunds", "super-admin")).toBe(true);
    expect(canAccess("/reviews", "platform-owner")).toBe(true);
  });
});
