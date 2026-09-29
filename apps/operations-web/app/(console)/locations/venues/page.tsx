"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { venueRows, type VenueListRow } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { StatusChip } from "@/components/ui/primitives";
import { FilterRail, SearchInput, Select } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { Crumbs, EmptyPanel, LinkButton, PageShell } from "@/components/setup/kit";

const STATUSES = ["ready", "maintenance", "closed"] as const;

export default function VenuesPage() {
  const router = useRouter();
  const { state, canAccess, role } = useStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number] | "all">("all");
  const [cityId, setCityId] = useState("all");
  const rows = useMemo(() => venueRows(state), [state]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (status === "all" || r.status === status) && (cityId === "all" || r.cityId === cityId) && (!q || `${r.name} ${r.cityName} ${r.territoryName} ${r.type}`.toLowerCase().includes(q)));
  }, [rows, query, status, cityId]);

  if (!canAccess("/locations")) return <PermissionDenied module="Venues" />;
  const canCreate = geoCan(role.id, "create-venue");

  const columns: Column<VenueListRow>[] = [
    { key: "name", header: "Venue", render: (r) => <div><p className="font-semibold text-ink-lum">{r.name}</p><p className="text-xs capitalize text-ink-mut">{r.type} · {r.isIndoor ? "Indoor" : "Outdoor"}</p></div> },
    { key: "city", header: "City", render: (r) => <div><p className="text-ink-sec">{r.cityName}</p><p className="text-xs text-ink-mut">{r.territoryName}</p></div> },
    { key: "cap", header: "Safe capacity", align: "right", render: (r) => r.safetyCapacity },
    { key: "areas", header: "Playing areas", align: "right", render: (r) => r.playingAreas },
    { key: "upcoming", header: "Upcoming", align: "right", render: (r) => r.upcomingSessions },
    { key: "cost", header: "Cost / slot", align: "right", render: (r) => (r.costPerSlot ? inr(r.costPerSlot) : "—") },
    { key: "verified", header: "Safety check", render: (r) => <StatusChip value={r.verificationStatus} /> },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status === "ready" ? "open" : r.status} /> },
  ];

  return (
    <PageShell>
      <Crumbs items={[{ label: "Setup", href: "/setup" }, { label: "Locations", href: "/locations" }, { label: "Venues" }]} />
      <PageHeader
        overline="Setup · Locations"
        title="Venues"
        sub="Buildings and grounds where sessions run. A venue needs at least one active playing area before sessions can be scheduled there."
        right={canCreate && state.cities.length > 0 && <LinkButton href="/locations/venues/new"><Plus className="h-4 w-4" /> New venue</LinkButton>}
      />
      {rows.length === 0 ? (
        state.cities.length === 0 ? (
          <EmptyPanel icon={<Building2 className="h-5 w-5" />} title="Add a city first" line="Venues sit inside cities. Add a city, then its venues." actionHref="/cities/new" actionLabel="Add a city" />
        ) : (
          <EmptyPanel icon={<Building2 className="h-5 w-5" />} title="No venues yet" line="Add the first venue where customers will arrive." actionHref={canCreate ? "/locations/venues/new" : undefined} actionLabel="Add a venue" />
        )
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="lg:w-72"><SearchInput value={query} onChange={setQuery} placeholder="Search venue, city or type" /></div>
            <Select value={cityId} onChange={(e) => setCityId(e.target.value)} aria-label="Filter by city" className="lg:w-56">
              <option value="all">All cities</option>
              {state.cities.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <FilterRail options={STATUSES} value={status} onChange={setStatus} />
          </div>
          <DataTable columns={columns} rows={filtered} onRowClick={(r) => router.push(`/locations/venues/${r.id}`)} emptyTitle="No venues match" emptyLine="Clear the search or filters." />
        </>
      )}
    </PageShell>
  );
}
