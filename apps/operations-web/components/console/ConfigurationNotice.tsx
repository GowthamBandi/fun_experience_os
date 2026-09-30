"use client";

import { Settings2 } from "lucide-react";
import type { DataModeProblem } from "@/lib/firebase/data-mode";

/** Explicit, actionable configuration failure. The console never falls back to fake auth. */
export function ConfigurationNotice({ problem }: { problem: DataModeProblem }) {
  return (
    <div role="alert" data-testid="configuration-notice" className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-5 text-left">
      <p className="flex items-center gap-2 text-sm font-semibold text-amber-100"><Settings2 className="h-4 w-4" />{problem.title}</p>
      <p className="mt-2 text-sm leading-6 text-amber-50">{problem.message}</p>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-xs leading-5 text-amber-100/80">
        {problem.steps.map((step) => <li key={step}>{step}</li>)}
      </ul>
      <p className="mt-3 text-[11px] text-amber-100/60">Sign-in is disabled until this is fixed (fail-closed).</p>
    </div>
  );
}
