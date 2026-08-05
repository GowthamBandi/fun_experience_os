import type { RoleId } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  keyword: string;
  roles: RoleId[];
}

/**
 * Deterministic permission map — mirrors the franchise operating model.
 * The floor (Command) is open to every position.
 */
export const NAV: NavItem[] = [
  { href: "/", label: "Command", keyword: "command floor home overview", roles: ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager", "venue-manager", "coordinator", "staff", "support", "safety", "finance", "marketing", "analyst"] },
  { href: "/missions", label: "Missions", keyword: "missions sessions events scheduling", roles: ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager", "venue-manager", "coordinator", "staff", "safety", "analyst"] },
  { href: "/bookings", label: "Bookings", keyword: "bookings reservations check-in", roles: ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager", "venue-manager", "coordinator", "support", "finance"] },
  { href: "/people", label: "People", keyword: "people participants safety incidents", roles: ["platform-owner", "super-admin", "regional-partner", "safety", "support", "finance"] },
  { href: "/money", label: "Money", keyword: "money payments refunds revenue finance", roles: ["platform-owner", "super-admin", "regional-partner", "city-manager", "finance"] },
  { href: "/tournaments", label: "Tournaments", keyword: "tournaments brackets knockout", roles: ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager", "coordinator"] },
  { href: "/locations", label: "Locations", keyword: "locations venues arenas cities", roles: ["platform-owner", "super-admin", "regional-partner", "city-manager", "venue-manager"] },
  { href: "/catalog", label: "Catalog", keyword: "catalog activities formats pricing", roles: ["platform-owner", "super-admin", "regional-partner", "city-manager", "marketing"] },
  { href: "/staffing", label: "Staffing", keyword: "staffing crew assignments", roles: ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager", "venue-manager"] },
  { href: "/notifications", label: "Notifications", keyword: "notifications alerts signals", roles: ["platform-owner", "super-admin", "regional-partner", "city-manager", "ops-manager", "marketing", "support"] },
  { href: "/analytics", label: "Analytics", keyword: "analytics reports insight data", roles: ["platform-owner", "super-admin", "regional-partner", "city-manager", "finance", "analyst"] },
  { href: "/access", label: "Access", keyword: "access roles permissions audit", roles: ["platform-owner", "super-admin"] },
];

export const navFor = (role: RoleId): NavItem[] => NAV.filter((n) => n.roles.includes(role));

export const canAccess = (href: string, role: RoleId): boolean =>
  NAV.find((n) => n.href === href)?.roles.includes(role) ?? false;
