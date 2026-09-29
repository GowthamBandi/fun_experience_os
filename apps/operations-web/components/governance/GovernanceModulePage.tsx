"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ArrowDownUp, ChevronRight, Download, Plus, Search } from "lucide-react";
import { cn } from "@/lib/format";
import type { GovernanceStatusLabel, LiveGovernanceRecord } from "@/lib/governance-api";
import { Button } from "@/components/ui/primitives";
import { downloadBlob } from "@/lib/prototype/persistence";

export type GovernanceRecord = LiveGovernanceRecord;

export const GOVERNANCE_TONE: Record<GovernanceStatusLabel, string> = {
  Approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Resolved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  Pending: "border-amber-200 bg-amber-50 text-amber-700",
  Paused: "border-slate-200 bg-slate-100 text-slate-600",
  Blocked: "border-red-200 bg-red-50 text-red-700",
  Rejected: "border-red-200 bg-red-50 text-red-700",
  "Under review": "border-sky-200 bg-sky-50 text-sky-700",
  "Info requested": "border-violet-200 bg-violet-50 text-violet-700",
  "On hold": "border-orange-200 bg-orange-50 text-orange-700",
};

export function GovernanceStatus({ status }: { status: GovernanceStatusLabel }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold", GOVERNANCE_TONE[status])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

export function relativeTime(iso?: string): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "—";
  const diff = Date.now() - t;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

type Sort = "newest" | "oldest" | "name";

export function GovernanceModulePage({
  eyebrow,
  title,
  description,
  metricLabel,
  records,
  primaryAction,
  loading = false,
  error = null,
  onAction,
  onCreate,
  createLabel,
  icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  metricLabel: string;
  records: GovernanceRecord[];
  primaryAction: string;
  loading?: boolean;
  error?: string | null;
  onAction?: (record: GovernanceRecord) => void;
  onCreate?: () => void;
  createLabel?: string;
  icon?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<GovernanceStatusLabel | "All">("All");
  const [sort, setSort] = useState<Sort>("newest");

  const counts = useMemo(() => {
    const map = new Map<GovernanceStatusLabel, number>();
    for (const r of records) map.set(r.status, (map.get(r.status) ?? 0) + 1);
    return map;
  }, [records]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = records.filter((record) => {
      const hay = `${record.primary} ${record.secondary} ${record.meta} ${record.id}`.toLowerCase();
      return (!q || hay.includes(q)) && (status === "All" || record.status === status);
    });
    return [...rows].sort((a, b) =>
      sort === "name" ? a.primary.localeCompare(b.primary) : sort === "oldest" ? (a.updatedAt ?? "").localeCompare(b.updatedAt ?? "") : (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
    );
  }, [query, records, status, sort]);

  const open = records.filter((r) => ["Pending", "Under review", "Info requested", "On hold"].includes(r.status)).length;

  function exportCsv() {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [["id", "name", "owner", "status", "value", "context", "updated"].join(",")];
    for (const r of filtered) lines.push([r.id, r.primary, r.secondary, r.status, r.value, r.meta, r.updatedAt ?? ""].map(esc).join(","));
    downloadBlob(new Blob([lines.join("\n")], { type: "text/csv" }), `${title.toLowerCase().replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  const chips: Array<GovernanceStatusLabel | "All"> = ["All", ...(Array.from(counts.keys()) as GovernanceStatusLabel[])];

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-7 lg:px-8">
      <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-4">
          {icon && <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-brand">{icon}</span>}
          <div>
            <p className="overline text-brand">{eyebrow}</p>
            <h1 className="mt-1 font-display text-[28px] font-bold tracking-tight text-ink-lum">{title}</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-mut">{description}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-4 rounded-2xl border border-edge bg-white px-4 py-2.5 shadow-lift">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mut">{metricLabel}</p>
              <p className="font-display text-xl font-bold tabular text-ink-lum">{loading ? "…" : records.length}</p>
            </div>
            <span className="h-8 w-px bg-edge" />
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mut">Needs action</p>
              <p className="font-display text-xl font-bold tabular text-amber-600">{loading ? "…" : open}</p>
            </div>
          </div>
          <Button variant="secondary" onClick={exportCsv} disabled={loading || filtered.length === 0}>
            <Download className="h-4 w-4" /> Export
          </Button>
          {onCreate && (
            <Button onClick={onCreate}>
              <Plus className="h-4 w-4" /> {createLabel ?? "New"}
            </Button>
          )}
        </div>
      </header>

      <section className="mt-6 overflow-hidden rounded-panel border border-edge bg-white shadow-panel">
        <div className="flex flex-col gap-3 border-b border-edge p-4 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mut" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${title.toLowerCase()}…`}
              aria-label={`Search ${title}`}
              className="field h-10 w-full rounded-xl pl-10 pr-3 text-sm"
            />
          </label>
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by status">
            {chips.map((c) => (
              <button
                key={c}
                onClick={() => setStatus(c)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors",
                  status === c ? "border-brand bg-brand text-white" : "border-edge bg-white text-ink-sec hover:border-edge-strong hover:bg-bg-sunken",
                )}
              >
                {c}
                <span className={cn("rounded-full px-1.5 text-[10px] tabular", status === c ? "bg-white/20" : "bg-slate-100 text-ink-mut")}>
                  {c === "All" ? records.length : counts.get(c) ?? 0}
                </span>
              </button>
            ))}
          </div>
          <label className="relative">
            <ArrowDownUp className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-mut" />
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort" className="field h-9 appearance-none rounded-xl pl-8 pr-3 text-xs font-medium">
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left">
            <thead>
              <tr className="border-b border-edge bg-bg-sunken text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mut">
                <th className="px-5 py-3">Record</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Context</th>
                <th className="px-4 py-3">Updated</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {!loading &&
                filtered.map((record) => (
                  <tr
                    key={record.id}
                    onClick={() => onAction?.(record)}
                    className="group cursor-pointer border-b border-slate-100 transition-colors last:border-0 hover:bg-brand-subtle/40"
                  >
                    <td className="px-5 py-4">
                      <p className="text-sm font-semibold text-ink-lum">{record.primary}</p>
                      <p className="mt-0.5 text-xs text-ink-mut">
                        {record.secondary} · <span className="font-mono text-[11px]">{record.id}</span>
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <GovernanceStatus status={record.status} />
                    </td>
                    <td className="tabular px-4 py-4 text-sm font-semibold text-ink-lum">{record.value}</td>
                    <td className="max-w-[320px] px-4 py-4 text-xs leading-5 text-ink-mut">{record.meta}</td>
                    <td className="whitespace-nowrap px-4 py-4 text-xs text-ink-mut">{relativeTime(record.updatedAt)}</td>
                    <td className="px-5 py-4 text-right">
                      <span className="inline-flex h-8 items-center gap-1 rounded-lg border border-edge bg-white px-3 text-xs font-semibold text-ink-sec transition-colors group-hover:border-brand group-hover:text-brand">
                        {primaryAction}
                        <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {loading && (
            <div className="space-y-3 p-5" aria-busy>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="shimmer h-12 rounded-xl" />
              ))}
            </div>
          )}
          {error && (
            <div role="alert" className="m-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}
          {!loading && !error && filtered.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
              <p className="text-sm font-semibold text-ink-lum">{records.length === 0 ? `No ${title.toLowerCase()} yet` : "No records match these filters"}</p>
              <p className="text-sm text-ink-mut">{records.length === 0 && onCreate ? `Use “${createLabel ?? "New"}” to record the first one.` : "Try a different search or status."}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
