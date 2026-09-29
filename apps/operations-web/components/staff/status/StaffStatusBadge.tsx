"use client";

import { cn } from "@/lib/format";

export interface StaffStatusBadgeProps {
  status: "available" | "assigned" | "checked-in" | "off" | "late" | "ready" | "needs-attention" | "blocked" | "missing";
  size?: "sm" | "md";
}

export function StaffStatusBadge({ status, size = "md" }: StaffStatusBadgeProps) {
  let color = "border-emerald-200 bg-emerald-50 text-emerald-600";
  let label = "Available";

  if (status === "assigned") {
    color = "border-blue-200 bg-blue-50 text-blue-600";
    label = "Assigned";
  } else if (status === "checked-in") {
    color = "border-emerald-200 bg-emerald-50 text-emerald-600";
    label = "Checked In";
  } else if (status === "late" || status === "needs-attention") {
    color = "border-amber-200 bg-amber-50 text-amber-600";
    label = status === "late" ? "Late" : "Needs Attention";
  } else if (status === "off") {
    color = "border-slate-200 bg-slate-50 text-ink-mut";
    label = "Off Duty";
  } else if (status === "blocked" || status === "missing") {
    color = "border-rose-200 bg-rose-50 text-rose-600";
    label = status === "missing" ? "Missing Staff" : "Blocked";
  } else if (status === "ready") {
    color = "border-emerald-200 bg-emerald-50 text-emerald-600";
    label = "Ready";
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-semibold tracking-wide uppercase whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        color
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" />
      {label}
    </span>
  );
}
