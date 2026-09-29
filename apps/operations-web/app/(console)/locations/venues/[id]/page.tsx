"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarClock, LayoutGrid, NotebookPen, Pencil, Plus, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { venueDetail } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { useCommandFeedback } from "@/components/ui/toast";
import { ConfirmDialog, Crumbs, DetailList, Figure, LinkButton, LinkRows, NotFoundCard, Notice, PageShell, Panel, StatusDialog, plural } from "@/components/setup/kit";
import { EditDrawer } from "@/components/setup/form";
import { RecordActivity } from "@/components/setup/shared";
import { VENUE_STATUS, venueFromValues, venueSteps } from "@/components/setup/schemas";
import { formatStaffRole } from "@/lib/prototype/selectors/staff";

const yes = (b: boolean) => (b ? "Yes" : "No");

export default function VenueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, canAccess, role, updateVenue, changeVenueStatus, addVenueSafetyNote } = useStore();
  const feedback = useCommandFeedback();
  const detail = useMemo(() => venueDetail(state, id), [state, id]);
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState<null | "verified" | "failed">(null);
  const [noteOpen, setNoteOpen] = useState(false);

  if (!canAccess("/locations")) return <PermissionDenied module="Venues" />;
  if (!detail) return <PageShell><NotFoundCard what="venue" backHref="/locations/venues" backLabel="All venues" /></PageShell>;

  const canManage = geoCan(role.id, "manage-venue");
  const canAddArea = geoCan(role.id, "create-playing-area") && detail.status !== "closed";
  const m = detail.metrics;
  const fields = venueSteps(state).flatMap((s) => s.fields).filter((f) => f.key !== "cityId");
  const catName = (cid: string) => state.categories.find((c) => c.id === cid)?.name ?? cid;
  const upcoming = detail.sessions.filter((s) => !["cancelled", "completed", "archived"].includes(s.status));

  return (
    <PageShell>
      <Crumbs items={[{ label: "Setup", href: "/setup" }, { label: detail.cityName, href: `/cities/${detail.cityId}` }, { label: detail.name }]} />
      <PageHeader
        overline={`Venue · ${detail.cityName} · ${detail.territoryName}`}
        title={detail.name}
        sub={detail.address}
        right={
          <>
            <StatusChip value={detail.status === "ready" ? "open" : detail.status} />
            {canManage && (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>
                <Button variant="secondary" onClick={() => setStatusOpen(true)}><RefreshCw className="h-4 w-4" /> Change status</Button>
              </>
            )}
            {canAddArea && <LinkButton href={`/locations/venues/${detail.id}/playing-areas/new`}><Plus className="h-4 w-4" /> Add playing area</LinkButton>}
          </>
        }
      />

      {detail.playingAreas.length === 0 && (
        <Notice tone="warn" title="No playing areas" action={canAddArea ? <LinkButton href={`/locations/venues/${detail.id}/playing-areas/new`} size="sm">Add playing area</LinkButton> : undefined}>
          Sessions cannot be scheduled here until the venue has at least one playing area.
        </Notice>
      )}
      {detail.status !== "ready" && <Notice tone="warn">This venue is {detail.status} and cannot take new sessions.</Notice>}
      {detail.verificationStatus !== "verified" && (
        <Notice
          tone={detail.verificationStatus === "failed" ? "danger" : "info"}
          title={detail.verificationStatus === "failed" ? "Safety check failed" : "Safety check pending"}
          action={
            canManage ? (
              <div className="flex gap-2">
                <Button size="sm" variant="success" onClick={() => setVerifyOpen("verified")}><ShieldCheck className="h-3.5 w-3.5" /> Mark verified</Button>
                {detail.verificationStatus !== "failed" && <Button size="sm" variant="secondary" onClick={() => setVerifyOpen("failed")}>Mark failed</Button>}
              </div>
            ) : undefined
          }
        >
          Record the outcome of the on-site safety inspection (exits, first aid, lighting, capacity signage).
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Figure label="Safe capacity" value={detail.safetyCapacity} hint={`${detail.staffCapacity} staff · ${detail.spectatorAllowance} spectators`} />
        <Figure label="Playing areas" value={m.playingAreaCount} />
        <Figure label="Upcoming sessions" value={m.upcomingSessions} hint={m.upcomingSessions ? `${m.fillRate}% average fill` : undefined} />
        <Figure label="Cost per slot" value={detail.costPerSlot ? inr(detail.costPerSlot) : "—"} hint={detail.revenueModel} />
        <Figure label="Settled revenue" value={inr(m.revenue)} />
        <Figure label="Open incidents" value={m.incidentCount} tone={m.incidentCount ? "warn" : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Playing areas" sub={plural(detail.playingAreas.length, "area")} icon={<LayoutGrid className="h-4 w-4" />}>
          <LinkRows
            empty="No playing areas yet."
            rows={detail.playingAreas.map((p) => ({ href: `/locations/playing-areas/${p.id}`, title: p.name, meta: `${p.capacity} people · ${p.activities.map(catName).join(", ") || "no activities"} · ${p.sessionsToday} upcoming`, right: <StatusChip value={p.status} /> }))}
          />
        </Panel>
        <Panel title="Upcoming sessions" icon={<CalendarClock className="h-4 w-4" />}>
          <LinkRows empty="No upcoming sessions here." rows={upcoming.slice(0, 8).map((s) => ({ href: `/missions/${s.id}`, title: s.title, meta: `${s.date} ${s.time} · ${s.playingAreaName} · ${s.booked}/${s.capacity} booked`, right: <StatusChip value={s.status} /> }))} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel title="Venue details">
          <DetailList
            rows={[
              { label: "Type", value: <span className="capitalize">{detail.type}</span> },
              { label: "Operating hours", value: detail.operatingHours },
              { label: "Contact person", value: detail.contactPerson },
              { label: "Contact number", value: detail.contactNumber },
              { label: "Activities", value: detail.supportedActivities.length ? detail.supportedActivities.map(catName).join(", ") : "Any compatible activity" },
              { label: "Equipment", value: detail.equipmentAvailable.join(", ") },
              { label: "Cancellation terms", value: detail.cancellationTerms },
            ]}
          />
        </Panel>
        <Panel title="Facilities">
          <DetailList
            rows={[
              { label: "Indoor", value: yes(detail.isIndoor) },
              { label: "Weather dependent", value: yes(detail.weatherDependent) },
              { label: "Lighting", value: yes(detail.lighting) },
              { label: "Washrooms", value: yes(detail.washrooms) },
              { label: "Parking", value: yes(detail.parking) },
              { label: "Step-free access", value: yes(detail.accessibility) },
            ]}
          />
        </Panel>
        <Panel title="Safety" right={canManage && <Button size="sm" variant="secondary" onClick={() => setNoteOpen(true)}><NotebookPen className="h-3.5 w-3.5" /> Safety note</Button>}>
          <DetailList
            rows={[
              { label: "Safety check", value: <StatusChip value={detail.verificationStatus} /> },
              { label: "Emergency exits", value: detail.emergencyExits },
              { label: "First aid on site", value: yes(detail.firstAid) },
              { label: "Safety contact", value: detail.safetyContact },
              { label: "Safety notes", value: detail.incidentNotes },
            ]}
          />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Staff based here" icon={<Users className="h-4 w-4" />}>
          <LinkRows empty="No staff are based at this venue." rows={detail.crew.map((c) => ({ href: `/people/staff/${c.id}`, title: c.name, meta: `${formatStaffRole(c.role)} · ${c.assignment}`, right: <StatusChip value={c.status} /> }))} />
        </Panel>
        <Panel title="Recent changes" sub="From the audit log">
          <RecordActivity state={state} match={[detail.name]} />
        </Panel>
      </div>

      <EditDrawer
        open={editing}
        onClose={() => setEditing(false)}
        title={`Edit ${detail.name}`}
        fields={fields}
        initial={{ ...detail }}
        onSave={(v) => {
          const { status: _s, cityId: _c, territoryId: _t, verificationStatus: _v, ...patch } = venueFromValues(state, { ...v, cityId: detail.cityId });
          void _s; void _c; void _t; void _v;
          const out = updateVenue(detail.id, patch);
          feedback(out, "Venue updated");
          return out;
        }}
      />
      <StatusDialog
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title={`Change status — ${detail.name}`}
        current={detail.status}
        options={VENUE_STATUS}
        onConfirm={(s, reason) => {
          const out = changeVenueStatus(detail.id, s, reason);
          feedback(out, `Venue set to ${s === "ready" ? "open" : s}`);
          return out;
        }}
      />
      <ConfirmDialog
        open={verifyOpen !== null}
        onClose={() => setVerifyOpen(null)}
        title={verifyOpen === "verified" ? "Mark safety check verified" : "Mark safety check failed"}
        body={verifyOpen === "verified" ? "Confirm the on-site inspection passed: exits, first aid, lighting and capacity signage were checked." : "Record that the inspection failed. The venue stays on the list but is flagged on every page that uses it."}
        confirmLabel={verifyOpen === "verified" ? "Mark verified" : "Mark failed"}
        tone={verifyOpen === "failed" ? "danger" : "primary"}
        reasonLabel="Inspection notes (required)"
        onConfirm={(reason) => {
          const out = updateVenue(detail.id, { verificationStatus: verifyOpen!, incidentNotes: reason });
          feedback(out, verifyOpen === "verified" ? "Safety check verified" : "Safety check recorded as failed");
          return out;
        }}
      />
      <ConfirmDialog
        open={noteOpen}
        onClose={() => setNoteOpen(false)}
        title="Add a safety note"
        body="The note replaces the venue's current safety note and is kept in the audit log."
        confirmLabel="Save note"
        reasonLabel="Safety note"
        onConfirm={(note) => {
          const out = addVenueSafetyNote(detail.id, note);
          feedback(out, "Safety note saved");
          return out;
        }}
      />
    </PageShell>
  );
}
