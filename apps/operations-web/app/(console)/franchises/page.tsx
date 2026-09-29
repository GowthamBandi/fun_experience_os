"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Globe2, IndianRupee, Landmark, Plus, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { franchiseRows, type FranchiseListRow } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { StatusChip } from "@/components/ui/primitives";
import { FilterRail, SearchInput } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { Crumbs, EmptyPanel, LinkButton, PageShell } from "@/components/setup/kit";

const STATUSES = ["active", "inactive", "suspended"] as const;

export default function FranchisesPage() {
  const router = useRouter();
  const { state, canAccess, role } = useStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number] | "all">("all");
  const rows = useMemo(() => franchiseRows(state), [state]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (status === "all" || r.status === status) && (!q || `${r.name} ${r.legalEntity} ${r.franchiseHead}`.toLowerCase().includes(q)));
  }, [rows, query, status]);

  if (!canAccess("/franchises")) return <PermissionDenied module="Franchises" />;
  const canCreate = geoCan(role.id, "create-franchise");

  const columns: Column<FranchiseListRow>[] = [
    {
      key: "name",
      header: "Franchise",
      render: (r) => (
        <div className="min-w-0">
          <p className="font-semibold text-ink-lum">{r.name}</p>
          <p className="text-xs text-ink-mut">{r.legalEntity} · {r.isInternal ? "Internal" : "External"} {r.type}</p>
        </div>
      ),
    },
    { key: "head", header: "Head", render: (r) => <span className="text-ink-sec">{r.franchiseHead}</span> },
    { key: "territories", header: "Territories", align: "right", render: (r) => r.territories },
    { key: "cities", header: "Active cities", align: "right", render: (r) => r.activeCities },
    { key: "venues", header: "Open venues", align: "right", render: (r) => r.activeVenues },
    { key: "upcoming", header: "Upcoming sessions", align: "right", render: (r) => r.upcomingSessions },
    { key: "revenue", header: "Settled revenue", align: "right", render: (r) => inr(r.revenue) },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status === "inactive" ? "paused" : r.status} /> },
  ];

  return (
    <PageShell>
      <Crumbs items={[{ label: "Setup", href: "/setup" }, { label: "Franchises" }]} />
      <PageHeader
        overline="Setup"
        title="Franchises"
        sub="The businesses that run your operating areas. Each franchise owns one or more territories."
        right={
          canCreate && (
            <LinkButton href="/franchises/new">
              <Plus className="h-4 w-4" /> New franchise
            </LinkButton>
          )
        }
      />

      {rows.length === 0 ? (
        <EmptyPanel
          icon={<Landmark className="h-5 w-5" />}
          title="No franchises yet"
          line={canCreate ? "A franchise is the first thing to set up. Territories, cities and venues all sit under it." : "A Platform Owner or Super Admin creates franchises. Ask one to set up the first franchise."}
          actionHref={canCreate ? "/franchises/new" : undefined}
          actionLabel="Create the first franchise"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Franchises" value={rows.length} detail={`${rows.filter((r) => r.status === "active").length} active`} icon={<Landmark className="h-4 w-4" />} />
            <MetricTile label="Territories" value={rows.reduce((a, r) => a + r.territories, 0)} detail="across all franchises" icon={<Globe2 className="h-4 w-4" />} tone="sky" />
            <MetricTile label="Settled revenue" value={inr(rows.reduce((a, r) => a + r.revenue, 0))} detail="payments settled to date" icon={<IndianRupee className="h-4 w-4" />} tone="emerald" />
            <MetricTile label="Need attention" value={rows.filter((r) => r.status !== "active" || r.territories === 0).length} detail="paused, suspended or without territories" icon={<TriangleAlert className="h-4 w-4" />} tone="amber" />
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="md:w-80">
              <SearchInput value={query} onChange={setQuery} placeholder="Search name, entity or head" />
            </div>
            <FilterRail options={STATUSES} value={status} onChange={setStatus} />
          </div>

          <DataTable
            columns={columns}
            rows={filtered}
            onRowClick={(r) => router.push(`/franchises/${r.id}`)}
            emptyTitle="No franchises match"
            emptyLine="Clear the search or choose another status."
          />
        </>
      )}
    </PageShell>
  );
}
