"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import {
  categoryStatusCounts,
  catalogWarnings,
  templateStatusCounts,
  templateReadiness,
  templateById,
  categoryViews,
} from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { cn, pct } from "@/lib/format";
import { PageFrame, Breadcrumbs, PrototypeRoleNote } from "@/components/geo/layout";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Badge, Button, StatusChip } from "@/components/ui/primitives";
import { Item, Stagger, Tide } from "@/components/motion/Motion";
import { AlertTriangle, Layers, Plus, Shapes, Sparkles } from "lucide-react";
import { StatCard } from "@/components/catalog/CatalogBits";

export default function CatalogCommandPage() {
  const router = useRouter();
  const { state, role, canAccess, hydrated } = useStore();

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/catalog")) return <PageFrame><PermissionDenied module="Catalog" /></PageFrame>;

  const catCounts = categoryStatusCounts(state);
  const tplCounts = templateStatusCounts(state);
  const warnings = catalogWarnings(state);
  const catViews = categoryViews(state);
  const canManage = geoCan(role.id, "manage-catalog");

  const templates = state.templates
    .map((t) => ({ t, read: templateReadiness(state, t) }))
    .sort((a, b) => Number(a.read.schedulable) - Number(b.read.schedulable));

  const schedulableShare = tplCounts.total ? Math.round((tplCounts.active / tplCounts.total) * 100) : 0;
  const warningsByScope = (scope: "category" | "template") => warnings.filter((w) => w.scope === scope);

  return (
    <PageFrame>
      <Breadcrumbs items={[{ label: "Catalog" }]} />
      <PageHeader
        overline="Catalog Operations · SA-P2C"
        title="Catalog command"
        sub="The operating spine of the platform — activity categories, experience templates, and the readiness gates that decide what can be scheduled."
        right={
          canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => router.push("/catalog/categories/new")}>
                <Layers className="h-4 w-4" /> New category
              </Button>
              <Button onClick={() => router.push("/catalog/experiences/new")}>
                <Plus className="h-4 w-4" /> New template
              </Button>
            </div>
          ) : (
            <PrototypeRoleNote />
          )
        }
      />

      <Stagger className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Item><StatCard label="Categories" value={catCounts.total} hint={`${catCounts.active} active`} tone="ok" /></Item>
        <Item><StatCard label="Templates" value={tplCounts.total} hint={`${tplCounts.active} active`} /></Item>
        <Item><StatCard label="Ready" value={tplCounts.ready} hint="Validated, awaiting activation" tone="ok" /></Item>
        <Item><StatCard label="In draft" value={tplCounts.draft} hint="Not schedulable until activated" tone="warm" /></Item>
        <Item>
          <StatCard
            label="Schedulable share"
            value={pct(schedulableShare)}
            hint={schedulableShare < 50 ? "Mostly draft or paused" : "Mostly on the shelf"}
            tone={schedulableShare >= 60 ? "ok" : "warm"}
          />
        </Item>
      </Stagger>

      {warnings.length > 0 && (
        <Card className="mt-4 border border-warning/15 bg-warning/5">
          <PanelHeader
            title="Catalog health"
            sub="Conditions that need an operator's eyes"
            right={<Badge className="border border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]">{warnings.length}</Badge>}
          />
          <div className="mt-3 grid gap-1.5 md:grid-cols-2">
            {warnings.map((w, i) => (
              <Link
                key={i}
                href={w.scope === "category" ? `/catalog/categories/${w.entityId}` : `/catalog/experiences/${w.entityId}`}
                className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/3 px-3 py-2 text-xs transition hover:bg-white/5"
              >
                <AlertTriangle className={cn("mt-0.5 h-3.5 w-3.5 shrink-0", w.level === "error" ? "text-[#ff8f86]" : "text-[#ffc46b]")} />
                <span className="min-w-0">
                  <span className="font-medium text-ink-lum">{w.name}</span>
                  <span className="text-ink-mut"> — {w.message}</span>
                </span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <PanelHeader
            title="Categories"
            sub="Activity families and their venue coverage"
            right={
              <Link href="/catalog/categories">
                <Badge className="border border-white/8 bg-white/4 text-ink-sec hover:bg-white/8">{catViews.length}</Badge>
              </Link>
            }
          />
          <div className="mt-3 space-y-1.5">
            {catViews.map((c) => (
              <Link
                key={c.id}
                href={`/catalog/categories/${c.id}`}
                className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/4"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <Shapes className="h-4 w-4 shrink-0 text-ink-mut" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-lum">{c.name}</p>
                    <p className="text-[11px] text-ink-mut">
                      {c.templates} templates · {c.compatibleVenues}/{c.totalVenues} venues · {c.territories} territories
                    </p>
                  </div>
                </div>
                <StatusChip value={c.status} />
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Experience templates"
            sub="Readiness runs live against every template"
            right={
              <Link href="/catalog/experiences">
                <Badge className="border border-white/8 bg-white/4 text-ink-sec hover:bg-white/8">{tplCounts.total}</Badge>
              </Link>
            }
          />
          <div className="mt-3 space-y-1.5">
            {templates.slice(0, 8).map(({ t, read }) => {
              const cat = templateById(state, t.categoryId);
              return (
                <Link
                  key={t.id}
                  href={`/catalog/experiences/${t.id}`}
                  className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-lum">{t.name}</p>
                    <p className="text-[11px] text-ink-mut">{cat?.name ?? t.categoryId}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        read.schedulable ? "bg-[#5fd7a3]" : read.ready ? "bg-[#9db4ff]" : "bg-[#ff8f86]",
                      )}
                      title={read.schedulable ? "Schedulable" : read.ready ? "Ready" : "Needs work"}
                    />
                    <StatusChip value={t.status} />
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
        <Link href="/catalog/categories">
          <Card className="h-full transition hover:bg-white/4">
            <p className="overline flex items-center gap-1.5"><Layers className="h-3.5 w-3.5" /> Category workspace</p>
            <p className="mt-2 text-sm text-ink-sec">Manage activity families, defaults and venue compatibility.</p>
            <p className="mt-2 text-[11px] text-ink-mut">
              {warningsByScope("category").length} open warnings
            </p>
          </Card>
        </Link>
        <Link href="/catalog/experiences">
          <Card className="h-full transition hover:bg-white/4">
            <p className="overline flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Experience workspace</p>
            <p className="mt-2 text-sm text-ink-sec">Build formats, pricing, reveal keys and readiness.</p>
            <p className="mt-2 text-[11px] text-ink-mut">
              {warningsByScope("template").length} open warnings · {tplCounts.draft} drafts
            </p>
          </Card>
        </Link>
        <Card className="h-full">
          <p className="overline">The shelf rule</p>
          <p className="mt-2 text-sm text-ink-sec">
            Templates are paused, never deleted. Drafts cannot be scheduled. Activation is gated on critical validation only.
          </p>
        </Card>
      </div>
    </PageFrame>
  );
}
