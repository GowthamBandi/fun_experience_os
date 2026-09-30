"use client";

import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { CommandPalette } from "@/components/shell/CommandPalette";

/**
 * `prototype` is true only while an archived prototype page is shown
 * (NEXT_PUBLIC_SHOW_ARCHIVED_PROTOTYPE=true, never in firebase-live). Only then
 * does the shell show prototype-store widgets (territories, signals, sample
 * operator names). The governance console shows the real signed-in account.
 */
export function AppShell({ children, prototype = false }: { children: ReactNode; prototype?: boolean }) {
  return (
    <div className="dusk-field grain relative flex h-screen w-screen overflow-hidden">
      <Sidebar prototype={prototype} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar prototype={prototype} />
        <main className="relative min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <CommandPalette prototype={prototype} />
    </div>
  );
}
