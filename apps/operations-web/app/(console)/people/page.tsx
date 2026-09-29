"use client";

import { useMemo } from "react";
import { ArrowRight, CalendarClock, Ticket, UserCheck, UserPlus, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectParticipantDirectory, selectStaffHealth } from "@/lib/prototype/selectors/staff";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { LinkButton, PageShell } from "@/components/setup/kit";
import { StaffHelpPanel } from "@/components/staff";

export default function PeoplePage() {
  const { state, canAccess, role } = useStore();
  const health = useMemo(() => selectStaffHealth(state), [state]);
  const participants = useMemo(() => selectParticipantDirectory(state), [state]);
  if (!canAccess("/people")) return <PermissionDenied module="People" />;
  const canManage = geoCan(role.id, "manage-staff");

  const cards = [
    { href: "/people/staff", title: "Staff", line: "Coordinators, safety officers and floor staff: contact details, home venue and upcoming sessions.", icon: Users, count: health.totalStaff },
    { href: "/people/participants", title: "Participants", line: "Customers who booked sessions, shown by temporary identity until reveal.", icon: Ticket, count: participants.length },
  ].filter((c) => canAccess(c.href));

  return (
    <PageShell>
      <PageHeader
        overline="Operations"
        title="People"
        sub="The staff who run your sessions and the participants who book them."
        right={canManage && <LinkButton href="/people/staff/new"><UserPlus className="h-4 w-4" /> Add staff</LinkButton>}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Staff" value={health.totalStaff} detail={`${health.availableCount} available`} icon={<Users className="h-4 w-4" />} />
        <MetricTile label="Working" value={health.workingToday} detail={`${health.checkedInCount} checked in`} icon={<UserCheck className="h-4 w-4" />} tone="emerald" />
        <MetricTile label="Participants" value={participants.length} detail={`${participants.filter((p) => p.isCheckedIn).length} checked in`} icon={<Ticket className="h-4 w-4" />} tone="pink" />
        <MetricTile label="Sessions short of staff" value={health.eventsMissingStaffCount} detail="missing a lead or safety contact" icon={<CalendarClock className="h-4 w-4" />} tone="amber" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <div key={c.href} className="flex flex-col justify-between gap-5 rounded-panel border border-edge bg-white p-6 shadow-panel">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-subtle text-brand"><c.icon className="h-5 w-5" /></span>
              <div>
                <h2 className="font-display text-lg font-bold text-ink-lum">{c.title} <span className="ml-1 text-ink-mut tabular">{c.count}</span></h2>
                <p className="mt-1 text-sm leading-6 text-ink-mut">{c.line}</p>
              </div>
            </div>
            <div><LinkButton href={c.href} variant="secondary">Open {c.title.toLowerCase()} <ArrowRight className="h-4 w-4" /></LinkButton></div>
          </div>
        ))}
      </div>
      <StaffHelpPanel />
    </PageShell>
  );
}
