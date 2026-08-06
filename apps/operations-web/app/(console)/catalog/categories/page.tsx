"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { selectCategoryHealth } from "@/lib/prototype/selectors/catalog";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button } from "@/components/ui/primitives";
import { SearchInput } from "@/components/ui/fields";
import { Stagger, Item } from "@/components/motion/Motion";
import {
  CatalogBackNavigation,
  CategoryStatusBadge,
  CatalogEmptyState,
} from "@/components/catalog";
import { Layers, Plus, ArrowRight } from "lucide-react";

export default function CategoriesPage() {
  const router = useRouter();
  const { state, territory, canAccess } = useStore();
  const [searchQuery, setSearchQuery] = useState("");

  const categories = state.categories ?? [];
  const templates = state.templates ?? [];

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return categories;
    return categories.filter(
      (c) => c.name.toLowerCase().includes(q) || (c.description || "").toLowerCase().includes(q)
    );
  }, [categories, searchQuery]);

  if (!canAccess("/catalog")) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <PermissionDenied module="Categories" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <CatalogBackNavigation label="Back to Experiences" href="/catalog" />

      <PageHeader
        overline={`Catalog · ${territory.name}`}
        title="Categories"
        sub="Organize experiences by activity type. What kind of activity is this?"
        right={
          <Link href="/catalog/categories/new">
            <Button variant="primary" className="font-bold">
              <Plus className="w-4 h-4 mr-1" />
              Create Category
            </Button>
          </Link>
        }
      />

      <div className="glass p-5 rounded-2xl border border-white/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-ink-lum">Activity Classification</h3>
            <p className="text-xs text-ink-mut">Broad activity types (Badminton, Box Cricket, Trekking, Social Games).</p>
          </div>
          <div className="w-full sm:w-72">
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search categories..." />
          </div>
        </div>

        {categories.length === 0 ? (
          <CatalogEmptyState
            title="No Activity Categories Created"
            message="No activity categories have been created yet. Create a category to start organizing experiences."
            actionLabel="Create Category"
            actionHref="/catalog/categories/new"
          />
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-mut">No categories match your search.</div>
        ) : (
          <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((c) => {
              const catTemplates = templates.filter((t) => t.categoryId === c.id);
              const activeCount = catTemplates.filter((t) => t.status === "active").length;
              const health = selectCategoryHealth(c, state);

              const nextAction = catTemplates.length === 0
                ? { label: "Create Experience", href: `/catalog/experiences/new?categoryId=${c.id}` }
                : { label: "View Experiences", href: `/catalog/categories/${c.id}` };

              return (
                <Item key={c.id}>
                  <div className="glass p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <h4 className="font-bold text-base text-ink-lum flex items-center gap-2">
                            <Layers className="w-4 h-4 text-brand shrink-0" />
                            <Link href={`/catalog/categories/${c.id}`} className="hover:text-brand transition-colors">
                              {c.name}
                            </Link>
                          </h4>
                          <span className="text-[11px] text-ink-sec font-mono uppercase">
                            {c.visualTreatment || "Standard"} · Risk: {c.riskLevel || "Low"}
                          </span>
                        </div>
                        <CategoryStatusBadge status={health.status} size="sm" />
                      </div>

                      <p className="text-xs text-ink-mut line-clamp-2">{c.description || "Activity category"}</p>

                      <div className="grid grid-cols-2 gap-2 text-xs border-t border-white/5 pt-2">
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Experiences</span>
                          <span className="font-bold text-ink-lum">{catTemplates.length}</span>
                        </div>
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Active Plans</span>
                          <span className="font-bold text-emerald-400">{activeCount}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[11px] text-ink-sec">{c.isIndoor ? "Indoor Space" : "Outdoor Space"}</span>
                      <Link href={nextAction.href}>
                        <Button variant={catTemplates.length === 0 ? "primary" : "secondary"} className="h-7 text-xs font-bold px-3">
                          {nextAction.label}
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
