"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/format";

/* ------------------------------- button ------------------------------- */

type Variant = "primary" | "secondary" | "ghost" | "danger" | "lamp" | "success" | "warning";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary:
    "bg-brand text-white shadow-brand hover:bg-brand-hover active:translate-y-px",
  secondary:
    "bg-white text-ink-lum border border-edge-strong shadow-lift hover:border-[#b9c0d3] hover:bg-bg-sunken",
  ghost:
    "text-ink-sec hover:text-ink-lum hover:bg-slate-100",
  danger:
    "bg-danger text-white shadow-lift hover:bg-red-600",
  lamp:
    "bg-brand-subtle text-brand-ink hover:bg-[#e3dfff]",
  success:
    "bg-emerald-600 text-white shadow-lift hover:bg-emerald-700",
  warning:
    "bg-amber-500 text-white shadow-lift hover:bg-amber-600",
};

const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-xs rounded-lg",
  md: "h-10 px-4 text-sm rounded-xl",
  lg: "h-12 px-5 text-sm rounded-xl",
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  type = "button",
  ...rest
}: { variant?: Variant; size?: Size; className?: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold whitespace-nowrap",
        "transition-all duration-200 ease-light focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/20",
        "disabled:opacity-45 disabled:pointer-events-none",
        sizeClass[size],
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
  type = "button",
  ...rest
}: { label: string; className?: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex items-center justify-center h-9 w-9 rounded-xl text-ink-mut",
        "hover:text-ink-lum hover:bg-slate-100 transition-colors duration-150",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/20",
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

export const TONES = {
  neutral: "text-slate-600 bg-slate-100 border-slate-200",
  info: "text-indigo-700 bg-indigo-50 border-indigo-200",
  sky: "text-sky-700 bg-sky-50 border-sky-200",
  ok: "text-emerald-700 bg-emerald-50 border-emerald-200",
  warn: "text-amber-700 bg-amber-50 border-amber-200",
  danger: "text-red-700 bg-red-50 border-red-200",
  brand: "text-violet-700 bg-violet-50 border-violet-200",
  pink: "text-pink-700 bg-pink-50 border-pink-200",
} as const;

export type Tone = keyof typeof TONES;

const STATUS_TONE: Record<string, Tone> = {
  draft: "neutral", scheduled: "info", published: "info", open: "ok", "booking-open": "ok",
  "almost-full": "warn", full: "danger", "booking-closed": "warn", "reveal-pending": "warn",
  revealed: "brand", "check-in-open": "ok", closing: "warn", live: "brand", closed: "neutral",
  completed: "ok", archived: "neutral", cancelled: "danger", "cancelled-user": "danger",
  "cancelled-company": "danger", active: "ok", inactive: "neutral", suspended: "danger",
  disabled: "neutral", reserved: "info", "payment-pending": "warn", "payment-confirmed": "ok",
  "payment-failed": "danger", "reservation-expired": "neutral", expired: "neutral",
  released: "neutral", converted: "ok", "offer-hold": "warn", waitlisted: "warn",
  "waitlist-offered": "brand", "waitlist-joined": "warn", "waitlist-promoted": "brand",
  complimentary: "sky", confirmed: "info", "checked-in": "ok", late: "warn", "no-show": "danger",
  denied: "danger", expected: "neutral", refunded: "sky", reported: "info", acknowledged: "info",
  triaged: "warn", investigating: "warn", escalated: "danger", monitoring: "warn",
  reviewing: "warn", "under-review": "warn", resolved: "ok", ready: "ok", maintenance: "warn",
  unavailable: "neutral", low: "ok", medium: "warn", high: "danger", critical: "danger",
  settled: "ok", pending: "warn", failed: "danger", initiated: "info", reconciled: "ok",
  requested: "info", approved: "ok", rejected: "danger", processing: "sky", payment: "neutral",
  refund: "info", promo: "brand", adjustment: "neutral", available: "ok", assigned: "info",
  off: "neutral", upcoming: "info", paused: "neutral", join: "ok", strike: "brand", alert: "danger",
  close: "neutral", system: "info", generated: "info", locked: "brand", revoked: "danger",
  "not-generated": "neutral", allocated: "info", verified: "ok", submitted: "info",
  "evidence-requested": "warn", "decision-pending": "warn", upheld: "ok",
  "partially-upheld": "warn", "action-proposed": "warn", proposed: "warn",
  recommended: "info", "teams-ready": "info", "bracket-ready": "info",
  "awaiting-verification": "warn", walkover: "neutral", abandoned: "danger",
  disqualified: "danger", ended: "neutral", emergency: "danger", opening: "info", ending: "warn",
  planned: "neutral", skipped: "neutral", corrected: "warn", disputed: "danger",
};

/** Kept for callers that index tone strings directly. */
export const statusTone: Record<string, string> = Object.fromEntries(
  Object.entries(STATUS_TONE).map(([k, t]) => [k, TONES[t]]),
);

export function toneFor(value: string): Tone {
  return STATUS_TONE[value] ?? STATUS_TONE[value.toLowerCase().replace(/\s+/g, "-")] ?? "neutral";
}

export function StatusChip({ value, dot = true, tone, className }: { value: string; dot?: boolean; tone?: Tone; className?: string }) {
  const t = tone ?? toneFor(value);
  return (
    <Badge className={cn("border whitespace-nowrap", TONES[t], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      <span className="capitalize">{value.replace(/-/g, " ")}</span>
    </Badge>
  );
}

/* -------------------------------- toggle ------------------------------ */

export function Toggle({ on, onToggle, label, disabled }: { on: boolean; onToggle: () => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 ease-light disabled:opacity-50",
        on ? "bg-brand" : "bg-slate-300",
      )}
    >
      <span
        className={cn(
          "inline-block h-[18px] w-[18px] transform rounded-full bg-white shadow-lift transition-transform duration-200 ease-light",
          on ? "translate-x-[23px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

/* -------------------------------- avatar ------------------------------ */

const AVATAR_GRADIENTS = [
  "from-violet-500 to-indigo-500",
  "from-sky-500 to-cyan-400",
  "from-pink-500 to-rose-400",
  "from-amber-500 to-orange-400",
  "from-emerald-500 to-teal-400",
  "from-fuchsia-500 to-purple-500",
];

export function Avatar({ initials, size = "md" }: { initials: string; size?: "sm" | "md" | "lg" }) {
  const sz = size === "lg" ? "h-10 w-10 text-sm" : size === "sm" ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-xs";
  const hash = [...initials].reduce((a, c) => a + c.charCodeAt(0), 0);
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold tracking-wide text-white",
        "bg-gradient-to-br ring-2 ring-white shadow-lift",
        AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length],
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
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100", className)}>
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500 ease-light",
          danger ? "bg-gradient-to-r from-rose-500 to-red-500" : near ? "bg-gradient-to-r from-amber-400 to-orange-500" : "bg-gradient-to-r from-emerald-400 to-teal-500",
        )}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

/* ------------------------------ skeleton ------------------------------ */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-lg", className)} aria-hidden />;
}
