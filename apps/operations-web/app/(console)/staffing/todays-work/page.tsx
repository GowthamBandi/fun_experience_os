"use client";

import { useMemo } from "react";
import { CalendarClock } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectSessionsForStaffing } from "@/lib/prototype/selectors/staff";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { StatusChip } from "@/components/ui/primitives";
import { EmptyPanel, LinkButton, PageShell } from "@/components/setup/kit";
import { StaffingNav, useStaffScope } from "@/components/staff/StaffingNav";
import { sessionDay } from "@/lib/prototype/services/staff";

export default function TodaysWorkPage() {
  const { state, canAccess } = useStore();
  const scope = useStaffScope();
  const today = sessionDay("Today");
  const sessions = useMemo(() => selectSessionsForStaffing(state, scope.territoryId).filter((s) => sessionDay(s.date) === today).sort((a, b) => a.startTime.localeCompare(b.startTime)), [state, scope.territoryId, today]);

  if (!canAccess("/staffing")) return <PermissionDenied module="Staffing" />;

  return (
    <PageShell>
      <PageHeader overline={`Staffing · ${scope.label}`} title="Today's work" sub="Every session running today and the people on it, in start-time order." />
      <StaffingNav />
      {sessions.length === 0 ? (
        <EmptyPanel icon={<CalendarClock className="h-5 w-5" />} title="No sessions today" line="Nothing is scheduled for today in this territory." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {sessions.map((s) => (
            <section key={s.sessionId} className="flex flex-col rounded-panel border border-edge bg-white shadow-panel">
              <header className="flex items-start justify-between gap-3 border-b border-edge px-5 py-4">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold text-ink-lum tabular">{s.startTime}</p>
                  <p className="truncate text-sm font-semibold text-ink-lum">{s.sessionTitle}</p>
                  <p className="truncate text-xs text-ink-mut">{s.venueName}</p>
                </div>
                <StatusChip value={s.isFullyStaffed ? "staffed" : "short"} tone={s.isFullyStaffed ? "ok" : "warn"} />
              </header>
              <ul className="flex-1 divide-y divide-slate-100 px-5">
                {s.slots.filter((x) => x.crewId || x.required).map((x) => (
                  <li key={x.slot} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="text-[13px] text-ink-mut">{x.label}</span>
                    {x.name ? (
                      <span className="flex items-center gap-2 text-sm font-medium text-ink-lum">{x.name} <StatusChip value={x.checkedIn ? "checked-in" : "expected"} /></span>
                    ) : (
                      <span className="text-sm font-medium text-amber-700">Not assigned</span>
                    )}
                  </li>
                ))}
              </ul>
              <footer className="flex gap-2 border-t border-edge px-5 py-3">
                <LinkButton href={`/staffing/assign?sessionId=${s.sessionId}`} size="sm" variant={s.isFullyStaffed ? "secondary" : "primary"}>{s.isFullyStaffed ? "Change staff" : "Assign staff"}</LinkButton>
                <LinkButton href="/staffing/check-in" size="sm" variant="ghost">Check-in</LinkButton>
              </footer>
            </section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
