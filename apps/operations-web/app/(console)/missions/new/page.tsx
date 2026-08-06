"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { CatalogBackNavigation } from "@/components/catalog";
import { ExperienceStatusBadge, ExperienceReadiness } from "@/components/catalog";
import { selectExperienceReadiness } from "@/lib/prototype/selectors/catalog";
import { Button } from "@/components/ui/primitives";
import { CheckCircle2, Calendar, Plus, ArrowRight, AlertTriangle } from "lucide-react";
import type { SessionInput } from "@/lib/prototype/services/create";

function ScheduleEventForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, territory, createSession } = useStore();

  const templates = state.templates ?? [];
  const categories = state.categories ?? [];
  const venues = state.venues ?? [];
  const playingAreas = state.playingAreas ?? [];

  // Support both experienceId and templateId query params
  const paramId = searchParams?.get("experienceId") || searchParams?.get("templateId") || "";
  const initialId = paramId || templates[0]?.id || "";

  const [selectedTemplateId, setSelectedTemplateId] = useState(initialId);
  const [step, setStep] = useState(1);
  const [createdSessionId, setCreatedSessionId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    date: new Date(Date.now() + 86400000).toISOString().split("T")[0],
    startTime: "18:00",
    venueId: venues[0]?.id || "v1",
    playingAreaId: playingAreas[0]?.id || "pa1",
    priceOverride: 0,
    maxCapacityOverride: 0,
    status: "booking-open" as const,
  });

  useEffect(() => {
    if (paramId) {
      setSelectedTemplateId(paramId);
    }
  }, [paramId]);

  const template = templates.find((t) => t.id === selectedTemplateId);
  const category = categories.find((c) => c.id === template?.categoryId);
  const readiness = template ? selectExperienceReadiness(template, state) : null;

  useEffect(() => {
    if (template) {
      setFormData((prev) => ({
        ...prev,
        priceOverride: template.basePrice,
        maxCapacityOverride: template.maxParticipants,
      }));
    }
  }, [template]);

  const isBlocked = readiness ? readiness.status === "blocked" : false;

  const handleSchedule = () => {
    if (!template || isBlocked) return;

    const newId = `s-${Date.now()}`;
    const venue = venues.find((v) => v.id === formData.venueId) || venues[0];

    const input: SessionInput = {
      id: newId,
      templateId: template.id,
      categoryId: template.categoryId,
      territoryId: territory.id,
      cityId: venue?.cityId || "c1",
      venueId: venue?.id || "v1",
      playingAreaId: formData.playingAreaId || "pa1",
      status: formData.status as any,
      date: formData.date,
      startTime: formData.startTime,
      duration: template.duration,
      timezone: "Asia/Kolkata",
      recurrence: "none",
      bookingOpensAt: new Date().toISOString(),
      bookingClosesAt: `${formData.date}T16:00:00Z`,
      revealAt: `${formData.date}T16:00:00Z`,
      checkInOpensAt: `${formData.date}T17:30:00Z`,
      minParticipants: template.minParticipants,
      targetParticipants: template.targetParticipants,
      maxParticipants: formData.maxCapacityOverride || template.maxParticipants,
      compSlots: 2,
      blockedSlots: 0,
      waitlistEnabled: true,
      waitlistOfferExpiryMins: 10,
      basePrice: formData.priceOverride || template.basePrice,
      discountAmount: 0,
      promoEligible: true,
      finalPrice: formData.priceOverride || template.basePrice,
      leadCoordinatorId: "op-1",
      supportingCoordinatorId: "op-2",
      refereeId: template.refereeRequired ? "op-3" : "",
      safetyContactId: "op-4",
      equipmentHandlerId: "op-1",
      equipmentChecklist: ["Rackets", "Nets"],
      weatherRisk: "low",
      cancellationThreshold: 4,
    };

    createSession(input);
    setCreatedSessionId(newId);
    setStep(3);
  };

  if (step === 3) {
    return (
      <div className="glass p-8 rounded-2xl border border-emerald-800/40 bg-emerald-950/20 text-center space-y-6 max-w-xl mx-auto my-8">
        <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
          <CheckCircle2 className="w-10 h-10" />
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-ink-lum">Event Scheduled</h2>
          <p className="text-xs text-ink-sec max-w-md mx-auto">
            You have successfully scheduled &quot;{template?.name}&quot; for {formData.date} at {formData.startTime}.
          </p>
        </div>

        <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-left text-xs space-y-1">
          <p className="text-ink-mut">Session ID: <strong className="text-ink-lum">{createdSessionId}</strong></p>
          <p className="text-ink-mut">Experience: <span className="text-purple-300 font-bold">{template?.name}</span></p>
          <p className="text-ink-mut">Date & Time: <span className="text-ink-sec">{formData.date} @ {formData.startTime}</span></p>
          <p className="text-ink-mut">Venue: <span className="text-ink-sec">{venues.find((v) => v.id === formData.venueId)?.name || "Venue"}</span></p>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Button
            variant="primary"
            className="w-full sm:w-auto font-bold px-6"
            onClick={() => router.push(`/missions/${createdSessionId}/overview`)}
          >
            Go to Event Overview
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
          <Button
            variant="secondary"
            className="w-full sm:w-auto text-xs"
            onClick={() => router.push("/missions")}
          >
            View All Missions
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Select Experience Section */}
      <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
        <h3 className="text-sm font-bold text-ink-lum">1. Choose Experience Plan</h3>

        {templates.length === 0 ? (
          <div className="p-6 text-center text-xs text-ink-mut space-y-3">
            <p>No experiences are ready to schedule.</p>
            <Button variant="primary" className="font-bold text-xs" onClick={() => router.push("/catalog/experiences/new")}>
              Create Experience
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {templates.map((t) => {
              const read = selectExperienceReadiness(t, state);
              const selected = t.id === selectedTemplateId;

              return (
                <div
                  key={t.id}
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={`p-3 rounded-xl border text-xs cursor-pointer transition-all ${
                    selected
                      ? "bg-purple-950/40 border-brand text-ink-lum ring-1 ring-brand"
                      : "bg-black/30 border-white/5 text-ink-sec hover:border-white/10"
                  }`}
                >
                  <div className="font-bold text-ink-lum truncate">{t.name}</div>
                  <div className="text-[11px] text-ink-mut mt-0.5 font-mono">₹{t.basePrice} · {t.duration}m</div>
                  <div className="mt-2">
                    <ExperienceStatusBadge status={read.status} size="sm" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Selected Experience Readiness Warning / Blocker */}
        {template && readiness && (
          <div className="pt-2">
            {isBlocked ? (
              <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800/40 text-rose-200 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-rose-300">
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span>This experience is not ready to schedule yet.</span>
                </div>
                <p>Fix the following blockers in catalog before scheduling an event:</p>
                <ul className="list-disc pl-5 space-y-1">
                  {readiness.items.filter((i) => i.status === "blocked").map((b) => (
                    <li key={b.id}>{b.missingText || b.label}</li>
                  ))}
                </ul>
                <div className="pt-1">
                  <Button variant="secondary" className="h-7 text-xs px-2.5 font-bold" onClick={() => router.push(`/catalog/experiences/${template.id}`)}>
                    Review Experience Readiness
                  </Button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-800/40 text-emerald-200 text-xs flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Selected Experience &quot;{template.name}&quot; is ready to schedule.</span>
                </div>
                <span className="font-mono font-bold text-emerald-400">Default: ₹{template.basePrice} · {template.targetParticipants} pax</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Event Details Section */}
      {template && !isBlocked && (
        <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 className="text-sm font-bold text-ink-lum">2. Schedule Event Time & Location</h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Event Date</label>
              <input
                type="date"
                value={formData.date}
                onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Start Time</label>
              <input
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Venue Location</label>
              <select
                value={formData.venueId}
                onChange={(e) => setFormData({ ...formData, venueId: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              >
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} ({v.type})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Playing Area / Space</label>
              <select
                value={formData.playingAreaId}
                onChange={(e) => setFormData({ ...formData, playingAreaId: e.target.value })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum"
              >
                {playingAreas.map((pa) => (
                  <option key={pa.id} value={pa.id}>
                    {pa.name} (Max {pa.maxCapacity} pax)
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-white/5 pt-4">
            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Event Price Override (₹)</label>
              <input
                type="number"
                value={formData.priceOverride}
                onChange={(e) => setFormData({ ...formData, priceOverride: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum font-bold text-emerald-400"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-ink-sec">Event Max Capacity Override</label>
              <input
                type="number"
                value={formData.maxCapacityOverride}
                onChange={(e) => setFormData({ ...formData, maxCapacityOverride: Number(e.target.value) })}
                className="w-full h-10 px-3 rounded-xl bg-black/40 border border-white/10 text-xs text-ink-lum font-bold"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-white/5">
            <Button
              variant="primary"
              onClick={handleSchedule}
              className="font-bold text-xs bg-emerald-500 text-slate-950 px-6"
            >
              <Calendar className="w-4 h-4 mr-1.5" />
              Schedule Event Now
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ScheduleEventPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <CatalogBackNavigation label="Back to Catalog" href="/catalog" />
      <PageHeader
        overline="Missions · Scheduling"
        title="Schedule Event"
        sub="Select a ready experience plan, assign a venue location and start booking."
      />
      <Suspense fallback={<div className="text-xs text-ink-mut p-8">Loading schedule form...</div>}>
        <ScheduleEventForm />
      </Suspense>
    </div>
  );
}
