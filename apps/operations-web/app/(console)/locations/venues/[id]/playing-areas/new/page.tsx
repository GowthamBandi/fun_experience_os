"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { nextId, venueById, type PlayingAreaInput } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { cn } from "@/lib/format";
import { Breadcrumbs, PageFrame, PrototypeNote, PrototypeRoleNote } from "@/components/geo/layout";
import { WizardShell, useWizard } from "@/components/geo/WizardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Button, Badge } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { Tide } from "@/components/motion/Motion";
import { ArrowLeft, ArrowRight, X } from "lucide-react";

const STEPS = [
  { label: "Identity", sub: "Name and hours" },
  { label: "Compatibility & Capacity", sub: "Activities, limits" },
  { label: "Equipment & Status", sub: "Kit and availability" },
  { label: "Review", sub: "Confirm & create" },
];

export default function NewPlayingAreaPage() {
  const router = useRouter();
  const { id: venueId } = useParams<{ id: string }>();
  const { state, role, canAccess, hydrated, createPlayingArea } = useStore();
  const { step, next, back, jump } = useWizard(4);

  const [name, setName] = useState("");
  const [operatingHours, setOperatingHours] = useState("06:00 - 23:00");
  const [activityCompatibility, setActivityCompatibility] = useState<string[]>([]);
  const [maxCapacity, setMaxCapacity] = useState("");
  const [staffCapacity, setStaffCapacity] = useState("");
  const [spectatorCapacity, setSpectatorCapacity] = useState("");
  const [equipment, setEquipment] = useState("");
  const [restrictions, setRestrictions] = useState("");
  const [status, setStatus] = useState<PlayingAreaInput["status"]>("active");

  const venue = venueById(state, venueId);
  const venueCategories = venue ? state.categories.filter((c) => venue.supportedActivities.includes(c.id)) : [];
  const activitiesValid =
    activityCompatibility.length >= 1 &&
    activityCompatibility.every((a) => (venue ? venue.supportedActivities.includes(a) : false));
  const nameUnique = venue
    ? !state.playingAreas.some(
        (p) => p.venueId === venueId && p.name.trim().toLowerCase() === name.trim().toLowerCase(),
      )
    : false;
  const capacity = Number(maxCapacity);
  const staffCap = Number(staffCapacity);
  const specCap = Number(spectatorCapacity || 0);

  const stepValid: Record<number, boolean> = {
    0: name.trim().length > 0 && nameUnique,
    1: activitiesValid && capacity > 0 && capacity <= (venue?.safetyCapacity ?? 0) && staffCap > 0 && specCap >= 0,
    2: true,
    3: true,
  };

  const toggleActivity = (id: string) =>
    setActivityCompatibility((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const assumptions = [
    { label: "Venue", value: venue?.name ?? venueId },
    { label: "Name", value: name.trim() || "—" },
    { label: "Operating hours", value: operatingHours.trim() || "—" },
    { label: "Activities", value: activityCompatibility.join(", ") || "—" },
    { label: "Max capacity", value: capacity > 0 ? String(capacity) : "—" },
    { label: "Safety ceiling", value: venue ? String(venue.safetyCapacity) : "—" },
    { label: "Status", value: status },
  ];

  const handleCreate = () => {
    const id = nextId("pa", state.playingAreas.map((p) => p.id));
    createPlayingArea({
      id,
      venueId,
      name: name.trim(),
      activityCompatibility,
      maxCapacity: capacity,
      staffCapacity: staffCap,
      spectatorCapacity: specCap,
      equipment: equipment.split(",").map((s) => s.trim()).filter(Boolean),
      operatingHours: operatingHours.trim(),
      status,
      restrictions: restrictions.trim(),
    });
    router.push(`/locations/playing-areas/${id}`);
  };

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/locations")) return <PageFrame><PermissionDenied module="Locations" /></PageFrame>;

  if (!geoCan(role.id, "create-playing-area")) {
    return (
      <PageFrame>
        <PageHeader overline="Locations · Venues" title="New playing area" />
        <Card glass={false} className="mt-6">
          <PanelHeader
            title="Playing area creation is scoped to managers"
            sub="Your current position can view locations but cannot open a new playing area."
          />
          <p className="mt-3 text-sm text-ink-mut">
            Switch position with the role simulator to try creating a playing area end to end.
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

  if (!venue) {
    return (
      <PageFrame>
        <Breadcrumbs
          items={[
            { label: "Locations", href: "/locations" },
            { label: "Venues", href: "/locations/venues" },
            { label: venueId },
          ]}
        />
        <div className="solid rounded-panel p-10 text-center">
          <p className="text-sm font-medium text-ink-lum">Venue not found</p>
          <p className="mt-1 text-sm text-ink-mut">A playing area belongs to exactly one venue — this one doesn&apos;t exist.</p>
          <Button variant="secondary" className="mt-5" onClick={() => router.push("/locations/venues")}>
            <ArrowLeft className="h-4 w-4" />
            Back to venues
          </Button>
        </div>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <Breadcrumbs
        items={[
          { label: "Locations", href: "/locations" },
          { label: "Venues", href: "/locations/venues" },
          { label: venue.name, href: `/locations/venues/${venueId}` },
          { label: "New playing area" },
        ]}
      />

      <PageHeader
        overline="Locations · Venues · Playing areas"
        title="New playing area"
        sub="A playing area belongs to exactly one venue."
        right={
          <Link href={`/locations/venues/${venueId}`}>
            <Badge className="border border-white/8 bg-white/4 text-ink-sec transition-colors hover:bg-white/8">
              {venue.name}
            </Badge>
          </Link>
        }
      />

      <WizardShell
        steps={STEPS}
        step={step}
        onStep={jump}
        className="mt-6"
        footer={
          <>
            <Button variant="ghost" onClick={() => router.push(`/locations/venues/${venueId}`)}>
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
              {step < 3 ? (
                <Button variant="primary" disabled={!stepValid[step]} onClick={next}>
                  Next
                  <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button variant="primary" onClick={handleCreate}>
                  Create playing area
                </Button>
              )}
            </div>
          </>
        }
      >
        {step === 0 && (
          <div className="space-y-5">
            <Field label="Playing area name" hint="Must be unique within this venue.">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Turf North" />
            </Field>
            {name.trim().length > 0 && !nameUnique && (
              <p className="text-xs text-[#ff8f86]">A playing area with this name already exists at this venue.</p>
            )}
            <Field label="Operating hours">
              <Input value={operatingHours} onChange={(e) => setOperatingHours(e.target.value)} />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <p className="overline mb-2">Activity compatibility</p>
              <div className="flex flex-wrap gap-1.5">
                {venueCategories.map((c) => {
                  const selected = activityCompatibility.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleActivity(c.id)}
                      className={cn(
                        "rounded-md border px-2.5 py-1 text-[11px] transition-colors",
                        selected
                          ? "border-[#4c6fff]/40 bg-[#4c6fff]/15 text-[#9db4ff]"
                          : "border-white/8 bg-white/4 text-ink-sec hover:bg-white/8",
                      )}
                    >
                      {c.name}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-ink-mut">
                Only activities the parent venue supports are selectable.
              </p>
              {activityCompatibility.length > 0 &&
                !activityCompatibility.every((a) => venue.supportedActivities.includes(a)) && (
                  <p className="mt-2 text-xs text-[#ff8f86]">
                    Some selected activities are not supported by this venue.
                  </p>
                )}
            </div>
            <Field
              label="Max capacity"
              hint={`Must stay within the venue's safety capacity (${venue.safetyCapacity}).`}
            >
              <Input type="number" min={0} value={maxCapacity} onChange={(e) => setMaxCapacity(e.target.value)} placeholder="e.g. 60" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Staff capacity" hint="Must be greater than 0.">
                <Input type="number" min={0} value={staffCapacity} onChange={(e) => setStaffCapacity(e.target.value)} placeholder="e.g. 4" />
              </Field>
              <Field label="Spectator capacity" hint="Can be zero.">
                <Input type="number" min={0} value={spectatorCapacity} onChange={(e) => setSpectatorCapacity(e.target.value)} placeholder="e.g. 20" />
              </Field>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <Field label="Equipment" hint="Comma-separated.">
              <Input value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="e.g. Goals, Bibs, Cones" />
            </Field>
            <Field label="Restrictions">
              <Input value={restrictions} onChange={(e) => setRestrictions(e.target.value)} placeholder="e.g. No footwear, no cleats" />
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(e) => setStatus(e.target.value as PlayingAreaInput["status"])}>
                <option value="active">Active</option>
                <option value="maintenance">Maintenance</option>
                <option value="unavailable">Unavailable</option>
                <option value="closed">Closed</option>
              </Select>
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <PrototypeNote>
              A playing area is a real floor inside the venue — but its capacity and activities are prototype
              configuration, not production enforcement.
            </PrototypeNote>
            <div>
              <p className="overline mb-2">Assumptions</p>
              <div className="space-y-1">
                {assumptions.map((a) => (
                  <div key={a.label} className="flex items-start justify-between gap-4 border-b border-white/4 py-1.5">
                    <span className="overline shrink-0 pt-px">{a.label}</span>
                    <span className="min-w-0 text-right text-sm text-ink-sec">{a.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <PrototypeRoleNote />
          </div>
        )}
      </WizardShell>
    </PageFrame>
  );
}
