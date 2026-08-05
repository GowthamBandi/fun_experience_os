"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import {
  nextId,
  templateReadiness,
  categoryName,
  type TemplateInput,
} from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { PageFrame, PrototypeRoleNote } from "@/components/geo/layout";
import { WizardShell, useWizard } from "@/components/geo/WizardShell";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Button } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { Tide } from "@/components/motion/Motion";
import { ArrowLeft, ArrowRight, Check, Rocket, X } from "lucide-react";
import { ReadinessPanel } from "@/components/catalog/CatalogBits";

const STEPS = [
  { label: "Identity & Promise", sub: "Name, category, story" },
  { label: "Capacity & Teams", sub: "Seats, age, groups" },
  { label: "Timing & Booking", sub: "Window, close, reveal" },
  { label: "Pricing", sub: "Price, costs, margin" },
  { label: "Operations & Safety", sub: "Staff, equipment, venue" },
  { label: "Reveal & Review", sub: "Privacy keys & gates" },
];

const num = (v: string, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

export default function NewTemplatePage() {
  const router = useRouter();
  const { state, role, canAccess, hydrated, createExperienceTemplate } = useStore();
  const { step, next, back, jump } = useWizard(6);

  const categories = state.categories.filter((c) => c.status === "active");

  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  const [name, setName] = useState("");
  const [shortDesc, setShortDesc] = useState("");
  const [fullDesc, setFullDesc] = useState("");
  const [objective, setObjective] = useState("");
  const [promise, setPromise] = useState("");
  const [format, setFormat] = useState<"open" | "women" | "men" | "mixed">("mixed");
  const [entryType, setEntryType] = useState<"individual" | "duo" | "preformed-team">("individual");
  const [competitiveLevel, setCompetitiveLevel] = useState("social");
  const [isTournament, setIsTournament] = useState(false);

  const [ageMin, setAgeMin] = useState("10");
  const [ageMax, setAgeMax] = useState("60");
  const [minP, setMinP] = useState("6");
  const [targetP, setTargetP] = useState("10");
  const [maxP, setMaxP] = useState("12");
  const [teamSize, setTeamSize] = useState("2");
  const [numTeams, setNumTeams] = useState("2");
  const [spectatorAllowance, setSpectatorAllowance] = useState("10");
  const [compSlots, setCompSlots] = useState("0");
  const [blockedSlots, setBlockedSlots] = useState("0");
  const [verificationRequired, setVerificationRequired] = useState(false);

  const [duration, setDuration] = useState("90");
  const [checkInWindow, setCheckInWindow] = useState("10");
  const [bookingOpenDays, setBookingOpenDays] = useState("5");
  const [bookingCloseHours, setBookingCloseHours] = useState("2");
  const [revealHoursBefore, setRevealHoursBefore] = useState("1");
  const [lateArrivalMins, setLateArrivalMins] = useState("10");
  const [completionBufferMins, setCompletionBufferMins] = useState("10");
  const [recurrence, setRecurrence] = useState("weekly");
  const [waitlistDefault, setWaitlistDefault] = useState(true);
  const [substitutes, setSubstitutes] = useState("2");

  const [basePrice, setBasePrice] = useState("299");
  const [taxAmount, setTaxAmount] = useState("54");
  const [platformFee, setPlatformFee] = useState("15");
  const [venueCost, setVenueCost] = useState("800");
  const [equipmentCost, setEquipmentCost] = useState("150");
  const [staffingCost, setStaffingCost] = useState("400");
  const [promoEligible, setPromoEligible] = useState(true);
  const [refundPolicy, setRefundPolicy] = useState("Full refund 12h prior");

  const [coordinatorCount, setCoordinatorCount] = useState("1");
  const [refereeRequired, setRefereeRequired] = useState(false);
  const [safetyContactRequired, setSafetyContactRequired] = useState(false);
  const [equipmentChecklist, setEquipmentChecklist] = useState("");
  const [participantChecklist, setParticipantChecklist] = useState("");
  const [weatherDependency, setWeatherDependency] = useState(false);
  const [cancellationThreshold, setCancellationThreshold] = useState("6");
  const [safetyLevel, setSafetyLevel] = useState<"low" | "medium" | "high">("low");
  const [indoorOutdoorNeed, setIndoorOutdoorNeed] = useState<"indoor" | "outdoor" | "hybrid" | "any">("any");
  const [minAreaCapacity, setMinAreaCapacity] = useState("");

  const [anonymousJoined, setAnonymousJoined] = useState(false);
  const [showJoinedBeforeReveal, setShowJoinedBeforeReveal] = useState(false);
  const [tempIdFormat, setTempIdFormat] = useState("XP-##");
  const [aliasStyle, setAliasStyle] = useState("ExperienceHero");
  const [teamAssignmentRule, setTeamAssignmentRule] = useState("random");
  const [revealTimeMinsBefore, setRevealTimeMinsBefore] = useState("60");
  const [infoRevealed, setInfoRevealed] = useState("Team name, Temporary ID, Playing field");
  const [infoNeverRevealed, setInfoNeverRevealed] = useState("Legal identity, Phone number");
  const [preRevealPreview, setPreRevealPreview] = useState("Details unlock at reveal time.");
  const [postRevealPreview, setPostRevealPreview] = useState("Full roster and location visible after reveal.");

  const stepValid: Record<number, boolean> = {
    0: name.trim().length >= 2 && !!categoryId,
    1: num(ageMin) > 0 && num(ageMax) > num(ageMin) && num(minP) <= num(maxP) && num(targetP) >= num(minP) && num(targetP) <= num(maxP),
    2: num(duration) > 0 && num(bookingOpenDays) > 0 && num(bookingCloseHours) > 0 && num(revealHoursBefore) > 0,
    3: num(basePrice) > 0,
    4: num(coordinatorCount) >= 1,
    5: true,
  };

  const candidate = useMemo<TemplateInput>(
    () => ({
      categoryId,
      name: name.trim(),
      shortDesc: shortDesc.trim() || "Short description pending.",
      fullDesc: fullDesc.trim() || "Full description pending.",
      objective: objective.trim() || "Run the session to promise.",
      promise: promise.trim() || "Minimum play time guaranteed.",
      status: "draft",
      format,
      isTournament,
      entryType,
      competitiveLevel,
      ageMin: num(ageMin, 10),
      ageMax: num(ageMax, 60),
      verificationRequired,
      minParticipants: num(minP, 6),
      targetParticipants: num(targetP, 10),
      maxParticipants: num(maxP, 12),
      teamSize: num(teamSize, 2),
      numTeams: num(numTeams, 2),
      spectatorAllowance: num(spectatorAllowance, 10),
      compSlots: num(compSlots),
      blockedSlots: num(blockedSlots),
      duration: num(duration, 90),
      checkInWindow: num(checkInWindow, 10),
      bookingOpenDays: num(bookingOpenDays, 5),
      bookingCloseHours: num(bookingCloseHours, 2),
      revealHoursBefore: num(revealHoursBefore, 1),
      lateArrivalMins: num(lateArrivalMins, 10),
      completionBufferMins: num(completionBufferMins, 10),
      basePrice: num(basePrice, 299),
      taxAmount: num(taxAmount),
      platformFee: num(platformFee),
      venueCost: num(venueCost, 800),
      equipmentCost: num(equipmentCost, 150),
      promoEligible,
      refundPolicyTemplate: refundPolicy,
      requiredRoles: coordinatorCount ? ["coordinator"] : [],
      coordinatorsCount: num(coordinatorCount, 1),
      refereeRequired,
      safetyContactRequired,
      equipmentChecklist: list(equipmentChecklist),
      participantChecklist: list(participantChecklist),
      weatherDependency,
      cancellationThreshold: num(cancellationThreshold, 6),
      anonymousJoinedCount: anonymousJoined,
      tempIdFormat: tempIdFormat.trim(),
      aliasStyle: aliasStyle.trim(),
      teamAssignmentRule,
      revealTimeMinsBefore: num(revealTimeMinsBefore, 60),
      infoRevealed: list(infoRevealed),
      infoNeverRevealed: list(infoNeverRevealed),
      substitutes: num(substitutes, 2),
      waitlistDefault,
      recurrenceSuitability: recurrence,
      staffingCost: num(staffingCost, 400),
      showJoinedCountBeforeReveal: showJoinedBeforeReveal,
      preRevealPreview: preRevealPreview.trim(),
      postRevealPreview: postRevealPreview.trim(),
      safetyLevel,
      legalReviewStatus: "pending",
      dataRetentionPlaceholder: "30 days (prototype placeholder)",
      venueCompat: {
        indoorOutdoorNeed,
        minAreaCapacity: num(minAreaCapacity) || undefined,
      },
      createdAt: "today",
      updatedAt: "today",
    }),
    [
      categoryId, name, shortDesc, fullDesc, objective, promise, format, entryType, competitiveLevel, isTournament,
      ageMin, ageMax, minP, targetP, maxP, teamSize, numTeams, spectatorAllowance, compSlots, blockedSlots, verificationRequired,
      duration, checkInWindow, bookingOpenDays, bookingCloseHours, revealHoursBefore, lateArrivalMins, completionBufferMins,
      recurrence, waitlistDefault, substitutes, basePrice, taxAmount, platformFee, venueCost, equipmentCost, staffingCost,
      promoEligible, refundPolicy, coordinatorCount, refereeRequired, safetyContactRequired, equipmentChecklist,
      participantChecklist, weatherDependency, cancellationThreshold, safetyLevel, indoorOutdoorNeed, minAreaCapacity,
      anonymousJoined, showJoinedBeforeReveal, tempIdFormat, aliasStyle, teamAssignmentRule, revealTimeMinsBefore,
      infoRevealed, infoNeverRevealed, preRevealPreview, postRevealPreview,
    ],
  );

  const readiness = useMemo(() => {
    const withId = { ...candidate, id: "candidate", categoryId: candidate.categoryId };
    return templateReadiness(state, withId);
  }, [candidate, state]);

  const handleCreate = (status: TemplateInput["status"]) => {
    const id = nextId("et", state.templates.map((t) => t.id));
    createExperienceTemplate({ ...candidate, id, status, categoryId: candidate.categoryId });
    router.push(`/catalog/experiences/${id}`);
  };

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/catalog")) return <PageFrame><PermissionDenied module="Catalog" /></PageFrame>;

  if (!geoCan(role.id, "manage-catalog")) {
    return (
      <PageFrame>
        <PageHeader overline="Catalog · Experiences" title="New template" />
        <Card glass={false} className="mt-6">
          <PanelHeader
            title="Catalog shaping is reserved for the platform"
            sub="Only the platform owner or a super admin can build experience templates."
          />
          <p className="mt-3 text-sm text-ink-mut">
            Your current position can review experiences but cannot author them. Switch position with the role simulator to
            try it.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button variant="secondary" onClick={() => router.push("/catalog/experiences")}>
              <ArrowLeft className="h-4 w-4" /> Back to experiences
            </Button>
            <PrototypeRoleNote />
          </div>
        </Card>
      </PageFrame>
    );
  }

  const canActivate = readiness.ready;

  return (
    <PageFrame>
      <PageHeader
        overline="Catalog · Experiences"
        title="New experience template"
        sub="Author a format end to end. Saving as draft keeps it off the shelf; activation is gated on critical validation."
      />
      <WizardShell
        steps={STEPS}
        step={step}
        onStep={jump}
        className="mt-6"
        footer={
          <>
            <Button variant="ghost" onClick={() => router.push("/catalog/experiences")}>
              <X className="h-4 w-4" /> Cancel
            </Button>
            <div className="flex items-center gap-2">
              {step > 0 && (
                <Button variant="secondary" onClick={back}>
                  <ArrowLeft className="h-4 w-4" /> Back
                </Button>
              )}
              {step < 5 ? (
                <Button variant="primary" disabled={!stepValid[step]} onClick={next}>
                  Next <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <>
                  <Button variant="secondary" onClick={() => handleCreate("draft")}>
                    Save as draft
                  </Button>
                  <Button variant="primary" disabled={!canActivate} onClick={() => handleCreate("active")}>
                    <Rocket className="h-4 w-4" /> Save & activate
                  </Button>
                </>
              )}
            </div>
          </>
        }
      >
        {step === 0 && (
          <div className="space-y-5">
            <Field label="Category">
              <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Template name">
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pickleball Social Mixer" />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Format">
                <Select value={format} onChange={(e) => setFormat(e.target.value as "open" | "women" | "men" | "mixed")}>
                  <option value="mixed">Mixed</option>
                  <option value="open">Open</option>
                  <option value="women">Women only</option>
                  <option value="men">Men only</option>
                </Select>
              </Field>
              <Field label="Entry type">
                <Select value={entryType} onChange={(e) => setEntryType(e.target.value as "individual" | "duo" | "preformed-team")}>
                  <option value="individual">Individual</option>
                  <option value="duo">Duo</option>
                  <option value="preformed-team">Pre-formed team</option>
                </Select>
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Competitive level">
                <Input value={competitiveLevel} onChange={(e) => setCompetitiveLevel(e.target.value)} placeholder="social" />
              </Field>
              <Field label="Tournament">
                <Select value={isTournament ? "yes" : "no"} onChange={(e) => setIsTournament(e.target.value === "yes")}>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </Select>
              </Field>
            </div>
            <Field label="Short description">
              <Input value={shortDesc} onChange={(e) => setShortDesc(e.target.value)} placeholder="One line for listings." />
            </Field>
            <Field label="Full description">
              <Input value={fullDesc} onChange={(e) => setFullDesc(e.target.value)} placeholder="What actually happens on the night." />
            </Field>
            <Field label="Objective">
              <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Operational goal for the crew." />
            </Field>
            <Field label="Promise" hint="The guarantee shown to participants.">
              <Input value={promise} onChange={(e) => setPromise(e.target.value)} placeholder="e.g. Minimum 4 games of play." />
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Age min"><Input type="number" value={ageMin} onChange={(e) => setAgeMin(e.target.value)} /></Field>
              <Field label="Age max"><Input type="number" value={ageMax} onChange={(e) => setAgeMax(e.target.value)} /></Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Min participants"><Input type="number" value={minP} onChange={(e) => setMinP(e.target.value)} /></Field>
              <Field label="Target"><Input type="number" value={targetP} onChange={(e) => setTargetP(e.target.value)} /></Field>
              <Field label="Max"><Input type="number" value={maxP} onChange={(e) => setMaxP(e.target.value)} /></Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Team size"><Input type="number" value={teamSize} onChange={(e) => setTeamSize(e.target.value)} /></Field>
              <Field label="Number of teams"><Input type="number" value={numTeams} onChange={(e) => setNumTeams(e.target.value)} /></Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Spectator allowance"><Input type="number" value={spectatorAllowance} onChange={(e) => setSpectatorAllowance(e.target.value)} /></Field>
              <Field label="Complimentary slots"><Input type="number" value={compSlots} onChange={(e) => setCompSlots(e.target.value)} /></Field>
              <Field label="Blocked slots"><Input type="number" value={blockedSlots} onChange={(e) => setBlockedSlots(e.target.value)} /></Field>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-xs text-ink-sec">
              <input type="checkbox" checked={verificationRequired} onChange={(e) => setVerificationRequired(e.target.checked)} className="accent-[#4c6fff]" />
              Verification required before reveal
            </label>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Duration (min)"><Input type="number" value={duration} onChange={(e) => setDuration(e.target.value)} /></Field>
              <Field label="Check-in window (min)"><Input type="number" value={checkInWindow} onChange={(e) => setCheckInWindow(e.target.value)} /></Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Booking opens (days before)"><Input type="number" value={bookingOpenDays} onChange={(e) => setBookingOpenDays(e.target.value)} /></Field>
              <Field label="Booking closes (hours before)"><Input type="number" value={bookingCloseHours} onChange={(e) => setBookingCloseHours(e.target.value)} /></Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Reveal (hours before)"><Input type="number" value={revealHoursBefore} onChange={(e) => setRevealHoursBefore(e.target.value)} /></Field>
              <Field label="Late arrival (min)"><Input type="number" value={lateArrivalMins} onChange={(e) => setLateArrivalMins(e.target.value)} /></Field>
              <Field label="Completion buffer (min)"><Input type="number" value={completionBufferMins} onChange={(e) => setCompletionBufferMins(e.target.value)} /></Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Recurrence suitability">
                <Select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}>
                  <option value="weekly">Weekly</option>
                  <option value="fortnightly">Fortnightly</option>
                  <option value="monthly">Monthly</option>
                  <option value="one-off">One-off</option>
                </Select>
              </Field>
              <Field label="Substitutes allowed"><Input type="number" value={substitutes} onChange={(e) => setSubstitutes(e.target.value)} /></Field>
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-xs text-ink-sec">
              <input type="checkbox" checked={waitlistDefault} onChange={(e) => setWaitlistDefault(e.target.checked)} className="accent-[#4c6fff]" />
              Waitlist on by default
            </label>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Base price (₹)"><Input type="number" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} /></Field>
              <Field label="Tax (₹)"><Input type="number" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} /></Field>
              <Field label="Platform fee (₹)"><Input type="number" value={platformFee} onChange={(e) => setPlatformFee(e.target.value)} /></Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Venue cost (₹)"><Input type="number" value={venueCost} onChange={(e) => setVenueCost(e.target.value)} /></Field>
              <Field label="Equipment cost (₹)"><Input type="number" value={equipmentCost} onChange={(e) => setEquipmentCost(e.target.value)} /></Field>
              <Field label="Staffing cost (₹)"><Input type="number" value={staffingCost} onChange={(e) => setStaffingCost(e.target.value)} /></Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Refund policy template">
                <Select value={refundPolicy} onChange={(e) => setRefundPolicy(e.target.value)}>
                  <option>Full refund 12h prior</option>
                  <option>Full refund 24h prior</option>
                  <option>No refund after booking close</option>
                </Select>
              </Field>
              <label className="mt-7 flex cursor-pointer items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-xs text-ink-sec">
                <input type="checkbox" checked={promoEligible} onChange={(e) => setPromoEligible(e.target.checked)} className="accent-[#4c6fff]" />
                Promo eligible
              </label>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Coordinators count"><Input type="number" value={coordinatorCount} onChange={(e) => setCoordinatorCount(e.target.value)} /></Field>
              <Field label="Safety level">
                <Select value={safetyLevel} onChange={(e) => setSafetyLevel(e.target.value as "low" | "medium" | "high")}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </Select>
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Cancellation threshold (participants)">
                <Input type="number" value={cancellationThreshold} onChange={(e) => setCancellationThreshold(e.target.value)} />
              </Field>
              <Field label="Venue requirement">
                <Select value={indoorOutdoorNeed} onChange={(e) => setIndoorOutdoorNeed(e.target.value as "indoor" | "outdoor" | "hybrid" | "any")}>
                  <option value="any">Any</option>
                  <option value="indoor">Indoor</option>
                  <option value="outdoor">Outdoor</option>
                  <option value="hybrid">Hybrid</option>
                </Select>
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Min venue capacity"><Input type="number" value={minAreaCapacity} onChange={(e) => setMinAreaCapacity(e.target.value)} /></Field>
              <div className="grid content-start gap-3 sm:grid-cols-1">
                {[
                  { label: "Referee required", value: refereeRequired, set: setRefereeRequired },
                  { label: "Safety contact required", value: safetyContactRequired, set: setSafetyContactRequired },
                  { label: "Weather dependent", value: weatherDependency, set: setWeatherDependency },
                ].map((t) => (
                  <label key={t.label} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-xs text-ink-sec">
                    <input type="checkbox" checked={t.value} onChange={(e) => t.set(e.target.checked)} className="accent-[#4c6fff]" />
                    {t.label}
                  </label>
                ))}
              </div>
            </div>
            <Field label="Equipment checklist" hint="Comma-separated.">
              <Input value={equipmentChecklist} onChange={(e) => setEquipmentChecklist(e.target.value)} placeholder="Paddles, Nets, Balls" />
            </Field>
            <Field label="Participant checklist" hint="Comma-separated.">
              <Input value={participantChecklist} onChange={(e) => setParticipantChecklist(e.target.value)} placeholder="Sports shoes, Water bottle" />
            </Field>
          </div>
        )}

        {step === 5 && (
          <div className="space-y-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Temp ID format">
                <Input value={tempIdFormat} onChange={(e) => setTempIdFormat(e.target.value)} />
              </Field>
              <Field label="Alias style">
                <Input value={aliasStyle} onChange={(e) => setAliasStyle(e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Team assignment">
                <Select value={teamAssignmentRule} onChange={(e) => setTeamAssignmentRule(e.target.value)}>
                  <option value="random">Random</option>
                  <option value="balanced">Balanced</option>
                  <option value="preformed">Pre-formed</option>
                </Select>
              </Field>
              <Field label="Reveal time (min before)">
                <Input type="number" value={revealTimeMinsBefore} onChange={(e) => setRevealTimeMinsBefore(e.target.value)} />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Anonymous joined count", value: anonymousJoined, set: setAnonymousJoined },
                { label: "Show joined count before reveal", value: showJoinedBeforeReveal, set: setShowJoinedBeforeReveal },
              ].map((t) => (
                <label key={t.label} className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/8 bg-white/3 px-3 py-2 text-xs text-ink-sec">
                  <input type="checkbox" checked={t.value} onChange={(e) => t.set(e.target.checked)} className="accent-[#4c6fff]" />
                  {t.label}
                </label>
              ))}
            </div>
            <Field label="Info revealed at reveal time" hint="Comma-separated.">
              <Input value={infoRevealed} onChange={(e) => setInfoRevealed(e.target.value)} />
            </Field>
            <Field label="Info never revealed" hint="Comma-separated.">
              <Input value={infoNeverRevealed} onChange={(e) => setInfoNeverRevealed(e.target.value)} />
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Pre-reveal preview">
                <Input value={preRevealPreview} onChange={(e) => setPreRevealPreview(e.target.value)} />
              </Field>
              <Field label="Post-reveal preview">
                <Input value={postRevealPreview} onChange={(e) => setPostRevealPreview(e.target.value)} />
              </Field>
            </div>

            <div>
              <p className="overline mb-2">Readiness gate — {categoryName(state, categoryId)}</p>
              <ReadinessPanel issues={readiness.issues} ready={readiness.ready} schedulable={readiness.schedulable} />
              <p className="mt-3 text-xs text-ink-mut">
                {readiness.ready
                  ? "No critical issues. You can activate immediately."
                  : "Critical issues block activation. Saving as draft is always allowed; warnings never block a draft."}
              </p>
            </div>
          </div>
        )}
      </WizardShell>
    </PageFrame>
  );
}
