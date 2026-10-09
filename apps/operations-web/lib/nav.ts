import {
  Activity,
  BadgeCheck,
  CalendarDays,
  FileText,
  Handshake,
  Landmark,
  LayoutDashboard,
  Lock,
  KeyRound,
  Radio,
  ScrollText,
  ShieldAlert,
  Star,
  Store,
  TrendingUp,
  Undo2,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { canViewRoute, type ConsoleRole } from "@/lib/console/capabilities";

export type NavGroup = "Overview" | "Marketplace" | "Trust" | "Money" | "Control";

export interface NavItem {
  href: string;
  label: string;
  group: NavGroup;
  icon: LucideIcon;
  keywords: string;
  badge?: "approvals" | "risk" | "refunds" | "live";
}

/** One item per CONSOLE_ROUTES entry, in sidebar order. */
export const NAV: NavItem[] = [
  { href: "/", label: "Command Center", group: "Overview", icon: LayoutDashboard, keywords: "command center overview attention queue decisions" },
  { href: "/live", label: "Live", group: "Overview", icon: Radio, keywords: "live now events running starting soon", badge: "live" },
  { href: "/approvals", label: "Approvals", group: "Marketplace", icon: BadgeCheck, keywords: "applications kyc review approve reject", badge: "approvals" },
  { href: "/partners", label: "Organizers", group: "Marketplace", icon: Store, keywords: "organizers partners event managers verification" },
  { href: "/events", label: "Experiences & Events", group: "Marketplace", icon: CalendarDays, keywords: "events experiences proposals policy pricing approval" },
  { href: "/arenas", label: "Arenas", group: "Marketplace", icon: Landmark, keywords: "arenas venues verification blocked paused" },
  { href: "/customers", label: "Customers", group: "Trust", icon: Users, keywords: "customers funnel complaints booking health phone" },
  { href: "/risk", label: "Risk", group: "Trust", icon: ShieldAlert, keywords: "fraud disputes chargebacks alerts holds", badge: "risk" },
  { href: "/reviews", label: "Reviews", group: "Trust", icon: Star, keywords: "reviews ratings moderation hide publish" },
  { href: "/revenue", label: "Revenue", group: "Money", icon: TrendingUp, keywords: "revenue gross bookings commission earnings" },
  { href: "/refunds", label: "Refunds", group: "Money", icon: Undo2, keywords: "refunds cancellations exceptions approvals", badge: "refunds" },
  { href: "/settlements", label: "Settlements", group: "Money", icon: Wallet, keywords: "settlements payouts releases holds reconciliation" },
  { href: "/commercials", label: "Commercials", group: "Money", icon: Handshake, keywords: "commission terms percentages contracts negotiation" },
  { href: "/audit", label: "Audit", group: "Control", icon: ScrollText, keywords: "audit decisions history access evidence" },
  { href: "/policies", label: "Policies", group: "Control", icon: FileText, keywords: "rules policies standards governance" },
  { href: "/legal-holds", label: "Legal holds", group: "Control", icon: Lock, keywords: "legal hold retention deletion compliance dpdp evidence" },
  { href: "/system", label: "System health", group: "Control", icon: Activity, keywords: "jobs scheduler health retention sweeper reminders failures" },
  { href: "/operators", label: "Operator access", group: "Control", icon: KeyRound, keywords: "operators access roles super admin auditor suspend disable" },
];

/** Navigation for a signed-in console role. */
export const consoleNav = (role: ConsoleRole | null | undefined): NavItem[] => NAV.filter((n) => canViewRoute(role, n.href));
