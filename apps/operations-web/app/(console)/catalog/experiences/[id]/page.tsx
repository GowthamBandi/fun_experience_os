"use client";

import { Suspense, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { CalendarPlus, Copy, Eye, History, Pencil, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectExperienceReadiness, templateCompatibleVenues, templateEconomics } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { useCommandFeedback } from "@/components/ui/toast";
import { ConfirmDialog, Crumbs, DetailList, Figure, LinkButton, LinkRows, NotFoundCard, Notice, PageShell, Panel, StatusDialog } from "@/components/setup/kit";
import { EditDrawer, type FieldDef } from "@/components/setup/form";
import { ExperienceReadiness } from "@/components/catalog";
import { EXPERIENCE_STATUS, experienceFromValues, experienceSteps, experienceValues } from "@/components/catalog/schemas";

const yes = (b?: boolean) => (b ? "Yes" : "No");

/** Form keys that write to differently named (or extra) entity fields. */
const DERIVED: Record<string, string[]> = {
  anonymousJoinedCount: ["showJoinedCountBeforeReveal"],
  teamAssignmentMethod: ["teamAssignmentRule"],
  revealHoursBefore: ["revealTimeMinsBefore"],
  isTournament: ["prizeVerificationRequired"],
  indoorOutdoorNeed: ["venueCompat"],
  minAreaCapacity: ["venueCompat"],
  requireVerifiedVenue: ["venueCompat"],
};

function ExperienceDetail() {
  const { id } = useParams<{ id: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { state, canAccess, role, updateExperienceTemplate, changeTemplateStatus, duplicateExperienceTemplate } = useStore();
  const feedback = useCommandFeedback();
  const t = state.templates.find((x) => x.id === id);
  const readiness = useMemo(() => (t ? selectExperienceReadiness(t, state) : null), [t, state]);
  const eco = useMemo(() => templateEconomics(state, id), [state, id]);
  const compat = useMemo(() => templateCompatibleVenues(state, id), [state, id]);
  const steps = useMemo(() => experienceSteps(state), [state]);
  const [editStep, setEditStep] = useState<number | null>(search.get("edit") ? 0 : null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);

  if (!canAccess("/catalog")) return <PermissionDenied module="Catalog" />;
  if (!t || !readiness) return <PageShell><NotFoundCard what="experience" backHref="/catalog/experiences" backLabel="All experiences" /></PageShell>;

  const canManage = geoCan(role.id, "manage-catalog") && t.status !== "archived";
  const canStatus = geoCan(role.id, "change-catalog-status");
  const category = state.categories.find((c) => c.id === t.categoryId);
  const sessions = state.sessions.filter((s) => s.templateId === t.id);
  const upcoming = sessions.filter((s) => !["cancelled", "completed", "archived"].includes(s.status));
  const versions = state.templateVersions.filter((v) => v.templateId === t.id).length;
  const editable = (i: number) => (canManage ? <Button size="sm" variant="ghost" onClick={() => setEditStep(i)}><Pencil className="h-3.5 w-3.5" /> Edit</Button> : undefined);
  const stepFields: FieldDef[] = editStep === null ? [] : [...steps[editStep].fields.filter((f) => f.key !== "status" && f.key !== "name" && f.key !== "categoryId"), ...(editStep === 0 ? [{ key: "name", label: "Experience name", type: "text", required: true } as FieldDef] : []), { key: "__reason", label: "Reason for this change", type: "textarea", rows: 2, required: true, hint: "Recorded in the version history." }];

  return (
    <PageShell>
      <Crumbs items={[{ label: "Catalog", href: "/catalog" }, { label: "Experiences", href: "/catalog/experiences" }, { label: t.name }]} />
      <PageHeader
        overline={`Experience · ${category?.name ?? "No category"}`}
        title={t.name}
        sub={t.shortDesc}
        right={
          <>
            <StatusChip value={t.status} />
            <LinkButton href={`/catalog/experiences/${t.id}/preview`} variant="secondary"><Eye className="h-4 w-4" /> Preview</LinkButton>
            <LinkButton href={`/catalog/experiences/${t.id}/versions`} variant="secondary"><History className="h-4 w-4" /> History ({versions})</LinkButton>
            {geoCan(role.id, "manage-catalog") && <Button variant="secondary" onClick={() => setDupOpen(true)}><Copy className="h-4 w-4" /> Duplicate</Button>}
            {canStatus && t.status !== "archived" && <Button variant="secondary" onClick={() => setStatusOpen(true)}><RefreshCw className="h-4 w-4" /> Change status</Button>}
            {readiness.schedulable && <LinkButton href={`/missions/new?experienceId=${t.id}`}><CalendarPlus className="h-4 w-4" /> Schedule session</LinkButton>}
          </>
        }
      />

      {t.status === "archived" && <Notice tone="info" title="Archived">This experience is read-only. Duplicate it to make a new version.</Notice>}
      {t.status === "paused" && <Notice tone="warn" title="Paused">Existing sessions continue. No new sessions can be scheduled until it is active again.</Notice>}
      {t.status !== "active" && t.status !== "archived" && readiness.blockedCount === 0 && canStatus && (
        <Notice tone="ok" title="Ready to activate" action={<Button size="sm" onClick={() => setStatusOpen(true)}>Activate</Button>}>Every readiness check passes. Activate it to start scheduling sessions.</Notice>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Figure label="Price" value={inr(t.basePrice)} hint="per participant" />
        <Figure label="Group size" value={`${t.minParticipants}–${t.maxParticipants}`} hint={`ideal ${t.targetParticipants}`} />
        <Figure label="Duration" value={`${t.duration} min`} />
        <Figure label="Break-even" value={eco.breakEvenParticipants || "—"} hint="participants" tone={eco.netAtMin < 0 ? "warn" : undefined} />
        <Figure label="Margin at ideal size" value={`${eco.marginPct}%`} tone={eco.marginPct < 0 ? "danger" : undefined} />
        <Figure label="Upcoming sessions" value={upcoming.length} hint={`${sessions.length} all time`} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Panel title="Basics" right={editable(0)}>
              <DetailList rows={[{ label: "Category", value: category?.name ?? "" }, { label: "Promise", value: t.promise }, { label: "Description", value: t.fullDesc }]} />
            </Panel>
            <Panel title="Format" right={editable(1)}>
              <DetailList rows={[{ label: "Who can join", value: <span className="capitalize">{t.format}</span> }, { label: "Booking type", value: <span className="capitalize">{(t.entryType ?? "individual").replace("-", " ")}</span> }, { label: "Ages", value: `${t.ageMin}–${t.ageMax}` }, { label: "Level", value: <span className="capitalize">{t.competitiveLevel ?? ""}</span> }, { label: "ID check", value: yes(t.verificationRequired) }, { label: "Tournament", value: yes(t.isTournament) }]} />
            </Panel>
            <Panel title="Group size" right={editable(2)}>
              <DetailList rows={[{ label: "Minimum to run", value: t.minParticipants }, { label: "Ideal", value: t.targetParticipants }, { label: "Maximum", value: t.maxParticipants }, { label: "Teams", value: `${t.numTeams} × ${t.teamSize}` }, { label: "Complimentary places", value: t.compSlots }, { label: "Waitlist", value: yes(t.waitlistDefault ?? true) }]} />
            </Panel>
            <Panel title="Timing" right={editable(3)}>
              <DetailList rows={[{ label: "Duration", value: `${t.duration} min` }, { label: "Check-in opens", value: `${t.checkInWindow} min before` }, { label: "Booking opens", value: `${t.bookingOpenDays} days before` }, { label: "Booking closes", value: `${t.bookingCloseHours} h before` }, { label: "Late arrival", value: `${t.lateArrivalMins} min` }]} />
            </Panel>
            <Panel title="Price and costs" right={editable(4)}>
              <DetailList rows={[{ label: "Price", value: inr(t.basePrice) }, { label: "Platform fee", value: inr(t.platformFee) }, { label: "Session costs", value: inr(eco.fixedCosts) }, { label: "Revenue at minimum", value: inr(eco.revenueAtMin) }, { label: "Net at ideal size", value: inr(eco.netAtTarget) }, { label: "Refund policy", value: t.refundPolicyTemplate }]} />
            </Panel>
            <Panel title="Staffing" right={editable(5)}>
              <DetailList rows={[{ label: "Roles", value: t.requiredRoles.join(", ") }, { label: "Coordinators", value: t.coordinatorsCount }, { label: "Referee", value: yes(t.refereeRequired) }, { label: "Safety contact", value: yes(t.safetyContactRequired) }, { label: "Cancel below", value: `${t.cancellationThreshold} people` }]} />
            </Panel>
            <Panel title="Reveal and privacy" right={editable(7)}>
              <DetailList rows={[{ label: "Reveal", value: `${t.revealHoursBefore} h before start` }, { label: "Temporary IDs", value: <span className="font-mono text-xs">{t.tempIdFormat}</span> }, { label: "Aliases", value: t.aliasStyle }, { label: "Joined count", value: t.anonymousJoinedCount ? "Hidden until reveal" : "Visible" }, { label: "Never revealed", value: t.infoNeverRevealed.join(", ") }]} />
            </Panel>
            <Panel title="Checklists" right={editable(8)}>
              <DetailList rows={[{ label: "Equipment", value: t.equipmentChecklist.join(", ") }, { label: "Participants bring", value: t.participantChecklist.join(", ") }, { label: "Internal note", value: t.internalNote ?? "" }]} />
            </Panel>
          </div>
        </div>
        <div className="space-y-6">
          <ExperienceReadiness status={readiness.status} items={readiness.items} />
          <Panel title="Where it can run" sub={`${compat.filter((c) => c.compatible).length} of ${compat.length} venues`} right={editable(6)}>
            {compat.length === 0 ? (
              <p className="py-3 text-sm text-ink-mut">No venues exist yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {compat.map((c) => (
                  <li key={c.venueId} className="flex items-start justify-between gap-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-ink-lum">{c.venueName}</p>
                      {!c.compatible && <p className="text-xs text-ink-mut">{c.reasons.join(" · ")}</p>}
                    </div>
                    <StatusChip value={c.compatible ? "yes" : "no"} tone={c.compatible ? "ok" : "neutral"} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="Sessions">
            <LinkRows empty="Not scheduled yet." rows={sessions.slice(0, 8).map((s) => ({ href: `/missions/${s.id}`, title: `${s.date} ${s.startTime}`, meta: state.venues.find((v) => v.id === s.venueId)?.name, right: <StatusChip value={s.status} /> }))} />
          </Panel>
        </div>
      </div>

      <EditDrawer
        open={editStep !== null}
        onClose={() => setEditStep(null)}
        title={editStep === null ? "" : `Edit ${steps[editStep].label.toLowerCase()}`}
        sub="Every change is saved as a new version."
        fields={stepFields}
        initial={{ ...experienceValues(t), __reason: "" }}
        onSave={(v) => {
          const next = experienceFromValues({ ...experienceValues(t), ...v });
          const keys = stepFields.map((f) => f.key).filter((k) => k !== "__reason");
          const patch: Record<string, unknown> = {};
          const changed: string[] = [];
          const allowed = new Set(keys.flatMap((k) => [k, ...(DERIVED[k] ?? [])]));
          for (const [k, val] of Object.entries(next)) {
            if (!allowed.has(k)) continue;
            if (JSON.stringify(val) !== JSON.stringify((t as unknown as Record<string, unknown>)[k])) {
              patch[k] = val;
              changed.push(k);
            }
          }
          if (changed.length === 0) return { error: `Nothing changed in ${keys.length ? "these fields" : "this section"}.` };
          const out = updateExperienceTemplate(t.id, patch, String(v.__reason ?? ""), changed);
          feedback(out, "Experience updated", `Saved as a new version.`);
          return out;
        }}
      />
      <StatusDialog
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title={`Change status — ${t.name}`}
        current={t.status}
        options={EXPERIENCE_STATUS}
        onConfirm={(s, reason) => {
          const out = changeTemplateStatus(t.id, s, reason);
          feedback(out, `Experience set to ${s}`);
          return out;
        }}
      />
      <ConfirmDialog
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        title="Duplicate this experience"
        body={<>A draft copy of <strong>{t.name}</strong> is created with every setting. Sessions and history are not copied.</>}
        confirmLabel="Create copy"
        onConfirm={() => {
          const out = duplicateExperienceTemplate(t.id);
          if (feedback(out, "Experience duplicated", "The copy is a draft.") && out.id) router.push(`/catalog/experiences/${out.id}`);
          return out;
        }}
      />
    </PageShell>
  );
}

export default function ExperienceDetailPage() {
  return (
    <Suspense fallback={null}>
      <ExperienceDetail />
    </Suspense>
  );
}
