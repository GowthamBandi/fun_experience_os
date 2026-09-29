"use client";

import { useMemo, useState } from "react";
import { AlertOctagon, CalendarCheck2, Download, IndianRupee, Percent, Ticket, UserX } from "lucide-react";
import { useStore } from "@/lib/store";
import { reportToCsv, selectOperationsReport, type ReportDay, type ReportRange } from "@/lib/prototype/selectors/analytics";
import { downloadBlob } from "@/lib/prototype/persistence";
import { inr, cn } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { Button } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { EmptyPanel, PageShell, Panel, Tabs } from "@/components/setup/kit";

const RANGES: Array<{ id: string; label: string; value: ReportRange }> = [
  { id: "7", label: "Last 7 days", value: 7 },
  { id: "30", label: "Last 30 days", value: 30 },
  { id: "90", label: "Last 90 days", value: 90 },
  { id: "all", label: "All time", value: "all" },
];

const shortDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** Single-series daily bar chart with a hover tooltip. */
function DayBars({ days, value, format, color, empty }: { days: ReportDay[]; value: (d: ReportDay) => number | null; format: (n: number) => string; color: string; empty: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = days.map(value);
  const max = Math.max(0, ...vals.map((v) => v ?? 0));
  if (max === 0) return <p className="flex h-44 items-center justify-center text-sm text-ink-mut">{empty}</p>;
  const w = 640;
  const h = 180;
  const top = 18;
  const base = h - 22;
  const slot = w / days.length;
  const bw = Math.max(2, Math.min(28, slot - 2));
  const every = Math.ceil(days.length / 8);
  const peak = vals.indexOf(max);
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${w} ${h}`} className="h-48 w-full" role="img" aria-label={`Daily values, peak ${format(max)}`} onMouseLeave={() => setHover(null)}>
        {[0.5, 1].map((f) => (
          <line key={f} x1={0} x2={w} y1={base - (base - top) * f} y2={base - (base - top) * f} stroke="#eceef5" strokeWidth={1} />
        ))}
        <line x1={0} x2={w} y1={base} y2={base} stroke="#d3d8e4" strokeWidth={1} />
        {days.map((d, i) => {
          const v = vals[i] ?? 0;
          const bh = max ? ((base - top) * v) / max : 0;
          const x = i * slot + (slot - bw) / 2;
          return (
            <g key={d.day} onMouseEnter={() => setHover(i)}>
              <rect x={i * slot} y={top} width={slot} height={base - top} fill="transparent" />
              {v > 0 && <path d={`M${x},${base} v${-Math.max(bh - 4, 0)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${Math.max(bh - 4, 0)} z`} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} />}
              {i % every === 0 && (
                <text x={Math.max(i * slot + slot / 2, 2)} y={h - 6} fontSize="11" fill="#737a92" textAnchor={i === 0 ? "start" : "middle"}>
                  {shortDay(d.day)}
                </text>
              )}
            </g>
          );
        })}
        {peak >= 0 && (
          <text x={peak * slot + slot / 2} y={top - 5} fontSize="11" fontWeight={600} fill="#464c63" textAnchor={peak > days.length * 0.8 ? "end" : peak < days.length * 0.2 ? "start" : "middle"}>
            {format(max)}
          </text>
        )}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 rounded-xl border border-edge bg-white px-3 py-2 text-xs shadow-glass" style={{ left: `${Math.min(80, Math.max(0, (hover / days.length) * 100))}%` }}>
          <p className="font-semibold text-ink-lum">{shortDay(days[hover].day)}</p>
          <p className="text-ink-sec">{vals[hover] === null ? "No sessions" : format(vals[hover] ?? 0)}</p>
          <p className="text-ink-mut">{days[hover].sessions} session{days[hover].sessions === 1 ? "" : "s"}</p>
        </div>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const { state, canAccess, territory } = useStore();
  const toast = useToast();
  const [rangeId, setRangeId] = useState("7");
  const [scope, setScope] = useState<"territory" | "all">("all");
  const range = RANGES.find((r) => r.id === rangeId)!.value;
  const territoryId = scope === "territory" && territory.id ? territory.id : undefined;
  const report = useMemo(() => selectOperationsReport(state, range, { territoryId }), [state, range, territoryId]);

  if (!canAccess("/analytics")) return <PermissionDenied module="Analytics" />;
  const t = report.totals;
  const hasData = t.sessions + t.cancelledSessions > 0;

  function exportCsv() {
    downloadBlob(new Blob([reportToCsv(report)], { type: "text/csv" }), `operations-report-${report.from}-to-${report.to}.csv`);
    toast.success("Report exported", `${report.days.length} days, ${report.from} to ${report.to}`);
  }

  const breakdownCols: Column<OperationsBreakdown>[] = [
    { key: "name", header: "Name", render: (r) => <span className="font-semibold text-ink-lum">{r.name}</span> },
    { key: "sessions", header: "Sessions", align: "right", render: (r) => r.sessions },
    { key: "bookings", header: "Bookings", align: "right", render: (r) => r.bookings },
    { key: "fill", header: "Fill", align: "right", render: (r) => (r.fillPct === null ? "—" : `${r.fillPct}%`) },
    { key: "revenue", header: "Net revenue", align: "right", render: (r) => inr(r.revenue) },
  ];

  return (
    <PageShell>
      <PageHeader
        overline="Control"
        title="Analytics"
        sub={`Operations report from ${shortDay(report.from)} to ${shortDay(report.to)}, calculated from sessions, bookings, the payment ledger, check-ins and incidents.`}
        right={
          <Button variant="secondary" onClick={exportCsv}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
        }
      />

      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Tabs tabs={RANGES.map((r) => ({ id: r.id, label: r.label }))} value={rangeId} onChange={setRangeId} />
        {territory.id && (
          <Tabs
            tabs={[
              { id: "all" as const, label: "All territories" },
              { id: "territory" as const, label: territory.name },
            ]}
            value={scope}
            onChange={setScope}
          />
        )}
      </div>

      {!hasData ? (
        <EmptyPanel icon={<CalendarCheck2 className="h-5 w-5" />} title="No sessions in this period" line="Figures appear once sessions have run in the selected range. Try a longer range, or schedule sessions from Sessions." />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <MetricTile label="Net revenue" value={inr(t.netRevenue)} detail={`${inr(t.revenue)} settled · ${inr(t.refunds)} refunded`} icon={<IndianRupee className="h-4 w-4" />} tone="emerald" />
            <MetricTile label="Bookings" value={t.bookings.toLocaleString("en-IN")} detail={`${inr(t.avgBookingValue)} average settled per booking`} icon={<Ticket className="h-4 w-4" />} />
            <MetricTile label="Fill rate" value={t.fillPct === null ? "—" : `${t.fillPct}%`} detail={`${t.bookings} of ${t.capacity} places across ${t.sessions} sessions`} icon={<Percent className="h-4 w-4" />} tone="sky" />
            <MetricTile label="Sessions run or scheduled" value={t.sessions} detail={`${t.cancelledSessions} cancelled`} icon={<CalendarCheck2 className="h-4 w-4" />} tone="pink" />
            <MetricTile label="No-shows" value={t.noShows} detail={t.noShowPct === null ? "no bookings" : `${t.noShowPct}% of bookings`} icon={<UserX className="h-4 w-4" />} tone="amber" />
            <MetricTile label="Incidents" value={t.incidents} detail="reported in this period" icon={<AlertOctagon className="h-4 w-4" />} tone="rose" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Settled revenue per day" sub="Payments settled for sessions on each day">
              <DayBars days={report.days} value={(d) => d.revenue} format={(n) => inr(n)} color="#5b4cf5" empty="No settled payments in this period." />
            </Panel>
            <Panel title="Bookings per day" sub="Places taken on sessions each day">
              <DayBars days={report.days} value={(d) => d.bookings} format={(n) => `${n} bookings`} color="#0ea5e9" empty="No bookings in this period." />
            </Panel>
            <Panel title="Fill rate per day" sub="Places taken ÷ places available">
              <DayBars days={report.days} value={(d) => d.fillPct} format={(n) => `${n}%`} color="#10b981" empty="No sessions with capacity in this period." />
            </Panel>
            <Panel title="No-shows and incidents" sub="Two separate daily counts">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1 text-xs font-semibold text-ink-sec">No-shows</p>
                  <DayBars days={report.days} value={(d) => d.noShows} format={(n) => `${n} no-show${n === 1 ? "" : "s"}`} color="#f59e0b" empty="None recorded." />
                </div>
                <div>
                  <p className="mb-1 text-xs font-semibold text-ink-sec">Incidents</p>
                  <DayBars days={report.days} value={(d) => d.incidents} format={(n) => `${n} incident${n === 1 ? "" : "s"}`} color="#e11d48" empty="None reported." />
                </div>
              </div>
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink-lum">By category</h2>
              <DataTable columns={breakdownCols} rows={report.byCategory} emptyTitle="No categories" emptyLine="No sessions in this period." />
            </div>
            <div>
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink-lum">By venue</h2>
              <DataTable columns={breakdownCols} rows={report.byVenue} emptyTitle="No venues" emptyLine="No sessions in this period." />
            </div>
          </div>

          <details className="group rounded-panel border border-edge bg-white shadow-panel">
            <summary className="cursor-pointer list-none px-5 py-4 font-display text-[15px] font-bold text-ink-lum">
              Daily figures <span className={cn("ml-2 text-xs font-normal text-ink-mut")}>(table view of the charts)</span>
            </summary>
            <div className="overflow-x-auto border-t border-edge">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-bg-sunken text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-mut">
                    {["Date", "Sessions", "Bookings", "Fill", "Revenue", "Refunds", "No-shows", "Incidents"].map((h) => (
                      <th key={h} className="px-4 py-2.5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {report.days.filter((d) => d.sessions || d.cancelledSessions || d.incidents).map((d) => (
                    <tr key={d.day} className="border-t border-slate-100 tabular">
                      <td className="px-4 py-2">{shortDay(d.day)}</td>
                      <td className="px-4 py-2">{d.sessions}{d.cancelledSessions ? ` (+${d.cancelledSessions} cancelled)` : ""}</td>
                      <td className="px-4 py-2">{d.bookings}</td>
                      <td className="px-4 py-2">{d.fillPct === null ? "—" : `${d.fillPct}%`}</td>
                      <td className="px-4 py-2">{inr(d.revenue)}</td>
                      <td className="px-4 py-2">{inr(d.refunds)}</td>
                      <td className="px-4 py-2">{d.noShows}</td>
                      <td className="px-4 py-2">{d.incidents}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </PageShell>
  );
}

type OperationsBreakdown = ReturnType<typeof selectOperationsReport>["byCategory"][number];
