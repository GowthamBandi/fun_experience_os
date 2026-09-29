"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Building2, CalendarClock, MapPin, Pencil, Plus, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/store";
import { territoryDetail } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { useCommandFeedback } from "@/components/ui/toast";
import { Crumbs, DetailList, Figure, LinkButton, LinkRows, NotFoundCard, Notice, PageShell, Panel, StatusDialog, plural } from "@/components/setup/kit";
import { EditDrawer } from "@/components/setup/form";
import { RecordActivity } from "@/components/setup/shared";
import { TERRITORY_STATUS, territoryFromValues, territorySteps } from "@/components/setup/schemas";

export default function TerritoryDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, canAccess, role, updateTerritory, changeTerritoryStatus } = useStore();
  const feedback = useCommandFeedback();
  const detail = useMemo(() => territoryDetail(state, id), [state, id]);
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  if (!canAccess("/territories")) return <PermissionDenied module="Territories" />;
  if (!detail) return <PageShell><NotFoundCard what="territory" backHref="/territories" backLabel="All territories" /></PageShell>;

  const canManage = geoCan(role.id, "manage-territory");
  const canAddCity = geoCan(role.id, "create-city") && detail.status !== "disabled";
  const m = detail.metrics;
  const fields = territorySteps(state, true).flatMap((s) => s.fields).filter((f) => f.key !== "franchiseId");
  const upcoming = detail.sessions.filter((s) => (s.date === "Today" || s.date === "Tomorrow") && !["cancelled", "completed", "archived"].includes(s.status));

  return (
    <PageShell>
      <Crumbs items={[{ label: "Setup", href: "/setup" }, { label: detail.franchise.name, href: `/franchises/${detail.franchise.id}` }, { label: detail.name }]} />
      <PageHeader
        overline={`Territory · ${detail.state}${detail.region ? ` · ${detail.region}` : ""}`}
        title={detail.name}
        sub={`Managed by ${detail.managerName} · ${detail.timezone} · ${detail.currency}`}
        right={
          <>
            <StatusChip value={detail.status} />
            {canManage && (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button variant="secondary" onClick={() => setStatusOpen(true)}>
                  <RefreshCw className="h-4 w-4" /> Change status
                </Button>
              </>
            )}
            {canAddCity && (
              <LinkButton href={`/cities/new?territoryId=${detail.id}`}>
                <Plus className="h-4 w-4" /> Add city
              </LinkButton>
            )}
          </>
        }
      />

      {detail.warnings.map((w) => (
        <Notice key={w} tone="warn">{w}</Notice>
      ))}
      {detail.cities.length === 0 && (
        <Notice tone="info" title="No cities yet" action={canAddCity ? <LinkButton href={`/cities/new?territoryId=${detail.id}`} size="sm">Add city</LinkButton> : undefined}>
          Add a city to start adding venues in this territory.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Figure label="Cities" value={m.cityCount} />
        <Figure label="Venues" value={m.venueCount} hint={plural(m.playingAreaCount, "playing area")} />
        <Figure label="Upcoming sessions" value={m.upcomingSessions} hint={m.upcomingSessions ? `${m.fillRate}% average fill` : undefined} />
        <Figure label="Staff available" value={`${m.staffingHealth}%`} tone={m.staffingHealth <= 50 ? "danger" : m.staffingHealth <= 75 ? "warn" : "ok"} />
        <Figure label="Settled revenue" value={inr(m.revenue)} />
        <Figure label="Safety signals" value={m.safetySignals} tone={m.safetySignals ? "warn" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Cities" sub={plural(detail.cities.length, "city", "cities")} icon={<MapPin className="h-4 w-4" />}>
          <LinkRows
            empty="No cities yet."
            rows={detail.cities.map((c) => ({ href: `/cities/${c.id}`, title: c.name, meta: `${plural(c.venues, "venue")} · ${plural(c.playingAreas, "playing area")} · Manager: ${c.managerName}`, right: <StatusChip value={c.status} /> }))}
          />
        </Panel>
        <Panel title="Venues" sub={plural(detail.venues.length, "venue")} icon={<Building2 className="h-4 w-4" />}>
          <LinkRows
            empty="No venues yet."
            rows={detail.venues.map((v) => ({ href: `/locations/venues/${v.id}`, title: v.name, meta: `${v.cityName} · ${plural(v.playingAreas, "playing area")} · safe capacity ${v.safetyCapacity}`, right: <StatusChip value={v.status} /> }))}
          />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Details">
          <DetailList
            rows={[
              { label: "Franchise", value: detail.franchise.name },
              { label: "Type", value: <span className="capitalize">{detail.type}</span> },
              { label: "State", value: detail.state },
              { label: "Region", value: detail.region },
              { label: "Manager", value: detail.managerName },
              { label: "Time zone", value: detail.timezone },
              { label: "Currency", value: detail.currency },
              { label: "Operations contact", value: detail.contactInfo },
              { label: "Notes", value: detail.notes },
            ]}
          />
        </Panel>
        <Panel title="Upcoming sessions" sub="Today and tomorrow" icon={<CalendarClock className="h-4 w-4" />}>
          <LinkRows
            empty="No sessions today or tomorrow."
            rows={upcoming.slice(0, 8).map((s) => ({ href: `/missions/${s.id}`, title: s.title, meta: `${s.date} ${s.time} · ${s.venueName} · ${s.booked}/${s.capacity} booked`, right: <StatusChip value={s.status} /> }))}
          />
        </Panel>
      </div>

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
          const { status: _s, franchiseId: _f, ...patch } = territoryFromValues({ ...v, franchiseId: detail.franchiseId });
          void _s;
          void _f;
          const out = updateTerritory(detail.id, patch);
          feedback(out, "Territory updated");
          return out;
        }}
      />
      <StatusDialog
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title={`Change status — ${detail.name}`}
        current={detail.status}
        options={TERRITORY_STATUS}
        onConfirm={(s, reason) => {
          const out = changeTerritoryStatus(detail.id, s, reason);
          feedback(out, `Territory set to ${s}`);
          return out;
        }}
      />
    </PageShell>
  );
}
