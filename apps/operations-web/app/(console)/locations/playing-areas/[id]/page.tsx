"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarClock, Pencil, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/store";
import { playingAreaDetail } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { useCommandFeedback } from "@/components/ui/toast";
import { Crumbs, DetailList, Figure, LinkRows, NotFoundCard, Notice, PageShell, Panel, StatusDialog } from "@/components/setup/kit";
import { EditDrawer } from "@/components/setup/form";
import { RecordActivity } from "@/components/setup/shared";
import { PLAYING_AREA_STATUS, playingAreaFields, playingAreaFromValues } from "@/components/setup/schemas";

export default function PlayingAreaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, canAccess, role, updatePlayingArea, changePlayingAreaStatus } = useStore();
  const feedback = useCommandFeedback();
  const detail = useMemo(() => playingAreaDetail(state, id), [state, id]);
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  if (!canAccess("/locations")) return <PermissionDenied module="Playing areas" />;
  if (!detail) return <PageShell><NotFoundCard what="playing area" backHref="/locations/playing-areas" backLabel="All playing areas" /></PageShell>;

  const canManage = geoCan(role.id, "manage-playing-area");
  const catName = (cid: string) => state.categories.find((c) => c.id === cid)?.name ?? cid;
  const upcoming = detail.sessions.filter((s) => !["cancelled", "completed", "archived"].includes(s.status));
  const past = detail.sessions.filter((s) => ["completed", "cancelled", "archived"].includes(s.status));

  return (
    <PageShell>
      <Crumbs items={[{ label: "Setup", href: "/setup" }, { label: detail.venue.name, href: `/locations/venues/${detail.venue.id}` }, { label: detail.name }]} />
      <PageHeader
        overline={`Playing area · ${detail.venue.name} · ${detail.cityName}`}
        title={detail.name}
        sub={detail.activityCompatibility.map(catName).join(", ") || "No activities set"}
        right={
          <>
            <StatusChip value={detail.status} />
            {canManage && (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>
                <Button variant="secondary" onClick={() => setStatusOpen(true)}><RefreshCw className="h-4 w-4" /> Change status</Button>
              </>
            )}
          </>
        }
      />
      {detail.warnings.map((w) => <Notice key={w} tone="warn">{w}</Notice>)}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="Maximum participants" value={detail.maxCapacity} />
        <Figure label="Staff needed" value={detail.staffCapacity} />
        <Figure label="Spectators allowed" value={detail.spectatorCapacity} />
        <Figure label="Upcoming sessions" value={upcoming.length} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Details">
          <DetailList
            rows={[
              { label: "Venue", value: detail.venue.name },
              { label: "City", value: detail.cityName },
              { label: "Territory", value: detail.territoryName },
              { label: "Operating hours", value: detail.operatingHours },
              { label: "Activities", value: detail.activityCompatibility.map(catName).join(", ") },
              { label: "Equipment", value: detail.equipment.join(", ") },
              { label: "Rules", value: detail.restrictions },
            ]}
          />
        </Panel>
        <Panel title="Sessions" sub={`${upcoming.length} upcoming · ${past.length} past`} icon={<CalendarClock className="h-4 w-4" />}>
          <LinkRows empty="No sessions use this area yet." rows={[...upcoming, ...past].slice(0, 10).map((s) => ({ href: `/missions/${s.id}`, title: s.title, meta: `${s.date} ${s.time} · ${s.booked}/${s.capacity} booked`, right: <StatusChip value={s.status} /> }))} />
        </Panel>
      </div>

      <Panel title="Recent changes" sub="From the audit log">
        <RecordActivity state={state} match={[`"${detail.name}"`]} />
      </Panel>

      <EditDrawer
        open={editing}
        onClose={() => setEditing(false)}
        title={`Edit ${detail.name}`}
        fields={playingAreaFields(state, detail.venueId, true)}
        initial={{ ...detail }}
        onSave={(v) => {
          const { status: _s, venueId: _v, ...patch } = playingAreaFromValues(v, detail.venueId);
          void _s; void _v;
          const out = updatePlayingArea(detail.id, patch);
          feedback(out, "Playing area updated");
          return out;
        }}
      />
      <StatusDialog
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title={`Change status — ${detail.name}`}
        current={detail.status}
        options={PLAYING_AREA_STATUS}
        onConfirm={(s, reason) => {
          const out = changePlayingAreaStatus(detail.id, s, reason);
          feedback(out, `Playing area set to ${s}`);
          return out;
        }}
      />
    </PageShell>
  );
}
