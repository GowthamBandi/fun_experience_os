"use client";

import type { ReactNode } from "react";
import { useStore } from "@/lib/store";
import { PermissionDenied } from "@/components/ui/panels";
import { MissionShell } from "@/components/missions/shared";

type Tab = "bookings" | "waitlist" | "money";

/**
 * Frame for the session's bookings, waitlist and money tabs. Uses the shared
 * session workspace shell so every session tab has the same header, numbers
 * and tab bar; adds the money-specific access rule.
 */
export function SessionFrame({ current, sub, right, children }: { sessionId: string; current: Tab; sub: string; right?: ReactNode; children: ReactNode }) {
  const { canAccess } = useStore();
  if (current === "money" && !canAccess("/money") && !canAccess("/bookings")) return <PermissionDenied module="Session money" />;
  return (
    <MissionShell tab={current} sub={sub} actions={right}>
      {children}
    </MissionShell>
  );
}
