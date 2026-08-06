"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectCompletionChecklist, selectSessionSummary } from "@/lib/prototype/selectors/completion";
import { selectLiveSessionState } from "@/lib/prototype/selectors/liveSession";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import {
  MissionWorkspaceHeader,
  MissionStageNavigation,
  MissionBackNavigation,
} from "@/components/missions/shared";
import { selectSessionTeams } from "@/lib/prototype/selectors/teams";
import { inr } from "@/lib/format";
import { ShieldCheck, AlertOctagon, HelpCircle, ArrowRight, Lock, CheckCircle } from "lucide-react";

export default function SessionCompletionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const { state, completeLiveSession, role } = useStore();

  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [confirmCloseModalOpen, setConfirmCloseModalOpen] = useState(false);
  const [closingNote, setClosingNote] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const liveState = useMemo(() => selectLiveSessionState(state, sessionId), [state, sessionId]);
  const checklist = useMemo(() => selectCompletionChecklist(state, sessionId), [state, sessionId]);
  const summary = useMemo(() => selectSessionSummary(state, sessionId), [state, sessionId]);
  const teams = useMemo(() => selectSessionTeams(state, sessionId), [state, sessionId]);

  const isCompleted = liveState.status === "Completed" || session?.status === "completed";

  const winnerName = useMemo(() => {
    // If sport, look up segment results winner
    const winnerId = summary.results?.[summary.results.length - 1]?.winnerTeamId;
    if (winnerId) {
      return teams.find((t) => t.team.id === winnerId)?.team.name || winnerId;
    }
    return "No Winner";
  }, [summary.results, teams]);

  if (!session) {
    return <div className="p-8 text-xs font-mono text-slate-400">Session not found.</div>;
  }

  const handleComplete = (override?: string) => {
    setErrorMsg(null);
    const res = completeLiveSession(sessionId, override, role.id);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setOverrideModalOpen(false);
      setOverrideReason("");
      setConfirmCloseModalOpen(false);
    }
  };

  const getBlockerAction = (key: string) => {
    if (key === "session-ended" || key === "active-segments-closed" || key === "equipment-returned" || key === "safety-signals-cleared") {
      return { label: "Review Equipment & Steps", href: `/missions/${sessionId}/live` };
    }
    if (key === "attendance-finalized" || key === "staff-finalized") {
      return { label: "Open Check-In Desk", href: `/missions/${sessionId}/check-in` };
    }
    if (key === "results-finalized") {
      return { label: "Review Results", href: `/missions/${sessionId}/results` };
    }
    return null;
  };

  const blockers = checklist.items.filter((item) => item.status !== "passed");

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      {/* Back button & Breadcrumbs */}
      <MissionBackNavigation currentStageName="Finish Event" />

      <PageHeader
        overline="Event Closure & Archive"
        title="Finish Event"
        sub="Verify all attendance records, confirm match outcomes, log equipment returns, and lock the event history."
      />

      {/* Global persistent header */}
      <MissionWorkspaceHeader />

      {/* Three step navigator */}
      <MissionStageNavigation />

      {errorMsg && <div className="bg-red-950 border border-red-800 text-red-300 p-3 rounded-xl">{errorMsg}</div>}

      {/* If Completed state */}
      {isCompleted ? (
        <div className="bg-emerald-950/60 border border-emerald-800 p-6 rounded-panel space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-6 w-6 text-emerald-400" />
            <div>
              <h3 className="text-sm font-bold text-emerald-300">Event Completed</h3>
              <p className="text-[11px] text-emerald-400/80">
                This event is now closed and the final summary is ready. Normal operations are locked.
              </p>
            </div>
          </div>
          <div className="text-[10px] text-slate-400">
            Locked At: {liveState.updatedAt ? new Date(liveState.updatedAt).toLocaleString() : "Recently"}
          </div>
          <div className="flex items-center gap-2 pt-2 border-t border-emerald-800/40">
            <Link href={`/missions/${sessionId}/summary`}>
              <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl text-xs">
                View Final Summary
              </button>
            </Link>
            <Link href="/missions">
              <button className="px-4 py-2 bg-white/5 border border-white/10 hover:bg-white/10 text-ink-sec rounded-xl text-xs">
                Back to All Events
              </button>
            </Link>
          </div>
        </div>
      ) : (
        /* Active closure form */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column: Blockers and Checklist */}
          <div className="space-y-6">
            {/* Blocker Alert Banner */}
            {blockers.length > 0 && (
              <div className="bg-red-950/40 border border-red-800 rounded-panel p-5 space-y-3">
                <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
                  <AlertOctagon className="h-5 w-5" />
                  <span>Event Cannot Be Finished Yet</span>
                </div>
                <p className="text-red-300 text-[11px]">
                  Before we can lock records, you must resolve the remaining checklist items below.
                </p>

                <div className="space-y-2 pt-2 border-t border-red-800/40">
                  {blockers.map((item) => {
                    const action = getBlockerAction(item.key);
                    return (
                      <div key={item.key} className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-lg bg-black/30 border border-red-800/20 text-[11px]">
                        <div>
                          <p className="font-bold text-red-200">{item.label}</p>
                          <p className="text-[10px] text-slate-400 mt-0.5">{item.evidence}</p>
                        </div>
                        {action && (
                          <Link href={action.href}>
                            <button className="px-2.5 py-1 bg-red-900/60 hover:bg-red-900 border border-red-800 text-red-300 text-[10px] font-bold rounded">
                              {action.label}
                            </button>
                          </Link>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Checklist items */}
            <div className="glass border border-white/5 rounded-panel p-5 space-y-4">
              <span className="font-bold text-ink-lum uppercase tracking-wider block border-b border-white/5 pb-2">Before You Finish</span>
              <div className="space-y-2">
                {checklist.items.map((item) => {
                  const passed = item.status === "passed";
                  const warning = item.status === "warning";
                  return (
                    <div key={item.key} className="flex items-center justify-between py-2 border-b border-white/2">
                      <div>
                        <p className="font-bold text-ink-sec">{item.label}</p>
                        <p className="text-[10px] text-ink-mut">{item.evidence}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${
                        passed
                          ? "bg-emerald-950 border-emerald-800 text-emerald-400"
                          : warning
                          ? "bg-amber-950 border-amber-800 text-amber-300"
                          : "bg-red-950 border-red-800 text-red-400"
                      }`}>
                        {item.status.toUpperCase()}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Final Numbers and Closing Actions */}
          <div className="space-y-6">
            {/* Final Numbers Card */}
            <div className="glass border border-white/5 rounded-panel p-5 space-y-4">
              <span className="font-bold text-ink-lum uppercase tracking-wider block border-b border-white/5 pb-2">Final Summary Numbers</span>

              <div className="grid grid-cols-2 gap-4">
                {/* Column 1: Attendance */}
                <div className="space-y-2">
                  <span className="text-[10px] text-ink-mut uppercase font-semibold block">Attendance</span>
                  <div className="space-y-1 text-[11px] text-ink-sec">
                    <div>Joined: <strong className="text-brand">{summary.checkIn.checkedInCount + summary.checkIn.lateCount + summary.checkIn.missingCount}</strong></div>
                    <div>Present: <strong className="text-[#5fd7a3]">{summary.checkIn.checkedInCount + summary.checkIn.lateCount}</strong></div>
                    <div>Late: <strong className="text-amber-300">{summary.checkIn.lateCount}</strong></div>
                    <div>No Show: <strong className="text-danger">{summary.checkIn.missingCount}</strong></div>
                  </div>
                </div>

                {/* Column 2: Financials */}
                <div className="space-y-2 border-l border-white/5 pl-4">
                  <span className="text-[10px] text-ink-mut uppercase font-semibold block">Financials</span>
                  <div className="space-y-1 text-[11px] text-ink-sec">
                    <div>Gross: <strong className="text-ink-lum">{inr(summary.money.grossCollected)}</strong></div>
                    <div>Refunds: <strong className="text-danger">-{inr(summary.money.totalRefunded)}</strong></div>
                    <div className="border-t border-white/5 pt-1 mt-1 font-bold">
                      Net: <strong className="text-[#5fd7a3]">{inr(summary.money.netRevenue)}</strong>
                    </div>
                  </div>
                </div>

                {/* Column 3: Event Runtime */}
                <div className="space-y-2 border-t border-white/5 pt-3 col-span-2 grid grid-cols-2">
                  <div className="space-y-1">
                    <span className="text-[10px] text-ink-mut uppercase font-semibold block">Event Timing</span>
                    <div className="text-[11px] text-ink-sec">
                      <div>Active Running: <strong className="text-ink-lum">{summary.formattedDuration}</strong></div>
                    </div>
                  </div>
                  <div className="space-y-1 border-l border-white/5 pl-4">
                    <span className="text-[10px] text-ink-mut uppercase font-semibold block">Teams & Winner</span>
                    <div className="text-[11px] text-ink-sec">
                      <div>Teams: <strong className="text-ink-lum">{teams.length} Groups</strong></div>
                      <div>Winner: <strong className="text-brand">{winnerName}</strong></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Closing Note and Action card */}
            <div className="glass border border-white/5 rounded-panel p-5 space-y-4">
              <span className="font-bold text-ink-lum uppercase tracking-wider block border-b border-white/5 pb-2">Complete Closure Notes</span>

              <div className="space-y-2">
                <label className="text-[10px] text-ink-mut uppercase font-semibold">Closing Note</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Event completed successfully. One racket was damaged and recorded."
                  value={closingNote}
                  onChange={(e) => setClosingNote(e.target.value)}
                  className="w-full bg-slate-950 border border-white/5 rounded-lg p-2.5 text-xs text-ink-lum"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                {checklist.isReadyToComplete ? (
                  <button
                    onClick={() => setConfirmCloseModalOpen(true)}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl text-sm shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-all"
                  >
                    Finish and Lock Event
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setOverrideModalOpen(true)}
                      className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-xl text-xs"
                    >
                      Audited Completion Override
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Finish Modal */}
      {confirmCloseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-800 rounded-lg p-6 max-w-md w-full space-y-4 font-mono text-xs">
            <h4 className="font-bold text-emerald-400 text-sm">Finish this event?</h4>
            <p className="text-slate-350 leading-relaxed">
              Are you sure you want to lock the event ledger? This action will generate the final database snapshot and freeze all check-ins, scores, and revenue outputs.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmCloseModalOpen(false)}
                className="px-3 py-1 bg-slate-800 text-slate-300 rounded font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleComplete()}
                className="px-4 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded"
              >
                Finish Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Audited Completion Override Modal */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-800 rounded-lg p-6 max-w-md w-full space-y-4 font-mono text-xs">
            <h4 className="font-bold text-purple-300 text-sm">Audited Completion Override</h4>
            <p className="text-slate-350 leading-relaxed">
              Completing a session with unresolved checklist items requires an audited justification reason.
            </p>
            <textarea
              rows={3}
              placeholder="e.g. Lead Coordinator verified venue cleared and attendance confirmed on site."
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              required
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOverrideModalOpen(false)}
                className="px-3 py-1 bg-slate-800 text-slate-300 rounded font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleComplete(overrideReason.trim())}
                className="px-4 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded animate-pulse"
              >
                Execute Audited Completion
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
