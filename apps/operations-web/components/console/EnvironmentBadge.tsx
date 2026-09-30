"use client";

import { cn } from "@/lib/format";
import { currentAppEnvironment } from "@/lib/firebase/environment";

const TONE = {
  danger: "border-red-400/40 bg-red-500/15 text-red-100",
  warn: "border-amber-400/40 bg-amber-400/15 text-amber-100",
  info: "border-sky-400/40 bg-sky-400/10 text-sky-100",
  neutral: "border-white/15 bg-white/5 text-slate-300",
} as const;

/** Always-visible environment marker (production / staging / emulator). */
export function EnvironmentBadge({ className, showProject = true }: { className?: string; showProject?: boolean }) {
  const env = currentAppEnvironment();
  if (env.id === "unconfigured") return null;
  return (
    <span
      data-testid="environment-badge"
      data-environment={env.id}
      title={env.projectId ? `Firebase project: ${env.projectId}` : undefined}
      className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold uppercase tracking-[0.08em]", TONE[env.tone], className)}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", env.tone === "danger" ? "bg-red-400" : env.tone === "warn" ? "bg-amber-300" : env.tone === "info" ? "bg-sky-300" : "bg-slate-400")} aria-hidden />
      {env.label}
      {showProject && env.projectId && <span className="hidden font-mono font-normal normal-case tracking-normal opacity-70 lg:inline">· {env.projectId}</span>}
    </span>
  );
}
