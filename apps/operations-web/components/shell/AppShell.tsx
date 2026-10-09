"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { Rail, type RailCounts } from "@/components/shell/Rail";
import { TopBar } from "@/components/shell/TopBar";
import { canViewRoute } from "@/lib/console/capabilities";
import { useAdminSession } from "@/lib/firebase/auth";
import { AttentionProvider, useAttention } from "@/lib/use-attention";
import { LiveEventsProvider, useLiveEvents } from "@/lib/use-live-events";

const PIN_KEY = "pulse.rail.pinned";

function usePinnedRail() {
  const [pinned, setPinned] = useState(false);
  useEffect(() => {
    try {
      setPinned(window.localStorage.getItem(PIN_KEY) === "1");
    } catch {}
  }, []);
  const toggle = useCallback(() => {
    setPinned((was) => {
      try {
        window.localStorage.setItem(PIN_KEY, was ? "0" : "1");
      } catch {}
      return !was;
    });
  }, []);
  return [pinned, toggle] as const;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [pinned, togglePin] = usePinnedRail();
  const { consoleRole } = useAdminSession();
  const attention = useAttention();
  const liveEvents = useLiveEvents(canViewRoute(consoleRole, "/live"));
  const counts: RailCounts = { ...attention.byRoute, live: liveEvents.live.length };

  return (
    <AttentionProvider value={attention}>
      <LiveEventsProvider value={liveEvents}>
        <div className="relative flex h-screen w-screen overflow-hidden bg-ink">
          <a
            href="#main"
            className="focus-ring sr-only z-[90] rounded-[12px] bg-surface-top px-4 py-2.5 text-[13px] font-semibold text-text focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
          >
            Skip to content
          </a>
          <div aria-hidden className="page-glow" />
          <Rail counts={counts} pinned={pinned} onTogglePin={togglePin} />
          <div className="relative z-[1] flex min-w-0 flex-1 flex-col">
            <TopBar attention={attention} />
            <main id="main" tabIndex={-1} className="relative min-h-0 flex-1 overflow-y-auto outline-none">
              {children}
            </main>
          </div>
          <CommandPalette />
        </div>
      </LiveEventsProvider>
    </AttentionProvider>
  );
}
