"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { CalendarClock, Pencil, UserCheck, UserX } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectStaffMemberById } from "@/lib/prototype/selectors/staff";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { useCommandFeedback } from "@/components/ui/toast";
import { Crumbs, DetailList, Figure, LinkButton, LinkRows, NotFoundCard, Notice, PageShell, Panel } from "@/components/setup/kit";
import { EditDrawer } from "@/components/setup/form";
import { RecordActivity } from "@/components/setup/shared";
import { crewContactFields, crewCoreFields, crewFromValues } from "@/components/staff/schemas";

export default function StaffMemberPage() {
  const { id } = useParams<{ id: string }>();
  const { state, canAccess, role, updateCrewMember } = useStore();
  const feedback = useCommandFeedback();
  const member = useMemo(() => selectStaffMemberById(state, id), [state, id]);
  const raw = state.crew.find((c) => c.id === id);
  const [editing, setEditing] = useState(false);

  if (!canAccess("/people")) return <PermissionDenied module="People" />;
  if (!member || !raw) return <PageShell><NotFoundCard what="staff member" backHref="/people/staff" backLabel="All staff" /></PageShell>;
  const canManage = geoCan(role.id, "manage-staff");
  const canAssign = geoCan(role.id, "assign-staff") && canAccess("/staffing");

  return (
    <PageShell>
      <Crumbs items={[{ label: "People", href: "/people" }, { label: "Staff", href: "/people/staff" }, { label: member.name }]} />
      <PageHeader
        overline={`Staff · ${member.territoryName}`}
        title={member.name}
        sub={`${member.roleLabel} · based at ${member.venueName}`}
        right={
          <>
            <StatusChip value={member.status} />
            {canManage && <Button variant="secondary" onClick={() => setEditing(true)}><Pencil className="h-4 w-4" /> Edit</Button>}
            {canManage && member.status === "available" && <Button variant="secondary" onClick={() => feedback(updateCrewMember(id, { status: "off" }), `${member.name} marked off`)}><UserX className="h-4 w-4" /> Mark off</Button>}
            {canManage && member.status === "off" && <Button variant="secondary" onClick={() => feedback(updateCrewMember(id, { status: "available" }), `${member.name} marked available`)}><UserCheck className="h-4 w-4" /> Mark available</Button>}
            {canAssign && member.status !== "off" && <LinkButton href="/staffing/assign">Assign to a session</LinkButton>}
          </>
        }
      />
      {member.doubleBooked && <Notice tone="danger" title="Overlapping sessions">This person is staffed on two sessions that overlap in time. Reassign one of them.</Notice>}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label="Upcoming sessions" value={member.sessions.length} />
        <Figure label="Sessions worked" value={member.attendanceCount} hint="completed" />
        <Figure label="Shift" value={member.shiftFrom ? `${member.shiftFrom}–${member.shiftTo}` : "—"} />
        <Figure label="Territory" value={<span className="text-base">{member.territoryName}</span>} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Panel title="Upcoming sessions" icon={<CalendarClock className="h-4 w-4" />}>
          <LinkRows empty="Not assigned to any upcoming session." rows={member.sessions.map((s) => ({ href: canAccess("/staffing") ? `/staffing/assign?sessionId=${s.sessionId}` : "/people/staff", title: `${s.title} · ${s.date} ${s.startTime}`, meta: s.slotLabels.join(", "), right: <StatusChip value={s.status} /> }))} />
        </Panel>
        <Panel title="Contact and details">
          <DetailList
            rows={[
              { label: "Phone", value: member.phone ?? "" },
              { label: "Email", value: member.email ?? "" },
              { label: "Emergency contact", value: member.emergencyContact ?? "" },
              { label: "Skills", value: member.skills.join(", ") },
              { label: "Current assignment", value: member.assignment },
              { label: "City", value: member.cityName },
              { label: "Notes", value: member.notes ?? "" },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Recent changes" sub="From the audit log">
        <RecordActivity state={state} match={[member.name]} />
      </Panel>

      <EditDrawer
        open={editing}
        onClose={() => setEditing(false)}
        title={`Edit ${member.name}`}
        fields={[...crewCoreFields(state), ...crewContactFields()]}
        initial={{ name: raw.name, role: raw.role, territoryId: raw.territoryId, venueId: raw.venueId, skills: raw.skills ?? [], phone: raw.phone ?? "", email: raw.email ?? "", emergencyContact: raw.emergencyContact ?? "", notes: raw.notes ?? "" }}
        onSave={(v) => {
          const out = updateCrewMember(id, crewFromValues(v));
          feedback(out, "Staff member updated");
          return out;
        }}
      />
    </PageShell>
  );
}
