"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { categoryName, cityDetail } from "@/lib/prototype/repositories";
import { OPERATORS, operatorName } from "@/lib/data/mock";
import { geoCan } from "@/lib/geo/access";
import { cn, inr, pct } from "@/lib/format";
import { Breadcrumbs, CatChips, KVGrid, PageFrame, Proto, PrototypeRoleNote, Row } from "@/components/geo/layout";
import { ConfirmAction } from "@/components/geo/ConfirmAction";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied, Stat } from "@/components/ui/panels";
import { Badge, Button, FillMeter, StatusChip } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/fields";
import { Item, Stagger, Tide } from "@/components/motion/Motion";
import { AlertTriangle, ArrowLeft, Building2, MapPin, Pause, Play, Plus, StickyNote } from "lucide-react";

const isUpcoming = (s: { date: string; status: string }) =>
  (s.date === "Today" || s.date === "Tomorrow") && !["cancelled", "completed", "archived"].includes(s.status);

export default function CityDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { state, role, canAccess, hydrated, changeCityStatus, addOperationalNote } = useStore();

  const detail = useMemo(() => cityDetail(state, id), [state, id]);

  const [note, setNote] = useState("");

  const canManage = geoCan(role.id, "manage-city");
  const canSeeSafety = geoCan(role.id, "see-safety");
  const canAnnotate = geoCan(role.id, "annotate");

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/territories")) return <PageFrame><PermissionDenied module="Territories" /></PageFrame>;

  if (!detail) {
    return (
      <PageFrame>
        <div className="solid rounded-panel p-10 text-center">
          <p className="text-sm font-medium text-ink-lum">City not found</p>
          <p className="mt-1 text-sm text-ink-mut">This city doesn&apos;t exist or was removed.</p>
          <Button variant="secondary" className="mt-5" onClick={() => router.push("/territories")}>
            <ArrowLeft className="h-4 w-4" />
            Back to territories
          </Button>
        </div>
      </PageFrame>
    );
  }

  const m = detail.metrics;
  const upcoming = detail.sessions.filter(isUpcoming);
  const audits = state.audits.filter((a) => a.description.includes(detail.name));

  return (
    <PageFrame>
      <Breadcrumbs
        items={[
          { label: "Territories", href: "/territories" },
          { label: detail.territory.name, href: `/territories/${detail.territory.id}` },
          { label: detail.name },
        ]}
      />

      <PageHeader
        overline="Territories · Cities"
        title={detail.name}
        sub={`${detail.territory.name} · ${detail.state}`}
        right={
          canManage ? (
            detail.status === "active" ? (
              <ConfirmAction
                label="Pause city"
                title="Pause this city?"
                body={
                  <>
                    Pausing <span className="font-medium text-ink-lum">{detail.name}</span> freezes booking intake across
                    its venues. Venues are retained.
                  </>
                }
                confirmLabel="Pause city"
                tone="danger"
                variant="danger"
                icon={<Pause className="h-4 w-4" />}
                onConfirm={() => changeCityStatus(detail.id, "paused")}
              />
            ) : (
              <ConfirmAction
                label="Resume city"
                title="Resume this city?"
                body={
                  <>
                    Resuming <span className="font-medium text-ink-lum">{detail.name}</span> reopens booking intake for
                    its venues.
                  </>
                }
                confirmLabel="Resume city"
                tone="primary"
                variant="primary"
                icon={<Play className="h-4 w-4" />}
                onConfirm={() => changeCityStatus(detail.id, "active")}
              />
            )
          ) : (
            <PrototypeRoleNote />
          )
        }
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusChip value={detail.status} />
        <Link
          href={`/territories/${detail.territory.id}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-[#4c6fff]/25 bg-[#4c6fff]/12 px-2.5 py-0.5 text-xs font-medium text-[#9db4ff] transition-colors hover:bg-[#4c6fff]/20"
        >
          <MapPin className="h-3 w-3" />
          {detail.territory.name}
        </Link>
        {detail.territory.franchiseId ? (
          <Link
            href={`/franchises/${detail.territory.franchiseId}`}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-xs font-medium text-ink-sec transition-colors hover:bg-white/8"
          >
            <Building2 className="h-3 w-3" />
            {detail.territory.franchiseName}
          </Link>
        ) : (
          <Badge className="border border-white/10 bg-white/5 text-ink-sec">{detail.territory.franchiseName}</Badge>
        )}
      </div>

      <Stagger className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Item><Card><Stat label="Venues" value={String(m.venueCount)} /></Card></Item>
        <Item><Card><Stat label="Playing areas" value={String(m.playingAreaCount)} /></Card></Item>
        <Item><Card><Stat label="Upcoming sessions" value={String(m.upcomingSessions)} /></Card></Item>
        <Item><Card><Stat label="Fill rate" value={pct(m.fillRate)} /></Card></Item>
        <Item>
          <Card>
            <Stat label="Revenue" value={inr(m.revenue)} />
            <div className="mt-1"><Proto /></div>
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat label="Incidents" value={String(m.incidentCount)} tone={m.incidentCount > 0 ? "danger" : "default"} />
          </Card>
        </Item>
      </Stagger>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <PanelHeader title="Overview" sub="Identity and operating record" />
          <div className="mt-4">
            <KVGrid>
              <Row label="Territory">
                <Link href={`/territories/${detail.territory.id}`} className="text-ink-sec hover:text-ink-lum">
                  {detail.territory.name}
                </Link>
              </Row>
              <Row label="Franchise">
                <Link href={`/franchises/${detail.territory.franchiseId}`} className="text-ink-sec hover:text-ink-lum">
                  {detail.territory.franchiseName}
                </Link>
              </Row>
              <Row label="State">{detail.state}</Row>
              <Row label="Launch date">{detail.launchDate || "—"}</Row>
              <Row label="Manager">{detail.managerName}</Row>
              <Row label="Status"><StatusChip value={detail.status} /></Row>
              <Row label="Notes">{detail.notes || "—"}</Row>
            </KVGrid>
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Categories"
            sub="Activities this city can host"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{detail.supportedCategories.length}</Badge>}
          />
          <div className="mt-3">
            <CatChips ids={detail.supportedCategories} names={(cid) => categoryName(state, cid)} />
            {detail.supportedCategories.length === 0 && (
              <p className="mt-2 text-sm text-ink-mut">No supported activity categories configured.</p>
            )}
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Venues"
            sub="Venues under this city"
            right={
              <div className="flex items-center gap-2">
                {geoCan(role.id, "create-venue") && (
                  <Link
                    href="/locations/venues/new"
                    className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white shadow-lift transition-colors hover:bg-brand-hover"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    New venue
                  </Link>
                )}
                <Badge className="border border-white/8 bg-white/4 text-ink-sec">{detail.venues.length}</Badge>
              </div>
            }
          />
          <div className="mt-3 space-y-1.5">
            {detail.venues.length === 0 && <p className="text-sm text-ink-mut">No venues under this city.</p>}
            {detail.venues.map((v) => (
              <Link
                key={v.id}
                href={`/locations/venues/${v.id}`}
                className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-lum">{v.name}</p>
                  <p className="text-[11px] text-ink-mut">{v.playingAreas} PAs · {v.upcomingSessions} upcoming</p>
                </div>
                <StatusChip value={v.status} />
              </Link>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Sessions"
            sub="Upcoming sessions in this city"
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

        <Card>
          <PanelHeader title="Performance" sub="Fill and money posture" />
          <div className="mt-4">
            <Row label="Fill rate">
              <span className="flex items-center justify-end gap-2">
                <FillMeter value={m.fillRate} className="w-24" />
                <span className="tabular text-sm">{pct(m.fillRate)}</span>
              </span>
            </Row>
            <Row label="Revenue">
              <span className="flex items-center justify-end gap-1.5">
                {inr(m.revenue)} <Proto />
              </span>
            </Row>
          </div>
        </Card>

        {canSeeSafety && (
          <Card>
            <PanelHeader title="Safety & Staffing" sub="Safety lane view" />
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
              <div className="solid rounded-xl p-3">
                <p className="overline">Open incidents</p>
                <p className={cn("mt-1 text-xl font-semibold", m.incidentCount > 0 ? "text-[#ff8f86]" : "text-ink-lum")}>
                  {m.incidentCount}
                </p>
              </div>
            </div>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <PanelHeader
            title="Timeline"
            sub="Audit trail mentioning this city"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{audits.length}</Badge>}
          />
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
                  addOperationalNote("city", detail.name, note.trim());
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
