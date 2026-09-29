"use client";

import { cn } from "@/lib/format";

export interface ExperienceStatusBadgeProps {
  status: "complete" | "needs-attention" | "blocked" | "ready" | "draft" | "active" | "paused" | "incomplete";
  size?: "sm" | "md";
}

export function ExperienceStatusBadge({ status, size = "md" }: ExperienceStatusBadgeProps) {
  let color = "border-emerald-200 bg-emerald-50 text-emerald-600";
  let label = "Ready to Schedule";

  if (status === "blocked") {
    color = "border-rose-200 bg-rose-50 text-rose-600";
    label = "Blocked";
  } else if (status === "needs-attention" || status === "draft") {
    color = "border-amber-200 bg-amber-50 text-amber-600";
    label = status === "draft" ? "Draft Setup" : "Needs Attention";
  } else if (status === "paused") {
    color = "border-slate-200 bg-slate-50 text-ink-mut";
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
