"use client";

import { Lock, Search, X } from "lucide-react";
import { Chip, Tooltip } from "@/components/pulse";
import { ROLE_LABEL, type ConsoleRole } from "@/lib/console/capabilities";
import { cn } from "@/lib/format";

/** Status filter chips with a count badge each ("·" until the list has loaded). */
export function CountChips<T extends string>({
  label,
  filters,
  value,
  counts,
  ready,
  onChange,
}: {
  label: string;
  filters: Array<{ id: T; label: string }>;
  value: T;
  counts: Record<T, number>;
  ready: boolean;
  onChange: (id: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      {filters.map((f) => (
        <Chip key={f.id} selected={value === f.id} onClick={() => onChange(f.id)}>
          {f.label}
          <span
            className={cn(
              "inline-grid h-[18px] min-w-[18px] place-items-center rounded-pill px-1.5 font-display text-[11px] font-bold leading-none",
              value === f.id ? "bg-ink text-text" : "bg-[rgba(255,255,255,0.08)] text-text-2",
            )}
          >
            {ready ? counts[f.id] : "·"}
          </span>
        </Chip>
      ))}
    </div>
  );
}

export function SearchField({ value, onChange, label, placeholder }: { value: string; onChange: (v: string) => void; label: string; placeholder: string }) {
  return (
    <label className="field ml-auto flex h-10 w-full items-center gap-2 rounded-control px-3.5 sm:w-[320px]">
      <Search aria-hidden className="h-4 w-4 shrink-0 text-text-3" />
      <span className="sr-only">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-text-3 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="focus-ring grid h-6 w-6 place-items-center rounded-[8px] text-text-3 hover:text-text">
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </label>
  );
}

export function ReadOnly({ role, what }: { role: ConsoleRole | null; what: string }) {
  return (
    <Tooltip label={`${role ? ROLE_LABEL[role] : "Your role"} can view ${what} but not change them.`}>
      <span tabIndex={0} className="focus-ring inline-flex h-10 w-fit items-center gap-2 rounded-pill border border-line px-4 text-[13px] font-semibold text-text-3" data-testid="actions-read-only">
        <Lock aria-hidden className="h-4 w-4" />
        Read-only
      </span>
    </Tooltip>
  );
}
