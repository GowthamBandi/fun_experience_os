"use client";

import { useState, useEffect } from "react";
import type { LiveSessionState } from "@/lib/prototype/entities";

export function LiveClockWidget({
  liveState,
  elapsedSeconds,
  onStart,
  onPause,
  onResume,
  onEnd,
  onManualAdvance,
}: {
  liveState: LiveSessionState;
  elapsedSeconds: number;
  onStart: () => void;
  onPause: (reason: string) => void;
  onResume: () => void;
  onEnd: () => void;
  onManualAdvance?: (seconds: number) => void;
}) {
  const [ticker, setTicker] = useState(elapsedSeconds);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState("");

  useEffect(() => {
    setTicker(elapsedSeconds);
  }, [elapsedSeconds]);

  useEffect(() => {
    if (liveState.status !== "Live") return;
    const interval = setInterval(() => {
      setTicker((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [liveState.status]);

  const formatTime = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs > 0 ? `${hrs}:` : ""}${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  const handlePauseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pauseReason.trim()) return;
    onPause(pauseReason.trim());
    setPauseModalOpen(false);
    setPauseReason("");
  };

  const isLive = liveState.status === "Live";
  const isPaused = liveState.status === "Paused";
  const isEmergency = liveState.status === "Emergency";
  const isEnded = liveState.status === "Ended" || liveState.status === "Completed";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 font-mono text-xs space-y-4 shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-200 uppercase tracking-wider text-xs">
            ⏱️ Runtime Session Clock
          </span>
          <span
            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
              isLive
                ? "bg-emerald-950 text-emerald-400 border border-emerald-800 animate-pulse"
                : isPaused
                ? "bg-amber-950 text-amber-300 border border-amber-800"
                : isEmergency
                ? "bg-red-950 text-red-400 border border-red-800 animate-ping"
                : "bg-slate-800 text-slate-400"
            }`}
          >
            {liveState.status.toUpperCase()}
          </span>
        </div>
        <div className="text-[10px] text-slate-500">
          Timestamp Derivation (No Double-Counting)
        </div>
      </div>

      {/* Main Digital Clock Display */}
      <div className="bg-slate-950 border border-slate-800 rounded-lg p-6 text-center space-y-2 relative overflow-hidden">
        <div className="text-4xl md:text-5xl font-extrabold font-mono tracking-widest text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.3)]">
          {formatTime(ticker)}
        </div>

        <div className="flex items-center justify-center gap-4 text-[11px] text-slate-400 pt-1">
          <span>Accumulated: <strong className="text-slate-200">{liveState.accumulatedActiveSeconds}s</strong></span>
          {liveState.activeStartedAt && (
            <span>Active Started: <strong className="text-emerald-300">{new Date(liveState.activeStartedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</strong></span>
          )}
          {liveState.pausedAt && (
            <span>Paused At: <strong className="text-amber-300">{new Date(liveState.pausedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong></span>
          )}
        </div>
      </div>

      {/* Clock Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex items-center gap-2">
          {!isLive && !isPaused && !isEmergency && !isEnded && (
            <button
              onClick={onStart}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded"
            >
              ▶ Start Session Clock
            </button>
          )}

          {isLive && (
            <button
              onClick={() => setPauseModalOpen(true)}
              className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded"
            >
              ⏸ Pause Session
            </button>
          )}

          {isPaused && !isEmergency && (
            <button
              onClick={onResume}
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded"
            >
              ▶ Resume Session
            </button>
          )}

          {(isLive || isPaused) && !isEnded && (
            <button
              onClick={onEnd}
              className="px-4 py-1.5 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 font-bold rounded"
            >
              ⏹ End Session
            </button>
          )}
        </div>

        {/* Prototype-only Manual Advance Controls */}
        {onManualAdvance && !isEnded && (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-500">Advance:</span>
            <button
              onClick={() => onManualAdvance(60)}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px]"
            >
              +1 Min
            </button>
            <button
              onClick={() => onManualAdvance(300)}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px]"
            >
              +5 Mins
            </button>
          </div>
        )}
      </div>

      {/* Pause Modal */}
      {pauseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handlePauseSubmit} className="bg-slate-900 border border-amber-800 rounded-lg p-6 max-w-md w-full space-y-4">
            <h4 className="font-bold text-amber-400 text-sm">Pause Live Session</h4>
            <p className="text-slate-300">
              Provide a mandatory operational pause reason. Elapsed active time accumulation will halt immediately.
            </p>
            <textarea
              rows={3}
              placeholder="e.g. Weather delay; court maintenance; rule clarification."
              value={pauseReason}
              onChange={(e) => setPauseReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              required
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPauseModalOpen(false)}
                className="px-3 py-1 bg-slate-800 text-slate-300 rounded font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded"
              >
                Confirm Pause
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
