"use client";

import { useMemo } from "react";
import { CalendarX2, ShieldAlert, ShieldCheck, UserX, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectDoubleAssignedStaff, selectEventsMissingCoordinator, selectEventsMissingSafety, selectStaffDirectory, selectStaffHealth, sessionLabel } from "@/lib/prototype/selectors/staff";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { StatusChip } from "@/components/ui/primitives";
import { LinkRows, Notice, PageShell, Panel } from "@/components/setup/kit";
import { StaffingNav, useStaffScope } from "@/components/staff/StaffingNav";

export default function StaffHealthPage() {
  const { state, canAccess } = useStore();
  const scope = useStaffScope();
  const health = useMemo(() => selectStaffHealth(state, scope.territoryId), [state, scope.territoryId]);
  const noLead = useMemo(() => selectEventsMissingCoordinator(state, scope.territoryId), [state, scope.territoryId]);
  const noSafety = useMemo(() => selectEventsMissingSafety(state, scope.territoryId), [state, scope.territoryId]);
  const overlaps = useMemo(() => selectDoubleAssignedStaff(state, scope.territoryId), [state, scope.territoryId]);
  const staff = useMemo(() => selectStaffDirectory(state, scope.territoryId), [state, scope.territoryId]);

  if (!canAccess("/staffing")) return <PermissionDenied module="Staffing" />;
  const venueName = (id: string) => state.venues.find((v) => v.id === id)?.name ?? id;
  const sessionRow = (s: (typeof noLead)[number]) => ({ href: `/staffing/assign?sessionId=${s.id}`, title: `${sessionLabel(state, s)} · ${s.date} ${s.startTime}`, meta: venueName(s.venueId), right: <StatusChip value={s.status} /> });

  return (
    <PageShell>
      <PageHeader overline={`Staffing · ${scope.label}`} title="Staffing health" sub="Gaps and risks in upcoming staffing, with a link to fix each one." />
      <StaffingNav />
      <Notice tone={health.status === "ready" || health.status === "empty" ? "ok" : health.status === "blocked" ? "danger" : "warn"} title={health.label} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="No lead coordinator" value={noLead.length} icon={<CalendarX2 className="h-4 w-4" />} tone={noLead.length ? "rose" : "emerald"} detail="sessions blocked from opening" />
        <MetricTile label="No safety contact" value={noSafety.length} icon={<ShieldAlert className="h-4 w-4" />} tone={noSafety.length ? "amber" : "emerald"} detail="where the experience requires one" />
        <MetricTile label="Overlapping" value={overlaps.length} icon={<Users className="h-4 w-4" />} tone={overlaps.length ? "rose" : "emerald"} detail="people on two sessions at once" />
        <MetricTile label="Safety officers" value={health.safetyStaffCount} icon={<ShieldCheck className="h-4 w-4" />} tone="sky" detail={`${health.leadCoordinatorCount} coordinators on the list`} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Sessions without a lead coordinator" icon={<CalendarX2 className="h-4 w-4" />}>
          <LinkRows empty="Every upcoming session has a lead coordinator." rows={noLead.map(sessionRow)} />
        </Panel>
        <Panel title="Sessions without a safety contact" icon={<ShieldAlert className="h-4 w-4" />}>
          <LinkRows empty="Every session that needs a safety contact has one." rows={noSafety.map(sessionRow)} />
        </Panel>
        <Panel title="People on overlapping sessions" icon={<Users className="h-4 w-4" />}>
          <LinkRows empty="No overlapping assignments." rows={overlaps.map((p) => ({ href: `/people/staff/${p.id}`, title: p.name, meta: p.sessions.map((s) => `${s.date} ${s.startTime} ${s.title}`).join(" · "), right: <StatusChip value="overlapping" tone="danger" /> }))} />
        </Panel>
        <Panel title="Off today" icon={<UserX className="h-4 w-4" />}>
          <LinkRows empty="No one is off." rows={staff.filter((s) => s.status === "off").map((p) => ({ href: `/people/staff/${p.id}`, title: p.name, meta: `${p.roleLabel} · ${p.venueName}`, right: <StatusChip value="off" /> }))} />
        </Panel>
      </div>
    </PageShell>
  );
}
