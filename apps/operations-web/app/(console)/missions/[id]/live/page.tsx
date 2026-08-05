"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  selectLiveSessionState,
  selectElapsedActiveSeconds,
  selectLiveSessionActionAvailability,
  selectEquipmentReadiness,
} from "@/lib/prototype/selectors/liveSession";
import { selectCheckInSummary, selectStaffReadiness, selectSessionOpenReadiness } from "@/lib/prototype/selectors/checkIn";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { LiveClockWidget } from "@/components/geo/LiveClockWidget";
import { RunOfShowWorkspace } from "@/components/geo/RunOfShowWorkspace";
import { EquipmentChecklistWidget } from "@/components/geo/EquipmentChecklistWidget";
import { EmergencyControlModal } from "@/components/geo/EmergencyControlModal";

export default function LiveOperationsPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const {
    state,
    openSession,
    startLiveSession,
    pauseLiveSession,
    resumeLiveSession,
    enterEmergencyMode,
    exitEmergencyMode,
    endLiveSession,
    createActivitySegment,
    startActivitySegment,
    completeActivitySegment,
    skipActivitySegment,
    addLiveOperationalNote,
    updateEquipmentStatus,
    role,
  } = useStore();

  const [emergencyModalOpen, setEmergencyModalOpen] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<any>("general");
  const [noteSeverity, setNoteSeverity] = useState<any>("info");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const liveState = useMemo(() => selectLiveSessionState(state, sessionId), [state, sessionId]);
  const elapsed = useMemo(() => selectElapsedActiveSeconds(state, sessionId), [state, sessionId]);
  const actions = useMemo(() => selectLiveSessionActionAvailability(state, sessionId), [state, sessionId]);
  const checkIn = useMemo(() => selectCheckInSummary(state, sessionId), [state, sessionId]);
  const staff = useMemo(() => selectStaffReadiness(state, sessionId), [state, sessionId]);
  const eq = useMemo(() => selectEquipmentReadiness(state, sessionId), [state, sessionId]);
  const handover = useMemo(() => selectSessionOpenReadiness(state, sessionId), [state, sessionId]);
  const segments = useMemo(() => (state.activitySegments ?? []).filter((s) => s.sessionId === sessionId), [state, sessionId]);
  const notes = useMemo(() => (state.liveOperationalNotes ?? []).filter((n) => n.sessionId === sessionId), [state, sessionId]);

  if (!session) {
    return <div className="p-8 text-xs font-mono text-slate-400">Session not found.</div>;
  }

  const handleOpenSession = () => {
    setErrorMsg(null);
    const res = openSession(sessionId);
    if (res.error) setErrorMsg(res.error);
  };

  const handleStartClock = () => {
    setErrorMsg(null);
    const res = startLiveSession(sessionId);
    if (res.error) setErrorMsg(res.error);
  };

  const handlePause = (reason: string) => {
    setErrorMsg(null);
    const res = pauseLiveSession(sessionId, reason);
    if (res.error) setErrorMsg(res.error);
  };

  const handleResume = () => {
    setErrorMsg(null);
    const res = resumeLiveSession(sessionId);
    if (res.error) setErrorMsg(res.error);
  };

  const handleEndSession = () => {
    setErrorMsg(null);
    const res = endLiveSession(sessionId);
    if (res.error) setErrorMsg(res.error);
  };

  const handleAddNote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteText.trim()) return;
    addLiveOperationalNote({
      sessionId,
      type: noteType,
      severity: noteSeverity,
      note: noteText.trim(),
    });
    setNoteText("");
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline={`Live Operations Command Center · ${session.id}`}
        title={`Live Control: ${sessionTitle(state, session.id)}`}
        sub="Runtime session clock, run-of-show segment execution, equipment operations, operational notes, and emergency control."
        right={
          <div className="flex items-center gap-2">
            {actions.canOpen && (
              <button
                onClick={handleOpenSession}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded"
              >
                🔓 Open Live Session
              </button>
            )}

            {actions.canEmergency && (
              <button
                onClick={() => setEmergencyModalOpen(true)}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white font-bold rounded"
              >
                🚨 Emergency Mode
              </button>
            )}

            {actions.canExitEmergency && (
              <button
                onClick={() => setEmergencyModalOpen(true)}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded animate-pulse"
              >
                ⚠️ Exit Emergency Mode
              </button>
            )}

            <Link href={`/missions/${session.id}/results`}>
              <Button variant="ghost" className="h-8 px-3 text-xs">
                Results Workspace →
              </Button>
            </Link>
          </div>
        }
      />

      {/* Handover & Session Opening Gate Card */}
      <div className={`p-4 rounded-lg border space-y-2 ${
        handover.status === "Ready"
          ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
          : handover.status === "At Risk"
          ? "bg-amber-950/60 border-amber-800 text-amber-300"
          : "bg-red-950/60 border-red-800 text-red-300"
      }`}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm flex items-center gap-2">
            <span>🏁 Session Opening Gate:</span>
            <span className="uppercase font-bold underline">{handover.status}</span>
          </span>
          <span className="text-[11px] italic">
            “Immediate prototype-state updates — live operational view”
          </span>
        </div>
        <div className="text-[11px] space-y-1">
          <div><strong className="text-slate-400">Attendance Status:</strong> {checkIn.checkedInCount + checkIn.lateCount} Present ({checkIn.expectedCount} Expected)</div>
          <div><strong className="text-slate-400">Staffing Status:</strong> Lead: {staff.leadCoordinator?.status || "missing"} | Safety: {staff.safetyContact?.status || "missing"}</div>
          <div><strong className="text-slate-400">Equipment Status:</strong> {eq.isReady ? "All Critical Equipment Ready" : `Missing Critical: ${eq.criticalMissingNames.join(", ")}`}</div>
        </div>
      </div>

      {errorMsg && <div className="bg-red-950 border border-red-800 text-red-300 p-3 rounded">{errorMsg}</div>}

      {/* Live Running Clock Widget */}
      <LiveClockWidget
        liveState={liveState}
        elapsedSeconds={elapsed}
        onStart={handleStartClock}
        onPause={handlePause}
        onResume={handleResume}
        onEnd={handleEndSession}
      />

      {/* Grid: Run-of-Show & Equipment Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RunOfShowWorkspace
          segments={segments}
          onStartSegment={(segId) => startActivitySegment(sessionId, segId)}
          onCompleteSegment={(segId) => completeActivitySegment(sessionId, segId)}
          onSkipSegment={(segId, reason) => skipActivitySegment(sessionId, segId, reason)}
          onCreateSegment={(name, type) => createActivitySegment({ sessionId, name, type })}
          isReadOnly={actions.isReadOnly}
        />

        <EquipmentChecklistWidget
          items={eq.items}
          onUpdateStatus={(eqId, updates) => updateEquipmentStatus({ sessionId, equipmentId: eqId, ...updates })}
          isReadOnly={actions.isReadOnly}
        />
      </div>

      {/* Live Operational Notes Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
        <h4 className="font-bold text-slate-200 uppercase tracking-wider text-xs flex items-center gap-2">
          <span>📝 Live Operational Notes & Incident Observations</span>
        </h4>

        {!actions.isReadOnly && (
          <form onSubmit={handleAddNote} className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={noteType}
                onChange={(e) => setNoteType(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200"
              >
                <option value="general">General Note</option>
                <option value="staff">Staff Note</option>
                <option value="equipment">Equipment Issue</option>
                <option value="venue">Venue Issue</option>
                <option value="safety">Safety Observation</option>
                <option value="timing">Timing Delay</option>
                <option value="rule">Rule Clarification</option>
              </select>

              <select
                value={noteSeverity}
                onChange={(e) => setNoteSeverity(e.target.value)}
                className="bg-slate-950 border border-slate-700 rounded px-2 py-1 text-slate-200"
              >
                <option value="info">Info</option>
                <option value="warning">Warning</option>
                <option value="critical">Critical</option>
              </select>
            </div>

            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Log operational observation (e.g. Court 2 net tension adjusted)..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              />
              <button
                type="submit"
                disabled={!noteText.trim()}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded"
              >
                Add Log Note
              </button>
            </div>
          </form>
        )}

        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="bg-slate-950 border border-slate-800 p-2.5 rounded flex items-center justify-between text-slate-300">
              <div>
                <span className="text-slate-500 font-bold">[{n.time}]</span>{" "}
                <span className="font-bold text-amber-400">[{n.type.toUpperCase()}]</span>{" "}
                <span>{n.note}</span>
              </div>
              <span className="text-[10px] text-slate-500">Op: {n.operatorId}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Emergency Control Modal */}
      {emergencyModalOpen && (
        <EmergencyControlModal
          sessionId={sessionId}
          operatorRole={role.id}
          isEmergencyActive={liveState.status === "Emergency"}
          onEnterEmergency={(params) => {
            const res = enterEmergencyMode({
              sessionId,
              ...params,
              operatorId: role.id,
              operatorRole: role.id,
            });
            if (res.error) setErrorMsg(res.error);
            else setEmergencyModalOpen(false);
          }}
          onExitEmergency={(exitReason) => {
            const res = exitEmergencyMode({
              sessionId,
              exitReason,
              operatorId: role.id,
              operatorRole: role.id,
            });
            if (res.error) setErrorMsg(res.error);
            else setEmergencyModalOpen(false);
          }}
          onClose={() => setEmergencyModalOpen(false)}
        />
      )}
    </div>
  );
}
