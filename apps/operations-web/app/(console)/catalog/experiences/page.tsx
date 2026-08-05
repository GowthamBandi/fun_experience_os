"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { templateViews, visibleTemplates, type TemplateView } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { cn, inr } from "@/lib/format";
import { PageFrame, Breadcrumbs, PrototypeRoleNote } from "@/components/geo/layout";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Badge, Button, StatusChip } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/table";
import { FilterRail, SearchInput } from "@/components/ui/fields";
import { Stagger, Item, Tide } from "@/components/motion/Motion";
import { Plus, Sparkles } from "lucide-react";

type StatusFilter = "draft" | "ready" | "active" | "paused" | "archived";

export default function ExperiencesPage() {
  const router = useRouter();
  const { state, role, canAccess, hydrated, territory } = useStore();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter | "all">("all");
  const [schedulableOnly, setSchedulableOnly] = useState(false);

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/catalog")) return <PageFrame><PermissionDenied module="Catalog" /></PageFrame>;

  const canManage = geoCan(role.id, "manage-catalog");
  const isScoped = role.id === "venue-manager" || role.id === "city-manager" || role.id === "regional-partner";
  const scopedIds = new Set(visibleTemplates(state, role.id, territory.id).map((t) => t.id));

  const all = templateViews(state).sort((a, b) => b.schedulable ? 1 : -1);
  const rows = all.filter(
    (t) =>
      (status === "all" || t.status === status) &&
      (!schedulableOnly || t.schedulable) &&
      (!isScoped || scopedIds.has(t.id)) &&
      (!query ||
        t.name.toLowerCase().includes(query.toLowerCase()) ||
        t.categoryName.toLowerCase().includes(query.toLowerCase())),
  );

  const columns: Column<TemplateView>[] = [
    {
      key: "template",
      header: "Experience",
      render: (t) => (
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5">
            <Sparkles className="h-4 w-4 text-ink-mut" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-ink-lum">{t.name}</p>
            <p className="text-[11px] text-ink-mut">
              {t.categoryName} · {t.format} · {t.entryType}
            </p>
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (t) => <StatusChip value={t.status} /> },
    {
      key: "schedulable",
      header: "Can schedule",
      render: (t) => (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
            t.schedulable
              ? "border-[#12b76a]/25 bg-[#12b76a]/12 text-[#5fd7a3]"
              : "border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]",
          )}
        >
          {t.schedulable ? "Yes" : "No"}
        </span>
      ),
    },
    { key: "price", header: "Price", align: "right", render: (t) => <span className="text-ink-lum">{inr(t.basePrice)}</span> },
    {
      key: "capacity",
      header: "Capacity",
      align: "right",
      render: (t) => <span className="text-ink-mut">{t.targetParticipants} / {t.maxParticipants}</span>,
    },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      render: (t) => (
        <span className={cn("tabular", t.marginPct < 20 ? "text-[#ff8f86]" : t.marginPct < 40 ? "text-[#ffd28a]" : "text-[#5fd7a3]")}>
          {t.marginPct}%
        </span>
      ),
    },
    {
      key: "venues",
      header: "Venues",
      align: "right",
      render: (t) => (
        <span className={t.compatibleVenues === 0 ? "text-[#ff8f86]" : "text-ink-mut"}>{t.compatibleVenues}</span>
      ),
    },
    {
      key: "scheduled",
      header: "Scheduled",
      align: "right",
      render: (t) => <span className="text-ink-mut">{t.scheduledCount}</span>,
    },
  ];

  return (
    <PageFrame>
      <Breadcrumbs items={[{ label: "Catalog", href: "/catalog" }, { label: "Experiences" }]} />
      <PageHeader
        overline="Catalog · Experiences"
        title="Experience templates"
        sub="The buildable formats — capacity, timing, pricing, reveal keys. Draft templates cannot be scheduled; activation is gated on validation."
        right={
          canManage ? (
            <Button onClick={() => router.push("/catalog/experiences/new")}>
              <Plus className="h-4 w-4" /> New template
            </Button>
          ) : (
            <PrototypeRoleNote />
          )
        }
      />

      {isScoped && (
        <div className="mt-3 rounded-lg border border-[#4c6fff]/20 bg-[#4c6fff]/8 px-3 py-2 text-[11px] text-[#9db4ff]">
          Scoped view: only templates compatible with a venue in {territory.name} are listed.
        </div>
      )}

      <Stagger className="mt-6">
        <Item>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <FilterRail options={["draft", "ready", "active", "paused", "archived"] as const} value={status} onChange={setStatus} />
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-1.5 text-xs text-ink-sec">
                <input
                  type="checkbox"
                  checked={schedulableOnly}
                  onChange={(e) => setSchedulableOnly(e.target.checked)}
                  className="accent-[#4c6fff]"
                />
                Schedulable only
              </label>
            </div>
            <div className="w-64"><SearchInput value={query} onChange={setQuery} placeholder="Find an experience…" /></div>
          </div>
          <DataTable
            columns={columns}
            rows={rows}
            onRowClick={(t) => router.push(`/catalog/experiences/${t.id}`)}
            emptyTitle="No templates."
            emptyLine="Nothing matches this filter yet."
          />
          <div className="mt-3 flex items-center gap-2 text-[11px] text-ink-mut">
            <Badge className="border border-white/8 bg-white/4 text-ink-sec">{rows.length} shown</Badge>
            <Badge className="border border-white/8 bg-white/4 text-ink-sec">readiness runs live on every row</Badge>
          </div>
        </Item>
      </Stagger>
    </PageFrame>
  );
}
