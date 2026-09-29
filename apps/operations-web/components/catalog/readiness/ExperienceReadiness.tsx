"use client";

import { AlertTriangle, ArrowRight, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/format";
import type { CatalogReadinessItem } from "@/lib/prototype/selectors/catalog";
import { LinkButton } from "@/components/setup/kit";

export interface ExperienceReadinessProps {
  status: "complete" | "needs-attention" | "blocked";
  items: CatalogReadinessItem[];
  compact?: boolean;
}

/** What must be in place before an experience can be scheduled. */
export function ExperienceReadiness({ status, items, compact = false }: ExperienceReadinessProps) {
  const blockers = items.filter((i) => i.status === "blocked").length;
  const warnings = items.filter((i) => i.status === "needs-attention").length;
  const shown = compact ? items.filter((i) => i.status !== "complete") : items;
  return (
    <section className="rounded-panel border border-edge bg-white shadow-panel">
      <header className="flex items-start gap-3 border-b border-edge px-5 py-4">
        {status === "complete" ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600" /> : status === "needs-attention" ? <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-600" /> : <XCircle className="mt-0.5 h-5 w-5 text-red-600" />}
        <div>
          <h3 className="font-display text-[15px] font-bold text-ink-lum">Ready to schedule?</h3>
          <p className="text-[13px] text-ink-mut">
            {status === "complete" ? "Everything needed is in place." : `${blockers} blocking, ${warnings} to review.`}
          </p>
        </div>
      </header>
      <ul className="divide-y divide-slate-100 px-5">
        {shown.length === 0 && <li className="py-4 text-sm text-ink-mut">Nothing outstanding.</li>}
        {shown.map((item) => (
          <li key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2.5">
              {item.status === "complete" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : item.status === "needs-attention" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
              <div>
                <p className={cn("text-sm font-medium", item.status === "complete" ? "text-ink-sec" : "text-ink-lum")}>{item.label}</p>
                {item.missingText && item.status !== "complete" && <p className="text-xs text-ink-mut">{item.missingText}</p>}
              </div>
            </div>
            {item.actionHref && item.actionLabel && item.status !== "complete" && (
              <LinkButton href={item.actionHref} variant="secondary" size="sm" className="self-start sm:self-auto">
                {item.actionLabel} <ArrowRight className="h-3.5 w-3.5" />
              </LinkButton>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
