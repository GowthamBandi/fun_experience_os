"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectCompletionChecklist } from "@/lib/prototype/selectors/completion";
import { selectLiveSessionState } from "@/lib/prototype/selectors/liveSession";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";

export default function SessionCompletionPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const { state, completeLiveSession, role } = useStore();

  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const liveState = useMemo(() => selectLiveSessionState(state, sessionId), [state, sessionId]);
  const checklist = useMemo(() => selectCompletionChecklist(state, sessionId), [state, sessionId]);

  const isCompleted = liveState.status === "Completed" || session?.status === "completed";

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
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline={`Completion Workspace · ${session.id}`}
        title={`Session Completion: ${sessionTitle(state, session.id)}`}
        sub="Authoritative 11-point completion readiness checklist, critical blocker resolution, and immutable completion snapshot creation."
        right={
          <div className="flex items-center gap-2">
            {!isCompleted ? (
              checklist.isReadyToComplete ? (
                <button
                  onClick={() => handleComplete()}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded"
                >
                  ✓ Finalize & Complete Session
                </button>
              ) : (
                <button
                  onClick={() => setOverrideModalOpen(true)}
                  className="px-4 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded"
                >
                  ⚡ Audited Completion Override
                </button>
              )
            ) : (
              <span className="px-3 py-1 bg-emerald-950 text-emerald-400 border border-emerald-800 rounded font-bold">
                SESSION COMPLETED & LOCKED
              </span>
            )}
            <Link href={`/missions/${session.id}/summary`}>
              <Button variant="ghost" className="h-8 px-3 text-xs">
                Summary Workspace →
              </Button>
            </Link>
          </div>
        }
      />

      {errorMsg && <div className="bg-red-950 border border-red-800 text-red-300 p-3 rounded">{errorMsg}</div>}

      {/* Checklist Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <span className="font-bold text-slate-200 uppercase tracking-wider text-xs flex items-center gap-2">
            <span>🛡️ Authoritative 11-Point Completion Checklist</span>
          </span>
          <span
            className={`px-2.5 py-0.5 rounded text-[10px] font-bold ${
              checklist.isReadyToComplete
                ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                : "bg-red-950 text-red-400 border border-red-800"
            }`}
          >
            {checklist.isReadyToComplete ? "READY TO COMPLETE ✓" : "COMPLETION BLOCKED ❌"}
          </span>
        </div>

        <div className="space-y-2">
          {checklist.items.map((item) => (
            <div
              key={item.key}
              className={`p-3 rounded-lg border flex flex-wrap items-center justify-between gap-3 ${
                item.status === "passed"
                  ? "bg-slate-950 border-slate-800 text-slate-200"
                  : item.status === "warning"
                  ? "bg-amber-950/40 border-amber-800/80 text-amber-200"
                  : "bg-red-950/60 border-red-800 text-red-200"
              }`}
            >
              <div>
                <div className="font-bold text-sm flex items-center gap-2">
                  <span>{item.label}</span>
                  {item.isCritical && (
                    <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-950 text-red-400 border border-red-800 font-bold">
                      CRITICAL
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400">
                  Evidence: {item.evidence}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    item.status === "passed"
                      ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                      : item.status === "warning"
                      ? "bg-amber-950 text-amber-300 border border-amber-800"
                      : "bg-red-950 text-red-400 border border-red-800"
                  }`}
                >
                  {item.status.toUpperCase()}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Audited Completion Override Modal */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-purple-800 rounded-lg p-6 max-w-md w-full space-y-4">
            <h4 className="font-bold text-purple-300 text-sm">Audited Completion Override</h4>
            <p className="text-slate-300">
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
                className="px-4 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded"
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
