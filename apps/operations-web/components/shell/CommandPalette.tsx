"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, CalendarClock, ClipboardCheck, Compass, CornerDownLeft, MapPin, Search, Ticket, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { NAV } from "@/lib/nav";
import { sessionViews, territoryViews } from "@/lib/prototype/repositories";
import { useHotkey } from "@/lib/hooks";
import { cn } from "@/lib/format";
import { NAV_ICONS } from "@/components/shell/Sidebar";

interface Entry {
  group: "Pages" | "Sessions" | "Bookings" | "Marketplace" | "Staff" | "Territories";
  label: string;
  sub: string;
  href?: string;
  action?: () => void;
  icon: typeof Compass;
}

const HOTKEY = ["mod", "k"];

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, role, switchTerritory, state, canAccess } = useStore();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useHotkey(HOTKEY, () => setPaletteOpen(true));

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [paletteOpen]);

  const entries = useMemo<Entry[]>(() => {
    const q = query.trim().toLowerCase();
    const hit = (...parts: Array<string | undefined>) => !q || parts.some((p) => p?.toLowerCase().includes(q));
    const pages: Entry[] = NAV.filter((n) => n.roles.includes(role.id) && hit(n.label, n.keyword)).map((n) => ({
      group: "Pages",
      label: n.label,
      sub: n.group,
      href: n.href,
      icon: NAV_ICONS[n.href] ?? Compass,
    }));
    if (!q) return pages;

    const out: Entry[] = [...pages];
    if (canAccess("/missions")) {
      for (const s of sessionViews(state)) {
        if (hit(s.title, s.id, s.venueName, s.activity)) out.push({ group: "Sessions", label: s.title, sub: `${s.date} ${s.time} · ${s.venueName} · ${s.status.replace(/-/g, " ")}`, href: `/missions/${s.id}/overview`, icon: CalendarClock });
      }
    }
    if (canAccess("/bookings")) {
      for (const b of state.bookings) {
        if (hit(b.id, b.alias, (b as { tempId?: string }).tempId)) out.push({ group: "Bookings", label: `${b.alias} · ${b.id}`, sub: `${b.status.replace(/-/g, " ")} · session ${b.sessionId}`, href: `/bookings/${b.id}`, icon: Ticket });
      }
    }
    if (canAccess("/approvals")) {
      for (const d of state.governance) {
        if (!["organizers", "arenas", "events", "governanceCases"].includes(d.collection)) continue;
        const name = String(d.data.subject ?? d.data.name ?? d.id);
        if (!hit(name, d.id)) continue;
        const href = { organizers: "/partners", arenas: "/arenas", events: "/events", governanceCases: "/approvals" }[d.collection as "organizers"];
        out.push({ group: "Marketplace", label: name, sub: `${d.collection === "governanceCases" ? "Case" : d.collection.slice(0, -1)} · ${String(d.data.status ?? "").replace(/-/g, " ")}`, href, icon: d.collection === "governanceCases" ? ClipboardCheck : Users });
      }
    }
    if (canAccess("/people")) {
      for (const c of state.crew) {
        if (hit(c.name, c.id)) out.push({ group: "Staff", label: c.name, sub: `${c.id} · ${c.assignment ?? c.role}`, href: `/people/staff/${c.id}`, icon: Users });
      }
    }
    for (const t of territoryViews(state)) {
      if (hit(t.name, t.code)) out.push({ group: "Territories", label: t.name, sub: `Switch scope · ${t.tonight} sessions today`, action: () => switchTerritory(t.id), icon: MapPin });
    }
    // Keep the list fast and scannable.
    const perGroup = new Map<string, number>();
    return out.filter((e) => {
      const n = (perGroup.get(e.group) ?? 0) + 1;
      perGroup.set(e.group, n);
      return n <= 8;
    });
  }, [query, role.id, switchTerritory, state, canAccess]);

  const run = (e: Entry) => {
    setPaletteOpen(false);
    if (e.href) router.push(e.href);
    else e.action?.();
  };

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
      if (e.key === "Enter" && entries[index]) {
        e.preventDefault();
        run(entries[index]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);

  let lastGroup = "";
  return (
    <AnimatePresence>
      {paletteOpen && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-start justify-center px-4 pt-[12vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
          onMouseDown={() => setPaletteOpen(false)}
        >
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[3px]" />
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.99 }}
            transition={{ duration: 0.22, ease: [0.19, 1, 0.22, 1] }}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-edge bg-white shadow-glass"
            onMouseDown={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Search and jump"
          >
            <div className="flex items-center gap-3 border-b border-edge px-4 py-3.5">
              <Search className="h-5 w-5 text-brand" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setIndex(0);
                }}
                placeholder="Search pages, sessions, bookings, organizers, staff…"
                className="flex-1 bg-transparent text-[15px] text-ink-lum placeholder:text-slate-400 focus:outline-none"
                aria-label="Search"
              />
              <kbd className="rounded-md border border-edge bg-bg-sunken px-1.5 py-0.5 font-mono text-[10px] text-ink-mut">esc</kbd>
            </div>
            <div ref={listRef} className="max-h-[420px] overflow-y-auto p-2">
              {entries.length === 0 && <p className="px-3 py-10 text-center text-sm text-ink-mut">No matches for “{query}”.</p>}
              {entries.map((e, i) => {
                const Icon = e.icon;
                const header = e.group !== lastGroup ? e.group : null;
                lastGroup = e.group;
                return (
                  <div key={`${e.group}-${e.label}-${i}`}>
                    {header && <p className="px-3 pb-1 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-mut">{header}</p>}
                    <button
                      data-index={i}
                      onClick={() => run(e)}
                      onMouseEnter={() => setIndex(i)}
                      className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", i === index ? "bg-brand-subtle" : "hover:bg-slate-50")}
                    >
                      <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", i === index ? "bg-white text-brand shadow-lift" : "bg-bg-sunken text-ink-mut")}>
                        <Icon className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-ink-lum">{e.label}</span>
                        <span className="block truncate text-[11px] capitalize text-ink-mut">{e.sub}</span>
                      </span>
                      {i === index ? <CornerDownLeft className="h-3.5 w-3.5 text-brand" /> : <ArrowRight className="h-3.5 w-3.5 text-slate-300" />}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 border-t border-edge bg-bg-sunken px-4 py-2 text-[11px] text-ink-mut">
              <span>↑↓ to move</span>
              <span>↵ to open</span>
              <span className="ml-auto">⌘K anywhere</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
