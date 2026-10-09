"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type FocusEvent } from "react";
import { Pin, PinOff } from "lucide-react";
import { consoleNav, type NavItem } from "@/lib/nav";
import { useAdminSession } from "@/lib/firebase/auth";
import { cn } from "@/lib/format";

export type RailBadge = NonNullable<NavItem["badge"]>;

/** Volt counts per badge key. `live` stays unset until a live-events source exists. */
export type RailCounts = Partial<Record<RailBadge, number>>;

export const RAIL_COLLAPSED = 84;
export const RAIL_EXPANDED = 240;

const isActive = (pathname: string, href: string) => (href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`));

const countLabel = (n: number) => (n > 99 ? "99+" : String(n));

export function PulseMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[linear-gradient(135deg,#8E72FF,#6E4DFF)] shadow-[0_10px_30px_-10px_rgba(142,114,255,0.8),inset_0_1px_0_rgba(255,255,255,0.25)]",
        className,
      )}
    >
      <svg width="26" height="18" viewBox="0 0 34 24">
        <polyline points="0,13 9.5,13 13.6,3 18.7,22 23.1,9.6 25.8,13 34,13" fill="none" stroke="#D9FF3F" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function Rail({ counts, pinned, onTogglePin }: { counts: RailCounts; pinned: boolean; onTogglePin: () => void }) {
  const { consoleRole } = useAdminSession();
  const pathname = usePathname() ?? "/";
  const items = consoleNav(consoleRole);
  const [hover, setHover] = useState(false);
  const [focused, setFocused] = useState(false);
  const open = pinned || hover || focused;

  const onBlur = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false);
  };

  return (
    <div
      className="relative z-40 shrink-0 transition-[width] duration-200 ease-pulse"
      style={{ width: pinned ? RAIL_EXPANDED : RAIL_COLLAPSED }}
    >
      <nav
        aria-label="Primary"
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        onFocus={() => setFocused(true)}
        onBlur={onBlur}
        style={{ width: open ? RAIL_EXPANDED : RAIL_COLLAPSED }}
        className={cn(
          "absolute inset-y-0 left-0 flex flex-col overflow-hidden border-r border-line-soft transition-[width,background-color,box-shadow] duration-200 ease-pulse",
          open && !pinned
            ? "bg-[rgba(18,16,28,0.94)] shadow-[24px_0_80px_-24px_rgba(0,0,0,0.7),12px_0_60px_-30px_rgba(142,114,255,0.45)] backdrop-blur-[18px]"
            : "bg-[rgba(11,10,18,0.55)] backdrop-blur-[10px]",
        )}
      >
        <Link href="/" aria-label="PULSE Admin home" className="focus-ring mx-5 mb-3 mt-5 flex shrink-0 items-center gap-3 rounded-[14px]">
          <PulseMark />
          <span className={cn("min-w-0 whitespace-nowrap transition-opacity duration-200 ease-pulse", open ? "opacity-100" : "opacity-0")}>
            <span className="block font-display text-[17px] font-bold leading-5 tracking-[-0.02em] text-text">PULSE</span>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-3">Admin console</span>
          </span>
        </Link>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden px-[18px] pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((item, i) => {
            const newGroup = i > 0 && item.group !== items[i - 1]?.group;
            const active = isActive(pathname, item.href);
            const count = item.badge ? counts[item.badge] ?? 0 : 0;
            const Icon = item.icon;
            return (
              <div key={item.href} className={cn(i === 0 ? "" : newGroup ? "mt-3" : "mt-1")}>
                {newGroup || i === 0 ? (
                  <div aria-hidden className="relative mb-1 h-5">
                    <span className={cn("absolute left-3 top-1/2 h-px w-6 -translate-y-1/2 bg-line transition-opacity duration-200", open || i === 0 ? "opacity-0" : "opacity-100")} />
                    <span className={cn("absolute left-2 top-0.5 whitespace-nowrap text-[10.5px] font-bold uppercase tracking-[0.14em] text-text-3 transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}>
                      {item.group}
                    </span>
                  </div>
                ) : null}
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  title={open ? undefined : item.label}
                  className={cn(
                    "focus-ring group relative flex h-12 items-center rounded-control transition-colors duration-150 ease-pulse",
                    active ? "bg-[rgba(142,114,255,0.18)] text-text shadow-[inset_0_0_0_1px_rgba(142,114,255,0.28)]" : "text-text-3 hover:bg-[rgba(255,255,255,0.05)] hover:text-text",
                  )}
                >
                  {active ? <span aria-hidden className="absolute -left-[18px] top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_12px_rgba(142,114,255,0.9)]" /> : null}
                  <span className="relative grid h-12 w-12 shrink-0 place-items-center">
                    <Icon aria-hidden className={cn("h-5 w-5 transition-transform duration-150 ease-pulse group-hover:scale-110 motion-reduce:group-hover:scale-100", active && "text-[#C2B4FF]")} strokeWidth={active ? 2.2 : 1.9} />
                    {count > 0 && !open ? (
                      <span aria-hidden className="num absolute right-0.5 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-volt px-1 text-[10px] font-bold leading-none text-on-volt shadow-[0_0_0_2px_#0B0A12]">
                        {countLabel(count)}
                      </span>
                    ) : null}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate pr-2 text-[14px] font-semibold transition-opacity duration-200 ease-pulse", open ? "opacity-100" : "opacity-0")}>{item.label}</span>
                  {count > 0 && open ? (
                    <span aria-hidden className="num mr-3 grid h-5 min-w-[22px] place-items-center rounded-pill bg-volt px-1.5 text-[11px] font-bold leading-none text-on-volt">
                      {countLabel(count)}
                    </span>
                  ) : null}
                  {count > 0 ? <span className="sr-only">, {count} need attention</span> : null}
                </Link>
              </div>
            );
          })}
        </div>

        <div className="shrink-0 border-t border-line-soft px-[18px] py-3">
          <button
            type="button"
            onClick={onTogglePin}
            aria-pressed={pinned}
            title={open ? undefined : "Keep navigation open"}
            className="focus-ring flex h-11 w-full items-center rounded-control text-text-3 transition-colors duration-150 hover:bg-[rgba(255,255,255,0.05)] hover:text-text"
          >
            <span className="grid h-11 w-12 shrink-0 place-items-center">{pinned ? <PinOff aria-hidden className="h-[18px] w-[18px]" /> : <Pin aria-hidden className="h-[18px] w-[18px]" />}</span>
            <span className={cn("whitespace-nowrap text-[13px] font-semibold transition-opacity duration-200", open ? "opacity-100" : "opacity-0")}>
              Keep navigation open
            </span>
          </button>
        </div>
      </nav>
    </div>
  );
}
