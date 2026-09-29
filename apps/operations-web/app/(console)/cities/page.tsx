"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, CalendarClock, LayoutGrid, MapPin, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { cityRows, type CityListRow } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { StatusChip } from "@/components/ui/primitives";
import { FilterRail, SearchInput, Select } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { Crumbs, EmptyPanel, LinkButton, PageShell } from "@/components/setup/kit";

const STATUSES = ["active", "ready", "draft", "paused"] as const;

export default function CitiesPage() {
  const router = useRouter();
  const { state, canAccess, role } = useStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number] | "all">("all");
  const [territoryId, setTerritoryId] = useState("all");
  const rows = useMemo(() => cityRows(state), [state]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) => (status === "all" || r.status === status) && (territoryId === "all" || r.territoryId === territoryId) && (!q || `${r.name} ${r.state} ${r.managerName}`.toLowerCase().includes(q)),
    );
  }, [rows, query, status, territoryId]);

  if (!canAccess("/cities")) return <PermissionDenied module="Cities" />;
  const canCreate = geoCan(role.id, "create-city");
  const tName = (id: string) => state.territories.find((t) => t.id === id)?.name ?? id;

  const columns: Column<CityListRow>[] = [
    { key: "name", header: "City", render: (r) => <div><p className="font-semibold text-ink-lum">{r.name}</p><p className="text-xs text-ink-mut">{r.state}</p></div> },
    { key: "territory", header: "Territory", render: (r) => <span className="text-ink-sec">{tName(r.territoryId)}</span> },
    { key: "manager", header: "Manager", render: (r) => <span className="text-ink-sec">{r.managerName}</span> },
    { key: "venues", header: "Venues", align: "right", render: (r) => r.venues },
    { key: "areas", header: "Playing areas", align: "right", render: (r) => r.playingAreas },
    { key: "upcoming", header: "Upcoming", align: "right", render: (r) => r.upcomingSessions },
    { key: "launch", header: "Launch", render: (r) => <span className="text-ink-sec tabular">{r.launchDate}</span> },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <PageShell>
      <Crumbs items={[{ label: "Setup", href: "/setup" }, { label: "Cities" }]} />
      <PageHeader
        overline="Setup"
        title="Cities"
        sub="Cities inside your territories. A city is bookable once it is active and has at least one open venue with a playing area."
        right={canCreate && state.territories.length > 0 && <LinkButton href="/cities/new"><Plus className="h-4 w-4" /> New city</LinkButton>}
      />
      {rows.length === 0 ? (
        state.territories.length === 0 ? (
          <EmptyPanel icon={<MapPin className="h-5 w-5" />} title="Add a territory first" line="Cities belong to territories. Create a territory, then add its cities." actionHref="/territories/new" actionLabel="Add a territory" />
        ) : (
          <EmptyPanel icon={<MapPin className="h-5 w-5" />} title="No cities yet" line="Add the first city where you will run sessions." actionHref={canCreate ? "/cities/new" : undefined} actionLabel="Add a city" />
        )
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Cities" value={rows.length} detail={`${rows.filter((r) => r.status === "active").length} active`} icon={<MapPin className="h-4 w-4" />} />
            <MetricTile label="Venues" value={rows.reduce((a, r) => a + r.venues, 0)} detail={`${rows.filter((r) => r.venues === 0).length} cities without one`} icon={<Building2 className="h-4 w-4" />} tone="amber" />
            <MetricTile label="Playing areas" value={rows.reduce((a, r) => a + r.playingAreas, 0)} detail="bookable spaces" icon={<LayoutGrid className="h-4 w-4" />} tone="pink" />
            <MetricTile label="Upcoming sessions" value={rows.reduce((a, r) => a + r.upcomingSessions, 0)} detail="today and tomorrow" icon={<CalendarClock className="h-4 w-4" />} tone="sky" />
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="lg:w-72"><SearchInput value={query} onChange={setQuery} placeholder="Search city, state or manager" /></div>
            <Select value={territoryId} onChange={(e) => setTerritoryId(e.target.value)} aria-label="Filter by territory" className="lg:w-56">
              <option value="all">All territories</option>
              {state.territories.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
            <FilterRail options={STATUSES} value={status} onChange={setStatus} />
          </div>
          <DataTable columns={columns} rows={filtered} onRowClick={(r) => router.push(`/cities/${r.id}`)} emptyTitle="No cities match" emptyLine="Clear the search or filters." />
        </>
      )}
    </PageShell>
  );
}
