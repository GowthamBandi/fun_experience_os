"use client";

import { use } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectCategoryHealth, selectExperienceReadiness } from "@/lib/prototype/selectors/catalog";
import { PageHeader } from "@/components/ui/PageHeader";
import { CatalogBackNavigation, CategoryStatusBadge, ExperienceStatusBadge } from "@/components/catalog";
import { Button, StatusChip } from "@/components/ui/primitives";
import { Layers, Sparkles, Plus, ArrowRight } from "lucide-react";

export default function CategoryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: categoryId } = use(params);
  const { state } = useStore();

  const categories = state.categories ?? [];
  const templates = state.templates ?? [];

  const category = categories.find((c) => c.id === categoryId);

  if (!category) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-lum">Category Not Found</h2>
        <p className="text-xs text-ink-sec">The requested category does not exist in prototype state.</p>
        <Link href="/catalog/categories">
          <Button variant="primary">Return to Categories</Button>
        </Link>
      </div>
    );
  }

  const catTemplates = templates.filter((t) => t.categoryId === category.id);
  const health = selectCategoryHealth(category, state);

  // Derive single primary action
  let primaryActionLabel = "Create Experience";
  let primaryActionHref = `/catalog/experiences/new?categoryId=${category.id}`;

  if (catTemplates.length > 0) {
    const readyTemplates = catTemplates.filter((t) => selectExperienceReadiness(t, state).schedulable);
    if (readyTemplates.length > 0) {
      primaryActionLabel = "Schedule Event";
      primaryActionHref = `/missions/new?experienceId=${readyTemplates[0].id}`;
    } else {
      primaryActionLabel = "Review Experience Setup";
      primaryActionHref = `/catalog/experiences/${catTemplates[0].id}`;
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <CatalogBackNavigation
        label="Back to Categories"
        href="/catalog/categories"
        breadcrumbs={[
          { label: "Categories", href: "/catalog/categories" },
          { label: category.name, href: `/catalog/categories/${category.id}` },
        ]}
      />

      <PageHeader
        overline={`Category Details · ${category.visualTreatment || "Standard"}`}
        title={category.name}
        sub={category.description || "Activity category for organizing reusable experience plans."}
        right={
          <div className="flex items-center gap-3">
            <CategoryStatusBadge status={health.status} />
            <Link href={primaryActionHref}>
              <Button variant="primary" className="font-bold text-xs">
                {primaryActionLabel}
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        }
      />

      {/* Category Overview Card */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass p-5 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Format & Type</span>
          <p className="text-lg font-bold text-ink-lum capitalize">{category.visualTreatment || "Sport"}</p>
          <p className="text-xs text-ink-sec">Risk level: {category.riskLevel || "low"}</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Compatible Spaces</span>
          <p className="text-lg font-bold text-ink-lum">{category.isIndoor ? "Indoor Facility" : "Outdoor Space"}</p>
          <p className="text-xs text-ink-sec">Courts, fields, or rooms</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Associated Experiences</span>
          <p className="text-3xl font-bold text-ink-lum">{catTemplates.length}</p>
          <p className="text-xs text-ink-sec">{health.activeExperiences} active plans</p>
        </div>
      </div>

      {/* Experiences in Category */}
      <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h3 className="text-base font-bold text-ink-lum">Experiences in {category.name}</h3>
            <p className="text-xs text-ink-sec">Reusable event plans belonging to this category.</p>
          </div>
          <Link href={`/catalog/experiences/new?categoryId=${category.id}`}>
            <Button variant="primary" className="font-bold text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Create Experience
            </Button>
          </Link>
        </div>

        {catTemplates.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-mut space-y-3">
            <p>No reusable experiences have been created under this category yet.</p>
            <Link href={`/catalog/experiences/new?categoryId=${category.id}`}>
              <Button variant="primary" className="font-bold text-xs">
                <Plus className="w-3.5 h-3.5 mr-1" />
                Create First Experience
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {catTemplates.map((t) => {
              const read = selectExperienceReadiness(t, state);
              return (
                <div key={t.id} className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-ink-lum">{t.name}</h4>
                      <p className="text-xs text-ink-mut">
                        ₹{t.basePrice} · {t.targetParticipants} pax · {t.duration}m
                      </p>
                    </div>
                    <ExperienceStatusBadge status={read.status} size="sm" />
                  </div>

                  <div className="flex items-center justify-between text-xs border-t border-white/5 pt-2">
                    <span className="text-ink-sec">
                      {read.schedulable ? "Ready to Schedule" : `${read.blockedCount} Blocker(s)`}
                    </span>
                    <Link href={read.nextActionHref}>
                      <Button variant="secondary" className="h-7 text-xs px-2.5">
                        {read.nextActionLabel} <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
