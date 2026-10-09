"use client";

import { cn } from "@/lib/format";
import { currentAppEnvironment, type AppEnvironmentId } from "@/lib/firebase/environment";

type Tone = "info" | "warn" | "err";

const LOOK: Record<Exclude<AppEnvironmentId, "unconfigured">, { label: string; tone: Tone }> = {
  emulator: { label: "Emulator", tone: "info" },
  staging: { label: "Staging", tone: "warn" },
  production: { label: "Production", tone: "err" },
  undeclared: { label: "Live · undeclared", tone: "warn" },
};

const TONE: Record<Tone, { pill: string; dot: string }> = {
  info: { pill: "border-[rgba(99,190,255,0.32)] bg-[rgba(99,190,255,0.12)] text-info", dot: "bg-info" },
  warn: { pill: "border-[rgba(255,184,77,0.32)] bg-[rgba(255,184,77,0.12)] text-warn", dot: "bg-warn" },
  err: { pill: "border-[rgba(255,97,120,0.4)] bg-[rgba(255,97,120,0.14)] text-err", dot: "bg-err animate-breath motion-reduce:animate-none" },
};

/** Which data the console is acting on: NEXT_PUBLIC_DATA_MODE / NEXT_PUBLIC_APP_ENV, inlined at build time. */
export function EnvBadge({ className }: { className?: string }) {
  const env = currentAppEnvironment();
  if (env.id === "unconfigured") return null;
  const { label, tone } = LOOK[env.id];
  return (
    <span
      data-testid="environment-badge"
      data-environment={env.id}
      title={env.projectId ? `Firebase project: ${env.projectId}` : undefined}
      className={cn(
        "inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-pill border px-2.5 font-display text-[11px] font-bold uppercase tracking-[0.08em]",
        TONE[tone].pill,
        className,
      )}
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", TONE[tone].dot)} />
      {label}
    </span>
  );
}
