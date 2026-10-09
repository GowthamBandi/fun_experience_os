"use client";

import { useId, useRef, type KeyboardEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/format";

export type TabItem = { id: string; label: string; count?: number };

export function Tabs({ tabs, value, onChange, className, label }: { tabs: TabItem[]; value: string; onChange: (id: string) => void; className?: string; label?: string }) {
  const group = useId();
  const reduced = useReducedMotion();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = tabs.findIndex((t) => t.id === value);
  const stop = selected >= 0 ? selected : 0;

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (tabs.length === 0) return;
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className={cn("inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-pill border border-line-soft bg-[rgba(255,255,255,0.03)] p-1", className)}
    >
      {tabs.map((tab, i) => {
        const on = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${group}-${tab.id}`}
            aria-selected={on}
            tabIndex={i === stop ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={cn(
              "focus-ring relative inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-pill px-4 text-[13px] font-semibold transition-colors duration-150",
              on ? "text-text" : "text-text-3 hover:text-text",
            )}
          >
            {on ? (
              <motion.span
                aria-hidden
                layoutId={`${group}-pill`}
                transition={reduced ? { duration: 0 } : { duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
                className="absolute inset-0 rounded-pill border border-[rgba(142,114,255,0.35)] bg-[linear-gradient(180deg,rgba(142,114,255,0.26),rgba(142,114,255,0.14))] shadow-[0_6px_20px_-10px_rgba(142,114,255,0.8)]"
              />
            ) : null}
            <span className="relative">{tab.label}</span>
            {tab.count !== undefined ? (
              <span
                className={cn(
                  "relative inline-grid h-[18px] min-w-[18px] place-items-center rounded-pill px-1.5 font-display text-[11px] font-bold leading-none",
                  on && tab.count > 0 ? "bg-volt text-on-volt" : "bg-[rgba(255,255,255,0.08)] text-text-2",
                )}
              >
                {tab.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
