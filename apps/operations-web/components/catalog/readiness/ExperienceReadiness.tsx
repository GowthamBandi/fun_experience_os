"use client";

import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import type { CatalogReadinessItem } from "@/lib/prototype/selectors/catalog";

export interface ExperienceReadinessProps {
  status: "complete" | "needs-attention" | "blocked";
  items: CatalogReadinessItem[];
  compact?: boolean;
}

export function ExperienceReadiness({ status, items, compact = false }: ExperienceReadinessProps) {
  const blockers = items.filter((i) => i.status === "blocked");
  const warnings = items.filter((i) => i.status === "needs-attention");
  const complete = items.filter((i) => i.status === "complete");

  return (
    <div className="glass p-5 rounded-2xl border border-slate-200 space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-bold text-ink-lum flex items-center gap-2">
            {status === "complete" ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : status === "needs-attention" ? (
              <AlertTriangle className="w-4 h-4 text-amber-600" />
            ) : (
              <XCircle className="w-4 h-4 text-rose-600" />
            )}
            <span>Scheduling Readiness Checklist</span>
          </h3>
          <p className="text-xs text-ink-mut">
            {status === "complete"
              ? "All required operational settings are configured. Ready to schedule."
              : `${blockers.length} blocker(s), ${warnings.length} item(s) need attention.`}
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-2 py-0.5 rounded bg-emerald-200 text-emerald-600 border border-emerald-300">
            {complete.length} Passed
          </span>
          {blockers.length > 0 && (
            <span className="px-2 py-0.5 rounded bg-rose-200 text-rose-600 border border-rose-300">
              {blockers.length} Blocked
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs ${
              item.status === "blocked"
                ? "bg-rose-100 border-rose-300 text-rose-700"
                : item.status === "needs-attention"
                ? "bg-amber-100 border-amber-300 text-amber-700"
                : "bg-slate-50 border-slate-200 text-ink-sec"
            }`}
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">
                {item.status === "complete" ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                ) : item.status === "needs-attention" ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-rose-600" />
                )}
              </div>
              <div>
                <span className="font-semibold text-ink-lum">{item.label}</span>
                {item.missingText && <p className="text-[11px] opacity-80 mt-0.5">{item.missingText}</p>}
              </div>
            </div>

            {item.actionHref && item.actionLabel && item.status !== "complete" && (
              <Link href={item.actionHref} className="shrink-0">
                <Button variant="secondary" className="h-6 text-[11px] px-2 font-bold">
                  {item.actionLabel}
                  <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
