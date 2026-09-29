import type { RoleId } from "@/lib/types";

export type NavGroup = "Command" | "Marketplace" | "Operations" | "Trust & Safety" | "Finance" | "Control";

export interface NavItem {
  href: string;
  label: string;
  keyword: string;
  group: NavGroup;
  roles: RoleId[];
  /** Sub-routes owned by this module that are not listed in the sidebar. */
  owns?: string[];
}

export const ALL_ROLES: RoleId[] = [
  "platform-owner",
  "super-admin",
  "regional-partner",
  "city-manager",
  "ops-manager",
  "venue-manager",
  "coordinator",
  "staff",
  "support",
  "safety",
  "finance",
  "marketing",
  "analyst",
];

const owners: RoleId[] = ["platform-owner", "super-admin"];
const marketplace: RoleId[] = [...owners, "regional-partner", "city-manager", "ops-manager", "analyst"];
const setup: RoleId[] = [...owners, "regional-partner", "city-manager", "ops-manager", "venue-manager"];
const floor: RoleId[] = [...owners, "regional-partner", "city-manager", "ops-manager", "venue-manager", "coordinator", "staff", "safety", "support"];

/**
 * The single route → role policy for the console.
 * The sidebar, command palette, page guards and the Access matrix all read this table.
 */
export const NAV: NavItem[] = [
  { href: "/", label: "Overview", keyword: "home dashboard overview command center decisions", group: "Command", roles: ALL_ROLES },

  { href: "/approvals", label: "Approvals", keyword: "applications kyc review approve reject queue", group: "Marketplace", roles: marketplace },
  { href: "/partners", label: "Organizers", keyword: "organizers partners event managers verification", group: "Marketplace", roles: marketplace },
  { href: "/arenas", label: "Arenas", keyword: "arenas venues verification blocked paused", group: "Marketplace", roles: marketplace },
  { href: "/events", label: "Events", keyword: "events proposals policy pricing approval", group: "Marketplace", roles: marketplace },
  { href: "/customers", label: "Customers", keyword: "customers cohorts complaints booking health", group: "Marketplace", roles: [...owners, "support", "safety", "analyst"] },

  { href: "/setup", label: "Setup", keyword: "setup franchises territories cities venues playing areas locations", group: "Operations", roles: setup, owns: ["/franchises", "/territories", "/cities", "/locations"] },
  { href: "/catalog", label: "Catalog", keyword: "catalog categories experiences templates pricing", group: "Operations", roles: [...owners, "city-manager", "ops-manager", "marketing", "analyst"] },
  { href: "/missions", label: "Sessions", keyword: "sessions missions schedule live check-in teams reveal results", group: "Operations", roles: floor, owns: ["/identity-patterns"] },
  { href: "/bookings", label: "Bookings", keyword: "bookings reservations waitlist seats", group: "Operations", roles: [...owners, "city-manager", "ops-manager", "coordinator", "support", "finance"] },
  { href: "/tournaments", label: "Tournaments", keyword: "tournaments brackets matches knockout", group: "Operations", roles: [...owners, "city-manager", "ops-manager", "coordinator", "staff"] },
  { href: "/staffing", label: "Staffing", keyword: "staffing schedule shifts crew assign availability check-in", group: "Operations", roles: [...owners, "regional-partner", "city-manager", "ops-manager", "venue-manager", "coordinator"] },
  { href: "/people", label: "People", keyword: "people staff participants directory", group: "Operations", roles: [...owners, "regional-partner", "city-manager", "ops-manager", "venue-manager", "coordinator", "support", "safety"] },

  { href: "/risk", label: "Risk", keyword: "fraud disputes chargebacks alerts holds", group: "Trust & Safety", roles: [...owners, "safety", "finance", "support", "analyst"] },
  { href: "/safety", label: "Safety & Disputes", keyword: "safety incidents disputes moderation bans", group: "Trust & Safety", roles: [...owners, "city-manager", "ops-manager", "coordinator", "safety", "support"] },

  { href: "/money", label: "Money", keyword: "money payments refunds reconciliation transactions", group: "Finance", roles: [...owners, "regional-partner", "finance", "analyst"] },
  { href: "/refunds", label: "Refund cases", keyword: "refund cases cancellations exceptions approvals", group: "Finance", roles: [...owners, "finance", "support"] },
  { href: "/settlements", label: "Settlements", keyword: "settlements payouts releases holds", group: "Finance", roles: [...owners, "finance", "analyst"] },
  { href: "/commercials", label: "Commercials", keyword: "commission terms percentages contracts", group: "Finance", roles: [...owners, "finance"] },

  { href: "/analytics", label: "Analytics", keyword: "analytics revenue fill trends reports", group: "Control", roles: [...owners, "regional-partner", "city-manager", "finance", "marketing", "analyst"] },
  { href: "/notifications", label: "Notifications", keyword: "notifications signals alerts inbox", group: "Control", roles: ALL_ROLES },
  { href: "/policies", label: "Policies", keyword: "rules policies standards governance", group: "Control", roles: owners },
  { href: "/audit", label: "Audit & records", keyword: "audit records activity history evidence export", group: "Control", roles: [...owners, "finance", "safety", "analyst"] },
  { href: "/access", label: "Access", keyword: "access roles permissions operators", group: "Control", roles: owners },
  { href: "/settings", label: "Workspace", keyword: "settings workspace backup export import reset data", group: "Control", roles: owners },
];

export const NAV_GROUPS: NavGroup[] = ["Command", "Marketplace", "Operations", "Trust & Safety", "Finance", "Control"];

export const navFor = (role: RoleId): NavItem[] => NAV.filter((n) => n.roles.includes(role));

const matches = (href: string, prefix: string) => href === prefix || href.startsWith(prefix + "/");

/** Resolve the module that owns a path. Longest matching prefix wins. */
export function moduleFor(href: string): NavItem | undefined {
  const path = href.split("?")[0].replace(/\/+$/, "") || "/";
  if (path === "/") return NAV[0];
  let best: { item: NavItem; len: number } | undefined;
  for (const item of NAV) {
    const prefixes = [item.href, ...(item.owns ?? [])].filter((p) => p !== "/");
    for (const p of prefixes) {
      if (matches(path, p) && (!best || p.length > best.len)) best = { item, len: p.length };
    }
  }
  return best?.item;
}

export const canAccess = (href: string, role: RoleId): boolean => {
  const item = moduleFor(href);
  return item ? item.roles.includes(role) : false;
};
