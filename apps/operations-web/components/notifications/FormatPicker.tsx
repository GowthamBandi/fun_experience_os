"use client";

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/format";
import { FORMATS, FORMAT_META, type AnnouncementFormat } from "@/lib/notifications";
import { FORMAT_ICON } from "./Bits";

/** Card classes for one format option; the selected look depends ONLY on `selected`. */
export function formatCardClass(selected: boolean, disabled: boolean): string {
  return cn(
    "focus-ring relative flex w-full flex-col items-start gap-1.5 rounded-control border p-3 text-left transition-[border-color,background-color,box-shadow] duration-150",
    selected
      ? "border-[rgba(142,114,255,0.6)] bg-[rgba(142,114,255,0.14)] shadow-[inset_0_0_0_1px_rgba(142,114,255,0.35)]"
      : "border-line-soft bg-transparent hover:border-line",
    disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
  );
}

/**
 * The composer's format cards (Centre popup / Full screen / Bottom sheet / Top banner / Inbox only).
 * An ARIA radiogroup of buttons: the selected card is whichever equals `value` — no native radio
 * state that could disagree with the form — with roving tabindex and arrow keys like a radio group.
 */
export function FormatPicker({
  value,
  onChange,
  disabled = false,
  label = "Format",
}: {
  value: AnnouncementFormat;
  onChange: (format: AnnouncementFormat) => void;
  disabled?: boolean;
  label?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const current = Math.max(0, FORMATS.indexOf(value));

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (disabled) return;
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % FORMATS.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + FORMATS.length) % FORMATS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = FORMATS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(FORMATS[next]!);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} aria-disabled={disabled || undefined} className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {FORMATS.map((f, i) => {
        const on = f === value;
        const Icon = FORMAT_ICON[f];
        return (
          <button
            key={f}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            data-format={f}
            data-selected={on ? "true" : "false"}
            tabIndex={i === current ? 0 : -1}
            disabled={disabled}
            onClick={() => {
              if (!disabled && !on) onChange(f);
            }}
            onKeyDown={(e) => onKey(e, i)}
            className={formatCardClass(on, disabled)}
          >
            <Icon aria-hidden className={cn("h-5 w-5", on ? "text-[#C2B4FF]" : "text-text-3")} />
            <span className="text-[13px] font-bold text-text">{FORMAT_META[f].label}</span>
            <span className="text-[11.5px] leading-[1.4] text-text-3">{FORMAT_META[f].description}</span>
          </button>
        );
      })}
    </div>
  );
}
