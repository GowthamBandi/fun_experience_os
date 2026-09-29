"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/components/ui/toast";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { CommandPalette } from "@/components/shell/CommandPalette";

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const toast = useToast();

  useEffect(() => {
    const onConflict = (e: Event) =>
      toast.warning("Another operator saved first", `${String((e as CustomEvent).detail ?? "")} The latest data is now shown — repeat your last change if it is still needed.`);
    window.addEventListener("xos:workspace-conflict", onConflict);
    return () => window.removeEventListener("xos:workspace-conflict", onConflict);
  }, [toast]);
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
