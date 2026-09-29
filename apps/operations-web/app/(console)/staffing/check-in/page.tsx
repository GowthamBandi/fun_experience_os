"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, RotateCcw, UserX, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectTodayStaffRoster } from "@/lib/prototype/selectors/staff";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { FilterRail, SearchInput } from "@/components/ui/fields";
import { useCommandFeedback } from "@/components/ui/toast";
import { ConfirmDialog, EmptyPanel, Notice, PageShell, Panel } from "@/components/setup/kit";
import { StaffingNav, useStaffScope } from "@/components/staff/StaffingNav";

const FILTERS = ["assigned", "checked-in", "available", "off"] as const;

export default function StaffCheckInPage() {
  const { state, canAccess, role, recordStaffAttendance } = useStore();
  const feedback = useCommandFeedback();
  const scope = useStaffScope();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number] | "all">("all");
  const [absent, setAbsent] = useState<string | null>(null);
  const roster = useMemo(() => selectTodayStaffRoster(state, scope.territoryId), [state, scope.territoryId]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return roster.filter((r) => (filter === "all" || r.status === filter) && (!q || `${r.name} ${r.roleLabel} ${r.venueName}`.toLowerCase().includes(q)));
  }, [roster, query, filter]);

  if (!canAccess("/staffing")) return <PermissionDenied module="Staffing" />;
  const canCheckIn = geoCan(role.id, "check-in-staff");
  const person = roster.find((r) => r.id === absent);
  const expected = roster.filter((r) => r.status === "assigned").length;
  const arrived = roster.filter((r) => r.status === "checked-in").length;

  return (
    <PageShell>
      <PageHeader overline={`Staffing · ${scope.label}`} title="Staff check-in" sub="Record arrivals for today's shifts. Marking someone absent removes them from today's sessions so the gaps show up for reassignment." />
      <StaffingNav />
      <Notice tone="info">QR badge scanning is not connected. Check staff in from this list as they arrive.</Notice>

      {roster.length === 0 ? (
        <EmptyPanel icon={<Users className="h-5 w-5" />} title="No staff in this territory" line="Add staff and assign them to sessions; they will appear here for check-in." actionHref="/people/staff/new" actionLabel="Add staff" />
      ) : (
        <Panel
          title={`${arrived} of ${arrived + expected} arrived`}
          sub={expected ? `${expected} still expected` : "Everyone assigned has arrived"}
          right={<div className="w-full sm:w-72"><SearchInput value={query} onChange={setQuery} placeholder="Search name, role or venue" /></div>}
        >
          <div className="mb-4"><FilterRail options={FILTERS} value={filter} onChange={setFilter} /></div>
          {rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-mut">No one matches.</p>
          ) : (
            <ul className="divide-y divide-slate-100">
              {rows.map((r) => (
                <li key={r.id} className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink-lum">{r.name} <StatusChip value={r.status} /></p>
                    <p className="text-[13px] text-ink-mut">{r.roleLabel} · {r.venueName}{r.shiftFrom ? ` · shift ${r.shiftFrom}–${r.shiftTo}` : ""}</p>
                    {r.sessions.length > 0 && <p className="text-xs text-ink-sec">{r.sessions.map((s) => `${s.slotLabels.join(" & ")} — ${s.title} ${s.date} ${s.startTime}`).join(" · ")}</p>}
                  </div>
                  {canCheckIn && (
                    <div className="flex shrink-0 flex-wrap gap-2">
                      {r.status === "assigned" && (
                        <>
                          <Button size="sm" variant="success" onClick={() => feedback(recordStaffAttendance({ crewId: r.id, action: "check-in" }), `${r.name} checked in`)}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Check in
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => setAbsent(r.id)}>
                            <UserX className="h-3.5 w-3.5" /> Absent
                          </Button>
                        </>
                      )}
                      {r.status === "checked-in" && (
                        <Button size="sm" variant="ghost" onClick={() => feedback(recordStaffAttendance({ crewId: r.id, action: "undo-check-in" }), `Check-in reversed for ${r.name}`)}>
                          <RotateCcw className="h-3.5 w-3.5" /> Undo
                        </Button>
                      )}
                      {r.status === "available" && <span className="text-xs text-ink-mut">Not assigned today</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <ConfirmDialog
        open={!!person}
        onClose={() => setAbsent(null)}
        title={`Mark ${person?.name ?? ""} absent`}
        body={
          <>
            {person?.name} is marked off for today{person && person.sessions.length ? <> and removed from: <strong>{person.sessions.map((s) => `${s.slotLabels.join(" & ")} on ${s.title}`).join("; ")}</strong>. Reassign those roles on the Assign page.</> : "."}
          </>
        }
        confirmLabel="Mark absent"
        tone="danger"
        reasonLabel="Reason (required)"
        onConfirm={(reason) => {
          const out = recordStaffAttendance({ crewId: absent!, action: "absent", reason });
          feedback(out, `${person?.name} marked absent`, "Their roles today are now open.");
          return out;
        }}
      />
    </PageShell>
  );
}
