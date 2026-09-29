"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { templateViews, type TemplateView } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { StatusChip } from "@/components/ui/primitives";
import { FilterRail, SearchInput, Select } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { Crumbs, EmptyPanel, LinkButton, PageShell } from "@/components/setup/kit";

const STATUSES = ["active", "ready", "draft", "paused", "archived"] as const;

export default function ExperiencesPage() {
  const router = useRouter();
  const { state, canAccess, role } = useStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<(typeof STATUSES)[number] | "all">("all");
  const [categoryId, setCategoryId] = useState("all");
  const rows = useMemo(() => templateViews(state), [state]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => (status === "all" || r.status === status) && (categoryId === "all" || r.categoryId === categoryId) && (!q || `${r.name} ${r.categoryName}`.toLowerCase().includes(q)));
  }, [rows, query, status, categoryId]);

  if (!canAccess("/catalog")) return <PermissionDenied module="Catalog" />;
  const canManage = geoCan(role.id, "manage-catalog");
  const hasCategories = state.categories.some((c) => (c.status ?? "active") !== "archived");

  const columns: Column<TemplateView>[] = [
    { key: "name", header: "Experience", render: (r) => <div><p className="font-semibold text-ink-lum">{r.name}</p><p className="text-xs capitalize text-ink-mut">{r.categoryName} · {r.format} · {r.entryType.replace("-", " ")}</p></div> },
    { key: "price", header: "Price", align: "right", render: (r) => inr(r.basePrice) },
    { key: "size", header: "Group size", align: "right", render: (r) => `${r.minParticipants}–${r.maxParticipants}` },
    { key: "venues", header: "Can run at", align: "right", render: (r) => `${r.compatibleVenues} venue${r.compatibleVenues === 1 ? "" : "s"}` },
    { key: "sessions", header: "Sessions", align: "right", render: (r) => r.scheduledCount },
    { key: "margin", header: "Margin at target", align: "right", render: (r) => <span className={r.marginPct < 0 ? "text-red-600" : undefined}>{r.marginPct}%</span> },
    { key: "ready", header: "Schedulable", render: (r) => <StatusChip value={r.schedulable ? "yes" : "no"} tone={r.schedulable ? "ok" : "neutral"} /> },
    { key: "status", header: "Status", render: (r) => <StatusChip value={r.status} /> },
  ];

  return (
    <PageShell>
      <Crumbs items={[{ label: "Catalog", href: "/catalog" }, { label: "Experiences" }]} />
      <PageHeader
        overline="Catalog"
        title="Experiences"
        sub="Reusable plans that sessions are scheduled from. Only active experiences that pass every readiness check can be scheduled."
        right={canManage && hasCategories && <LinkButton href="/catalog/experiences/new"><Plus className="h-4 w-4" /> New experience</LinkButton>}
      />
      {rows.length === 0 ? (
        hasCategories ? (
          <EmptyPanel icon={<Sparkles className="h-5 w-5" />} title="No experiences yet" line="Create the first experience: its format, group size, price, staffing and reveal rules." actionHref={canManage ? "/catalog/experiences/new" : undefined} actionLabel="Create an experience" />
        ) : (
          <EmptyPanel icon={<Sparkles className="h-5 w-5" />} title="Add an activity category first" line="Every experience belongs to a category." actionHref={canManage ? "/catalog/categories/new" : undefined} actionLabel="Add a category" />
        )
      ) : (
        <>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="lg:w-72"><SearchInput value={query} onChange={setQuery} placeholder="Search experiences" /></div>
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Filter by category" className="lg:w-52">
              <option value="all">All categories</option>
              {state.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <FilterRail options={STATUSES} value={status} onChange={setStatus} />
          </div>
          <DataTable columns={columns} rows={filtered} onRowClick={(r) => router.push(`/catalog/experiences/${r.id}`)} emptyTitle="No experiences match" emptyLine="Clear the search or filters." />
        </>
      )}
    </PageShell>
  );
}
