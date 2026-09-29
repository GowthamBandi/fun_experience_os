"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LayoutGrid, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { StatusChip } from "@/components/ui/primitives";
import { FilterRail, SearchInput, Select } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { Crumbs, EmptyPanel, LinkButton, PageShell } from "@/components/setup/kit";

const STATUSES = ["active", "maintenance", "unavailable", "closed"] as const;

interface AreaRow {
  id: string;
  name: string;
  venueId: string;
  venueName: string;
  cityName: string;
  capacity: number;
  staff: number;
  activities: string;
  upcoming: number;
  status: string;
}

export default function PlayingAreasPage() {
  const router = useRouter();
  const { state, canAccess, role } = useStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number] | "all">("all");
  const [venueId, setVenueId] = useState("all");
  const rows = useMemo<AreaRow[]>(
    () =>
      state.playingAreas.map((p) => {
        const venue = state.venues.find((v) => v.id === p.venueId);
        return {
          id: p.id,
          name: p.name,
          venueId: p.venueId,
          venueName: venue?.name ?? "Unknown venue",
          cityName: state.cities.find((c) => c.id === venue?.cityId)?.name ?? "—",
          capacity: p.maxCapacity,
          staff: p.staffCapacity,
          activities: p.activityCompatibility.map((id) => state.categories.find((c) => c.id === id)?.name ?? id).join(", "),
          upcoming: state.sessions.filter((s) => s.playingAreaId === p.id && !["cancelled", "completed", "archived"].includes(s.status)).length,
          status: p.status,
        };
      }),
    [state],
  );
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (status === "all" || r.status === status) && (venueId === "all" || r.venueId === venueId) && (!q || `${r.name} ${r.venueName} ${r.activities}`.toLowerCase().includes(q)));
  }, [rows, query, status, venueId]);

  if (!canAccess("/locations")) return <PermissionDenied module="Playing areas" />;
  const canCreate = geoCan(role.id, "create-playing-area");

  const columns: Column<AreaRow>[] = [
    { key: "name", header: "Playing area", render: (r) => <p className="font-semibold text-ink-lum">{r.name}</p> },
    { key: "venue", header: "Venue", render: (r) => <div><p className="text-ink-sec">{r.venueName}</p><p className="text-xs text-ink-mut">{r.cityName}</p></div> },
    { key: "activities", header: "Activities", render: (r) => <span className="text-ink-sec">{r.activities || "—"}</span> },
    { key: "cap", header: "Capacity", align: "right", render: (r) => r.capacity },
    { key: "staff", header: "Staff", align: "right", render: (r) => r.staff },
    { key: "upcoming", header: "Upcoming", align: "right", render: (r) => r.upcoming },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <PageShell>
      <Crumbs items={[{ label: "Setup", href: "/setup" }, { label: "Locations", href: "/locations" }, { label: "Playing areas" }]} />
      <PageHeader
        overline="Setup · Locations"
        title="Playing areas"
        sub="Courts, pitches, tables and rooms inside venues. A session is always booked onto one playing area, and cannot exceed its capacity."
        right={canCreate && state.venues.length > 0 && <LinkButton href="/locations/playing-areas/new"><Plus className="h-4 w-4" /> New playing area</LinkButton>}
      />
      {rows.length === 0 ? (
        state.venues.length === 0 ? (
          <EmptyPanel icon={<LayoutGrid className="h-5 w-5" />} title="Add a venue first" line="Playing areas live inside venues." actionHref="/locations/venues/new" actionLabel="Add a venue" />
        ) : (
          <EmptyPanel icon={<LayoutGrid className="h-5 w-5" />} title="No playing areas yet" line="Add the courts, pitches, tables or rooms inside your venues." actionHref={canCreate ? "/locations/playing-areas/new" : undefined} actionLabel="Add a playing area" />
        )
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="lg:w-72"><SearchInput value={query} onChange={setQuery} placeholder="Search area, venue or activity" /></div>
            <Select value={venueId} onChange={(e) => setVenueId(e.target.value)} aria-label="Filter by venue" className="lg:w-60">
              <option value="all">All venues</option>
              {state.venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </Select>
            <FilterRail options={STATUSES} value={status} onChange={setStatus} />
          </div>
          <DataTable columns={columns} rows={filtered} onRowClick={(r) => router.push(`/locations/playing-areas/${r.id}`)} emptyTitle="No playing areas match" emptyLine="Clear the search or filters." />
        </>
      )}
    </PageShell>
  );
}
