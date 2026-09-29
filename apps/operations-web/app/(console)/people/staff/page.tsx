"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectStaffDirectory, type StaffViewItem } from "@/lib/prototype/selectors/staff";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Avatar, StatusChip } from "@/components/ui/primitives";
import { FilterRail, SearchInput, Select } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { Crumbs, EmptyPanel, LinkButton, PageShell } from "@/components/setup/kit";

const FILTERS = ["available", "assigned", "checked-in", "off"] as const;
const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

export default function StaffListPage() {
  const router = useRouter();
  const { state, canAccess, role } = useStore();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number] | "all">("all");
  const [territoryId, setTerritoryId] = useState("all");
  const staff = useMemo(() => selectStaffDirectory(state), [state]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return staff.filter((r) => (filter === "all" || r.status === filter) && (territoryId === "all" || r.territoryId === territoryId) && (!q || `${r.name} ${r.roleLabel} ${r.venueName} ${r.skills.join(" ")}`.toLowerCase().includes(q)));
  }, [staff, query, filter, territoryId]);

  if (!canAccess("/people")) return <PermissionDenied module="People" />;
  const canManage = geoCan(role.id, "manage-staff");
  const noVenues = state.venues.length === 0;

  const columns: Column<StaffViewItem>[] = [
    { key: "name", header: "Name", render: (r) => <div className="flex items-center gap-3"><Avatar initials={initials(r.name)} size="sm" /><div><p className="font-semibold text-ink-lum">{r.name}</p><p className="text-xs text-ink-mut">{r.roleLabel}</p></div></div> },
    { key: "where", header: "Territory · venue", render: (r) => <div><p className="text-ink-sec">{r.territoryName}</p><p className="text-xs text-ink-mut">{r.venueName}</p></div> },
    { key: "next", header: "Next session", render: (r) => <span className="text-ink-sec">{r.currentSessionTitle ?? "—"}</span> },
    { key: "phone", header: "Phone", render: (r) => <span className="text-ink-sec">{r.phone ?? "—"}</span> },
    { key: "done", header: "Sessions worked", align: "right", render: (r) => r.attendanceCount },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <PageShell>
      <Crumbs items={[{ label: "People", href: "/people" }, { label: "Staff" }]} />
      <PageHeader overline="People" title="Staff" sub="Everyone who can be assigned to run a session." right={canManage && !noVenues && <LinkButton href="/people/staff/new"><UserPlus className="h-4 w-4" /> Add staff</LinkButton>} />
      {staff.length === 0 ? (
        noVenues ? (
          <EmptyPanel icon={<Users className="h-5 w-5" />} title="Set up a venue first" line="Staff are based at a venue inside a territory. Finish Setup up to a venue, then add staff." actionHref="/setup" actionLabel="Go to setup" />
        ) : (
          <EmptyPanel icon={<Users className="h-5 w-5" />} title="No staff yet" line="Add the coordinators, safety officers and floor staff who run sessions." actionHref={canManage ? "/people/staff/new" : undefined} actionLabel="Add a staff member" />
        )
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="lg:w-72"><SearchInput value={query} onChange={setQuery} placeholder="Search name, role, venue or skill" /></div>
            <Select value={territoryId} onChange={(e) => setTerritoryId(e.target.value)} aria-label="Filter by territory" className="lg:w-56">
              <option value="all">All territories</option>
              {state.territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <FilterRail options={FILTERS} value={filter} onChange={setFilter} />
          </div>
          <DataTable columns={columns} rows={rows} onRowClick={(r) => router.push(`/people/staff/${r.id}`)} emptyTitle="No one matches" emptyLine="Clear the search or filters." />
        </>
      )}
    </PageShell>
  );
}
