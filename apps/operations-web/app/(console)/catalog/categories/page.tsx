"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { categoryViews } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { PageFrame, Breadcrumbs, PrototypeRoleNote } from "@/components/geo/layout";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Badge, Button, StatusChip } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { FilterRail, SearchInput } from "@/components/ui/fields";
import { Stagger, Item, Tide } from "@/components/motion/Motion";
import { Layers, Plus } from "lucide-react";
import type { CategoryView } from "@/lib/prototype/repositories";

type StatusFilter = "active" | "draft" | "paused" | "archived";

export default function CategoriesPage() {
  const router = useRouter();
  const { state, role, canAccess, hydrated } = useStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter | "all">("all");

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/catalog")) return <PageFrame><PermissionDenied module="Catalog" /></PageFrame>;

  const canManage = geoCan(role.id, "manage-catalog");
  const all = categoryViews(state).sort((a, b) => b.templates - a.templates);
  const rows = all.filter(
    (c) =>
      (status === "all" || c.status === status) &&
      (!query || c.name.toLowerCase().includes(query.toLowerCase()) || c.shortCode.toLowerCase().includes(query.toLowerCase())),
  );

  const columns: Column<CategoryView>[] = [
    {
      key: "category",
      header: "Category",
      render: (c) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5">
            <Layers className="h-4 w-4 text-ink-mut" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-lum">{c.name}</p>
            <p className="text-[11px] text-ink-mut">{c.shortCode} · {c.riskLevel} risk</p>
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (c) => <StatusChip value={c.status} /> },
    {
      key: "templates",
      header: "Templates",
      align: "right",
      render: (c) => <span className="text-ink-lum">{c.templates}</span>,
    },
    {
      key: "venues",
      header: "Venue coverage",
      align: "right",
      render: (c) => (
        <span className={c.compatibleVenues === 0 ? "text-[#ff8f86]" : "text-ink-sec"}>
          {c.compatibleVenues}/{c.totalVenues}
        </span>
      ),
    },
    {
      key: "territories",
      header: "Territories",
      align: "right",
      render: (c) => <span className="text-ink-mut">{c.territories}</span>,
    },
    {
      key: "sessions",
      header: "Scheduled",
      align: "right",
      render: (c) => <span className="text-ink-mut">{c.scheduledSessions}</span>,
    },
  ];

  return (
    <PageFrame>
      <Breadcrumbs items={[{ label: "Catalog", href: "/catalog" }, { label: "Categories" }]} />
      <PageHeader
        overline="Catalog · Categories"
        title="Activity categories"
        sub="Families of play with shared defaults — staffing, risk, venue compatibility. Paused categories freeze template activation."
        right={
          canManage ? (
            <Button onClick={() => router.push("/catalog/categories/new")}>
              <Plus className="h-4 w-4" /> New category
            </Button>
          ) : (
            <PrototypeRoleNote />
          )
        }
      />

      <Stagger className="mt-6">
        <Item>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <FilterRail
              options={["active", "draft", "paused", "archived"] as const}
              value={status}
              onChange={setStatus}
            />
            <div className="w-64"><SearchInput value={query} onChange={setQuery} placeholder="Find a category…" /></div>
          </div>
          <DataTable
            columns={columns}
            rows={rows}
            onRowClick={(c) => router.push(`/catalog/categories/${c.id}`)}
            emptyTitle="No categories."
            emptyLine="Nothing matches this filter yet."
          />
          <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-mut">
            <Badge className="border border-white/8 bg-white/4 text-ink-sec">{rows.length} shown</Badge>
            <Link href="/catalog/categories/new" className="text-brand hover:underline">or create a new category →</Link>
          </div>
        </Item>
      </Stagger>
    </PageFrame>
  );
}
