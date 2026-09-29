"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Lock, UserCheck, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectParticipantRows } from "@/lib/prototype/selectors/identity";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip } from "@/components/ui/primitives";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { FilterRail, SearchInput } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";

type Row = ReturnType<typeof selectParticipantRows>[number];
const FILTERS = ["confirmed", "arrived", "not-confirmed"] as const;

export default function ParticipantsDirectoryPage() {
  const { state, territory, canAccess } = useStore();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number] | "all">("all");

  const all = useMemo(() => selectParticipantRows(state).filter((r) => r.session?.territoryId === territory.id), [state, territory.id]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((r) => {
      if (filter === "confirmed" && !r.isEligible) return false;
      if (filter === "not-confirmed" && r.isEligible) return false;
      if (filter === "arrived" && r.checkInStatus !== "checked-in" && r.checkInStatus !== "late") return false;
      if (!needle) return true;
      return `${r.booking.alias} ${r.temporaryCode} ${r.teamName ?? ""} ${r.session ? sessionTitle(state, r.session.id) : ""}`.toLowerCase().includes(needle);
    });
  }, [all, q, filter, state]);

  if (!canAccess("/people/participants")) return <PermissionDenied module="Participants" />;

  const columns: Column<Row>[] = [
    { key: "code", header: "Code", render: (r) => (r.temporaryCode ? <span className="whitespace-nowrap font-mono text-sm font-semibold text-ink-lum">{r.temporaryCode}</span> : <span className="text-ink-mut">—</span>) },
    {
      key: "alias",
      header: "Participant",
      render: (r) => (
        <Link href={`/people/participants/${r.booking.id}`} className="font-medium text-ink-lum hover:text-brand" onClick={(e) => e.stopPropagation()}>
          {r.booking.alias}
        </Link>
      ),
    },
    {
      key: "session",
      header: "Session",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-ink-sec">{r.session ? sessionTitle(state, r.session.id) : r.booking.sessionId}</p>
          <p className="text-xs text-ink-mut">{r.session ? `${r.session.date} · ${r.session.startTime}` : ""}</p>
        </div>
      ),
    },
    { key: "team", header: "Team", render: (r) => <span className="text-ink-sec">{r.teamName ?? "—"}</span> },
    { key: "place", header: "Place", render: (r) => <StatusChip value={r.isEligible ? "confirmed" : r.booking.status} /> },
    { key: "door", header: "Door", render: (r) => <StatusChip value={r.checkInStatus} /> },
  ];

  const confirmed = all.filter((r) => r.isEligible).length;
  const arrived = all.filter((r) => r.checkInStatus === "checked-in" || r.checkInStatus === "late").length;

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 px-5 py-7 lg:px-8">
      <Link href="/people" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-mut hover:text-ink-lum">
        <ArrowLeft className="h-4 w-4" /> People
      </Link>
      <PageHeader
        overline={`People · ${territory.name}`}
        title="Participants"
        sub="Everyone booked on sessions in this territory, shown by alias and temporary code. Contact details stay protected."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
        <MetricTile label="Bookings" value={all.length} detail="excluding the waitlist" icon={<Users className="h-4 w-4" />} tone="violet" />
        <MetricTile label="Confirmed places" value={confirmed} detail={`${all.length - confirmed} not confirmed`} icon={<Lock className="h-4 w-4" />} tone="sky" />
        <MetricTile label="Arrived" value={arrived} detail="checked in or late" icon={<UserCheck className="h-4 w-4" />} tone="emerald" />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="sm:w-80">
          <SearchInput value={q} onChange={setQ} placeholder="Search alias, code, team or session…" />
        </div>
        <FilterRail options={FILTERS} value={filter} onChange={setFilter} />
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        onRowClick={(r) => router.push(`/people/participants/${r.booking.id}`)}
        emptyTitle={all.length ? "Nobody matches" : "No participants yet"}
        emptyLine={all.length ? "Try a different search or filter." : `No bookings on ${territory.name} sessions yet.`}
      />
    </div>
  );
}
