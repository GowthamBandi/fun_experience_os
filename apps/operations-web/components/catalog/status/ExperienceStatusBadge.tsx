"use client";

import { StatusChip, type Tone } from "@/components/ui/primitives";

export interface ExperienceStatusBadgeProps {
  status: "complete" | "needs-attention" | "blocked" | "ready" | "draft" | "active" | "paused" | "incomplete";
  size?: "sm" | "md";
}

const LABEL: Record<ExperienceStatusBadgeProps["status"], [string, Tone]> = {
  complete: ["ready to schedule", "ok"],
  ready: ["ready to schedule", "ok"],
  active: ["active", "ok"],
  "needs-attention": ["needs attention", "warn"],
  incomplete: ["incomplete", "warn"],
  draft: ["draft", "neutral"],
  paused: ["paused", "neutral"],
  blocked: ["blocked", "danger"],
};

/** Scheduling readiness of an experience, as a status chip. */
export function ExperienceStatusBadge({ status, size = "md" }: ExperienceStatusBadgeProps) {
  const [label, tone] = LABEL[status] ?? [status, "neutral"];
  return <StatusChip value={label} tone={tone} className={size === "sm" ? "text-[11px]" : undefined} />;
}
