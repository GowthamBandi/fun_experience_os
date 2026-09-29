"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, CalendarCheck2, FileClock, Layers, Plus, Shapes, Sparkles, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { catalogWarnings, selectCatalogHealth, templateViews } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { StatusChip } from "@/components/ui/primitives";
import { EmptyPanel, LinkButton, LinkRows, PageShell, Panel } from "@/components/setup/kit";

export default function CatalogPage() {
  const { state, canAccess, role } = useStore();
  const health = useMemo(() => selectCatalogHealth(state), [state]);
  const warnings = useMemo(() => catalogWarnings(state), [state]);
  const experiences = useMemo(() => templateViews(state), [state]);

  if (!canAccess("/catalog")) return <PermissionDenied module="Catalog" />;
  const canManage = geoCan(role.id, "manage-catalog");
  const noCategories = state.categories.length === 0;
  const recent = [...experiences].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 6);

  return (
    <PageShell>
      <PageHeader
        overline="Operations"
        title="Catalog"
        sub="What you sell: activity categories and the experiences built on them. An experience is a reusable plan — format, group size, price, staffing and reveal rules — that sessions are scheduled from."
        right={
          canManage && (
            <>
              <LinkButton href="/catalog/categories/new" variant="secondary"><Plus className="h-4 w-4" /> New category</LinkButton>
              {!noCategories && <LinkButton href="/catalog/experiences/new"><Plus className="h-4 w-4" /> New experience</LinkButton>}
            </>
          )
        }
      />

      {noCategories ? (
        <EmptyPanel
          icon={<Shapes className="h-5 w-5" />}
          title="Start with an activity category"
          line={canManage ? "Categories (badminton, board games, box cricket…) hold the defaults every experience starts from." : "A Platform Owner, Super Admin, City or Operations Manager sets up the catalog."}
          actionHref={canManage ? "/catalog/categories/new" : undefined}
          actionLabel="Add the first category"
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Categories" value={health.categoryCount} detail={`${state.categories.filter((c) => (c.status ?? "active") === "active").length} active`} icon={<Shapes className="h-4 w-4" />} />
            <MetricTile label="Active experiences" value={health.activeCount} detail={`${health.experienceCount} in total`} icon={<Sparkles className="h-4 w-4" />} tone="emerald" />
            <MetricTile label="Drafts" value={health.draftCount} detail="not yet schedulable" icon={<FileClock className="h-4 w-4" />} tone="sky" />
            <MetricTile label="Blocked" value={health.blockedCount} detail="fail a readiness check" icon={<TriangleAlert className="h-4 w-4" />} tone="amber" />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
            <Panel
              title="Experiences"
              sub="Most recently changed"
              icon={<Layers className="h-4 w-4" />}
              right={<LinkButton href="/catalog/experiences" variant="ghost" size="sm">All experiences <ArrowRight className="h-3.5 w-3.5" /></LinkButton>}
            >
              {recent.length === 0 ? (
                <div className="py-6 text-center">
                  <p className="text-sm text-ink-mut">No experiences yet.</p>
                  {canManage && <LinkButton href="/catalog/experiences/new" size="sm" className="mt-3">Create the first experience</LinkButton>}
                </div>
              ) : (
                <LinkRows
                  empty=""
                  rows={recent.map((t) => ({
                    href: `/catalog/experiences/${t.id}`,
                    title: t.name,
                    meta: `${t.categoryName} · ${inr(t.basePrice)} · ${t.minParticipants}–${t.maxParticipants} people · ${t.scheduledCount} sessions`,
                    right: <StatusChip value={t.status} />,
                  }))}
                />
              )}
            </Panel>
            <Panel title="Needs attention" sub={warnings.length ? `${warnings.length} item${warnings.length === 1 ? "" : "s"}` : "Nothing outstanding"} icon={<TriangleAlert className="h-4 w-4" />}>
              {warnings.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-mut">Every category has experiences and every active experience can be scheduled.</p>
              ) : (
                <LinkRows
                  empty=""
                  rows={warnings.slice(0, 8).map((w) => ({
                    href: w.scope === "category" ? `/catalog/categories/${w.entityId}` : `/catalog/experiences/${w.entityId}`,
                    title: w.name,
                    meta: w.message,
                    right: <StatusChip value={w.level === "error" ? "blocked" : "review"} tone={w.level === "error" ? "danger" : "warn"} />,
                  }))}
                />
              )}
            </Panel>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[
              { href: "/catalog/categories", title: "Categories", line: "Activity types and their defaults.", icon: Shapes },
              { href: "/catalog/experiences", title: "Experiences", line: "Plans that sessions are scheduled from.", icon: Sparkles },
              { href: "/missions/new", title: "Schedule a session", line: "Put an active experience on the calendar.", icon: CalendarCheck2 },
            ].map((c) => (
              <Link key={c.href} href={c.href} className="group flex items-center gap-4 rounded-panel border border-edge bg-white p-5 shadow-panel transition hover:-translate-y-0.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-subtle text-brand"><c.icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink-lum">{c.title}</span>
                  <span className="block text-[13px] text-ink-mut">{c.line}</span>
                </span>
                <ArrowRight className="h-4 w-4 text-ink-mut transition group-hover:translate-x-0.5 group-hover:text-brand" />
              </Link>
            ))}
          </div>
        </>
      )}
    </PageShell>
  );
}
