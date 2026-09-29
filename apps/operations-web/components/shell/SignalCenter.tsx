"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Bell, CheckCheck, CircleAlert, LogIn, ScanLine, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { useClickOutside } from "@/lib/hooks";
import { cn } from "@/lib/format";
import type { Signal } from "@/lib/prototype/entities";

const KIND: Record<Signal["kind"], { icon: typeof Bell; tone: string }> = {
  join: { icon: LogIn, tone: "bg-emerald-50 text-emerald-600" },
  strike: { icon: ScanLine, tone: "bg-violet-50 text-violet-600" },
  alert: { icon: CircleAlert, tone: "bg-red-50 text-red-600" },
  close: { icon: CheckCheck, tone: "bg-slate-100 text-slate-600" },
  system: { icon: Sparkles, tone: "bg-sky-50 text-sky-600" },
};

export function SignalCenter() {
  const { state, setSignalOpen, signalOpen, markAllRead, markSignalRead } = useStore();
  const signals = state.signals;
  const unreadCount = signals.filter((s) => !s.read).length;
  const ref = useClickOutside<HTMLDivElement>(() => setSignalOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setSignalOpen(!signalOpen)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-ink-sec transition-colors hover:bg-slate-100 hover:text-ink-lum"
        aria-label={`Notifications, ${unreadCount} unread`}
        aria-expanded={signalOpen}
      >
        <Bell className="h-[18px] w-[18px]" />
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gradient-to-br from-pink-500 to-rose-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {signalOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.19, 1, 0.22, 1] }}
            className="absolute right-0 top-full z-40 mt-2 w-[400px] max-w-[92vw] overflow-hidden rounded-2xl border border-edge bg-white shadow-glass"
          >
            <div className="flex items-center justify-between border-b border-edge px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-ink-lum">Notifications</p>
                <p className="text-[11px] text-ink-mut">{unreadCount} unread</p>
              </div>
              <button onClick={markAllRead} disabled={unreadCount === 0} className="text-xs font-semibold text-brand hover:text-brand-hover disabled:text-ink-mut">
                Mark all read
              </button>
            </div>
            <div className="max-h-[400px] overflow-y-auto p-1.5">
              {signals.length === 0 && <p className="px-3 py-10 text-center text-sm text-ink-mut">You&apos;re all caught up.</p>}
              {signals.slice(0, 50).map((s: Signal) => {
                const k = KIND[s.kind] ?? KIND.system;
                const Icon = k.icon;
                return (
                  <button
                    key={s.id}
                    onClick={() => markSignalRead(s.id)}
                    className={cn("flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-slate-50", !s.read && "bg-brand-subtle/40")}
                  >
                    <span className={cn("mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", k.tone)}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] leading-snug text-ink-lum">{s.message}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-mut">{s.at}</span>
                    </span>
                    {!s.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" />}
                  </button>
                );
              })}
            </div>
            <Link href="/notifications" onClick={() => setSignalOpen(false)} className="block border-t border-edge px-4 py-2.5 text-center text-xs font-semibold text-brand hover:bg-bg-sunken">
              View all notifications
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
