"use client";

import { useState, type ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { CommandPalette } from "@/components/shell/CommandPalette";

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="dusk-field relative flex h-screen w-screen overflow-hidden">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[90] focus:rounded-lg focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow-lift">
        Skip to content
      </a>
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNav={() => setMobileOpen(true)} />
        <main id="main" className="relative min-h-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
