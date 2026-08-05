"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, Compass, Fingerprint } from "lucide-react";
import { useStore } from "@/lib/store";
import { NAV } from "@/lib/nav";
import { territoryViews } from "@/lib/prototype/repositories";
import { useHotkey } from "@/lib/hooks";
import { cn } from "@/lib/format";

interface Entry {
  kind: "page" | "territory" | "role";
  label: string;
  sub: string;
  href?: string;
  action?: () => void;
  icon: typeof Compass;
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, role, switchTerritory, state } = useStore();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useHotkey(["mod", "k"], () => setPaletteOpen(true));

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [paletteOpen]);

  const entries = useMemo<Entry[]>(() => {
    const q = query.toLowerCase();
    const pages: Entry[] = NAV.filter((n) => n.roles.includes(role.id) && (!q || n.label.toLowerCase().includes(q) || n.keyword.includes(q))).map((n) => ({
      kind: "page",
      label: n.label,
      sub: "Module",
      href: n.href,
      icon: Compass,
    }));
    const territories: Entry[] = territoryViews(state).filter((t) => !q || t.name.toLowerCase().includes(q)).map((t) => ({
      kind: "territory",
      label: t.name,
      sub: `${t.tonight} missions tonight`,
      action: () => switchTerritory(t.id),
      icon: Building2,
    }));
    const roles: Entry[] = [
      {
        kind: "role",
        label: "Position simulator",
        sub: "Switch current position",
        action: () => {
          setPaletteOpen(false);
        },
        icon: Fingerprint,
      },
    ];
    return [...pages, ...territories, ...roles];
  }, [query, role.id, switchTerritory, setPaletteOpen, state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!paletteOpen) return;
      if (e.key === "Escape") setPaletteOpen(false);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setIndex((i) => Math.min(i + 1, entries.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setIndex((i) => Math.max(i - 1, 0));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paletteOpen, entries.length, setPaletteOpen]);

  const run = (e: Entry) => {
    setPaletteOpen(false);
    if (e.href) router.push(e.href);
    else e.action?.();
  };

  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[16vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onMouseDown={() => setPaletteOpen(false)}
        >
          <div className="absolute inset-0 bg-[#0c0e12]/70 backdrop-blur-[8px]" />
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.99 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.99 }}
            transition={{ duration: 0.24, ease: [0.19, 1, 0.22, 1] }}
            className="glass relative w-full max-w-lg rounded-panel p-2"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Command"
          >
            <div className="flex items-center gap-3 border-b border-white/5 px-3 pb-3 pt-2">
              <Compass className="h-4 w-4 text-ink-mut" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIndex(0);
                }}
                placeholder="Where in the building?"
                className="flex-1 bg-transparent text-sm text-ink-lum placeholder:text-ink-mut/70 focus:outline-none"
                aria-label="Search"
              />
              <kbd className="rounded-md border border-white/10 bg-white/5 px-1.5 py-0.5 text-[10px] text-ink-mut">esc</kbd>
            </div>
            <div className="max-h-[320px] overflow-y-auto p-1.5">
              {entries.length === 0 && (
                <p className="px-3 py-8 text-center text-sm text-ink-mut">Nothing in this part of the building.</p>
              )}
              {entries.map((e, i) => {
                const Icon = e.icon;
                return (
                  <button
                    key={`${e.kind}-${e.label}`}
                    onClick={() => run(e)}
                    onMouseEnter={() => setIndex(i)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                      i === index ? "bg-white/8" : "hover:bg-white/4",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-ink-mut" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink-lum">{e.label}</span>
                      <span className="block text-[11px] text-ink-mut">{e.sub}</span>
                    </span>
                    {e.kind === "page" && <ArrowRight className="h-3.5 w-3.5 text-ink-mut" />}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
