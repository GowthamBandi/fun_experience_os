"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Cloud, CloudOff, Database, FileClock, HardDrive, LogOut, Menu, Search, UserRoundCog } from "lucide-react";
import { useStore } from "@/lib/store";
import { SignalCenter } from "@/components/shell/SignalCenter";
import { useAdminSession } from "@/lib/firebase/auth";
import { DATA_MODE_LABEL } from "@/lib/firebase/mode";
import { moduleFor } from "@/lib/nav";
import { useClickOutside } from "@/lib/hooks";
import { Avatar } from "@/components/ui/primitives";
import { cn } from "@/lib/format";

function useClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}

function SaveIndicator() {
  const { workspace } = useStore();
  const { mode } = useAdminSession();
  if (mode !== "prototype") {
    return (
      <span className="hidden items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 md:inline-flex">
        <Cloud className="h-3.5 w-3.5" /> {DATA_MODE_LABEL[mode]}
      </span>
    );
  }
  const error = workspace.saveState === "error";
  const saving = workspace.saveState === "saving";
  return (
    <Link
      href="/settings"
      title={workspace.lastSavedAt ? `Last saved ${new Date(workspace.lastSavedAt).toLocaleString("en-IN")}` : "Workspace"}
      className={cn(
        "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors md:inline-flex",
        error ? "border-red-200 bg-red-50 text-red-700" : "border-edge bg-white text-ink-sec hover:border-brand hover:text-brand",
      )}
    >
      {error ? <CloudOff className="h-3.5 w-3.5" /> : saving ? <HardDrive className="h-3.5 w-3.5 animate-pulse" /> : <Check className="h-3.5 w-3.5 text-emerald-600" />}
      {error ? "Not saved — export a backup" : saving ? "Saving…" : "Saved on this device"}
    </Link>
  );
}

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { operator, role, setPaletteOpen } = useStore();
  const session = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();
  const now = useClock();
  const [menu, setMenu] = useState(false);
  const menuRef = useClickOutside<HTMLDivElement>(() => setMenu(false));
  const current = moduleFor(pathname);

  const signOut = () => {
    setMenu(false);
    void session.signOut().finally(() => router.push("/login"));
  };

  return (
    <header className="relative z-20 flex h-16 shrink-0 items-center gap-3 border-b border-edge bg-white/80 px-4 backdrop-blur-md md:px-6">
      <button onClick={onOpenNav} className="rounded-lg p-2 text-ink-sec hover:bg-slate-100 lg:hidden" aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-[15px] font-bold text-ink-lum">{current?.label ?? "Experience OS"}</p>
        <p className="hidden truncate text-xs text-ink-mut sm:block">
          {now
            ? now.toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
            : " "}{" "}
          · IST
        </p>
      </div>

      <button
        onClick={() => setPaletteOpen(true)}
        className="hidden h-10 w-[300px] items-center gap-2.5 rounded-xl border border-edge bg-bg-sunken px-3.5 text-ink-mut transition-colors hover:border-edge-strong hover:bg-white md:flex"
        aria-label="Search and jump (Ctrl+K)"
      >
        <Search className="h-4 w-4" />
        <span className="flex-1 text-left text-xs">Search pages, sessions, bookings…</span>
        <kbd className="rounded-md border border-edge bg-white px-1.5 py-0.5 font-mono text-[10px] text-ink-mut">⌘K</kbd>
      </button>
      <button onClick={() => setPaletteOpen(true)} className="rounded-lg p-2 text-ink-sec hover:bg-slate-100 md:hidden" aria-label="Search">
        <Search className="h-5 w-5" />
      </button>

      <SaveIndicator />
      <SignalCenter />

      {operator && (
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setMenu((v) => !v)}
            className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 transition-colors hover:bg-slate-100"
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label="Account menu"
          >
            <Avatar initials={operator.initials} />
            <span className="hidden text-left lg:block">
              <span className="block max-w-[140px] truncate text-xs font-semibold text-ink-lum">{operator.name}</span>
              <span className="block max-w-[140px] truncate text-[11px] text-ink-mut">{role.name}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-ink-mut" />
          </button>
          <AnimatePresence>
            {menu && (
              <motion.div
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.18, ease: [0.19, 1, 0.22, 1] }}
                role="menu"
                className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-edge bg-white p-1.5 shadow-glass"
              >
                <div className="border-b border-edge px-3 pb-3 pt-2">
                  <p className="text-sm font-semibold text-ink-lum">{operator.name}</p>
                  <p className="text-xs text-ink-mut">{operator.title}</p>
                  <p className="mt-1 text-[11px] text-ink-mut">{session.user?.email ?? (operator as { email?: string }).email ?? DATA_MODE_LABEL[session.mode]}</p>
                </div>
                <div className="py-1">
                  <MenuLink href="/audit" icon={FileClock} label="Audit & records" onClick={() => setMenu(false)} />
                  <MenuLink href="/settings" icon={Database} label="Workspace & backups" onClick={() => setMenu(false)} />
                  {session.mode === "prototype" && (
                    <button role="menuitem" onClick={signOut} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-sec hover:bg-slate-100 hover:text-ink-lum">
                      <UserRoundCog className="h-4 w-4" /> Switch operator
                    </button>
                  )}
                </div>
                <div className="border-t border-edge pt-1">
                  <button role="menuitem" onClick={signOut} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </header>
  );
}

function MenuLink({ href, icon: Icon, label, onClick }: { href: string; icon: typeof FileClock; label: string; onClick: () => void }) {
  return (
    <Link href={href} role="menuitem" onClick={onClick} className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-sec hover:bg-slate-100 hover:text-ink-lum">
      <Icon className="h-4 w-4" /> {label}
    </Link>
  );
}
