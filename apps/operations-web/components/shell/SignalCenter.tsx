"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { Bell, BellRing, CheckCheck, CircleAlert, LogIn, ScanLine, Moon } from "lucide-react";
import { useStore } from "@/lib/store";
import { useClickOutside } from "@/lib/hooks";
import { cn } from "@/lib/format";
import { statusTone } from "@/components/ui/primitives";

const KIND_ICON = {
  join: LogIn,
  strike: ScanLine,
  alert: CircleAlert,
  close: CheckCheck,
  system: Moon,
} as const;

export function SignalCenter() {
  const { signals, unreadCount, setSignalOpen, signalOpen, markAllRead } = useStore();
  const ref = useClickOutside<HTMLDivElement>(() => setSignalOpen(false));

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setSignalOpen(!signalOpen)}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl text-ink-sec transition-colors hover:bg-white/5 hover:text-ink-lum"
        aria-label={`Signals, ${unreadCount} unread`}
        aria-expanded={signalOpen}
      >
        {unreadCount > 0 ? <BellRing className="h-[18px] w-[18px] animate-breath text-[#ffd28a]" /> : <Bell className="h-[18px] w-[18px]" />}
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
            {unreadCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {signalOpen && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.19, 1, 0.22, 1] }}
            className="glass absolute right-0 top-full z-40 mt-2 w-[380px] max-w-[90vw] rounded-panel p-2"
          >
            <div className="flex items-center justify-between px-2.5 py-2">
              <p className="text-sm font-semibold text-ink-lum">The night&apos;s signals</p>
              <button onClick={markAllRead} className="text-[11px] text-ink-mut transition-colors hover:text-ink-lum">
                Mark all read
              </button>
            </div>
            <div className="max-h-[380px] overflow-y-auto">
              {signals.map((s, i) => {
                const Icon = KIND_ICON[s.kind] ?? Bell;
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.03 * i, duration: 0.24, ease: [0.19, 1, 0.22, 1] }}
                    className={cn("flex items-start gap-3 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-white/4", !s.read && "bg-white/3")}
                  >
                    <span className={cn("mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border", statusTone[s.kind])}>
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs leading-snug text-ink-sec">{s.message}</span>
                      <span className="mt-0.5 block text-[11px] text-ink-mut">{s.at}</span>
                    </span>
                    {!s.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#f7b955]" />}
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
