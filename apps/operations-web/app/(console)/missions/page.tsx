"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CalendarPlus, PlayCircle, Radio, Users, Wallet } from "lucide-react";
import { useStore } from "@/lib/store";
import { sessionViews } from "@/lib/prototype/selectors/views";
import { selectLiveSessionState } from "@/lib/prototype/selectors/liveSession";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { selectCheckInSummary } from "@/lib/prototype/selectors/checkIn";
import { selectResultsProgress } from "@/lib/prototype/selectors/results";
import { selectSessionFinancialSummary } from "@/lib/prototype/selectors/money";
import { fillRate, inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, FillMeter, StatusChip } from "@/components/ui/primitives";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { FilterRail, SearchInput } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { sessionStage } from "@/components/missions/shared";

const BUCKETS = ["selling", "ready", "running", "finished", "draft", "cancelled"] as const;
type Bucket = (typeof BUCKETS)[number];

export default function SessionsPage() {
  const { territory, canAccess, state } = useStore();
  const router = useRouter();
  const [bucket, setBucket] = useState<Bucket | "all">("all");
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    return sessionViews(state, territory.id).map((v) => {
      const session = state.sessions.find((s) => s.id === v.id)!;
      const lss = selectLiveSessionState(state, v.id);
      const ledger = sessionCapacityLedger(state, v.id);
      const checkIn = selectCheckInSummary(state, v.id);
      const money = selectSessionFinancialSummary(state, v.id);
      const results = selectResultsProgress(state, v.id);
      const stage = sessionStage(session, lss);
      const joined = ledger.confirmedPaidBookings + ledger.confirmedComplimentaryBookings;

      let b: Bucket = "selling";
      if (session.status === "draft") b = "draft";
      else if (session.status === "cancelled" || session.status === "archived") b = "cancelled";
      else if (session.status === "completed" || lss.status === "Completed") b = "finished";
      else if (lss.status !== "Ready") b = "running";
      else if (["revealed", "check-in-open", "live"].includes(session.status)) b = "ready";

      const base = `/missions/${v.id}`;
      const next =
        b === "draft" ? { label: "Review", href: `${base}/overview` }
        : b === "cancelled" ? { label: "View", href: `${base}/overview` }
        : b === "finished" ? { label: "Report", href: `${base}/summary` }
        : lss.status === "Ended" ? (results.isComplete ? { label: "Finish", href: `${base}/completion` } : { label: "Results", href: `${base}/results` })
        : b === "running" ? { label: "Run", href: `${base}/live` }
        : b === "ready" ? (session.status === "revealed" ? { label: "Check-in", href: `${base}/check-in` } : { label: "Run", href: `${base}/live` })
        : { label: "Prepare", href: `${base}/overview` };

      return { ...v, session, lss, stage, bucket: b, joined, sellable: ledger.sellableCapacity, waitlistCount: ledger.waitlistCount, present: checkIn.presentCount, expected: checkIn.expectedCount, net: money.netRevenue, next };
    });
  }, [state, territory.id]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (bucket === "all" || r.bucket === bucket) && (!q || `${r.title} ${r.activity} ${r.venueName} ${r.id}`.toLowerCase().includes(q)));
  }, [rows, bucket, query]);

  if (!canAccess("/missions")) return <PermissionDenied module="Sessions" />;

  type Row = (typeof rows)[number];
  const columns: Column<Row>[] = [
    {
      key: "session",
      header: "Session",
      render: (r) => (
        <div className="min-w-[200px]">
          <Link href={`/missions/${r.id}/overview`} onClick={(e) => e.stopPropagation()} className="font-medium text-ink-lum hover:text-brand">
            {r.title}
          </Link>
          <p className="text-xs text-ink-mut">
            {r.activity} · {r.venueName}
          </p>
        </div>
      ),
    },
    { key: "when", header: "When", render: (r) => <span className="whitespace-nowrap text-ink-sec">{r.date} · {r.time}</span> },
    {
      key: "booked",
      header: "Booked",
      width: "180px",
      render: (r) => (
        <div className="space-y-1">
          <FillMeter value={fillRate(r.joined, r.sellable)} />
          <p className="text-xs tabular text-ink-mut">
            {r.joined}/{r.sellable}
            {r.waitlistCount ? ` · ${r.waitlistCount} waiting` : ""}
          </p>
        </div>
      ),
    },
    { key: "present", header: "Present", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.expected ? `${r.present}/${r.expected}` : "—"}</span> },
    { key: "net", header: "Net", align: "right", render: (r) => <span className="tabular font-medium text-ink-lum">{inr(r.net)}</span> },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.stage.label} tone={r.stage.tone} /> },
    {
      key: "next",
      header: "",
      align: "right",
      render: (r) => (
        <Link href={r.next.href} onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant={r.bucket === "running" ? "primary" : "secondary"}>
            {r.next.label} <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      ),
    },
  ];

  const running = rows.filter((r) => r.bucket === "running").length;
  const readyCount = rows.filter((r) => r.bucket === "ready").length;
  const seats = rows.filter((r) => r.bucket !== "cancelled" && r.bucket !== "draft");
  const seatFill = fillRate(seats.reduce((a, r) => a + r.joined, 0), seats.reduce((a, r) => a + r.sellable, 0));

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-5 py-7 lg:px-8">
      <PageHeader
        overline={`Operations · ${territory.name}`}
        title="Sessions"
        sub="Every scheduled session from bookings to the final report. Open one to prepare codes and teams, run it, and close it out."
        right={
          <Link href="/missions/new">
            <Button>
              <CalendarPlus className="h-4 w-4" /> Schedule session
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricTile label="Sessions" value={rows.length} detail={`${rows.filter((r) => r.bucket === "selling").length} selling`} icon={<CalendarPlus className="h-4 w-4" />} tone="violet" onClick={() => setBucket("all")} />
        <MetricTile label="Running now" value={running} detail="open, live or paused" icon={<Radio className="h-4 w-4" />} tone={running ? "emerald" : "sky"} onClick={() => setBucket("running")} />
        <MetricTile label="Ready to start" value={readyCount} detail="revealed, waiting for the door" icon={<PlayCircle className="h-4 w-4" />} tone="amber" onClick={() => setBucket("ready")} />
        <MetricTile label="Seats filled" value={`${seatFill}%`} detail="across active sessions" icon={<Users className="h-4 w-4" />} tone="pink" />
      </div>

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <FilterRail options={BUCKETS} value={bucket} onChange={setBucket} />
        <div className="lg:w-72">
          <SearchInput value={query} onChange={setQuery} placeholder="Search sessions…" />
        </div>
      </div>

      <ul className="space-y-3 md:hidden" aria-label="Sessions">
        {filtered.map((r) => (
          <li key={r.id}>
            <Link href={`/missions/${r.id}/overview`} className="block rounded-panel border border-edge bg-white p-4 shadow-lift">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink-lum">{r.title}</p>
                  <p className="text-xs text-ink-mut">
                    {r.date} · {r.time} · {r.venueName}
                  </p>
                </div>
                <StatusChip value={r.stage.label} tone={r.stage.tone} />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <FillMeter value={fillRate(r.joined, r.sellable)} />
                <span className="whitespace-nowrap text-xs tabular text-ink-mut">
                  {r.joined}/{r.sellable} · {inr(r.net)}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold text-brand">
                {r.next.label} <ArrowRight className="inline h-3.5 w-3.5" />
              </p>
            </Link>
          </li>
        ))}
        {filtered.length === 0 && <li className="rounded-panel border border-dashed border-edge-strong bg-white/70 px-6 py-10 text-center text-sm text-ink-mut">{rows.length ? "No sessions match." : "No sessions in this territory."}</li>}
      </ul>

      <div className="hidden md:block">
      <DataTable
        columns={columns}
        rows={filtered}
        onRowClick={(r) => router.push(`/missions/${r.id}/overview`)}
        emptyTitle={rows.length ? "No sessions match" : "No sessions in this territory"}
        emptyLine={rows.length ? "Try another filter or search." : "Schedule a session from a ready experience to get started."}
      />
      </div>
      <p className="flex items-center gap-2 text-xs text-ink-mut">
        <Wallet className="h-3.5 w-3.5" /> Net is collected payments minus refunds for each session.
      </p>
    </div>
  );
}
