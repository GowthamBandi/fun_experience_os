"use client";

import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Check, ChevronsUpDown, MapPin, Plus } from "lucide-react";
import { useState } from "react";
import { useStore } from "@/lib/store";
import { territoryViews } from "@/lib/prototype/repositories";
import { cn } from "@/lib/format";
import { useClickOutside } from "@/lib/hooks";

/** Territory scope for the operations modules. */
export function TerritorySwitcher({ collapsed }: { collapsed: boolean }) {
  const { territory, switchTerritory, state, canAccess } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const territories = territoryViews(state);
  const active = territories.find((t) => t.id === territory.id);
  const none = territories.length === 0;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl border border-edge bg-bg-sunken px-3 py-2 text-left transition-colors hover:border-edge-strong hover:bg-white",
          collapsed && "justify-center px-0 py-2.5",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Territory scope"
        title={collapsed ? territory.name : undefined}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-400 to-indigo-500 text-white">
          <MapPin className="h-3.5 w-3.5" />
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-ink-lum">{none ? "No territories yet" : territory.name}</span>
              <span className="block text-[11px] text-ink-mut">{none ? "Create one in Setup" : `${active?.tonight ?? 0} sessions today · ${active?.fill ?? 0}% fill`}</span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 text-ink-mut" />
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.18, ease: [0.19, 1, 0.22, 1] }}
            className="absolute left-0 top-full z-40 mt-2 w-[240px] rounded-2xl border border-edge bg-white p-1.5 shadow-glass"
            role="listbox"
            aria-label="Territory"
          >
            {territories.map((t) => {
              const isActive = t.id === territory.id;
              return (
                <button
                  key={t.id}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => {
                    switchTerritory(t.id);
                    setOpen(false);
                  }}
                  className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors", isActive ? "bg-brand-subtle" : "hover:bg-slate-50")}
                >
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-xs font-semibold", isActive ? "text-brand-ink" : "text-ink-lum")}>{t.name}</span>
                    <span className="block text-[11px] text-ink-mut">
                      {t.code} · {t.venuesCount} venues · {t.tonight} today
                    </span>
                  </span>
                  {isActive && <Check className="h-4 w-4 text-brand" />}
                </button>
              );
            })}
            {canAccess("/territories/new") && (
              <Link href="/territories/new" onClick={() => setOpen(false)} className="mt-1 flex items-center gap-2 rounded-xl border-t border-edge px-2.5 py-2 text-xs font-semibold text-brand hover:bg-brand-subtle/50">
                <Plus className="h-3.5 w-3.5" /> New territory
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
