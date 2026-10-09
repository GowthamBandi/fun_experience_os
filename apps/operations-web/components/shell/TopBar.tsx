"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, LogOut, Search } from "lucide-react";
import { Avatar, Badge, Kbd } from "@/components/pulse";
import { EnvBadge } from "@/components/shell/EnvBadge";
import { NotificationsDrawer } from "@/components/shell/NotificationsDrawer";
import { OPEN_PALETTE_EVENT } from "@/components/shell/CommandPalette";
import { ROLE_LABEL } from "@/lib/console/capabilities";
import { useAdminSession } from "@/lib/firebase/auth";
import { cn } from "@/lib/format";
import { useClickOutside } from "@/lib/hooks";
import type { Attention } from "@/lib/use-attention";

const IST = "Asia/Kolkata";

function greetingFor(now: Date) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: IST }).format(now));
  const part = hour < 5 ? "evening" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const date = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: IST }).format(now);
  return { date, greeting: `Good ${part}` };
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function useIsMac() {
  const [mac, setMac] = useState(false);
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)), []);
  return mac;
}

const STATUS = {
  live: { dot: "bg-ok shadow-[0_0_0_4px_rgba(63,221,154,0.18)]", label: "Live" },
  syncing: { dot: "bg-text-3 shadow-[0_0_0_4px_rgba(255,255,255,0.08)]", label: "Syncing" },
  degraded: { dot: "bg-warn shadow-[0_0_0_4px_rgba(255,184,77,0.18)]", label: "Degraded" },
} as const;

export function TopBar({ attention }: { attention: Attention }) {
  const { user, consoleRole, signOut } = useAdminSession();
  const router = useRouter();
  const now = useClock();
  const mac = useIsMac();
  const [bell, setBell] = useState(false);
  const [menu, setMenu] = useState(false);
  const menuRef = useClickOutside<HTMLDivElement>(() => setMenu(false));
  const firstItem = useRef<HTMLButtonElement>(null);

  const name = user?.displayName?.trim() || null;
  const firstName = name?.split(/\s+/)[0] ?? null;
  const identity = name ?? user?.email ?? "Operator";
  const hello = now ? greetingFor(now) : null;
  const status = STATUS[attention.error ? "degraded" : attention.loading ? "syncing" : "live"];
  const pending = attention.total;

  useEffect(() => {
    if (menu) firstItem.current?.focus();
  }, [menu]);

  return (
    <header className="relative z-30 flex h-[76px] shrink-0 items-center gap-3 px-5 lg:gap-4 lg:px-7">
      <p className="min-w-0 shrink truncate text-[13px] text-text-3">
        {hello ? <span>{hello.date}</span> : <span aria-hidden className="skeleton inline-block h-3 w-16 rounded-pill align-middle" />}
        <span className="hidden lg:inline">
          {" · "}
          <b className="font-semibold text-text">
            {hello?.greeting ?? "Hello"}
            {firstName ? `, ${firstName}` : ""} <span aria-hidden className="text-[#C2B4FF]">✦</span>
          </b>
        </span>
      </p>

      <button
        type="button"
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE_EVENT))}
        aria-label="Search organizers, events, bookings and people"
        aria-keyshortcuts="Meta+K Control+K /"
        className="focus-ring group ml-auto flex h-11 min-w-0 max-w-[460px] flex-1 items-center gap-3 rounded-control border border-line-soft bg-[rgba(255,255,255,0.05)] px-4 text-left text-[14px] text-text-3 transition-[background-color,border-color] duration-150 ease-pulse hover:border-[rgba(142,114,255,0.35)] hover:bg-[rgba(255,255,255,0.07)]"
      >
        <Search aria-hidden className="h-4 w-4 shrink-0 transition-colors group-hover:text-[#C2B4FF]" />
        <span className="min-w-0 flex-1 truncate">
          <span className="xl:hidden">Search…</span>
          <span className="hidden xl:inline">Search organizers, events, bookings, people…</span>
        </span>
        <Kbd>{mac ? "⌘K" : "Ctrl K"}</Kbd>
      </button>

      <EnvBadge />

      <span role="status" className="hidden items-center gap-2 text-[13px] text-text-2 lg:flex" title={attention.error ?? "Counts update in real time"}>
        <span aria-hidden className={cn("h-2 w-2 rounded-full", status.dot)} />
        {status.label}
      </span>

      <button
        type="button"
        onClick={() => setBell(true)}
        aria-label={pending > 0 ? `Notifications: ${pending} need attention` : "Notifications"}
        className="focus-ring relative grid h-11 w-11 shrink-0 place-items-center rounded-control border border-line-soft bg-[rgba(255,255,255,0.04)] text-text-2 transition-colors duration-150 hover:bg-[rgba(255,255,255,0.08)] hover:text-text"
      >
        <Bell aria-hidden className="h-[18px] w-[18px]" />
        {pending > 0 ? (
          <span aria-hidden className="num absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-volt px-1 text-[10px] font-bold leading-none text-on-volt shadow-[0_0_0_2px_#0B0A12]">
            {pending > 99 ? "99+" : pending}
          </span>
        ) : null}
      </button>

      <div ref={menuRef} className="relative shrink-0">
        <button
          type="button"
          onClick={() => setMenu((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label={`Operator menu for ${identity}`}
          className="focus-ring flex items-center gap-1.5 rounded-pill p-0.5 pr-1.5 transition-colors duration-150 hover:bg-[rgba(255,255,255,0.06)]"
        >
          <Avatar name={identity} size={38} />
          <ChevronDown aria-hidden className={cn("h-4 w-4 text-text-3 transition-transform duration-200 ease-pulse", menu && "rotate-180")} />
        </button>
        {menu ? (
          <div
            role="menu"
            aria-label="Operator"
            className="absolute right-0 top-[calc(100%+10px)] w-[264px] overflow-hidden rounded-[20px] border border-line bg-[rgba(26,23,38,0.97)] p-2 shadow-[0_24px_64px_-16px_rgba(0,0,0,0.7),0_0_0_1px_rgba(142,114,255,0.08)] backdrop-blur-[18px]"
          >
            <div className="flex items-center gap-3 px-2.5 pb-3 pt-2">
              <Avatar name={identity} size={42} />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-bold text-text">{name ?? "—"}</p>
                <p className="truncate text-[12px] text-text-3">{user?.email ?? "—"}</p>
                <Badge tone="violet" className="mt-1.5">{consoleRole ? ROLE_LABEL[consoleRole] : "—"}</Badge>
              </div>
            </div>
            <div className="h-px bg-line-soft" />
            <button
              ref={firstItem}
              type="button"
              role="menuitem"
              onClick={() => {
                setMenu(false);
                void signOut().finally(() => router.push("/login"));
              }}
              className="focus-ring mt-1.5 flex h-10 w-full items-center gap-2.5 rounded-[12px] px-2.5 text-[13px] font-semibold text-text-2 transition-colors duration-150 hover:bg-[rgba(255,97,120,0.12)] hover:text-err"
            >
              <LogOut aria-hidden className="h-4 w-4" />
              Sign out
            </button>
          </div>
        ) : null}
      </div>

      <NotificationsDrawer open={bell} onClose={() => setBell(false)} attention={attention} />
    </header>
  );
}
