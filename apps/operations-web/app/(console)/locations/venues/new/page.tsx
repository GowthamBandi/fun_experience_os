"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { SetupBackNavigation, SetupStatusBadge } from "@/components/setup/shared";
import { Button } from "@/components/ui/primitives";
import { CheckCircle2, Building2, Plus, ArrowRight } from "lucide-react";
import type { VenueInput } from "@/lib/prototype/services/create";

function CreateVenueForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, createVenue, role } = useStore();

  const franchises = state.franchises ?? [];
  const territories = state.territories ?? [];
  const cities = state.cities ?? [];

  const initialCityId = searchParams?.get("cityId") || "";

  const [step, setStep] = useState(1);
  const [createdVenueId, setCreatedVenueId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    franchiseId: "",
    territoryId: "",
    cityId: initialCityId,
    name: "",
    type: "arena",
    address: "",
    contactPerson: "Venue Admin",
    contactNumber: "+91 98765 43210",
    operatingHours: "06:00 AM - 10:00 PM",
    supportedActivities: "Badminton, Pickleball, Turf Football",
    costPerSlot: 1500,
    safetyCapacity: 60,
    staffCapacity: 4,
    emergencyExits: "2 Main Exits North & South",
    firstAid: true,
    status: "ready" as const,
  });

  useEffect(() => {
    if (initialCityId) {
      const city = cities.find((c) => c.id === initialCityId);
      if (city) {
        setFormData((prev) => ({
          ...prev,
          cityId: city.id,
          territoryId: city.territoryId,
        }));
        const t = territories.find((x) => x.id === city.territoryId);
        if (t) {
          setFormData((prev) => ({ ...prev, franchiseId: t.franchiseId }));
        }
      }
    }
  }, [initialCityId, cities, territories]);

  const selectedTerritory = territories.find((t) => t.id === formData.territoryId);
  const filteredCities = cities.filter(
    (c) => !formData.territoryId || c.territoryId === formData.territoryId
  );

  const handleCreate = () => {
    const newId = `v-${Date.now()}`;
    const venueInput: VenueInput = {
      id: newId,
      territoryId: formData.territoryId || territories[0]?.id || "t1",
      cityId: formData.cityId || cities[0]?.id || "c1",
      name: formData.name.trim() || "Arena Sports Venue",
      address: formData.address.trim() || "Main Road, Sports Complex",
      contactPerson: formData.contactPerson,
      contactNumber: formData.contactNumber,
      type: formData.type,
      operatingHours: formData.operatingHours,
      supportedActivities: formData.supportedActivities.split(",").map((s) => s.trim()).filter(Boolean),
      safetyCapacity: Number(formData.safetyCapacity) || 50,
      staffCapacity: Number(formData.staffCapacity) || 4,
      spectatorAllowance: 20,
      equipmentAvailable: ["Nets", "Rackets", "Lighting", "First Aid Box"],
      accessibility: true,
      parking: true,
      washrooms: true,
      lighting: true,
      isIndoor: true,
      weatherDependent: false,
      costPerSlot: Number(formData.costPerSlot) || 1200,
      revenueModel: "fixed-slot",
      cancellationTerms: "24h prior notice",
      emergencyExits: formData.emergencyExits,
      firstAid: formData.firstAid,
      safetyContact: formData.contactNumber,
      incidentNotes: "",
      verificationStatus: "verified",
      status: formData.status as "ready" | "maintenance" | "closed",
    };

    createVenue(venueInput);
    setCreatedVenueId(newId);
    setStep(6);
  };

  if (step === 6) {
    return (
      <div className="glass p-8 rounded-2xl border border-emerald-800/40 bg-emerald-950/20 text-center space-y-6 max-w-xl mx-auto my-8">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
          <CheckCircle2 className="w-10 h-10" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-ink-lum">Venue Created</h2>
          <p className="text-xs text-ink-sec max-w-md mx-auto">
            You have successfully created &quot;{formData.name}&quot;. The next recommended action is to add a playing area (court, room, field, or hall) inside this venue.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-left text-xs space-y-1">
          <p className="text-ink-mut">Venue: <strong className="text-ink-lum">{formData.name}</strong></p>
          <p className="text-ink-mut">Address: <span className="text-ink-sec">{formData.address || "Standard venue address"}</span></p>
          <p className="text-ink-mut">Capacity: <span className="text-ink-sec">{formData.safetyCapacity} max headcount</span></p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            variant="primary"
            className="w-full sm:w-auto font-bold px-6"
            onClick={() => router.push(`/locations/playing-areas/new?venueId=${createdVenueId}`)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add First Playing Area
          </Button>
          <Button
            variant="secondary"
            className="w-full sm:w-auto text-xs"
            onClick={() => router.push(`/locations/venues/${createdVenueId}`)}
          >
            View Venue Details
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
      {/* Step Tabs */}
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        {[
          { num: 1, label: "1. Location" },
          { num: 2, label: "2. Venue Details" },
          { num: 3, label: "3. Operations" },
          { num: 4, label: "4. Safety & Capacity" },
          { num: 5, label: "5. Review" },
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
            <h3 className="text-sm font-bold text-ink-lum">Step 1: Choose Location Context</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Operating Territory</label>
              <select
                value={formData.territoryId}
                onChange={(e) => setFormData({ ...formData, territoryId: e.target.value, cityId: "" })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              >
                <option value="">Select Territory...</option>
                {territories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.region})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">City</label>
              <select
                value={formData.cityId}
                onChange={(e) => setFormData({ ...formData, cityId: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              >
                <option value="">Select City...</option>
                {filteredCities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.state})
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 2: Venue Details</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Venue Name</label>
              <input
                type="text"
                placeholder="e.g. Arena Sports Hub"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum placeholder:text-ink-mut"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Venue Type</label>
              <select
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              >
                <option value="arena">Arena</option>
                <option value="club">Club / Sports Center</option>
                <option value="turf">Outdoor Turf</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Address</label>
              <textarea
                placeholder="Full address where customers arrive for events..."
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                className="w-full h-20 p-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum placeholder:text-ink-mut"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 3: Operating Information</h3>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Operating Hours</label>
              <input
                type="text"
                value={formData.operatingHours}
                onChange={(e) => setFormData({ ...formData, operatingHours: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Supported Activities (comma separated)</label>
              <input
                type="text"
                value={formData.supportedActivities}
                onChange={(e) => setFormData({ ...formData, supportedActivities: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Base Cost per Slot (INR)</label>
              <input
                type="number"
                value={formData.costPerSlot}
                onChange={(e) => setFormData({ ...formData, costPerSlot: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 4: Safety & Capacity</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-sec">Safety Capacity</label>
                <input
                  type="number"
                  value={formData.safetyCapacity}
                  onChange={(e) => setFormData({ ...formData, safetyCapacity: Number(e.target.value) })}
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

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Emergency Exits</label>
              <input
                type="text"
                value={formData.emergencyExits}
                onChange={(e) => setFormData({ ...formData, emergencyExits: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              />
            </div>

            <div className="flex items-center gap-2 pt-2">
              <input
                type="checkbox"
                id="firstAid"
                checked={formData.firstAid}
                onChange={(e) => setFormData({ ...formData, firstAid: e.target.checked })}
                className="rounded border-white/20 bg-black/40 text-brand focus:ring-0"
              />
              <label htmlFor="firstAid" className="text-xs text-ink-lum">First Aid Box & Safety Kit Available</label>
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-ink-lum">Step 5: Review Summary</h3>

            <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Venue Name:</span>
                <span className="font-bold text-ink-lum">{formData.name || "Arena Sports Hub"}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">City & Territory:</span>
                <span className="text-ink-sec">
                  {cities.find((c) => c.id === formData.cityId)?.name || "City"} · {territories.find((t) => t.id === formData.territoryId)?.name || "Territory"}
                </span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Type:</span>
                <span className="capitalize text-ink-sec">{formData.type}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Safety Capacity:</span>
                <span className="font-mono text-ink-lum">{formData.safetyCapacity} max headcount</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-4 border-t border-white/5">
          <Button
            variant="ghost"
            onClick={() => (step > 1 ? setStep(step - 1) : router.push("/locations/venues"))}
            className="text-xs"
          >
            {step > 1 ? "Previous" : "Cancel"}
          </Button>

          {step < 5 ? (
            <Button variant="primary" onClick={() => setStep(step + 1)} className="font-bold text-xs">
              Next Step <ArrowRight className="w-3.5 h-3.5 ml-1" />
            </Button>
          ) : (
            <Button variant="primary" onClick={handleCreate} className="font-bold text-xs bg-emerald-500 text-slate-950">
              Create Venue
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreateVenuePage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <SetupBackNavigation label="Back to Venues" href="/locations/venues" />
      <PageHeader
        overline="Setup · Locations"
        title="Create Venue"
        sub="A venue is a physical building or outdoor location where customers arrive for events."
      />
      <Suspense fallback={<div className="text-xs text-ink-mut p-8">Loading form...</div>}>
        <CreateVenueForm />
      </Suspense>
    </div>
  );
}
