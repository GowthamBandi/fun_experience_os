"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/format";
import { useStore } from "@/lib/store";

const LINKS = [
  { href: "/staffing", label: "Overview" },
  { href: "/staffing/assign", label: "Assign" },
  { href: "/staffing/todays-work", label: "Today" },
  { href: "/staffing/check-in", label: "Check-in" },
  { href: "/staffing/availability", label: "Availability" },
  { href: "/staffing/health", label: "Health" },
  { href: "/people/staff", label: "Staff list" },
];

/** Sub-navigation shared by the staffing pages. */
export function StaffingNav() {
  const path = usePathname();
  const { canAccess } = useStore();
  return (
    <nav aria-label="Staffing" className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1">
      {LINKS.filter((l) => canAccess(l.href)).map((l) => {
        const active = path === l.href;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 rounded-xl px-3.5 py-2 text-[13px] font-semibold transition-colors",
              active ? "bg-white text-brand-ink shadow-lift ring-1 ring-edge" : "text-ink-mut hover:bg-white/70 hover:text-ink-lum",
            )}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The territory staffing pages are scoped to ("" = none yet → all). */
export function useStaffScope(): { territoryId?: string; label: string } {
  const { territory } = useStore();
  return territory.id ? { territoryId: territory.id, label: territory.name } : { territoryId: undefined, label: "All territories" };
}
