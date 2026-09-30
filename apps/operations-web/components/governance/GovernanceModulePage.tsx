"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, Filter, RefreshCw, Search, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/format";
import type { DisplayRecord } from "@/lib/console/records";

export type GovernanceRecord = DisplayRecord;

const tone: Record<GovernanceRecord["status"], string> = {
  Approved: "border-emerald-400/20 bg-emerald-400/8 text-emerald-300",
  Pending: "border-amber-400/20 bg-amber-400/8 text-amber-300",
  Paused: "border-slate-400/20 bg-slate-400/8 text-slate-300",
  Blocked: "border-red-400/25 bg-red-400/8 text-red-300",
  "Under review": "border-blue-400/20 bg-blue-400/8 text-blue-300",
  "On hold": "border-red-400/25 bg-red-400/8 text-red-300",
  Hidden: "border-slate-400/20 bg-slate-400/8 text-slate-400",
};

const STATUS_OPTIONS = Object.keys(tone) as GovernanceRecord["status"][];

export function GovernanceModulePage({
  eyebrow,
  title,
  description,
  metricLabel,
  metricValue,
  records,
  primaryAction,
  loading = false,
  error = null,
  onAction,
  actionLabel,
  headerAction,
  truncated = false,
  onRetry,
  emptyMessage = "No records match these filters.",
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  metricLabel: string;
  metricValue: string;
  records: GovernanceRecord[];
  primaryAction: string;
  loading?: boolean;
  error?: string | null;
  onAction?: (record: GovernanceRecord) => void;
  actionLabel?: (record: GovernanceRecord) => string;
  headerAction?: ReactNode;
  truncated?: boolean;
  onRetry?: () => void;
  emptyMessage?: string;
  children?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("All");
  const filtered = useMemo(() => records.filter((record) => {
    const matchesQuery = `${record.primary} ${record.secondary} ${record.id}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (status === "All" || record.status === status);
  }), [query, records, status]);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-7 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-white/8 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="overline">{eyebrow}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-white">{title}</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">{description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {headerAction}
          <div className="flex items-center gap-3 rounded-xl border border-white/8 bg-[#111925] px-4 py-3">
            <ShieldCheck className="h-5 w-5 text-indigo-300" />
            <div><p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">{metricLabel}</p><p className="tabular text-lg font-semibold text-slate-100">{metricValue}{truncated ? "+" : ""}</p></div>
          </div>
        </div>
      </header>
      {children}

      <section className="mt-5 overflow-hidden rounded-2xl border border-white/8 bg-[#101823]">
        <div className="flex flex-col gap-3 border-b border-white/8 p-4 sm:flex-row sm:items-center">
          <label className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${title.toLowerCase()}…`} className="h-10 w-full rounded-xl border border-white/8 bg-[#0b121c] pl-10 pr-3 text-sm text-slate-200 outline-none placeholder:text-slate-600 focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/10" /></label>
          <label className="relative"><Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><select value={status} onChange={(event) => setStatus(event.target.value)} className="h-10 appearance-none rounded-xl border border-white/8 bg-[#0b121c] pl-10 pr-9 text-sm text-slate-300 outline-none focus:border-indigo-400/60"><option>All</option>{STATUS_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select></label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead><tr className="border-b border-white/8 text-[10px] uppercase tracking-[0.11em] text-slate-500"><th className="px-5 py-3 font-medium">Record</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Commercial / exposure</th><th className="px-4 py-3 font-medium">Context</th><th className="px-5 py-3 text-right font-medium">Action</th></tr></thead>
            <tbody>{filtered.map((record) => <tr key={record.id} className="border-b border-white/7 last:border-0 hover:bg-white/[0.025]"><td className="px-5 py-4"><p className="text-sm font-medium text-slate-100">{record.primary}</p><p className="mt-1 text-xs text-slate-500">{record.secondary} · #{record.id}</p></td><td className="px-4 py-4"><span className={cn("inline-flex rounded-full border px-2.5 py-1 text-xs font-medium", tone[record.status])}>{record.status}</span></td><td className="tabular px-4 py-4 text-sm font-medium text-slate-200">{record.value}</td><td className="px-4 py-4 text-xs text-slate-500">{record.meta}</td><td className="px-5 py-4 text-right"><button onClick={() => onAction?.(record)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/10 px-3 text-xs font-semibold text-slate-200 hover:border-indigo-400/40 hover:bg-indigo-400/5 hover:text-white">{actionLabel ? actionLabel(record) : primaryAction}<ArrowUpRight className="h-3.5 w-3.5" /></button></td></tr>)}</tbody>
          </table>
          {loading && <div className="p-12 text-center text-sm text-slate-500">Loading verified records…</div>}
          {error && <div role="alert" className="m-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200"><span>{error}</span>{onRetry && <button onClick={onRetry} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-300/30 px-3 text-xs font-semibold text-red-100 hover:bg-red-400/10"><RefreshCw className="h-3.5 w-3.5" />Retry</button>}</div>}
          {!loading && !error && filtered.length === 0 && <div className="p-12 text-center text-sm text-slate-500">{records.length === 0 ? emptyMessage : "No records match these filters."}</div>}
          {truncated && !loading && <p className="border-t border-white/8 px-5 py-3 text-xs text-slate-500">Showing the latest {records.length} records. Narrow with search; older records are not loaded.</p>}
        </div>
      </section>
    </div>
  );
}
