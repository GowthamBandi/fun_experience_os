"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { selectStaffDirectory, type StaffViewItem } from "@/lib/prototype/selectors/staff";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { FilterRail, SearchInput } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { useCommandFeedback } from "@/components/ui/toast";
import { PageShell } from "@/components/setup/kit";
import { StaffingNav, useStaffScope } from "@/components/staff/StaffingNav";
import { CalendarClock, UserCheck, UserX, Users } from "lucide-react";

const FILTERS = ["available", "assigned", "checked-in", "off"] as const;

export default function StaffAvailabilityPage() {
  const router = useRouter();
  const { state, canAccess, role, updateCrewMember } = useStore();
  const feedback = useCommandFeedback();
  const scope = useStaffScope();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number] | "all">("all");
  const staff = useMemo(() => selectStaffDirectory(state, scope.territoryId), [state, scope.territoryId]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter((r) => (filter === "all" || r.status === filter) && (!q || `${r.name} ${r.roleLabel} ${r.venueName}`.toLowerCase().includes(q)));
  }, [staff, query, filter]);

  if (!canAccess("/staffing")) return <PermissionDenied module="Staffing" />;
  const canManage = geoCan(role.id, "manage-staff");

  const columns: Column<StaffViewItem>[] = [
    { key: "name", header: "Name", render: (r) => <div><p className="font-semibold text-ink-lum">{r.name}</p><p className="text-xs text-ink-mut">{r.roleLabel}</p></div> },
    { key: "venue", header: "Based at", render: (r) => <span className="text-ink-sec">{r.venueName}</span> },
    { key: "shift", header: "Shift", render: (r) => <span className="tabular text-ink-sec">{r.shiftFrom ? `${r.shiftFrom}–${r.shiftTo}` : "—"}</span> },
    { key: "sessions", header: "Upcoming sessions", render: (r) => (r.sessions.length ? <span className="text-ink-sec">{r.sessions.map((s) => `${s.date} ${s.startTime}`).join(", ")}</span> : <span className="text-ink-mut">None</span>) },
    { key: "conflict", header: "Overlap", render: (r) => (r.doubleBooked ? <StatusChip value="overlapping" tone="danger" /> : <span className="text-ink-mut">—</span>) },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
    {
      key: "act",
      header: "",
      align: "right",
      render: (r) =>
        canManage && (r.status === "available" || r.status === "off") ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={(e) => {
              e.stopPropagation();
              const to = r.status === "off" ? "available" : "off";
              feedback(updateCrewMember(r.id, { status: to }), `${r.name} marked ${to}`);
            }}
          >
            {r.status === "off" ? "Mark available" : "Mark off"}
          </Button>
        ) : null,
    },
  ];

  return (
    <PageShell>
      <PageHeader overline={`Staffing · ${scope.label}`} title="Availability" sub="Who is free, who is working, and who is off. People on upcoming sessions must be removed from them before they can be marked off." />
      <StaffingNav />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Available" value={staff.filter((s) => s.status === "available").length} icon={<Users className="h-4 w-4" />} tone="emerald" />
        <MetricTile label="Assigned" value={staff.filter((s) => s.status === "assigned").length} icon={<CalendarClock className="h-4 w-4" />} tone="sky" />
        <MetricTile label="Checked in" value={staff.filter((s) => s.status === "checked-in").length} icon={<UserCheck className="h-4 w-4" />} />
        <MetricTile label="Off" value={staff.filter((s) => s.status === "off").length} icon={<UserX className="h-4 w-4" />} tone="amber" />
      </div>
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="md:w-72"><SearchInput value={query} onChange={setQuery} placeholder="Search name, role or venue" /></div>
        <FilterRail options={FILTERS} value={filter} onChange={setFilter} />
      </div>
      <DataTable columns={columns} rows={rows} onRowClick={(r) => router.push(`/people/staff/${r.id}`)} emptyTitle={staff.length ? "No one matches" : "No staff yet"} emptyLine={staff.length ? "Clear the search or filter." : "Add staff from the Staff list."} />
    </PageShell>
  );
}
