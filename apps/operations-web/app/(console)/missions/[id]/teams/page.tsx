"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectSessionParticipantPool } from "@/lib/prototype/selectors/identity";
import { selectSessionTeams, selectTeamAllocationReadiness } from "@/lib/prototype/selectors/teams";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { TheFormationAnimation } from "@/components/geo/TheFormationAnimation";

export default function TeamFormationPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const {
    state,
    allocateTeamsRandomly,
    moveTeamParticipant,
    lockTeams,
    unlockTeamsWithOverride,
  } = useStore();

  const [animating, setAnimating] = useState(false);
  const [selectedBookingToMove, setSelectedBookingToMove] = useState<string | null>(null);
  const [targetTeamId, setTargetTeamId] = useState<string>("");
  const [moveReason, setMoveReason] = useState<string>("");
  const [overrideReason, setOverrideReason] = useState<string>("");
  const [showOverrideModal, setShowOverrideModal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const pool = useMemo(() => selectSessionParticipantPool(state, sessionId), [state, sessionId]);
  const teams = useMemo(() => selectSessionTeams(state, sessionId), [state, sessionId]);
  const readiness = useMemo(() => selectTeamAllocationReadiness(state, sessionId), [state, sessionId]);

  if (!session) {
    return <div className="p-8 text-xs font-mono text-slate-400">Session not found.</div>;
  }

  const handleRunAllocation = () => {
    setAnimating(true);
    allocateTeamsRandomly(sessionId);
  };

  const handleMoveParticipant = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!selectedBookingToMove || !targetTeamId || !moveReason.trim()) {
      setErrorMsg("Select a participant, target team, and provide an operational move reason.");
      return;
    }

    const res = moveTeamParticipant({
      sessionId,
      bookingId: selectedBookingToMove,
      targetTeamId,
      reason: moveReason.trim(),
    });

    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setSelectedBookingToMove(null);
      setMoveReason("");
    }
  };

  const handleUnlockOverride = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideReason.trim()) return;
    unlockTeamsWithOverride(sessionId, overrideReason.trim());
    setShowOverrideModal(false);
    setOverrideReason("");
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline={`Team Formation Workspace · ${session.id}`}
        title={`Team Allocation: ${sessionTitle(state, session.id)}`}
        sub="Deterministic random allocation ('The Formation'), manual team movement with history preservation, and team lock controls."
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunAllocation}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded"
            >
              ⚡ Run &quot;The Formation&quot; Allocation
            </button>
            {!readiness.isLocked ? (
              <button
                onClick={() => lockTeams(sessionId)}
                disabled={!readiness.isFullyAssigned}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-bold rounded"
              >
                🔒 Lock Teams
              </button>
            ) : (
              <button
                onClick={() => setShowOverrideModal(true)}
                className="px-3 py-1.5 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 font-bold rounded"
              >
                🔓 Audited Unlock Override
              </button>
            )}
            <Link href={`/missions/${session.id}/reveal`}>
              <Button variant="ghost" className="h-8 px-3 text-xs">
                Reveal Control →
              </Button>
            </Link>
          </div>
        }
      />

      {/* Allocation Method Banner per Correction 5 */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 text-slate-300">
        <div>
          <span className="font-bold text-slate-200">Active Allocation Mode:</span> Random Distribution & Manual Adjustment
        </div>
        <div className="text-purple-400/80 text-[11px] italic">
          “Future allocation model — not available in this prototype.” (Balanced Allocation)
        </div>
      </div>

      {/* "The Formation" Interaction Area */}
      {animating && (
        <TheFormationAnimation
          participants={pool}
          teams={teams}
          onComplete={() => setAnimating(false)}
        />
      )}

      {/* Team Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {teams.map((t) => (
          <div key={t.team.id} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div>
                <span className="font-bold text-emerald-400 text-sm">{t.team.name}</span>
                <span className="ml-2 text-slate-400 text-xs font-bold">[{t.team.code}]</span>
              </div>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                t.team.status === "locked" ? "bg-amber-950 text-amber-300 border border-amber-800" : "bg-slate-800 text-slate-300"
              }`}>
                {t.team.status.toUpperCase()} ({t.currentMemberCount} / {t.team.capacity})
              </span>
            </div>

            <div className="space-y-1.5">
              {t.activeAssignments.map((ta) => {
                const p = pool.find((x) => x.booking.id === ta.bookingId);
                return (
                  <div key={ta.id} className="bg-slate-950 border border-slate-800 p-2 rounded flex items-center justify-between text-slate-300">
                    <div>
                      <span className="font-bold text-amber-400">{p?.temporaryIdentity?.temporaryCode || "CR-??"}</span>
                      <span className="ml-2 font-medium text-slate-200">{p?.booking.alias}</span>
                    </div>
                    {!readiness.isLocked && (
                      <button
                        onClick={() => setSelectedBookingToMove(ta.bookingId)}
                        className="text-[10px] text-emerald-400 hover:underline"
                      >
                        Move
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Move Participant Form */}
      {selectedBookingToMove && (
        <form onSubmit={handleMoveParticipant} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="font-bold text-slate-200 uppercase tracking-wider text-xs">
            Move Participant: {selectedBookingToMove}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <span className="text-slate-400 block mb-1">Target Team:</span>
              <select
                value={targetTeamId}
                onChange={(e) => setTargetTeamId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
                required
              >
                <option value="">Select Target Team...</option>
                {teams.map((t) => (
                  <option key={t.team.id} value={t.team.id}>
                    {t.team.name} ({t.currentMemberCount}/{t.team.capacity})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span className="text-slate-400 block mb-1">Mandatory Operational Reason:</span>
              <input
                type="text"
                placeholder="e.g. Balancing play position preference"
                value={moveReason}
                onChange={(e) => setMoveReason(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
                required
              />
            </div>
          </div>

          {errorMsg && <div className="bg-red-950 border border-red-800 text-red-300 p-2 rounded">{errorMsg}</div>}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setSelectedBookingToMove(null)}
              className="px-3 py-1 bg-slate-800 text-slate-300 rounded font-bold"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded"
            >
              Execute Move & Preserve History
            </button>
          </div>
        </form>
      )}

      {/* Unlock Override Modal */}
      {showOverrideModal && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleUnlockOverride} className="bg-slate-900 border border-red-800 rounded-lg p-6 max-w-md w-full space-y-4">
            <h4 className="font-bold text-red-400 text-sm">Audited Team Unlock Override</h4>
            <p className="text-slate-300">
              Unlocking teams after locking requires an audited justification reason.
            </p>
            <textarea
              rows={3}
              placeholder="e.g. Late participant replacement requested by Lead Coordinator."
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              required
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowOverrideModal(false)}
                className="px-3 py-1 bg-slate-800 text-slate-300 rounded font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1 bg-red-950 border border-red-800 text-red-300 font-bold rounded"
              >
                Confirm Audited Unlock
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
