"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { nextId, type CategoryInput } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { PageFrame, PrototypeRoleNote } from "@/components/geo/layout";
import { WizardShell, useWizard } from "@/components/geo/WizardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Button } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { Tide } from "@/components/motion/Motion";
import { ArrowLeft, ArrowRight, Layers, X } from "lucide-react";

const STEPS = [
  { label: "Identity", sub: "Name, code, traits" },
  { label: "Defaults & Risk", sub: "Age, capacity, staffing" },
  { label: "Venue Compatibility", sub: "What a venue needs" },
  { label: "Review", sub: "Save & set status" },
];

export default function NewCategoryPage() {
  const router = useRouter();
  const { state, role, canAccess, hydrated, createActivityCategory } = useStore();
  const { step, next, back, jump } = useWizard(4);

  const [name, setName] = useState("");
  const [shortCode, setShortCode] = useState("");
  const [icon, setIcon] = useState("Activity");
  const [riskLevel, setRiskLevel] = useState<CategoryInput["riskLevel"]>("low");
  const [description, setDescription] = useState("");
  const [traits, setTraits] = useState("");
  const [isIndoor, setIsIndoor] = useState<"indoor" | "outdoor">("indoor");
  const [ageMin, setAgeMin] = useState("10");
  const [ageMax, setAgeMax] = useState("60");
  const [pMin, setPMin] = useState("2");
  const [pTarget, setPTarget] = useState("8");
  const [pMax, setPMax] = useState("12");
  const [teamSize, setTeamSize] = useState("2");
  const [duration, setDuration] = useState("60");
  const [referee, setReferee] = useState<"none" | "optional" | "required">("none");
  const [coordinatorRequired, setCoordinatorRequired] = useState(true);
  const [specialistRequired, setSpecialistRequired] = useState(false);
  const [safetyContactRequired, setSafetyContactRequired] = useState(false);
  const [weatherDependency, setWeatherDependency] = useState(false);
  const [compatIndoor, setCompatIndoor] = useState<"indoor" | "outdoor" | "hybrid">("indoor");
  const [minAreaCapacity, setMinAreaCapacity] = useState("");
  const [lightingRequired, setLightingRequired] = useState(false);
  const [washroomRequired, setWashroomRequired] = useState(true);
  const [accessibilityRequired, setAccessibilityRequired] = useState(false);
  const [equipment, setEquipment] = useState("");

  const code = shortCode.trim() || name.trim().slice(0, 8).toUpperCase() || "NEW";
  const num = (v: string, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const stepValid: Record<number, boolean> = {
    0: name.trim().length >= 2,
    1: num(ageMin) > 0 && num(ageMax) > num(ageMin) && num(pMax) >= num(pMin) && num(pTarget) >= num(pMin) && num(pTarget) <= num(pMax),
    2: true,
    3: true,
  };

  const equipList = equipment.split(",").map((s) => s.trim()).filter(Boolean);

  const handleCreate = (status: CategoryInput["status"]) => {
    const id = nextId("cat", state.categories.map((c) => c.id));
    createActivityCategory({
      id,
      name: name.trim(),
      description: description.trim() || "New activity family.",
      icon,
      visualTreatment: "accent-cool",
      riskLevel,
      isIndoor: isIndoor === "indoor",
      equipmentRequirements: equipList,
      defaultStaffing: coordinatorRequired ? ["coordinator"] : [],
      defaultDuration: num(duration, 60),
      defaultAgeMin: num(ageMin, 10),
      defaultAgeMax: num(ageMax, 60),
      defaultParticipantsMin: num(pMin, 2),
      defaultParticipantsMax: num(pMax, 12),
      shortCode: code,
      status,
      traits: traits.split(",").map((s) => s.trim()).filter(Boolean),
      defaultTargetParticipants: num(pTarget, 8),
      defaultTeamSize: num(teamSize, 2),
      defaultCoordinatorRequired: coordinatorRequired,
      refereeRequirement: referee,
      activitySpecialistRequired: specialistRequired,
      safetyContactRequired: safetyContactRequired,
      participantRequirements: [],
      weatherDependency: weatherDependency,
      venueCompat: {
        indoorOutdoor: compatIndoor,
        minAreaCapacity: num(minAreaCapacity) || undefined,
        lightingRequired: lightingRequired,
        washroomRequired: washroomRequired,
        accessibilityRequired: accessibilityRequired,
        requiredEquipment: equipList,
      },
      createdAt: "today",
      updatedAt: "today",
    });
    router.push(`/catalog/categories/${id}`);
  };

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/catalog")) return <PageFrame><PermissionDenied module="Catalog" /></PageFrame>;

  if (!geoCan(role.id, "manage-catalog")) {
    return (
      <PageFrame>
        <PageHeader overline="Catalog · Categories" title="New category" />
        <Card glass={false} className="mt-6">
          <PanelHeader
            title="Catalog shaping is reserved for the platform"
            sub="Only the platform owner or a super admin can create activity categories."
          />
          <p className="mt-3 text-sm text-ink-mut">
            Your current position can review the catalog but cannot add categories to it. Switch position with the role
            simulator to try it.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => router.push("/catalog/categories")}>
              <ArrowLeft className="h-4 w-4" /> Back to categories
            </Button>
            <PrototypeRoleNote />
          </div>
        </Card>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <PageHeader
        overline="Catalog · Categories"
        title="New category"
        sub="Define an activity family — its defaults, risk posture and the venue capabilities it requires."
      />
      <WizardShell
        steps={STEPS}
        step={step}
        onStep={jump}
        className="mt-6"
        footer={
          <>
            <Button variant="ghost" onClick={() => router.push("/catalog/categories")}>
              <X className="h-4 w-4" /> Cancel
            </Button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="secondary" onClick={back}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
              )}
              {step < 3 ? (
                <Button variant="primary" disabled={!stepValid[step]} onClick={next}>
                  Next <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => handleCreate("draft")}>
                    Save as draft
                  </Button>
                  <Button variant="primary" onClick={() => handleCreate("active")}>
                    <Layers className="h-4 w-4" /> Create category
                  </Button>
                </div>
              )}
            </div>
          </>
        }
      >
        {step === 0 && (
          <div className="space-y-5">
            <Field label="Category name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pickleball" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Short code" hint="Used across temp IDs and filters.">
                <Input value={shortCode} onChange={(e) => setShortCode(e.target.value)} placeholder={`${code}`} />
              </Field>
              <Field label="Icon">
                <Select value={icon} onChange={(e) => setIcon(e.target.value)}>
                  <option value="Activity">Activity</option>
                  <option value="Cricket">Cricket</option>
                  <option value="Gamepad2">Gamepad</option>
                  <option value="Dices">Dices</option>
                </Select>
              </Field>
            </div>
            <Field label="Description" hint="What this family of play is about.">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Short operator-facing description…" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Traits" hint="Comma-separated, e.g. social, outdoor, competitive.">
                <Input value={traits} onChange={(e) => setTraits(e.target.value)} placeholder="social, outdoor" />
              </Field>
              <Field label="Risk level">
                <Select value={riskLevel} onChange={(e) => setRiskLevel(e.target.value as CategoryInput["riskLevel"])}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </Select>
              </Field>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <Field label="Default setting">
              <Select value={isIndoor} onChange={(e) => setIsIndoor(e.target.value as "indoor" | "outdoor")}>
                <option value="indoor">Indoor</option>
                <option value="outdoor">Outdoor</option>
              </Select>
            </Field>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Age min"><Input type="number" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} /></Field>
              <Field label="Age max"><Input type="number" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} /></Field>
              <Field label="Default duration (min)"><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Participants min"><Input type="number" value={pMin} onChange={(e) => setPMin(e.target.value)} /></Field>
              <Field label="Target"><Input type="number" value={pTarget} onChange={(e) => setPTarget(e.target.value)} /></Field>
              <Field label="Max"><Input type="number" value={pMax} onChange={(e) => setPMax(e.target.value)} /></Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Default team size"><Input type="number" value={teamSize} onChange={(e) => setTeamSize(e.target.value)} /></Field>
              <Field label="Referee requirement">
                <Select value={referee} onChange={(e) => setReferee(e.target.value as "none" | "optional" | "required")}>
                  <option value="none">None</option>
                  <option value="optional">Optional</option>
                  <option value="required">Required</option>
                </Select>
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Coordinator by default", value: coordinatorRequired, set: setCoordinatorRequired },
                { label: "Activity specialist", value: specialistRequired, set: setSpecialistRequired },
                { label: "Safety contact", value: safetyContactRequired, set: setSafetyContactRequired },
              ].map((t) => (
                <label key={t.label} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-xs text-ink-sec">
                  <input
                    type="checkbox"
                    checked={t.value}
                    onChange={(e) => t.set(e.target.checked)}
                    className="accent-[#4c6fff]"
                  />
                  {t.label}
                </label>
              ))}
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-xs text-ink-sec">
              <input type="checkbox" checked={weatherDependency} onChange={(e) => setWeatherDependency(e.target.checked)} className="accent-[#4c6fff]" />
              Weather-dependent (outdoor slots need a weather risk plan)
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <Field label="Required setting">
              <Select value={compatIndoor} onChange={(e) => setCompatIndoor(e.target.value as "indoor" | "outdoor" | "hybrid")}>
                <option value="indoor">Indoor only</option>
                <option value="outdoor">Outdoor only</option>
                <option value="hybrid">Either</option>
              </Select>
            </Field>
            <Field label="Minimum venue safety capacity" hint="Venues below this capacity are marked incompatible.">
              <Input type="number" value={minAreaCapacity} onChange={(e) => setMinAreaCapacity(e.target.value)} placeholder="e.g. 40" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { label: "Lighting required", value: lightingRequired, set: setLightingRequired },
                { label: "Washrooms required", value: washroomRequired, set: setWashroomRequired },
                { label: "Accessibility required", value: accessibilityRequired, set: setAccessibilityRequired },
              ].map((t) => (
                <label key={t.label} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-xs text-ink-sec">
                  <input type="checkbox" checked={t.value} onChange={(e) => t.set(e.target.checked)} className="accent-[#4c6fff]" />
                  {t.label}
                </label>
              ))}
            </div>
            <Field label="Required venue equipment" hint="Comma-separated items the venue must stock.">
              <Input value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="e.g. Pickleball paddles, Nets" />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <p className="overline">Summary</p>
            <div className="space-y-1">
              {[
                ["Name", name.trim() || "—"],
                ["Short code", code],
                ["Risk", riskLevel],
                ["Setting", isIndoor],
                ["Age range", `${ageMin}–${ageMax}`],
                ["Participants", `${pMin} / ${pTarget} / ${pMax}`],
                ["Team size", teamSize],
                ["Referee", referee],
                ["Compat", compatIndoor],
              ].map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-4 border-b border-white/4 py-1.5">
                  <span className="overline shrink-0 pt-px">{label}</span>
                  <span className="min-w-0 text-right text-sm capitalize text-ink-sec">{value}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-ink-mut">
              Saving as <span className="text-ink-lum">draft</span> keeps the category off the shelf until you activate it.
              Saving as <span className="text-ink-lum">active</span> publishes it for new template creation.
            </p>
            <PrototypeRoleNote />
          </div>
        )}
      </WizardShell>
    </PageFrame>
  );
}
