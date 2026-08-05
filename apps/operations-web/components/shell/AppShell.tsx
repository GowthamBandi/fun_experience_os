"use client";

import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { Topbar } from "@/components/shell/Topbar";
import { CommandPalette } from "@/components/shell/CommandPalette";
import { DemoWalkthroughPanel } from "@/components/shell/DemoWalkthroughPanel";
import { StateValidatorPanel } from "@/components/dev/StateValidatorPanel";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="dusk-field grain relative flex h-screen w-screen overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main className="relative min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>
      <CommandPalette />
      <DemoWalkthroughPanel />
      {process.env.NODE_ENV === "development" && <StateValidatorPanel />}
    </div>
  );
}
