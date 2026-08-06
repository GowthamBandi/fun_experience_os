"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { CatalogBackNavigation } from "@/components/catalog";
import { ExperienceTimelinePreview } from "@/components/catalog/summaries/ExperienceTimelinePreview";
import { ExperiencePriceSummary } from "@/components/catalog/summaries/ExperiencePriceSummary";
import { ExperienceCapacitySummary } from "@/components/catalog/summaries/ExperienceCapacitySummary";
import { ExperienceCompatibilitySummary } from "@/components/catalog/summaries/ExperienceCompatibilitySummary";
import { Button } from "@/components/ui/primitives";
import { CheckCircle2, Sparkles, Plus, ArrowRight, Save } from "lucide-react";
import type { TemplateInput } from "@/lib/prototype/services/create";

function CreateExperienceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, createTemplate } = useStore();

  const categories = state.categories ?? [];
  const initialCategoryId = searchParams?.get("categoryId") || categories[0]?.id || "cat-badminton";

  const [step, setStep] = useState(1);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    categoryId: initialCategoryId,
    name: "",
    shortDesc: "",
    fullDesc: "",
    internalNote: "",
    format: "mixed" as "open" | "women" | "men" | "mixed",
    entryType: "individual" as "individual" | "duo" | "preformed-team",
    ageMin: 18,
    ageMax: 65,
    numTeams: 2,
    teamSize: 4,
    minParticipants: 8,
    targetParticipants: 16,
    maxParticipants: 20,
    compSlots: 2,
    waitlistDefault: true,
    duration: 90,
    checkInWindow: 30,
    revealHoursBefore: 2,
    lateArrivalMins: 15,
    basePrice: 499,
    coordinatorsCount: 1,
    refereeRequired: false,
    safetyContactRequired: false,
    playingAreaTypes: "Court, Field",
    minAreaCapacity: 10,
    indoorOutdoorNeed: "any" as "indoor" | "outdoor" | "hybrid" | "any",
    preRevealPreview: "Joined count hidden until reveal",
    postRevealPreview: "Full team and venue details revealed",
    tempIdFormat: "PX-####",
    resultType: "score" as "score" | "outcome",
    status: "active" as "draft" | "active" | "ready",
  });

  useEffect(() => {
    if (initialCategoryId) {
      setFormData((prev) => ({ ...prev, categoryId: initialCategoryId }));
    }
  }, [initialCategoryId]);

  const activeCat = categories.find((c) => c.id === formData.categoryId);
  const isSport = activeCat ? activeCat.visualTreatment === "sport" || activeCat.riskLevel === "high" : true;

  // Step 3 capacity validation error
  let capacityError = "";
  if (formData.minParticipants <= 0) capacityError = "Minimum needed must be greater than zero.";
  else if (formData.targetParticipants < formData.minParticipants) capacityError = "Ideal group size cannot be smaller than minimum needed.";
  else if (formData.maxParticipants < formData.targetParticipants) capacityError = "Maximum group size cannot be smaller than ideal group size.";

  const handleSave = (publish: boolean = false) => {
    const newId = `et-${Date.now()}`;
    const input: TemplateInput = {
      id: newId,
      categoryId: formData.categoryId,
      name: formData.name.trim() || "Saturday Mystery Experience",
      shortDesc: formData.shortDesc.trim() || "Social mystery experience for sports lovers.",
      fullDesc: formData.fullDesc.trim() || "Enjoy a structured experience with automatic team reveal and live host.",
      objective: "Social connection through activity",
      promise: "Equal play time and great community",
      status: publish ? "active" : "draft",
      format: formData.format,
      isTournament: false,
      ageMin: Number(formData.ageMin) || 18,
      ageMax: Number(formData.ageMax) || 65,
      verificationRequired: false,
      minParticipants: Number(formData.minParticipants) || 8,
      targetParticipants: Number(formData.targetParticipants) || 16,
      maxParticipants: Number(formData.maxParticipants) || 20,
      teamSize: Number(formData.teamSize) || 4,
      numTeams: Number(formData.numTeams) || 2,
      spectatorAllowance: 10,
      compSlots: Number(formData.compSlots) || 2,
      blockedSlots: 0,
      duration: Number(formData.duration) || 90,
      checkInWindow: Number(formData.checkInWindow) || 30,
      bookingOpenDays: 7,
      bookingCloseHours: 2,
      revealHoursBefore: Number(formData.revealHoursBefore) || 2,
      lateArrivalMins: Number(formData.lateArrivalMins) || 15,
      completionBufferMins: 15,
      basePrice: Number(formData.basePrice) || 499,
      taxAmount: 0,
      platformFee: 50,
      venueCost: 1000,
      equipmentCost: 200,
      promoEligible: true,
      refundPolicyTemplate: "Standard 24h prior refund policy",
      requiredRoles: ["Coordinator", ...(formData.refereeRequired ? ["Referee"] : [])],
      coordinatorsCount: Number(formData.coordinatorsCount) || 1,
      refereeRequired: formData.refereeRequired,
      safetyContactRequired: formData.safetyContactRequired,
      equipmentChecklist: ["Nets", "Balls/Shuttles"],
      participantChecklist: ["Non-marking shoes", "Water bottle"],
      weatherDependency: false,
      cancellationThreshold: 4,
      anonymousJoinedCount: false,
      tempIdFormat: formData.tempIdFormat,
      aliasStyle: "Heroic",
      teamAssignmentRule: "random",
      revealTimeMinsBefore: (Number(formData.revealHoursBefore) || 2) * 60,
      infoRevealed: ["Team Name", "Opponent", "Court Number"],
      infoNeverRevealed: ["Phone Number", "Full Name"],
      internalNote: formData.internalNote,
      entryType: formData.entryType,
    };

    createTemplate(input);
    setCreatedId(newId);
    setStep(11);
  };

  if (step === 11) {
    return (
      <div className="glass p-8 rounded-2xl border border-emerald-800/40 bg-emerald-950/20 text-center space-y-6 max-w-xl mx-auto my-8">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-ink-lum">Experience Created</h2>
          <p className="text-xs text-ink-sec max-w-md mx-auto">
            You have successfully created experience plan &quot;{formData.name || "Saturday Mystery Experience"}&quot;.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-left text-xs space-y-1">
          <p className="text-ink-mut">Experience: <strong className="text-ink-lum">{formData.name || "Saturday Experience"}</strong></p>
          <p className="text-ink-mut">Category: <span className="text-ink-sec">{activeCat?.name || "Category"}</span></p>
          <p className="text-ink-mut">Default Price: <span className="text-emerald-400 font-bold">₹{formData.basePrice}</span></p>
          <p className="text-ink-mut">Capacity: <span className="text-ink-sec">{formData.minParticipants}-{formData.maxParticipants} pax</span></p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            variant="primary"
            className="w-full sm:w-auto font-bold px-6"
            onClick={() => router.push(`/missions/new?experienceId=${createdId}`)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Schedule Event
          </Button>
          <Button
            variant="secondary"
            className="w-full sm:w-auto text-xs"
            onClick={() => router.push(`/catalog/experiences/${createdId}`)}
          >
            View Experience Details
          </Button>
          <Button
            variant="ghost"
            className="w-full sm:w-auto text-xs"
            onClick={() => router.push("/catalog")}
          >
            Back to Catalog
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* 10-Step Wizard Bar */}
      <div className="overflow-x-auto pb-2">
        <div className="flex items-center gap-1.5 min-w-max border-b border-white/5 pb-3">
          {[
            { num: 1, label: "1. Basics" },
            { num: 2, label: "2. Format" },
            { num: 3, label: "3. Group Size" },
            { num: 4, label: "4. Time" },
            { num: 5, label: "5. Price" },
            { num: 6, label: "6. Staff" },
            { num: 7, label: "7. Where It Can Run" },
            { num: 8, label: "8. Reveal" },
            { num: 9, label: "9. Checklist" },
            { num: 10, label: "10. Review" },
          ].map((s) => (
            <button
              key={s.num}
              type="button"
              onClick={() => setStep(s.num)}
              className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors whitespace-nowrap ${
                step === s.num
                  ? "bg-brand text-slate-950"
                  : step > s.num
                  ? "bg-white/10 text-ink-lum"
                  : "text-ink-mut hover:text-ink-sec"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="glass p-6 rounded-2xl border border-white/5 space-y-6">
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 1: Basic Details</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Category</label>
              <select
                value={formData.categoryId}
                onChange={(e) => setFormData({ ...formData, categoryId: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.visualTreatment || "Standard"})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Experience Name</label>
              <input
                type="text"
                placeholder="e.g. Saturday Mystery Badminton"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum placeholder:text-ink-mut"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Short Customer Description</label>
              <textarea
                rows={2}
                placeholder="What will customers see on the event card?"
                value={formData.shortDesc}
                onChange={(e) => setFormData({ ...formData, shortDesc: e.target.value })}
                className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum placeholder:text-ink-mut"
              />
            </div>

            <div className="p-3 rounded-xl bg-black/30 border border-white/5 text-xs text-ink-mut">
              Format Authority: <strong className="text-purple-300 capitalize">{isSport ? "Sport (Scores & Winners)" : "Non-Sport (Outcome & Completion)"}</strong> derived from selected category.
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 2: Event Format & Age Policy</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Gender Format</label>
                <select
                  value={formData.format}
                  onChange={(e) => setFormData({ ...formData, format: e.target.value as any })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                >
                  <option value="mixed">Mixed (All genders)</option>
                  <option value="open">Open</option>
                  <option value="women">Women Only</option>
                  <option value="men">Men Only</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Entry Type</label>
                <select
                  value={formData.entryType}
                  onChange={(e) => setFormData({ ...formData, entryType: e.target.value as any })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                >
                  <option value="individual">Individual Solo Booking</option>
                  <option value="duo">Duo Pair</option>
                  <option value="preformed-team">Preformed Team</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Minimum Age</label>
                <input
                  type="number"
                  value={formData.ageMin}
                  onChange={(e) => setFormData({ ...formData, ageMin: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Maximum Age</label>
                <input
                  type="number"
                  value={formData.ageMax}
                  onChange={(e) => setFormData({ ...formData, ageMax: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                />
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 3: Default Group Size Policy</h3>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Minimum Needed</label>
                <input
                  type="number"
                  value={formData.minParticipants}
                  onChange={(e) => setFormData({ ...formData, minParticipants: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Ideal Group Size</label>
                <input
                  type="number"
                  value={formData.targetParticipants}
                  onChange={(e) => setFormData({ ...formData, targetParticipants: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Maximum Group Size</label>
                <input
                  type="number"
                  value={formData.maxParticipants}
                  onChange={(e) => setFormData({ ...formData, maxParticipants: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                />
              </div>
            </div>

            {capacityError && (
              <div className="p-3 rounded-xl bg-rose-950/20 border border-rose-800/40 text-rose-300 text-xs font-semibold">
                ⚠️ {capacityError}
              </div>
            )}

            <ExperienceCapacitySummary
              minParticipants={formData.minParticipants}
              targetParticipants={formData.targetParticipants}
              maxParticipants={formData.maxParticipants}
            />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 4: Time & Schedule Timeline</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Default Duration (Minutes)</label>
                <input
                  type="number"
                  value={formData.duration}
                  onChange={(e) => setFormData({ ...formData, duration: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Reveal Info (Hours Before Start)</label>
                <input
                  type="number"
                  value={formData.revealHoursBefore}
                  onChange={(e) => setFormData({ ...formData, revealHoursBefore: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                />
              </div>
            </div>

            <ExperienceTimelinePreview
              duration={formData.duration}
              checkInWindow={formData.checkInWindow}
              revealHoursBefore={formData.revealHoursBefore}
            />
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 5: Default Pricing & Break-Even</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Default Price per Participant (₹)</label>
              <input
                type="number"
                value={formData.basePrice}
                onChange={(e) => setFormData({ ...formData, basePrice: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum font-bold"
              />
            </div>

            <ExperiencePriceSummary
              basePrice={formData.basePrice}
              minParticipants={formData.minParticipants}
              targetParticipants={formData.targetParticipants}
            />
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 6: Staffing & Host Requirements</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Coordinators Required</label>
              <input
                type="number"
                value={formData.coordinatorsCount}
                onChange={(e) => setFormData({ ...formData, coordinatorsCount: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              />
            </div>

            {isSport && (
              <label className="flex items-center gap-2 cursor-pointer p-3 rounded-xl bg-black/40 border border-white/10 text-xs">
                <input
                  type="checkbox"
                  checked={formData.refereeRequired}
                  onChange={(e) => setFormData({ ...formData, refereeRequired: e.target.checked })}
                  className="rounded text-brand"
                />
                <span>Referee / Match Official Required</span>
              </label>
            )}
          </div>
        )}

        {step === 7 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 7: Where It Can Run</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Compatible Playing-Area Types (comma separated)</label>
              <input
                type="text"
                value={formData.playingAreaTypes}
                onChange={(e) => setFormData({ ...formData, playingAreaTypes: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              />
            </div>

            <ExperienceCompatibilitySummary
              compatVenues={[]}
              playingAreaTypes={formData.playingAreaTypes.split(",").map((s) => s.trim())}
            />
          </div>
        )}

        {step === 8 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 8: What Participants See (Reveal Rules)</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Pre-Reveal Customer Preview</label>
              <input
                type="text"
                value={formData.preRevealPreview}
                onChange={(e) => setFormData({ ...formData, preRevealPreview: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Temporary ID Pattern</label>
              <input
                type="text"
                value={formData.tempIdFormat}
                onChange={(e) => setFormData({ ...formData, tempIdFormat: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum font-mono"
              />
            </div>
          </div>
        )}

        {step === 9 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 9: Operations & Event Checklist</h3>

            <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
              <div className="font-bold text-ink-lum">Result Output Type:</div>
              <p className="text-ink-sec">
                {isSport ? "🏆 Score-based match outcomes with team rankings." : "🎯 Facilitated group outcome and completion badges."}
              </p>
            </div>
          </div>
        )}

        {step === 10 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 10: Review & Readiness Check</h3>

            <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Experience Name:</span>
                <span className="font-bold text-ink-lum">{formData.name || "Saturday Mystery Experience"}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Category:</span>
                <span className="text-purple-300 font-bold">{activeCat?.name || "Category"}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Default Price:</span>
                <span className="text-emerald-400 font-bold">₹{formData.basePrice}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Group Size:</span>
                <span className="text-ink-lum">{formData.minParticipants} - {formData.maxParticipants} pax</span>
              </div>
            </div>
          </div>
        )}

        {/* Buttons */}
        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => (step > 1 ? setStep(step - 1) : router.push("/catalog/experiences"))}
              className="text-xs"
            >
              {step > 1 ? "Previous" : "Cancel"}
            </Button>
            <Button
              variant="secondary"
              onClick={() => handleSave(false)}
              className="text-xs"
            >
              <Save className="w-3.5 h-3.5 mr-1" />
              Save Draft
            </Button>
          </div>

          {step < 10 ? (
            <Button
              variant="primary"
              onClick={() => setStep(step + 1)}
              disabled={!!capacityError}
              className="font-bold text-xs"
            >
              Next Step <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={() => handleSave(true)}
              className="font-bold text-xs bg-emerald-500 text-slate-950"
            >
              Publish Experience
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreateExperiencePage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <CatalogBackNavigation label="Back to Experiences" href="/catalog/experiences" />
      <PageHeader
        overline="Catalog · Experiences"
        title="Create Experience"
        sub="Create a reusable event plan that can be scheduled at different times and venues."
      />
      <Suspense fallback={<div className="text-xs text-ink-mut p-8">Loading form...</div>}>
        <CreateExperienceForm />
      </Suspense>
    </div>
  );
}
