"use client";

import { useMemo } from "react";
import { ArrowRight, CalendarClock, ShieldAlert, UserCheck, UserPlus, Users, UserX } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectSessionsForStaffing, selectStaffHealth, selectStaffNextAction, selectTodayStaffRoster } from "@/lib/prototype/selectors/staff";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { StatusChip } from "@/components/ui/primitives";
import { EmptyPanel, LinkButton, LinkRows, Notice, PageShell, Panel } from "@/components/setup/kit";
import { StaffingNav, useStaffScope } from "@/components/staff/StaffingNav";

export default function StaffingPage() {
  const { state, canAccess, role } = useStore();
  const scope = useStaffScope();
  const health = useMemo(() => selectStaffHealth(state, scope.territoryId), [state, scope.territoryId]);
  const next = useMemo(() => selectStaffNextAction(state, scope.territoryId), [state, scope.territoryId]);
  const sessions = useMemo(() => selectSessionsForStaffing(state, scope.territoryId), [state, scope.territoryId]);
  const roster = useMemo(() => selectTodayStaffRoster(state, scope.territoryId), [state, scope.territoryId]);

  if (!canAccess("/staffing")) return <PermissionDenied module="Staffing" />;
  const canAssign = geoCan(role.id, "assign-staff");
  const canManage = geoCan(role.id, "manage-staff");
  const needing = sessions.filter((s) => !s.isFullyStaffed);

  return (
    <PageShell>
      <PageHeader
        overline={`Operations · ${scope.label}`}
        title="Staffing"
        sub="Who is working which session. Every upcoming session needs a lead coordinator and, when its experience requires one, a safety contact."
        right={
          <>
            {canManage && <LinkButton href="/people/staff/new" variant="secondary"><UserPlus className="h-4 w-4" /> Add staff</LinkButton>}
            {canAssign && <LinkButton href="/staffing/assign">Assign staff <ArrowRight className="h-4 w-4" /></LinkButton>}
          </>
        }
      />
      <StaffingNav />

      {health.status === "empty" ? (
        <EmptyPanel icon={<Users className="h-5 w-5" />} title="No staff yet" line="Add the coordinators, safety officers and floor staff who run your sessions. You can then assign them to sessions and check them in." actionHref={canManage ? "/people/staff/new" : undefined} actionLabel="Add the first staff member" />
      ) : (
        <>
          <Notice
            tone={health.status === "ready" ? "ok" : health.status === "blocked" ? "danger" : "warn"}
            title={health.label}
            action={<LinkButton href={next.href} size="sm" variant={health.status === "ready" ? "secondary" : "primary"}>{next.label}</LinkButton>}
          >
            {next.detail}
          </Notice>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricTile label="Staff" value={health.totalStaff} detail={`${health.availableCount} available · ${health.offCount} off`} icon={<Users className="h-4 w-4" />} />
            <MetricTile label="Working" value={health.workingToday} detail={`${health.checkedInCount} checked in`} icon={<UserCheck className="h-4 w-4" />} tone="emerald" />
            <MetricTile label="Sessions short of staff" value={needing.length} detail={`of ${sessions.length} upcoming`} icon={<CalendarClock className="h-4 w-4" />} tone={needing.length ? "amber" : "sky"} />
            <MetricTile label="Overlapping assignments" value={health.doubleAssignedCount} detail="people on two sessions at once" icon={<ShieldAlert className="h-4 w-4" />} tone={health.doubleAssignedCount ? "rose" : "violet"} />
          </div>

          <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
            <Panel title="Sessions that need staff" sub={needing.length ? "Assign the missing roles" : "Every upcoming session is staffed"} icon={<CalendarClock className="h-4 w-4" />}>
              <LinkRows
                empty="Nothing to do here."
                rows={needing.slice(0, 10).map((s) => ({
                  href: `/staffing/assign?sessionId=${s.sessionId}`,
                  title: `${s.sessionTitle} · ${s.date} ${s.startTime}`,
                  meta: `${s.venueName} · Missing: ${s.missingRoles.join(", ")}`,
                  right: <StatusChip value={s.status === "missing" ? "no lead" : "incomplete"} tone={s.status === "missing" ? "danger" : "warn"} />,
                }))}
              />
            </Panel>
            <Panel title="People on shift" sub="Assigned or checked in" icon={<UserCheck className="h-4 w-4" />} right={<LinkButton href="/staffing/check-in" size="sm" variant="ghost">Check-in <ArrowRight className="h-3.5 w-3.5" /></LinkButton>}>
              <LinkRows
                empty="No one is assigned yet."
                rows={roster
                  .filter((r) => r.status === "assigned" || r.status === "checked-in")
                  .slice(0, 10)
                  .map((r) => ({ href: `/people/staff/${r.id}`, title: r.name, meta: `${r.roleLabel} · ${r.currentSessionTitle ?? r.assignment}`, right: <StatusChip value={r.status} /> }))}
              />
            </Panel>
          </div>
          {roster.some((r) => r.status === "off") && (
            <Panel title="Off today" icon={<UserX className="h-4 w-4" />}>
              <div className="flex flex-wrap gap-2">
                {roster.filter((r) => r.status === "off").map((r) => <LinkButton key={r.id} href={`/people/staff/${r.id}`} variant="secondary" size="sm">{r.name}</LinkButton>)}
              </div>
            </Panel>
          )}
        </>
      )}
    </PageShell>
  );
}
