"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert, Clock3, Flame, ListChecks, RefreshCw } from "lucide-react";
import { useGovernanceCollection } from "@/lib/use-governance";
import { cn } from "@/lib/format";
import {
  SEVERITY_LABEL,
  SEVERITY_ORDER,
  buildAttentionQueue,
  formatCount,
  groupBySeverity,
  isPrivilegedAudit,
  type Severity,
} from "@/lib/console/attention";
import { formatDateTime } from "@/lib/console/records";

const SEVERITY_STYLE: Record<Severity, { ring: string; badge: string; icon: typeof Flame }> = {
  critical: { ring: "border-red-400/25", badge: "bg-red-400/10 text-red-200", icon: Flame },
  high: { ring: "border-amber-400/25", badge: "bg-amber-400/10 text-amber-200", icon: CircleAlert },
  normal: { ring: "border-white/8", badge: "bg-indigo-400/10 text-indigo-200", icon: ListChecks },
};

export default function CommandCenter() {
  const cases = useGovernanceCollection("governanceCases");
  const risks = useGovernanceCollection("riskAlerts");
  const refunds = useGovernanceCollection("refunds");
  const settlements = useGovernanceCollection("settlements");
  const audit = useGovernanceCollection("auditEvents");
  const sources = [
    { name: "Governance cases", source: cases },
    { name: "Risk alerts", source: risks },
    { name: "Refunds", source: refunds },
    { name: "Settlements", source: settlements },
    { name: "Audit", source: audit },
  ];
  const loading = sources.some(({ source }) => source.loading);
  const failures = sources.filter(({ source }) => source.error);

  const queue = buildAttentionQueue({
    governanceCases: cases.records,
    riskAlerts: risks.records,
    refunds: refunds.records,
    settlements: settlements.records,
    truncated: { governanceCases: cases.truncated, riskAlerts: risks.truncated, refunds: refunds.truncated, settlements: settlements.truncated },
  });
  const grouped = groupBySeverity(queue);
  const totalOpen = queue.reduce((sum, item) => sum + item.count, 0);
  const privileged = audit.records.filter((record) => isPrivilegedAudit(record.raw)).slice(0, 10);

  function retryAll() {
    failures.forEach(({ source }) => source.refresh());
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 py-7 lg:px-8">
      <header className="flex flex-col gap-4 border-b border-white/8 pb-6 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="overline">Operations Command Center</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-[-0.035em] text-white">What needs governance attention</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Organizers operate their events. This console approves access, protects customers and money, and intervenes only when governance requires it. Counts are live from Firestore.</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-[#111925] px-4 py-3 text-right">
          <p className="text-[10px] uppercase tracking-[0.1em] text-slate-500">Open items</p>
          <p className="tabular text-2xl font-semibold text-white" data-testid="open-items">{loading ? "…" : totalOpen}</p>
        </div>
      </header>

      {failures.length > 0 && (
        <div role="alert" className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-400/20 bg-red-400/5 p-4 text-sm text-red-200">
          <div>
            <p className="font-medium">Some live sources could not be loaded — counts below may be incomplete.</p>
            <ul className="mt-1 text-xs text-red-200/80">{failures.map(({ name, source }) => <li key={name}>{name}: {source.error}</li>)}</ul>
          </div>
          <button onClick={retryAll} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-red-300/30 px-3 text-xs font-semibold text-red-100 hover:bg-red-400/10"><RefreshCw className="h-3.5 w-3.5" />Retry</button>
        </div>
      )}

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {SEVERITY_ORDER.map((severity) => {
            const style = SEVERITY_STYLE[severity];
            const Icon = style.icon;
            const items = grouped[severity];
            const open = items.filter((item) => item.count > 0);
            return (
              <section key={severity} aria-labelledby={`sev-${severity}`} className={cn("overflow-hidden rounded-2xl border bg-[#101823]", style.ring)}>
                <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                  <h2 id={`sev-${severity}`} className="flex items-center gap-2 text-sm font-semibold text-white"><Icon className="h-4 w-4" />{SEVERITY_LABEL[severity]}</h2>
                  <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", style.badge)}>{loading ? "…" : open.reduce((sum, item) => sum + item.count, 0)}</span>
                </div>
                <div className="divide-y divide-white/7">
                  {items.map((item) => (
                    <Link key={item.key} href={item.href} data-testid={`attention-${item.key}`} className={cn("grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 px-5 py-4 hover:bg-white/[0.025]", item.count === 0 && "opacity-55")}>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-100">{item.label}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{item.detail}</p>
                      </div>
                      <span className={cn("tabular text-lg font-semibold", item.count > 0 ? "text-white" : "text-slate-500")}>{loading ? "…" : formatCount(item.count, item.truncated)}</span>
                      <ArrowRight className="h-4 w-4 text-slate-500" />
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
          {!loading && failures.length === 0 && totalOpen === 0 && <p className="rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-4 text-sm text-emerald-100">Nothing needs governance attention right now.</p>}
        </div>

        <aside>
          <section className="rounded-2xl border border-white/8 bg-[#111925] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-white">Recent privileged actions</h2>
              <Link href="/audit" className="text-xs text-indigo-300 hover:text-indigo-200">Full audit</Link>
            </div>
            <p className="mt-1 text-xs text-slate-500">Console decisions, access changes and money controls (server-written audit).</p>
            <div className="mt-3 divide-y divide-white/8">
              {audit.loading && <p className="py-6 text-center text-xs text-slate-500">Loading audit…</p>}
              {!audit.loading && audit.error && <p className="py-4 text-xs text-red-300">{audit.error}</p>}
              {!audit.loading && !audit.error && privileged.length === 0 && <p className="py-6 text-center text-xs text-slate-500">No privileged actions recorded yet.</p>}
              {privileged.map((record) => (
                <div key={record.id} className="flex gap-3 py-3">
                  <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                  <div className="min-w-0">
                    <p className="break-words text-xs font-medium text-slate-200">{String(record.raw.action ?? record.primary)}</p>
                    <p className="mt-1 break-words text-[11px] text-slate-500">{[record.raw.resourceType, record.raw.resourceId].filter(Boolean).join(" · ")}{record.raw.reason ? ` — “${String(record.raw.reason)}”` : ""}</p>
                    <p className="mt-0.5 text-[11px] text-slate-600">{formatDateTime(record.raw.at)} · {String(record.raw.actorRoleId ?? record.raw.actorRole ?? "")}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
