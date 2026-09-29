"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Building2, Copy, Pencil, Plus, RefreshCw, Sparkles } from "lucide-react";
import { useStore } from "@/lib/store";
import { categoryByIdView, categoryCompatibleVenues } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { useCommandFeedback } from "@/components/ui/toast";
import { ConfirmDialog, Crumbs, DetailList, Figure, LinkButton, LinkRows, NotFoundCard, Notice, PageShell, Panel, StatusDialog } from "@/components/setup/kit";
import { EditDrawer } from "@/components/setup/form";
import { RecordActivity } from "@/components/setup/shared";
import { CATEGORY_STATUS, categoryFromValues, categorySteps, categoryValues } from "@/components/catalog/schemas";

export default function CategoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { state, canAccess, role, updateActivityCategory, changeCategoryStatus, duplicateCategory } = useStore();
  const feedback = useCommandFeedback();
  const category = state.categories.find((c) => c.id === id);
  const view = useMemo(() => categoryByIdView(state, id), [state, id]);
  const compat = useMemo(() => categoryCompatibleVenues(state, id), [state, id]);
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);

  if (!canAccess("/catalog")) return <PermissionDenied module="Catalog" />;
  if (!category || !view) return <PageShell><NotFoundCard what="category" backHref="/catalog/categories" backLabel="All categories" /></PageShell>;

  const canManage = geoCan(role.id, "manage-catalog");
  const canStatus = geoCan(role.id, "change-catalog-status");
  const archived = view.status === "archived";
  const experiences = state.templates.filter((t) => t.categoryId === id);
  const fields = categorySteps().flatMap((s) => s.fields).filter((f) => f.key !== "status");

  return (
    <PageShell>
      <Crumbs items={[{ label: "Catalog", href: "/catalog" }, { label: "Categories", href: "/catalog/categories" }, { label: category.name }]} />
      <PageHeader
        overline={`Activity category · ${view.shortCode}`}
        title={category.name}
        sub={category.description}
        right={
          <>
            <StatusChip value={view.status} />
            {canManage && !archived && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
            {canManage && <Button variant="secondary" onClick={() => setDupOpen(true)}><Copy className="h-4 w-4" /> Duplicate</Button>}
            {canStatus && <Button variant="secondary" onClick={() => setStatusOpen(true)}><RefreshCw className="h-4 w-4" /> Change status</Button>}
            {canManage && view.status === "active" && <LinkButton href={`/catalog/experiences/new?categoryId=${id}`}><Plus className="h-4 w-4" /> New experience</LinkButton>}
          </>
        }
      />

      {view.status === "paused" && <Notice tone="warn" title="Paused">Its active experiences cannot be scheduled until the category is active again.</Notice>}
      {view.status === "draft" && <Notice tone="info" title="Draft">Activate the category before activating experiences in it.</Notice>}
      {archived && <Notice tone="info" title="Archived">This category is read-only. Restore it to draft to edit it, or duplicate it.</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="Experiences" value={view.templates} hint={`${view.activeTemplates} active · ${view.draftTemplates} draft`} />
        <Figure label="Compatible venues" value={`${view.compatibleVenues}/${view.totalVenues}`} tone={view.totalVenues && !view.compatibleVenues ? "warn" : undefined} />
        <Figure label="Sessions" value={view.scheduledSessions} hint="all time" />
        <Figure label="Risk" value={<span className="capitalize">{category.riskLevel}</span>} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Experiences" sub="Built on this category" icon={<Sparkles className="h-4 w-4" />}>
          <LinkRows
            empty="No experiences in this category yet."
            rows={experiences.map((t) => ({ href: `/catalog/experiences/${t.id}`, title: t.name, meta: `${inr(t.basePrice)} · ${t.minParticipants}–${t.maxParticipants} people · ${t.duration} min`, right: <StatusChip value={t.status} /> }))}
          />
        </Panel>
        <Panel title="Defaults">
          <DetailList
            rows={[
              { label: "Group size", value: `${category.defaultParticipantsMin}–${category.defaultParticipantsMax} (target ${category.defaultTargetParticipants ?? "—"})` },
              { label: "Team size", value: category.defaultTeamSize ?? "" },
              { label: "Duration", value: `${category.defaultDuration} min` },
              { label: "Ages", value: `${category.defaultAgeMin}–${category.defaultAgeMax}` },
              { label: "Setting", value: category.isIndoor ? "Indoor" : "Outdoor" },
              { label: "Referee", value: <span className="capitalize">{category.refereeRequirement ?? "none"}</span> },
              { label: "Safety contact required", value: category.safetyContactRequired ? "Yes" : "No" },
              { label: "Equipment", value: category.equipmentRequirements.join(", ") },
              { label: "Participants bring", value: (category.participantRequirements ?? []).join(", ") },
              { label: "Accessibility", value: category.accessibilityNotes ?? "" },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Venue compatibility" sub="Venues that meet this category's requirements" icon={<Building2 className="h-4 w-4" />}>
        {compat.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-mut">No venues exist yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {compat.map((r) => (
              <li key={r.venueId} className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-ink-lum">{r.venueName}</p>
                  {!r.compatible && <p className="text-xs text-ink-mut">{r.reasons.join(" · ")}</p>}
                </div>
                <StatusChip value={r.compatible ? "compatible" : "not compatible"} tone={r.compatible ? "ok" : "neutral"} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Recent changes" sub="From the audit log">
        <RecordActivity state={state} match={[`"${category.name}"`]} />
      </Panel>

      <EditDrawer
        open={editing}
        onClose={() => setEditing(false)}
        title={`Edit ${category.name}`}
        fields={fields}
        initial={categoryValues(category)}
        onSave={(v) => {
          const { status: _s, ...patch } = categoryFromValues(v);
          void _s;
          const out = updateActivityCategory(id, { ...patch, icon: category.icon, visualTreatment: category.visualTreatment, traits: category.traits });
          feedback(out, "Category updated");
          return out;
        }}
      />
      <StatusDialog
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title={`Change status — ${category.name}`}
        current={view.status}
        options={archived ? CATEGORY_STATUS.map((o) => (o.value === "draft" ? { ...o, label: "Restore to draft", needsReason: true, consequence: "Brings the category back for editing. It stays hidden from scheduling until activated." } : o)).filter((o) => o.value === "draft") : CATEGORY_STATUS}
        onConfirm={(s, reason) => {
          const out = changeCategoryStatus(id, s, reason);
          feedback(out, `Category set to ${s}`);
          return out;
        }}
      />
      <ConfirmDialog
        open={dupOpen}
        onClose={() => setDupOpen(false)}
        title="Duplicate this category"
        body={<>A draft copy of <strong>{category.name}</strong> is created with the same defaults. Experiences are not copied.</>}
        confirmLabel="Create copy"
        onConfirm={() => {
          const out = duplicateCategory(id);
          if (feedback(out, "Category duplicated", "The copy is a draft.") && out.id) router.push(`/catalog/categories/${out.id}`);
          return out;
        }}
      />
    </PageShell>
  );
}
