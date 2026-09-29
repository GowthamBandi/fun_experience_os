"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, Check, X } from "lucide-react";
import { cn, inr } from "@/lib/format";
import type { TemplateIssue, VenueCompatResult } from "@/lib/prototype/repositories";

/** Live validation + schedulability panel for a template. */
export function ReadinessPanel({
  issues,
  ready,
  schedulable,
  scheduleNote,
}: {
  issues: TemplateIssue[];
  ready: boolean;
  schedulable: boolean;
  scheduleNote?: string;
}) {
  return (
    <div className="solid rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
            ready
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700",
          )}
        >
          {ready ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
          {ready ? "Validation passed" : "Needs work"}
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
            schedulable
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700",
          )}
        >
          {schedulable ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
          {schedulable ? "Schedulable" : "Not schedulable"}
        </span>
        {scheduleNote && !schedulable && <span className="text-xs text-ink-mut">{scheduleNote}</span>}
      </div>
      {issues.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {issues.map((issue, i) => (
            <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
              <span className={cn("mt-0.5 shrink-0 font-bold", issue.level === "error" ? "text-red-700" : "text-amber-700")}>
                {issue.level === "error" ? "✕" : "!"}
              </span>
              <span className="text-ink-sec">{issue.message}</span>
              <span className="ml-auto shrink-0 rounded bg-slate-50 px-1.5 py-px text-[10px] uppercase tracking-wide text-ink-mut">
                {issue.field}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Venue compatibility list with reasons. */
export function CompatList({ rows, empty }: { rows: VenueCompatResult[]; empty?: string }) {
  if (rows.length === 0) return <p className="text-sm text-ink-mut">{empty ?? "No venues evaluated."}</p>;
  return (
    <div className="space-y-1.5">
      {rows.map((r) => (
        <div key={r.venueId} className="solid flex items-start justify-between gap-3 rounded-xl px-3 py-2">
          <div className="min-w-0">
            <Link href={`/locations/venues/${r.venueId}`} className="text-sm font-medium text-ink-lum hover:text-brand">
              {r.venueName}
            </Link>
            <p className="text-[11px] text-ink-mut">
              {r.territoryId.replace("-", " ")} · {r.cityId}
            </p>
            {!r.compatible && r.reasons.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {r.reasons.map((reason, i) => (
                  <li key={i} className="text-[11px] text-ink-mut">
                    · {reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              r.compatible
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-slate-50 text-ink-mut",
            )}
          >
            {r.compatible ? "Compatible" : "Blocked"}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Economics strip — the finance lane view. */
export function EconomicsPanel({ eco }: { eco: { basePrice: number; venueCost: number; equipmentCost: number; staffingCost: number; fixedCosts: number; revenueAtTarget: number; revenueAtMin: number; breakEvenParticipants: number; netAtTarget: number; netAtMin: number; marginPct: number } }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="solid rounded-xl p-3">
        <p className="overline">Unit price</p>
        <p className="mt-1 text-lg font-semibold tabular text-ink-lum">{inr(eco.basePrice)}</p>
      </div>
      <div className="solid rounded-xl p-3">
        <p className="overline">Fixed cost / session</p>
        <p className="mt-1 text-lg font-semibold tabular text-ink-lum">{inr(eco.fixedCosts)}</p>
      </div>
      <div className="solid rounded-xl p-3">
        <p className="overline">Break-even participants</p>
        <p className={cn("mt-1 text-lg font-semibold tabular", eco.breakEvenParticipants <= 4 ? "text-emerald-700" : "text-amber-700")}>
          {eco.breakEvenParticipants}
        </p>
      </div>
      <div className="solid rounded-xl p-3">
        <p className="overline">Margin at target</p>
        <p className={cn("mt-1 text-lg font-semibold tabular", eco.marginPct < 20 ? "text-red-700" : eco.marginPct < 40 ? "text-amber-700" : "text-emerald-700")}>
          {eco.marginPct}%
        </p>
      </div>
      <div className="col-span-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] text-ink-mut md:col-span-4">
        Revenue at target {inr(eco.revenueAtTarget)} · at minimum {inr(eco.revenueAtMin)} · net at target{" "}
        {inr(eco.netAtTarget)} · net at minimum {inr(eco.netAtMin)}
      </div>
    </div>
  );
}

/** Small stat card reused across catalog pages. */
export function StatCard({ label, value, tone, hint }: { label: string; value: ReactNode; tone?: "ok" | "warm" | "danger"; hint?: string }) {
  const color =
    tone === "ok" ? "text-emerald-700" : tone === "warm" ? "text-amber-700" : tone === "danger" ? "text-red-700" : "text-ink-lum";
  return (
    <div className="glass rounded-panel p-5">
      <p className="overline">{label}</p>
      <p className={cn("mt-2 text-[26px] font-semibold leading-none tabular tracking-tight", color)}>{value}</p>
      {hint && <p className="mt-2 text-xs text-ink-mut">{hint}</p>}
    </div>
  );
}
