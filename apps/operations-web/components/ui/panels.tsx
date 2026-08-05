"use client";

import type { ReactNode } from "react";
import { Lock } from "lucide-react";
import { cn } from "@/lib/format";
import { Fade } from "@/components/motion/Motion";
import { Badge } from "@/components/ui/primitives";

export function Card({ children, className, glass = true }: { children: ReactNode; className?: string; glass?: boolean }) {
  return (
    <div className={cn("rounded-panel", glass ? "glass p-5" : "solid p-5", className)}>{children}</div>
  );
}

export function PanelHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h3 className="text-base font-semibold text-ink-lum">{title}</h3>
        {sub && <p className="mt-0.5 text-sm text-ink-mut">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({
  label,
  value,
  delta,
  tone = "default",
}: {
  label: string;
  value: string;
  delta?: string;
  tone?: "default" | "warm" | "ok" | "danger";
}) {
  const toneText =
    tone === "warm" ? "text-[#ffd28a]" : tone === "ok" ? "text-[#5fd7a3]" : tone === "danger" ? "text-[#ff8f86]" : "text-ink-lum";
  return (
    <div>
      <div className="overline">{label}</div>
      <div className={cn("mt-2 text-[26px] leading-none font-semibold tabular tracking-tight", toneText)}>{value}</div>
      {delta && <div className="mt-2 text-xs text-ink-mut">{delta}</div>}
    </div>
  );
}

export function EmptyState({ title, line }: { title: string; line: string }) {
  return (
    <Fade className="flex flex-col items-center justify-center gap-3 rounded-panel solid px-6 py-16 text-center">
      <span className="mark h-10 w-10" />
      <p className="text-sm font-medium text-ink-lum">{title}</p>
      <p className="max-w-sm text-sm text-ink-mut">{line}</p>
    </Fade>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="overline mb-3">{children}</div>;
}

/** "This door isn't yours." — the access boundary, rendered as light, not a wall. */
export function PermissionDenied({ module }: { module: string }) {
  return (
    <Fade className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-4 text-center">
      <span className="mark flex h-12 w-12 items-center justify-center">
        <Lock className="h-5 w-5 text-[#9db4ff]" />
      </span>
      <div>
        <p className="text-lg font-semibold text-ink-lum">This door isn&apos;t yours.</p>
        <p className="mt-1 text-sm text-ink-mut">
          Your current position can&apos;t open <span className="text-ink-sec">{module}</span>.
          <br />
          Ask your manager to widen the scope, or switch position with the role simulator.
        </p>
      </div>
      <Badge className="border border-white/8 bg-white/4 text-ink-mut">Access scoped by position</Badge>
    </Fade>
  );
}
