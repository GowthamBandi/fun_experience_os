"use client";

import { AnimatePresence, motion } from "framer-motion";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  Building2,
  CalendarRange,
  ChevronLeft,
  Compass,
  CreditCard,
  Globe,
  Group,
  Landmark,
  Layers,
  MapPin,
  Megaphone,
  ShieldCheck,
  Store,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { navFor } from "@/lib/nav";
import { cn } from "@/lib/format";
import { useIsMobile } from "@/lib/hooks";
import { TerritorySwitcher } from "@/components/shell/TerritorySwitcher";
import { Avatar } from "@/components/ui/primitives";

const ICONS: Record<string, typeof Compass> = {
  "/": Compass,
  "/setup": Layers,
  "/missions": CalendarRange,
  "/bookings": BookOpen,
  "/people": Users,
  "/money": Wallet,
  "/tournaments": Trophy,
  "/franchises": Landmark,
  "/territories": Globe,
  "/cities": Building2,
  "/locations": MapPin,
  "/catalog": Store,
  "/staffing": Group,
  "/notifications": Megaphone,
  "/analytics": BarChart3,
  "/access": ShieldCheck,
};

const LIGHT = [0.19, 1, 0.22, 1] as const;

export function Sidebar() {
  const { role, sidebarCollapsed, toggleSidebar, operator } = useStore();
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const collapsed = isMobile || sidebarCollapsed;
  const items = navFor(role.id);

  return (
    <motion.aside
      animate={{ width: collapsed ? 68 : 236 }}
      transition={{ duration: 0.32, ease: LIGHT }}
      className="glass-surface relative z-30 flex h-full shrink-0 flex-col border-r border-white/5"
      aria-label="Primary"
    >
      {/* brand */}
      <div className={cn("flex h-16 shrink-0 items-center gap-3 border-b border-white/5 px-4", collapsed && "justify-center px-0")}>
        <span className="mark h-8 w-8 shrink-0 ring-1 ring-white/10" />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-tight text-ink-lum">Experience OS</p>
            <p className="overline">Command Center</p>
          </div>
        )}
      </div>

      {/* territory scope */}
      <div className={cn("px-3 pt-3", collapsed && "px-2")}>
        <TerritorySwitcher collapsed={collapsed} />
      </div>

      {/* navigation */}
      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3 pb-4" aria-label="Modules">
        {items.map((item, i) => {
          const Icon = ICONS[item.href] ?? Compass;
          const active = pathname === item.href || (item.href.length > 1 && pathname.startsWith(item.href + "/"));
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.32, delay: 0.04 * i, ease: LIGHT }}
            >
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group relative flex h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors duration-150",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
                  collapsed && "justify-center px-0",
                  active ? "bg-white/8 text-ink-lum" : "text-ink-mut hover:bg-white/4 hover:text-ink-sec",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-xl bg-white/8 ring-1 ring-white/10"
                    transition={{ duration: 0.32, ease: LIGHT }}
                  />
                )}
                <span className="relative">
                  <Icon className={cn("h-[18px] w-[18px]", active && "text-[#ffd28a]")} />
                </span>
                {!collapsed && <span className="relative truncate">{item.label}</span>}
              </Link>
            </motion.div>
          );
        })}
      </nav>

      {/* footer */}
      <div className="shrink-0 border-t border-white/5 p-3">
        {!collapsed && operator && (
          <div className="mb-3 flex items-center gap-2.5 px-1">
            <Avatar initials={operator.initials} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-ink-lum">{operator.name}</p>
              <p className="truncate text-[11px] text-ink-mut">{role.name}</p>
            </div>
          </div>
        )}
        <button
          onClick={toggleSidebar}
          className={cn(
            "flex h-9 w-full items-center gap-3 rounded-xl px-3 text-ink-mut transition-colors hover:bg-white/4 hover:text-ink-sec",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
            collapsed && "justify-center px-0",
          )}
          aria-label={sidebarCollapsed ? "Expand navigation" : "Collapse navigation"}
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform duration-300 ease-light", collapsed && "rotate-180")} />
          {!collapsed && <span className="text-xs">Collapse</span>}
        </button>
      </div>
    </motion.aside>
  );
}
