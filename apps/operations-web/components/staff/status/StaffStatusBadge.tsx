"use client";

import { cn } from "@/lib/format";

export interface StaffStatusBadgeProps {
  status: "available" | "assigned" | "checked-in" | "off" | "late" | "ready" | "needs-attention" | "blocked" | "missing";
  size?: "sm" | "md";
}

export function StaffStatusBadge({ status, size = "md" }: StaffStatusBadgeProps) {
  let color = "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
  let label = "Available";

  if (status === "assigned") {
    color = "border-blue-500/30 bg-blue-500/10 text-blue-400";
    label = "Assigned";
  } else if (status === "checked-in") {
    color = "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
    label = "Checked In";
  } else if (status === "late" || status === "needs-attention") {
    color = "border-amber-500/30 bg-amber-500/10 text-amber-400";
    label = status === "late" ? "Late" : "Needs Attention";
  } else if (status === "off") {
    color = "border-white/10 bg-white/5 text-ink-mut";
    label = "Off Duty";
  } else if (status === "blocked" || status === "missing") {
    color = "border-rose-500/30 bg-rose-500/10 text-rose-400";
    label = status === "missing" ? "Missing Staff" : "Blocked";
  } else if (status === "ready") {
    color = "border-emerald-500/30 bg-emerald-500/10 text-emerald-400";
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
