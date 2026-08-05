"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { venueRows, cityById, type VenueListRow } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { cn, inr } from "@/lib/format";
import { PageFrame, Proto } from "@/components/geo/layout";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip, Badge } from "@/components/ui/primitives";
import { SearchInput, FilterRail } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { Item, Stagger, Tide } from "@/components/motion/Motion";
import { AlertTriangle, ArrowRight, Plus } from "lucide-react";

type StatusFilter = VenueListRow["status"] | "all";
type TypeFilter = "arena" | "club" | "turf" | "all";
type VerifFilter = VenueListRow["verificationStatus"] | "all";
type IndoorFilter = "indoor" | "outdoor" | "all";
type WeatherFilter = "weather-dependent" | "indoor-safe" | "all";
type ViewMode = "table" | "operational" | "city";

const viewLabels: Record<ViewMode, string> = {
  table: "Table",
  operational: "Operational",
  city: "By City",
};

export default function VenuesPage() {
  const router = useRouter();
  const { state, role, canAccess, hydrated } = useStore();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [verifFilter, setVerifFilter] = useState<VerifFilter>("all");
  const [indoorFilter, setIndoorFilter] = useState<IndoorFilter>("all");
  const [weatherFilter, setWeatherFilter] = useState<WeatherFilter>("all");
  const [view, setView] = useState<ViewMode>("table");

  const rows = useMemo(() => venueRows(state), [state]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const venue = state.venues.find((v) => v.id === r.id);
      const matchesQuery =
        !q ||
        r.name.toLowerCase().includes(q) ||
        (venue?.address ?? "").toLowerCase().includes(q) ||
        r.territoryName.toLowerCase().includes(q) ||
        r.cityName.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      const matchesType = typeFilter === "all" || r.type === typeFilter;
      const matchesVerif = verifFilter === "all" || r.verificationStatus === verifFilter;
      const matchesIndoor =
        indoorFilter === "all" || (indoorFilter === "indoor" ? r.isIndoor : !r.isIndoor);
      const matchesWeather =
        weatherFilter === "all" || (weatherFilter === "weather-dependent" ? r.weatherDependent : !r.weatherDependent);
      return matchesQuery && matchesStatus && matchesType && matchesVerif && matchesIndoor && matchesWeather;
    });
  }, [rows, state.venues, query, statusFilter, typeFilter, verifFilter, indoorFilter, weatherFilter]);

  const cityGroups = useMemo(() => {
    const map = new Map<string, VenueListRow[]>();
    for (const r of filtered) {
      const list = map.get(r.cityId) ?? [];
      list.push(r);
      map.set(r.cityId, list);
    }
    return map;
  }, [filtered]);

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/locations")) return <PageFrame><PermissionDenied module="Locations" /></PageFrame>;

  const columns: Column<VenueListRow>[] = [
    {
      key: "venue",
      header: "Venue",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink-lum">{r.name}</p>
          <p className="truncate text-[11px] text-ink-mut">{r.cityName} · {r.territoryName}</p>
        </div>
      ),
    },
    { key: "franchise", header: "Franchise", render: (r) => <span className="text-ink-sec">{r.franchiseName}</span> },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <Badge
          className={cn(
            "border",
            r.type === "arena"
              ? "border-[#4c6fff]/25 bg-[#4c6fff]/12 text-[#9db4ff]"
              : r.type === "club"
                ? "border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]"
                : "border-[#12b76a]/25 bg-[#12b76a]/12 text-[#5fd7a3]",
          )}
        >
          {r.type}
        </Badge>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
    { key: "verification", header: "Verification", render: (r) => <StatusChip value={r.verificationStatus} /> },
    {
      key: "indoor",
      header: "Indoor",
      render: (r) => (
        <Badge
          className={cn(
            "border",
            r.isIndoor
              ? "border-white/8 bg-white/4 text-ink-sec"
              : "border-[#4c6fff]/25 bg-[#4c6fff]/12 text-[#9db4ff]",
          )}
        >
          {r.isIndoor ? "Indoor" : "Outdoor"}
        </Badge>
      ),
    },
    { key: "capacity", header: "Capacity", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.safetyCapacity}</span> },
    { key: "staff", header: "Staff", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.staffCapacity}</span> },
    { key: "pas", header: "PAs", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.playingAreas}</span> },
    { key: "upcoming", header: "Upcoming", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.upcomingSessions}</span> },
    {
      key: "cost",
      header: "Cost/slot",
      align: "right",
      render: (r) => (
        <span className="flex items-center justify-end gap-1.5">
          <span className="tabular font-medium text-ink-lum">{inr(r.costPerSlot)}</span>
          <Proto />
        </span>
      ),
    },
    {
      key: "incidents",
      header: "Incidents",
      align: "right",
      render: (r) => (
        <span className={cn("tabular", r.openIncidents > 0 ? "text-[#ff8f86]" : "text-ink-sec")}>{r.openIncidents}</span>
      ),
    },
    {
      key: "warnings",
      header: "Warnings",
      align: "right",
      render: (r) =>
        r.warnings.length > 0 ? (
          <Badge className="border border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]">{r.warnings.length}</Badge>
        ) : (
          <span className="text-[11px] text-ink-mut">—</span>
        ),
    },
  ];

  return (
    <PageFrame>
      <PageHeader
        overline="Locations · Venues"
        title="Venues"
        sub="Arenas, clubs and turfs where missions run. Playing areas live inside venues."
        right={
          geoCan(role.id, "create-venue") ? (
            <Link href="/locations/venues/new">
              <Button>
                <Plus className="h-4 w-4" />
                New venue
              </Button>
            </Link>
          ) : undefined
        }
      />

      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search venues, addresses, cities…" />
          <FilterRail options={["ready", "maintenance", "closed"] as const} value={statusFilter} onChange={setStatusFilter} />
          <FilterRail options={["arena", "club", "turf"] as const} value={typeFilter} onChange={setTypeFilter} />
          <FilterRail options={["verified", "pending", "failed"] as const} value={verifFilter} onChange={setVerifFilter} />
          <FilterRail options={["indoor", "outdoor"] as const} value={indoorFilter} onChange={setIndoorFilter} />
          <FilterRail options={["weather-dependent", "indoor-safe"] as const} value={weatherFilter} onChange={setWeatherFilter} />
        </div>

        <div className="flex justify-end">
          <div className="inline-flex gap-1 rounded-xl bg-white/4 p-1">
            {(["table", "operational", "city"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ease-light",
                  view === v ? "bg-white/10 text-ink-lum shadow-lift" : "text-ink-mut hover:text-ink-sec",
                )}
              >
                {viewLabels[v]}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            title="No venues yet"
            line="Create your first venue to start scheduling playing areas and missions."
          />
        ) : filtered.length === 0 ? (
          <div className="solid rounded-panel p-10 text-center">
            <p className="text-sm font-medium text-ink-lum">No venues match</p>
            <p className="mt-1 text-sm text-ink-mut">Loosen the search or clear a filter.</p>
          </div>
        ) : view === "table" ? (
          <DataTable
            columns={columns}
            rows={filtered}
            emptyTitle="No venues"
            emptyLine="Try a different filter."
            onRowClick={(r) => router.push(`/locations/venues/${r.id}`)}
          />
        ) : view === "operational" ? (
          <Stagger className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => (
              <Item key={r.id}>
                <div className="glass rounded-panel p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink-lum">{r.name}</p>
                      <p className="truncate text-[11px] text-ink-mut">{r.cityName} · {r.type}</p>
                    </div>
                    <StatusChip value={r.status} />
                  </div>
                  <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                    <div className="solid rounded-xl p-2">
                      <p className="overline">PAs</p>
                      <p className="mt-1 text-lg font-semibold tabular text-ink-lum">{r.playingAreas}</p>
                    </div>
                    <div className="solid rounded-xl p-2">
                      <p className="overline">Upcoming</p>
                      <p className="mt-1 text-lg font-semibold tabular text-ink-lum">{r.upcomingSessions}</p>
                    </div>
                    <div className="solid rounded-xl p-2">
                      <p className="overline">Incidents</p>
                      <p className={cn("mt-1 text-lg font-semibold tabular", r.openIncidents > 0 ? "text-[#ff8f86]" : "text-ink-lum")}>
                        {r.openIncidents}
                      </p>
                    </div>
                  </div>
                  {r.warnings.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {r.warnings.map((w) => (
                        <Badge key={w} className="border border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]">
                          <AlertTriangle className="h-3 w-3" />
                          {w}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <Button
                    variant="secondary"
                    className="mt-4 w-full"
                    onClick={() => router.push(`/locations/venues/${r.id}`)}
                  >
                    Manage
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </Item>
            ))}
          </Stagger>
        ) : (
          <div className="space-y-4">
            {Array.from(cityGroups.entries()).map(([cityId, list]) => {
              const cityName = cityById(state, cityId)?.name ?? cityId;
              return (
                <div key={cityId} className="solid rounded-panel p-5">
                  <div className="flex items-center justify-between gap-2">
                    <Link href={`/cities/${cityId}`} className="font-medium text-ink-lum transition-colors hover:text-ink-sec">
                      {cityName}
                    </Link>
                    <span className="text-[11px] tabular text-ink-mut">{list.length} venues</span>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {list.map((v) => (
                      <Link
                        key={v.id}
                        href={`/locations/venues/${v.id}`}
                        className="flex items-center justify-between gap-3 rounded-xl bg-white/2 px-3 py-2 transition-colors hover:bg-white/4"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-ink-sec">{v.name}</p>
                          <p className="text-[11px] text-ink-mut">
                            {v.type} · {v.playingAreas} PAs · {v.upcomingSessions} upcoming
                          </p>
                        </div>
                        <StatusChip value={v.status} />
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageFrame>
  );
}
