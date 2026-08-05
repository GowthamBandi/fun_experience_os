"use client";

import { useState, type ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/format";

export interface WizardStep {
  label: string;
  sub?: string;
}

/** A numbered rail of steps — the wizard's spine. */
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
    <div className={cn("grid gap-6 lg:grid-cols-[220px_1fr]", className)}>
      <div className="order-2 lg:order-1">
        <ol className="flex flex-row gap-1 overflow-x-auto lg:flex-col lg:gap-0.5 lg:overflow-visible" aria-label="Wizard steps">
          {steps.map((s, i) => {
            const active = i === step;
            const done = i < step;
            const clickable = done;
            return (
              <li key={s.label} className="shrink-0">
                <button
                  type="button"
                  onClick={clickable ? () => onStep(i) : undefined}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
                    clickable ? "cursor-pointer hover:bg-white/4" : "cursor-default",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold",
                      active
                        ? "border-brand bg-brand/15 text-ink-lum"
                        : done
                          ? "border-[#12b76a]/40 bg-[#12b76a]/10 text-[#5fd7a3]"
                          : "border-white/10 text-ink-mut",
                    )}
                  >
                    {done ? <Check className="h-3 w-3" /> : i + 1}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block truncate text-xs font-medium", active ? "text-ink-lum" : "text-ink-sec")}>{s.label}</span>
                    {s.sub && <span className="block truncate text-[10px] text-ink-mut">{s.sub}</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="order-1 min-w-0 lg:order-2">
        <div className="glass rounded-panel p-5 md:p-6">
          {children}
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-white/5 pt-5">{footer}</div>
        </div>
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
