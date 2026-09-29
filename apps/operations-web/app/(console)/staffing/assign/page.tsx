"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarClock, UserMinus, UserPlus, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectSessionsForStaffing, formatStaffRole } from "@/lib/prototype/selectors/staff";
import { STAFF_SLOTS, crewConflicts, type StaffSlot } from "@/lib/prototype/services/staff";
import { geoCan } from "@/lib/geo/access";
import { cn } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { Select } from "@/components/ui/fields";
import { useCommandFeedback } from "@/components/ui/toast";
import { ConfirmDialog, EmptyPanel, LinkButton, Notice, PageShell, Panel } from "@/components/setup/kit";
import { StaffingNav, useStaffScope } from "@/components/staff/StaffingNav";

function AssignStaff() {
  const params = useSearchParams();
  const router = useRouter();
  const { state, canAccess, role, assignCrewToSession, unassignCrewFromSession } = useStore();
  const feedback = useCommandFeedback();
  const scope = useStaffScope();
  const sessions = useMemo(() => selectSessionsForStaffing(state, scope.territoryId), [state, scope.territoryId]);
  const selectedId = params.get("sessionId") ?? sessions.find((s) => !s.isFullyStaffed)?.sessionId ?? sessions[0]?.sessionId;
  const summary = sessions.find((s) => s.sessionId === selectedId);
  const session = state.sessions.find((s) => s.id === selectedId);
  const [picks, setPicks] = useState<Partial<Record<StaffSlot, string>>>({});
  const [removing, setRemoving] = useState<StaffSlot | null>(null);

  if (!canAccess("/staffing")) return <PermissionDenied module="Staffing" />;
  const canAssign = geoCan(role.id, "assign-staff");

  const choose = (id: string) => {
    setPicks({});
    router.replace(`/staffing/assign?sessionId=${id}`);
  };

  const candidates = (slot: StaffSlot) => {
    if (!session) return [];
    const allowed = STAFF_SLOTS[slot].roles;
    return state.crew
      .filter((c) => c.territoryId === session.territoryId && (!allowed || allowed.includes(c.role)))
      .map((c) => {
        const conflicts = crewConflicts(state, c.id, session);
        const why = c.status === "off" ? "off today" : conflicts.length ? `busy on ${conflicts[0].id} at ${conflicts[0].startTime}` : "";
        return { id: c.id, label: `${c.name} — ${formatStaffRole(c.role)}${why ? ` (${why})` : ""}`, disabled: !!why };
      })
      .sort((a, b) => Number(a.disabled) - Number(b.disabled) || a.label.localeCompare(b.label));
  };

  return (
    <PageShell>
      <PageHeader overline={`Staffing · ${scope.label}`} title="Assign staff to sessions" sub="Pick a session, then fill its roles. Only people in the session's territory, with a suitable role and no overlapping session, can be chosen." />
      <StaffingNav />

      {sessions.length === 0 ? (
        <EmptyPanel icon={<CalendarClock className="h-5 w-5" />} title="No upcoming sessions to staff" line="Sessions appear here once they are scheduled and not in draft." actionHref={canAccess("/missions") ? "/missions/new" : undefined} actionLabel="Schedule a session" />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <Panel title="Upcoming sessions" sub={`${sessions.filter((s) => !s.isFullyStaffed).length} need staff`} bodyClassName="p-2">
            <ul className="max-h-[640px] space-y-1 overflow-y-auto">
              {sessions.map((s) => (
                <li key={s.sessionId}>
                  <button
                    onClick={() => choose(s.sessionId)}
                    aria-current={s.sessionId === selectedId}
                    className={cn("flex w-full items-start justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors", s.sessionId === selectedId ? "bg-brand-subtle ring-1 ring-brand/30" : "hover:bg-slate-50")}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink-lum">{s.sessionTitle}</span>
                      <span className="block truncate text-xs text-ink-mut">{s.date} {s.startTime} · {s.venueName}</span>
                    </span>
                    <StatusChip value={s.isFullyStaffed ? "staffed" : s.status === "missing" ? "no lead" : "incomplete"} tone={s.isFullyStaffed ? "ok" : s.status === "missing" ? "danger" : "warn"} />
                  </button>
                </li>
              ))}
            </ul>
          </Panel>

          {!summary || !session ? (
            <Panel title="Session not found">
              <p className="text-sm text-ink-mut">This session is not upcoming in {scope.label}. Choose one from the list.</p>
            </Panel>
          ) : (
            <Panel
              title={summary.sessionTitle}
              sub={`${summary.date} ${summary.startTime} · ${summary.venueName} · session ${summary.sessionId}`}
              icon={<Users className="h-4 w-4" />}
              right={canAccess("/missions") && <LinkButton href={`/missions/${summary.sessionId}`} variant="ghost" size="sm">Open session</LinkButton>}
            >
              {!canAssign && <Notice tone="info" className="mb-4">Your role can view staffing but not change it.</Notice>}
              {summary.missingRoles.length > 0 && <Notice tone="warn" className="mb-4">Missing: {summary.missingRoles.join(", ")}.</Notice>}
              <ul className="divide-y divide-slate-100">
                {summary.slots.map((slot) => {
                  const opts = candidates(slot.slot);
                  const pick = picks[slot.slot] ?? "";
                  return (
                    <li key={slot.slot} className="grid grid-cols-1 gap-3 py-4 md:grid-cols-[200px_minmax(0,1fr)] md:items-center">
                      <div>
                        <p className="text-sm font-semibold text-ink-lum">
                          {slot.label} {slot.required && <span className="text-xs font-medium text-ink-mut">· required</span>}
                        </p>
                        {slot.name ? (
                          <p className="mt-0.5 flex items-center gap-2 text-sm text-ink-sec">{slot.name} {slot.checkedIn && <StatusChip value="checked-in" />}</p>
                        ) : (
                          <p className={cn("mt-0.5 text-sm", slot.required ? "font-medium text-amber-700" : "text-ink-mut")}>Not assigned</p>
                        )}
                      </div>
                      {canAssign && (
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <Select aria-label={`Choose ${slot.label.toLowerCase()}`} value={pick} onChange={(e) => setPicks((p) => ({ ...p, [slot.slot]: e.target.value }))} className="sm:flex-1">
                            <option value="">{opts.length ? (slot.name ? "Replace with…" : "Choose a person…") : "No eligible staff in this territory"}</option>
                            {opts.map((o) => (
                              <option key={o.id} value={o.id} disabled={o.disabled || o.id === slot.crewId}>{o.label}</option>
                            ))}
                          </Select>
                          <div className="flex gap-2">
                            <Button
                              disabled={!pick}
                              onClick={() => {
                                const out = assignCrewToSession({ sessionId: summary.sessionId, crewId: pick, slot: slot.slot });
                                if (feedback(out, `${slot.label} assigned`, state.crew.find((c) => c.id === pick)?.name)) setPicks((p) => ({ ...p, [slot.slot]: "" }));
                              }}
                            >
                              <UserPlus className="h-4 w-4" /> {slot.name ? "Replace" : "Assign"}
                            </Button>
                            {slot.name && (
                              <Button variant="ghost" onClick={() => setRemoving(slot.slot)} aria-label={`Remove ${slot.label.toLowerCase()}`}>
                                <UserMinus className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {state.crew.filter((c) => c.territoryId === session.territoryId).length === 0 && (
                <Notice tone="info" className="mt-2" action={geoCan(role.id, "manage-staff") ? <LinkButton href="/people/staff/new" size="sm">Add staff</LinkButton> : undefined}>No staff are on the list for this territory yet.</Notice>
              )}
            </Panel>
          )}
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing ? STAFF_SLOTS[removing].label.toLowerCase() : ""}`}
        body={<>The role becomes empty{removing === "lead" ? " and the session cannot open until a new lead coordinator is assigned" : ""}. The person is freed for other sessions.</>}
        confirmLabel="Remove"
        tone="danger"
        reasonLabel="Reason (required)"
        onConfirm={(reason) => {
          const out = unassignCrewFromSession({ sessionId: summary!.sessionId, slot: removing!, reason });
          feedback(out, "Removed from session");
          return out;
        }}
      />
    </PageShell>
  );
}

export default function AssignStaffPage() {
  return (
    <Suspense fallback={null}>
      <AssignStaff />
    </Suspense>
  );
}
