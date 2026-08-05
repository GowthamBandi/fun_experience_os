"use client";

import { useRouter } from "next/navigation";
import { LogOut, Search } from "lucide-react";
import { useStore } from "@/lib/store";
import { SignalCenter } from "@/components/shell/SignalCenter";
import { RoleSimulator } from "@/components/shell/RoleSimulator";
import { Avatar } from "@/components/ui/primitives";

export function Topbar() {
  const { operator, signOut, setPaletteOpen } = useStore();
  const router = useRouter();

  return (
    <header className="glass-surface relative z-20 flex h-16 shrink-0 items-center gap-3 border-b border-white/5 px-4 md:px-6">
      {/* the night context */}
      <div className="min-w-0 flex-1">
        <p className="overline">The night is on</p>
        <p className="truncate text-sm text-ink-sec">
          {operator?.name} · {operator?.title}
        </p>
      </div>

      <button
        onClick={() => setPaletteOpen(true)}
        className="hidden h-10 items-center gap-2.5 rounded-xl border border-white/6 bg-white/3 px-3.5 text-ink-mut transition-colors hover:bg-white/6 hover:text-ink-sec sm:flex"
        aria-label="Open command"
      >
        <Search className="h-4 w-4" />
        <span className="text-xs">Where in the building?</span>
        <kbd className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-ink-mut">⌘K</kbd>
      </button>

      <SignalCenter />
      <RoleSimulator />

      <span className="h-8 w-px bg-white/8" />

      {operator && (
        <button
          onClick={() => {
            signOut();
            router.push("/login");
          }}
          className="flex items-center gap-2 rounded-xl px-1.5 py-1 transition-colors hover:bg-white/5"
          aria-label="Sign out"
          title="Wrap — sign out"
        >
          <Avatar initials={operator.initials} />
          <LogOut className="h-4 w-4 text-ink-mut" />
        </button>
      )}
    </header>
  );
}
