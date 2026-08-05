"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Building2, Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { territoryViews } from "@/lib/prototype/repositories";
import { cn } from "@/lib/format";
import { useClickOutside } from "@/lib/hooks";
import { useState } from "react";

/** The scope control — a territory is owned, not merely selected. */
export function TerritorySwitcher({ collapsed }: { collapsed: boolean }) {
  const { territory, switchTerritory, state } = useStore();
  const [open, setOpen] = useState(false);
  const ref = useClickOutside<HTMLDivElement>(() => setOpen(false));
  const territories = territoryViews(state);
  const active = territories.find((t) => t.id === territory.id);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-xl border border-white/6 bg-white/3 px-3 py-2.5 text-left",
          "transition-colors hover:bg-white/6",
          collapsed && "justify-center px-0 py-3",
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="h-4 w-4 shrink-0 text-ink-sec" />
        {!collapsed && (
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-medium text-ink-lum">{territory.name}</span>
            <span className="block text-[11px] text-ink-mut">
              {active?.tonight ?? territory.tonight} tonight · {active?.fill ?? territory.fill}% fill
            </span>
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            transition={{ duration: 0.2, ease: [0.19, 1, 0.22, 1] }}
            className="glass absolute left-0 top-full z-40 mt-2 min-w-[200px] rounded-xl p-1.5"
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
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors",
                    isActive ? "bg-white/8" : "hover:bg-white/5",
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink-lum">{t.name}</span>
                    <span className="block text-[11px] text-ink-mut">
                      {t.code} · {t.venuesCount} arenas
                    </span>
                  </span>
                  {isActive && <Check className="h-3.5 w-3.5 text-[#ffd28a]" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
