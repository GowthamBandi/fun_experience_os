"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BellRing, LayoutGrid, LayoutTemplate, Megaphone, Plus, Send } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/pulse";
import { cn } from "@/lib/format";

const SECTIONS = [
  { href: "/notifications", label: "Overview", icon: LayoutGrid, exact: true },
  { href: "/notifications/announcements", label: "Announcements", icon: Megaphone, exact: false },
  { href: "/notifications/send", label: "Send notification", icon: Send, exact: false },
  { href: "/notifications/templates", label: "Templates", icon: LayoutTemplate, exact: false },
] as const;

/** The notification center's header + sub-navigation (links, so every section is a real URL). */
export function NotificationsHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  const pathname = usePathname() ?? "/notifications";
  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        overline={
          <span className="inline-flex items-center gap-1.5">
            <BellRing aria-hidden className="h-3.5 w-3.5" /> Engage · Notification center
          </span>
        }
        title={title}
        subtitle={subtitle}
        actions={
          actions ?? (
            <Link
              href="/notifications/announcements/new"
              className="focus-ring inline-flex h-10 items-center gap-2 rounded-[14px] bg-volt px-4 font-display text-[13px] font-bold text-on-volt transition-[box-shadow,filter] duration-200 hover:shadow-[0_10px_28px_-10px_rgba(217,255,63,0.65)] hover:brightness-[1.04]"
            >
              <Plus aria-hidden className="h-4 w-4" />
              New announcement
            </Link>
          )
        }
      />
      <nav aria-label="Notification center" className="inline-flex max-w-full items-center gap-1 self-start overflow-x-auto rounded-pill border border-line-soft bg-[rgba(255,255,255,0.03)] p-1">
        {SECTIONS.map((s) => {
          const on = s.exact ? pathname === s.href : pathname === s.href || pathname.startsWith(`${s.href}/`);
          const Icon = s.icon;
          return (
            <Link
              key={s.href}
              href={s.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "focus-ring relative inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-pill px-4 text-[13px] font-semibold transition-colors duration-150",
                on
                  ? "border border-[rgba(142,114,255,0.35)] bg-[linear-gradient(180deg,rgba(142,114,255,0.26),rgba(142,114,255,0.14))] text-text shadow-[0_6px_20px_-10px_rgba(142,114,255,0.8)]"
                  : "border border-transparent text-text-3 hover:text-text",
              )}
            >
              <Icon aria-hidden className="h-4 w-4" />
              {s.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
