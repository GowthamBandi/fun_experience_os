"use client";

import React, { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { Card } from "@/components/ui/panels";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { selectLiveSessionState } from "@/lib/prototype/selectors/liveSession";
import { selectCompletionChecklist } from "@/lib/prototype/selectors/completion";
import { selectSessionSegmentResults } from "@/lib/prototype/selectors/results";
import {
  MissionWorkspaceHeader,
  MissionStageNavigation,
  MissionMetricsSummary,
  getOperationalStatusLabel,
} from "@/components/missions/shared";
import { Play, ClipboardCheck, LockKeyhole, ArrowLeft, HeartPulse } from "lucide-react";

export default function SessionOverviewPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const { state } = useStore();

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const lss = useMemo(() => selectLiveSessionState(state, sessionId), [state, sessionId]);
  const checklist = useMemo(() => selectCompletionChecklist(state, sessionId), [state, sessionId]);
  const results = useMemo(() => (state.activitySegments ?? []).filter((s) => s.sessionId === sessionId), [state, sessionId]);
  const segmentResults = useMemo(() => selectSessionSegmentResults(state, sessionId), [state, sessionId]);

  const confirmedCount = useMemo(() => {
    return segmentResults.filter((r) => r.status === "Confirmed" || r.status === "Corrected").length;
  }, [segmentResults]);

  if (!session) {
    return <div className="p-8 text-xs font-mono text-slate-400">Session not found.</div>;
  }

  const hasStarted = (lss.status as string) !== "Ready" && (lss.status as string) !== "scheduled" && (lss.status as string) !== "draft";
  const hasEnded = (lss.status as string) === "Ended" || (lss.status as string) === "Completed" || (session.status as string) === "completed";
  const isCompleted = (lss.status as string) === "Completed" || (session.status as string) === "completed";

  // Description copy
  const runDesc =
    (lss.status as string) === "Ready" || (lss.status as string) === "scheduled" || (lss.status as string) === "draft"
      ? "Enough participants and staff are present. Ready for live handover."
      : lss.status === "Live"
      ? "The timer is active. Match brackets or activities are currently underway."
      : lss.status === "Paused"
      ? "Event is paused. Operational notes or safety adjustments are being made."
      : lss.status === "Emergency"
      ? "Safety mode active. Operators are triaging a participant event or concern."
      : "The active session runtime has ended.";

  const resultsDesc = !hasStarted
    ? "Record Results becomes available after starting the event."
    : confirmedCount < results.length
    ? `${results.length - confirmedCount} segment results still need to be verified.`
    : "All scores and experience outcomes have been successfully verified.";

  const finishDesc = isCompleted
    ? "This event is closed and locked. Records are in read-only snapshot mode."
    : !hasEnded
    ? "Finish Event becomes available after the session timer has ended."
    : checklist.isReadyToComplete
    ? "All verification checks have passed. You are ready to close this session."
    : "Some critical verification items are still missing or require attention.";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      {/* Back button and Breadcrumbs */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-ink-mut">
          <Link href="/missions" className="hover:text-ink-sec transition-colors font-semibold">
            All Events
          </Link>
          <span>/</span>
          <span className="text-ink-sec font-bold truncate max-w-[250px]">{sessionTitle(state, session.id)}</span>
        </div>
        <div>
          <Link href="/missions">
            <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-mut hover:text-ink-lum transition-colors bg-white/4 border border-white/5 px-3 py-1.5 rounded-lg">
              <ArrowLeft className="h-4 w-4" />
              ← Back to All Events
            </button>
          </Link>
        </div>
      </div>

      <PageHeader
        overline="Event Operations Command Room"
        title="Event Operations Desk"
        sub="Monitor real-time participant attendance, run game clock controls, enter final scores, and close the ledger."
      />

      {/* Global persistent header */}
      <MissionWorkspaceHeader />

      {/* Three step navigator */}
      <MissionStageNavigation />

      {/* Three main stages cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
        {/* Step 1: Run Event */}
        <div className="glass rounded-panel border border-white/5 p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand uppercase tracking-wider">1. Run Event</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                lss.status === "Live"
                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                  : lss.status === "Paused"
                  ? "bg-amber-950 text-amber-300 border border-amber-800"
                  : lss.status === "Emergency"
                  ? "bg-red-950 text-red-400 border border-red-800"
                  : "bg-white/5 text-ink-sec"
              }`}>
                {getOperationalStatusLabel(lss.status)}
              </span>
            </div>
            <p className="text-sm font-semibold text-ink-lum">Operational Control</p>
            <p className="text-ink-mut text-[11px] leading-relaxed">{runDesc}</p>
          </div>
          <Link href={`/missions/${sessionId}/live`} className="w-full">
            <Button variant="lamp" className="w-full justify-center text-xs h-9 gap-1.5">
              <Play className="h-3.5 w-3.5" />
              Open Run Event
            </Button>
          </Link>
        </div>

        {/* Step 2: Record Results */}
        <div className="glass rounded-panel border border-white/5 p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#5fd7a3] uppercase tracking-wider">2. Record Results</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                !hasStarted
                  ? "bg-white/2 border-white/5 text-ink-mut"
                  : confirmedCount === results.length && results.length > 0
                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                  : "bg-amber-950 text-amber-300 border border-amber-800"
              }`}>
                {!hasStarted ? "LOCKED" : `${confirmedCount}/${results.length} Confirmed`}
              </span>
            </div>
            <p className="text-sm font-semibold text-ink-lum">Outcome & Scores Entry</p>
            <p className="text-ink-mut text-[11px] leading-relaxed">{resultsDesc}</p>
          </div>
          {hasStarted ? (
            <Link href={`/missions/${sessionId}/results`} className="w-full">
              <Button variant="ghost" className="w-full border border-white/10 justify-center text-xs h-9 gap-1.5">
                <ClipboardCheck className="h-3.5 w-3.5" />
                Record Results
              </Button>
            </Link>
          ) : (
            <Button disabled className="w-full justify-center text-xs h-9 gap-1.5 opacity-50 cursor-not-allowed">
              <LockKeyhole className="h-3.5 w-3.5" />
              Record Results (Locked)
            </Button>
          )}
        </div>

        {/* Step 3: Finish Event */}
        <div className="glass rounded-panel border border-white/5 p-5 flex flex-col justify-between space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[#ffd28a] uppercase tracking-wider">3. Finish Event</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                isCompleted
                  ? "bg-slate-900 border-slate-800 text-slate-400"
                  : !hasEnded
                  ? "bg-white/2 border-white/5 text-ink-mut"
                  : checklist.isReadyToComplete
                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                  : "bg-red-950 text-red-400 border border-red-800"
              }`}>
                {isCompleted ? "COMPLETED" : !hasEnded ? "LOCKED" : checklist.isReadyToComplete ? "READY" : "NEEDS ACTION"}
              </span>
            </div>
            <p className="text-sm font-semibold text-ink-lum">Archival & Ledger Verification</p>
            <p className="text-ink-mut text-[11px] leading-relaxed">{finishDesc}</p>
          </div>
          {hasEnded ? (
            <Link href={`/missions/${sessionId}/completion`} className="w-full">
              <Button variant="ghost" className="w-full border border-white/10 justify-center text-xs h-9 gap-1.5">
                <ClipboardCheck className="h-3.5 w-3.5" />
                Review Completion
              </Button>
            </Link>
          ) : (
            <Button disabled className="w-full justify-center text-xs h-9 gap-1.5 opacity-50 cursor-not-allowed">
              <LockKeyhole className="h-3.5 w-3.5" />
              Review Completion (Locked)
            </Button>
          )}
        </div>
      </div>

      {/* Metrics Summary cards */}
      <div className="pt-2">
        <MissionMetricsSummary />
      </div>
    </div>
  );
}
