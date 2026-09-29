"use client";

import { useMemo, useState } from "react";
import { Download, FileClock, KeyRound, Search, ShieldCheck, Workflow } from "lucide-react";
import { useStore } from "@/lib/store";
import { useGovernanceCollection } from "@/lib/use-governance";
import { activityToCsv } from "@/lib/activity";
import { downloadBlob } from "@/lib/prototype/persistence";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, StatusChip } from "@/components/ui/primitives";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { relativeTime } from "@/components/governance/GovernanceModulePage";
import { cn } from "@/lib/format";

type Tab = "activity" | "governance" | "operations" | "privileged";

const TABS: Array<{ id: Tab; label: string; icon: typeof FileClock; blurb: string }> = [
  { id: "activity", label: "Activity record", icon: Workflow, blurb: "Every command taken in this console, by whom, and whether it took effect." },
  { id: "governance", label: "Governance decisions", icon: ShieldCheck, blurb: "Approvals, rejections and marketplace status changes with reasons." },
  { id: "operations", label: "Operations log", icon: FileClock, blurb: "Domain events written by session, booking, safety and money workflows." },
  { id: "privileged", label: "Privileged access", icon: KeyRound, blurb: "Emergency identity-access grants: who, why, and for how long." },
];

function fmt(iso?: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : iso;
}

