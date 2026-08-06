"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { sessionTitle, venueName } from "@/lib/prototype/selectors/lookups";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { selectSessionFinancialSummary } from "@/lib/prototype/selectors/money";
import { selectCheckInSummary } from "@/lib/prototype/selectors/checkIn";
import { selectLiveSessionState } from "@/lib/prototype/selectors/liveSession";
import { selectCompletionChecklist } from "@/lib/prototype/selectors/completion";
import { inr, fillRate } from "@/lib/format";
import { Badge, FillMeter } from "@/components/ui/primitives";
import { AlertTriangle, Clock, ArrowLeft, ShieldAlert } from "lucide-react";

export function getOperationalStatusLabel(status: string) {
  if (status === "Ready" || status === "scheduled" || status === "draft") return "Ready to Start";
  if (status === "Live" || status === "live") return "Running";
  if (status === "Paused" || status === "paused") return "Paused";
  if (status === "Emergency" || status === "emergency") return "Safety Mode Active";
  if (status === "Ended" || status === "ended") return "Ended";
  if (status === "Completed" || status === "completed") return "Completed";
  return status;
}

// ---------------------------------------------------------
// 1. Mission Workspace Header
// ---------------------------------------------------------
export function MissionWorkspaceHeader() {
  const params = useParams();
  const sessionId = params.id as string;
  const { state } = useStore();

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const lss = useMemo(() => selectLiveSessionState(state, sessionId), [state, sessionId]);
  const ledger = useMemo(() => sessionCapacityLedger(state, sessionId), [state, sessionId]);
  const checkIn = useMemo(() => selectCheckInSummary(state, sessionId), [state, sessionId]);
  const finance = useMemo(() => selectSessionFinancialSummary(state, sessionId), [state, sessionId]);

  if (!session) return null;

  const venue = venueName(state, session.venueId);
  const statusLabel = getOperationalStatusLabel(lss.status || session.status);

  // Refund exceptions pending
  const pendingRefundAmt = (state.refundExceptions ?? [])
    .filter((re) => re.sessionId === sessionId && re.status === "recommended")
    .reduce((sum, r) => sum + r.amount, 0);

  const totalRefunded = finance.totalRefunded || 0;
  const netCollected = finance.grossCollected - totalRefunded - pendingRefundAmt;

  return (
    <div className="glass rounded-panel p-5 border border-white/5 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        {/* Left: Session Info */}
        <div className="space-y-1">
          <h1 className="text-xl font-bold text-ink-lum">{sessionTitle(state, session.id)}</h1>
          <p className="text-xs text-ink-mut">
            {session.date} · {session.startTime} · {venue}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[10px] text-ink-mut uppercase tracking-wider font-semibold">Status:</span>
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${
              lss.status === "Live"
                ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
                : lss.status === "Paused"
                ? "bg-amber-950/60 border-amber-800 text-amber-300 animate-pulse"
                : lss.status === "Emergency"
                ? "bg-red-950/60 border-red-800 text-red-300 animate-bounce"
                : lss.status === "Completed"
                ? "bg-slate-900 border-slate-800 text-slate-400"
                : "bg-white/5 border-white/10 text-ink-sec"
            }`}>
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Middle: Slots Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 bg-white/2 border border-white/5 rounded-xl p-3 text-center min-w-[280px]">
          <div className="px-2">
            <span className="block text-[9px] text-ink-mut uppercase font-semibold">Total Slots</span>
            <span className="text-sm font-bold text-ink-lum">{ledger.sellableCapacity}</span>
          </div>
          <div className="px-2 border-l border-white/5">
            <span className="block text-[9px] text-ink-mut uppercase font-semibold" title="Confirmed participants with active bookings">Joined</span>
            <span className="text-sm font-bold text-brand">{ledger.confirmedPaidBookings + ledger.confirmedComplimentaryBookings}</span>
          </div>
          <div className="px-2 border-l border-white/5">
            <span className="block text-[9px] text-ink-mut uppercase font-semibold" title="Participants physically checked in">Checked In</span>
            <span className="text-sm font-bold text-[#5fd7a3]">{checkIn.checkedInCount + checkIn.lateCount}</span>
          </div>
          <div className="px-2 border-l border-white/5">
            <span className="block text-[9px] text-ink-mut uppercase font-semibold" title="Remaining open sellable slots">Left</span>
            <span className="text-sm font-bold text-ink-sec">{ledger.remainingSellableCapacity}</span>
          </div>
          <div className="px-2 border-l border-white/5">
            <span className="block text-[9px] text-ink-mut uppercase font-semibold" title="Active waiting list count">Waiting</span>
            <span className="text-sm font-bold text-[#ffd28a]">{ledger.waitlistCount}</span>
          </div>
        </div>

        {/* Right: Revenue Snapshot */}
        <div className="bg-white/4 border border-white/5 rounded-xl p-3 space-y-1 text-right min-w-[180px]">
          <div className="flex justify-between gap-4 text-[10px]">
            <span className="text-ink-mut">Collected:</span>
            <span className="font-mono text-ink-lum">{inr(finance.grossCollected)}</span>
          </div>
          {(totalRefunded > 0 || pendingRefundAmt > 0) && (
            <div className="flex justify-between gap-4 text-[10px]">
              <span className="text-danger">Refunds:</span>
              <span className="font-mono text-danger">-{inr(totalRefunded + pendingRefundAmt)}</span>
            </div>
          )}
          <div className="flex justify-between gap-4 text-[11px] border-t border-white/5 pt-1 font-bold">
            <span className="text-ink-mut">Net Total:</span>
            <span className="font-mono text-[#5fd7a3]">{inr(netCollected)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// 2. Mission Stage Navigation (Step progress strip)
// ---------------------------------------------------------
export type StageStatus = "Available" | "Current" | "Completed" | "Needs Attention" | "Locked";

export function MissionStageNavigation() {
  const params = useParams();
  const pathname = usePathname();
  const sessionId = params.id as string;
  const { state } = useStore();

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const lss = useMemo(() => selectLiveSessionState(state, sessionId), [state, sessionId]);
  const checklist = useMemo(() => selectCompletionChecklist(state, sessionId), [state, sessionId]);
  const results = useMemo(() => (state.activitySegments ?? []).filter((s) => s.sessionId === sessionId), [state, sessionId]);
  const resultsConfirmed = useMemo(() => {
    const segmentResults = state.segmentResults ?? [];
    const conf = segmentResults.filter((r) => results.some((s) => s.id === r.segmentId) && (r.status === "Confirmed" || r.status === "Corrected"));
    return conf.length;
  }, [state, results]);

  if (!session) return null;

  const isCompleted = (lss.status as string) === "Completed" || (session.status as string) === "completed";
  const hasStarted = (lss.status as string) !== "Ready" && (lss.status as string) !== "scheduled" && (lss.status as string) !== "draft";
  const hasEnded = (lss.status as string) === "Ended" || (lss.status as string) === "Completed" || (session.status as string) === "completed";

  // Determine statuses
  const runStatus: StageStatus = isCompleted
    ? "Completed"
    : lss.status === "Emergency"
    ? "Needs Attention"
    : pathname.includes("/live")
    ? "Current"
    : hasStarted
    ? "Completed"
    : "Available";

  const resultsStatus: StageStatus = isCompleted
    ? "Completed"
    : !hasStarted
    ? "Locked"
    : pathname.includes("/results")
    ? "Current"
    : resultsConfirmed === results.length && results.length > 0
    ? "Completed"
    : "Available";

  const finishStatus: StageStatus = isCompleted
    ? "Completed"
    : !hasEnded
    ? "Locked"
    : pathname.includes("/completion")
    ? "Current"
    : checklist.isReadyToComplete
    ? "Available"
    : "Needs Attention";

  const stages = [
    {
      id: "run",
      label: "1. Run Event",
      route: `/missions/${sessionId}/live`,
      status: runStatus,
      lockReason: ""
    },
    {
      id: "results",
      label: "2. Record Results",
      route: `/missions/${sessionId}/results`,
      status: resultsStatus,
      lockReason: "Record Results becomes available after the event starts."
    },
    {
      id: "finish",
      label: "3. Finish Event",
      route: `/missions/${sessionId}/completion`,
      status: finishStatus,
      lockReason: "Finish Event becomes available after the event ends."
    }
  ];

  return (
    <div className="flex flex-wrap gap-2 border-b border-white/5 pb-4">
      {stages.map((st) => {
        const locked = st.status === "Locked";
        const current = st.status === "Current";
        const completed = st.status === "Completed";
        const warning = st.status === "Needs Attention";

        let badgeStyle = "bg-white/5 border-white/10 text-ink-sec";
        if (current) badgeStyle = "bg-brand border-brand text-white font-bold shadow-[0_0_12px_rgba(90,103,245,0.4)]";
        if (completed) badgeStyle = "bg-emerald-950/40 border-emerald-800 text-emerald-400";
        if (warning) badgeStyle = "bg-red-950/60 border-red-800 text-red-300 animate-pulse";
        if (locked) badgeStyle = "bg-white/2 border-white/5 text-ink-mut/60 cursor-not-allowed opacity-50";

        const content = (
          <div className={`flex flex-col items-start border p-3 rounded-xl transition-all select-none text-left w-full sm:w-[220px] ${badgeStyle}`}>
            <span className="text-xs font-bold">{st.label}</span>
            <span className="text-[10px] mt-1 opacity-80 uppercase tracking-wider font-semibold">
              {st.status.replace("-", " ")}
            </span>
            {locked && (
              <span className="text-[10px] text-ink-mut leading-tight mt-1 bg-black/30 p-1.5 rounded border border-white/5">
                {st.lockReason}
              </span>
            )}
          </div>
        );

        if (locked || current || isCompleted) {
          return (
            <div key={st.id} className="relative">
              {content}
            </div>
          );
        }

        return (
          <Link href={st.route} key={st.id} className="hover:scale-[1.02] transition-transform">
            {content}
          </Link>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------
// 3. Mission Back Navigation (Clickable breadcrumbs + button)
// ---------------------------------------------------------
export function MissionBackNavigation({ currentStageName }: { currentStageName?: string }) {
  const params = useParams();
  const sessionId = params.id as string;
  const { state } = useStore();

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  if (!session) return null;

  const eventName = sessionTitle(state, session.id);

  return (
    <div className="space-y-3">
      {/* Clickable breadcrumbs */}
      <div className="flex items-center gap-1.5 text-xs text-ink-mut">
        <Link href="/missions" className="hover:text-ink-sec transition-colors font-semibold">
          All Events
        </Link>
        <span>/</span>
        <Link href={`/missions/${sessionId}/overview`} className="hover:text-ink-sec transition-colors font-semibold truncate max-w-[200px]">
          {eventName}
        </Link>
        {currentStageName && (
          <>
            <span>/</span>
            <span className="text-ink-sec font-bold">{currentStageName}</span>
          </>
        )}
      </div>

      {/* Back button */}
      <div>
        <Link href={`/missions/${sessionId}/overview`}>
          <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-mut hover:text-ink-lum transition-colors bg-white/4 border border-white/5 px-3 py-1.5 rounded-lg">
            <ArrowLeft className="h-4 w-4" />
            Back to Event Overview
          </button>
        </Link>
      </div>
    </div>
  );
}

// ---------------------------------------------------------
// 4. Mission Metrics Summary
// ---------------------------------------------------------
export function MissionMetricsSummary() {
  const params = useParams();
  const sessionId = params.id as string;
  const { state } = useStore();

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const checkIn = useMemo(() => selectCheckInSummary(state, sessionId), [state, sessionId]);
  const ledger = useMemo(() => sessionCapacityLedger(state, sessionId), [state, sessionId]);
  const finance = useMemo(() => selectSessionFinancialSummary(state, sessionId), [state, sessionId]);

  if (!session) return null;

  const totalJoined = ledger.confirmedPaidBookings + ledger.confirmedComplimentaryBookings;
  const totalPresent = checkIn.checkedInCount + checkIn.lateCount;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Attendance Metrics */}
      <div className="glass rounded-xl p-4 border border-white/5 space-y-3">
        <span className="block text-xs font-bold text-ink-mut uppercase">Attendance & Seating</span>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <span className="text-[10px] text-ink-mut block">Seating Fill Rate</span>
            <span className="text-lg font-bold text-brand">{fillRate(totalJoined, ledger.sellableCapacity)}%</span>
            <div className="w-full mt-1.5">
              <FillMeter value={fillRate(totalJoined, ledger.sellableCapacity)} />
            </div>
            <span className="text-[9px] text-ink-mut mt-1 block">
              {totalJoined} of {ledger.sellableCapacity} slots reserved
            </span>
          </div>

          <div className="space-y-1 border-l border-white/5 pl-4">
            <span className="text-[10px] text-ink-mut block">Check-in Present Rate</span>
            <span className="text-lg font-bold text-[#5fd7a3]">
              {totalJoined > 0 ? Math.round((totalPresent / totalJoined) * 100) : 0}%
            </span>
            <div className="w-full mt-1.5">
              <FillMeter value={totalJoined > 0 ? Math.round((totalPresent / totalJoined) * 100) : 0} />
            </div>
            <span className="text-[9px] text-ink-mut mt-1 block">
              {totalPresent} checked in ({checkIn.lateCount} late)
            </span>
          </div>
        </div>
      </div>

      {/* Money Metrics */}
      <div className="glass rounded-xl p-4 border border-white/5 space-y-3">
        <span className="block text-xs font-bold text-ink-mut uppercase">Financial Break-Even Matrix</span>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-[10px] text-ink-mut block">Net Collected Revenue</span>
            <span className="text-lg font-bold text-[#5fd7a3]">{inr(finance.netRevenue)}</span>
            <span className="text-[9px] text-ink-mut block mt-1">
              Gross Collected: {inr(finance.grossCollected)}
            </span>
          </div>

          <div className="border-l border-white/5 pl-4">
            <span className="text-[10px] text-ink-mut block">Break-even Attendance</span>
            <span className="text-lg font-bold text-brand">{ledger.breakEvenAttendance} Present</span>
            <span className="text-[9px] text-ink-mut block mt-1">
              Required Revenue: {inr(finance.breakEvenRevenue)}
            </span>
            <span className={`text-[9px] font-bold ${finance.isProfitable ? "text-emerald-400" : "text-amber-400"} mt-1 block`}>
              {finance.isProfitable ? "✓ Break-Even Achieved" : "⚠ Under Break-Even Limit"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
