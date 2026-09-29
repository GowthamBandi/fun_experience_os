import type { RoleId } from "@/lib/types";

export interface NavItem {
  href: string;
  label: string;
  keyword: string;
  group?: "Marketplace" | "Trust" | "Finance" | "Control";
  roles: RoleId[];
}

const owners: RoleId[] = ["platform-owner", "super-admin"];
const marketplace: RoleId[] = [...owners, "regional-partner", "city-manager", "ops-manager", "analyst"];

/** Organizers run events. This console verifies, governs and controls risk. */
export const NAV: NavItem[] = [
  { href: "/", label: "Overview", keyword: "governance overview decisions exposure", group: "Marketplace", roles: marketplace },
  { href: "/approvals", label: "Approvals", keyword: "applications kyc review approve reject", group: "Marketplace", roles: marketplace },
  { href: "/partners", label: "Organizers", keyword: "organizers partners event managers verification", group: "Marketplace", roles: marketplace },
  { href: "/arenas", label: "Arenas", keyword: "arenas venues verification blocked paused", group: "Marketplace", roles: marketplace },
  { href: "/events", label: "Events", keyword: "events proposals policy pricing approval", group: "Marketplace", roles: marketplace },
  { href: "/customers", label: "Customers", keyword: "customers funnel complaints booking health", group: "Trust", roles: [...owners, "support", "safety", "analyst"] },
  { href: "/risk", label: "Risk", keyword: "fraud disputes chargebacks alerts holds", group: "Trust", roles: [...owners, "safety", "finance", "support", "analyst"] },
  { href: "/refunds", label: "Refunds", keyword: "refunds cancellations exceptions approvals", group: "Finance", roles: [...owners, "finance", "support"] },
  { href: "/settlements", label: "Settlements", keyword: "settlements payouts releases holds reconciliation", group: "Finance", roles: [...owners, "finance", "analyst"] },
  { href: "/commercials", label: "Commercials", keyword: "commission terms percentages contracts negotiation", group: "Finance", roles: [...owners, "finance"] },
  { href: "/policies", label: "Policies", keyword: "rules policies standards governance", group: "Control", roles: owners },
  { href: "/audit", label: "Audit", keyword: "audit decisions history access evidence", group: "Control", roles: [...owners, "finance", "safety", "analyst"] },
];

export const navFor = (role: RoleId): NavItem[] => NAV.filter((n) => n.roles.includes(role));

export const canAccess = (href: string, role: RoleId): boolean => {
  const exact = NAV.find((n) => n.href === href);
  if (exact) return exact.roles.includes(role);
  const section = NAV.find((n) => n.href.length > 1 && (href === n.href || href.startsWith(n.href + "/")));
  return section?.roles.includes(role) ?? false;
};
