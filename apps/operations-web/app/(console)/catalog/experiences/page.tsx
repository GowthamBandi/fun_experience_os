"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { selectExperienceReadiness } from "@/lib/prototype/selectors/catalog";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button } from "@/components/ui/primitives";
import { SearchInput, FilterRail } from "@/components/ui/fields";
import { Stagger, Item } from "@/components/motion/Motion";
import {
  CatalogBackNavigation,
  ExperienceStatusBadge,
  CatalogEmptyState,
} from "@/components/catalog";
import { Sparkles, Plus, ArrowRight } from "lucide-react";

export default function ExperiencesListPage() {
  const router = useRouter();
  const { state, territory, canAccess } = useStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const templates = state.templates ?? [];
  const categories = state.categories ?? [];

  const filtered = useMemo(() => {
    let result = templates;
    if (statusFilter !== "all") {
      result = result.filter((t) => t.status === statusFilter);
    }
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (categories.find((c) => c.id === t.categoryId)?.name ?? "").toLowerCase().includes(q)
      );
    }
    return result;
  }, [templates, categories, statusFilter, searchQuery]);

  if (!canAccess("/catalog")) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <PermissionDenied module="Experiences" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <CatalogBackNavigation label="Back to Experiences Landing" href="/catalog" />

      <PageHeader
        overline={`Catalog · ${territory.name}`}
        title="Experiences"
        sub="Create reusable event plans that can be scheduled many times. What can customers join?"
        right={
          <Link href="/catalog/experiences/new">
            <Button variant="primary" className="font-bold">
              <Plus className="w-4 h-4 mr-1" />
              Create Experience
            </Button>
          </Link>
        }
      />

      <div className="glass p-5 rounded-2xl border border-white/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="w-full sm:w-72">
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search experience or category..." />
          </div>
          <FilterRail
            options={["all", "draft", "active", "paused"] as const}
            value={statusFilter as any}
            onChange={setStatusFilter as any}
          />
        </div>

        {templates.length === 0 ? (
          <CatalogEmptyState
            title="No Reusable Experiences Created"
            message="No customer experiences have been created yet. Create your first experience plan to start scheduling."
            actionLabel="Create Experience"
            actionHref="/catalog/experiences/new"
          />
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-mut">No experiences match your filter criteria.</div>
        ) : (
          <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((t) => {
              const cat = categories.find((c) => c.id === t.categoryId);
              const read = selectExperienceReadiness(t, state);
              const sessionsCount = (state.sessions ?? []).filter((s) => s.templateId === t.id).length;

              return (
                <Item key={t.id}>
                  <div className="glass p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-bold text-base text-ink-lum flex items-center gap-2">
                            <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
                            <Link href={`/catalog/experiences/${t.id}`} className="hover:text-brand transition-colors">
                              {t.name}
                            </Link>
                          </h3>
                          <span className="text-xs text-purple-400 font-medium">{cat?.name || "Category"}</span>
                        </div>
                        <ExperienceStatusBadge status={read.status} size="sm" />
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-center text-xs border-t border-white/5 pt-2">
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Default Price</span>
                          <span className="font-bold text-emerald-400">₹{t.basePrice}</span>
                        </div>
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Group Size</span>
                          <span className="font-bold text-ink-lum">{t.targetParticipants} pax</span>
                        </div>
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Duration</span>
                          <span className="font-bold text-ink-lum">{t.duration}m</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-ink-sec truncate">
                        Format: <span className="text-ink-lum capitalize">{t.format}</span> · Gender: <span className="text-ink-lum capitalize">{t.entryType || "individual"}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[11px] text-ink-sec">{sessionsCount} active events</span>
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
