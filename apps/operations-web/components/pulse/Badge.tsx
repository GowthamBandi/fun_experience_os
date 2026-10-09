import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export type BadgeTone = "violet" | "volt" | "ok" | "warn" | "err" | "info" | "muted";

// Tailwind 3 can't apply /opacity to var() colours, so tints are spelled out.
export const TONE_BADGE: Record<BadgeTone, string> = {
  violet: "bg-[rgba(142,114,255,0.18)] text-[#C2B4FF]",
  volt: "bg-volt text-on-volt",
  ok: "bg-[rgba(63,221,154,0.14)] text-ok",
  warn: "bg-[rgba(255,184,77,0.14)] text-warn",
  err: "bg-[rgba(255,97,120,0.14)] text-err",
  info: "bg-[rgba(99,190,255,0.14)] text-info",
  muted: "bg-[rgba(255,255,255,0.07)] text-text-2",
};

export const TONE_TINT: Record<BadgeTone, string> = {
  violet: "bg-[rgba(142,114,255,0.18)]",
  volt: "bg-[rgba(217,255,63,0.14)]",
  ok: "bg-[rgba(63,221,154,0.16)]",
  warn: "bg-[rgba(255,184,77,0.16)]",
  err: "bg-[rgba(255,97,120,0.16)]",
  info: "bg-[rgba(99,190,255,0.16)]",
  muted: "bg-[rgba(255,255,255,0.06)]",
};

export const TONE_DOT: Record<BadgeTone, string> = {
  violet: "bg-primary shadow-[0_0_0_4px_rgba(142,114,255,0.18)]",
  volt: "bg-volt shadow-[0_0_0_4px_rgba(217,255,63,0.16)]",
  ok: "bg-ok shadow-[0_0_0_4px_rgba(63,221,154,0.18)]",
  warn: "bg-warn shadow-[0_0_0_4px_rgba(255,184,77,0.18)]",
  err: "bg-err shadow-[0_0_0_4px_rgba(255,97,120,0.18)]",
  info: "bg-info shadow-[0_0_0_4px_rgba(99,190,255,0.18)]",
  muted: "bg-text-3 shadow-[0_0_0_4px_rgba(255,255,255,0.06)]",
};

export function Badge({ tone, children, className }: { tone: BadgeTone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2 py-0.5 text-[11px] font-display font-bold leading-[16px]",
        TONE_BADGE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
