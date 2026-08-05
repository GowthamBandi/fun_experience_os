"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { validatePrototypeState, validationSummary, type ValidationIssue } from "@/lib/prototype/validators";
import { ShieldAlert, ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/format";

const SEVERITY_TONE: Record<ValidationIssue["severity"], string> = {
  error: "text-red-400 border-red-400/30 bg-red-400/10",
  warning: "text-amber-300 border-amber-300/30 bg-amber-300/10",
  info: "text-sky-300 border-sky-300/20 bg-sky-300/5"
};

export function StateValidatorPanel() {
  const { state } = useStore();
  const [open, setOpen] = useState(false);

  const issues = useMemo(() => validatePrototypeState(state), [state]);
  const summary = useMemo(() => validationSummary(issues), [issues]);

  const healthy = summary.errors === 0;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex flex-col items-start">
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider shadow-lg backdrop-blur-md transition",
          healthy
            ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-300"
            : "border-red-400/30 bg-red-500/10 text-red-300"
        )}
        title="Cross-entity state validation (dev only)"
      >
        {healthy ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldAlert className="h-3.5 w-3.5" />}
        {summary.errors} err · {summary.warnings} warn
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
      </button>

      {open && (
        <div className="glass mt-2 w-[340px] rounded-panel border border-white/10 p-3 shadow-[0_32px_64px_rgba(0,0,0,0.5)] text-left">
          <p className="overline text-[9px] text-ink-mut">State validator · {issues.length} checks raised</p>
          {issues.length === 0 ? (
            <p className="mt-2 text-xs text-emerald-300">All cross-entity references, capacities and matches are consistent.</p>
          ) : (
            <div className="mt-2 max-h-64 space-y-1.5 overflow-y-auto">
              {issues.map((i, idx) => (
                <div
                  key={`${i.code}-${i.id}-${idx}`}
                  className={cn("rounded-md border px-2 py-1.5 text-[11px] leading-snug", SEVERITY_TONE[i.severity])}
                >
                  <span className="font-semibold uppercase tracking-wide">{i.code}</span>{" "}
                  <span className="opacity-90">{i.entity && <span className="font-medium">{i.entity}</span>}</span>
                  <span className="mt-0.5 block text-ink-sec">{i.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
