"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import {
  categoryById,
  categoryCompatibleVenues,
  categoryViews,
  templateById,
  templateReadiness,
  categoryName,
} from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { cn } from "@/lib/format";
import { Breadcrumbs, KVGrid, PageFrame, PrototypeRoleNote, Row } from "@/components/geo/layout";
import { ConfirmAction } from "@/components/geo/ConfirmAction";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Badge, Button, StatusChip } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/fields";
import { Item, Stagger, Tide } from "@/components/motion/Motion";
import { ArrowLeft, Copy, Layers, Pause, Play, StickyNote } from "lucide-react";
import { CompatList, StatCard } from "@/components/catalog/CatalogBits";

export default function CategoryDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const {
    state, role, canAccess, hydrated,
    changeCategoryStatus, duplicateCategory, addCatalogNote,
  } = useStore();

  const [note, setNote] = useState("");

  const cat = useMemo(() => categoryById(state, id), [state, id]);
  const view = useMemo(() => categoryViews(state).find((c) => c.id === id), [state, id]);
  const compat = useMemo(() => categoryCompatibleVenues(state, id), [state, id]);
  const templates = useMemo(
    () =>
      state.templates
        .filter((t) => t.categoryId === id)
        .map((t) => ({ t, read: templateReadiness(state, t) })),
    [state, id],
  );

  const canManage = geoCan(role.id, "manage-catalog");
  const canChangeStatus = geoCan(role.id, "change-category-status");
  const canAnnotate = geoCan(role.id, "annotate");
  const canSeeSafety = geoCan(role.id, "catalog-safety");

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/catalog")) return <PageFrame><PermissionDenied module="Catalog" /></PageFrame>;

  if (!cat || !view) {
    return (
      <PageFrame>
        <div className="solid rounded-panel p-10 text-center">
          <p className="text-sm font-medium text-ink-lum">Category not found</p>
          <p className="mt-1 text-sm text-ink-mut">This category doesn&apos;t exist.</p>
          <Button variant="secondary" className="mt-5" onClick={() => router.push("/catalog/categories")}>
            <ArrowLeft className="h-4 w-4" /> Back to categories
          </Button>
        </div>
      </PageFrame>
    );
  }

  const audits = state.audits.filter((a) => a.description.includes(cat.name));
  const blockedTemplates = templates.filter(({ read }) => !read.schedulable).length;

  return (
    <PageFrame>
      <Breadcrumbs items={[{ label: "Catalog", href: "/catalog" }, { label: "Categories", href: "/catalog/categories" }, { label: cat.name }]} />

      <PageHeader
        overline="Catalog · Category"
        title={cat.name}
        sub={cat.description}
        right={
          canChangeStatus ? (
            cat.status === "paused" ? (
              <Button variant="primary" onClick={() => changeCategoryStatus(cat.id, "active")}>
                <Play className="h-4 w-4" /> Resume category
              </Button>
            ) : cat.status === "active" ? (
              <ConfirmAction
                label="Pause category"
                title="Pause this category?"
                body={
                  <>
                    Pausing <span className="font-medium text-ink-lum">{cat.name}</span> freezes template activation under it.
                    Existing scheduled sessions keep running.
                  </>
                }
                confirmLabel="Pause category"
                tone="danger"
                variant="danger"
                icon={<Pause className="h-4 w-4" />}
                onConfirm={() => changeCategoryStatus(cat.id, "paused")}
              />
            ) : cat.status === "archived" ? (
              <Button variant="secondary" onClick={() => changeCategoryStatus(cat.id, "active")}>
                <Play className="h-4 w-4" /> Restore category
              </Button>
            ) : (
              <Button variant="primary" onClick={() => changeCategoryStatus(cat.id, "active")}>
                <Play className="h-4 w-4" /> Activate category
              </Button>
            )
          ) : (
            <PrototypeRoleNote />
          )
        }
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusChip value={cat.status ?? "active"} />
        <Badge className="border border-white/8 bg-white/4 text-ink-sec">{view.shortCode}</Badge>
        <Badge className="border border-white/8 bg-white/4 text-ink-sec">{cat.riskLevel} risk</Badge>
        {(cat.traits ?? []).map((t) => (
          <Badge key={t} className="border border-[#4c6fff]/25 bg-[#4c6fff]/10 text-[#9db4ff]">{t}</Badge>
        ))}
      </div>

      <Stagger className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Item><StatCard label="Templates" value={view.templates} hint={`${view.activeTemplates} active`} /></Item>
        <Item><StatCard label="Venue coverage" value={`${view.compatibleVenues}/${view.totalVenues}`} tone={view.compatibleVenues === 0 ? "danger" : "ok"} /></Item>
        <Item><StatCard label="Territories" value={view.territories} /></Item>
        <Item><StatCard label="Scheduled sessions" value={view.scheduledSessions} /></Item>
      </Stagger>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <PanelHeader title="Defaults" sub="The values templates inherit" />
          <div className="mt-4">
            <KVGrid>
              <Row label="Setting">{cat.isIndoor ? "Indoor" : "Outdoor"}</Row>
              <Row label="Risk level"><span className="capitalize">{cat.riskLevel}</span></Row>
              <Row label="Age range">{cat.defaultAgeMin} – {cat.defaultAgeMax}</Row>
              <Row label="Participants">{cat.defaultParticipantsMin} – {cat.defaultParticipantsMax}</Row>
              <Row label="Target">{cat.defaultTargetParticipants ?? "—"}</Row>
              <Row label="Team size">{cat.defaultTeamSize ?? "—"}</Row>
              <Row label="Duration">{cat.defaultDuration} min</Row>
              <Row label="Coordinator default">{cat.defaultCoordinatorRequired ? "Yes" : "No"}</Row>
              <Row label="Referee"><span className="capitalize">{cat.refereeRequirement ?? "none"}</span></Row>
              <Row label="Activity specialist">{cat.activitySpecialistRequired ? "Yes" : "No"}</Row>
              <Row label="Safety contact">{cat.safetyContactRequired ? "Required" : "Not required"}</Row>
              <Row label="Weather">{cat.weatherDependency ? "Dependent" : "Independent"}</Row>
            </KVGrid>
          </div>
        </Card>

        <Card>
          <PanelHeader title="Venue compatibility" sub="Capabilities a venue must satisfy" />
          <div className="mt-4">
            <KVGrid>
              <Row label="Requirement"><span className="capitalize">{cat.venueCompat?.indoorOutdoor ?? "any"}</span></Row>
              <Row label="Min safety capacity">{cat.venueCompat?.minAreaCapacity ?? "—"}</Row>
              <Row label="Lighting">{cat.venueCompat?.lightingRequired ? "Required" : "Optional"}</Row>
              <Row label="Washrooms">{cat.venueCompat?.washroomRequired ? "Required" : "Optional"}</Row>
              <Row label="Accessibility">{cat.venueCompat?.accessibilityRequired ? "Required" : "Optional"}</Row>
              <Row label="Equipment">{cat.venueCompat?.requiredEquipment?.length ? cat.venueCompat.requiredEquipment.join(", ") : "—"}</Row>
            </KVGrid>
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Compatible venues"
            sub="All venues evaluated against this category"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{compat.filter((r) => r.compatible).length} compatible</Badge>}
          />
          <div className="mt-3">
            <CompatList rows={compat} empty="No venues evaluated." />
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Templates in this category"
            sub="Readiness drives what can be scheduled"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{templates.length}</Badge>}
          />
          <div className="mt-3 space-y-1.5">
            {templates.length === 0 && <p className="text-sm text-ink-mut">No templates defined under this category yet.</p>}
            {templates.map(({ t, read }) => {
              const tpl = templateById(state, t.id);
              return (
                <Link
                  key={t.id}
                  href={`/catalog/experiences/${t.id}`}
                  className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/4"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink-lum">{tpl?.name ?? t.id}</p>
                    <p className="text-[11px] text-ink-mut">{t.format} · {t.basePrice ? `₹${t.basePrice}` : "—"}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span
                      className={cn("h-2 w-2 rounded-full", read.schedulable ? "bg-[#5fd7a3]" : read.ready ? "bg-[#9db4ff]" : "bg-[#ff8f86]")}
                    />
                    <StatusChip value={t.status} />
                  </div>
                </Link>
              );
            })}
          </div>
        </Card>

        {canSeeSafety && (
          <Card>
            <PanelHeader title="Safety lane" sub="Category posture" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="solid rounded-xl p-3">
                <p className="overline">Participant requirements</p>
                <p className="mt-1 text-sm text-ink-sec">{(cat.participantRequirements ?? []).join(", ") || "—"}</p>
              </div>
              <div className="solid rounded-xl p-3">
                <p className="overline">Accessibility notes</p>
                <p className="mt-1 text-sm text-ink-sec">{cat.accessibilityNotes || "—"}</p>
              </div>
            </div>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <PanelHeader title="Activity" sub="Recent changes to this category" />
          <div className="mt-3 space-y-1.5">
            {audits.length === 0 && <p className="text-sm text-ink-mut">No recorded activity.</p>}
            {audits.slice(0, 6).map((a) => (
              <div key={a.id} className="solid rounded-xl px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink-lum">{a.action}</p>
                  <p className="text-[11px] text-ink-mut">{a.timestamp}</p>
                </div>
                <p className="mt-0.5 text-xs text-ink-sec">{a.description}</p>
              </div>
            ))}
          </div>
        </Card>

        {canManage && (
          <Card>
            <PanelHeader title="Tools" sub="Duplicate keeps every default, reset to draft" />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => duplicateCategory(cat.id)}>
                <Copy className="h-4 w-4" /> Duplicate category
              </Button>
              {cat.status !== "archived" && (
                <ConfirmAction
                  label="Archive category"
                  title="Archive this category?"
                  body={
                    <>
                      Archiving <span className="font-medium text-ink-lum">{cat.name}</span> makes it historical and
                      read-only. Templates under it stop activating.
                    </>
                  }
                  confirmLabel="Archive"
                  tone="danger"
                  variant="ghost"
                  onConfirm={() => changeCategoryStatus(cat.id, "archived")}
                />
              )}
            </div>
            {blockedTemplates > 0 && (
              <p className="mt-3 text-[11px] text-ink-mut">
                {blockedTemplates} template{blockedTemplates > 1 ? "s" : ""} in this category cannot be scheduled right now.
              </p>
            )}
          </Card>
        )}

        {canAnnotate && (
          <Card>
            <PanelHeader title="Annotations" sub="Notes append to the audit trail" />
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-[240px] flex-1">
                <Field label="Add category note">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Context for the team…" />
                </Field>
              </div>
              <Button
                variant="secondary"
                disabled={!note.trim()}
                onClick={() => {
                  addCatalogNote("category", cat.name, note.trim());
                  setNote("");
                }}
              >
                <StickyNote className="h-4 w-4" /> Add note
              </Button>
            </div>
          </Card>
        )}
      </div>
    </PageFrame>
  );
}
