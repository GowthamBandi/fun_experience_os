"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, CalendarDays, CornerDownLeft, Hash, Loader2, Phone, Search, Sparkles, Store, Ticket, UserRound, type LucideIcon } from "lucide-react";
import { Kbd } from "@/components/pulse";
import { useDialog } from "@/components/pulse/use-dialog";
import { canSearchEntities, canViewRoute } from "@/lib/console/capabilities";
import { describeReadError } from "@/lib/console/errors";
import { getFirebaseClient } from "@/lib/firebase/client";
import { useAdminSession } from "@/lib/firebase/auth";
import { cn, maskPhone } from "@/lib/format";
import { consoleNav } from "@/lib/nav";
import { classifyQuery, pageMatches, searchEntities, type SearchHit, type SearchHitKind } from "@/lib/search";

export const OPEN_PALETTE_EVENT = "pulse:open-palette";

const EASE = [0.2, 0.8, 0.2, 1] as const;
const DEBOUNCE_MS = 250;

const SECTIONS: Array<{ kind: SearchHitKind; label: string; icon: LucideIcon }> = [
  { kind: "customer", label: "Customers", icon: UserRound },
  { kind: "booking", label: "Bookings", icon: Ticket },
  { kind: "organizer", label: "Organizers", icon: Store },
  { kind: "event", label: "Events", icon: CalendarDays },
  { kind: "experience", label: "Experiences", icon: Sparkles },
];

interface Option {
  key: string;
  title: string;
  subtitle: string;
  href: string;
  icon: LucideIcon;
}

type Search = { status: "idle" | "loading" | "done"; hits: SearchHit[] } | { status: "error"; hits: SearchHit[]; error: string };

