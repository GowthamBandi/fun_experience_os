"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  BadgeIndianRupee,
  BarChart3,
  Bell,
  Building,
  CalendarClock,
  ChevronLeft,
  CircleGauge,
  ClipboardCheck,
  Database,
  FileClock,
  HandCoins,
  KeyRound,
  Layers,
  ReceiptIndianRupee,
  Scale,
  SearchCheck,
  ShieldAlert,
  ShieldCheck,
  Swords,
  Ticket,
  Tickets,
  TriangleAlert,
  UserCog,
  Users,
  Wallet,
  Wrench,
  X,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { NAV_GROUPS, moduleFor, navFor } from "@/lib/nav";
import { cn } from "@/lib/format";
import { useIsMobile } from "@/lib/hooks";
import { TerritorySwitcher } from "@/components/shell/TerritorySwitcher";
import { Avatar } from "@/components/ui/primitives";

export const NAV_ICONS: Record<string, typeof CircleGauge> = {
  "/": CircleGauge,
  "/approvals": ClipboardCheck,
  "/partners": Users,
  "/arenas": Building,
  "/events": Tickets,
  "/customers": SearchCheck,
  "/setup": Wrench,
  "/catalog": Layers,
  "/missions": CalendarClock,
  "/bookings": Ticket,
  "/tournaments": Swords,
  "/staffing": UserCog,
  "/people": Users,
  "/risk": TriangleAlert,
  "/safety": ShieldAlert,
  "/money": Wallet,
  "/refunds": ReceiptIndianRupee,
  "/settlements": HandCoins,
  "/commercials": BadgeIndianRupee,
  "/analytics": BarChart3,
  "/notifications": Bell,
  "/policies": Scale,
  "/audit": FileClock,
  "/access": KeyRound,
  "/settings": Database,
};

const LIGHT = [0.19, 1, 0.22, 1] as const;

function NavBody({ collapsed, onNavigate }: { collapsed: boolean; onNavigate?: () => void }) {
  const { role, operator, state } = useStore();
  const pathname = usePathname();
  const items = navFor(role.id);
  const activeModule = moduleFor(pathname);
  const openCases = state.governance.filter((d) => d.collection === "governanceCases" && ["pending", "under-review", "information-requested"].includes(String(d.data.status))).length;
  const unread = state.signals.filter((s) => !s.read).length;
  const badge: Record<string, number> = { "/approvals": openCases, "/notifications": unread };

  return (
    <>
      <div className={cn("flex h-16 shrink-0 items-center gap-3 px-4", collapsed && "justify-center px-0")}>
        <span className="mark h-9 w-9 shrink-0" aria-hidden />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-bold tracking-tight text-ink-lum">Experience OS</p>
            <p className="truncate text-[11px] font-medium text-ink-mut">Super Admin console</p>
          </div>
        )}
      </div>

      <div className={cn("px-3 pb-2", collapsed && "px-2")}>
        <TerritorySwitcher collapsed={collapsed} />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-4" aria-label="Modules">
        {NAV_GROUPS.map((group) => {
          const groupItems = items.filter((i) => i.group === group);
          if (groupItems.length === 0) return null;
          return (
            <div key={group} className="mt-3 first:mt-1">
              {!collapsed && group !== "Command" && <p className="px-3 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-mut/80">{group}</p>}
              {collapsed && group !== "Command" && <div className="mx-3 my-2 h-px bg-edge" />}
              <div className="space-y-0.5">
                {groupItems.map((item) => {
                  const Icon = NAV_ICONS[item.href] ?? ShieldCheck;
                  const active = activeModule?.href === item.href;
                  const count = badge[item.href] ?? 0;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-9 items-center gap-3 rounded-xl px-3 text-[13.5px] font-medium transition-colors duration-150",
                        "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/20",
                        collapsed && "justify-center px-0",
                        active ? "text-brand-ink" : "text-ink-sec hover:bg-slate-100/80 hover:text-ink-lum",
                      )}
                    >
                      {active && (
                        <motion.span
                          layoutId="nav-pill"
                          className="absolute inset-0 rounded-xl bg-brand-subtle ring-1 ring-inset ring-[#dcd7ff]"
                          transition={{ duration: 0.32, ease: LIGHT }}
                        />
                      )}
                      {active && !collapsed && <span className="absolute -left-3 top-2 h-5 w-1 rounded-r-full bg-brand" />}
                      <Icon className={cn("relative h-[18px] w-[18px] shrink-0", active ? "text-brand" : "text-ink-mut group-hover:text-ink-sec")} />
                      {!collapsed && <span className="relative flex-1 truncate">{item.label}</span>}
                      {count > 0 && (
                        <span
                          className={cn(
                            "relative flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular",
                            active ? "bg-brand text-white" : "bg-pink-100 text-pink-700",
                            collapsed && "absolute right-1 top-0.5 h-4 min-w-4 px-1",
                          )}
                        >
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {operator && (
        <div className={cn("shrink-0 border-t border-edge p-3", collapsed && "px-2")}>
          <div className={cn("flex items-center gap-2.5 rounded-xl bg-bg-sunken p-2", collapsed && "justify-center bg-transparent p-0")}>
            <Avatar initials={operator.initials} size="sm" />
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-ink-lum">{operator.name}</p>
                <p className="truncate text-[11px] text-ink-mut">{role.name}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export function Sidebar({ mobileOpen, onMobileClose }: { mobileOpen: boolean; onMobileClose: () => void }) {
  const { sidebarCollapsed, toggleSidebar } = useStore();
  const isMobile = useIsMobile(1024);

  if (isMobile) {
    return (
      <AnimatePresence>
        {mobileOpen && (
          <motion.div className="fixed inset-0 z-50 lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onMobileClose} aria-label="Close navigation" />
            <motion.aside
              initial={{ x: -300 }}
              animate={{ x: 0 }}
              exit={{ x: -300 }}
              transition={{ duration: 0.3, ease: LIGHT }}
              className="relative flex h-full w-[280px] flex-col border-r border-edge bg-white shadow-glass"
              aria-label="Primary"
            >
              <button onClick={onMobileClose} className="absolute right-3 top-4 rounded-lg p-1.5 text-ink-mut hover:bg-slate-100" aria-label="Close navigation">
                <X className="h-5 w-5" />
              </button>
              <NavBody collapsed={false} onNavigate={onMobileClose} />
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 72 : 256 }}
      transition={{ duration: 0.32, ease: LIGHT }}
      className="relative z-30 hidden h-full shrink-0 flex-col border-r border-edge bg-white/90 backdrop-blur lg:flex"
      aria-label="Primary"
    >
      <NavBody collapsed={sidebarCollapsed} />
      <button
        onClick={toggleSidebar}
        className="absolute -right-3 top-[76px] flex h-6 w-6 items-center justify-center rounded-full border border-edge bg-white text-ink-mut shadow-lift transition-colors hover:text-brand"
        aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
      >
        <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform duration-300", sidebarCollapsed && "rotate-180")} />
      </button>
    </motion.aside>
  );
}
