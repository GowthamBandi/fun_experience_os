"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Building2, CalendarClock, Pencil, Plus, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/store";
import { cityDetail } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { useCommandFeedback } from "@/components/ui/toast";
import { Crumbs, DetailList, Figure, LinkButton, LinkRows, NotFoundCard, Notice, PageShell, Panel, StatusDialog, plural } from "@/components/setup/kit";
import { EditDrawer } from "@/components/setup/form";
import { RecordActivity } from "@/components/setup/shared";
import { CITY_STATUS, cityFromValues, citySteps } from "@/components/setup/schemas";

export default function CityDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, canAccess, role, updateCity, changeCityStatus } = useStore();
  const feedback = useCommandFeedback();
  const detail = useMemo(() => cityDetail(state, id), [state, id]);
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  if (!canAccess("/cities")) return <PermissionDenied module="Cities" />;
  if (!detail) return <PageShell><NotFoundCard what="city" backHref="/cities" backLabel="All cities" /></PageShell>;

  const canManage = geoCan(role.id, "manage-city");
  const canAddVenue = geoCan(role.id, "create-venue");
  const m = detail.metrics;
  const fields = citySteps(state).flatMap((s) => s.fields).filter((f) => f.key !== "territoryId" && f.key !== "status");
  const catName = (cid: string) => state.categories.find((c) => c.id === cid)?.name ?? cid;
  const upcoming = detail.sessions.filter((s) => !["cancelled", "completed", "archived"].includes(s.status));

  return (
    <PageShell>
      <Crumbs items={[{ label: "Setup", href: "/setup" }, { label: detail.territory.name, href: `/territories/${detail.territoryId}` }, { label: detail.name }]} />
      <PageHeader
        overline={`City · ${detail.territory.name}`}
        title={detail.name}
        sub={`${detail.state} · Manager: ${detail.managerName} · Launch ${detail.launchDate}`}
        right={
          <>
            <StatusChip value={detail.status} />
            {canManage && (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>
                <Button variant="secondary" onClick={() => setStatusOpen(true)}><RefreshCw className="h-4 w-4" /> Change status</Button>
              </>
            )}
            {canAddVenue && <LinkButton href={`/locations/venues/new?cityId=${detail.id}`}><Plus className="h-4 w-4" /> Add venue</LinkButton>}
          </>
        }
      />
      {detail.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Figure label="Venues" value={m.venueCount} />
        <Figure label="Playing areas" value={m.playingAreaCount} />
        <Figure label="Upcoming sessions" value={m.upcomingSessions} hint={m.upcomingSessions ? `${m.fillRate}% average fill` : undefined} />
        <Figure label="Settled revenue" value={inr(m.revenue)} />
        <Figure label="Open incidents" value={m.incidentCount} tone={m.incidentCount ? "warn" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Venues" sub={plural(detail.venues.length, "venue")} icon={<Building2 className="h-4 w-4" />}>
          {detail.venues.length === 0 ? (
            <div className="py-6 text-center">
              <p className="text-sm text-ink-mut">No venues in this city yet.</p>
              {canAddVenue && <LinkButton href={`/locations/venues/new?cityId=${detail.id}`} size="sm" className="mt-3">Add the first venue</LinkButton>}
            </div>
          ) : (
            <LinkRows empty="" rows={detail.venues.map((v) => ({ href: `/locations/venues/${v.id}`, title: v.name, meta: `${v.type} · ${plural(v.playingAreas, "playing area")} · safe capacity ${v.safetyCapacity}`, right: <StatusChip value={v.status} /> }))} />
          )}
        </Panel>
        <Panel title="Details">
          <DetailList
            rows={[
              { label: "Territory", value: detail.territory.name },
              { label: "Franchise", value: detail.territory.franchiseName },
              { label: "State", value: detail.state },
              { label: "Manager", value: detail.managerName },
              { label: "Launch date", value: detail.launchDate },
              { label: "Activities offered", value: detail.supportedCategories.length ? detail.supportedCategories.map(catName).join(", ") : "" },
              { label: "Notes", value: detail.notes },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Sessions" sub="Upcoming sessions in this city" icon={<CalendarClock className="h-4 w-4" />}>
        <LinkRows empty="No upcoming sessions in this city." rows={upcoming.slice(0, 10).map((s) => ({ href: `/missions/${s.id}`, title: s.title, meta: `${s.date} ${s.time} · ${s.venueName} · ${s.booked}/${s.capacity} booked`, right: <StatusChip value={s.status} /> }))} />
      </Panel>

      <Panel title="Recent changes" sub="From the audit log">
        <RecordActivity state={state} match={[detail.name]} />
      </Panel>

      <EditDrawer
        open={editing}
        onClose={() => setEditing(false)}
        title={`Edit ${detail.name}`}
        fields={fields}
        initial={{ ...detail }}
        onSave={(v) => {
          const { status: _s, territoryId: _t, ...patch } = cityFromValues({ ...v, territoryId: detail.territoryId, status: detail.status });
          void _s;
          void _t;
          const out = updateCity(detail.id, patch);
          feedback(out, "City updated");
          return out;
        }}
      />
      <StatusDialog
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title={`Change status — ${detail.name}`}
        current={detail.status}
        options={CITY_STATUS}
        onConfirm={(s, reason) => {
          const out = changeCityStatus(detail.id, s, reason);
          feedback(out, `City set to ${s}`);
          return out;
        }}
      />
    </PageShell>
  );
}
