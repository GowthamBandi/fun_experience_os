"use client";

import { useState, useEffect } from "react";
import type { ParticipantPoolItem } from "@/lib/prototype/selectors/identity";
import type { TeamWithMembers } from "@/lib/prototype/selectors/teams";

export function TheFormationAnimation({
  participants,
  teams,
  onComplete,
}: {
  participants: ParticipantPoolItem[];
  teams: TeamWithMembers[];
  onComplete: () => void;
}) {
  const [stage, setStage] = useState<"atoms" | "gathering" | "grouped">("atoms");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (reducedMotion) {
      setStage("grouped");
      onComplete();
      return;
    }

    const t1 = setTimeout(() => setStage("gathering"), 600);
    const t2 = setTimeout(() => {
      setStage("grouped");
      onComplete();
    }, 1800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [reducedMotion, onComplete]);

  return (
    <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 space-y-6 font-mono text-xs text-center relative overflow-hidden">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="text-amber-400 font-bold text-sm">⚛️ The Formation</span>
          <span className="text-slate-500 text-[10px]">
            {stage === "atoms" ? "Initializing Pool Atoms..." : stage === "gathering" ? "Gathering into Team Clusters..." : "Allocation Complete"}
          </span>
        </div>
        <button
          onClick={() => setReducedMotion(!reducedMotion)}
          className="text-[10px] px-2 py-1 bg-slate-900 border border-slate-700 text-slate-400 rounded hover:text-slate-200"
        >
          {reducedMotion ? "⚡ Reduced Motion ON" : "✨ Motion Normal"}
        </button>
      </div>

      {/* Dynamic Atom Grid / Cluster View */}
      {stage !== "grouped" ? (
        <div className="py-8 space-y-4">
          <div className="flex flex-wrap items-center justify-center gap-3 max-w-xl mx-auto">
            {participants.map((p, idx) => (
              <div
                key={p.booking.id}
                className={`px-3 py-1.5 rounded-full border transition-all duration-700 font-mono font-bold text-xs ${
                  stage === "gathering"
                    ? "scale-105 border-purple-500/80 bg-purple-950/80 text-purple-200 shadow-lg shadow-purple-950/50"
                    : "border-slate-700 bg-slate-900 text-slate-300"
                }`}
                style={{
                  transitionDelay: `${idx * 80}ms`,
                }}
              >
                {p.temporaryIdentity?.temporaryCode || p.booking.alias}
              </div>
            ))}
          </div>
          <p className="text-slate-500 text-[11px] animate-pulse">
            Applying deterministic random distribution curve...
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-left">
          {teams.map((t) => (
            <div key={t.team.id} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="font-bold text-emerald-400">{t.team.name} ({t.team.code})</span>
                <span className="text-[10px] text-slate-500">
                  {t.currentMemberCount} / {t.team.capacity} Members
                </span>
              </div>
              <div className="space-y-1">
                {t.activeAssignments.map((ta) => {
                  const p = participants.find((x) => x.booking.id === ta.bookingId);
                  return (
                    <div key={ta.id} className="bg-slate-950 px-2 py-1 rounded text-[11px] text-slate-300 flex items-center justify-between">
                      <span className="font-bold text-slate-200">{p?.temporaryIdentity?.temporaryCode || ta.bookingId}</span>
                      <span className="text-slate-400">{p?.booking.alias}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
