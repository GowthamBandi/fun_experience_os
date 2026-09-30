"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAdminSession } from "@/lib/firebase/auth";
import { AppShell } from "@/components/shell/AppShell";
import { ArchivedPrototypeBanner, ArchivedPrototypeNotice } from "@/components/console/ArchivedPrototypeNotice";
import { RoleRestricted, SessionStateScreen } from "@/components/console/SessionStateScreen";
import { archivedPrototypeEnabled, isArchivedRoute } from "@/lib/console/archived";
import { can, canViewRoute, landingRoute } from "@/lib/console/capabilities";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const { state, consoleRole } = useAdminSession();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const archived = isArchivedRoute(pathname);
  const allowed = state === "ready" && canViewRoute(consoleRole, pathname);
  const landing = landingRoute(consoleRole);

  useEffect(() => {
    // A misconfigured console explains itself on the login screen.
    if (state === "signed-out" || state === "misconfigured") router.replace("/login");
    // e.g. an auditor opening the Command Center lands on the audit trail instead.
    if (state === "ready" && !archived && !allowed && pathname === "/" && landing !== "/") router.replace(landing);
  }, [state, router, archived, allowed, pathname, landing]);

  if (state === "loading" || state === "signed-out" || state === "misconfigured") {
    return <div className="dusk-field grain h-screen w-screen" aria-hidden />;
  }

  if (state !== "ready") return <SessionStateScreen />;

  // ADR-0006: every non-governance route is the archived company-operated prototype.
  // Reachable only with NEXT_PUBLIC_SHOW_ARCHIVED_PROTOTYPE=true, never in firebase-live, and only for admins.
  if (archived) {
    const show = archivedPrototypeEnabled() && can(consoleRole, "archived.view");
    return <AppShell prototype={show}>{show ? <><ArchivedPrototypeBanner />{children}</> : <ArchivedPrototypeNotice pathname={pathname} />}</AppShell>;
  }

  if (!allowed) {
    if (pathname === "/" && landing !== "/") return <div className="dusk-field grain h-screen w-screen" aria-hidden />;
    return <AppShell><RoleRestricted pathname={pathname} landing={landing} /></AppShell>;
  }

  return <AppShell>{children}</AppShell>;
}
