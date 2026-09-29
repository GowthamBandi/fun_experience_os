"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Shapes } from "lucide-react";
import { useStore } from "@/lib/store";
import { categoryViews, type CategoryView } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { StatusChip } from "@/components/ui/primitives";
import { FilterRail, SearchInput } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { Crumbs, EmptyPanel, LinkButton, PageShell } from "@/components/setup/kit";

const STATUSES = ["active", "draft", "paused", "archived"] as const;

export default function CategoriesPage() {
  const router = useRouter();
  const { state, canAccess, role } = useStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number] | "all">("all");
  const rows = useMemo(() => categoryViews(state), [state]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (status === "all" || r.status === status) && (!q || `${r.name} ${r.shortCode}`.toLowerCase().includes(q)));
  }, [rows, query, status]);

  if (!canAccess("/catalog")) return <PermissionDenied module="Catalog" />;
  const canManage = geoCan(role.id, "manage-catalog");

  const columns: Column<CategoryView>[] = [
    { key: "name", header: "Category", render: (r) => <div><p className="font-semibold text-ink-lum">{r.name}</p><p className="font-mono text-[11px] text-ink-mut">{r.shortCode}</p></div> },
    { key: "risk", header: "Risk", render: (r) => <StatusChip value={r.riskLevel} /> },
    { key: "exp", header: "Experiences", align: "right", render: (r) => `${r.activeTemplates} active / ${r.templates}` },
    { key: "venues", header: "Compatible venues", align: "right", render: (r) => `${r.compatibleVenues} of ${r.totalVenues}` },
    { key: "sessions", header: "Sessions", align: "right", render: (r) => r.scheduledSessions },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <PageShell>
      <Crumbs items={[{ label: "Catalog", href: "/catalog" }, { label: "Categories" }]} />
      <PageHeader overline="Catalog" title="Activity categories" sub="Activity types and the defaults their experiences start from." right={canManage && <LinkButton href="/catalog/categories/new"><Plus className="h-4 w-4" /> New category</LinkButton>} />
      {rows.length === 0 ? (
        <EmptyPanel icon={<Shapes className="h-5 w-5" />} title="No categories yet" line="Add the first activity type you will offer." actionHref={canManage ? "/catalog/categories/new" : undefined} actionLabel="Add a category" />
      ) : (
        <>
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="md:w-72"><SearchInput value={query} onChange={setQuery} placeholder="Search name or code" /></div>
            <FilterRail options={STATUSES} value={status} onChange={setStatus} />
          </div>
          <DataTable columns={columns} rows={filtered} onRowClick={(r) => router.push(`/catalog/categories/${r.id}`)} emptyTitle="No categories match" emptyLine="Clear the search or choose another status." />
        </>
      )}
    </PageShell>
  );
}
