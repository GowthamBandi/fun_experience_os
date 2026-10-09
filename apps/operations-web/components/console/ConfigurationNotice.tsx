"use client";

import { Settings2 } from "lucide-react";
import type { DataModeProblem } from "@/lib/firebase/data-mode";

/** Explicit, actionable configuration failure. The console never falls back to fake auth. */
export function ConfigurationNotice({ problem }: { problem: DataModeProblem }) {
  return (
    <div role="alert" data-testid="configuration-notice" className="glass rounded-card border-[rgba(255,184,77,0.35)] bg-[rgba(255,184,77,0.08)] p-5 text-left">
      <p className="flex items-center gap-2 font-display text-[15px] font-bold text-warn"><Settings2 aria-hidden className="h-4 w-4" />{problem.title}</p>
      <p className="mt-2 text-[14px] leading-6 text-text">{problem.message}</p>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[12px] leading-5 text-text-2">
        {problem.steps.map((step) => <li key={step}>{step}</li>)}
      </ul>
      <p className="mt-3 text-[12px] text-text-3">Sign-in is disabled until this is fixed (fail-closed).</p>
    </div>
  );
}
