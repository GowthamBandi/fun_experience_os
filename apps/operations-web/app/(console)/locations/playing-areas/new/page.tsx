"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { SetupBackNavigation } from "@/components/setup/shared";
import { Button } from "@/components/ui/primitives";
import { CheckCircle2, Layers, Plus, ArrowRight } from "lucide-react";
import type { PlayingAreaInput } from "@/lib/prototype/services/create";

function AddPlayingAreaForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, createPlayingArea } = useStore();

  const venues = state.venues ?? [];
  const initialVenueId = searchParams?.get("venueId") || "";

  const [step, setStep] = useState(1);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    venueId: initialVenueId,
    name: "",
    type: "Court",
    maxCapacity: 20,
    spectatorCapacity: 10,
    staffCapacity: 2,
    supportedActivities: "Badminton, Pickleball",
    equipmentNotes: "Nets, Post Lights, Court Mats",
    operatingHours: "06:00 AM - 10:00 PM",
    restrictions: "Non-marking shoes required",
    status: "active" as const,
  });

  useEffect(() => {
    if (initialVenueId) {
      setFormData((prev) => ({ ...prev, venueId: initialVenueId }));
    }
  }, [initialVenueId]);

  const handleCreate = () => {
    const newId = `pa-${Date.now()}`;
    const input: PlayingAreaInput = {
      id: newId,
      venueId: formData.venueId || venues[0]?.id || "v1",
      name: formData.name.trim() || "Badminton Court 1",
      activityCompatibility: formData.supportedActivities.split(",").map((s) => s.trim()).filter(Boolean),
      maxCapacity: Number(formData.maxCapacity) || 20,
      staffCapacity: Number(formData.staffCapacity) || 2,
      spectatorCapacity: Number(formData.spectatorCapacity) || 10,
      equipment: formData.equipmentNotes.split(",").map((s) => s.trim()).filter(Boolean),
      operatingHours: formData.operatingHours,
      status: formData.status as "active" | "maintenance" | "unavailable" | "closed",
      restrictions: formData.restrictions,
    };

    createPlayingArea(input);
    setCreatedId(newId);
    setStep(7);
  };

  if (step === 7) {
    return (
      <div className="glass p-8 rounded-2xl border border-emerald-800/40 bg-emerald-950/20 text-center space-y-6 max-w-xl mx-auto my-8">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-ink-lum">Playing Area Added</h2>
          <p className="text-xs text-ink-sec max-w-md mx-auto">
            You have successfully created &quot;{formData.name}&quot;. Your operating structure setup is now complete and ready to host event templates.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-left text-xs space-y-1">
          <p className="text-ink-mut">Space: <strong className="text-ink-lum">{formData.name}</strong></p>
          <p className="text-ink-mut">Venue: <span className="text-ink-sec">{venues.find((v) => v.id === formData.venueId)?.name || "Venue"}</span></p>
          <p className="text-ink-mut">Capacity: <span className="text-ink-sec">{formData.maxCapacity} headcount</span></p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            variant="primary"
            className="w-full sm:w-auto font-bold px-6"
            onClick={() => router.push("/catalog/experiences/new")}
          >
            <Plus className="w-4 h-4 mr-1" />
            Create Experience Template
          </Button>
          <Button
            variant="secondary"
            className="w-full sm:w-auto text-xs"
            onClick={() => router.push(`/locations/playing-areas/${createdId}`)}
          >
            View Space Details
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
      {/* Wizard Step Navigation */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        {[
          { num: 1, label: "1. Choose Venue" },
          { num: 2, label: "2. Details" },
          { num: 3, label: "3. Capacity" },
          { num: 4, label: "4. Activities" },
          { num: 5, label: "5. Rules" },
          { num: 6, label: "6. Review" },
        ].map((s) => (
          <button
            key={s.num}
            type="button"
            onClick={() => setStep(s.num)}
            className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${
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
            <h3 className="text-sm font-bold text-ink-lum">Step 1: Choose Venue</h3>
            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Venue Location</label>
              <select
                value={formData.venueId}
                onChange={(e) => setFormData({ ...formData, venueId: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              >
                <option value="">Select Venue...</option>
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.type})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 2: Area Details</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Playing Area Name</label>
              <input
                type="text"
                placeholder="e.g. Badminton Court 1"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum placeholder:text-ink-mut"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Area Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              >
                <option value="Court">Court</option>
                <option value="Field">Field</option>
                <option value="Room">Room</option>
                <option value="Hall">Hall</option>
                <option value="Pool">Pool</option>
                <option value="Track">Track</option>
                <option value="Outdoor Zone">Outdoor Zone</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 3: Capacity</h3>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Max Player Capacity</label>
                <input
                  type="number"
                  value={formData.maxCapacity}
                  onChange={(e) => setFormData({ ...formData, maxCapacity: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Spectator Capacity</label>
                <input
                  type="number"
                  value={formData.spectatorCapacity}
                  onChange={(e) => setFormData({ ...formData, spectatorCapacity: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Staff Capacity</label>
                <input
                  type="number"
                  value={formData.staffCapacity}
                  onChange={(e) => setFormData({ ...formData, staffCapacity: Number(e.target.value) })}
                  className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
                />
              </div>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 4: Compatible Activities</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Supported Activities (comma separated)</label>
              <input
                type="text"
                value={formData.supportedActivities}
                onChange={(e) => setFormData({ ...formData, supportedActivities: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              />
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 5: Operating Rules & Equipment</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Equipment Notes</label>
              <input
                type="text"
                value={formData.equipmentNotes}
                onChange={(e) => setFormData({ ...formData, equipmentNotes: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Restrictions & Guidelines</label>
              <input
                type="text"
                value={formData.restrictions}
                onChange={(e) => setFormData({ ...formData, restrictions: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              />
            </div>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 6: Review Summary</h3>

            <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Playing Area Name:</span>
                <span className="font-bold text-ink-lum">{formData.name || "Badminton Court 1"}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Venue:</span>
                <span className="text-ink-sec">{venues.find((v) => v.id === formData.venueId)?.name || "Venue"}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Type:</span>
                <span className="text-ink-sec">{formData.type}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Max Capacity:</span>
                <span className="font-mono text-ink-lum">{formData.maxCapacity} players</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <Button
            variant="ghost"
            onClick={() => (step > 1 ? setStep(step - 1) : router.push("/locations/playing-areas"))}
            className="text-xs"
          >
            {step > 1 ? "Previous" : "Cancel"}
          </Button>

          {step < 6 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)} className="font-bold text-xs">
              Next Step <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          ) : (
            <Button variant="primary" onClick={handleCreate} className="font-bold text-xs bg-emerald-500 text-slate-950">
              Add Playing Area
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AddPlayingAreaPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <SetupBackNavigation label="Back to Playing Areas" href="/locations/playing-areas" />
      <PageHeader
        overline="Setup · Locations"
        title="Add Playing Area"
        sub="A playing area is the exact court, field, room, or hall inside a venue used for events."
      />
      <Suspense fallback={<div className="text-xs text-ink-mut p-8">Loading form...</div>}>
        <AddPlayingAreaForm />
      </Suspense>
    </div>
  );
}
