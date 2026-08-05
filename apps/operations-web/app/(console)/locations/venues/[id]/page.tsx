"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { venueDetail, territoryById, categoryName } from "@/lib/prototype/repositories";
import { operatorName } from "@/lib/data/mock";
import { geoCan } from "@/lib/geo/access";
import { cn, inr, pct } from "@/lib/format";
import { Breadcrumbs, CatChips, KVGrid, PageFrame, Proto, PrototypeNote, PrototypeRoleNote, Row } from "@/components/geo/layout";
import { ConfirmAction } from "@/components/geo/ConfirmAction";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied, Stat } from "@/components/ui/panels";
import { Badge, Button, StatusChip } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/fields";
import { Item, Stagger, Tide } from "@/components/motion/Motion";
import { AlertTriangle, ArrowLeft, DoorOpen, Map, MapPin, Play, Plus, StickyNote, Wrench } from "lucide-react";

export default function VenueDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const {
    state,
    role,
    canAccess,
    hydrated,
    changeVenueStatus,
    addVenueSafetyNote,
    addOperationalNote,
  } = useStore();

  const detail = useMemo(() => venueDetail(state, id), [state, id]);

  const [safetyNote, setSafetyNote] = useState("");
  const [note, setNote] = useState("");

  const canManage = geoCan(role.id, "manage-venue");
  const canCreatePA = geoCan(role.id, "create-playing-area");
  const canSeeCommercial = geoCan(role.id, "see-commercial");
  const canSeeSafety = geoCan(role.id, "see-safety");
  const canSeeContacts = geoCan(role.id, "see-contacts");
  const canAnnotate = geoCan(role.id, "annotate");

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/locations")) return <PageFrame><PermissionDenied module="Locations" /></PageFrame>;

  if (!detail) {
    return (
      <PageFrame>
        <div className="solid rounded-panel p-10 text-center">
          <p className="text-sm font-medium text-ink-lum">Venue not found</p>
          <p className="mt-1 text-sm text-ink-mut">This venue doesn&apos;t exist or was removed.</p>
          <Button variant="secondary" className="mt-5" onClick={() => router.push("/locations/venues")}>
            <ArrowLeft className="h-4 w-4" />
            Back to venues
          </Button>
        </div>
      </PageFrame>
    );
  }

  const m = detail.metrics;
  const pasToday = detail.playingAreas.reduce((a, p) => a + p.sessionsToday, 0);
  const franchiseId = territoryById(state, detail.territoryId)?.franchiseId;
  const upcoming = detail.sessions.filter(
    (s) => (s.date === "Today" || s.date === "Tomorrow") && !["cancelled", "completed", "archived"].includes(s.status),
  );
  const audits = state.audits.filter((a) => a.description.includes(detail.name));

  const statusActions = canManage ? (
    detail.status === "ready" ? (
      <>
        <ConfirmAction
          label="Take to maintenance"
          title="Take this venue to maintenance?"
          body={
            <>
              <span className="font-medium text-ink-lum">{detail.name}</span> will stop accepting new scheduling while
              maintenance. Playing areas are retained.
            </>
          }
          confirmLabel="Take to maintenance"
          tone="danger"
          variant="secondary"
          icon={<Wrench className="h-4 w-4" />}
          onConfirm={() => changeVenueStatus(detail.id, "maintenance")}
        />
        <ConfirmAction
          label="Close venue"
          title="Close this venue?"
          body={
            <>
              Closing <span className="font-medium text-ink-lum">{detail.name}</span> withdraws it from new scheduling
              entirely. Playing areas are retained.
            </>
          }
          confirmLabel="Close venue"
          tone="danger"
          variant="secondary"
          icon={<DoorOpen className="h-4 w-4" />}
          onConfirm={() => changeVenueStatus(detail.id, "closed")}
        />
      </>
    ) : (
      <ConfirmAction
        label="Reopen for scheduling"
        title="Reopen this venue?"
        body={
          <>
            Reopening <span className="font-medium text-ink-lum">{detail.name}</span> makes it available for new
            scheduling again.
          </>
        }
        confirmLabel="Reopen venue"
        tone="primary"
        variant="primary"
        icon={<Play className="h-4 w-4" />}
        onConfirm={() => changeVenueStatus(detail.id, "ready")}
      />
    )
  ) : (
    <PrototypeRoleNote />
  );

  return (
    <PageFrame>
      <Breadcrumbs
        items={[
          { label: "Locations", href: "/locations" },
          { label: "Venues", href: "/locations/venues" },
          { label: detail.name },
        ]}
      />

      <PageHeader
        overline="Locations · Venues"
        title={detail.name}
        sub={detail.address}
        right={
          <div className="flex flex-wrap items-center gap-2">
            {canCreatePA && (
              <Link href={`/locations/venues/${detail.id}/playing-areas/new`}>
                <Button>
                  <Plus className="h-4 w-4" />
                  Add playing area
                </Button>
              </Link>
            )}
            {statusActions}
          </div>
        }
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusChip value={detail.status} />
        <Badge
          className={cn(
            "border",
            detail.type === "arena"
              ? "border-[#4c6fff]/25 bg-[#4c6fff]/12 text-[#9db4ff]"
              : detail.type === "club"
                ? "border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]"
                : "border-[#12b76a]/25 bg-[#12b76a]/12 text-[#5fd7a3]",
          )}
        >
          {detail.type}
        </Badge>
        <Link href={`/cities/${detail.cityId}`}>
          <Badge className="border border-white/8 bg-white/4 text-ink-sec transition-colors hover:bg-white/8">
            <MapPin className="h-3 w-3" />
            {detail.cityName}
          </Badge>
        </Link>
        <Link href={`/territories/${detail.territoryId}`}>
          <Badge className="border border-white/8 bg-white/4 text-ink-sec transition-colors hover:bg-white/8">
            {detail.territoryName}
          </Badge>
        </Link>
        {franchiseId && (
          <Link href={`/franchises/${franchiseId}`}>
            <Badge className="border border-white/8 bg-white/4 text-ink-sec transition-colors hover:bg-white/8">
              {detail.franchiseName}
            </Badge>
          </Link>
        )}
      </div>

      <Stagger className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
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
        <Item><Card><Stat label="Playing areas" value={String(m.playingAreaCount)} /></Card></Item>
        <Item><Card><Stat label="PAs today" value={String(pasToday)} /></Card></Item>
      </Stagger>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <PanelHeader title="Overview" sub="Identity and placement" />
          <div className="mt-4">
            <KVGrid>
              <Row label="Type"><span className="capitalize">{detail.type}</span></Row>
              <Row label="Status"><StatusChip value={detail.status} /></Row>
              <Row label="Verification"><StatusChip value={detail.verificationStatus} /></Row>
              <Row label="Setting">{detail.isIndoor ? "Indoor" : "Outdoor"}</Row>
              <Row label="Weather">{detail.weatherDependent ? "Weather-dependent" : "Indoor-safe"}</Row>
              <Row label="Operating hours">{detail.operatingHours}</Row>
              <Row label="Address">{detail.address}</Row>
              <Row label="City">{detail.cityName}</Row>
              <Row label="Territory">{detail.territoryName}</Row>
              <Row label="Franchise">{detail.franchiseName}</Row>
            </KVGrid>
            {canSeeContacts ? (
              <KVGrid className="mt-1">
                <Row label="Contact person">{detail.contactPerson || "—"}</Row>
                <Row label="Contact number">{detail.contactNumber || "—"}</Row>
              </KVGrid>
            ) : (
              <p className="mt-3 text-xs text-ink-mut">Contact details are outside your role lane.</p>
            )}
          </div>
        </Card>

        <Card glass={false}>
          <PanelHeader title="Map" sub="Venue location" />
          <div className="mt-4 flex flex-col items-start gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-ink-mut">
              <Map className="h-4 w-4" />
            </span>
            <p className="flex items-center gap-1.5 text-sm text-ink-sec">
              <MapPin className="h-3.5 w-3.5 text-ink-mut" />
              {detail.address}
            </p>
            <p className="text-xs text-ink-mut">Interactive map is a prototype placeholder — no live map is connected.</p>
          </div>
        </Card>

        <Card>
          <PanelHeader title="Availability & Status" sub="Can this venue take new scheduling?" />
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusChip value={detail.status} />
              <StatusChip value={detail.verificationStatus} />
            </div>
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
            {detail.status !== "ready" && (
              <PrototypeNote>This venue is not available for new scheduling while maintenance/closed.</PrototypeNote>
            )}
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Playing Areas"
            sub="Floors and courts inside this venue"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{detail.playingAreas.length}</Badge>}
          />
          <div className="mt-3 space-y-1.5">
            {detail.playingAreas.length === 0 && <p className="text-sm text-ink-mut">No playing areas yet.</p>}
            {detail.playingAreas.map((p) => (
              <Link
                key={p.id}
                href={`/locations/playing-areas/${p.id}`}
                className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-white/4"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium text-ink-lum">{p.name}</p>
                    <span className="text-[11px] tabular text-ink-mut">cap {p.capacity}</span>
                  </div>
                  <div className="mt-1"><CatChips ids={p.activities} names={(cat) => categoryName(state, cat)} /></div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[11px] tabular text-ink-mut">{p.sessionsToday} today</span>
                  <StatusChip value={p.status} />
                </div>
              </Link>
            ))}
          </div>
          {canCreatePA && (
            <div className="mt-3">
              <Link href={`/locations/venues/${detail.id}/playing-areas/new`}>
                <Button variant="secondary">
                  <Plus className="h-4 w-4" />
                  Add playing area
                </Button>
              </Link>
            </div>
          )}
        </Card>

        <Card>
          <PanelHeader
            title="Staffing & Crew"
            sub={`${detail.staffCapacity} staff capacity`}
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{detail.crew.length}</Badge>}
          />
          <div className="mt-3 space-y-1.5">
            {detail.crew.length === 0 && <p className="text-sm text-ink-mut">No crew assigned.</p>}
            {detail.crew.map((c) => (
              <div key={c.id} className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-lum">{c.name}</p>
                  <p className="truncate text-[11px] text-ink-mut">{c.role} · {c.assignment}</p>
                </div>
                <StatusChip value={c.status} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader title="Equipment" sub="What the venue provides" />
          <div className="mt-4 space-y-3">
            {detail.equipmentAvailable.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {detail.equipmentAvailable.map((e) => (
                  <span key={e} className="rounded-md border border-white/8 bg-white/4 px-2 py-0.5 text-[11px] text-ink-sec">
                    {e}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-mut">No equipment listed.</p>
            )}
            <Row label="Spectator allowance">{detail.spectatorAllowance}</Row>
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Sessions"
            sub="Upcoming missions at this venue"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{upcoming.length}</Badge>}
          />
          <div className="mt-3 space-y-1.5">
            {upcoming.length === 0 && <p className="text-sm text-ink-mut">No upcoming sessions.</p>}
            {upcoming.map((s) => (
              <div key={s.id} className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-lum">{s.title}</p>
                  <p className="text-[11px] text-ink-mut">{s.date} · {s.time} · {s.playingAreaName}</p>
                </div>
                <StatusChip value={s.status} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader title="Capacity" sub="Safety is a hard ceiling" />
          <div className="mt-4">
            <Row label="Safety capacity">{detail.safetyCapacity}</Row>
            <p className="mt-1 text-xs text-ink-mut">Positive safety capacity required.</p>
            <Row label="Staff capacity">{detail.staffCapacity}</Row>
            <Row label="Spectator allowance">{detail.spectatorAllowance}</Row>
          </div>
        </Card>

        <Card>
          <PanelHeader title="Costs & Commercial" sub={canSeeCommercial ? "Prototype figures" : undefined} />
          {canSeeCommercial ? (
            <div className="mt-4">
              <Row label="Cost per slot">
                <span className="flex items-center justify-end gap-1.5">
                  {inr(detail.costPerSlot)} <Proto />
                </span>
              </Row>
              <Row label="Revenue model">
                <span className="flex items-center justify-end gap-1.5">
                  {detail.revenueModel} <Proto />
                </span>
              </Row>
              <Row label="Cancellation terms">
                <span className="flex items-center justify-end gap-1.5">
                  {detail.cancellationTerms || "—"} <Proto />
                </span>
              </Row>
            </div>
          ) : (
            <p className="mt-3 text-sm text-ink-mut">Commercial figures are outside your role lane.</p>
          )}
        </Card>

        {canSeeSafety && (
          <Card className="lg:col-span-2">
            <PanelHeader
              title="Safety & Incidents"
              sub="The safety lane view"
              right={
                <Badge className="border border-white/8 bg-white/4 text-ink-sec">{m.incidentCount} open</Badge>
              }
            />
            <div className="mt-4">
              <KVGrid>
                <Row label="Emergency exits">{detail.emergencyExits || "—"}</Row>
                <Row label="First aid">{detail.firstAid ? "Available" : "Not available"}</Row>
                <Row label="Safety contact">{detail.safetyContact || "—"}</Row>
                <Row label="Open incidents">
                  <span className={cn(m.incidentCount > 0 ? "text-[#ff8f86]" : "text-ink-sec")}>{m.incidentCount}</span>
                </Row>
              </KVGrid>
              <Row label="Incident notes">{detail.incidentNotes || "—"}</Row>
            </div>
            {canAnnotate && (
              <div className="mt-4 flex flex-wrap items-end gap-2">
                <div className="min-w-[240px] flex-1">
                  <Field label="Add safety note">
                    <Input
                      value={safetyNote}
                      onChange={(e) => setSafetyNote(e.target.value)}
                      placeholder="Context for the safety team…"
                    />
                  </Field>
                </div>
                <Button
                  variant="secondary"
                  disabled={!safetyNote.trim()}
                  onClick={() => {
                    addVenueSafetyNote(detail.id, safetyNote.trim());
                    setSafetyNote("");
                  }}
                >
                  <StickyNote className="h-4 w-4" />
                  Add note
                </Button>
              </div>
            )}
          </Card>
        )}

        <Card className="lg:col-span-2">
          <PanelHeader title="Timeline" sub="Latest activity first" />
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
                  addOperationalNote("venue", detail.name, note.trim());
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
