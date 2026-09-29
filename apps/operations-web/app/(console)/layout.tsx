"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { useAdminSession } from "@/lib/firebase/auth";
import { AppShell } from "@/components/shell/AppShell";
import { Button } from "@/components/ui/primitives";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const session = useAdminSession();
  const router = useRouter();

  useEffect(() => {
    if (session.state === "signed-out") router.replace("/login");
  }, [session.state, router]);

  if (session.state === "loading" || session.state === "signed-out") {
    return (
      <div className="dusk-field flex h-screen w-screen items-center justify-center" aria-busy>
        <div className="flex flex-col items-center gap-4">
          <span className="mark h-12 w-12 animate-pulse" />
          <p className="text-sm font-medium text-ink-mut">Opening your workspace…</p>
        </div>
      </div>
    );
  }

  if (session.state !== "ready") {
    return (
      <div className="dusk-field flex h-screen items-center justify-center p-6">
        <div className="max-w-md rounded-panel border border-edge bg-white p-8 text-center shadow-glass">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
            <ShieldAlert className="h-6 w-6" />
          </span>
          <p className="mt-4 font-display text-lg font-bold text-ink-lum">Access unavailable</p>
          <p className="mt-2 text-sm leading-6 text-ink-mut">
            {session.state === "error"
              ? session.error ?? "The console could not connect to its data service."
              : "Your account is not verified, has been disabled, or does not have a Super Admin role."}
          </p>
          <Button variant="secondary" className="mt-6" onClick={() => void session.signOut().finally(() => router.replace("/login"))}>
            Back to sign in
          </Button>
        </div>
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
