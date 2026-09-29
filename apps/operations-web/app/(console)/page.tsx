"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, CalendarClock, CircleAlert, ClipboardCheck, IndianRupee, ShieldAlert, Sparkles, Ticket, TrendingUp, Workflow } from "lucide-react";
import { useStore } from "@/lib/store";
import { useGovernanceCollection } from "@/lib/use-governance";
import { generateOperationsAlerts, selectFinancialOperationsMetrics, sessionViews } from "@/lib/prototype/repositories";
import { GovernanceStatus, relativeTime } from "@/components/governance/GovernanceModulePage";
import { MetricTile } from "@/components/ui/panels";
import { FillMeter, StatusChip } from "@/components/ui/primitives";
import { Button } from "@/components/ui/primitives";
import { inr } from "@/lib/format";
import { cn } from "@/lib/format";

function greeting() {
  const h = Number(new Date().toLocaleString("en-IN", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

const SEVERITY_TONE: Record<string, string> = {
  critical: "bg-red-50 text-red-700 ring-red-100",
  high: "bg-orange-50 text-orange-700 ring-orange-100",
  medium: "bg-amber-50 text-amber-700 ring-amber-100",
  low: "bg-sky-50 text-sky-700 ring-sky-100",
};

export default function Overview() {
  const { state, operator, territory, canAccess } = useStore();
  const cases = useGovernanceCollection("governanceCases");
  const risks = useGovernanceCollection("riskAlerts");

  const seeGov = canAccess("/approvals");
  const seeOps = canAccess("/missions");
  const seeMoney = canAccess("/money");
  const seeSafety = canAccess("/safety");

  const openCases = cases.records.filter((r) => ["Pending", "Under review", "Info requested"].includes(r.status));
  const openRisks = risks.records.filter((r) => !["Resolved", "Approved"].includes(r.status));
  const sessions = useMemo(() => sessionViews(state, territory.id), [state, territory.id]);
  const today = sessions.filter((s) => s.date === "Today");
  const upcoming = (today.length ? today : sessions.filter((s) => !["completed", "cancelled", "archived"].includes(s.status))).slice(0, 6);
  const alerts = useMemo(() => {
    const inTerritory = new Set<string>(sessions.map((s) => s.id));
    const territoryVenues = new Set(state.venues.filter((v) => v.territoryId === territory.id).map((v) => v.id));
    return generateOperationsAlerts(state)
      .filter((a) => a.status === "active")
      // Alerts tied to a session or venue show only in that session's territory; platform-wide alerts always show.
      .filter((a) => {
        const related = a.relatedEntityIds.filter((id) => state.sessions.some((s) => s.id === id) || state.venues.some((v) => v.id === id));
        return related.length === 0 || related.some((id) => inTerritory.has(id) || territoryVenues.has(id));
      })
      .slice(0, 5);
  }, [state, sessions, territory.id]);
  const money = useMemo(() => selectFinancialOperationsMetrics(state), [state]);
  const openIncidents = state.incidents.filter((i) => !["resolved", "closed"].includes(String(i.status))).length;
  const booked = today.reduce((a, s) => a + s.booked, 0);
  const capacity = today.reduce((a, s) => a + s.capacity, 0);
  const recent = state.activityLog.slice(0, 6);

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-5 py-7 lg:px-8">
      <section className="relative overflow-hidden rounded-panel bg-gradient-to-br from-[#4f3fe8] via-[#6d4cf0] to-[#b8409c] p-6 text-white shadow-brand sm:p-8">
        <div className="absolute -right-16 -top-20 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
        <div className="absolute bottom-0 right-40 h-40 w-40 rounded-full bg-amber-300/20 blur-2xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-medium text-white/80">
              <Sparkles className="h-4 w-4" /> {territory.name}
            </p>
            <h1 className="mt-2 font-display text-[30px] font-extrabold leading-tight tracking-tight sm:text-[34px]">
              {greeting()}, {operator?.name.split(" ")[0] ?? "there"}.
            </h1>
            <p className="mt-2 max-w-xl text-[15px] leading-6 text-white/85">
              {seeGov && openCases.length > 0
                ? `${openCases.length} marketplace decision${openCases.length === 1 ? "" : "s"} waiting`
                : "No marketplace decisions waiting"}
              {seeOps ? ` · ${today.length} session${today.length === 1 ? "" : "s"} today` : ""}
              {seeSafety && openIncidents > 0 ? ` · ${openIncidents} open incident${openIncidents === 1 ? "" : "s"}` : ""}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {seeGov && (
              <Link href="/approvals" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white px-4 text-sm font-semibold text-brand-ink shadow-lift transition hover:bg-white/90">
                Review approvals <ArrowRight className="h-4 w-4" />
              </Link>
            )}
            {seeOps && (
              <Link href="/missions" className="inline-flex h-11 items-center gap-2 rounded-xl bg-white/15 px-4 text-sm font-semibold text-white ring-1 ring-white/30 backdrop-blur transition hover:bg-white/25">
                Today&apos;s sessions
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {seeGov && <MetricTile label="Open decisions" value={openCases.length} detail={`${cases.records.length} cases in the queue history`} icon={<ClipboardCheck className="h-4 w-4" />} tone="violet" onClick={undefined} />}
        {seeOps && <MetricTile label="Seats filled today" value={capacity ? `${Math.round((booked / capacity) * 100)}%` : "—"} detail={`${booked} of ${capacity} seats · ${today.length} sessions`} icon={<Ticket className="h-4 w-4" />} tone="sky" />}
        {seeMoney && <MetricTile label="Net revenue" value={inr(money.netRevenue)} detail={`${inr(money.pendingRevenue)} pending · ${money.pendingRefundsCount} refunds waiting`} icon={<IndianRupee className="h-4 w-4" />} tone="emerald" />}
        {(seeGov || seeSafety) && <MetricTile label="Risk & safety" value={openRisks.length + openIncidents} detail={`${openRisks.length} risk alerts · ${openIncidents} incidents`} icon={<ShieldAlert className="h-4 w-4" />} tone="rose" />}
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          {seeGov && (
            <section className="overflow-hidden rounded-panel border border-edge bg-white shadow-panel">
              <header className="flex items-center justify-between border-b border-edge px-5 py-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-ink-lum">Decision queue</h2>
                  <p className="text-xs text-ink-mut">Organizer access, arenas, events, commissions and money exceptions</p>
                </div>
                <Link href="/approvals" className="text-xs font-semibold text-brand hover:text-brand-hover">
                  Open queue →
                </Link>
              </header>
              <div className="divide-y divide-slate-100">
                {openCases.slice(0, 6).map((r) => (
                  <Link key={r.id} href="/approvals" className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50">
                    <span className={cn("h-9 w-1 rounded-full", r.raw.risk === "high" ? "bg-red-500" : r.raw.risk === "medium" ? "bg-amber-400" : "bg-emerald-400")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-lum">{r.primary}</span>
                      <span className="block truncate text-xs text-ink-mut">{r.secondary.replace(/-/g, " ")} · {r.value}</span>
                    </span>
                    <span className="hidden text-xs text-ink-mut sm:block">{relativeTime(String(r.raw.submittedAt ?? r.updatedAt ?? ""))}</span>
                    <GovernanceStatus status={r.status} />
                  </Link>
                ))}
                {openCases.length === 0 && <p className="px-5 py-10 text-center text-sm text-ink-mut">The queue is clear. New applications will appear here.</p>}
              </div>
            </section>
          )}

          {seeOps && (
            <section className="overflow-hidden rounded-panel border border-edge bg-white shadow-panel">
              <header className="flex items-center justify-between border-b border-edge px-5 py-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-ink-lum">{today.length ? "Today's sessions" : "Upcoming sessions"}</h2>
                  <p className="text-xs text-ink-mut">{territory.name}</p>
                </div>
                <Link href="/missions" className="text-xs font-semibold text-brand hover:text-brand-hover">
                  All sessions →
                </Link>
              </header>
              <div className="grid gap-3 p-4 md:grid-cols-2">
                {upcoming.map((s) => {
                  const fill = Math.round((s.booked / Math.max(s.capacity, 1)) * 100);
                  return (
                    <Link key={s.id} href={`/missions/${s.id}/overview`} className="group rounded-2xl border border-edge p-4 transition-all hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-panel">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-ink-lum group-hover:text-brand-ink">{s.title}</p>
                          <p className="mt-0.5 truncate text-xs text-ink-mut">
                            {s.date} · {s.time} · {s.venueName}
                          </p>
                        </div>
                        <StatusChip value={s.status} />
                      </div>
                      <div className="mt-4 flex items-center gap-3">
                        <FillMeter value={fill} />
                        <span className="w-24 shrink-0 text-right text-xs font-semibold tabular text-ink-sec">
                          {s.booked}/{s.capacity} · {fill}%
                        </span>
                      </div>
                    </Link>
                  );
                })}
                {upcoming.length === 0 && (
                  <div className="col-span-full flex flex-col items-center gap-3 py-10 text-center">
                    <CalendarClock className="h-8 w-8 text-slate-300" />
                    <p className="text-sm text-ink-mut">No sessions scheduled in this territory.</p>
                    {canAccess("/missions/new") && (
                      <Link href="/missions/new">
                        <Button size="sm">Schedule a session</Button>
                      </Link>
                    )}
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <aside className="space-y-6">
          {(seeOps || seeSafety) && (
            <section className="rounded-panel border border-edge bg-white p-5 shadow-panel">
              <div className="flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink-lum">
                  <CircleAlert className="h-4 w-4 text-amber-500" /> Needs attention
                </h2>
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">{alerts.length}</span>
              </div>
              <div className="mt-4 space-y-2.5">
                {alerts.map((a) => (
                  <div key={a.id} className={cn("rounded-xl p-3 ring-1", SEVERITY_TONE[a.severity] ?? SEVERITY_TONE.low)}>
                    <p className="text-sm font-semibold">{a.title}</p>
                    <p className="mt-0.5 text-xs opacity-80">{a.recommendedAction}</p>
                  </div>
                ))}
                {alerts.length === 0 && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">All clear — no operational alerts.</p>}
              </div>
            </section>
          )}

          <section className="rounded-panel border border-edge bg-white p-5 shadow-panel">
            <div className="flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink-lum">
                <Workflow className="h-4 w-4 text-brand" /> Recent activity
              </h2>
              {canAccess("/audit") && (
                <Link href="/audit" className="text-xs font-semibold text-brand">
                  Full record →
                </Link>
              )}
            </div>
            <ol className="mt-4 space-y-3">
              {recent.map((r) => (
                <li key={r.id} className="flex gap-3">
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", r.outcome === "ok" ? "bg-emerald-500" : "bg-amber-500")} />
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink-lum">{r.summary}</p>
                    <p className="text-xs text-ink-mut">
                      {r.actorName} · {relativeTime(r.at)}
                    </p>
                  </div>
                </li>
              ))}
              {recent.length === 0 && <p className="text-sm text-ink-mut">Actions you take will be recorded here.</p>}
            </ol>
          </section>

          {seeMoney && (
            <section className="rounded-panel border border-edge bg-gradient-to-br from-emerald-50 to-white p-5 shadow-panel">
              <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink-lum">
                <TrendingUp className="h-4 w-4 text-emerald-600" /> Money at a glance
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-ink-mut">Collected</dt>
                  <dd className="font-display text-lg font-bold tabular text-ink-lum">{inr(money.grossCollected)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-mut">Refunded</dt>
                  <dd className="font-display text-lg font-bold tabular text-ink-lum">{inr(money.totalRefunded)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-mut">Failed payments</dt>
                  <dd className="font-display text-lg font-bold tabular text-red-600">{money.failedPaymentsCount}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-mut">To reconcile</dt>
                  <dd className="font-display text-lg font-bold tabular text-amber-600">{money.reconciliationDiscrepanciesCount}</dd>
                </div>
              </dl>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