export default function AuditPage() {
  const { state, canAccess, operators } = useStore();
  const gov = useGovernanceCollection("auditEvents");
  const [tab, setTab] = useState<Tab>("activity");
  const [q, setQ] = useState("");
  const [actor, setActor] = useState("all");
  const [outcome, setOutcome] = useState<"all" | "ok" | "rejected">("all");

  const name = (id: string) => operators.find((o) => o.id === id)?.name ?? id;

  const activity = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.activityLog.filter(
      (r) =>
        (actor === "all" || r.actorId === actor) &&
        (outcome === "all" || r.outcome === outcome) &&
        (!needle || `${r.summary} ${r.module} ${r.detail ?? ""} ${r.actorName}`.toLowerCase().includes(needle)),
    );
  }, [state.activityLog, q, actor, outcome]);

  const governance = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return gov.records.filter((r) => !needle || `${r.primary} ${r.meta} ${String(r.raw.actorName ?? "")}`.toLowerCase().includes(needle));
  }, [gov.records, q]);

  const operations = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.audits.filter((a) => (actor === "all" || a.operatorId === actor) && (!needle || `${a.action} ${a.description} ${a.sessionId ?? ""}`.toLowerCase().includes(needle)));
  }, [state.audits, q, actor]);

  const privileged = state.emergencyAccessLogs;

  if (!canAccess("/audit")) return <PermissionDenied module="Audit & records" />;

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = state.activityLog.filter((r) => r.at.startsWith(today)).length;
  const rejected = state.activityLog.filter((r) => r.outcome === "rejected").length;

  function exportCurrent() {
    const stamp = new Date().toISOString().slice(0, 10);
    if (tab === "activity") {
      downloadBlob(new Blob([activityToCsv(activity)], { type: "text/csv" }), `activity-record-${stamp}.csv`);
      return;
    }
    const esc = (v: unknown) => {
      const s = v === undefined || v === null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    let rows: unknown[][] = [];
    if (tab === "governance") rows = [["at", "action", "subject", "actor", "role", "reason", "entity"], ...governance.map((r) => [r.updatedAt, r.raw.action, r.primary, r.raw.actorName, r.raw.actorRoleId, r.raw.summary, r.raw.entityId])];
    if (tab === "operations") rows = [["id", "timestamp", "at", "operator", "action", "session", "description"], ...operations.map((a) => [a.id, a.timestamp, (a as { at?: string }).at, name(a.operatorId), a.action, a.sessionId, a.description])];
    if (tab === "privileged") rows = [["id", "requestedAt", "operator", "role", "session", "booking", "reason", "status", "expiresAt"], ...privileged.map((l) => { const x = l as unknown as Record<string, unknown>; return [x.id, x.requestedAt, x.operatorId, x.operatorRole, x.sessionId, x.bookingId, x.reason, x.status, x.expiresAt]; })];
    downloadBlob(new Blob([rows.map((r) => r.map(esc).join(",")).join("\n")], { type: "text/csv" }), `${tab}-audit-${stamp}.csv`);
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-5 py-7 lg:px-8">
      <PageHeader
        overline="Control"
        title="Audit & records"
        sub="The permanent record of this workspace. Entries are append-only: they are never edited or deleted, and they survive workspace resets and backups."
        right={
          <Button variant="secondary" onClick={exportCurrent}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Actions recorded" value={state.activityLog.length.toLocaleString("en-IN")} detail={`${todayCount} today`} icon={<Workflow className="h-4 w-4" />} tone="violet" />
        <MetricTile label="Governance decisions" value={gov.records.length} detail="approvals and status changes" icon={<ShieldCheck className="h-4 w-4" />} tone="emerald" />
        <MetricTile label="Operations events" value={state.audits.length} detail="sessions, bookings, safety, money" icon={<FileClock className="h-4 w-4" />} tone="sky" />
        <MetricTile label="Blocked or no-effect" value={rejected} detail="commands refused by a rule" icon={<KeyRound className="h-4 w-4" />} tone="amber" />
      </div>

      <div className="rounded-panel border border-edge bg-white shadow-panel">
        <div className="flex flex-wrap gap-1 border-b border-edge p-2" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors",
                tab === t.id ? "bg-brand-subtle text-brand-ink" : "text-ink-mut hover:bg-slate-50 hover:text-ink-lum",
              )}
            >
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>
        <div className="flex flex-col gap-3 border-b border-edge p-4 md:flex-row md:items-center">
          <p className="flex-1 text-sm text-ink-mut">{TABS.find((t) => t.id === tab)?.blurb}</p>
          <label className="relative md:w-72">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-mut" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search records…" aria-label="Search records" className="field h-10 w-full rounded-xl pl-9 pr-3 text-sm" />
          </label>
          {(tab === "activity" || tab === "operations") && (
            <select value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Filter by operator" className="field h-10 rounded-xl px-3 text-sm">
              <option value="all">All operators</option>
              {operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
              <option value="system">System</option>
            </select>
          )}
          {tab === "activity" && (
            <select value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} aria-label="Filter by outcome" className="field h-10 rounded-xl px-3 text-sm">
              <option value="all">All outcomes</option>
              <option value="ok">Took effect</option>
              <option value="rejected">Refused / no effect</option>
            </select>
          )}
        </div>

        <div className="overflow-x-auto">
          {tab === "activity" && (
            <RecordTable
              empty="No actions recorded yet. Everything you do in the console will appear here."
              head={["When", "Operator", "Module", "Action", "Outcome"]}
              rows={activity.slice(0, 500).map((r) => [
                <span key="w" title={fmt(r.at)} className="whitespace-nowrap">{relativeTime(r.at)}</span>,
                <span key="o"><span className="font-medium text-ink-lum">{r.actorName}</span><span className="block text-xs text-ink-mut">{r.roleId}</span></span>,
                r.module,
                <span key="a"><span className="font-medium text-ink-lum">{r.summary}</span>{r.detail && <span className="block max-w-[420px] truncate text-xs text-ink-mut">{r.detail}</span>}</span>,
                <StatusChip key="s" value={r.outcome === "ok" ? "completed" : "rejected"} />,
              ])}
              footer={activity.length > 500 ? `Showing the latest 500 of ${activity.length}. Export CSV for the complete record.` : undefined}
            />
          )}
          {tab === "governance" && (
            <RecordTable
              empty="No governance decisions recorded yet."
              head={["When", "Decision", "By", "Reason"]}
              rows={governance.map((r) => [
                <span key="w" className="whitespace-nowrap">{relativeTime(r.updatedAt)}</span>,
                <span key="d" className="font-medium text-ink-lum">{r.primary}</span>,
                <span key="b">{String(r.raw.actorName ?? r.raw.actorUid ?? "System")}<span className="block text-xs text-ink-mut">{String(r.raw.actorRoleId ?? "")}</span></span>,
                <span key="r" className="text-ink-mut">{String(r.raw.summary ?? r.raw.reason ?? "—")}</span>,
              ])}
            />
          )}
          {tab === "operations" && (
            <RecordTable
              empty="No operations events recorded."
              head={["When", "Operator", "Event", "Session", "Description"]}
              rows={operations.slice(0, 500).map((a) => [
                <span key="w" className="whitespace-nowrap">{(a as { at?: string }).at ? relativeTime((a as { at?: string }).at) : a.timestamp}</span>,
                name(a.operatorId),
                <span key="e" className="font-medium text-ink-lum">{a.action}</span>,
                <span key="s" className="font-mono text-xs">{a.sessionId ?? "—"}</span>,
                <span key="d" className="text-ink-mut">{a.description}</span>,
              ])}
              footer={operations.length > 500 ? `Showing the latest 500 of ${operations.length}. Export CSV for the complete record.` : undefined}
            />
          )}
          {tab === "privileged" && (
            <RecordTable
              empty="No emergency identity access has been requested."
              head={["Requested", "Operator", "Scope", "Reason", "Status"]}
              rows={privileged.map((l) => {
                const x = l as unknown as Record<string, string | undefined>;
                return [
                  <span key="w" className="whitespace-nowrap">{x.requestedAt ? fmt(x.requestedAt) : "—"}</span>,
                  <span key="o">{name(x.operatorId ?? "")}<span className="block text-xs text-ink-mut">{x.operatorRole}</span></span>,
                  <span key="s" className="font-mono text-xs">{x.bookingId ?? x.sessionId ?? "—"}</span>,
                  <span key="r" className="text-ink-mut">{x.reason}</span>,
                  <StatusChip key="st" value={x.status ?? "active"} />,
                ];
              })}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function RecordTable({ head, rows, empty, footer }: { head: string[]; rows: React.ReactNode[][]; empty: string; footer?: string }) {
  if (rows.length === 0) return <p className="px-6 py-14 text-center text-sm text-ink-mut">{empty}</p>;
  return (
    <>
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead>
          <tr className="border-b border-edge bg-bg-sunken text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mut">
            {head.map((h) => (
              <th key={h} className="px-5 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, i) => (
            <tr key={i} className="border-b border-slate-100 align-top last:border-0 hover:bg-slate-50/70">
              {cells.map((c, j) => (
                <td key={j} className="px-5 py-3 text-ink-sec">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {footer && <p className="border-t border-edge px-5 py-3 text-xs text-ink-mut">{footer}</p>}
    </>
  );
}
