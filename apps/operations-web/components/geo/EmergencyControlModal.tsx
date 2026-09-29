"use client";

import { useState } from "react";

export function EmergencyControlModal({
  sessionId,
  operatorRole,
  isEmergencyActive,
  onEnterEmergency,
  onExitEmergency,
  onClose,
}: {
  sessionId: string;
  operatorRole: string;
  isEmergencyActive: boolean;
  onEnterEmergency: (params: { reason: string; immediateAction: string; safetyContactConfirmed: boolean }) => void;
  onExitEmergency: (exitReason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [immediateAction, setImmediateAction] = useState("");
  const [safetyContactConfirmed, setSafetyContactConfirmed] = useState(true);
  const [exitReason, setExitReason] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleEnterSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!reason.trim() || !immediateAction.trim()) {
      setErrorMsg("Mandatory emergency reason and immediate action are required.");
      return;
    }

    onEnterEmergency({
      reason: reason.trim(),
      immediateAction: immediateAction.trim(),
      safetyContactConfirmed,
    });
  };

  const handleExitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!exitReason.trim()) {
      setErrorMsg("Mandatory exit justification is required.");
      return;
    }

    onExitEmergency(exitReason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 backdrop-blur-sm flex items-center justify-center p-4 font-mono text-xs">
      <div className="bg-slate-50 border border-red-200 rounded-lg p-6 max-w-lg w-full space-y-4 shadow-2xl">
        {/* Header & Mandatory Banners per Correction 8 & 9 */}
        <div className="space-y-2">
          <div className="flex items-center justify-between border-b border-red-200 pb-2">
            <span className="font-bold text-red-600 text-sm flex items-center gap-1.5">
              <span>🚨 Emergency Mode Operational Control</span>
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] bg-red-50 text-red-700 border border-red-200 uppercase font-bold">
              ROLE: {operatorRole}
            </span>
          </div>

          <div className="bg-red-200 border border-red-200 p-2.5 rounded text-[11px] text-red-700 italic font-medium">
            “Safety escalation placeholder — full incident workflow is handled in SA-P2H.”
          </div>

          <div className="text-[10px] text-slate-500 italic">
            “Prototype role simulation — not production authorization.”
          </div>
        </div>

        {!isEmergencyActive ? (
          /* Enter Emergency Mode Form */
          <form onSubmit={handleEnterSubmit} className="space-y-4">
            <p className="text-slate-700">
              Activating Emergency Mode will immediately pause the live clock and active activity segment for session <strong className="text-red-600">{sessionId}</strong>.
            </p>

            <div>
              <label className="text-slate-500 block mb-1 font-bold uppercase">
                Mandatory Emergency Reason *:
              </label>
              <textarea
                rows={2}
                placeholder="e.g. Participant medical emergency on court; severe weather threat."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                required
              />
            </div>

            <div>
              <label className="text-slate-500 block mb-1 font-bold uppercase">
                Immediate Action Taken *:
              </label>
              <input
                type="text"
                placeholder="e.g. Activity halted, first aid dispatch requested."
                value={immediateAction}
                onChange={(e) => setImmediateAction(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                required
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="safetyConfirmed"
                checked={safetyContactConfirmed}
                onChange={(e) => setSafetyContactConfirmed(e.target.checked)}
                className="rounded border-slate-200"
              />
              <label htmlFor="safetyConfirmed" className="text-slate-700 font-bold">
                Safety & Moderation Contact Confirmed On Site
              </label>
            </div>

            {errorMsg && <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded">{errorMsg}</div>}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded"
              >
                🚨 ACTIVATE EMERGENCY MODE
              </button>
            </div>
          </form>
        ) : (
          /* Exit Emergency Mode Form (Returns to Paused!) */
          <form onSubmit={handleExitSubmit} className="space-y-4">
            <div className="bg-amber-200 border border-amber-200 p-3 rounded text-amber-700 space-y-1">
              <span className="font-bold block text-sm">Emergency Mode Currently Active</span>
              <p className="text-[11px] text-amber-300/90">
                Exiting emergency mode will transition the session to <strong className="text-ink-lum">Paused</strong> state. The operator must explicitly review conditions and click Resume to restart activity.
              </p>
            </div>

            <div>
              <label className="text-slate-500 block mb-1 font-bold uppercase">
                Mandatory Emergency Exit Justification *:
              </label>
              <textarea
                rows={3}
                placeholder="e.g. First aid cleared; court environment verified safe by Lead Coordinator."
                value={exitReason}
                onChange={(e) => setExitReason(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded p-2 text-slate-800"
                required
              />
            </div>

            {errorMsg && <div className="bg-red-50 border border-red-200 text-red-700 p-2 rounded">{errorMsg}</div>}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded"
              >
                Exit Emergency Mode (Return to Paused)
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
