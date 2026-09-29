"use client";

import { cn } from "@/lib/format";

export interface CategoryStatusBadgeProps {
  status: "active" | "draft" | "paused" | "archived" | "complete" | "needs-attention" | "incomplete";
  size?: "sm" | "md";
}

export function CategoryStatusBadge({ status, size = "md" }: CategoryStatusBadgeProps) {
  let color = "border-emerald-200 bg-emerald-50 text-emerald-600";
  let label = "Active";

  if (status === "draft" || status === "needs-attention") {
    color = "border-amber-200 bg-amber-50 text-amber-600";
    label = status === "draft" ? "Draft" : "Needs Attention";
  } else if (status === "paused" || status === "incomplete") {
    color = "border-rose-200 bg-rose-50 text-rose-600";
    label = status === "paused" ? "Paused" : "Incomplete";
  } else if (status === "archived") {
    color = "border-slate-200 bg-slate-50 text-ink-mut";
    label = "Archived";
  } else if (status === "complete") {
    color = "border-emerald-200 bg-emerald-50 text-emerald-600";
    label = "Ready";
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
