"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarPlus, Check, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectExperienceReadiness } from "@/lib/prototype/selectors/catalog";
import type { SessionInput } from "@/lib/prototype/services/create";
import type { ExperienceTemplate } from "@/lib/prototype/entities";
import { cn, inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { EmptyState, PermissionDenied } from "@/components/ui/panels";
import { Field, Input, Select } from "@/components/ui/fields";
import { useToast } from "@/components/ui/toast";

export default function ScheduleSessionPage() {
  return (
    <Suspense fallback={<div className="p-8 text-sm text-ink-mut">Loading…</div>}>
      <ScheduleForm />
    </Suspense>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
const localDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** "YYYY-MM-DDTHH:MM" local time, `minutes` before the start. */
function offset(date: string, time: string, minutes: number) {
  const d = new Date(`${date}T${time}:00`);
  d.setMinutes(d.getMinutes() - minutes);
  return `${localDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ScheduleForm() {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const { state, territory, canAccess, createSession } = useStore();

  const templates = useMemo(
    () => (state.templates ?? []).map((t) => ({ t, r: selectExperienceReadiness(t, state) })).sort((a, b) => Number(b.r.schedulable) - Number(a.r.schedulable)),
    [state],
  );
  const initial = params?.get("experienceId") || params?.get("templateId") || templates.find((x) => x.r.schedulable)?.t.id || "";
  const [templateId, setTemplateId] = useState(initial);
  const picked = templates.find((x) => x.t.id === templateId);
  const t: ExperienceTemplate | undefined = picked?.t;

  const tomorrow = new Date(Date.now() + 86_400_000);
  const [date, setDate] = useState(localDate(tomorrow));
  const [time, setTime] = useState("18:00");
  const venues = (state.venues ?? []).filter((v) => v.territoryId === territory.id && (!t || v.supportedActivities.includes(t.categoryId)));
  const [venueId, setVenueId] = useState("");
  const venue = venues.find((v) => v.id === venueId) ?? venues[0];
  const areas = (state.playingAreas ?? []).filter((p) => p.venueId === venue?.id && (!t || p.activityCompatibility.includes(t.categoryId)));
  const [areaId, setAreaId] = useState("");
  const area = areas.find((a) => a.id === areaId) ?? areas[0];
  const [price, setPrice] = useState("");
  const [capacity, setCapacity] = useState("");
  const crew = (state.crew ?? []).filter((c) => c.territoryId === territory.id);
  const [leadId, setLeadId] = useState("");
  const [safetyId, setSafetyId] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!canAccess("/missions")) return <PermissionDenied module="Sessions" />;

  const priceN = price === "" ? t?.basePrice ?? 0 : Number(price);
  const capN = capacity === "" ? t?.maxParticipants ?? 0 : Number(capacity);

  const problems: string[] = [];
  if (!t) problems.push("Choose an experience.");
  else if (!picked!.r.schedulable) problems.push("This experience is not ready to schedule.");
  if (date < localDate(new Date())) problems.push("The date is in the past.");
  if (!venue) problems.push(`No venue in ${territory.name} supports this experience.`);
  else if (venue.status !== "ready") problems.push(`${venue.name} is ${venue.status}.`);
  if (venue && !area) problems.push("The venue has no compatible playing area.");
  else if (area && area.status !== "active") problems.push(`${area.name} is ${area.status}.`);
  if (!Number.isFinite(priceN) || priceN < 0) problems.push("Price must be zero or more.");
  if (t && (!Number.isInteger(capN) || capN < t.minParticipants)) problems.push(`Capacity must be at least the minimum of ${t.minParticipants}.`);
  if (area && capN > area.maxCapacity) problems.push(`${area.name} holds at most ${area.maxCapacity}.`);
  if (leadId && leadId === safetyId) problems.push("Lead coordinator and safety contact must be different people.");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (problems.length || !t || !venue || !area) {
      setError(problems[0] ?? "Check the form.");
      return;
    }
    const id = `s-${Date.now().toString(36)}`;
    const input: SessionInput = {
      id,
      templateId: t.id,
      categoryId: t.categoryId,
      territoryId: territory.id,
      cityId: venue.cityId,
      venueId: venue.id,
      playingAreaId: area.id,
      status: "booking-open",
      date,
      startTime: time,
      duration: t.duration,
      timezone: "Asia/Kolkata",
      recurrence: "none",
      bookingOpensAt: new Date().toISOString(),
      bookingClosesAt: offset(date, time, (t.bookingCloseHours ?? 2) * 60),
      revealAt: offset(date, time, (t.revealHoursBefore ?? 1) * 60),
      checkInOpensAt: offset(date, time, t.checkInWindow ?? 30),
      minParticipants: t.minParticipants,
      targetParticipants: Math.min(t.targetParticipants, capN),
      maxParticipants: capN,
      compSlots: t.compSlots ?? 0,
      blockedSlots: t.blockedSlots ?? 0,
      waitlistEnabled: true,
      waitlistOfferExpiryMins: 15,
      basePrice: priceN,
      discountAmount: 0,
      promoEligible: true,
      finalPrice: priceN,
      leadCoordinatorId: leadId,
      supportingCoordinatorId: "",
      refereeId: "",
      safetyContactId: safetyId,
      equipmentHandlerId: "",
      equipmentChecklist: t.equipmentChecklist ?? [],
      weatherRisk: "low",
      cancellationThreshold: t.minParticipants,
    };
    createSession(input);
    toast.success("Session scheduled", `${t.name} · ${date} at ${time}. Bookings are open.`);
    router.push(`/missions/${id}/overview`);
  };

  return (
    <div className="mx-auto w-full max-w-[1100px] space-y-6 px-5 py-7 lg:px-8">
      <Link href="/missions" className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-mut hover:text-ink-lum">
        <ArrowLeft className="h-4 w-4" /> Sessions
      </Link>
      <PageHeader overline={`Sessions · ${territory.name}`} title="Schedule a session" sub="Pick a ready experience, set the time and place, and open bookings." />

      {templates.length === 0 ? (
        <EmptyState title="No experiences yet" line="Create an experience in the catalog before scheduling sessions." action={<Link href="/catalog"><Button variant="secondary">Open catalog</Button></Link>} />
      ) : (
        <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[1.4fr_1fr]" noValidate>
          <div className="space-y-6">
            <section className="rounded-panel border border-edge bg-white p-6 shadow-panel">
              <h2 className="text-[15px] font-semibold text-ink-lum">1. Experience</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Experience">
                {templates.map(({ t: x, r }) => (
                  <label
                    key={x.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors",
                      x.id === templateId ? "border-brand bg-brand-subtle" : "border-edge hover:bg-slate-50",
                      !r.schedulable && "opacity-70",
                    )}
                  >
                    <input type="radio" name="experience" className="mt-1 accent-[var(--brand)]" checked={x.id === templateId} onChange={() => { setTemplateId(x.id); setVenueId(""); setAreaId(""); setPrice(""); setCapacity(""); setError(null); }} />
                    <span className="min-w-0">
                      <span className="block font-medium text-ink-lum">{x.name}</span>
                      <span className="block text-xs text-ink-mut">
                        {inr(x.basePrice)} · {x.duration} min · {x.minParticipants}–{x.maxParticipants} players
                      </span>
                      <span className={cn("mt-1 inline-flex items-center gap-1 text-xs font-semibold", r.schedulable ? "text-emerald-700" : "text-amber-700")}>
                        {r.schedulable ? <Check className="h-3 w-3" /> : <TriangleAlert className="h-3 w-3" />}
                        {r.schedulable ? "Ready" : r.blockedCount ? `${r.blockedCount} blocker(s)` : "Not active"}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {picked && !picked.r.schedulable && (
                <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                  Fix this experience in the catalog before scheduling it.{" "}
                  <Link href={picked.r.nextActionHref ?? `/catalog/experiences/${picked.t.id}`} className="font-semibold underline">
                    {picked.r.nextActionLabel ?? "Open experience"}
                  </Link>
                </p>
              )}
            </section>

            <section className="space-y-4 rounded-panel border border-edge bg-white p-6 shadow-panel">
              <h2 className="text-[15px] font-semibold text-ink-lum">2. Time and place</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Date">
                  <Input type="date" min={localDate(new Date())} value={date} onChange={(e) => setDate(e.target.value)} />
                </Field>
                <Field label="Start time">
                  <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </Field>
                <Field label="Venue">
                  <Select value={venue?.id ?? ""} onChange={(e) => { setVenueId(e.target.value); setAreaId(""); }}>
                    {venues.length === 0 && <option value="">No compatible venue</option>}
                    {venues.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                        {v.status !== "ready" ? ` (${v.status})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Playing area">
                  <Select value={area?.id ?? ""} onChange={(e) => setAreaId(e.target.value)}>
                    {areas.length === 0 && <option value="">No compatible area</option>}
                    {areas.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · up to {a.maxCapacity}
                        {a.status !== "active" ? ` (${a.status})` : ""}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </section>

            <section className="space-y-4 rounded-panel border border-edge bg-white p-6 shadow-panel">
              <h2 className="text-[15px] font-semibold text-ink-lum">3. Price, places and staff</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Price per player (₹)" hint={t ? `Experience default ${inr(t.basePrice)}` : undefined}>
                  <Input type="number" min={0} value={price} placeholder={t ? String(t.basePrice) : ""} onChange={(e) => setPrice(e.target.value)} />
                </Field>
                <Field label="Capacity" hint={t ? `Default ${t.maxParticipants}, minimum ${t.minParticipants}` : undefined}>
                  <Input type="number" min={1} value={capacity} placeholder={t ? String(t.maxParticipants) : ""} onChange={(e) => setCapacity(e.target.value)} />
                </Field>
                <Field label="Lead coordinator" hint="Can be assigned later in Staffing.">
                  <Select value={leadId} onChange={(e) => setLeadId(e.target.value)}>
                    <option value="">Assign later</option>
                    {crew.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.role.replace(/-/g, " ")}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Safety contact" hint="Required before the reveal.">
                  <Select value={safetyId} onChange={(e) => setSafetyId(e.target.value)}>
                    <option value="">Assign later</option>
                    {crew.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} · {c.role.replace(/-/g, " ")}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            </section>
          </div>

          <aside className="space-y-4 rounded-panel border border-edge bg-white p-6 shadow-panel lg:sticky lg:top-6 lg:self-start">
            <p className="eyebrow">Summary</p>
            <p className="font-display text-xl font-bold text-ink-lum">{t?.name ?? "Choose an experience"}</p>
            <dl className="space-y-2 text-sm">
              <Row k="When" v={`${date} at ${time}`} />
              <Row k="Where" v={venue ? `${venue.name}${area ? ` · ${area.name}` : ""}` : "—"} />
              <Row k="Price" v={inr(Number.isFinite(priceN) ? priceN : 0)} />
              <Row k="Places" v={String(capN || "—")} />
              {t && <Row k="Reveal" v={offset(date, time, (t.revealHoursBefore ?? 1) * 60).replace("T", " ")} />}
              {t && <Row k="Bookings close" v={offset(date, time, (t.bookingCloseHours ?? 2) * 60).replace("T", " ")} />}
            </dl>
            {problems.length > 0 && (
              <ul className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            {error && problems.length === 0 && <p role="alert" className="text-sm text-red-700">{error}</p>}
            <Button type="submit" className="w-full" disabled={problems.length > 0}>
              <CalendarPlus className="h-4 w-4" /> Schedule and open bookings
            </Button>
          </aside>
        </form>
      )}
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-mut">{k}</dt>
      <dd className="text-right font-medium text-ink-lum">{v}</dd>
    </div>
  );
}
