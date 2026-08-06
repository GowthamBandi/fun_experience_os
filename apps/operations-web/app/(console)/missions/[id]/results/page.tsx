"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectSessionTeams } from "@/lib/prototype/selectors/teams";
import { selectSessionSegmentResults } from "@/lib/prototype/selectors/results";
import { selectLiveSessionState } from "@/lib/prototype/selectors/liveSession";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import {
  MissionWorkspaceHeader,
  MissionStageNavigation,
  MissionBackNavigation,
} from "@/components/missions/shared";
import { CheckCircle, AlertTriangle, Eye, ArrowRight, RefreshCw, Undo, Edit } from "lucide-react";

export default function SessionResultsPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const {
    state,
    createDraftResult,
    confirmResult,
    correctResult,
    role,
  } = useStore();

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const liveState = useMemo(() => selectLiveSessionState(state, sessionId), [state, sessionId]);
  const teams = useMemo(() => selectSessionTeams(state, sessionId).map((t) => t.team), [state, sessionId]);
  const segments = useMemo(() => (state.activitySegments ?? []).filter((s) => s.sessionId === sessionId), [state, sessionId]);
  const results = useMemo(() => selectSessionSegmentResults(state, sessionId), [state, sessionId]);

  const isReadOnly = liveState.status === "Completed" || session?.status === "completed";

  // Derive sport vs non-sport (outcome-based) from category/template
  const isSport = useMemo(() => {
    if (!session) return false;
    const cat = state.categories.find((c: any) => c.id === session.categoryId);
    const catName = cat?.name?.toLowerCase() || "";
    return cat?.visualTreatment === "sports" || catName.includes("badminton") || catName.includes("cricket");
  }, [state, session]);

  // Status mapping
  const resultsConfirmedCount = useMemo(() => {
    return results.filter((r) => r.status === "Confirmed" || r.status === "Corrected").length;
  }, [results]);

  const allConfirmed = resultsConfirmedCount === segments.length && segments.length > 0;

  if (!session) {
    return <div className="p-8 text-xs font-mono text-slate-400">Session not found.</div>;
  }

  const handleSaveDraft = (segId: string, resultType: string, teamScores: any, winnerTeamId: string, outcomeText: string) => {
    setErrorMsg(null);
    const res = createDraftResult({
      sessionId,
      segmentId: segId,
      resultType,
      teamScores,
      winnerTeamId,
      outcome: outcomeText,
      operatorId: role.id,
    });
    if (res.error) setErrorMsg(res.error);
  };

  const handleConfirm = (segmentId: string) => {
    setErrorMsg(null);
    const res = confirmResult(sessionId, segmentId, role.id);
    if (res.error) setErrorMsg(res.error);
  };

  const handleCorrect = (segId: string, resultType: string, teamScores: any, winnerTeamId: string, outcomeText: string, reason: string) => {
    setErrorMsg(null);
    const res = correctResult({
      sessionId,
      segmentId: segId,
      resultType,
      teamScores,
      winnerTeamId,
      outcome: outcomeText,
      reason,
      operatorId: role.id,
    });
    if (res.error) setErrorMsg(res.error);
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      {/* Back button & Breadcrumbs */}
      <MissionBackNavigation currentStageName="Record Results" />

      <PageHeader
        overline="Event Operations Center"
        title="Record Results"
        sub="Record scores, final match winners, or social/objective outcomes for each step in the event."
      />

      {/* Global persistent header */}
      <MissionWorkspaceHeader />

      {/* Three step navigator */}
      <MissionStageNavigation />

      {errorMsg && <div className="bg-red-950 border border-red-800 text-red-300 p-3 rounded-xl">{errorMsg}</div>}

      {/* Form Workspace for each Event Step */}
      <div className="space-y-6">
        {segments.map((seg) => {
          const res = results.find((r) => r.segmentId === seg.id);
          return (
            <ResultEntryCard
              key={seg.id}
              segment={seg}
              teams={teams}
              existingResult={res}
              isSport={isSport}
              onSaveDraft={handleSaveDraft}
              onConfirmResult={handleConfirm}
              onCorrectResult={handleCorrect}
              isReadOnly={isReadOnly}
            />
          );
        })}
      </div>

      {/* Next Actions at bottom */}
      <div className="p-5 rounded-panel border border-white/5 bg-white/3 flex items-center justify-between flex-wrap gap-4 mt-6">
        <div className="space-y-1">
          <span className="font-bold text-sm text-ink-lum">
            {allConfirmed ? "All results are confirmed." : `${segments.length - resultsConfirmedCount} results still need confirmation.`}
          </span>
          <p className="text-[11px] text-ink-mut">
            {allConfirmed
              ? "All event steps have been locked. Proceed to complete and close the event ledger."
              : "Save draft scores first, then lock results by clicking Confirm Result."}
          </p>
        </div>
        <div>
          {allConfirmed ? (
            <Link href={`/missions/${sessionId}/completion`}>
              <button className="px-6 py-2.5 bg-brand hover:bg-brand-hover text-white font-bold rounded-xl text-sm transition-all flex items-center gap-1.5 shadow-[0_0_20px_rgba(90,103,245,0.4)]">
                Continue to Finish Event <ArrowRight className="h-4 w-4" />
              </button>
            </Link>
          ) : (
            <button
              onClick={() => {
                const firstUnconfirmed = document.querySelector(".border-amber-800");
                if (firstUnconfirmed) {
                  firstUnconfirmed.scrollIntoView({ behavior: "smooth" });
                }
              }}
              className="px-6 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 text-ink-sec font-bold rounded-xl text-sm transition-all"
            >
              Review Missing Results
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// Sub-component Result Entry Card
// ---------------------------------------------------------
function ResultEntryCard({
  segment,
  teams,
  existingResult,
  isSport,
  onSaveDraft,
  onConfirmResult,
  onCorrectResult,
  isReadOnly,
}: {
  segment: any;
  teams: any[];
  existingResult: any;
  isSport: boolean;
  onSaveDraft: (segId: string, type: string, scores: any, winnerId: string, outcome: string) => void;
  onConfirmResult: (segId: string) => void;
  onCorrectResult: (segId: string, type: string, scores: any, winnerId: string, outcome: string, reason: string) => void;
  isReadOnly: boolean;
}) {
  const isConfirmed = existingResult?.status === "Confirmed" || existingResult?.status === "Corrected";

  const [scoreA, setScoreA] = useState<number>(existingResult?.teamScores?.[0]?.score ?? 0);
  const [scoreB, setScoreB] = useState<number>(existingResult?.teamScores?.[1]?.score ?? 0);
  const [winnerId, setWinnerId] = useState<string>(existingResult?.winnerTeamId ?? "");
  const [outcomeText, setOutcomeText] = useState<string>(existingResult?.outcome ?? "");

  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");

  const teamA = teams[0];
  const teamB = teams[1];

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const scores = teamA && teamB ? [
      { teamId: teamA.id, score: scoreA },
      { teamId: teamB.id, score: scoreB }
    ] : undefined;
    onSaveDraft(segment.id, isSport ? "score" : "outcome", scores, winnerId, outcomeText);
  };

  const handleCorrectSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!correctionReason.trim()) return;
    const scores = teamA && teamB ? [
      { teamId: teamA.id, score: scoreA },
      { teamId: teamB.id, score: scoreB }
    ] : undefined;
    onCorrectResult(segment.id, isSport ? "score" : "outcome", scores, winnerId, outcomeText, correctionReason.trim());
    setCorrectionModalOpen(false);
    setCorrectionReason("");
  };

  // Status Chips & Explanations
  let statusText = "Not Recorded";
  let statusExplanation = "No result details have been registered yet.";
  let badgeStyle = "bg-white/5 border-white/10 text-ink-sec";

  if (existingResult?.status === "Draft") {
    statusText = "Draft";
    statusExplanation = "This result is saved but not final. Review scores and click Confirm Result.";
    badgeStyle = "bg-amber-950/40 border-amber-800 text-amber-300";
  } else if (existingResult?.status === "Confirmed") {
    statusText = "Confirmed";
    statusExplanation = "This result is final. Any changes will generate an audit correction record.";
    badgeStyle = "bg-emerald-950/40 border-emerald-800 text-emerald-400";
  } else if (existingResult?.status === "Corrected") {
    statusText = "Corrected";
    statusExplanation = "The result has been modified. The previous history is logged below.";
    badgeStyle = "bg-purple-950 border-purple-800 text-purple-300";
  }

  return (
    <div className={`glass rounded-panel border p-5 space-y-4 ${
      isConfirmed ? "border-white/5" : "border-amber-800/80 bg-amber-950/5"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 pb-2">
        <div className="space-y-0.5">
          <span className="text-xs font-bold text-ink-lum">Event Step: {segment.name}</span>
          <span className="block text-[10px] text-ink-mut uppercase tracking-wider">Step Sequence #{segment.sequence}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeStyle}`}>
            {statusText.toUpperCase()}
          </span>
        </div>
      </div>

      <p className="text-[11px] text-ink-mut italic">{statusExplanation}</p>

      {/* Score-based / Sports Experience */}
      {isSport && teamA && teamB ? (
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4 bg-black/10 border border-white/5 p-4 rounded-xl">
            <div className="space-y-1">
              <label className="text-[10px] text-ink-mut uppercase font-semibold">{teamA.name} Score</label>
              <input
                type="number"
                min={0}
                value={scoreA}
                onChange={(e) => setScoreA(parseInt(e.target.value) || 0)}
                disabled={isConfirmed || isReadOnly}
                className="w-full bg-slate-950 border border-white/5 rounded-lg px-3 py-2 text-lg font-bold text-ink-lum focus:outline-none focus:border-brand"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-ink-mut uppercase font-semibold">{teamB.name} Score</label>
              <input
                type="number"
                min={0}
                value={scoreB}
                onChange={(e) => setScoreB(parseInt(e.target.value) || 0)}
                disabled={isConfirmed || isReadOnly}
                className="w-full bg-slate-950 border border-white/5 rounded-lg px-3 py-2 text-lg font-bold text-ink-lum focus:outline-none focus:border-brand"
              />
            </div>

            <div className="col-span-2 space-y-1">
              <label className="text-[10px] text-ink-mut uppercase font-semibold">Declared Winner</label>
              <select
                value={winnerId}
                onChange={(e) => setWinnerId(e.target.value)}
                disabled={isConfirmed || isReadOnly}
                className="w-full bg-slate-950 border border-white/5 rounded-lg px-3 py-2 text-xs font-semibold focus:outline-none focus:border-brand"
              >
                <option value="">Select Winner...</option>
                <option value={teamA.id}>{teamA.name}</option>
                <option value={teamB.id}>{teamB.name}</option>
              </select>
            </div>
          </div>

          {/* Action buttons */}
          {!isReadOnly && (
            <div className="flex gap-2 justify-end">
              {!isConfirmed ? (
                <>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-ink-sec font-bold rounded-lg"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => onConfirmResult(segment.id)}
                    disabled={!existingResult}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold rounded-lg shadow"
                  >
                    Confirm Result
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setCorrectionModalOpen(true)}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg flex items-center gap-1"
                >
                  <Edit className="h-3.5 w-3.5" /> Correct Result
                </button>
              )}
            </div>
          )}
        </form>
      ) : (
        /* Outcome-based Experience */
        <form onSubmit={handleSave} className="space-y-4">
          <div className="space-y-3 bg-black/10 border border-white/5 p-4 rounded-xl">
            <div className="space-y-1">
              <label className="text-[10px] text-ink-mut uppercase font-semibold">What was the outcome?</label>
              <select
                value={winnerId}
                onChange={(e) => setWinnerId(e.target.value)}
                disabled={isConfirmed || isReadOnly}
                className="w-full bg-slate-950 border border-white/5 rounded-lg px-3 py-2 text-xs font-semibold"
              >
                <option value="">Select Outcome...</option>
                <option value="completed">Activity Completed</option>
                <option value="goal_completed">Group Goal Completed</option>
                <option value="partially_completed">Partially Completed</option>
                <option value="stopped">Event Stopped</option>
                <option value="no_result">No Result</option>
                <option value="other">Other</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-ink-mut uppercase font-semibold">Short Outcome Note</label>
              <textarea
                rows={2}
                placeholder="e.g. All four groups completed the challenge successfully."
                value={outcomeText}
                onChange={(e) => setOutcomeText(e.target.value)}
                disabled={isConfirmed || isReadOnly}
                className="w-full bg-slate-950 border border-white/5 rounded-lg p-2.5 text-xs text-ink-lum"
              />
            </div>
          </div>

          {/* Action buttons */}
          {!isReadOnly && (
            <div className="flex gap-2 justify-end">
              {!isConfirmed ? (
                <>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-white/5 border border-white/10 hover:bg-white/10 text-ink-sec font-bold rounded-lg"
                  >
                    Save Draft
                  </button>
                  <button
                    type="button"
                    onClick={() => onConfirmResult(segment.id)}
                    disabled={!existingResult}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold rounded-lg"
                  >
                    Confirm Outcome
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setCorrectionModalOpen(true)}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg flex items-center gap-1"
                >
                  <Edit className="h-3.5 w-3.5" /> Correct Outcome
                </button>
              )}
            </div>
          )}
        </form>
      )}

      {/* Revision History Logs */}
      {existingResult?.revisions && existingResult.revisions.length > 0 && (
        <div className="bg-slate-950 border border-white/5 rounded-xl p-3.5 space-y-2">
          <span className="font-bold text-ink-mut uppercase text-[10px] block border-b border-white/5 pb-1">
            Result History
          </span>
          <div className="space-y-1.5">
            {existingResult.revisions.map((rev: any) => (
              <div key={rev.revisionNumber} className="text-[10px] text-ink-mut leading-relaxed">
                <span className="font-bold text-ink-sec">Revision #{rev.revisionNumber}</span> ({rev.resultType}) by <strong className="text-ink-sec">{rev.recordedBy}</strong> at {rev.recordedAt}
                {rev.reason && <p className="text-amber-400 mt-0.5">Reason for correction: {rev.reason}</p>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Correction Modal */}
      {correctionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleCorrectSubmit} className="bg-slate-900 border border-purple-800 rounded-lg p-6 max-w-md w-full space-y-4">
            <h4 className="font-bold text-purple-300 text-sm">Correct Result</h4>
            <p className="text-slate-300">
              Confirmed results cannot be silently overwritten. Provide a mandatory reason to log the correction.
            </p>
            <textarea
              rows={3}
              placeholder="e.g. Score miscount corrected by Lead Coordinator after scorecard review."
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              required
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCorrectionModalOpen(false)}
                className="px-3 py-1 bg-slate-800 text-slate-300 rounded font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded"
              >
                Save Corrected Result
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
