"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { SetupBackNavigation } from "@/components/setup/shared";
import { Button } from "@/components/ui/primitives";
import { CheckCircle2, MapPin, Plus, ArrowRight } from "lucide-react";
import type { CityInput } from "@/lib/prototype/services/create";

function AddCityForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, createCity } = useStore();

  const franchises = state.franchises ?? [];
  const territories = state.territories ?? [];

  const initialTerritoryId = searchParams?.get("territoryId") || "";

  const [step, setStep] = useState(1);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    franchiseId: "",
    territoryId: initialTerritoryId,
    name: "",
    state: "Telangana",
    launchDate: new Date().toISOString().split("T")[0],
    managerId: "op-1",
    status: "ready" as const,
  });

  useEffect(() => {
    if (initialTerritoryId) {
      const t = territories.find((x) => x.id === initialTerritoryId);
      if (t) {
        setFormData((prev) => ({
          ...prev,
          territoryId: t.id,
          franchiseId: t.franchiseId,
        }));
      }
    }
  }, [initialTerritoryId, territories]);

  const filteredTerritories = territories.filter(
    (t) => !formData.franchiseId || t.franchiseId === formData.franchiseId
  );

  const handleCreate = () => {
    const newId = `c-${Date.now()}`;
    const input: CityInput = {
      id: newId,
      territoryId: formData.territoryId || territories[0]?.id || "t1",
      name: formData.name.trim() || "Hyderabad",
      state: formData.state.trim() || "Telangana",
      launchDate: formData.launchDate,
      managerId: formData.managerId,
      supportedCategories: ["cat1", "cat2"],
      status: formData.status as "ready" | "draft" | "active" | "paused",
      notes: "Newly added city in setup workspace.",
    };

    createCity(input);
    setCreatedId(newId);
    setStep(5);
  };

  if (step === 5) {
    return (
      <div className="glass p-8 rounded-2xl border border-emerald-800/40 bg-emerald-950/20 text-center space-y-6 max-w-xl mx-auto my-8">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-ink-lum">City Added</h2>
          <p className="text-xs text-ink-sec max-w-md mx-auto">
            You have successfully added &quot;{formData.name}&quot;. The recommended next step is to create your first venue in this city.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-left text-xs space-y-1">
          <p className="text-ink-mut">City: <strong className="text-ink-lum">{formData.name}</strong></p>
          <p className="text-ink-mut">Territory: <span className="text-ink-sec">{territories.find((t) => t.id === formData.territoryId)?.name || "Territory"}</span></p>
          <p className="text-ink-mut">State: <span className="text-ink-sec">{formData.state}</span></p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            variant="primary"
            className="w-full sm:w-auto font-bold px-6"
            onClick={() => router.push(`/locations/venues/new?cityId=${createdId}`)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Create First Venue
          </Button>
          <Button
            variant="secondary"
            className="w-full sm:w-auto text-xs"
            onClick={() => router.push(`/cities/${createdId}`)}
          >
            View City Details
          </Button>
          <Button
            variant="ghost"
            className="w-full sm:w-auto text-xs"
            onClick={() => router.push("/setup")}
          >
            Back to Setup
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Step Navigation */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        {[
          { num: 1, label: "1. Choose Territory" },
          { num: 2, label: "2. City Details" },
          { num: 3, label: "3. Management" },
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
            <h3 className="text-sm font-bold text-ink-lum">Step 1: Choose Franchise & Territory</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Franchise (Optional Filter)</label>
              <select
                value={formData.franchiseId}
                onChange={(e) => setFormData({ ...formData, franchiseId: e.target.value, territoryId: "" })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              >
                <option value="">All Franchises...</option>
                {franchises.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Parent Territory</label>
              <select
                value={formData.territoryId}
                onChange={(e) => setFormData({ ...formData, territoryId: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              >
                <option value="">Select Territory...</option>
                {filteredTerritories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.region})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 2: City Information</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">City Name</label>
              <input
                type="text"
                placeholder="e.g. Hyderabad"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum placeholder:text-ink-mut"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">State / Region</label>
              <input
                type="text"
                placeholder="e.g. Telangana"
                value={formData.state}
                onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum placeholder:text-ink-mut"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 3: Operating Manager & Status</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">City Manager</label>
              <input
                type="text"
                value={formData.managerId}
                onChange={(e) => setFormData({ ...formData, managerId: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Operating Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              >
                <option value="ready">Ready for Venues</option>
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </select>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 4: Review Summary</h3>

            <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">City Name:</span>
                <span className="font-bold text-ink-lum">{formData.name || "Hyderabad"}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">State:</span>
                <span className="text-ink-sec">{formData.state}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Territory:</span>
                <span className="text-ink-sec">{territories.find((t) => t.id === formData.territoryId)?.name || "Territory"}</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <Button
            variant="ghost"
            onClick={() => (step > 1 ? setStep(step - 1) : router.push("/cities"))}
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
              Add City
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AddCityPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <SetupBackNavigation label="Back to Cities" href="/cities" />
      <PageHeader
        overline="Setup · Geography"
        title="Add City"
        sub="Cities are the urban centers where events and sessions take place."
      />
      <Suspense fallback={<div className="text-xs text-ink-mut p-8">Loading form...</div>}>
        <AddCityForm />
      </Suspense>
    </div>
  );
}
