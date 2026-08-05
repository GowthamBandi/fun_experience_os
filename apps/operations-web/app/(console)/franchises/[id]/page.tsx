"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { franchiseDetail } from "@/lib/prototype/repositories";
import { OPERATORS, operatorName } from "@/lib/data/mock";
import { geoCan } from "@/lib/geo/access";
import { cn, inr, pct } from "@/lib/format";
import { Breadcrumbs, KVGrid, PageFrame, Proto, PrototypeRoleNote, Row } from "@/components/geo/layout";
import { ConfirmAction } from "@/components/geo/ConfirmAction";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied, Stat } from "@/components/ui/panels";
import { Badge, Button, StatusChip } from "@/components/ui/primitives";
import { Field, Input, Select } from "@/components/ui/fields";
import { Item, Stagger, Tide } from "@/components/motion/Motion";
import { AlertTriangle, ArrowLeft, Pause, Play, StickyNote } from "lucide-react";

export default function FranchiseDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { state, role, canAccess, hydrated, changeFranchiseStatus, changeFranchiseHead, addOperationalNote } = useStore();

  const detail = useMemo(() => franchiseDetail(state, id), [state, id]);

  const [head, setHead] = useState("");
  const [note, setNote] = useState("");

  const canManage = geoCan(role.id, "manage-franchise");
  const canSeeCommercial = geoCan(role.id, "see-commercial");
  const canSeeSafety = geoCan(role.id, "see-safety");
  const canAnnotate = geoCan(role.id, "annotate");

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/franchises")) return <PageFrame><PermissionDenied module="Franchises" /></PageFrame>;

  if (!detail) {
    return (
      <PageFrame>
        <div className="solid rounded-panel p-10 text-center">
          <p className="text-sm font-medium text-ink-lum">Franchise not found</p>
          <p className="mt-1 text-sm text-ink-mut">This franchise doesn&apos;t exist or was removed.</p>
          <Button variant="secondary" className="mt-5" onClick={() => router.push("/franchises")}>
            <ArrowLeft className="h-4 w-4" />
            Back to franchises
          </Button>
        </div>
      </PageFrame>
    );
  }

  const m = detail.metrics;
  const upcoming = detail.sessions.filter(
    (s) => (s.date === "Today" || s.date === "Tomorrow") && !["cancelled", "completed", "archived"].includes(s.status),
  );
  const audits = state.audits.filter((a) => a.description.includes(detail.name));

  return (
    <PageFrame>
      <Breadcrumbs items={[{ label: "Franchises", href: "/franchises" }, { label: detail.name }]} />

      <PageHeader
        overline="Franchise Operations · Part P2B"
        title={detail.name}
        sub={detail.legalEntity}
        right={
          canManage ? (
            detail.status === "active" ? (
              <ConfirmAction
                label="Pause franchise"
                title="Pause this franchise?"
                body={
                  <>
                    Pausing <span className="font-medium text-ink-lum">{detail.name}</span> freezes every active territory
                    under it. None are deleted.
                  </>
                }
                confirmLabel="Pause franchise"
                tone="danger"
                variant="danger"
                icon={<Pause className="h-4 w-4" />}
                onConfirm={() => changeFranchiseStatus(detail.id, "inactive")}
              />
            ) : (
              <ConfirmAction
                label="Resume franchise"
                title="Resume this franchise?"
                body={
                  <>
                    Resuming <span className="font-medium text-ink-lum">{detail.name}</span> restores its paused territories
                    to active.
                  </>
                }
                confirmLabel="Resume franchise"
                tone="primary"
                variant="primary"
                icon={<Play className="h-4 w-4" />}
                onConfirm={() => changeFranchiseStatus(detail.id, "active")}
              />
            )
          ) : (
            <PrototypeRoleNote />
          )
        }
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusChip value={detail.status} />
        <Badge
          className={
            detail.type === "master"
              ? "border border-[#4c6fff]/25 bg-[#4c6fff]/12 text-[#9db4ff]"
              : "border border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]"
          }
        >
          {detail.type}
        </Badge>
        <Badge
          className={
            detail.isInternal
              ? "border border-[#12b76a]/25 bg-[#12b76a]/12 text-[#5fd7a3]"
              : "border border-white/8 bg-white/4 text-ink-mut"
          }
        >
          {detail.isInternal ? "internal" : "external"}
        </Badge>
      </div>

      <Stagger className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        <Item><Card><Stat label="Territories" value={String(m.territoryCount)} /></Card></Item>
        <Item><Card><Stat label="Cities" value={String(m.cityCount)} /></Card></Item>
        <Item><Card><Stat label="Venues" value={String(m.venueCount)} /></Card></Item>
        <Item><Card><Stat label="Active sessions" value={String(m.activeSessions)} /></Card></Item>
        <Item><Card><Stat label="Fill rate" value={pct(m.fillRate)} /></Card></Item>
        <Item>
          <Card>
            <Stat label="Revenue" value={inr(m.revenue)} />
            <div className="mt-1"><Proto /></div>
          </Card>
        </Item>
        <Item><Card><Stat label="Refund rate" value={pct(m.refundRate)} /></Card></Item>
        <Item>
          <Card>
            <Stat label="Incidents" value={String(m.incidentCount)} tone={m.incidentCount > 0 ? "danger" : "default"} />
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat
              label="Staffing health"
              value={pct(m.staffingHealth)}
              tone={m.staffingHealth <= 50 ? "danger" : m.staffingHealth <= 75 ? "warm" : "ok"}
            />
          </Card>
        </Item>
      </Stagger>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <PanelHeader title="Overview" sub="Identity and partnership record" />
          <div className="mt-4">
            <KVGrid>
              <Row label="Type"><span className="capitalize">{detail.type}</span></Row>
              <Row label="Internal">{detail.isInternal ? "Internal" : "External"}</Row>
              <Row label="Legal entity">{detail.legalEntity}</Row>
              <Row label="Franchise head">{detail.franchiseHead}</Row>
              <Row label="Revenue share">
                <span className="flex items-center justify-end gap-1.5">
                  {detail.revenueShare}% <Proto />
                </span>
              </Row>
              <Row label="Start date">{detail.startDate}</Row>
              <Row label="Contact">{detail.contactDetails || "—"}</Row>
              <Row label="Status"><StatusChip value={detail.status} /></Row>
              <Row label="Notes">{detail.notes || "—"}</Row>
            </KVGrid>
          </div>
        </Card>

        <Card>
          <PanelHeader title="Leadership" sub="The head accountable for this franchise" />
          {canManage ? (
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <Field label="Franchise head">
                  <Select value={head} onChange={(e) => setHead(e.target.value)}>
                    <option value="">Select an operator</option>
                    {OPERATORS.map((o) => (
                      <option key={o.id} value={o.name}>
                        {o.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Button
                variant="secondary"
                disabled={!head || head === detail.franchiseHead}
                onClick={() => changeFranchiseHead(detail.id, head)}
              >
                Apply
              </Button>
            </div>
          ) : (
            <div className="mt-3">
              <p className="text-sm text-ink-sec">Current head: {detail.franchiseHead}</p>
              <PrototypeRoleNote className="mt-3" />
            </div>
          )}
        </Card>

        <Card>
          <PanelHeader
            title="Territories"
            sub="Scopes operating under this franchise"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{detail.territories.length}</Badge>}
          />
          {detail.status !== "active" && (
            <div className="mt-3 flex items-start gap-2 rounded-lg border border-warning/15 bg-warning/5 p-3 text-[11px] leading-relaxed text-ink-mut">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              <span>Paused franchise keeps its territories visible but paused — none are deleted.</span>
            </div>
          )}
          <div className="mt-3 space-y-1.5">
            {detail.territories.length === 0 && <p className="text-sm text-ink-mut">No territories assigned.</p>}
            {detail.territories.map((t) => (
              <Link
                key={t.id}
                href={`/territories/${t.id}`}
                className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-lum">{t.name}</p>
                  <p className="text-[11px] text-ink-mut">{t.cities} cities · {t.venues} venues</p>
                </div>
                <StatusChip value={t.status} />
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Cities"
            sub="Cities under scoped territories"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{detail.cities.length}</Badge>}
          />
          <div className="mt-3 space-y-1.5">
            {detail.cities.length === 0 && <p className="text-sm text-ink-mut">No cities under this franchise.</p>}
            {detail.cities.map((c) => (
              <Link
                key={c.id}
                href={`/cities/${c.id}`}
                className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-lum">{c.name}</p>
                  <p className="text-[11px] text-ink-mut">{c.state} · {c.venues} venues</p>
                </div>
                <StatusChip value={c.status} />
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Venues"
            sub="All venues across scoped territories"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{detail.venues.length}</Badge>}
          />
          <div className="mt-3 space-y-1.5">
            {detail.venues.length === 0 && <p className="text-sm text-ink-mut">No venues under this franchise.</p>}
            {detail.venues.map((v) => (
              <Link
                key={v.id}
                href={`/locations/venues/${v.id}`}
                className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-lum">{v.name}</p>
                  <p className="text-[11px] text-ink-mut">{v.cityName} · {v.playingAreas} PAs</p>
                </div>
                <StatusChip value={v.status} />
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Sessions"
            sub="Upcoming missions across the franchise"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{upcoming.length}</Badge>}
          />
          <div className="mt-3 space-y-1.5">
            {upcoming.length === 0 && <p className="text-sm text-ink-mut">No upcoming sessions.</p>}
            {upcoming.map((s) => (
              <div key={s.id} className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-lum">{s.title}</p>
                  <p className="text-[11px] text-ink-mut">{s.date} · {s.time} · {s.venueName}</p>
                </div>
                <StatusChip value={s.status} />
              </div>
            ))}
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <PanelHeader title="Commercial" sub={canSeeCommercial ? "Settlement-side summary — prototype figures" : undefined} />
          {canSeeCommercial ? (
            <div className="mt-4">
              <Row label="Settled revenue">
                <span className="flex items-center justify-end gap-1.5">
                  {inr(m.revenue)} <Proto />
                </span>
              </Row>
              <Row label="Refund rate">
                <span className="flex items-center justify-end gap-1.5">
                  {pct(m.refundRate)} <Proto />
                </span>
              </Row>
              <Row label="Revenue share">
                <span className="flex items-center justify-end gap-1.5">
                  {detail.revenueShare}% <Proto />
                </span>
              </Row>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-mut">Commercial summary is outside your role lane.</p>
          )}
        </Card>

        {canSeeSafety && (
          <Card>
            <PanelHeader title="Risks & Signals" sub="Safety lane view" />
            <div className="mt-3 space-y-3">
              {detail.warnings.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {detail.warnings.map((w) => (
                    <Badge key={w} className="border border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]">
                      <AlertTriangle className="h-3 w-3" />
                      {w}
                    </Badge>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="solid rounded-xl p-3">
                  <p className="overline">Open incidents</p>
                  <p className={cn("mt-1 text-xl font-semibold", m.incidentCount > 0 ? "text-[#ff8f86]" : "text-ink-lum")}>
                    {m.incidentCount}
                  </p>
                </div>
                <div className="solid rounded-xl p-3">
                  <p className="overline">Staffing health</p>
                  <p
                    className={cn(
                      "mt-1 text-xl font-semibold",
                      m.staffingHealth <= 50 ? "text-[#ff8f86]" : m.staffingHealth <= 75 ? "text-[#ffd28a]" : "text-[#5fd7a3]",
                    )}
                  >
                    {pct(m.staffingHealth)}
                  </p>
                </div>
              </div>
            </div>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <PanelHeader title="Activity" sub={detail.lastActivity} />
          <div className="mt-3 space-y-1.5">
            {audits.length === 0 && <p className="text-sm text-ink-mut">No recorded activity.</p>}
            {audits.map((a) => (
              <div key={a.id} className="solid rounded-xl px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink-lum">{a.action}</p>
                  <p className="text-[11px] text-ink-mut">{a.timestamp}</p>
                </div>
                <p className="mt-0.5 text-xs text-ink-sec">{a.description}</p>
                <p className="mt-0.5 text-[11px] text-ink-mut">{operatorName(a.operatorId)}</p>
              </div>
            ))}
          </div>
        </Card>

        {canAnnotate && (
          <Card className="lg:col-span-2">
            <PanelHeader title="Annotations" sub="Operational notes append to the audit trail" />
            <div className="mt-4 flex flex-wrap items-end gap-2">
              <div className="min-w-[260px] flex-1">
                <Field label="Add operational note">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Context for the team…" />
                </Field>
              </div>
              <Button
                variant="secondary"
                disabled={!note.trim()}
                onClick={() => {
                  addOperationalNote("franchise", detail.name, note.trim());
                  setNote("");
                }}
              >
                <StickyNote className="h-4 w-4" />
                Add note
              </Button>
            </div>
          </Card>
        )}
      </div>
    </PageFrame>
  );
}
