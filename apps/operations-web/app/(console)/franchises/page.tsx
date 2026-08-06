"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { franchiseRows, type FranchiseListRow } from "@/lib/prototype/repositories";
import { selectFranchiseSetupHealth } from "@/lib/prototype/selectors/setup";
import { PageFrame } from "@/components/geo/layout";
import { Tide } from "@/components/motion/Motion";
import { SearchInput, FilterRail } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { Button } from "@/components/ui/primitives";
import { 
  SetupBackNavigation, 
  SetupEmptyState, 
  SetupNextStep, 
  SetupPrimaryAction, 
  SetupStatusBadge 
} from "@/components/setup/shared";
import { PermissionDenied } from "@/components/ui/panels";

type StatusFilter = FranchiseListRow["status"] | "all";

export default function FranchisesPage() {
  const router = useRouter();
  const { state, canAccess, hydrated } = useStore();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const rows = useMemo(() => franchiseRows(state), [state]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const matchesQuery =
        !q ||
        r.name.toLowerCase().includes(q) ||
        r.legalEntity.toLowerCase().includes(q) ||
        r.franchiseHead.toLowerCase().includes(q);
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [rows, query, statusFilter]);

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/franchises")) return <PageFrame><PermissionDenied module="Franchises" /></PageFrame>;

  const getNextAction = (r: FranchiseListRow) => {
    if (r.territories === 0) {
      return { label: "Add First Territory", href: `/territories/new?franchiseId=${r.id}` };
    }
    if (r.activeCities === 0) {
      return { label: "Add City", href: `/cities/new?franchiseId=${r.id}` };
    }
    if (r.activeVenues === 0) {
      return { label: "Create Venue", href: `/venues/new?franchiseId=${r.id}` };
    }
    return { label: "View Operations", href: `/franchises/${r.id}` };
  };

  const columns: Column<FranchiseListRow>[] = [
    {
      key: "franchise",
      header: "Franchise Name",
      render: (r) => (
        <div>
          <div className="font-medium text-ink-lum">{r.name}</div>
        </div>
      ),
    },
    { key: "head", header: "Operating Head", render: (r) => <span className="text-ink-sec">{r.franchiseHead}</span> },
    { key: "territories", header: "Territories", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.territories}</span> },
    { key: "cities", header: "Cities", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.activeCities}</span> },
    { key: "venues", header: "Venues", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.activeVenues}</span> },
    { key: "upcoming", header: "Active Events", align: "right", render: (r) => <span className="tabular text-ink-sec">{r.upcomingSessions}</span> },
    {
      key: "status",
      header: "Setup Status",
      render: (r) => {
        const health = selectFranchiseSetupHealth(state, r.id);
        return <SetupStatusBadge status={health.status} />;
      },
    },
    {
      key: "action",
      header: "Next Action",
      align: "right",
      render: (r) => {
        const nextAction = getNextAction(r);
        return (
          <Button variant="secondary" className="h-7 text-xs px-2.5" onClick={() => router.push(nextAction.href)}>
            {nextAction.label}
          </Button>
        );
      },
    },
  ];

  return (
    <PageFrame>
      <div className="max-w-7xl mx-auto space-y-6 pb-20">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-1">
            <SetupBackNavigation label="Back to Setup" href="/setup" />
            <h1 className="text-2xl font-semibold text-ink-lum">Franchises</h1>
            <p className="text-sm text-ink-mut">Create the regional organizations responsible for running events.</p>
          </div>
          <SetupPrimaryAction 
            label="Create Franchise" 
            href="/franchises/new" 
            allowedRoles={["platform-owner", "super-admin"]} 
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SearchInput value={query} onChange={setQuery} placeholder="Search franchises..." />
          <FilterRail
            options={["active", "inactive", "suspended"] as const}
            value={statusFilter}
            onChange={setStatusFilter}
          />
        </div>

        {rows.length === 0 ? (
          <SetupEmptyState 
            title="No franchises yet" 
            message="Create your first franchise to start assigning territories."
            actionLabel="Create Franchise"
            actionHref="/franchises/new"
          />
        ) : filtered.length === 0 ? (
          <div className="solid rounded-panel p-10 text-center">
            <p className="text-sm font-medium text-ink-lum">No franchises match</p>
            <p className="mt-1 text-sm text-ink-mut">Loosen the search or clear a filter.</p>
          </div>
        ) : (
          <>
            <div className="hidden md:block">
              <DataTable
                columns={columns}
                rows={filtered}
                emptyTitle="No franchises"
                emptyLine="Try a different filter."
                onRowClick={(r) => router.push(`/franchises/${r.id}`)}
              />
            </div>
            
            <div className="grid grid-cols-1 gap-4 md:hidden">
              {filtered.map((r) => {
                const health = selectFranchiseSetupHealth(state, r.id);
                const nextAction = getNextAction(r);
                return (
                  <div 
                    key={r.id} 
                    className="solid rounded-panel p-4 flex flex-col gap-4 cursor-pointer hover:bg-white/2 transition-colors"
                    onClick={() => router.push(`/franchises/${r.id}`)}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-ink-lum">{r.name}</div>
                        <div className="text-sm text-ink-sec">{r.franchiseHead}</div>
                      </div>
                      <SetupStatusBadge status={health.status} />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="flex flex-col">
                        <span className="text-ink-mut text-xs">Territories</span>
                        <span className="text-ink-sec">{r.territories}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-ink-mut text-xs">Cities</span>
                        <span className="text-ink-sec">{r.activeCities}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-ink-mut text-xs">Venues</span>
                        <span className="text-ink-sec">{r.activeVenues}</span>
                      </div>
                      <div className="flex flex-col">
                        <span className="text-ink-mut text-xs">Active Events</span>
                        <span className="text-ink-sec">{r.upcomingSessions}</span>
                      </div>
                    </div>
                    
                    <div className="pt-2 border-t border-white/10" onClick={(e) => e.stopPropagation()}>
                      <Button variant="secondary" className="w-full text-xs font-bold" onClick={() => router.push(nextAction.href)}>
                        {nextAction.label}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </PageFrame>
  );
}
