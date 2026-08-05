"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { AppShell } from "@/components/shell/AppShell";

export default function ConsoleLayout({ children }: { children: ReactNode }) {
  const { authed, hydrated } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (hydrated && !authed) router.replace("/login");
  }, [hydrated, authed, router]);

  if (!hydrated) {
    return <div className="dusk-field grain h-screen w-screen" aria-hidden />;
  }

  if (!authed) {
    return (
      <div className="dusk-field grain flex h-screen items-center justify-center">
        <div className="tide w-48" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
