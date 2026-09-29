"use client";

import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/format";

export interface WizardStep {
  label: string;
  sub?: string;
}

/** A numbered rail of steps beside a white form card. Completed steps can be revisited. */
export function WizardShell({
  steps,
  step,
  onStep,
  children,
  footer,
  className,
}: {
  steps: WizardStep[];
  step: number;
  onStep: (index: number) => void;
  children: ReactNode;
  footer: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-5 lg:grid-cols-[240px_1fr]", className)}>
      <nav aria-label="Steps" className="min-w-0">
        <ol className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
          {steps.map((s, i) => {
            const active = i === step;
            const done = i < step;
            return (
              <li key={s.label} className="shrink-0">
                <button
                  type="button"
                  onClick={done ? () => onStep(i) : undefined}
                  disabled={!done && !active}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors",
                    active ? "bg-white shadow-lift ring-1 ring-edge" : done ? "hover:bg-white/70" : "cursor-default opacity-70",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                      active ? "bg-brand text-white shadow-brand" : done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-ink-mut",
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block truncate text-[13px] font-semibold", active ? "text-ink-lum" : "text-ink-sec")}>{s.label}</span>
                    {s.sub && <span className="hidden truncate text-[11px] text-ink-mut lg:block">{s.sub}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="min-w-0 rounded-panel border border-edge bg-white p-5 shadow-panel sm:p-6">
        {children}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-edge pt-5">{footer}</div>
      </div>
    </div>
  );
}

/** Local wizard step navigation state. */
export function useWizard(total: number) {
  const [step, setStep] = useState(0);
  const next = () => setStep((s) => Math.min(total - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const jump = (i: number) => setStep(Math.max(0, Math.min(total - 1, i)));
  return { step, next, back, jump };
}
