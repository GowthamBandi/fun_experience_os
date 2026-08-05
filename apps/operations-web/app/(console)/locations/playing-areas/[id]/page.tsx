"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { playingAreaDetail, venueById, territoryById, categoryName } from "@/lib/prototype/repositories";
import { operatorName } from "@/lib/data/mock";
import { geoCan } from "@/lib/geo/access";
import { Breadcrumbs, CatChips, KVGrid, PageFrame, PrototypeNote, PrototypeRoleNote, Row } from "@/components/geo/layout";
import { ConfirmAction } from "@/components/geo/ConfirmAction";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied, Stat } from "@/components/ui/panels";
import { Badge, Button, StatusChip } from "@/components/ui/primitives";
import { Field, Input } from "@/components/ui/fields";
import { Item, Stagger, Tide } from "@/components/motion/Motion";
import { AlertTriangle, ArrowLeft, DoorOpen, Pause, Play, StickyNote, Wrench } from "lucide-react";

export default function PlayingAreaDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { state, role, canAccess, hydrated, changePlayingAreaStatus, addOperationalNote } = useStore();

  const detail = useMemo(() => playingAreaDetail(state, id), [state, id]);
  const parentVenue = useMemo(() => (detail ? venueById(state, detail.venueId) : undefined), [state, detail]);

  const [note, setNote] = useState("");

  const canManage = geoCan(role.id, "manage-playing-area");
  const canAnnotate = geoCan(role.id, "annotate");

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/locations")) return <PageFrame><PermissionDenied module="Locations" /></PageFrame>;

  if (!detail) {
    return (
      <PageFrame>
        <div className="solid rounded-panel p-10 text-center">
          <p className="text-sm font-medium text-ink-lum">Playing area not found</p>
          <p className="mt-1 text-sm text-ink-mut">This playing area doesn&apos;t exist or was removed.</p>
          <Button variant="secondary" className="mt-5" onClick={() => router.push("/locations/venues")}>
            <ArrowLeft className="h-4 w-4" />
            Back to venues
          </Button>
        </div>
      </PageFrame>
    );
  }

  const franchiseId = territoryById(state, detail.venue.territoryId)?.franchiseId;
  const upcoming = detail.sessions.filter(
    (s) => (s.date === "Today" || s.date === "Tomorrow") && !["cancelled", "completed", "archived"].includes(s.status),
  );
  const sessionsToday = detail.sessions.filter((s) => s.date === "Today" && s.status !== "cancelled").length;
  const audits = state.audits.filter((a) => a.description.includes(detail.name));

  const statusActions = canManage ? (
    detail.status === "active" ? (
      <>
        <ConfirmAction
          label="Take to maintenance"
          title="Take this area to maintenance?"
          body={
            <>
              <span className="font-medium text-ink-lum">{detail.name}</span> will be withdrawn from scheduling while
              maintenance.
            </>
          }
          confirmLabel="Take to maintenance"
          tone="danger"
          variant="secondary"
          icon={<Wrench className="h-4 w-4" />}
          onConfirm={() => changePlayingAreaStatus(detail.id, "maintenance")}
        />
        <ConfirmAction
          label="Mark unavailable"
          title="Mark this area unavailable?"
          body={
            <>
              <span className="font-medium text-ink-lum">{detail.name}</span> becomes unavailable for new scheduling.
            </>
          }
          confirmLabel="Mark unavailable"
          tone="danger"
          variant="secondary"
          icon={<Pause className="h-4 w-4" />}
          onConfirm={() => changePlayingAreaStatus(detail.id, "unavailable")}
        />
        <ConfirmAction
          label="Close area"
          title="Close this area?"
          body={
            <>
              Closing <span className="font-medium text-ink-lum">{detail.name}</span> fully withdraws it from scheduling.
            </>
          }
          confirmLabel="Close area"
          tone="danger"
          variant="secondary"
          icon={<DoorOpen className="h-4 w-4" />}
          onConfirm={() => changePlayingAreaStatus(detail.id, "closed")}
        />
      </>
    ) : (
      <ConfirmAction
        label="Reopen area"
        title="Reopen this area?"
        body={
          <>
            Reopening <span className="font-medium text-ink-lum">{detail.name}</span> makes it available for new
            scheduling again.
          </>
        }
        confirmLabel="Reopen area"
        tone="primary"
        variant="primary"
        icon={<Play className="h-4 w-4" />}
        onConfirm={() => changePlayingAreaStatus(detail.id, "active")}
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
          { label: detail.venue.name, href: `/locations/venues/${detail.venue.id}` },
          { label: detail.name },
        ]}
      />

      <PageHeader
        overline="Locations · Playing areas"
        title={detail.name}
        sub={`A playing area at ${detail.venue.name}`}
        right={statusActions}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <StatusChip value={detail.status} />
        <Link href={`/locations/venues/${detail.venue.id}`}>
          <Badge className="border border-white/8 bg-white/4 text-ink-sec transition-colors hover:bg-white/8">
            {detail.venue.name}
          </Badge>
        </Link>
        <Link href={`/cities/${detail.venue.cityId}`}>
          <Badge className="border border-white/8 bg-white/4 text-ink-sec transition-colors hover:bg-white/8">
            {detail.cityName}
          </Badge>
        </Link>
        <Link href={`/territories/${detail.venue.territoryId}`}>
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

      {detail.venue.status !== "ready" && (
        <div className="mt-4">
          <PrototypeNote>
            This playing area&apos;s parent venue is {detail.venue.status} — new scheduling is limited until it reopens.
          </PrototypeNote>
        </div>
      )}

      <Stagger className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Item><Card><Stat label="Sessions" value={String(upcoming.length)} /></Card></Item>
        <Item><Card><Stat label="Capacity" value={String(detail.maxCapacity)} /></Card></Item>
        <Item><Card><Stat label="Spectator allowance" value={String(detail.spectatorCapacity)} /></Card></Item>
        <Item><Card><Stat label="Staff" value={String(detail.staffCapacity)} /></Card></Item>
        <Item><Card><Stat label="Sessions today" value={String(sessionsToday)} /></Card></Item>
      </Stagger>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <PanelHeader title="Overview" sub="Placement inside the venue" />
          <div className="mt-4">
            <KVGrid>
              <Row label="Parent venue">
                <Link
                  href={`/locations/venues/${detail.venue.id}`}
                  className="text-[#9db4ff] transition-colors hover:text-ink-lum"
                >
                  {detail.venue.name}
                </Link>{" "}
                <StatusChip value={detail.venue.status} />
              </Row>
              <Row label="City">{detail.cityName}</Row>
              <Row label="Territory">{detail.territoryName}</Row>
              <Row label="Franchise">{detail.franchiseName}</Row>
              <Row label="Operating hours">{detail.operatingHours}</Row>
              <Row label="Status"><StatusChip value={detail.status} /></Row>
              <Row label="Restrictions">{detail.restrictions || "—"}</Row>
            </KVGrid>
          </div>
        </Card>

        <Card>
          <PanelHeader title="Compatibility" sub="Activities this area can host" />
          <div className="mt-4">
            <CatChips ids={detail.activityCompatibility} names={(cat) => categoryName(state, cat)} />
          </div>
        </Card>

        <Card>
          <PanelHeader title="Capacity" sub="Safety is a hard ceiling" />
          <div className="mt-4">
            <Row label="Max capacity">{detail.maxCapacity}</Row>
            <p className="mt-1 text-xs text-ink-mut">
              Must stay within the venue&apos;s safety capacity ({parentVenue?.safetyCapacity ?? "—"}).
            </p>
            <Row label="Staff capacity">{detail.staffCapacity}</Row>
            <Row label="Spectator capacity">{detail.spectatorCapacity}</Row>
          </div>
        </Card>

        <Card>
          <PanelHeader title="Equipment" sub="Kit on this floor" />
          <div className="mt-4">
            {detail.equipment.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {detail.equipment.map((e) => (
                  <span key={e} className="rounded-md border border-white/8 bg-white/4 px-2 py-0.5 text-[11px] text-ink-sec">
                    {e}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-ink-mut">No equipment listed.</p>
            )}
          </div>
        </Card>

        <Card>
          <PanelHeader
            title="Sessions"
            sub="Upcoming missions on this area"
            right={<Badge className="border border-white/8 bg-white/4 text-ink-sec">{upcoming.length}</Badge>}
          />
          <div className="mt-3 space-y-1.5">
            {upcoming.length === 0 && <p className="text-sm text-ink-mut">No upcoming sessions.</p>}
            {upcoming.map((s) => (
              <div key={s.id} className="solid flex items-center justify-between gap-3 rounded-xl px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-lum">{s.title}</p>
                  <p className="text-[11px] text-ink-mut">{s.date} · {s.time}</p>
                </div>
                <StatusChip value={s.status} />
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <PanelHeader title="Maintenance timeline" sub="Latest activity first" />
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
            {audits.length === 0 ? (
              <p className="text-sm text-ink-mut">No recorded activity.</p>
            ) : (
              <div className="space-y-1.5">
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
            )}
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
                  addOperationalNote("playing area", detail.name, note.trim());
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
