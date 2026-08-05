"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import {
  templateById,
  templateCompatibleVenues,
  templateEconomics,
  templateReadiness,
  templateVersions,
  sessionTitle,
  categoryById,
} from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { cn, inr } from "@/lib/format";
import { Breadcrumbs, KVGrid, PageFrame, PrototypeRoleNote, Row } from "@/components/geo/layout";
import { ConfirmAction } from "@/components/geo/ConfirmAction";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Badge, Button, StatusChip } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/fields";
import { Item, Stagger, Tide } from "@/components/motion/Motion";
import {
  Archive, ArrowLeft, Copy, Eye, History, Pause, Play, Rocket, StickyNote,
} from "lucide-react";
import { CompatList, EconomicsPanel, ReadinessPanel, StatCard } from "@/components/catalog/CatalogBits";

export default function TemplateDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const {
    state, role, canAccess, hydrated,
    changeTemplateStatus, duplicateExperienceTemplate, addCatalogNote,
  } = useStore();

  const [note, setNote] = useState("");

  const t = useMemo(() => templateById(state, id), [state, id]);
  const eco = useMemo(() => templateEconomics(state, id), [state, id]);
  const compat = useMemo(() => templateCompatibleVenues(state, id), [state, id]);
  const versions = useMemo(() => templateVersions(state, id), [state, id]);
  const sessions = useMemo(() => state.sessions.filter((s) => s.templateId === id), [state, id]);
  const read = useMemo(() => (t ? templateReadiness(state, t) : null), [state, t]);

  const canManage = geoCan(role.id, "manage-catalog");
  const canChangeStatus = geoCan(role.id, "change-template-status");
  const canActivate = geoCan(role.id, "activate-template");
  const canPricing = geoCan(role.id, "catalog-pricing");
  const canSafety = geoCan(role.id, "catalog-safety");
  const canPreview = geoCan(role.id, "catalog-preview");
  const canVersions = geoCan(role.id, "catalog-versions");
  const canAnnotate = geoCan(role.id, "annotate");

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/catalog")) return <PageFrame><PermissionDenied module="Catalog" /></PageFrame>;

  if (!t || !read) {
    return (
      <PageFrame>
        <div className="solid rounded-panel p-10 text-center">
          <p className="text-sm font-medium text-ink-lum">Template not found</p>
          <p className="mt-1 text-sm text-ink-mut">This experience doesn&apos;t exist.</p>
          <Button variant="secondary" className="mt-5" onClick={() => router.push("/catalog/experiences")}>
            <ArrowLeft className="h-4 w-4" /> Back to experiences
          </Button>
        </div>
      </PageFrame>
    );
  }

  const cat = categoryById(state, t.categoryId);
  const audits = state.audits.filter((a) => a.description.includes(t.name));
  const blockedReasons = read.issues.filter((i) => i.level === "error");
  const compatibleCount = compat.filter((r) => r.compatible).length;

  const headerActions = (() => {
    if (t.status === "draft" || t.status === "ready") {
      return canActivate && read.ready ? (
        <Button variant="primary" onClick={() => changeTemplateStatus(t.id, "active", "Ready — activated from detail")}>
          <Rocket className="h-4 w-4" /> Activate template
        </Button>
      ) : null;
    }
    if (t.status === "active") {
      return canChangeStatus ? (
        <ConfirmAction
          label="Pause template"
          title="Pause this template?"
          body={
            <>
              Pausing <span className="font-medium text-ink-lum">{t.name}</span> keeps it visible but blocks new session
              creation. Existing sessions are untouched.
            </>
          }
          confirmLabel="Pause template"
          tone="danger"
          variant="danger"
          icon={<Pause className="h-4 w-4" />}
          onConfirm={() => changeTemplateStatus(t.id, "paused", "Paused by operator")}
        />
      ) : null;
    }
    if (t.status === "paused") {
      return canActivate && read.ready ? (
        <Button variant="primary" onClick={() => changeTemplateStatus(t.id, "active", "Resumed from pause")}>
          <Play className="h-4 w-4" /> Resume template
        </Button>
      ) : null;
    }
    return null;
  })();

  return (
    <PageFrame>
      <Breadcrumbs
        items={[
          { label: "Catalog", href: "/catalog" },
          { label: "Experiences", href: "/catalog/experiences" },
          { label: t.name },
        ]}
      />

      <PageHeader
        overline="Catalog · Experience"
        title={t.name}
        sub={t.shortDesc}
        right={
          headerActions ??
          (canChangeStatus || canActivate ? <PrototypeRoleNote /> : null)
        }
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusChip value={t.status} />
        <Link href={`/catalog/categories/${t.categoryId}`}>
          <Badge className="border border-white/8 bg-white/4 text-ink-sec hover:bg-white/8">{cat?.name ?? t.categoryId}</Badge>
        </Link>
        <Badge className="border border-white/8 bg-white/4 text-ink-sec">{t.format}</Badge>
        <Badge className="border border-white/8 bg-white/4 text-ink-sec">{t.entryType ?? "individual"}</Badge>
        <Badge className="border border-white/8 bg-white/4 text-ink-sec">{t.competitiveLevel ?? "—"}</Badge>
        {t.isTournament && <Badge className="border border-[#4c6fff]/25 bg-[#4c6fff]/10 text-[#9db4ff]">tournament</Badge>}
        <div className="ml-auto flex items-center gap-2">
          {canPreview && (
            <Button variant="lamp" onClick={() => router.push(`/catalog/experiences/${t.id}/preview`)}>
              <Eye className="h-4 w-4" /> Customer preview
            </Button>
          )}
          {canVersions && (
            <Button variant="lamp" onClick={() => router.push(`/catalog/experiences/${t.id}/versions`)}>
              <History className="h-4 w-4" /> Versions
            </Button>
          )}
        </div>
      </div>

      {t.status !== "active" && (
        <div
          className={cn(
            "mt-3 rounded-lg border px-3 py-2 text-[11px]",
            t.status === "paused"
              ? "border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]"
              : "border-white/8 bg-white/3 text-ink-mut",
          )}
        >
          {t.status === "draft" && "Draft — cannot be scheduled until activated."}
          {t.status === "ready" && "Ready — validated, awaiting activation."}
          {t.status === "paused" && "Paused — stays visible, cannot create new sessions."}
          {t.status === "archived" && "Archived — historical and read-only."}
        </div>
      )}

      <Stagger className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Item><StatCard label="Price" value={inr(t.basePrice)} /></Item>
        <Item><StatCard label="Break-even" value={String(eco.breakEvenParticipants)} hint={`of ${t.maxParticipants} seats`} tone={eco.breakEvenParticipants <= t.minParticipants ? "ok" : "warm"} /></Item>
        <Item><StatCard label="Margin at target" value={`${eco.marginPct}%`} tone={eco.marginPct < 20 ? "danger" : eco.marginPct < 40 ? "warm" : "ok"} /></Item>
        <Item><StatCard label="Compatible venues" value={`${compatibleCount}/${compat.length}`} tone={compatibleCount === 0 ? "danger" : "ok"} /></Item>
      </Stagger>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <PanelHeader title="Readiness" sub="Live validation — errors block activation, warnings permit drafts" />
          <div className="mt-3">
            <ReadinessPanel
              issues={read.issues}
              ready={read.ready}
              schedulable={read.schedulable}
              scheduleNote={!read.schedulable ? "This template is not schedulable in its current state." : undefined}
            />
          </div>
        </Card>

        <Card>
          <PanelHeader title="Promise & format" sub="What participants are sold" />
          <div className="mt-4">
            <KVGrid>
              <Row label="Promise">{t.promise}</Row>
              <Row label="Objective">{t.objective}</Row>
              <Row label="Entry"><span className="capitalize">{t.entryType ?? "individual"}</span></Row>
              <Row label="Competitive"><span className="capitalize">{t.competitiveLevel ?? "—"}</span></Row>
              <Row label="Capacity">{t.minParticipants} / {t.targetParticipants} / {t.maxParticipants}</Row>
              <Row label="Teams">{t.teamSize} per team × {t.numTeams}</Row>
              <Row label="Age">{t.ageMin} – {t.ageMax}</Row>
              <Row label="Duration">{t.duration} min</Row>
            </KVGrid>
          </div>
        </Card>

        <Card>
          <PanelHeader title="Timing & booking" sub="Window order: open → close → reveal" />
          <div className="mt-4">
            <KVGrid>
              <Row label="Booking opens">{t.bookingOpenDays} days before</Row>
              <Row label="Booking closes">{t.bookingCloseHours} h before</Row>
              <Row label="Reveal">{t.revealHoursBefore} h before</Row>
              <Row label="Check-in window">{t.checkInWindow} min</Row>
              <Row label="Late arrival">{t.lateArrivalMins} min</Row>
              <Row label="Completion buffer">{t.completionBufferMins} min</Row>
              <Row label="Recurrence">{t.recurrenceSuitability ?? "—"}</Row>
              <Row label="Waitlist">{t.waitlistDefault ? "On by default" : "Off"}</Row>
            </KVGrid>
          </div>
        </Card>

        <Card>
          <PanelHeader title="Economics" sub={canPricing ? "Costs and margins — prototype figures" : undefined} />
          {canPricing ? (
            <div className="mt-3">
              <EconomicsPanel eco={eco} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-mut">Pricing and margins are outside your role lane.</p>
          )}
        </Card>

        <Card>
          <PanelHeader
            title="Venue compatibility"
            sub="Every venue evaluated against this template"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{compatibleCount} compatible</Badge>}
          />
          <div className="mt-3">
            <CompatList rows={compat} empty="No venues evaluated." />
          </div>
        </Card>

        {canSafety && (
          <Card>
            <PanelHeader title="Safety & policy" sub="Safety lane view" />
            <div className="mt-4">
              <KVGrid>
                <Row label="Safety level"><span className="capitalize">{t.safetyLevel ?? "—"}</span></Row>
                <Row label="Referee">{t.refereeRequired ? "Required" : "Not required"}</Row>
                <Row label="Safety contact">{t.safetyContactRequired ? "Required" : "Not required"}</Row>
                <Row label="Weather">{t.weatherDependency ? "Dependent" : "Independent"}</Row>
                <Row label="Equipment">{t.equipmentChecklist.join(", ") || "—"}</Row>
                <Row label="Participant checklist">{t.participantChecklist.join(", ") || "—"}</Row>
                <Row label="Behaviour rules">{t.behaviourRules?.join("; ") || "—"}</Row>
                <Row label="No-show">{t.noShowTreatment ?? "—"}</Row>
              </KVGrid>
            </div>
          </Card>
        )}

        {canManage && (
          <Card>
            <PanelHeader title="Tools" sub="Duplicate keeps every setting, reset to draft" />
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={() => duplicateExperienceTemplate(t.id)}>
                <Copy className="h-4 w-4" /> Duplicate template
              </Button>
              {t.status !== "archived" && (
                <ConfirmAction
                  label="Archive template"
                  title="Archive this template?"
                  body={
                    <>
                      Archiving <span className="font-medium text-ink-lum">{t.name}</span> makes it historical and
                      read-only.
                    </>
                  }
                  confirmLabel="Archive"
                  tone="danger"
                  variant="ghost"
                  icon={<Archive className="h-4 w-4" />}
                  onConfirm={() => changeTemplateStatus(t.id, "archived", "Archived by operator")}
                />
              )}
            </div>
            {blockedReasons.length > 0 && (
              <p className="mt-3 text-[11px] text-ink-mut">
                {blockedReasons.length} critical issue{blockedReasons.length > 1 ? "s" : ""} must clear before activation.
              </p>
            )}
          </Card>
        )}

        <Card>
          <PanelHeader
            title="Scheduled sessions"
            sub="Missions created from this template"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{sessions.length}</Badge>}
          />
          <div className="mt-3 space-y-1.5">
            {sessions.length === 0 && <p className="text-sm text-ink-mut">No sessions scheduled from this template yet.</p>}
            {sessions.slice(0, 8).map((s) => (
              <div key={s.id} className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-lum">{sessionTitle(state, s.id)}</p>
                  <p className="text-[11px] text-ink-mut">{s.date} · {s.startTime} · {s.territoryId}</p>
                </div>
                <StatusChip value={s.status} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Versions"
            sub="Change history of this template"
            right={
              canVersions ? (
                <Button variant="ghost" onClick={() => router.push(`/catalog/experiences/${t.id}/versions`)}>
                  <History className="h-4 w-4" /> See all
                </Button>
              ) : (
                <Badge className="border border-white/8 bg-white/4 text-ink-sec">{versions.length}</Badge>
              )
            }
          />
          <div className="mt-3 space-y-1.5">
            {versions.length === 0 && <p className="text-sm text-ink-mut">No version history recorded.</p>}
            {versions.slice(0, 5).map((v) => (
              <div key={v.id} className="solid rounded-xl px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink-lum">v{v.version}</p>
                  <p className="text-[11px] text-ink-mut">{v.timestamp}</p>
                </div>
                <p className="mt-0.5 text-xs text-ink-sec">{v.reason}</p>
                <p className="mt-0.5 text-[11px] text-ink-mut">{v.changedFields.join(", ")}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <PanelHeader title="Activity" sub="Audit trail mentions of this template" />
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

        {canAnnotate && (
          <Card className="lg:col-span-2">
            <PanelHeader title="Annotations" sub="Operational notes append to the audit trail" />
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-[260px] flex-1">
                <Field label="Add template note">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Context for the crew…" />
                </Field>
              </div>
              <Button
                variant="secondary"
                disabled={!note.trim()}
                onClick={() => {
                  addCatalogNote("template", t.name, note.trim());
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
