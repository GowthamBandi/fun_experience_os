"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, Globe2, MapPin, Plus, ShieldAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { territoryRows, type TerritoryListRow } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { StatusChip } from "@/components/ui/primitives";
import { FilterRail, SearchInput } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { Crumbs, EmptyPanel, LinkButton, PageShell } from "@/components/setup/kit";

const STATUSES = ["active", "draft", "paused", "disabled"] as const;

export default function TerritoriesPage() {
  const router = useRouter();
  const { state, canAccess, role } = useStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number] | "all">("all");
  const rows = useMemo(() => territoryRows(state), [state]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (status === "all" || r.status === status) && (!q || `${r.name} ${r.state} ${r.region} ${r.franchiseName} ${r.managerName}`.toLowerCase().includes(q)));
  }, [rows, query, status]);

  if (!canAccess("/territories")) return <PermissionDenied module="Territories" />;
  const canCreate = geoCan(role.id, "create-territory");
  const noFranchise = state.franchises.length === 0;

  const columns: Column<TerritoryListRow>[] = [
    {
      key: "name",
      header: "Territory",
      render: (r) => (
        <div>
          <p className="font-semibold text-ink-lum">{r.name}</p>
          <p className="text-xs text-ink-mut">{r.state}{r.region ? ` · ${r.region}` : ""}</p>
        </div>
      ),
    },
    { key: "franchise", header: "Franchise", render: (r) => <span className="text-ink-sec">{r.franchiseName}</span> },
    { key: "manager", header: "Manager", render: (r) => <span className="text-ink-sec">{r.managerName}</span> },
    { key: "cities", header: "Cities", align: "right", render: (r) => r.cities },
    { key: "venues", header: "Venues", align: "right", render: (r) => r.venues },
    { key: "upcoming", header: "Upcoming", align: "right", render: (r) => r.upcomingSessions },
    { key: "fill", header: "Avg fill", align: "right", render: (r) => (r.upcomingSessions ? `${r.fill}%` : "—") },
    { key: "staff", header: "Staffing", render: (r) => <StatusChip value={r.staffingRisk === "ok" ? "ready" : r.staffingRisk === "watch" ? "monitoring" : "critical"} /> },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <PageShell>
      <Crumbs items={[{ label: "Setup", href: "/setup" }, { label: "Territories" }]} />
      <PageHeader
        overline="Setup"
        title="Territories"
        sub="Regions your franchises run. A territory sets the manager, time zone and currency for its cities, venues, staff and sessions."
        right={
          canCreate &&
          !noFranchise && (
            <LinkButton href="/territories/new">
              <Plus className="h-4 w-4" /> New territory
            </LinkButton>
          )
        }
      />

      {rows.length === 0 ? (
        noFranchise ? (
          <EmptyPanel icon={<Globe2 className="h-5 w-5" />} title="Create a franchise first" line="Every territory belongs to a franchise. Set up the franchise, then come back to add its territories." actionHref="/franchises/new" actionLabel="Create a franchise" />
        ) : (
          <EmptyPanel icon={<Globe2 className="h-5 w-5" />} title="No territories yet" line="Add the first region your franchise will run." actionHref={canCreate ? "/territories/new" : undefined} actionLabel="Add a territory" />
        )
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Territories" value={rows.length} detail={`${rows.filter((r) => r.status === "active").length} active`} icon={<Globe2 className="h-4 w-4" />} />
            <MetricTile label="Cities" value={rows.reduce((a, r) => a + r.cities, 0)} detail={`${rows.reduce((a, r) => a + r.venues, 0)} venues`} icon={<MapPin className="h-4 w-4" />} tone="emerald" />
            <MetricTile label="Upcoming sessions" value={rows.reduce((a, r) => a + r.upcomingSessions, 0)} detail="today and tomorrow" icon={<CalendarClock className="h-4 w-4" />} tone="sky" />
            <MetricTile label="Safety signals" value={rows.reduce((a, r) => a + r.safetySignals, 0)} detail="alerts and open incidents" icon={<ShieldAlert className="h-4 w-4" />} tone="rose" />
          </div>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="md:w-80">
              <SearchInput value={query} onChange={setQuery} placeholder="Search name, state, franchise, manager" />
            </div>
            <FilterRail options={STATUSES} value={status} onChange={setStatus} />
          </div>
          <DataTable columns={columns} rows={filtered} onRowClick={(r) => router.push(`/territories/${r.id}`)} emptyTitle="No territories match" emptyLine="Clear the search or choose another status." />
        </>
      )}
    </PageShell>
  );
}
