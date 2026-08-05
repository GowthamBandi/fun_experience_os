"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { franchiseRows, territoryRows, type TerritoryListRow } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { cn, inr, pct } from "@/lib/format";
import { PageFrame, Proto } from "@/components/geo/layout";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, PermissionDenied } from "@/components/ui/panels";
import { Badge, Button, FillMeter, StatusChip } from "@/components/ui/primitives";
import { FilterRail, SearchInput } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { Tide } from "@/components/motion/Motion";
import { Plus } from "lucide-react";

type StatusFilter = TerritoryListRow["status"] | "all";
type ViewMode = "table" | "cards" | "franchise";

const staffingTone: Record<string, string> = {
  ok: "border border-[#12b76a]/25 bg-[#12b76a]/12 text-[#5fd7a3]",
  watch: "border border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]",
  critical: "border border-[#f04438]/25 bg-[#f04438]/12 text-[#ff8f86]",
};

export default function TerritoriesPage() {
  const router = useRouter();
  const { state, role, canAccess, hydrated } = useStore();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [franchiseFilter, setFranchiseFilter] = useState<string>("all");
  const [regionFilter, setRegionFilter] = useState<string>("all");
  const [view, setView] = useState<ViewMode>("table");

  const rows = useMemo(() => territoryRows(state), [state]);
  const franchises = useMemo(() => franchiseRows(state), [state]);
  const regions = useMemo(() => [...new Set(rows.map((r) => r.region))], [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesQuery =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.franchiseName.toLowerCase().includes(q) ||
        r.region.toLowerCase().includes(q) ||
        r.state.toLowerCase().includes(q) ||
        r.managerName.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      const matchesFranchise = franchiseFilter === "all" || r.franchiseName === franchiseFilter;
      const matchesRegion = regionFilter === "all" || r.region === regionFilter;
      return matchesQuery && matchesStatus && matchesFranchise && matchesRegion;
    });
  }, [rows, query, statusFilter, franchiseFilter, regionFilter]);

  const byFranchise = useMemo(() => {
    const map = new Map<string, TerritoryListRow[]>();
    for (const r of filtered) {
      const list = map.get(r.franchiseId) ?? [];
      list.push(r);
      map.set(r.franchiseId, list);
    }
    return [...map.entries()];
  }, [filtered]);

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/territories")) return <PageFrame><PermissionDenied module="Territories" /></PageFrame>;

  const columns: Column<TerritoryListRow>[] = [
    {
      key: "territory",
      header: "Territory",
      render: (r) => (
        <div className="min-w-0">
          <p className="font-medium text-ink-lum">{r.name}</p>
          <p className="truncate text-[11px] text-ink-mut">{r.region} · {r.state}</p>
        </div>
      ),
    },
    { key: "franchise", header: "Franchise", render: (r) => <span className="text-ink-sec">{r.franchiseName}</span> },
    { key: "state", header: "State", render: (r) => <span className="text-ink-sec">{r.state}</span> },
    { key: "manager", header: "Manager", render: (r) => <span className="text-ink-sec">{r.managerName}</span> },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
    { key: "cities", header: "Cities", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.cities}</span> },
    { key: "venues", header: "Venues", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.venues}</span> },
    { key: "upcoming", header: "Upcoming", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.upcomingSessions}</span> },
    {
      key: "fill",
      header: "Fill",
      render: (r) => (
        <span className="flex w-24 items-center gap-2">
          <FillMeter value={r.fill} className="flex-1" />
          <span className="tabular text-[11px] text-ink-sec">{pct(r.fill)}</span>
        </span>
      ),
    },
    {
      key: "staffing",
      header: "Staffing",
      render: (r) => <Badge className={cn("capitalize", staffingTone[r.staffingRisk])}>{r.staffingRisk}</Badge>,
    },
    {
      key: "safety",
      header: "Safety signals",
      align: "right",
      render: (r) => (
        <span className={cn("tabular", r.safetySignals > 0 ? "text-[#ff8f86]" : "text-ink-sec")}>{r.safetySignals}</span>
      ),
    },
    {
      key: "revenue",
      header: "Revenue",
      align: "right",
      render: (r) => (
        <span className="flex items-center justify-end gap-1.5">
          <span className="tabular font-medium text-ink-lum">{inr(r.revenue)}</span>
          <Proto />
        </span>
      ),
    },
  ];

  return (
    <PageFrame>
      <PageHeader
        overline="Franchise Operations · Territories"
        title="Territories"
        sub="Scopes under franchises — each territory owns a set of cities, venues and the sessions scheduled across them."
        right={
          geoCan(role.id, "create-territory") ? (
            <Button onClick={() => router.push("/territories/new")}>
              <Plus className="h-4 w-4" />
              New territory
            </Button>
          ) : undefined
        }
      />

      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search territories, franchises, regions…" />
          <FilterRail
            options={["draft", "active", "paused", "disabled"] as const}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <FilterRail
            options={franchises.map((f) => f.name)}
            value={franchiseFilter}
            onChange={setFranchiseFilter}
          />
          <FilterRail options={regions} value={regionFilter} onChange={setRegionFilter} />
        </div>

        <div className="flex justify-end">
          <div className="inline-flex gap-1 rounded-xl bg-white/4 p-1">
            {(["table", "cards", "franchise"] as ViewMode[]).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all duration-200 ease-light",
                  view === v ? "bg-white/10 text-ink-lum shadow-lift" : "text-ink-mut hover:text-ink-sec",
                )}
              >
                {v === "franchise" ? "By Franchise" : v}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No territories yet" line="Create your first territory to scope cities and venues under a franchise." />
        ) : filtered.length === 0 ? (
          <div className="solid rounded-panel p-10 text-center">
            <p className="text-sm font-medium text-ink-lum">No territories match</p>
            <p className="mt-1 text-sm text-ink-mut">Loosen the search or clear a filter.</p>
          </div>
        ) : view === "table" ? (
          <DataTable
            columns={columns}
            rows={filtered}
            emptyTitle="No territories"
            emptyLine="Try a different filter."
            onRowClick={(r) => router.push(`/territories/${r.id}`)}
          />
        ) : view === "cards" ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {filtered.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => router.push(`/territories/${r.id}`)}
                className="glass rounded-panel p-5 text-left transition-colors hover:bg-white/4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-ink-lum">{r.name}</p>
                  <StatusChip value={r.status} />
                </div>
                <p className="mt-0.5 text-[11px] text-ink-mut">{r.region} · {r.state} · {r.franchiseName}</p>
                <div className="mt-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-ink-mut">Manager</span>
                    <span className="text-xs text-ink-sec">{r.managerName}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[11px] text-ink-mut">Cities · Venues · Upcoming</span>
                    <span className="tabular text-xs text-ink-sec">{r.cities} · {r.venues} · {r.upcomingSessions}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex w-24 items-center gap-2">
                      <FillMeter value={r.fill} className="flex-1" />
                      <span className="tabular text-[11px] text-ink-sec">{pct(r.fill)}</span>
                    </span>
                    <Badge className={cn("capitalize", staffingTone[r.staffingRisk])}>{r.staffingRisk}</Badge>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-white/5 pt-2.5">
                    <span className="tabular text-[11px] text-ink-sec">
                      <span className={cn(r.safetySignals > 0 && "text-[#ff8f86]")}>{r.safetySignals} safety signals</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="tabular text-xs font-medium text-ink-lum">{inr(r.revenue)}</span>
                      <Proto />
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {byFranchise.map(([fid, list]) => (
              <div key={fid} className="solid rounded-panel p-5">
                <Link
                  href={`/franchises/${fid}`}
                  className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                >
                  <span className="font-medium text-ink-lum">{list[0].franchiseName}</span>
                  <span className="text-[11px] tabular text-ink-mut">{list.length} territories</span>
                </Link>
                <div className="mt-3 space-y-1.5">
                  {list.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => router.push(`/territories/${t.id}`)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/2 px-3 py-2 text-left transition-colors hover:bg-white/4"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink-sec">{t.name}</span>
                        <span className="block text-[11px] text-ink-mut">{t.region} · {t.state}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="tabular text-[11px] text-ink-mut">{t.cities} cities · {t.venues} venues</span>
                        <StatusChip value={t.status} />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PageFrame>
  );
}
