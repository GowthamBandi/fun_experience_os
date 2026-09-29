import type { RoleId } from "@/lib/types";
import { NAV } from "@/lib/nav";

/**
 * Action-level permissions for Setup, Catalog and Staffing.
 *
 * Page access comes from lib/nav.ts (`canAccess`). This table narrows what a
 * role may DO once on the page. Every action is bound to the route whose page
 * exposes it, and its roles are always a subset of that route's roles, so an
 * action can never be granted to a role that cannot open the page.
 */
export type GeoAction =
  | "create-franchise"
  | "manage-franchise"
  | "create-territory"
  | "manage-territory"
  | "create-city"
  | "manage-city"
  | "create-venue"
  | "manage-venue"
  | "create-playing-area"
  | "manage-playing-area"
  | "manage-catalog"
  | "change-catalog-status"
  | "catalog-versions"
  | "catalog-preview"
  | "manage-staff"
  | "assign-staff"
  | "check-in-staff";

const owners: RoleId[] = ["platform-owner", "super-admin"];

export const GEO_ACTIONS: Record<GeoAction, { route: string; roles: RoleId[] }> = {
  // Franchise — only platform owners and super admins shape the platform
  "create-franchise": { route: "/franchises", roles: owners },
  "manage-franchise": { route: "/franchises", roles: owners },
  // Territory — regional partners shape the regions they are assigned to
  "create-territory": { route: "/territories", roles: [...owners, "regional-partner"] },
  "manage-territory": { route: "/territories", roles: [...owners, "regional-partner"] },
  // City — city managers run the cities they are assigned to
  "create-city": { route: "/cities", roles: [...owners, "regional-partner", "city-manager"] },
  "manage-city": { route: "/cities", roles: [...owners, "regional-partner", "city-manager"] },
  // Venue — city managers create venues; operations managers run them day to day
  "create-venue": { route: "/locations", roles: [...owners, "regional-partner", "city-manager"] },
  "manage-venue": { route: "/locations", roles: [...owners, "regional-partner", "city-manager", "ops-manager"] },
  // Playing area — venue managers own the floors of their venue
  "create-playing-area": { route: "/locations", roles: [...owners, "regional-partner", "city-manager", "ops-manager", "venue-manager"] },
  "manage-playing-area": { route: "/locations", roles: [...owners, "regional-partner", "city-manager", "ops-manager", "venue-manager"] },
  // Catalog — the platform shapes the catalog; city and operations managers can draft
  "manage-catalog": { route: "/catalog", roles: [...owners, "city-manager", "ops-manager"] },
  "change-catalog-status": { route: "/catalog", roles: owners },
  "catalog-versions": { route: "/catalog", roles: [...owners, "city-manager", "ops-manager", "analyst"] },
  "catalog-preview": { route: "/catalog", roles: [...owners, "city-manager", "ops-manager", "marketing", "analyst"] },
  // Staff — managers maintain the staff list; coordinators staff and check in their sessions
  "manage-staff": { route: "/people", roles: [...owners, "regional-partner", "city-manager", "ops-manager", "venue-manager"] },
  "assign-staff": { route: "/staffing", roles: [...owners, "regional-partner", "city-manager", "ops-manager", "venue-manager", "coordinator"] },
  "check-in-staff": { route: "/staffing", roles: [...owners, "regional-partner", "city-manager", "ops-manager", "venue-manager", "coordinator"] },
};

const routeRoles = (route: string): RoleId[] => {
  const item = NAV.find((n) => n.href === route || (n.owns ?? []).includes(route));
  return item?.roles ?? [];
};

/** True when the role may perform the action (and can open the page that exposes it). */
export const geoCan = (roleId: RoleId, action: GeoAction): boolean => {
  const def = GEO_ACTIONS[action];
  return def.roles.includes(roleId) && routeRoles(def.route).includes(roleId);
};

/** Human-readable list of the roles allowed an action, for "why can't I" hints. */
export const geoRolesFor = (action: GeoAction): RoleId[] => GEO_ACTIONS[action].roles.filter((r) => routeRoles(GEO_ACTIONS[action].route).includes(r));