const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_PALETTE_EVENT, onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_PALETTE_EVENT, onOpen);
    };
  }, []);

  if (!mounted) return null;
  return createPortal(<AnimatePresence>{open ? <Palette key="palette" onClose={() => setOpen(false)} /> : null}</AnimatePresence>, document.body);
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const { consoleRole } = useAdminSession();
  const id = useId();
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState<Search>({ status: "idle", hits: [] });
  useDialog(true, panel, onClose, input);

  const trimmed = query.trim();
  const detected = trimmed ? classifyQuery(trimmed) : null;
  const entities = canSearchEntities(consoleRole);
  const searchable = entities && !!detected && (detected.kind !== "text" || detected.value.length >= 2);

  useEffect(() => {
    const ticket = ++seq.current;
    if (!searchable) {
      setSearch({ status: "idle", hits: [] });
      return;
    }
    setSearch((s) => ({ status: "loading", hits: s.hits }));
    const timer = window.setTimeout(() => {
      let db;
      try {
        db = getFirebaseClient().firestore;
      } catch (cause) {
        setSearch({ status: "error", hits: [], error: cause instanceof Error ? cause.message : "Search is unavailable." });
        return;
      }
      searchEntities(trimmed, { db })
        .then((hits) => {
          if (seq.current === ticket) setSearch({ status: "done", hits: hits.filter((h) => canViewRoute(consoleRole, h.href)) });
        })
        .catch((cause: unknown) => {
          if (seq.current === ticket) setSearch({ status: "error", hits: [], error: describeReadError(cause instanceof Error ? cause.message : String(cause)) });
        });
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [trimmed, searchable, consoleRole, attempt]);

  const pages = useMemo(() => {
    const nav = consoleNav(consoleRole);
    return (trimmed ? pageMatches(trimmed, nav) : nav).slice(0, 6);
  }, [trimmed, consoleRole]);

  const groups = useMemo(() => {
    const out: Array<{ label: string; options: Option[] }> = [];
    if (pages.length) out.push({ label: trimmed ? "Go to" : "Jump to", options: pages.map((p) => ({ key: `page:${p.href}`, title: p.label, subtitle: p.group, href: p.href, icon: p.icon })) });
    for (const section of SECTIONS) {
      const hits = search.hits.filter((h) => h.kind === section.kind);
      if (hits.length) out.push({ label: section.label, options: hits.map((h) => ({ key: `${h.kind}:${h.id}`, title: h.title, subtitle: h.subtitle, href: h.href, icon: section.icon })) });
    }
    return out;
  }, [pages, search.hits, trimmed]);

  const options = useMemo(() => groups.flatMap((g) => g.options), [groups]);
  const current = Math.min(active, Math.max(options.length - 1, 0));
  const optionId = (i: number) => `${id}-opt-${i}`;

  useEffect(() => setActive(0), [trimmed, search.status]);
  useEffect(() => {
    document.getElementById(optionId(current))?.scrollIntoView({ block: "nearest" });
  }, [current]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (option: Option | undefined) => {
    if (!option) return;
    onClose();
    router.push(option.href);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (options.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      setActive((current + step + options.length) % options.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(options[current]);
    }
  };

  const chip =
    detected?.kind === "phone"
      ? { icon: Phone, label: `Phone ${maskPhone(detected.value)}` }
      : detected?.kind === "reference"
        ? { icon: Ticket, label: "Booking ref" }
        : detected?.kind === "id"
          ? { icon: Hash, label: "Document ID" }
          : null;

  let index = -1;
  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]">
      <motion.div
        aria-hidden
        className="absolute inset-0 bg-[rgba(7,6,12,0.62)] backdrop-blur-[6px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18, ease: EASE }}
        onMouseDown={onClose}
      />
      <motion.div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Search and go to"
        tabIndex={-1}
        className="relative flex max-h-[72vh] w-full max-w-[640px] flex-col overflow-hidden rounded-card border border-line-soft bg-[rgba(22,19,34,0.96)] shadow-[0_40px_120px_-30px_rgba(142,114,255,0.45),0_24px_64px_-16px_rgba(0,0,0,0.7)] outline-none backdrop-blur-[18px]"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.98 }}
        animate={reduced ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
        transition={{ duration: 0.2, ease: EASE }}
      >
        <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-[radial-gradient(60%_100%_at_20%_0%,rgba(142,114,255,0.2),transparent_70%)]" />
        <div className="relative flex items-center gap-3 border-b border-line-soft px-5 py-4">
          {search.status === "loading" ? (
            <Loader2 aria-hidden className="h-5 w-5 shrink-0 animate-spin text-[#C2B4FF]" />
          ) : (
            <Search aria-hidden className="h-5 w-5 shrink-0 text-text-3" />
          )}
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            role="combobox"
            aria-expanded={options.length > 0}
            aria-controls={`${id}-list`}
            aria-activedescendant={options.length ? optionId(current) : undefined}
            aria-autocomplete="list"
            aria-label={entities ? "Search organizers, events, bookings and people, or go to a page" : "Go to a console page"}
            placeholder="Search or jump to…"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[16px] font-medium text-text outline-none placeholder:text-text-3"
          />
          {chip ? (
            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill bg-[rgba(142,114,255,0.18)] px-2.5 py-1 font-display text-[11px] font-bold text-[#C2B4FF]">
              <chip.icon aria-hidden className="h-3 w-3" />
              {chip.label}
            </span>
          ) : null}
          <Kbd>esc</Kbd>
        </div>

        <div id={`${id}-list`} role="listbox" aria-label="Results" className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {!trimmed ? (
            <div className="mx-2 mb-2 mt-1 rounded-control border border-dashed border-line px-4 py-3.5">
              <p className="text-[13px] text-text-2">Try a phone number, PLS-XXXXXX, or an organizer name</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {[
                  { icon: Phone, label: "Phone → customer" },
                  { icon: Ticket, label: "PLS-XXXXXX → booking" },
                  { icon: Store, label: "Name → organizer, event" },
                  { icon: Hash, label: "Document ID → anything" },
                ].map((h) => (
                  <span key={h.label} className="inline-flex items-center gap-1.5 rounded-pill bg-[rgba(255,255,255,0.05)] px-2.5 py-1 text-[11.5px] font-semibold text-text-3">
                    <h.icon aria-hidden className="h-3 w-3" />
                    {h.label}
                  </span>
                ))}
              </div>
            </div>
          ) : null}

          {groups.map((group) => (
            <div key={group.label} role="group" aria-label={group.label} className="mb-1">
              <p aria-hidden className="px-3 pb-1.5 pt-2.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-text-3">
                {group.label}
              </p>
              {group.options.map((option) => {
                index += 1;
                const i = index;
                const on = i === current;
                const Icon = option.icon;
                return (
                  <div
                    key={option.key}
                    id={optionId(i)}
                    role="option"
                    aria-selected={on}
                    onMouseMove={() => setActive(i)}
                    onClick={() => go(option)}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-control px-3 py-2.5 transition-colors duration-100",
                      on ? "bg-[rgba(142,114,255,0.16)] shadow-[inset_0_0_0_1px_rgba(142,114,255,0.3)]" : "hover:bg-[rgba(255,255,255,0.04)]",
                    )}
                  >
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[12px] transition-colors", on ? "bg-[rgba(142,114,255,0.24)] text-[#D6CCFF]" : "bg-surface-high text-text-3")}>
                      <Icon aria-hidden className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-text">{option.title}</span>
                      <span className="block truncate text-[12px] text-text-3">{option.subtitle}</span>
                    </span>
                    {on ? <CornerDownLeft aria-hidden className="h-4 w-4 shrink-0 text-[#C2B4FF]" /> : <ArrowRight aria-hidden className="h-4 w-4 shrink-0 text-text-3 opacity-0" />}
                  </div>
                );
              })}
            </div>
          ))}

          {search.status === "loading" && search.hits.length === 0 ? (
            <div aria-hidden className="flex flex-col gap-2 px-3 py-2">
              {[0, 1].map((n) => (
                <div key={n} className="flex items-center gap-3" style={{ opacity: 1 - n * 0.4 }}>
                  <span className="skeleton h-9 w-9 shrink-0 rounded-[12px]" />
                  <span className="flex flex-1 flex-col gap-1.5">
                    <span className="skeleton h-3 w-2/5 rounded-pill" />
                    <span className="skeleton h-2.5 w-1/4 rounded-pill" />
                  </span>
                </div>
              ))}
            </div>
          ) : null}

          {search.status === "error" ? (
            <div role="alert" className="mx-2 my-2 flex items-center gap-3 rounded-control border border-[rgba(255,97,120,0.3)] bg-[rgba(255,97,120,0.08)] px-3.5 py-3 text-[13px] text-err">
              <span className="min-w-0 flex-1">Search failed. {search.error}</span>
              <button type="button" onClick={() => setAttempt((n) => n + 1)} className="focus-ring shrink-0 rounded-[10px] px-2 py-1 font-semibold underline underline-offset-2">
                Retry
              </button>
            </div>
          ) : null}

          {trimmed && search.status !== "loading" && search.status !== "error" && options.length === 0 ? (
            <div className="px-6 py-10 text-center">
              <p aria-hidden className="text-[28px]">🔍</p>
              <p className="mt-2 font-display text-[16px] font-bold text-text">No matches for “{trimmed}”</p>
              <p className="mt-1 text-[13px] text-text-3">
                {entities ? "Names match from their first letters. Try a phone number, PLS-XXXXXX, or a document ID." : "Your role searches console pages only; organizers, events and people aren't available to it."}
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex items-center gap-4 border-t border-line-soft px-5 py-2.5 text-[12px] text-text-3">
          <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> move</span>
          <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> open</span>
          <span className="flex items-center gap-1.5"><Kbd>esc</Kbd> close</span>
          <span className="ml-auto hidden sm:inline">{entities ? "Live from Firestore · 5 per type" : "Pages only for your role"}</span>
        </div>
      </motion.div>
    </div>
  );
}
