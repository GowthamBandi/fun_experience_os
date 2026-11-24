"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/format";
import { readErrorMessage } from "@/lib/use-query";
import { INPUT } from "./FormBits";

/**
 * A debounced search box with a keyboard-navigable result list (ARIA combobox).
 * Picking a result calls `onPick` and clears the box; the caller shows chips.
 */
export function SearchPicker<T>({
  label,
  placeholder,
  search,
  itemKey,
  renderItem,
  onPick,
  isPicked,
  minChars = 2,
  disabled,
}: {
  label: string;
  placeholder: string;
  search: (q: string) => Promise<T[]>;
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  onPick: (item: T) => void;
  isPicked?: (item: T) => boolean;
  minChars?: number;
  disabled?: boolean;
}) {
  const id = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<{ status: "idle" | "loading" | "done" | "error"; items: T[]; error?: string }>({ status: "idle", items: [] });
  const [active, setActive] = useState(0);
  const run = useRef(search);
  run.current = search;
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < minChars) {
      setState({ status: "idle", items: [] });
      return;
    }
    let live = true;
    setState((s) => ({ status: "loading", items: s.items }));
    const t = window.setTimeout(() => {
      run.current(term).then(
        (items) => {
          if (!live) return;
          setState({ status: "done", items });
          setActive(0);
        },
        (err) => live && setState({ status: "error", items: [], error: readErrorMessage(err) }),
      );
    }, 350);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [q, minChars]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (item: T) => {
    onPick(item);
    setQ("");
    setState({ status: "idle", items: [] });
  };

  const items = state.items;
  const showList = open && q.trim().length >= minChars;
  const listId = `${id}-list`;

  return (
    <div ref={box} className="relative">
      <label htmlFor={`${id}-input`} className="sr-only">
        {label}
      </label>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-3" />
        <input
          id={`${id}-input`}
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && items[active] ? `${id}-opt-${active}` : undefined}
          value={q}
          disabled={disabled}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setActive((a) => Math.min(a + 1, Math.max(items.length - 1, 0)));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter") {
              if (showList && items[active]) {
                e.preventDefault();
                pick(items[active]);
              }
            } else if (e.key === "Escape") {
              if (showList) {
                e.preventDefault();
                e.stopPropagation();
                setOpen(false);
              }
            }
          }}
          className={cn(INPUT, "pl-10 pr-10")}
        />
        {state.status === "loading" ? <Loader2 aria-hidden className="absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-text-3" /> : null}
        {q && state.status !== "loading" ? (
          <button type="button" aria-label="Clear search" onClick={() => setQ("")} className="focus-ring absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-[10px] text-text-3 hover:text-text">
            <X aria-hidden className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {showList ? (
        <div className="absolute inset-x-0 top-full z-30 mt-1.5 overflow-hidden rounded-control border border-line bg-[rgba(26,23,38,0.98)] shadow-[0_24px_60px_-20px_rgba(0,0,0,0.8)] backdrop-blur-[14px]">
          <ul id={listId} role="listbox" aria-label={`${label} results`} className="max-h-72 overflow-y-auto p-1.5">
            {items.map((item, i) => {
              const picked = isPicked?.(item) ?? false;
              return (
                <li
                  key={itemKey(item)}
                  id={`${id}-opt-${i}`}
                  role="option"
                  aria-selected={i === active}
                  aria-disabled={picked || undefined}
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (!picked) pick(item);
                  }}
                  className={cn("flex cursor-pointer items-center gap-3 rounded-[12px] px-3 py-2.5 text-[13px]", i === active ? "bg-[rgba(142,114,255,0.16)]" : "", picked && "cursor-default opacity-50")}
                >
                  {renderItem(item)}
                  {picked ? <span className="ml-auto text-[11px] font-semibold text-text-3">Added</span> : null}
                </li>
              );
            })}
          </ul>
          {state.status === "done" && items.length === 0 ? <p className="px-4 py-3 text-[13px] text-text-3">No matches.</p> : null}
          {state.status === "loading" && items.length === 0 ? <p className="px-4 py-3 text-[13px] text-text-3">Searching…</p> : null}
          {state.status === "error" ? (
            <p role="alert" className="px-4 py-3 text-[13px] text-err">
              {state.error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A removable chip. */
export function RemovableChip({ children, onRemove, label }: { children: ReactNode; onRemove: () => void; label: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-pill border border-line bg-[rgba(255,255,255,0.05)] py-1 pl-3 pr-1 text-[12.5px] font-semibold text-text">
      <span className="truncate">{children}</span>
      <button type="button" aria-label={`Remove ${label}`} onClick={onRemove} className="focus-ring grid h-6 w-6 shrink-0 place-items-center rounded-full text-text-3 hover:bg-[rgba(255,255,255,0.08)] hover:text-text">
        <X aria-hidden className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}
