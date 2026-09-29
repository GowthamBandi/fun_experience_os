"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectSessionSummary } from "@/lib/prototype/selectors/completion";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { PageHeader } from "@/components/ui/PageHeader";
import { StatusChip, Button } from "@/components/ui/primitives";
import {
  MissionWorkspaceHeader,
  MissionStageNavigation,
  MissionBackNavigation,
} from "@/components/missions/shared";

export default function SessionSummaryPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const { state } = useStore();
  const summary = useMemo(() => selectSessionSummary(state, sessionId), [state, sessionId]);

  if (!summary.session) {
    return <div className="p-8 text-xs font-mono text-slate-500">Session not found.</div>;
  }

  const formatCurrency = (amount: number) => `₹${amount.toLocaleString()}`;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      {/* Back button & Breadcrumbs */}
      <MissionBackNavigation currentStageName="Final Summary" />

      <PageHeader
        overline={`Session Operations Summary · ${summary.session.id}`}
        title={`Operational Summary: ${sessionTitle(state, summary.session.id)}`}
        sub="Attendance totals, duration, match outcomes, revenue breakdown, staff attendance, equipment exceptions, and safety signals."
      />

      {/* Persistent global header */}
      <MissionWorkspaceHeader />

      {/* Progress navigation */}
      <MissionStageNavigation />

      {/* Mandatory Snapshot Banner */}
      <div className="bg-purple-200 border border-purple-300 p-3 rounded text-[11px] text-purple-700 italic font-medium flex items-center justify-between">
        <span>“Prototype completion snapshot — production reporting storage is not connected.”</span>
        <span className="font-mono text-[10px] text-purple-600 border border-purple-200 px-2 py-0.5 rounded font-bold">
          SNAPSHOT VERIFIED
        </span>
      </div>

      {/* Primary KPI Overview Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="text-[10px] text-slate-500 uppercase">Duration</div>
          <div className="text-xl font-bold text-slate-800">{summary.formattedDuration}</div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="text-[10px] text-slate-500 uppercase">Attendance Fill Rate</div>
          <div className="text-xl font-bold text-emerald-600">
            {summary.checkIn.expectedCount > 0
              ? `${Math.round(((summary.checkIn.checkedInCount + summary.checkIn.lateCount) / summary.checkIn.expectedCount) * 100)}%`
              : "0%"}
          </div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">
            {summary.checkIn.checkedInCount + summary.checkIn.lateCount} / {summary.checkIn.expectedCount} Present
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="text-[10px] text-slate-500 uppercase">Gross Revenue</div>
          <div className="text-xl font-bold text-amber-600">{formatCurrency(summary.money.grossCollected)}</div>
          <div className="text-[10px] text-slate-500 font-mono mt-1">
            Net: {formatCurrency(summary.money.netRevenue)}
          </div>
        </div>

        <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
          <div className="text-[10px] text-slate-500 uppercase">Match Results</div>
          <div className="text-xl font-bold text-purple-700">{summary.results.length} Recorded</div>
        </div>
      </div>

      {/* Detailed Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Attendance Breakdown Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-3">
          <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs border-b border-slate-200 pb-2">
            Attendance & Door Roster
          </h4>
          <div className="space-y-1.5 text-slate-700">
            <div className="flex justify-between"><span>Expected Roster:</span><strong className="text-slate-800">{summary.checkIn.expectedCount}</strong></div>
            <div className="flex justify-between"><span>Checked In:</span><strong className="text-emerald-600">{summary.checkIn.checkedInCount}</strong></div>
            <div className="flex justify-between"><span>Marked Late (Present):</span><strong className="text-amber-600">{summary.checkIn.lateCount}</strong></div>
            <div className="flex justify-between"><span>Derived Missing:</span><strong className="text-purple-600">{summary.checkIn.missingCount}</strong></div>
            <div className="flex justify-between"><span>No Show:</span><strong className="text-slate-500">{summary.checkIn.noShowCount}</strong></div>
            <div className="flex justify-between"><span>Denied Entry:</span><strong className="text-red-600">{summary.checkIn.deniedCount}</strong></div>
          </div>
        </div>

        {/* Operating Staff Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-3">
          <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs border-b border-slate-200 pb-2">
            Operating Crew & Staffing
          </h4>
          <div className="space-y-1.5 text-slate-700">
            <div className="flex justify-between">
              <span>Lead Coordinator:</span>
              <strong className="text-slate-800">{summary.staff.leadCoordinator?.name || "Unassigned"} ({summary.staff.leadCoordinator?.status || "missing"})</strong>
            </div>
            <div className="flex justify-between">
              <span>Safety Contact:</span>
              <strong className="text-slate-800">{summary.staff.safetyContact?.name || "Unassigned"} ({summary.staff.safetyContact?.status || "missing"})</strong>
            </div>
            <div className="flex justify-between">
              <span>Total Crew Present:</span>
              <strong className="text-emerald-600">
                {(summary.staff.leadCoordinator?.status === "checked-in" ? 1 : 0) + (summary.staff.safetyContact?.status === "checked-in" ? 1 : 0)} / 2
              </strong>
            </div>
          </div>
        </div>

        {/* Financial Summary Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-3">
          <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs border-b border-slate-200 pb-2">
            Financial & Settlement Operations
          </h4>
          <div className="space-y-1.5 text-slate-700">
            <div className="flex justify-between"><span>Gross Revenue:</span><strong className="text-emerald-600">{formatCurrency(summary.money.grossCollected)}</strong></div>
            <div className="flex justify-between"><span>Total Refunded:</span><strong className="text-red-600">{formatCurrency(summary.money.totalRefunded)}</strong></div>
            <div className="flex justify-between"><span>Net Revenue:</span><strong className="text-amber-600 font-bold text-sm">{formatCurrency(summary.money.netRevenue)}</strong></div>
            <div className="flex justify-between"><span>Break-Even Target:</span><strong className="text-slate-500">{summary.money.ledger.breakEvenAttendance} Seats</strong></div>
          </div>
        </div>

        {/* Equipment & Safety Signals Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5 space-y-3">
          <h4 className="font-bold text-slate-800 uppercase tracking-wider text-xs border-b border-slate-200 pb-2">
            Equipment & Safety Status
          </h4>
          <div className="space-y-1.5 text-slate-700">
            <div className="flex justify-between"><span>Equipment Return Status:</span><strong className={summary.eq.allReturnedOrResolved ? "text-emerald-600" : "text-amber-600"}>{summary.eq.allReturnedOrResolved ? "All Returned" : "Exceptions Recorded"}</strong></div>
            <div className="flex justify-between"><span>Critical Missing:</span><strong className={summary.eq.criticalMissingCount === 0 ? "text-emerald-600" : "text-red-600"}>{summary.eq.criticalMissingCount}</strong></div>
            <div className="flex justify-between"><span>Emergency Mode Triggered:</span><strong className={summary.lss.emergencyMode ? "text-red-600" : "text-slate-500"}>{summary.lss.emergencyMode ? "YES" : "No"}</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}
