"use client";

import { useState } from "react";

export function RevealCountdownWidget({
  preReveal,
  postReveal,
}: {
  preReveal: any;
  postReveal?: any;
}) {
  const [viewMode, setViewMode] = useState<"pre" | "post">("pre");

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-4 font-mono text-xs">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div>
          <h4 className="font-bold text-slate-200 uppercase tracking-wider">
            Participant Reveal Preview Simulator
          </h4>
          <p className="text-[11px] text-slate-400">
            Simulate how participant-facing client app displays information before vs after reveal trigger.
          </p>
        </div>
        <div className="flex items-center gap-1.5 bg-slate-950 p-1 rounded border border-slate-800">
          <button
            onClick={() => setViewMode("pre")}
            className={`px-3 py-1 rounded text-[11px] font-bold ${
              viewMode === "pre" ? "bg-purple-600 text-white" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Pre-Reveal View
          </button>
          <button
            onClick={() => setViewMode("post")}
            className={`px-3 py-1 rounded text-[11px] font-bold ${
              viewMode === "post" ? "bg-emerald-600 text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Post-Reveal View
          </button>
        </div>
      </div>

      {viewMode === "pre" ? (
        /* Pre-Reveal View */
        <div className="bg-slate-950 border border-purple-900/60 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-purple-400 text-sm">{preReveal.sessionTitle}</span>
            <span className="px-2 py-0.5 rounded text-[10px] bg-purple-950 text-purple-300 border border-purple-800">
              REVEAL PENDING
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3 text-slate-300">
            <div><strong className="text-slate-500">Joined Count:</strong> {preReveal.joinedCount} Participants</div>
            <div><strong className="text-slate-500">Reveal Countdown:</strong> {preReveal.revealTime}</div>
          </div>

          <div className="space-y-1">
            <span className="text-slate-500 font-bold uppercase text-[10px]">Preparation Checklist:</span>
            <ul className="list-disc list-inside text-slate-400 text-[11px] space-y-0.5">
              {preReveal.checklist?.map((item: string, idx: number) => (
                <li key={idx}>{item}</li>
              ))}
            </ul>
          </div>

          <div className="bg-slate-900 border border-slate-800 p-2.5 rounded text-[10px] text-slate-500 italic">
            🔒 Privacy Shield Active: Teammate identities, venue exact court, and contact info are locked until reveal time.
          </div>
        </div>
      ) : (
        /* Post-Reveal View */
        <div className="bg-slate-950 border border-emerald-900/60 rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div>
              <span className="font-bold text-emerald-400 text-sm">{postReveal?.alias || "Participant"}</span>
              <span className="ml-2 font-mono font-bold text-amber-400 text-xs">({postReveal?.temporaryCode || "CR-07"})</span>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950 text-emerald-300 border border-emerald-800">
              REVEAL UNLOCKED
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-slate-300">
            <div><strong className="text-slate-500">Assigned Team:</strong> <span className="text-emerald-300 font-bold">{postReveal?.teamName || "Unassigned"}</span></div>
            <div><strong className="text-slate-500">Venue & Court:</strong> {postReveal?.venueName} ({postReveal?.playingAreaName})</div>
            <div><strong className="text-slate-500">Check-In Opens:</strong> {postReveal?.reportingTime}</div>
            <div><strong className="text-slate-500">Session Start:</strong> {postReveal?.startTime}</div>
          </div>

          {postReveal?.teammates && postReveal.teammates.length > 0 && (
            <div className="space-y-1">
              <span className="text-slate-500 font-bold uppercase text-[10px]">Your Teammates:</span>
              <div className="flex flex-wrap gap-2 pt-1">
                {postReveal.teammates.map((tm: any, idx: number) => (
                  <div key={idx} className="bg-slate-900 border border-slate-800 px-2 py-1 rounded text-[11px] text-slate-300 flex items-center gap-1.5">
                    <span className="font-bold text-amber-400">{tm.temporaryCode}</span>
                    <span>({tm.alias})</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-slate-900 border border-slate-800 p-2.5 rounded text-[10px] text-slate-400">
            <strong className="text-slate-300">Reporting Note:</strong> {postReveal?.checkInInstructions}
          </div>
        </div>
      )}
    </div>
  );
}
