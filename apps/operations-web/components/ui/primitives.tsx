"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/format";

/* ------------------------------- button ------------------------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "lamp";

const variantClass: Record<Variant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-hover shadow-lift focus-visible:ring-brand/60",
  secondary:
    "glass-surface text-ink-lum hover:border-white/20",
  ghost:
    "text-ink-sec hover:text-ink-lum hover:bg-white/5",
  danger:
    "bg-danger/90 text-white hover:bg-danger",
  lamp:
    "bg-white/5 text-ink-mut border border-edge hover:text-ink-lum hover:bg-white/8",
};

export function Button({
  variant = "primary",
  className,
  children,
  ...rest
}: { variant?: Variant; className?: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl px-4 h-10 text-sm font-medium",
        "transition-all duration-200 ease-light focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-0",
        "disabled:opacity-40 disabled:pointer-events-none",
        variantClass[variant],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export function IconButton({
  label,
  className,
  children,
  ...rest
}: { label: string; className?: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center h-9 w-9 rounded-xl text-ink-sec",
        "hover:text-ink-lum hover:bg-white/5 transition-colors duration-150",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/60",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* -------------------------------- badge ------------------------------- */

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

/* ----------------------------- status chip ---------------------------- */

export const statusTone: Record<string, string> = {
  draft: "text-ink-mut bg-white/4 border-white/6",
  scheduled: "text-[#9db4ff] bg-[#4c6fff]/12 border-[#4c6fff]/25",
  open: "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25",
  closing: "text-[#ffc46b] bg-[#f79009]/12 border-[#f79009]/25",
  live: "text-[#ffd28a] bg-[#f7b955]/14 border-[#f7b955]/30",
  closed: "text-ink-sec bg-white/4 border-white/8",
  cancelled: "text-[#ff8f86] bg-[#f04438]/12 border-[#f04438]/25",
  confirmed: "text-[#9db4ff] bg-[#4c6fff]/12 border-[#4c6fff]/25",
  "checked-in": "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25",
  "no-show": "text-[#ff8f86] bg-[#f04438]/12 border-[#f04438]/25",
  reviewing: "text-[#ffc46b] bg-[#f79009]/12 border-[#f79009]/25",
  resolved: "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25",
  ready: "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25",
  maintenance: "text-[#ffc46b] bg-[#f79009]/12 border-[#f79009]/25",
  low: "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25",
  medium: "text-[#ffc46b] bg-[#f79009]/12 border-[#f79009]/25",
  high: "text-[#ff8f86] bg-[#f04438]/12 border-[#f04438]/25",
  settled: "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25",
  pending: "text-[#ffc46b] bg-[#f79009]/12 border-[#f79009]/25",
  failed: "text-[#ff8f86] bg-[#f04438]/12 border-[#f04438]/25",
  payment: "text-ink-lum bg-white/4 border-white/8",
  refund: "text-[#9db4ff] bg-[#4c6fff]/12 border-[#4c6fff]/25",
  promo: "text-[#ffd28a] bg-[#f7b955]/14 border-[#f7b955]/30",
  adjustment: "text-ink-sec bg-white/4 border-white/8",
  available: "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25",
  assigned: "text-[#9db4ff] bg-[#4c6fff]/12 border-[#4c6fff]/25",
  off: "text-ink-mut bg-white/4 border-white/6",
  upcoming: "text-[#9db4ff] bg-[#4c6fff]/12 border-[#4c6fff]/25",
  paused: "text-ink-mut bg-white/4 border-white/6",
  join: "text-[#5fd7a3] bg-[#12b76a]/12 border-[#12b76a]/25",
  strike: "text-[#ffd28a] bg-[#f7b955]/14 border-[#f7b955]/30",
  alert: "text-[#ff8f86] bg-[#f04438]/12 border-[#f04438]/25",
  close: "text-ink-sec bg-white/4 border-white/8",
  system: "text-[#9db4ff] bg-[#4c6fff]/12 border-[#4c6fff]/25",
};

export function StatusChip({ value, dot = true }: { value: string; dot?: boolean }) {
  const tone = statusTone[value] ?? statusTone.draft;
  return (
    <Badge className={cn("border", tone)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current animate-breath" />}
      <span className="capitalize">{value.replace("-", " ")}</span>
    </Badge>
  );
}

/* -------------------------------- toggle ------------------------------ */

export function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-light",
        on ? "bg-brand" : "bg-white/10",
      )}
    >
      <span
        className={cn(
          "inline-block h-4.5 w-4.5 h-[18px] w-[18px] transform rounded-full bg-white shadow-lift transition-transform duration-200 ease-light",
          on ? "translate-x-[24px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

/* -------------------------------- avatar ------------------------------ */

const avatarHue: Record<string, string> = {
  AR: "from-[#5a67f5]/60 to-[#5a67f5]/20",
  MK: "from-[#4c6fff]/60 to-[#4c6fff]/20",
  DP: "from-[#f7b955]/60 to-[#f7b955]/20",
  NF: "from-[#12b76a]/60 to-[#12b76a]/20",
  RT: "from-[#f79009]/60 to-[#f79009]/20",
};

export function Avatar({ initials, size = "md" }: { initials: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "lg" ? "h-10 w-10 text-sm" : size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full font-semibold tracking-wide",
        "bg-gradient-to-br text-white shadow-lift ring-1 ring-white/10",
        avatarHue[initials] ?? "from-white/20 to-white/5",
        sz,
      )}
    >
      {initials}
    </span>
  );
}

/* ------------------------------ progress ------------------------------ */

export function FillMeter({ value, className }: { value: number; className?: string }) {
  const danger = value >= 100;
  const near = value >= 85 && value < 100;
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-white/8 overflow-hidden", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500 ease-light",
          danger ? "bg-danger" : near ? "bg-[#f79009]" : "bg-[#12b76a]",
        )}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}
