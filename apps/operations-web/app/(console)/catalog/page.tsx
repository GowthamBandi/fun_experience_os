"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { selectCatalogHealth, selectExperienceReadiness } from "@/lib/prototype/selectors/catalog";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { Stagger, Item } from "@/components/motion/Motion";
import {
  CategoryStatusBadge,
  ExperienceStatusBadge,
  CatalogHelpPanel,
  CatalogEmptyState,
} from "@/components/catalog";
import { Sparkles, Layers, Calendar, Plus, ArrowRight, CheckCircle2 } from "lucide-react";

export default function CatalogLandingPage() {
  const router = useRouter();
  const { state, territory, canAccess, role } = useStore();

  const categories = state.categories ?? [];
  const templates = state.templates ?? [];
  const health = selectCatalogHealth(state);

  if (!canAccess("/catalog")) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <PermissionDenied module="Catalog" />
      </div>
    );
  }

  // Single primary action rule
  let primaryActionLabel = "Create Experience";
  let primaryActionHref = "/catalog/experiences/new";

  if (categories.length === 0) {
    primaryActionLabel = "Create Category";
    primaryActionHref = "/catalog/categories/new";
  } else if (health.blockedCount > 0) {
    primaryActionLabel = "Review Readiness";
    primaryActionHref = "/catalog/experiences";
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-8">
      {/* Header */}
      <PageHeader
        overline={`Catalog · ${territory.name}`}
        title="Experiences"
        sub="Create what customers can join, then schedule it at a venue. What experience do you want to offer?"
        right={
          <div className="flex items-center gap-3">
            <ExperienceStatusBadge status={health.status} />
            <Link href={primaryActionHref}>
              <Button variant="primary" className="font-bold">
                <Plus className="w-4 h-4 mr-1" />
                {primaryActionLabel}
              </Button>
            </Link>
          </div>
        }
      />

      {/* 4-Step Operator Workflow Bar */}
      <div className="glass p-4 rounded-2xl border border-white/5 space-y-3">
        <div className="text-xs font-semibold text-ink-sec">Operator Mental Model Workflow:</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-center text-xs">
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <span className="font-bold text-brand block">1. Category</span>
            <span className="text-[11px] text-ink-mut">Activity type</span>
          </div>
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <span className="font-bold text-purple-400 block">2. Experience</span>
            <span className="text-[11px] text-ink-mut">Reusable event plan</span>
          </div>
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <span className="font-bold text-emerald-400 block">3. Readiness</span>
            <span className="text-[11px] text-ink-mut">Review checklist</span>
          </div>
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <span className="font-bold text-emerald-300 block">4. Schedule</span>
            <span className="text-[11px] text-ink-mut">Select venue & time</span>
          </div>
        </div>
      </div>

      {/* Catalog Help Panel */}
      <CatalogHelpPanel />

      {/* SECTION 1 — Categories */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
          <div>
            <h2 className="text-lg font-bold text-ink-lum flex items-center gap-2">
              <Layers className="w-5 h-5 text-brand" />
              <span>1. Activity Categories</span>
            </h2>
            <p className="text-xs text-ink-sec">
              Basic activity types such as Badminton, Box Cricket, Trekking, Social Games.
            </p>
          </div>
          <Link href="/catalog/categories">
            <Button variant="secondary" className="h-8 text-xs font-bold px-3">
              View All Categories ({categories.length})
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>

        {categories.length === 0 ? (
          <CatalogEmptyState
            title="No Activity Categories"
            message="Basic activity types must be created before adding reusable experiences."
            actionLabel="Create Category"
            actionHref="/catalog/categories/new"
          />
        ) : (
          <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {categories.slice(0, 3).map((c) => {
              const catTemplates = templates.filter((t) => t.categoryId === c.id);
              return (
                <Item key={c.id}>
                  <div className="glass p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between space-y-3">
                    <div>
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-bold text-base text-ink-lum">{c.name}</h3>
                        <CategoryStatusBadge status={c.status ?? "active"} size="sm" />
                      </div>
                      <p className="text-xs text-ink-mut line-clamp-2">{c.description || "Activity category"}</p>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between text-xs">
                      <span className="text-ink-sec font-medium">{catTemplates.length} Experiences</span>
                      <Link href={`/catalog/categories/${c.id}`}>
                        <Button variant="ghost" className="h-7 text-xs px-2 font-bold text-brand">
                          Manage Category <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Item>
              );
            })}
          </Stagger>
        )}
      </div>

      {/* SECTION 2 — Experiences (Templates) */}
      <div className="space-y-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/5 pb-3">
          <div>
            <h2 className="text-lg font-bold text-ink-lum flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-purple-400" />
              <span>2. Reusable Experiences</span>
            </h2>
            <p className="text-xs text-ink-sec">
              Reusable event plans such as Saturday Mystery Badminton or Friday Box Cricket Night.
            </p>
          </div>
          <Link href="/catalog/experiences">
            <Button variant="secondary" className="h-8 text-xs font-bold px-3">
              View All Experiences ({templates.length})
              <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          </Link>
        </div>

        {templates.length === 0 ? (
          <CatalogEmptyState
            title="No Experiences Created"
            message="Create your first reusable experience template to define group size, duration, and price defaults."
            actionLabel="Create Experience"
            actionHref="/catalog/experiences/new"
          />
        ) : (
          <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.slice(0, 6).map((t) => {
              const cat = categories.find((c) => c.id === t.categoryId);
              const read = selectExperienceReadiness(t, state);
              const sessionsCount = (state.sessions ?? []).filter((s) => s.templateId === t.id).length;

              return (
                <Item key={t.id}>
                  <div className="glass p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-base text-ink-lum">{t.name}</h3>
                          <span className="text-xs text-purple-400 font-medium">{cat?.name || "Category"}</span>
                        </div>
                        <ExperienceStatusBadge status={read.status} size="sm" />
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs border-t border-white/5 pt-2">
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Price</span>
                          <span className="font-bold text-emerald-400">₹{t.basePrice}</span>
                        </div>
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Capacity</span>
                          <span className="font-bold text-ink-lum">{t.targetParticipants} pax</span>
                        </div>
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Duration</span>
                          <span className="font-bold text-ink-lum">{t.duration}m</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[11px] text-ink-sec">{sessionsCount} scheduled</span>
                      <Link href={read.nextActionHref}>
                        <Button
                          variant={read.schedulable ? "primary" : "secondary"}
                          className="h-7 text-xs font-bold px-3"
                        >
                          {read.nextActionLabel}
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Item>
              );
            })}
          </Stagger>
        )}
      </div>
    </div>
  );
}
