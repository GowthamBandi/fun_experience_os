"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { CatalogBackNavigation } from "@/components/catalog";
import { Button } from "@/components/ui/primitives";
import { CheckCircle2, Layers, Plus, ArrowRight } from "lucide-react";
import type { CategoryInput } from "@/lib/prototype/services/create";

export default function CreateCategoryPage() {
  const router = useRouter();
  const { state, createCategory } = useStore();

  const [step, setStep] = useState(1);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: "",
    description: "",
    visualTreatment: "sport" as "sport" | "social" | "fitness" | "adventure",
    riskLevel: "low" as "low" | "medium" | "high",
    isIndoor: true,
    status: "active" as const,
  });

  const handleCreate = () => {
    const newId = `cat-${Date.now()}`;
    const input: CategoryInput = {
      id: newId,
      name: formData.name.trim() || "Social Badminton",
      description: formData.description.trim() || "Casual racket sport activity for social play.",
      icon: "badminton",
      visualTreatment: formData.visualTreatment,
      riskLevel: formData.riskLevel,
      isIndoor: formData.isIndoor,
      equipmentRequirements: ["Rackets", "Nets"],
      defaultStaffing: ["Coordinator"],
      defaultDuration: 90,
      defaultAgeMin: 18,
      defaultAgeMax: 65,
      defaultParticipantsMin: 8,
      defaultParticipantsMax: 24,
      status: formData.status as any,
    };

    createCategory(input);
    setCreatedId(newId);
    setStep(5);
  };

  if (step === 5) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
        <CatalogBackNavigation label="Back to Categories" href="/catalog/categories" />

        <div className="glass p-8 rounded-2xl border border-emerald-800/40 bg-emerald-950/20 text-center space-y-6 max-w-xl mx-auto my-8">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-ink-lum">Category Created</h2>
            <p className="text-xs text-ink-sec max-w-md mx-auto">
              You have successfully created category &quot;{formData.name}&quot;. The recommended next action is to create your first reusable experience plan.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-left text-xs space-y-1">
            <p className="text-ink-mut">Category: <strong className="text-ink-lum">{formData.name}</strong></p>
            <p className="text-ink-mut">Type: <span className="text-ink-sec capitalize">{formData.visualTreatment}</span></p>
            <p className="text-ink-mut">Space: <span className="text-ink-sec">{formData.isIndoor ? "Indoor Facility" : "Outdoor Space"}</span></p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Button
              variant="primary"
              className="w-full sm:w-auto font-bold px-6"
              onClick={() => router.push(`/catalog/experiences/new?categoryId=${createdId}`)}
            >
              <Plus className="w-4 h-4 mr-1" />
              Create First Experience
            </Button>
            <Button
              variant="secondary"
              className="w-full sm:w-auto text-xs"
              onClick={() => router.push(`/catalog/categories/${createdId}`)}
            >
              View Category
            </Button>
            <Button
              variant="ghost"
              className="w-full sm:w-auto text-xs"
              onClick={() => router.push("/catalog")}
            >
              Back to Experiences
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <CatalogBackNavigation label="Back to Categories" href="/catalog/categories" />

      <PageHeader
        overline="Catalog · Categories"
        title="Create Category"
        sub="Organize experiences by activity type. What kind of activity is this?"
      />

      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Step Bar */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          {[
            { num: 1, label: "1. Category Name" },
            { num: 2, label: "2. Activity Type" },
            { num: 3, label: "3. Compatible Spaces" },
            { num: 4, label: "4. Review" },
          ].map((s) => (
            <button
              key={s.num}
              type="button"
              onClick={() => setStep(s.num)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
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

        <div className="glass p-6 rounded-2xl border border-white/5 space-y-6">
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-ink-lum">Step 1: Category Name & Description</h3>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Category Name</label>
                <input
                  type="text"
                  placeholder="e.g. Badminton, Box Cricket, Trekking"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum placeholder:text-ink-mut"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Short Description</label>
                <textarea
                  rows={3}
                  placeholder="Describe what kind of experiences fall under this category..."
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full p-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum placeholder:text-ink-mut"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-ink-lum">Step 2: Activity Format & Risk Level</h3>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Activity Classification</label>
                <select
                  value={formData.visualTreatment}
                  onChange={(e) => setFormData({ ...formData, visualTreatment: e.target.value as any })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                >
                  <option value="sport">Sport (Score & Team Competitive)</option>
                  <option value="social">Social Games (Outcome & Casual)</option>
                  <option value="fitness">Fitness (Group Exercise & Workout)</option>
                  <option value="adventure">Adventure (Trekking & Outdoor Excursion)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Operational Risk Level</label>
                <select
                  value={formData.riskLevel}
                  onChange={(e) => setFormData({ ...formData, riskLevel: e.target.value as any })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                >
                  <option value="low">Low Risk (Standard indoor/outdoor rules)</option>
                  <option value="medium">Medium Risk (Requires safety briefing)</option>
                  <option value="high">High Risk (Requires dedicated safety officer)</option>
                </select>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-ink-lum">Step 3: Compatible Spaces & Status</h3>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Space Environment</label>
                <select
                  value={formData.isIndoor ? "indoor" : "outdoor"}
                  onChange={(e) => setFormData({ ...formData, isIndoor: e.target.value === "indoor" })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                >
                  <option value="indoor">Indoor Venue (Courts, Halls, Rooms)</option>
                  <option value="outdoor">Outdoor Space (Fields, Turfs, Grounds)</option>
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                >
                  <option value="active">Active (Available for Experiences)</option>
                  <option value="draft">Draft</option>
                  <option value="paused">Paused</option>
                </select>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-ink-lum">Step 4: Review Category Details</h3>

              <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-ink-mut">Category Name:</span>
                  <span className="font-bold text-ink-lum">{formData.name || "Badminton"}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-ink-mut">Activity Type:</span>
                  <span className="text-ink-sec capitalize">{formData.visualTreatment}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-2">
                  <span className="text-ink-mut">Risk Level:</span>
                  <span className="text-ink-sec capitalize">{formData.riskLevel}</span>
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-white/5">
            <Button
              variant="ghost"
              onClick={() => (step > 1 ? setStep(step - 1) : router.push("/catalog/categories"))}
              className="text-xs"
            >
              {step > 1 ? "Previous" : "Cancel"}
            </Button>

            {step < 4 ? (
              <Button variant="primary" onClick={() => setStep(step + 1)} className="font-bold text-xs">
                Next Step <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            ) : (
              <Button variant="primary" onClick={handleCreate} className="font-bold text-xs bg-emerald-500 text-slate-950">
                Create Category
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
