"use client";

import { useState } from "react";
import type { ActivitySegment } from "@/lib/prototype/entities";

export function RunOfShowWorkspace({
  segments,
  onStartSegment,
  onCompleteSegment,
  onSkipSegment,
  onCreateSegment,
  isReadOnly = false,
}: {
  segments: ActivitySegment[];
  onStartSegment: (segmentId: string) => void;
  onCompleteSegment: (segmentId: string) => void;
  onSkipSegment: (segmentId: string, reason: string) => void;
  onCreateSegment?: (name: string, type: any) => void;
  isReadOnly?: boolean;
}) {
  const [newSegName, setNewSegName] = useState("");
  const [newSegType, setNewSegType] = useState<any>("Match");
  const [skipModalSegId, setSkipModalSegId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState("");

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSegName.trim() || !onCreateSegment) return;
    onCreateSegment(newSegName.trim(), newSegType);
    setNewSegName("");
  };

  const handleSkipSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!skipModalSegId || !skipReason.trim()) return;
    onSkipSegment(skipModalSegId, skipReason.trim());
    setSkipModalSegId(null);
    setSkipReason("");
  };

  const sorted = [...segments].sort((a, b) => a.sequence - b.sequence);

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 font-mono text-xs space-y-4">
      <div className="flex items-center justify-between border-b border-slate-200 pb-3">
        <span className="font-bold text-slate-800 uppercase tracking-wider text-xs flex items-center gap-2">
          <span>📋 Run-of-Show Activity Segments</span>
        </span>
        <span className="text-[10px] text-slate-500">
          Single Active Segment Rule Enforced
        </span>
      </div>

      {/* Segment Timeline List */}
      <div className="space-y-2">
        {sorted.map((seg) => {
          const isActive = seg.status === "Active";
          const isPaused = seg.status === "Paused";
          const isCompleted = seg.status === "Completed";
          const isSkipped = seg.status === "Skipped";

          return (
            <div
              key={seg.id}
              className={`p-3 rounded-lg border flex flex-wrap items-center justify-between gap-3 ${
                isActive
                  ? "bg-purple-200 border-purple-200 shadow-md shadow-purple-950/50"
                  : isPaused
                  ? "bg-amber-200 border-amber-200"
                  : isCompleted
                  ? "bg-slate-50 border-slate-200 text-slate-500"
                  : isSkipped
                  ? "bg-slate-50 border-slate-200 text-slate-500 italic"
                  : "bg-slate-50 border-slate-200 text-slate-800"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-[10px]">
                  {seg.sequence}
                </span>
                <div>
                  <div className="font-bold text-sm flex items-center gap-2">
                    <span>{seg.name}</span>
                    <span className="text-[10px] font-normal px-2 py-0.5 rounded bg-slate-100 text-slate-500">
                      {seg.type}
                    </span>
                  </div>
                  {seg.skipReason && (
                    <div className="text-[10px] text-amber-600">
                      Skipped reason: {seg.skipReason}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    isActive
                      ? "bg-emerald-50 text-emerald-600 border border-emerald-200 animate-pulse"
                      : isPaused
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : isCompleted
                      ? "bg-slate-100 text-slate-500"
                      : isSkipped
                      ? "bg-red-50 text-red-600 border border-red-200"
                      : "bg-slate-100 text-slate-700"
                  }`}
                >
                  {seg.status.toUpperCase()}
                </span>

                {!isReadOnly && (
                  <>
                    {!isActive && !isCompleted && !isSkipped && (
                      <button
                        onClick={() => onStartSegment(seg.id)}
                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded text-[10px]"
                      >
                        Start
                      </button>
                    )}

                    {isActive && (
                      <button
                        onClick={() => onCompleteSegment(seg.id)}
                        className="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded text-[10px]"
                      >
                        Complete
                      </button>
                    )}

                    {!isCompleted && !isSkipped && (
                      <button
                        onClick={() => setSkipModalSegId(seg.id)}
                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px]"
                      >
                        Skip
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add New Segment Form */}
      {onCreateSegment && !isReadOnly && (
        <form onSubmit={handleCreateSubmit} className="pt-2 flex items-center gap-2">
          <input
            type="text"
            placeholder="Add segment name (e.g. Match 3: Tie-breaker)..."
            value={newSegName}
            onChange={(e) => setNewSegName(e.target.value)}
            className="flex-1 bg-slate-50 border border-slate-200 rounded px-3 py-1.5 text-slate-800"
          />
          <select
            value={newSegType}
            onChange={(e) => setNewSegType(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded px-2 py-1.5 text-slate-800"
          >
            <option value="Briefing">Briefing</option>
            <option value="Warm-up">Warm-up</option>
            <option value="Match">Match</option>
            <option value="Round">Round</option>
            <option value="Activity">Activity</option>
            <option value="Break">Break</option>
            <option value="Cooldown">Cooldown</option>
            <option value="Wrap-up">Wrap-up</option>
          </select>
          <button
            type="submit"
            disabled={!newSegName.trim()}
            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded disabled:opacity-50"
          >
            + Add Segment
          </button>
        </form>
      )}

      {/* Skip Reason Modal */}
      {skipModalSegId && (
        <div className="fixed inset-0 z-50 bg-slate-50 flex items-center justify-center p-4">
          <form onSubmit={handleSkipSubmit} className="bg-slate-50 border border-slate-200 rounded-lg p-6 max-w-md w-full space-y-4">
            <h4 className="font-bold text-slate-800 text-sm">Skip Activity Segment</h4>
            <p className="text-slate-700">Provide a mandatory reason for skipping this segment.</p>
            <textarea
              rows={3}
              placeholder="e.g. Time constraint; team forfeited match."
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
              required
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSkipModalSegId(null)}
                className="px-3 py-1 bg-slate-100 text-slate-700 rounded font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded"
              >
                Confirm Skip
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
