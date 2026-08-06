"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { territoryRows, type TerritoryListRow } from "@/lib/prototype/repositories";
import { selectTerritorySetupHealth } from "@/lib/prototype/selectors/setup";
import { PageFrame } from "@/components/geo/layout";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { DataTable, type Column } from "@/components/ui/table";
import { SearchInput, FilterRail } from "@/components/ui/fields";
import { Button } from "@/components/ui/primitives";
import { Tide } from "@/components/motion/Motion";
import { SetupBackNavigation, SetupPrimaryAction, SetupStatusBadge, SetupEmptyState } from "@/components/setup/shared";
import { cn } from "@/lib/format";

export default function TerritoriesPage() {
  const router = useRouter();
  const { state, canAccess, hydrated } = useStore();
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"table" | "cards">("table");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const rows = useMemo(() => territoryRows(state), [state]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesQuery = !q || r.name.toLowerCase().includes(q) || r.franchiseName.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [rows, query, statusFilter]);

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/territories")) return <PageFrame><PermissionDenied module="Territories" /></PageFrame>;

  const columns: Column<TerritoryListRow>[] = [
    {
      key: "name",
      header: "Territory Name",
      render: (r) => (
        <div>
          <p className="font-medium text-ink-lum">{r.name}</p>
          <p className="text-[11px] text-ink-mut">{r.region} · {r.state}</p>
        </div>
      ),
    },
    { key: "franchise", header: "Parent Franchise", render: (r) => <span className="text-ink-sec">{r.franchiseName}</span> },
    { key: "manager", header: "Manager", render: (r) => <span className="text-ink-sec">{r.managerName}</span> },
    { key: "cities", header: "Cities", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.cities}</span> },
    { key: "venues", header: "Venues", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.venues}</span> },
    { key: "upcoming", header: "Active Events", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.upcomingSessions}</span> },
    {
      key: "health",
      header: "Setup Health",
      render: (r) => {
        const health = selectTerritorySetupHealth(state, r.id);
        return <SetupStatusBadge status={health.status} />;
      },
    },
  ];

  return (
    <PageFrame>
      <div className="mb-6 space-y-4">
        <SetupBackNavigation label="Back to Setup" href="/setup" />
        <PageHeader
          overline="Setup · Territories"
          title="Territories"
          sub="Manage the local operating areas inside each franchise."
          right={
            <SetupPrimaryAction 
              label="Add Territory" 
              href="/territories/new" 
              allowedRoles={["platform-owner", "super-admin", "regional-partner"]} 
            />
          }
        />
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Search territories..." />
            <FilterRail
              options={["active", "draft", "paused", "disabled"]}
              value={statusFilter}
              onChange={setStatusFilter}
            />
          </div>
          <div className="inline-flex gap-1 rounded-xl bg-white/4 p-1">
            <button
              onClick={() => setView("table")}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200", view === "table" ? "bg-white/10 text-ink-lum" : "text-ink-mut hover:text-ink-sec")}
            >
              Table
            </button>
            <button
              onClick={() => setView("cards")}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200", view === "cards" ? "bg-white/10 text-ink-lum" : "text-ink-mut hover:text-ink-sec")}
            >
              Cards
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <SetupEmptyState
            title="No territories created yet"
            message="Divide your franchise regions into local operating areas."
            actionLabel="Add Territory"
            actionHref="/territories/new"
          />
        ) : filtered.length === 0 ? (
          <div className="solid rounded-panel p-10 text-center">
            <p className="text-sm font-medium text-ink-lum">No territories found</p>
            <p className="mt-1 text-sm text-ink-mut">Adjust your filters.</p>
          </div>
        ) : (
          <div className="hidden md:block">
            {view === "table" ? (
              <DataTable
                columns={columns}
                rows={filtered}
                emptyTitle=""
                emptyLine=""
                onRowClick={(r) => router.push(`/territories/${r.id}`)}
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {filtered.map(r => {
                  const health = selectTerritorySetupHealth(state, r.id);
                  return (
                    <div key={r.id} className="glass rounded-panel p-5 space-y-4">
                      <div>
                        <div className="flex items-start justify-between">
                          <div>
                            <h4 className="font-bold text-ink-lum">{r.name}</h4>
                            <p className="text-xs text-ink-sec">{r.franchiseName}</p>
                          </div>
                          <SetupStatusBadge status={health.status} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-ink-mut block">Manager</span>
                          <span className="text-ink-lum">{r.managerName}</span>
                        </div>
                        <div>
                          <span className="text-ink-mut block">Cities</span>
                          <span className="text-ink-lum">{r.cities}</span>
                        </div>
                        <div>
                          <span className="text-ink-mut block">Venues</span>
                          <span className="text-ink-lum">{r.venues}</span>
                        </div>
                        <div>
                          <span className="text-ink-mut block">Active Events</span>
                          <span className="text-ink-lum">{r.upcomingSessions}</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                        <Link href={`/territories/${r.id}`}>
                          <Button variant="secondary" className="text-[11px] h-7 px-3">View Territory</Button>
                        </Link>
                        {health.status !== "complete" && (
                          <Link href={`/cities/new?territoryId=${r.id}`}>
                            <Button variant="primary" className="text-[11px] h-7 px-3">Add City</Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <div className="md:hidden block">
            {filtered.map(r => {
              const health = selectTerritorySetupHealth(state, r.id);
              return (
                <div key={r.id} className="glass rounded-panel p-5 space-y-4 mb-3">
                  <div>
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-ink-lum">{r.name}</h4>
                        <p className="text-xs text-ink-sec">{r.franchiseName}</p>
                      </div>
                      <SetupStatusBadge status={health.status} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-ink-mut block">Manager</span>
                      <span className="text-ink-lum">{r.managerName}</span>
                    </div>
                    <div>
                      <span className="text-ink-mut block">Cities</span>
                      <span className="text-ink-lum">{r.cities}</span>
                    </div>
                    <div>
                      <span className="text-ink-mut block">Venues</span>
                      <span className="text-ink-lum">{r.venues}</span>
                    </div>
                    <div>
                      <span className="text-ink-mut block">Active Events</span>
                      <span className="text-ink-lum">{r.upcomingSessions}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                    <Link href={`/territories/${r.id}`}>
                      <Button variant="secondary" className="text-[11px] h-7 px-3">View Territory</Button>
                    </Link>
                    {health.status !== "complete" && (
                      <Link href={`/cities/new?territoryId=${r.id}`}>
                        <Button variant="primary" className="text-[11px] h-7 px-3">Add City</Button>
                      </Link>
                    )}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </PageFrame>
  );
}
