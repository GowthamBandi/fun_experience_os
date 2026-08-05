"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { nextId, cityById, territoryById, categoryName, type VenueInput } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { cn, inr } from "@/lib/format";
import { PageFrame, Proto, PrototypeNote, PrototypeRoleNote } from "@/components/geo/layout";
import { WizardShell, useWizard } from "@/components/geo/WizardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Button, Badge } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { Tide } from "@/components/motion/Motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

const STEPS = [
  { label: "Territory & City", sub: "Where this venue sits" },
  { label: "Identity", sub: "Name, type, address" },
  { label: "Operations", sub: "Hours, activities, equipment" },
  { label: "Capacity & Staffing", sub: "Limits and people" },
  { label: "Safety", sub: "Exits, first aid, contacts" },
  { label: "Commercial", sub: "Pricing, placeholder" },
  { label: "Review", sub: "Confirm & create" },
];

export default function NewVenuePage() {
  const router = useRouter();
  const { state, role, canAccess, hydrated, createVenue } = useStore();
  const { step, next, back, jump } = useWizard(7);

  const [territoryId, setTerritoryId] = useState("");
  const [cityId, setCityId] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<"arena" | "club" | "turf">("arena");
  const [address, setAddress] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [contactNumber, setContactNumber] = useState("");
  const [operatingHours, setOperatingHours] = useState("06:00 - 23:00");
  const [isIndoor, setIsIndoor] = useState<"yes" | "no">("yes");
  const [weatherDependent, setWeatherDependent] = useState<"yes" | "no">("no");
  const [supportedActivities, setSupportedActivities] = useState<string[]>([]);
  const [equipmentAvailable, setEquipmentAvailable] = useState("");
  const [safetyCapacity, setSafetyCapacity] = useState("");
  const [staffCapacity, setStaffCapacity] = useState("");
  const [spectatorAllowance, setSpectatorAllowance] = useState("");
  const [emergencyExits, setEmergencyExits] = useState("");
  const [firstAid, setFirstAid] = useState<"yes" | "no">("yes");
  const [safetyContact, setSafetyContact] = useState("");
  const [incidentNotes, setIncidentNotes] = useState("");
  const [costPerSlot, setCostPerSlot] = useState("1200");
  const [revenueModel, setRevenueModel] = useState<"fixed" | "revshare" | "other">("fixed");
  const [cancellationTerms, setCancellationTerms] = useState("");

  const citiesInTerritory = state.cities.filter((c) => c.territoryId === territoryId);
  const city = cityById(state, cityId);
  const citySupported = city?.supportedCategories ?? [];
  const activitiesValid =
    supportedActivities.length >= 1 && supportedActivities.every((a) => citySupported.includes(a));
  const safetyCap = Number(safetyCapacity);
  const staffCap = Number(staffCapacity);
  const specAllow = Number(spectatorAllowance || 0);
  const costSlot = Number(costPerSlot || 0);

  const stepValid: Record<number, boolean> = {
    0: territoryId !== "" && cityId !== "" && city?.territoryId === territoryId,
    1: name.trim().length > 0 && address.trim().length > 0,
    2: activitiesValid,
    3: safetyCap > 0 && staffCap > 0 && specAllow >= 0,
    4: emergencyExits.trim().length > 0 && safetyContact.trim().length > 0,
    5: true,
    6: true,
  };

  const toggleActivity = (id: string) =>
    setSupportedActivities((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const assumptions = [
    { label: "Territory", value: (territoryById(state, territoryId)?.name ?? territoryId) || "—" },
    { label: "City", value: (city?.name ?? cityId) || "—" },
    { label: "Name", value: name.trim() || "—" },
    { label: "Type", value: type },
    { label: "Address", value: address.trim() || "—" },
    { label: "Operating hours", value: operatingHours.trim() || "—" },
    { label: "Activities", value: supportedActivities.map((id) => categoryName(state, id)).join(", ") || "—" },
    { label: "Safety capacity", value: safetyCap > 0 ? String(safetyCap) : "—" },
    { label: "Staff capacity", value: staffCap > 0 ? String(staffCap) : "—" },
    { label: "Indoor", value: isIndoor === "yes" ? "Yes" : "No" },
    { label: "Cost per slot", value: inr(costSlot) },
    { label: "Revenue model", value: revenueModel },
    { label: "Status", value: "ready" },
    { label: "Verification", value: "pending" },
  ];

  const commercialLabels = new Set(["Cost per slot", "Revenue model"]);

  const handleCreate = () => {
    const id = nextId("v", state.venues.map((v) => v.id));
    createVenue({
      id,
      territoryId,
      cityId,
      name: name.trim(),
      address: address.trim(),
      contactPerson: contactPerson.trim(),
      contactNumber: contactNumber.trim(),
      type,
      operatingHours: operatingHours.trim(),
      supportedActivities,
      safetyCapacity: safetyCap,
      staffCapacity: staffCap,
      spectatorAllowance: specAllow,
      equipmentAvailable: equipmentAvailable.split(",").map((s) => s.trim()).filter(Boolean),
      accessibility: false,
      parking: false,
      washrooms: false,
      lighting: false,
      isIndoor: isIndoor === "yes",
      weatherDependent: weatherDependent === "yes",
      costPerSlot: costSlot,
      revenueModel,
      cancellationTerms: cancellationTerms.trim(),
      emergencyExits: emergencyExits.trim(),
      firstAid: firstAid === "yes",
      safetyContact: safetyContact.trim(),
      incidentNotes: incidentNotes.trim(),
      verificationStatus: "pending",
      status: "ready",
    });
    router.push(`/locations/venues/${id}`);
  };

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/locations")) return <PageFrame><PermissionDenied module="Locations" /></PageFrame>;

  if (!geoCan(role.id, "create-venue")) {
    return (
      <PageFrame>
        <PageHeader overline="Locations · Venues" title="New venue" />
        <Card glass={false} className="mt-6">
          <PanelHeader
            title="Venue creation is scoped to platform owners, super admins, regional partners and city managers"
            sub="Your current position can view venue operations but cannot open a new venue."
          />
          <p className="mt-3 text-sm text-ink-mut">
            Switch position with the role simulator to try creating a venue end to end.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href="/locations/venues">
              <Button variant="secondary">
                <ArrowLeft className="h-4 w-4" />
                Back to venues
              </Button>
            </Link>
            <PrototypeRoleNote />
          </div>
        </Card>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <PageHeader
        overline="Locations · Venues"
        title="New venue"
        sub="Seven steps to a venue that can host playing areas and missions."
      />
      <WizardShell
        steps={STEPS}
        step={step}
        onStep={jump}
        className="mt-6"
        footer={
          <>
            <Button variant="ghost" onClick={() => router.push("/locations/venues")}>
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="secondary" onClick={back}>
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
              )}
              {step < 6 ? (
                <Button variant="primary" disabled={!stepValid[step]} onClick={next}>
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="primary" onClick={handleCreate}>
                  Create venue
                </Button>
              )}
            </div>
          </>
        }
      >
        {step === 0 && (
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Territory">
                <Select value={territoryId} onChange={(e) => { setTerritoryId(e.target.value); setCityId(""); }}>
                  <option value="">Select a territory</option>
                  {state.territories.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="City">
                <Select value={cityId} onChange={(e) => setCityId(e.target.value)} disabled={!territoryId}>
                  <option value="">Select a city</option>
                  {citiesInTerritory.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.state})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {cityId && territoryId && city?.territoryId !== territoryId && (
              <p className="text-xs text-[#ff8f86]">City does not belong to this territory.</p>
            )}
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <Field label="Venue name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Central Turf Arena" />
            </Field>
            <Field label="Type">
              <Select value={type} onChange={(e) => setType(e.target.value as "arena" | "club" | "turf")}>
                <option value="arena">Arena</option>
                <option value="club">Club</option>
                <option value="turf">Turf</option>
              </Select>
            </Field>
            <Field label="Address" hint="Full street address — shown on the map placeholder.">
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="e.g. Plot 42, Financial District" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Contact person">
                <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} placeholder="e.g. Ravi Teja" />
              </Field>
              <Field label="Contact number">
                <Input value={contactNumber} onChange={(e) => setContactNumber(e.target.value)} placeholder="e.g. +91 98XXXXXX00" />
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <Field label="Operating hours">
              <Input value={operatingHours} onChange={(e) => setOperatingHours(e.target.value)} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Indoor venue">
                <Select value={isIndoor} onChange={(e) => setIsIndoor(e.target.value as "yes" | "no")}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </Field>
              <Field label="Weather dependent">
                <Select value={weatherDependent} onChange={(e) => setWeatherDependent(e.target.value as "yes" | "no")}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </Select>
              </Field>
            </div>
            <div>
              <p className="overline mb-2">Supported activities</p>
              <div className="flex flex-wrap gap-1.5">
                {state.categories.map((c) => {
                  const selected = supportedActivities.includes(c.id);
                  const supported = citySupported.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleActivity(c.id)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-[11px] transition-colors",
                        selected
                          ? "border-[#4c6fff]/40 bg-[#4c6fff]/15 text-[#9db4ff]"
                          : supported
                            ? "border-white/8 bg-white/4 text-ink-sec hover:bg-white/8"
                            : "border-white/6 bg-white/2 text-ink-mut/60",
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
              {citySupported.length > 0 ? (
                <p className="mt-2 text-xs text-ink-mut">
                  This city supports: {citySupported.map((id) => categoryName(state, id)).join(", ")}.
                </p>
              ) : (
                city && <p className="mt-2 text-xs text-ink-mut">No categories configured for this city yet.</p>
              )}
              {supportedActivities.length > 0 && !supportedActivities.every((a) => citySupported.includes(a)) && (
                <p className="mt-2 text-xs text-[#ff8f86]">
                  Some selected categories are not supported in this city.
                </p>
              )}
            </div>
            <Field label="Equipment available" hint="Comma-separated — persisted as placeholder values.">
              <Input
                value={equipmentAvailable}
                onChange={(e) => setEquipmentAvailable(e.target.value)}
                placeholder="e.g. Footballs, Bibs, Cones"
              />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <Field label="Safety capacity" hint="Must be greater than 0 — the venue-wide headroom.">
              <Input type="number" min={0} value={safetyCapacity} onChange={(e) => setSafetyCapacity(e.target.value)} placeholder="e.g. 120" />
            </Field>
            <Field label="Staff capacity" hint="Must be greater than 0.">
              <Input type="number" min={0} value={staffCapacity} onChange={(e) => setStaffCapacity(e.target.value)} placeholder="e.g. 12" />
            </Field>
            <Field label="Spectator allowance" hint="Can be zero.">
              <Input type="number" min={0} value={spectatorAllowance} onChange={(e) => setSpectatorAllowance(e.target.value)} placeholder="e.g. 40" />
            </Field>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <Field label="Emergency exits" hint="Required.">
              <Input value={emergencyExits} onChange={(e) => setEmergencyExits(e.target.value)} placeholder="e.g. 2 main gates + rear service exit" />
            </Field>
            <Field label="First aid available">
              <Select value={firstAid} onChange={(e) => setFirstAid(e.target.value as "yes" | "no")}>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </Field>
            <Field label="Safety contact" hint="Required.">
              <Input value={safetyContact} onChange={(e) => setSafetyContact(e.target.value)} placeholder="e.g. +91 99XXXXXXXX" />
            </Field>
            <Field label="Incident notes" hint="Optional.">
              <Input value={incidentNotes} onChange={(e) => setIncidentNotes(e.target.value)} placeholder="Context for the safety team…" />
            </Field>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <PrototypeNote>Prototype configuration — no legal contract, settlement or payout system is connected.</PrototypeNote>
            <Field label="Cost per slot">
              <Input type="number" min={0} value={costPerSlot} onChange={(e) => setCostPerSlot(e.target.value)} />
              <span className="mt-2 flex items-center gap-1.5"><Proto /></span>
            </Field>
            <Field label="Revenue model">
              <Select value={revenueModel} onChange={(e) => setRevenueModel(e.target.value as "fixed" | "revshare" | "other")}>
                <option value="fixed">Fixed</option>
                <option value="revshare">Revenue share</option>
                <option value="other">Other</option>
              </Select>
              <span className="mt-2 flex items-center gap-1.5"><Proto /></span>
            </Field>
            <Field label="Cancellation terms">
              <Input value={cancellationTerms} onChange={(e) => setCancellationTerms(e.target.value)} placeholder="e.g. Free cancellation up to 6 hours before" />
              <span className="mt-2 flex items-center gap-1.5"><Proto /></span>
            </Field>
          </div>
        )}

        {step === 6 && (
          <div className="space-y-5">
            <div>
              <p className="overline mb-2">Assumptions</p>
              <div className="space-y-1">
                {assumptions.map((a) => (
                  <div key={a.label} className="flex items-start justify-between gap-4 border-b border-white/4 py-1.5">
                    <span className="overline shrink-0 pt-px">{a.label}</span>
                    <span className="flex min-w-0 items-center justify-end gap-1.5 text-right text-sm text-ink-sec">
                      {a.value}
                      {commercialLabels.has(a.label) && <Proto />}
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <PrototypeNote>Prototype configuration — no legal contract, settlement or payout system is connected.</PrototypeNote>
            <PrototypeRoleNote />
          </div>
        )}
      </WizardShell>
    </PageFrame>
  );
}
