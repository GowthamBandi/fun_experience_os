"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAdminSession } from "@/lib/firebase/auth";
import { AppShell } from "@/components/shell/AppShell";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const { state } = useAdminSession();
  const router = useRouter();

  useEffect(() => {
    if (state === "signed-out") router.replace("/login");
  }, [state, router]);

  if (state === "loading") {
    return <div className="dusk-field grain h-screen w-screen" aria-hidden />;
  }

  if (state !== "ready") {
    return (
      <div className="dusk-field grain flex h-screen items-center justify-center">
        <div className="max-w-md rounded-2xl border border-white/10 bg-[#111925] p-6 text-center"><p className="text-sm font-semibold text-white">Access unavailable</p><p className="mt-2 text-xs leading-5 text-slate-400">Your account is not verified, has been disabled, or does not have a Super Admin role.</p></div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
