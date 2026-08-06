"use client";

import { useMemo, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  selectLiveSessionState,
  selectElapsedActiveSeconds,
  selectLiveSessionActionAvailability,
  selectEquipmentReadiness,
  selectCurrentActivitySegment,
  selectSegmentProgress,
} from "@/lib/prototype/selectors/liveSession";
import { selectCheckInSummary, selectStaffReadiness, selectSessionOpenReadiness } from "@/lib/prototype/selectors/checkIn";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { selectSessionFinancialSummary } from "@/lib/prototype/selectors/money";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import {
  MissionWorkspaceHeader,
  MissionStageNavigation,
  MissionBackNavigation,
  getOperationalStatusLabel,
} from "@/components/missions/shared";
import { Play, Pause, AlertTriangle, ShieldAlert, CheckCircle, Clock, Plus, HelpCircle, ChevronRight } from "lucide-react";

export default function LiveOperationsPage() {
  const params = useParams();
  const router = useRouter();
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

  const [safetyModalOpen, setSafetyModalOpen] = useState(false);
  const [endModalOpen, setEndModalOpen] = useState(false);
  const [pauseModalOpen, setPauseModalOpen] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [noteText, setNoteText] = useState("");
  const [noteType, setNoteType] = useState<string>("general");
  const [noteSeverity, setNoteSeverity] = useState<string>("info");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [newStepName, setNewStepName] = useState("");
  const [newStepType, setNewStepType] = useState("Match");
  const [skipStepId, setSkipStepId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState("");

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const lss = useMemo(() => selectLiveSessionState(state, sessionId), [state, sessionId]);
  const elapsed = useMemo(() => selectElapsedActiveSeconds(state, sessionId), [state, sessionId]);
  const actions = useMemo(() => selectLiveSessionActionAvailability(state, sessionId), [state, sessionId]);
  const checkIn = useMemo(() => selectCheckInSummary(state, sessionId), [state, sessionId]);
  const staff = useMemo(() => selectStaffReadiness(state, sessionId), [state, sessionId]);
  const eq = useMemo(() => selectEquipmentReadiness(state, sessionId), [state, sessionId]);
  const handover = useMemo(() => selectSessionOpenReadiness(state, sessionId), [state, sessionId]);
  const segments = useMemo(() => (state.activitySegments ?? []).filter((s) => s.sessionId === sessionId), [state, sessionId]);
  const notes = useMemo(() => (state.liveOperationalNotes ?? []).filter((n) => n.sessionId === sessionId), [state, sessionId]);
  const finance = useMemo(() => selectSessionFinancialSummary(state, sessionId), [state, sessionId]);
  const ledger = useMemo(() => sessionCapacityLedger(state, sessionId), [state, sessionId]);

  const [ticker, setTicker] = useState(elapsed);

  useEffect(() => {
    setTicker(elapsed);
  }, [elapsed]);

  useEffect(() => {
    if (lss.status !== "Live") return;
    const interval = setInterval(() => {
      setTicker((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [lss.status]);

  if (!session) {
    return <div className="p-8 text-xs font-mono text-slate-400">Session not found.</div>;
  }

  // Ticker helper format
  const formatClockTime = (totalSec: number) => {
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    return `${hrs > 0 ? `${hrs}:` : ""}${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

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

  const handlePauseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pauseReason.trim()) return;
    setErrorMsg(null);
    const res = pauseLiveSession(sessionId, pauseReason.trim());
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setPauseModalOpen(false);
      setPauseReason("");
    }
  };

  const handleResume = () => {
    setErrorMsg(null);
    const res = resumeLiveSession(sessionId);
    if (res.error) setErrorMsg(res.error);
  };

  const handleEndSession = () => {
    setErrorMsg(null);
    const res = endLiveSession(sessionId);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setEndModalOpen(false);
    }
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

  const handleCreateStep = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStepName.trim()) return;
    createActivitySegment({
      sessionId,
      name: newStepName.trim(),
      type: newStepType,
    });
    setNewStepName("");
  };

  const handleSkipStepSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!skipStepId || !skipReason.trim()) return;
    skipActivitySegment(sessionId, skipStepId, skipReason.trim());
    setSkipStepId(null);
    setSkipReason("");
  };

  const handleSafetyHelpClick = () => {
    setSafetyModalOpen(true);
  };

  const handleConfirmSafetyPause = () => {
    setErrorMsg(null);
    // Enter emergency mode (simulated)
    const res = enterEmergencyMode({
      sessionId,
      reason: "Safety help requested by operator.",
      immediateAction: "Pause event",
      safetyContactConfirmed: true,
      operatorId: role.id,
      operatorRole: role.name
    });
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setSafetyModalOpen(false);
    }
  };

  const handleExitSafety = () => {
    setErrorMsg(null);
    const res = exitEmergencyMode({
      sessionId,
      exitReason: "Safety conditions restored.",
      operatorId: role.id,
      operatorRole: role.name
    });
    if (res.error) setErrorMsg(res.error);
  };

  // Determine Dominant Primary Action and Explanation text
  let statusExplanation = "Event setup is complete. Waiting to start.";
  let primaryActionBtn = null;

  const isLive = (lss.status as string) === "Live";
  const isPaused = (lss.status as string) === "Paused";
  const isEmergency = (lss.status as string) === "Emergency";
  const isEnded = (lss.status as string) === "Ended" || (lss.status as string) === "Completed";
  const isCompleted = (lss.status as string) === "Completed" || (session.status as string) === "completed";

  if ((lss.status as string) === "Ready" || (lss.status as string) === "scheduled" || (lss.status as string) === "draft") {
    if (actions.canOpen) {
      statusExplanation = "Enough participants and staff are present. Click Open Live Session to start the event.";
      primaryActionBtn = (
        <button
          onClick={handleOpenSession}
          className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl text-sm shadow-[0_0_20px_rgba(52,211,153,0.3)] transition-all flex items-center gap-1.5"
        >
          <Play className="h-4 w-4" /> Ready to Start Event
        </button>
      );
    } else {
      statusExplanation = "Check-in is still in progress. Minimum requirements must be met before starting.";
      primaryActionBtn = (
        <button
          disabled
          className="px-6 py-2.5 bg-white/5 border border-white/10 text-ink-mut font-bold rounded-xl text-sm cursor-not-allowed opacity-65 flex items-center gap-1.5"
        >
          <Clock className="h-4 w-4" /> Waiting for Check-In...
        </button>
      );
    }
  } else if (isLive) {
    statusExplanation = "The session timer is active and match steps are underway.";
    primaryActionBtn = (
      <button
        onClick={() => setPauseModalOpen(true)}
        className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-sm transition-all flex items-center gap-1.5"
      >
        <Pause className="h-4 w-4" /> Pause Event
      </button>
    );
  } else if (isPaused) {
    statusExplanation = `The event is paused. Reason: "${lss.pauseReason || "operator request"}"`;
    primaryActionBtn = (
      <button
        onClick={handleResume}
        className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded-xl text-sm transition-all flex items-center gap-1.5"
      >
        <Play className="h-4 w-4" /> Continue Event
      </button>
    );
  } else if (isEmergency) {
    statusExplanation = `SAFETY MODE ACTIVE: "${lss.emergencyReason || "unspecified"}"`;
    primaryActionBtn = (
      <button
        onClick={handleExitSafety}
        className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded-xl text-sm transition-all flex items-center gap-1.5 animate-pulse"
      >
        <ShieldAlert className="h-4 w-4" /> Review Safety Status (Exit)
      </button>
    );
  } else if (isEnded) {
    statusExplanation = "This event's active runtime has ended. You can now record scores and outcome details.";
    primaryActionBtn = (
      <Link href={`/missions/${sessionId}/results`}>
        <button className="px-6 py-2.5 bg-brand hover:bg-brand-hover text-white font-bold rounded-xl text-sm transition-all flex items-center gap-1.5 shadow-[0_0_20px_rgba(90,103,245,0.4)]">
          Continue to Record Results <ChevronRight className="h-4 w-4" />
        </button>
      </Link>
    );
  }

  // Ready checklist items details
  const totalJoined = ledger.confirmedPaidBookings + ledger.confirmedComplimentaryBookings;
  const checklistItems = [
    { label: "Minimum participants reached", passed: totalJoined >= 8 },
    { label: "Lead coordinator present", passed: staff.leadCoordinator?.status === "checked-in" },
    { label: "Safety staff present", passed: staff.safetyContact?.status === "checked-in" },
    { label: "Venue ready", passed: true },
    { label: "Court ready", passed: true },
    { label: "Teams revealed", passed: session.status !== "draft" },
    { label: "Check-in open", passed: session.status === "check-in-open" || isLive || isPaused || isEnded },
    {
      label: eq.isReady ? "All equipment ready" : `Missing critical equipment`,
      passed: eq.isReady,
      warning: !eq.isReady && eq.criticalMissingCount === 0,
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      {/* Back button and Breadcrumbs */}
      <MissionBackNavigation currentStageName="Run Event" />

      <PageHeader
        overline="Active Live Operations"
        title="Run Event"
        sub="Use this screen while the event is happening to log steps, adjust clock timers, and write observations."
      />

      {/* Global persistent header */}
      <MissionWorkspaceHeader />

      {/* Three step navigator */}
      <MissionStageNavigation />

      {errorMsg && <div className="bg-red-950 border border-red-800 text-red-300 p-3 rounded-xl">{errorMsg}</div>}

      {/* Section 1: Event Status Alerts */}
      <div className={`p-5 rounded-panel border ${
        isEmergency
          ? "bg-red-950/60 border-red-800 text-red-200"
          : isPaused
          ? "bg-amber-950/60 border-amber-800 text-amber-200"
          : isEnded
          ? "bg-slate-900 border-slate-800 text-slate-300"
          : isLive
          ? "bg-emerald-950/50 border-emerald-800 text-emerald-200"
          : "bg-white/3 border-white/5 text-ink-sec"
      } flex flex-wrap items-center justify-between gap-4`}>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-bold uppercase tracking-wider text-xs">Event Status:</span>
            <span className="text-sm font-bold underline">{getOperationalStatusLabel(lss.status)}</span>
          </div>
          <p className="text-[11px] opacity-80 max-w-xl">{statusExplanation}</p>
        </div>
        <div className="flex items-center gap-3">
          {primaryActionBtn}

          {/* Secondary Action - End Event while running */}
          {(isLive || isPaused) && !isEnded && (
            <button
              onClick={() => setEndModalOpen(true)}
              className="px-4 py-2.5 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800/40 font-bold rounded-xl text-xs transition-colors"
            >
              End Event
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT COLUMN */}
        <div className="space-y-6">
          {/* Checklist Card */}
          <div className="glass border border-white/5 rounded-panel p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="font-bold text-ink-lum uppercase tracking-wider">Ready to Start?</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                handover.status === "Ready"
                  ? "bg-emerald-950 text-emerald-400 border border-emerald-800"
                  : handover.status === "At Risk"
                  ? "bg-amber-950 text-amber-300 border border-amber-800"
                  : "bg-red-950 text-red-400 border border-red-800"
              }`}>
                {handover.status.toUpperCase()}
              </span>
            </div>

            <div className="space-y-2">
              {checklistItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between py-1 border-b border-white/2">
                  <span className="text-ink-sec">{item.label}</span>
                  <span className={`font-bold ${item.passed ? "text-emerald-400" : item.warning ? "text-amber-400" : "text-danger"}`}>
                    {item.passed ? "✓ Passed" : item.warning ? "⚠ Warning" : "❌ Blocked"}
                  </span>
                </div>
              ))}
            </div>

            {handover.status !== "Ready" && (
              <div className="bg-red-950/40 border border-red-800/40 p-3 rounded-lg text-[10px] text-red-300 space-y-1">
                <p className="font-bold">Reason: {handover.status === "Blocked" ? "Critical requirements missing." : "At Risk warnings."}</p>
                <p>Action: Verify staff attendance check-ins and returned equipment slots.</p>
              </div>
            )}
          </div>

          {/* Event Clock Card */}
          <div className="glass border border-white/5 rounded-panel p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="font-bold text-ink-lum uppercase tracking-wider">Event Clock</span>
              {isLive && <span className="text-[10px] text-emerald-400 animate-pulse">● LIVE RUNNING</span>}
            </div>

            <div className="bg-black/20 border border-white/5 rounded-xl p-5 text-center space-y-2">
              <div className="text-sm uppercase text-ink-mut">Event Running Time</div>
              <div className="text-4xl md:text-5xl font-extrabold text-emerald-400 tracking-widest font-mono">
                {formatClockTime(ticker)}
              </div>
            </div>

            <div className="flex flex-wrap justify-between gap-4 text-[10px] text-ink-mut">
              <div>Started: <strong className="text-ink-sec">{lss.activeStartedAt ? new Date(lss.activeStartedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"}</strong></div>
              <div>Expected Finish: <strong className="text-ink-sec">{lss.activeStartedAt ? "8:30 PM" : "—"}</strong></div>
            </div>
          </div>

          {/* Live Numbers Card */}
          <div className="glass border border-white/5 rounded-panel p-5 space-y-4">
            <span className="font-bold text-ink-lum uppercase tracking-wider block border-b border-white/5 pb-2">Live Numbers Snapshot</span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
              <div className="bg-white/2 border border-white/5 p-2 rounded-lg">
                <span className="block text-[10px] text-ink-mut">Present</span>
                <span className="text-lg font-bold text-brand">{checkIn.checkedInCount + checkIn.lateCount}</span>
              </div>
              <div className="bg-white/2 border border-white/5 p-2 rounded-lg">
                <span className="block text-[10px] text-ink-mut">Late</span>
                <span className="text-lg font-bold text-amber-400">{checkIn.lateCount}</span>
              </div>
              <div className="bg-white/2 border border-white/5 p-2 rounded-lg">
                <span className="block text-[10px] text-ink-mut">Not Arrived</span>
                <span className="text-lg font-bold text-danger">{checkIn.missingCount}</span>
              </div>
              <div className="bg-white/2 border border-white/5 p-2 rounded-lg">
                <span className="block text-[10px] text-ink-mut">Staff</span>
                <span className="text-lg font-bold text-emerald-400">
                  {staff.leadCoordinator?.status === "checked-in" ? 1 : 0} / 1
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN */}
        <div className="space-y-6">
          {/* Event Plan Card */}
          <div className="glass border border-white/5 rounded-panel p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <span className="font-bold text-ink-lum uppercase tracking-wider">Event Plan</span>
              <span className="text-[10px] text-ink-mut">One Step Active Rule</span>
            </div>

            <div className="space-y-2">
              {segments.map((seg) => {
                const isActive = seg.status === "Active";
                const isPaused = seg.status === "Paused";
                const isCompleted = seg.status === "Completed";
                const isSkipped = seg.status === "Skipped";

                let borderStyle = "border-white/5 bg-slate-950/20";
                if (isActive) borderStyle = "border-brand bg-brand/10 text-white font-bold";
                if (isCompleted) borderStyle = "border-emerald-800 bg-emerald-950/10 text-slate-400";
                if (isSkipped) borderStyle = "border-white/5 bg-white/2 text-ink-mut/60 italic";

                return (
                  <div key={seg.id} className={`p-3 rounded-lg border flex items-center justify-between gap-3 ${borderStyle}`}>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded-full bg-white/5 border border-white/10 flex items-center justify-center text-[10px] text-ink-mut">
                        {seg.sequence}
                      </span>
                      <div>
                        <div className="text-sm font-semibold">{seg.name}</div>
                        <div className="text-[9px] text-ink-mut uppercase tracking-wider">{seg.type}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                        isActive
                          ? "bg-emerald-950 border-emerald-800 text-emerald-400 animate-pulse"
                          : isCompleted
                          ? "bg-slate-900 border-slate-800 text-slate-400"
                          : "bg-white/5 border-white/10 text-ink-mut"
                      }`}>
                        {seg.status}
                      </span>

                      {!isEnded && !isCompleted && !isSkipped && (
                        <>
                          {!isActive && (
                            <button
                              onClick={() => startActivitySegment(sessionId, seg.id)}
                              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded text-[10px] shadow"
                            >
                              Start Step
                            </button>
                          )}
                          {isActive && (
                            <button
                              onClick={() => completeActivitySegment(sessionId, seg.id)}
                              className="px-2 py-1 bg-brand hover:bg-brand-hover text-white font-bold rounded text-[10px]"
                            >
                              Finish Step
                            </button>
                          )}
                          <button
                            onClick={() => setSkipStepId(seg.id)}
                            className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-white/5 text-ink-sec rounded text-[10px]"
                          >
                            Skip
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {!isEnded && (
              <form onSubmit={handleCreateStep} className="pt-2 flex items-center gap-2">
                <input
                  type="text"
                  placeholder="New Event Step Name..."
                  value={newStepName}
                  onChange={(e) => setNewStepName(e.target.value)}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-slate-200"
                />
                <button
                  type="submit"
                  disabled={!newStepName.trim()}
                  className="px-3 py-1 bg-white/5 border border-white/10 hover:bg-white/10 rounded font-bold"
                >
                  + Add Step
                </button>
              </form>
            )}
          </div>

          {/* Needs Attention & Event Notes */}
          <div className="glass border border-white/5 rounded-panel p-5 space-y-4">
            <span className="font-bold text-ink-lum uppercase tracking-wider block border-b border-white/5 pb-2">Needs Attention & Event Notes</span>

            {/* List Notes */}
            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1">
              {notes.map((n) => (
                <div key={n.id} className="p-2.5 rounded-lg bg-white/2 border border-white/5 space-y-1">
                  <div className="flex justify-between items-center text-[10px]">
                    <span className="font-bold text-ink-sec uppercase">{n.type}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${n.severity === "critical" ? "bg-red-950 text-red-400" : "bg-white/5 text-ink-mut"}`}>
                      {n.severity.toUpperCase()}
                    </span>
                  </div>
                  <p className="text-ink-lum">{n.note}</p>
                </div>
              ))}
              {notes.length === 0 && <p className="text-ink-mut text-[11px]">No notes logged yet.</p>}
            </div>

            {!isEnded && (
              <form onSubmit={handleAddNote} className="space-y-2 border-t border-white/5 pt-3">
                <textarea
                  rows={2}
                  placeholder="Log operational observation (e.g. Court net adjusted)..."
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
                  required
                />
                <div className="flex justify-end gap-2">
                  <select
                    value={noteType}
                    onChange={(e) => setNoteType(e.target.value)}
                    className="bg-slate-950 border border-slate-700 rounded px-2 py-1"
                  >
                    <option value="general">General</option>
                    <option value="equipment">Equipment</option>
                    <option value="safety">Safety</option>
                  </select>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded font-bold"
                  >
                    Add Event Note
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Safety Help Button */}
      {!isEnded && (
        <div className="pt-4 border-t border-white/5 flex justify-end">
          <button
            onClick={handleSafetyHelpClick}
            className="px-4 py-2 bg-red-950 hover:bg-red-900 border border-red-800 text-red-300 font-bold rounded-xl flex items-center gap-1.5"
          >
            <ShieldAlert className="h-4 w-4" /> Safety Help
          </button>
        </div>
      )}

      {/* Safety Help Modal */}
      {safetyModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-800 rounded-lg p-6 max-w-md w-full space-y-4 font-mono text-xs">
            <h4 className="font-bold text-red-400 text-sm">Pause and Request Safety Help?</h4>
            <p className="text-slate-300">
              This will immediately pause the event timer, halt active segments, and log a critical safety note.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSafetyModalOpen(false)}
                className="px-3 py-1 bg-slate-800 text-slate-300 rounded font-bold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSafetyPause}
                className="px-4 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded"
              >
                Pause and Open Safety Checklist
              </button>
            </div>
          </div>
        </div>
      )}

      {/* End Event Modal */}
      {endModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-red-800 rounded-lg p-6 max-w-md w-full space-y-4 font-mono text-xs">
            <h4 className="font-bold text-red-400 text-sm">End this event?</h4>
            <p className="text-slate-300">
              Confirm before continuing:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li>The current active step has been completed.</li>
              <li>Participant check-ins are closed.</li>
              <li>Critical equipment statuses are noted.</li>
            </ul>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEndModalOpen(false)}
                className="px-3 py-1 bg-slate-800 text-slate-300 rounded font-bold"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={handleEndSession}
                className="px-4 py-1 bg-red-600 hover:bg-red-500 text-white font-bold rounded"
              >
                End Event
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pause Modal */}
      {pauseModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handlePauseSubmit} className="bg-slate-900 border border-amber-800 rounded-lg p-6 max-w-md w-full space-y-4">
            <h4 className="font-bold text-amber-400 text-sm">Pause Event</h4>
            <p className="text-slate-300">Provide a reason for pausing the event.</p>
            <textarea
              rows={3}
              placeholder="e.g. Equipment repair; court maintenance."
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

      {/* Skip Step Modal */}
      {skipStepId && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleSkipStepSubmit} className="bg-slate-900 border border-white/5 rounded-lg p-6 max-w-md w-full space-y-4">
            <h4 className="font-bold text-ink-lum text-sm">Skip Event Step</h4>
            <p className="text-slate-300">Provide a reason for skipping this step.</p>
            <textarea
              rows={3}
              placeholder="e.g. Teams decided to skip warm-up."
              value={skipReason}
              onChange={(e) => setSkipReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              required
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setSkipStepId(null)}
                className="px-3 py-1 bg-slate-800 text-slate-300 rounded font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1 bg-brand hover:bg-brand-hover text-white font-bold rounded"
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
