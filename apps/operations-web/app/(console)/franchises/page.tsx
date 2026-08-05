"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { franchiseRows, territoryRows, type FranchiseListRow } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { cn, inr, pct } from "@/lib/format";
import { PageFrame, Proto } from "@/components/geo/layout";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip, Badge, FillMeter } from "@/components/ui/primitives";
import { SearchInput, FilterRail, Select } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { Tide } from "@/components/motion/Motion";
import { Plus } from "lucide-react";

type StatusFilter = FranchiseListRow["status"] | "all";
type InternalFilter = "internal" | "external" | "all";
type TerritoryFilter = "all" | "0" | "1-2" | "3+";
type ViewMode = "table" | "hierarchy";

export default function FranchisesPage() {
  const router = useRouter();
  const { state, role, canAccess, hydrated } = useStore();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [internalFilter, setInternalFilter] = useState<InternalFilter>("all");
  const [territoryFilter, setTerritoryFilter] = useState<TerritoryFilter>("all");
  const [view, setView] = useState<ViewMode>("table");

  const rows = useMemo(() => franchiseRows(state), [state]);
  const territories = useMemo(() => territoryRows(state), [state]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesQuery =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.legalEntity.toLowerCase().includes(q) ||
        r.franchiseHead.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      const matchesInternal =
        internalFilter === "all" || (internalFilter === "internal" ? r.isInternal : !r.isInternal);
      const matchesTerritory =
        territoryFilter === "all" ||
        (territoryFilter === "0"
          ? r.territories === 0
          : territoryFilter === "1-2"
            ? r.territories >= 1 && r.territories <= 2
            : r.territories >= 3);
      return matchesQuery && matchesStatus && matchesInternal && matchesTerritory;
    });
  }, [rows, query, statusFilter, internalFilter, territoryFilter]);

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/franchises")) return <PageFrame><PermissionDenied module="Franchises" /></PageFrame>;

  const columns: Column<FranchiseListRow>[] = [
    {
      key: "franchise",
      header: "Franchise",
      render: (r) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-medium text-ink-lum">{r.name}</span>
            <Badge
              className={
                r.type === "master"
                  ? "border border-[#4c6fff]/25 bg-[#4c6fff]/12 text-[#9db4ff]"
                  : "border border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]"
              }
            >
              {r.type}
            </Badge>
            {r.isInternal && <Badge className="border border-[#12b76a]/25 bg-[#12b76a]/12 text-[#5fd7a3]">internal</Badge>}
          </div>
          <p className="truncate text-[11px] text-ink-mut">{r.legalEntity}</p>
        </div>
      ),
    },
    { key: "head", header: "Head", render: (r) => <span className="text-ink-sec">{r.franchiseHead}</span> },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
    { key: "territories", header: "Territories", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.territories}</span> },
    { key: "cities", header: "Cities", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.activeCities}</span> },
    { key: "venues", header: "Venues", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.activeVenues}</span> },
    { key: "upcoming", header: "Upcoming", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.upcomingSessions}</span> },
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
    { key: "refunds", header: "Refunds", align: "right", render: (r) => <span className="tabular text-ink-sec">{pct(r.refundRate)}</span> },
    {
      key: "incidents",
      header: "Incidents",
      align: "right",
      render: (r) => (
        <span className={cn("tabular", r.incidentCount > 0 ? "text-[#ff8f86]" : "text-ink-sec")}>{r.incidentCount}</span>
      ),
    },
    { key: "staffing", header: "Staffing", align: "right", render: (r) => <span className="tabular text-ink-sec">{pct(r.staffingHealth)}</span> },
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
        overline="Franchise Operations · Part P2B"
        title="Franchises"
        sub="Platform partners and chains — master franchises own regions, regional franchises own scopes under them."
        right={
          geoCan(role.id, "create-franchise") ? (
            <Button onClick={() => router.push("/franchises/new")}>
              <Plus className="h-4 w-4" />
              New franchise
            </Button>
          ) : undefined
        }
      />

      <div className="mt-6 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search franchises, entities, heads…" />
          <FilterRail
            options={["active", "inactive", "suspended"] as const}
            value={statusFilter}
            onChange={setStatusFilter}
          />
          <FilterRail
            options={["internal", "external"] as const}
            value={internalFilter}
            onChange={setInternalFilter}
          />
          <Select
            value={territoryFilter}
            onChange={(e) => setTerritoryFilter(e.target.value as TerritoryFilter)}
            className="w-44"
            aria-label="Filter by territory count"
          >
            <option value="all">All territory counts</option>
            <option value="0">No territories</option>
            <option value="1-2">1–2 territories</option>
            <option value="3+">3+ territories</option>
          </Select>
        </div>

        <div className="flex justify-end">
          <div className="inline-flex gap-1 rounded-xl bg-white/4 p-1">
            {(["table", "hierarchy"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-all duration-200 ease-light",
                  view === v ? "bg-white/10 text-ink-lum shadow-lift" : "text-ink-mut hover:text-ink-sec",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {rows.length === 0 ? (
          <EmptyState title="No franchises yet" line="Create your first franchise to start scoping territories under it." />
        ) : filtered.length === 0 ? (
          <div className="solid rounded-panel p-10 text-center">
            <p className="text-sm font-medium text-ink-lum">No franchises match</p>
            <p className="mt-1 text-sm text-ink-mut">Loosen the search or clear a filter.</p>
          </div>
        ) : view === "table" ? (
          <DataTable
            columns={columns}
            rows={filtered}
            emptyTitle="No franchises"
            emptyLine="Try a different filter."
            onRowClick={(r) => router.push(`/franchises/${r.id}`)}
          />
        ) : (
          <div className="space-y-3">
            {filtered.map((f) => {
              const tList = territories.filter((t) => t.franchiseId === f.id);
              return (
                <div key={f.id} className="solid rounded-panel p-5">
                  <button
                    type="button"
                    onClick={() => router.push(`/franchises/${f.id}`)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 text-left"
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-ink-lum">{f.name}</span>
                      <StatusChip value={f.status} />
                    </span>
                    <span className="text-[11px] tabular text-ink-mut">
                      {tList.length} territories · {f.activeCities} cities · {f.activeVenues} venues
                    </span>
                  </button>
                  <div className="mt-3 space-y-1.5">
                    {tList.length === 0 ? (
                      <p className="text-xs text-ink-mut">No territories assigned.</p>
                    ) : (
                      tList.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => router.push(`/territories/${t.id}`)}
                          className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/2 px-3 py-2 text-left transition-colors hover:bg-white/4"
                        >
                          <span className="text-sm text-ink-sec">{t.name}</span>
                          <span className="text-[11px] tabular text-ink-mut">{t.cities} cities · {t.venues} venues</span>
                        </button>
                      ))
                    )}
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
