"use client";

import { useMemo } from "react";
import Link from "next/link";
import { ArrowRight, CalendarClock, KeyRound, ShieldCheck, Users } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectLiveSessionState } from "@/lib/prototype/selectors/liveSession";
import { selectSessionIdentitySummary } from "@/lib/prototype/selectors/identity";
import { selectTeamAllocationReadiness } from "@/lib/prototype/selectors/teams";
import { selectCheckInSummary, selectStaffReadiness } from "@/lib/prototype/selectors/checkIn";
import { selectResultsProgress } from "@/lib/prototype/selectors/results";
import { selectCompletionChecklist } from "@/lib/prototype/selectors/completion";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { fillRate } from "@/lib/format";
import { Button, FillMeter, StatusChip } from "@/components/ui/primitives";
import { MetricTile } from "@/components/ui/panels";
import { CheckRow, MissionShell, MissionStageStepper, WorkspaceCard, formatWhen, useMissionId, useOperatorName } from "@/components/missions/shared";

export default function SessionOverviewPage() {
  return (
    <MissionShell tab="overview">
      <OverviewBody />
    </MissionShell>
  );
}

function OverviewBody() {
  const sessionId = useMissionId();
  const { state } = useStore();
  const opName = useOperatorName();

  const d = useMemo(() => {
    const session = state.sessions.find((s) => s.id === sessionId)!;
    return {
      session,
      lss: selectLiveSessionState(state, sessionId),
      ids: selectSessionIdentitySummary(state, sessionId),
      teams: selectTeamAllocationReadiness(state, sessionId),
      checkIn: selectCheckInSummary(state, sessionId),
      staff: selectStaffReadiness(state, sessionId),
      results: selectResultsProgress(state, sessionId),
      checklist: selectCompletionChecklist(state, sessionId),
      ledger: sessionCapacityLedger(state, sessionId),
      activity: state.audits.filter((a) => a.sessionId === sessionId).slice(0, 8),
    };
  }, [state, sessionId]);

  const { session, lss, ids, teams, checkIn, staff, results, checklist, ledger } = d;
  const revealed = ["revealed", "check-in-open", "live", "completed"].includes(session.status);
  const checkInOpen = ["check-in-open", "live", "completed"].includes(session.status);
  const joined = ledger.confirmedPaidBookings + ledger.confirmedComplimentaryBookings;

  const next = (() => {
    const base = `/missions/${sessionId}`;
    if (session.status === "cancelled") return { title: "This session was cancelled", line: "No further operations are possible.", href: `${base}/bookings`, cta: "Review bookings" };
    if (lss.status === "Completed" || session.status === "completed") return { title: "Session completed", line: "The report is ready to share or print.", href: `${base}/summary`, cta: "Open report" };
    if (lss.status === "Ended") {
      return results.isComplete
        ? { title: "Finish the session", line: checklist.isReadyToComplete ? "Every check has passed." : `${checklist.criticalBlockers.length} item(s) still need attention.`, href: `${base}/completion`, cta: "Go to Finish" }
        : { title: "Confirm the results", line: `${results.requiredCount - results.confirmedCount} scored step(s) still need a confirmed result.`, href: `${base}/results`, cta: "Go to Results" };
    }
    if (lss.status !== "Ready") return { title: "The session is running", line: `Status: ${lss.status.toLowerCase()}. Use the Run tab for the clock, steps, equipment and notes.`, href: `${base}/live`, cta: "Go to Run" };
    if (joined === 0) return { title: "Waiting for bookings", line: "Nobody holds a confirmed place yet.", href: `${base}/bookings`, cta: "Open bookings" };
    if (!ids.isFullyLocked) return { title: "Generate and lock participant codes", line: `${ids.lockedCount} of ${ids.eligibleCount} codes locked.`, href: `${base}/participants`, cta: "Go to Codes" };
    if (!teams.isLocked) return { title: "Build and lock teams", line: teams.unassignedCount ? `${teams.unassignedCount} participant(s) have no team.` : "Every participant has a team; lock them to continue.", href: `${base}/teams`, cta: "Go to Teams" };
    if (!revealed) return { title: "Reveal teams to participants", line: "Check the reveal checklist, then send the reveal.", href: `${base}/reveal`, cta: "Go to Reveal" };
    if (!checkInOpen) return { title: "Open door check-in", line: "Start the door list so arrivals can be recorded.", href: `${base}/check-in`, cta: "Go to Check-in" };
    return { title: "Start the session", line: `${checkIn.presentCount} of ${checkIn.expectedCount} participants present.`, href: `${base}/live`, cta: "Go to Run" };
  })();

  return (
    <div className="space-y-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-panel border border-brand/20 bg-gradient-to-r from-brand-subtle to-white p-5 shadow-panel">
        <div className="min-w-0">
          <p className="eyebrow text-brand">Next step</p>
          <p className="mt-1 font-display text-xl font-bold text-ink-lum">{next.title}</p>
          <p className="mt-1 text-sm text-ink-sec">{next.line}</p>
        </div>
        <Link href={next.href}>
          <Button>
            {next.cta} <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </section>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <MetricTile label="Codes locked" value={`${ids.lockedCount + ids.revealedCount}/${ids.eligibleCount}`} detail={ids.missingIdentityCount ? `${ids.missingIdentityCount} without a code` : "Everyone has a code"} icon={<KeyRound className="h-4 w-4" />} tone={ids.isFullyLocked ? "emerald" : "amber"} />
        <MetricTile label="Teams" value={teams.teamsCount} detail={teams.unassignedCount ? `${teams.unassignedCount} participant(s) without a team` : teams.isLocked ? "Locked" : "Everyone placed"} icon={<Users className="h-4 w-4" />} tone={teams.unassignedCount ? "amber" : "violet"} />
        <MetricTile label="Present" value={`${checkIn.presentCount}`} detail={`${checkIn.lateCount} late · ${checkIn.noShowCount} no-show`} icon={<ShieldCheck className="h-4 w-4" />} tone="emerald" />
        <MetricTile label="Starts" value={session.startTime} detail={`${session.date} · ${session.duration} min`} icon={<CalendarClock className="h-4 w-4" />} tone="sky" />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <WorkspaceCard title="Preparation" sub="Everything that must be true before the doors open.">
          <ul className="divide-y divide-edge">
            <CheckRow passed={joined >= session.minParticipants} warning={joined > 0} label="Minimum bookings reached" detail={`${joined} booked, ${session.minParticipants} needed.`} />
            <CheckRow
              passed={ids.isFullyLocked}
              warning={ids.generatedCount > 0}
              label="Participant codes locked"
              detail={`${ids.generatedCount} generated · ${ids.lockedCount + ids.revealedCount} locked of ${ids.eligibleCount}.`}
              action={<TabLink href={`/missions/${sessionId}/participants`} label="Codes" />}
            />
            <CheckRow
              passed={teams.isLocked || revealed}
              warning={teams.teamsCount > 0}
              label="Teams built and locked"
              detail={teams.teamsCount ? `${teams.teamsCount} teams · ${teams.unassignedCount} unassigned.` : "No teams yet."}
              action={<TabLink href={`/missions/${sessionId}/teams`} label="Teams" />}
            />
            <CheckRow passed={revealed} label="Reveal sent" detail={revealed ? "Participants can see their team and code." : `Scheduled for ${session.revealAt}.`} action={<TabLink href={`/missions/${sessionId}/reveal`} label="Reveal" />} />
            <CheckRow
              passed={!!staff.leadCoordinator && !!staff.safetyContact}
              label="Lead coordinator and safety contact assigned"
              detail={`Lead: ${staff.leadCoordinator?.name ?? "not assigned"} · Safety: ${staff.safetyContact?.name ?? "not assigned"}`}
            />
            <CheckRow passed={checkInOpen} label="Door check-in open" detail={checkInOpen ? `${checkIn.presentCount} present, ${checkIn.awaitingCount} not yet marked.` : "Opens after the reveal."} action={<TabLink href={`/missions/${sessionId}/check-in`} label="Check-in" />} />
          </ul>
        </WorkspaceCard>

        <div className="space-y-6">
          <WorkspaceCard title="On the day" sub="Run the session, record results, then finish and lock it.">
            <MissionStageStepper layout="column" />
          </WorkspaceCard>

          <WorkspaceCard title="Attendance">
            <div className="space-y-4">
              <Meter label="Seats booked" value={fillRate(joined, ledger.sellableCapacity)} detail={`${joined}/${ledger.sellableCapacity}`} />
              <Meter label="Arrived" value={checkIn.expectedCount ? Math.round((checkIn.presentCount / checkIn.expectedCount) * 100) : 0} detail={`${checkIn.presentCount}/${checkIn.expectedCount}`} />
            </div>
          </WorkspaceCard>
        </div>
      </div>

      <WorkspaceCard title="Recent activity" sub="Latest recorded actions on this session." bodyClassName="p-0">
        {d.activity.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-ink-mut">Nothing recorded for this session yet.</p>
        ) : (
          <ul className="divide-y divide-edge">
            {d.activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink-lum">{a.description}</p>
                  <p className="mt-0.5 text-xs text-ink-mut">{opName(a.operatorId)}</p>
                </div>
                <span className="whitespace-nowrap text-xs text-ink-mut">{formatWhen((a as { at?: string }).at ?? a.timestamp)}</span>
              </li>
            ))}
          </ul>
        )}
      </WorkspaceCard>
    </div>
  );
}

function TabLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:text-brand-hover">
      {label} <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function Meter({ label, value, detail }: { label: string; value: number; detail: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-ink-sec">{label}</span>
        <span className="tabular text-ink-mut">
          {detail} <StatusChip value={`${value}%`} dot={false} tone={value >= 80 ? "ok" : value >= 50 ? "warn" : "neutral"} />
        </span>
      </div>
      <FillMeter value={value} />
    </div>
  );
}
