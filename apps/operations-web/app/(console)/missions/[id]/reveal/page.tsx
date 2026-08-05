"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  calculateRevealReadiness,
  selectPreRevealPreview,
  selectPostRevealPreview,
} from "@/lib/prototype/selectors/reveal";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { RevealCountdownWidget } from "@/components/geo/RevealCountdownWidget";

export default function RevealControlPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const { state, triggerReveal, delayReveal, cancelReveal, role } = useStore();

  const [overrideReason, setOverrideReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const readiness = useMemo(() => calculateRevealReadiness(state, sessionId), [state, sessionId]);
  const prePreview = useMemo(() => selectPreRevealPreview(state, sessionId), [state, sessionId]);

  const firstBookingId = state.bookings.find((b) => b.sessionId === sessionId)?.id || "b-1";
  const postPreview = useMemo(() => selectPostRevealPreview(state, sessionId, firstBookingId), [state, sessionId, firstBookingId]);

  if (!session) {
    return <div className="p-8 text-xs font-mono text-slate-400">Session not found.</div>;
  }

  const handleTrigger = (override?: string) => {
    setErrorMsg(null);
    const res = triggerReveal(sessionId, override, role.id);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setShowOverride(false);
      setOverrideReason("");
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline={`Reveal Command Center · ${session.id}`}
        title={`Reveal Control: ${sessionTitle(state, session.id)}`}
        sub="Authoritative 10-point reveal readiness audit, participant-aware readiness status, trigger reveal, and privacy preview."
        right={
          <div className="flex items-center gap-2">
            {readiness.isReadyToReveal ? (
              <button
                onClick={() => handleTrigger()}
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded"
              >
                🔓 Trigger Reveal Now
              </button>
            ) : (
              <button
                onClick={() => setShowOverride(true)}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded"
              >
                ⚡ Override Blockers & Reveal
              </button>
            )}
            <Link href={`/missions/${session.id}/check-in`}>
              <Button variant="ghost" className="h-8 px-3 text-xs">
                Door Check-In Workspace →
              </Button>
            </Link>
          </div>
        }
      />

      {/* 10-Point Readiness Checklist Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <span className="font-bold text-slate-200 uppercase tracking-wider text-xs flex items-center gap-2">
            <span>🛡️ 10-Point Authoritative Reveal Readiness Checklist</span>
          </span>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
            readiness.isReadyToReveal ? "bg-emerald-950 text-emerald-400 border border-emerald-800" : "bg-red-950 text-red-400 border border-red-800"
          }`}>
            {readiness.isReadyToReveal ? "ALL CHECKS PASSED ✓" : "REVEAL BLOCKED ❌"}
          </span>
        </div>

        {readiness.criticalBlockers.length > 0 && (
          <div className="bg-red-950/60 border border-red-800 p-3 rounded space-y-1">
            <span className="font-bold text-red-300">Critical Blockers:</span>
            <ul className="list-disc list-inside text-red-300/90 text-[11px] space-y-0.5">
              {readiness.criticalBlockers.map((b, idx) => (
                <li key={idx}>{b}</li>
              ))}
            </ul>
          </div>
        )}

        {readiness.warnings.length > 0 && (
          <div className="bg-amber-950/60 border border-amber-800 p-3 rounded space-y-1">
            <span className="font-bold text-amber-300">Operational Warnings:</span>
            <ul className="list-disc list-inside text-amber-300/90 text-[11px] space-y-0.5">
              {readiness.warnings.map((w, idx) => (
                <li key={idx}>{w}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Participant-Aware Readiness Status Table per Correction 6 */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
        <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
          Per-Participant Reveal Readiness Status ({readiness.participantStatuses.length})
        </h3>
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {readiness.participantStatuses.map((p) => (
            <div key={p.bookingId} className="bg-slate-950 border border-slate-800 p-2 rounded flex items-center justify-between text-[11px]">
              <div>
                <span className="font-bold text-slate-200">{p.alias}</span>
                <span className="ml-2 font-mono text-slate-400">({p.bookingId})</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${p.hasTempIdentity && p.isIdentityLocked ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"}`}>
                  ID: {p.isIdentityLocked ? "Locked" : "Unlocked/Missing"}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono ${p.hasTeamAssigned && p.isTeamLocked ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"}`}>
                  Team: {p.isTeamLocked ? "Locked" : "Unlocked/Unassigned"}
                </span>
                {p.isRevealEligible ? (
                  <span className="text-emerald-400 font-bold text-[10px]">READY</span>
                ) : (
                  <span className="text-red-400 font-bold text-[10px]">{p.blockedReason}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Participant View Preview Widget */}
      <RevealCountdownWidget preReveal={prePreview} postReveal={postPreview} />

      {errorMsg && <div className="bg-red-950 border border-red-800 text-red-300 p-3 rounded">{errorMsg}</div>}

      {/* Audited Override Modal */}
      {showOverride && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-800 rounded-lg p-6 max-w-md w-full space-y-4">
            <h4 className="font-bold text-purple-400 text-sm">Audited Reveal Override</h4>
            <p className="text-slate-300">
              Provide an audited operational reason to bypass critical blockers and trigger reveal immediately.
            </p>
            <textarea
              rows={3}
              placeholder="e.g. Lead Coordinator verified venue & staff readiness on site."
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              required
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowOverride(false)}
                className="px-3 py-1 bg-slate-800 text-slate-300 rounded font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleTrigger(overrideReason.trim())}
                className="px-4 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded"
              >
                Execute Audited Reveal Trigger
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
