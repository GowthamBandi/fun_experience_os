"use client";

import { cn } from "@/lib/format";

export interface ExperienceStatusBadgeProps {
  status: "complete" | "needs-attention" | "blocked" | "ready" | "draft" | "active" | "paused" | "incomplete";
  size?: "sm" | "md";
}

export function ExperienceStatusBadge({ status, size = "md" }: ExperienceStatusBadgeProps) {
  let color = "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  let label = "Ready to Schedule";

  if (status === "blocked") {
    color = "border-rose-500/30 bg-rose-500/10 text-rose-400";
    label = "Blocked";
  } else if (status === "needs-attention" || status === "draft") {
    color = "border-amber-500/30 bg-amber-500/10 text-amber-400";
    label = status === "draft" ? "Draft Setup" : "Needs Attention";
  } else if (status === "paused") {
    color = "border-white/10 bg-white/5 text-ink-mut";
    label = "Paused";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide uppercase",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        color
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}
