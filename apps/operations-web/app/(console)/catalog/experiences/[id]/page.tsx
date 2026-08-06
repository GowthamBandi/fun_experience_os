"use client";

import { use } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectExperienceReadiness, compatibleVenues } from "@/lib/prototype/selectors/catalog";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import {
  CatalogBackNavigation,
  ExperienceStatusBadge,
  ExperienceReadiness,
  ExperienceTimelinePreview,
  ExperiencePriceSummary,
  ExperienceCapacitySummary,
  ExperienceCompatibilitySummary,
  CatalogHelpPanel,
} from "@/components/catalog";
import { Sparkles, Calendar, Plus, ArrowRight, ShieldCheck, UserCheck, Eye } from "lucide-react";

export default function ExperienceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: templateId } = use(params);
  const { state, canAccess, createTemplate } = useStore();

  const templates = state.templates ?? [];
  const categories = state.categories ?? [];
  const sessions = state.sessions ?? [];

  const template = templates.find((t) => t.id === templateId);

  if (!template) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-lum">Experience Not Found</h2>
        <p className="text-xs text-ink-sec">The requested experience plan does not exist in prototype state.</p>
        <Link href="/catalog/experiences">
          <Button variant="primary">Return to Experiences</Button>
        </Link>
      </div>
    );
  }

  const category = categories.find((c) => c.id === template.categoryId);
  const activeSessions = sessions.filter((s) => s.templateId === template.id);
  const read = selectExperienceReadiness(template, state);
  const compatVenues = compatibleVenues(state, template.id);

  const handlePublish = () => {
    createTemplate({ ...template, status: "active" });
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <CatalogBackNavigation
        label="Back to Experiences"
        href="/catalog/experiences"
        breadcrumbs={[
          { label: "Experiences", href: "/catalog/experiences" },
          { label: template.name, href: `/catalog/experiences/${template.id}` },
        ]}
      />

      {/* Header */}
      <PageHeader
        overline={`Experience Plan · ${category?.name || "Category"}`}
        title={template.name}
        sub={template.shortDesc || "Reusable experience template plan."}
        right={
          <div className="flex items-center gap-3">
            <ExperienceStatusBadge status={read.status} />
            {read.schedulable ? (
              <Link href={`/missions/new?experienceId=${template.id}`}>
                <Button variant="primary" className="font-bold text-xs">
                  <Calendar className="w-3.5 h-3.5 mr-1" />
                  Schedule Event
                </Button>
              </Link>
            ) : template.status === "draft" && !read.blockedCount ? (
              <Button variant="primary" className="font-bold text-xs bg-emerald-500 text-slate-950" onClick={handlePublish}>
                Publish Experience
              </Button>
            ) : (
              <Button variant="secondary" className="font-bold text-xs" onClick={() => window.scrollTo({ top: 800, behavior: "smooth" })}>
                Fix Readiness Issue
              </Button>
            )}
          </div>
        }
      />

      <CatalogHelpPanel />

      {/* Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="glass p-5 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Category</span>
          <p className="text-base font-bold text-purple-300">{category?.name || "Category"}</p>
          <p className="text-xs text-ink-sec capitalize">{category?.visualTreatment || "Sport"}</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Default Price</span>
          <p className="text-2xl font-bold text-emerald-400">₹{template.basePrice}</p>
          <p className="text-xs text-ink-sec">Per participant</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Capacity</span>
          <p className="text-2xl font-bold text-ink-lum">{template.targetParticipants} <span className="text-xs font-normal text-ink-sec">pax</span></p>
          <p className="text-xs text-ink-sec">{template.minParticipants} min - {template.maxParticipants} max</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Active Events</span>
          <p className="text-2xl font-bold text-ink-lum">{activeSessions.length}</p>
          <p className="text-xs text-ink-sec">Scheduled in missions</p>
        </div>
      </div>

      {/* Sections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section 1: Customer Experience */}
        <div className="glass p-5 rounded-2xl border border-white/5 space-y-3 text-xs">
          <h3 className="font-bold text-ink-lum text-sm flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>1. Customer Experience</span>
          </h3>
          <p className="text-ink-sec leading-relaxed">{template.fullDesc || template.shortDesc}</p>
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-1">
            <span className="text-ink-mut block font-semibold">Experience Promise:</span>
            <p className="text-ink-lum italic">&quot;{template.promise || "Equal play time and great community"}&quot;</p>
          </div>
        </div>

        {/* Section 2: Group Size */}
        <ExperienceCapacitySummary
          minParticipants={template.minParticipants}
          targetParticipants={template.targetParticipants}
          maxParticipants={template.maxParticipants}
        />

        {/* Section 3: Time */}
        <ExperienceTimelinePreview
          duration={template.duration}
          checkInWindow={template.checkInWindow}
          revealHoursBefore={template.revealHoursBefore}
        />

        {/* Section 4: Price */}
        <ExperiencePriceSummary
          basePrice={template.basePrice}
          minParticipants={template.minParticipants}
          targetParticipants={template.targetParticipants}
        />

        {/* Section 5: Staff */}
        <div className="glass p-5 rounded-2xl border border-white/5 space-y-3 text-xs">
          <h3 className="font-bold text-ink-lum text-sm flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-emerald-400" />
            <span>5. Staff & Host Requirements</span>
          </h3>
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
            <div className="flex justify-between">
              <span className="text-ink-mut">Coordinators Required:</span>
              <span className="font-bold text-ink-lum">{template.coordinatorsCount} coordinator(s)</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-mut">Referee Required:</span>
              <span className="text-ink-lum font-semibold">{template.refereeRequired ? "Yes" : "No"}</span>
            </div>
          </div>
        </div>

        {/* Section 6: Where It Can Run */}
        <ExperienceCompatibilitySummary
          compatVenues={compatVenues}
          playingAreaTypes={["Court", "Field"]}
        />

        {/* Section 7: Participant Reveal */}
        <div className="glass p-5 rounded-2xl border border-white/5 space-y-3 text-xs">
          <h3 className="font-bold text-ink-lum text-sm flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-400" />
            <span>7. Participant Reveal</span>
          </h3>
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
            <div className="flex justify-between">
              <span className="text-ink-mut">Reveal Timing:</span>
              <span className="font-bold text-ink-lum">{template.revealHoursBefore} hours before event</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-mut">Temporary ID Format:</span>
              <span className="font-mono text-brand font-bold">{template.tempIdFormat}</span>
            </div>
          </div>
        </div>

        {/* Section 8: Results & Safety */}
        <div className="glass p-5 rounded-2xl border border-white/5 space-y-3 text-xs">
          <h3 className="font-bold text-ink-lum text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>8. Results & Safety Checklist</span>
          </h3>
          <div className="p-3 rounded-xl bg-black/40 border border-white/5 space-y-2">
            <div className="flex justify-between">
              <span className="text-ink-mut">Result Type:</span>
              <span className="font-bold text-ink-lum">{read.isSport ? "Score-based match output" : "Outcome completion"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-mut">Weather Dependency:</span>
              <span className="text-ink-lum">{template.weatherDependency ? "Yes (Indoor backup recommended)" : "No"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 10: Readiness Checklist */}
      <ExperienceReadiness status={read.status} items={read.items} />
    </div>
  );
}
