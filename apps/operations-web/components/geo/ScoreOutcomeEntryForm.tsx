"use client";

import { useState } from "react";
import type { ActivitySegment, Team, SegmentResult, ResultType } from "@/lib/prototype/entities";

export function ScoreOutcomeEntryForm({
  segment,
  teams,
  existingResult,
  onSaveDraft,
  onConfirmResult,
  onCorrectResult,
  isReadOnly = false,
}: {
  segment: ActivitySegment;
  teams: Team[];
  existingResult?: SegmentResult;
  onSaveDraft: (params: {
    segmentId: string;
    resultType: ResultType;
    teamScores?: { teamId: string; score: number }[];
    winnerTeamId?: string;
    outcome?: string;
  }) => void;
  onConfirmResult: (segmentId: string) => void;
  onCorrectResult: (params: {
    segmentId: string;
    resultType: ResultType;
    teamScores?: { teamId: string; score: number }[];
    winnerTeamId?: string;
    outcome?: string;
    reason: string;
  }) => void;
  isReadOnly?: boolean;
}) {
  const [resultType, setResultType] = useState<ResultType>(existingResult?.resultType ?? "score");
  const [teamAScore, setTeamAScore] = useState<number>(existingResult?.teamScores?.[0]?.score ?? 0);
  const [teamBScore, setTeamBScore] = useState<number>(existingResult?.teamScores?.[1]?.score ?? 0);
  const [winnerTeamId, setWinnerTeamId] = useState<string>(existingResult?.winnerTeamId ?? "");
  const [outcomeText, setOutcomeText] = useState<string>(existingResult?.outcome ?? "");

  const [correctionModalOpen, setCorrectionModalOpen] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const teamA = teams[0];
  const teamB = teams[1];

  const isConfirmed = existingResult?.status === "Confirmed" || existingResult?.status === "Corrected";

  const handleSaveDraftSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const teamScores =
      teamA && teamB
        ? [
            { teamId: teamA.id, score: Math.max(0, teamAScore) },
            { teamId: teamB.id, score: Math.max(0, teamBScore) },
          ]
        : undefined;

    onSaveDraft({
      segmentId: segment.id,
      resultType,
      teamScores,
      winnerTeamId: resultType === "score" ? winnerTeamId : undefined,
      outcome: outcomeText,
    });
  };

  const handleCorrectionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!correctionReason.trim()) {
      setErrorMsg("Mandatory correction reason is required.");
      return;
    }

    const teamScores =
      teamA && teamB
        ? [
            { teamId: teamA.id, score: Math.max(0, teamAScore) },
            { teamId: teamB.id, score: Math.max(0, teamBScore) },
          ]
        : undefined;

    onCorrectResult({
      segmentId: segment.id,
      resultType,
      teamScores,
      winnerTeamId: resultType === "score" ? winnerTeamId : undefined,
      outcome: outcomeText,
      reason: correctionReason.trim(),
    });

    setCorrectionModalOpen(false);
    setCorrectionReason("");
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 font-mono text-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <span className="font-bold text-slate-200 text-sm">
            🎯 Result Entry: {segment.name}
          </span>
          <span className="ml-2 text-[10px] text-slate-400 font-normal font-mono">
            (Sequence #{segment.sequence})
          </span>
        </div>
        <span
          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
            existingResult?.status === "Confirmed"
              ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
              : existingResult?.status === "Corrected"
              ? "bg-purple-950 text-purple-300 border border-purple-800"
              : "bg-amber-950 text-amber-300 border border-amber-800"
          }`}
        >
          {existingResult?.status || "NO RESULT RECORDED"}
        </span>
      </div>

      <form onSubmit={handleSaveDraftSubmit} className="space-y-4">
        {/* Result Mode Switcher */}
        <div className="flex items-center gap-3 bg-slate-950 p-2 rounded border border-slate-800">
          <span className="text-slate-400 font-bold uppercase text-[10px]">Result Mode:</span>
          <select
            value={resultType}
            onChange={(e) => setResultType(e.target.value as ResultType)}
            disabled={isConfirmed || isReadOnly}
            className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-slate-200 font-bold"
          >
            <option value="score">Score-based (Team vs Team)</option>
            <option value="outcome">Outcome-based (Social/Objective)</option>
            <option value="draw">Match Draw</option>
            <option value="abandoned">Abandoned</option>
            <option value="no-contest">No Contest</option>
          </select>
        </div>

        {/* Score-Based Input Controls */}
        {resultType === "score" && teamA && teamB && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-950 p-4 rounded border border-slate-800">
            <div className="space-y-1">
              <label className="text-emerald-400 font-bold block">{teamA.name} Score:</label>
              <input
                type="number"
                min={0}
                value={teamAScore}
                onChange={(e) => setTeamAScore(parseInt(e.target.value, 10) || 0)}
                disabled={isConfirmed || isReadOnly}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-slate-200 text-lg font-bold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-emerald-400 font-bold block">{teamB.name} Score:</label>
              <input
                type="number"
                min={0}
                value={teamBScore}
                onChange={(e) => setTeamBScore(parseInt(e.target.value, 10) || 0)}
                disabled={isConfirmed || isReadOnly}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-slate-200 text-lg font-bold"
              />
            </div>

            <div className="sm:col-span-2 space-y-1">
              <label className="text-slate-400 block font-bold">Declared Winner Team:</label>
              <select
                value={winnerTeamId}
                onChange={(e) => setWinnerTeamId(e.target.value)}
                disabled={isConfirmed || isReadOnly}
                className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-slate-200 font-bold"
              >
                <option value="">Select Winner...</option>
                <option value={teamA.id}>{teamA.name}</option>
                <option value={teamB.id}>{teamB.name}</option>
              </select>
            </div>
          </div>
        )}

        {/* Outcome-Based Input Controls */}
        {(resultType === "outcome" || resultType === "abandoned" || resultType === "no-contest") && (
          <div className="space-y-1 bg-slate-950 p-4 rounded border border-slate-800">
            <label className="text-slate-400 block font-bold">Operational Outcome Details:</label>
            <textarea
              rows={2}
              placeholder="e.g. Group objective achieved cleanly; route completed by all participants."
              value={outcomeText}
              onChange={(e) => setOutcomeText(e.target.value)}
              disabled={isConfirmed || isReadOnly}
              className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-slate-200"
            />
          </div>
        )}

        {errorMsg && <div className="bg-red-950 border border-red-800 text-red-300 p-2 rounded">{errorMsg}</div>}

        {/* Action Controls */}
        {!isReadOnly && (
          <div className="flex items-center justify-between pt-2">
            {!isConfirmed ? (
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded"
                >
                  Save Draft
                </button>
                <button
                  type="button"
                  onClick={() => onConfirmResult(segment.id)}
                  disabled={!existingResult}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-slate-950 font-bold rounded"
                >
                  🔒 Confirm Result
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCorrectionModalOpen(true)}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded"
              >
                ✏️ Audited Result Correction Workflow
              </button>
            )}
          </div>
        )}
      </form>

      {/* Revision History Log */}
      {existingResult?.revisions && existingResult.revisions.length > 0 && (
        <div className="bg-slate-950 border border-slate-800 rounded p-3 space-y-2">
          <span className="font-bold text-slate-400 uppercase text-[10px]">
            Revision History Audit ({existingResult.revisions.length} Revisions)
          </span>
          <div className="space-y-1">
            {existingResult.revisions.map((rev) => (
              <div key={rev.revisionNumber} className="text-[10px] text-slate-400 border-b border-slate-800 pb-1">
                <strong className="text-slate-200">Rev #{rev.revisionNumber}</strong> ({rev.status}) by {rev.recordedBy} at {rev.recordedAt}
                {rev.reason && <span className="text-amber-400 ml-2">Reason: {rev.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audited Correction Modal */}
      {correctionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleCorrectionSubmit} className="bg-slate-900 border border-purple-800 rounded-lg p-6 max-w-md w-full space-y-4">
            <h4 className="font-bold text-purple-300 text-sm">Audited Result Correction</h4>
            <p className="text-slate-300">
              Confirmed results cannot be silently overwritten. Provide a mandatory correction reason to append an immutable revision to the audit ledger.
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
                Confirm Audited Revision
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
