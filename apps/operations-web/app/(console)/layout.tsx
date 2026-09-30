"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAdminSession } from "@/lib/firebase/auth";
import { AppShell } from "@/components/shell/AppShell";
import { ArchivedPrototypeBanner, ArchivedPrototypeNotice } from "@/components/console/ArchivedPrototypeNotice";
import { archivedPrototypeEnabled, isArchivedRoute } from "@/lib/console/archived";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const { state, error, signOut } = useAdminSession();
  const router = useRouter();
  const pathname = usePathname() ?? "/";

  useEffect(() => {
    // A misconfigured console explains itself on the login screen.
    if (state === "signed-out" || state === "misconfigured") router.replace("/login");
  }, [state, router]);

  if (state === "loading" || state === "signed-out" || state === "misconfigured") {
    return <div className="dusk-field grain h-screen w-screen" aria-hidden />;
  }

  if (state !== "ready") {
    const forbidden = state === "forbidden";
    return (
      <div className="dusk-field grain flex h-screen items-center justify-center p-6">
        <div role="alert" className="max-w-md rounded-2xl border border-white/10 bg-[#111925] p-6 text-center">
          <p className="text-sm font-semibold text-white">{forbidden ? "Access unavailable" : "The console could not start"}</p>
          <p className="mt-2 text-xs leading-5 text-slate-400">{forbidden
            ? "Your account is not verified, has been disabled, or does not have a Platform Owner / Super Admin role."
            : error ?? "Firebase could not be initialized."}</p>
          <div className="mt-4 flex justify-center gap-2">
            {forbidden ? <button onClick={() => void signOut()} className="h-9 rounded-lg border border-white/10 px-3 text-xs text-slate-200 hover:bg-white/5">Sign out</button>
              : <button onClick={() => window.location.reload()} className="h-9 rounded-lg border border-white/10 px-3 text-xs text-slate-200 hover:bg-white/5">Reload</button>}
            <Link href="/login" className="inline-flex h-9 items-center rounded-lg bg-indigo-500 px-3 text-xs font-semibold text-white">Go to sign-in</Link>
          </div>
        </div>
      </div>
    );
  }

  // ADR-0006: every non-governance route is the archived company-operated prototype.
  if (isArchivedRoute(pathname)) {
    return <AppShell>{archivedPrototypeEnabled() ? <><ArchivedPrototypeBanner />{children}</> : <ArchivedPrototypeNotice pathname={pathname} />}</AppShell>;
  }

  return <AppShell>{children}</AppShell>;
}
