"use client";

import type { ReactNode } from "react";
import { Inbox, Lock } from "lucide-react";
import { cn } from "@/lib/format";
import { Fade } from "@/components/motion/Motion";
import { Badge } from "@/components/ui/primitives";

export function Card({ children, className, glass = true }: { children: ReactNode; className?: string; glass?: boolean }) {
  return (
    <div className={cn("rounded-panel p-5", glass ? "glass" : "solid", className)}>{children}</div>
  );
}

export function PanelHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold text-ink-lum">{title}</h3>
        {sub && <p className="mt-0.5 text-sm text-ink-mut">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

const STAT_ACCENT = {
  default: { text: "text-ink-lum", bar: "from-violet-500 to-indigo-500" },
  warm: { text: "text-amber-600", bar: "from-amber-400 to-orange-500" },
  ok: { text: "text-emerald-600", bar: "from-emerald-400 to-teal-500" },
  danger: { text: "text-red-600", bar: "from-rose-500 to-red-500" },
  info: { text: "text-sky-600", bar: "from-sky-400 to-cyan-500" },
} as const;

export function Stat({
  label,
  value,
  delta,
  tone = "default",
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: keyof typeof STAT_ACCENT;
}) {
  const accent = STAT_ACCENT[tone];
  return (
    <div className="relative">
      <div className="overline">{label}</div>
      <div className={cn("mt-2 font-display text-[26px] leading-none font-bold tabular tracking-tight", accent.text)}>{value}</div>
      {delta && <div className="mt-2 text-xs text-ink-mut">{delta}</div>}
    </div>
  );
}

/** A KPI tile: white card, coloured icon chip, big number. */
export function MetricTile({
  label,
  value,
  detail,
  icon,
  tone = "violet",
  onClick,
}: {
  label: string;
  value: ReactNode;
  detail?: string;
  icon?: ReactNode;
  tone?: "violet" | "sky" | "emerald" | "amber" | "rose" | "pink";
  onClick?: () => void;
}) {
  const chip: Record<string, string> = {
    violet: "bg-violet-50 text-violet-600 ring-violet-100",
    sky: "bg-sky-50 text-sky-600 ring-sky-100",
    emerald: "bg-emerald-50 text-emerald-600 ring-emerald-100",
    amber: "bg-amber-50 text-amber-600 ring-amber-100",
    rose: "bg-rose-50 text-rose-600 ring-rose-100",
    pink: "bg-pink-50 text-pink-600 ring-pink-100",
  };
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      className={cn(
        "glass group rounded-panel p-5 text-left transition-all duration-200 ease-light",
        onClick && "hover:-translate-y-0.5 hover:shadow-panel focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/20",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-ink-sec">{label}</span>
        {icon && <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl ring-4", chip[tone])}>{icon}</span>}
      </div>
      <div className="mt-3 font-display text-[28px] font-bold leading-none tracking-tight text-ink-lum tabular">{value}</div>
      {detail && <p className="mt-2 text-xs text-ink-mut">{detail}</p>}
    </Tag>
  );
}

export function EmptyState({ title, line, action }: { title: string; line: string; action?: ReactNode }) {
  return (
    <Fade className="flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-edge-strong bg-white/70 px-6 py-14 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-subtle text-brand">
        <Inbox className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-ink-lum">{title}</p>
      <p className="max-w-sm text-sm text-ink-mut">{line}</p>
      {action}
    </Fade>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="overline mb-3">{children}</div>;
}

/** Shown when the signed-in operator's role does not include this module. */
export function PermissionDenied({ module }: { module: string }) {
  return (
    <Fade className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 ring-8 ring-amber-50/60">
        <Lock className="h-6 w-6" />
      </span>
      <div>
        <p className="font-display text-lg font-bold text-ink-lum">You don&apos;t have access to {module}</p>
        <p className="mt-1 max-w-md text-sm text-ink-mut">
          Your role doesn&apos;t include this module. Ask a Platform Owner to change your role in Access, or sign in with an
          operator who has it.
        </p>
      </div>
      <Badge className="border border-edge bg-white text-ink-mut">Access is scoped by role</Badge>
    </Fade>
  );
}
