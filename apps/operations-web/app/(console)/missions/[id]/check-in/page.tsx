"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  selectCheckInSummary,
  selectStaffReadiness,
  selectSessionOpenReadiness,
} from "@/lib/prototype/selectors/checkIn";
import { selectSessionParticipantPool } from "@/lib/prototype/selectors/identity";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/table";
import { StatusChip, Button } from "@/components/ui/primitives";
import { CheckInQRScannerSimulator } from "@/components/geo/CheckInQRScannerSimulator";
import type { ParticipantPoolItem } from "@/lib/prototype/selectors/identity";
import type { CheckInStatus } from "@/lib/prototype/entities";

export default function DoorCheckInPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const {
    state,
    createCheckInRecords,
    updateCheckInStatus,
    checkInStaff,
    role,
  } = useStore();

  const [denialModalBookingId, setDenialModalBookingId] = useState<string | null>(null);
  const [denialReason, setDenialReason] = useState("");
  const [overrideModalBookingId, setOverrideModalBookingId] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState("");
  const [targetOverrideStatus, setTargetOverrideStatus] = useState<CheckInStatus>("checked-in");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const pool = useMemo(() => selectSessionParticipantPool(state, sessionId), [state, sessionId]);
  const summary = useMemo(() => selectCheckInSummary(state, sessionId), [state, sessionId]);
  const staff = useMemo(() => selectStaffReadiness(state, sessionId), [state, sessionId]);
  const handover = useMemo(() => selectSessionOpenReadiness(state, sessionId), [state, sessionId]);

  if (!session) {
    return <div className="p-8 text-xs font-mono text-slate-400">Session not found.</div>;
  }

  const handleScanCode = (code: string) => {
    setErrorMsg(null);
    const item = pool.find(
      (p) =>
        p.temporaryIdentity?.temporaryCode.toLowerCase() === code.toLowerCase() ||
        p.booking.id.toLowerCase() === code.toLowerCase() ||
        p.booking.bookingCode?.toLowerCase() === code.toLowerCase()
    );

    if (!item) {
      setErrorMsg(`No participant found matching code or reference '${code}'.`);
      return;
    }

    const res = updateCheckInStatus({
      sessionId,
      bookingId: item.booking.id,
      targetStatus: "checked-in",
      method: "qr-simulation",
      operatorId: role.id,
    });

    if (res.error) setErrorMsg(res.error);
  };

  const handleStatusClick = (bookingId: string, currentStatus: string, targetStatus: CheckInStatus) => {
    setErrorMsg(null);

    // If current status is no-show or denied, prompt for audited override
    if (currentStatus === "no-show" || currentStatus === "denied") {
      setOverrideModalBookingId(bookingId);
      setTargetOverrideStatus(targetStatus);
      return;
    }

    if (targetStatus === "denied") {
      setDenialModalBookingId(bookingId);
      return;
    }

    const res = updateCheckInStatus({
      sessionId,
      bookingId,
      targetStatus,
      method: "manual-override",
      operatorId: role.id,
    });

    if (res.error) setErrorMsg(res.error);
  };

  const handleDenialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!denialModalBookingId || !denialReason.trim()) return;

    const res = updateCheckInStatus({
      sessionId,
      bookingId: denialModalBookingId,
      targetStatus: "denied",
      denialReason: denialReason.trim(),
      operatorId: role.id,
    });

    if (res.error) setErrorMsg(res.error);
    setDenialModalBookingId(null);
    setDenialReason("");
  };

  const handleOverrideSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideModalBookingId || !overrideReason.trim()) return;

    const res = updateCheckInStatus({
      sessionId,
      bookingId: overrideModalBookingId,
      targetStatus: targetOverrideStatus,
      auditOverrideReason: overrideReason.trim(),
      operatorId: role.id,
    });

    if (res.error) setErrorMsg(res.error);
    setOverrideModalBookingId(null);
    setOverrideReason("");
  };

  const columns: Column<ParticipantPoolItem>[] = [
    {
      key: "tempId",
      header: "Temp Code",
      render: (p) => (
        <span className="font-mono font-bold text-amber-400">
          {p.temporaryIdentity?.temporaryCode || "—"}
        </span>
      ),
    },
    {
      key: "alias",
      header: "Participant Alias",
      render: (p) => (
        <div>
          <p className="font-medium text-slate-200">{p.booking.alias}</p>
          <p className="text-[11px] text-slate-400 font-mono">{p.booking.phoneMask}</p>
        </div>
      ),
    },
    {
      key: "team",
      header: "Team",
      render: (p) => <span className="font-mono text-slate-300">{p.teamName || "Unassigned"}</span>,
    },
    {
      key: "status",
      header: "Attendance State",
      render: (p) => <StatusChip value={p.checkInStatus} />,
    },
    {
      key: "action",
      header: "Check-In Dispatch",
      align: "right",
      render: (p) => (
        <div className="flex items-center justify-end gap-1.5 font-mono">
          {p.checkInStatus !== "checked-in" && (
            <button
              onClick={() => handleStatusClick(p.booking.id, p.checkInStatus, "checked-in")}
              className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded text-[10px]"
            >
              Check In
            </button>
          )}

          {p.checkInStatus !== "late" && (
            <button
              onClick={() => handleStatusClick(p.booking.id, p.checkInStatus, "late")}
              className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded text-[10px]"
            >
              Mark Late
            </button>
          )}

          {p.checkInStatus !== "no-show" && (
            <button
              onClick={() => handleStatusClick(p.booking.id, p.checkInStatus, "no-show")}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px]"
            >
              No Show
            </button>
          )}

          {p.checkInStatus !== "denied" && (
            <button
              onClick={() => handleStatusClick(p.booking.id, p.checkInStatus, "denied")}
              className="px-2 py-1 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 rounded text-[10px]"
            >
              Deny Entry
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline={`Door Check-In Workspace · ${session.id}`}
        title={`Door Check-In: ${sessionTitle(state, session.id)}`}
        sub="QR hardware simulation, temporary ID lookup, state machine attendance transitions, staff check-in, and Live Operations handover readiness."
        right={
          <button
            onClick={() => createCheckInRecords(sessionId)}
            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded"
          >
            + Initialize Door Roster
          </button>
        }
      />

      {/* Handover Readiness Banner per Correction 8 */}
      <div className={`p-4 rounded-lg border font-mono space-y-2 ${
        handover.status === "Ready"
          ? "bg-emerald-950/60 border-emerald-800 text-emerald-300"
          : handover.status === "At Risk"
          ? "bg-amber-950/60 border-amber-800 text-amber-300"
          : "bg-red-950/60 border-red-800 text-red-300"
      }`}>
        <div className="flex items-center justify-between">
          <span className="font-bold text-sm flex items-center gap-2">
            <span>🏁 Session Handover Readiness:</span>
            <span className="uppercase font-bold underline">{handover.status}</span>
          </span>
          <span className="text-[11px] italic">
            “Ready to hand over to Live Operations”
          </span>
        </div>
        <div className="text-[11px] space-y-1">
          <div><strong className="text-slate-400">Status Audit:</strong> {handover.reasons.join(" | ")}</div>
          <div><strong className="text-slate-400">Next Action:</strong> {handover.recommendedAction}</div>
        </div>
      </div>

      {/* Attendance Summary KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Expected</div>
          <div className="text-xl font-bold text-slate-200">{summary.expectedCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Checked In</div>
          <div className="text-xl font-bold text-emerald-400">{summary.checkedInCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Late (Present)</div>
          <div className="text-xl font-bold text-amber-400">{summary.lateCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Derived Missing</div>
          <div className="text-xl font-bold text-purple-400">{summary.missingCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">No Show</div>
          <div className="text-xl font-bold text-slate-400">{summary.noShowCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Denied</div>
          <div className="text-xl font-bold text-red-400">{summary.deniedCount}</div>
        </div>
      </div>

      {/* Staff Check-In Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
        <h4 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
          Required Operating Crew Check-In
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-950 border border-slate-800 p-3 rounded flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-200">Lead Coordinator:</span> {staff.leadCoordinator?.name || "Unassigned"}
              <div className="text-[10px] text-slate-500">Status: {staff.leadCoordinator?.status || "missing"}</div>
            </div>
            {session.leadCoordinatorId && staff.leadCoordinator?.status !== "checked-in" && (
              <button
                onClick={() => checkInStaff(sessionId, session.leadCoordinatorId)}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded"
              >
                Check In Crew
              </button>
            )}
          </div>

          <div className="bg-slate-950 border border-slate-800 p-3 rounded flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-200">Safety Contact:</span> {staff.safetyContact?.name || "Unassigned"}
              <div className="text-[10px] text-slate-500">Status: {staff.safetyContact?.status || "missing"}</div>
            </div>
            {session.safetyContactId && staff.safetyContact?.status !== "checked-in" && (
              <button
                onClick={() => checkInStaff(sessionId, session.safetyContactId)}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded"
              >
                Check In Crew
              </button>
            )}
          </div>
        </div>
      </div>

      {/* QR Scanner Simulator */}
      <CheckInQRScannerSimulator onScan={handleScanCode} />

      {errorMsg && <div className="bg-red-950 border border-red-800 text-red-300 p-3 rounded">{errorMsg}</div>}

      {/* Door Roster Table */}
      <div className="space-y-3">
        <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
          Door Attendance Roster ({pool.length})
        </h3>
        <DataTable columns={columns} rows={pool} emptyTitle="Roster empty." emptyLine="Initialize door roster above." />
      </div>

      {/* Denial Reason Modal */}
      {denialModalBookingId && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleDenialSubmit} className="bg-slate-900 border border-red-800 rounded-lg p-6 max-w-md w-full space-y-4">
            <h4 className="font-bold text-red-400 text-sm">Deny Participant Door Entry</h4>
            <p className="text-slate-300">
              Provide a mandatory operational reason for denying entry to participant {denialModalBookingId}.
            </p>
            <textarea
              rows={3}
              placeholder="e.g. Failed venue safety gear inspection; intoxicated on arrival."
              value={denialReason}
              onChange={(e) => setDenialReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              required
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDenialModalBookingId(null)}
                className="px-3 py-1 bg-slate-800 text-slate-300 rounded font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1 bg-red-950 border border-red-800 text-red-300 font-bold rounded"
              >
                Confirm Denial
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Audited Override Correction Modal */}
      {overrideModalBookingId && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <form onSubmit={handleOverrideSubmit} className="bg-slate-900 border border-amber-800 rounded-lg p-6 max-w-md w-full space-y-4">
            <h4 className="font-bold text-amber-400 text-sm">Audited Attendance State Correction</h4>
            <p className="text-slate-300">
              Changing status from &apos;no-show&apos; or &apos;denied&apos; to &apos;{targetOverrideStatus}&apos; requires an audited correction reason.
            </p>
            <textarea
              rows={3}
              placeholder="e.g. Arrived late at door after initial no-show marking; safety cleared by Lead Coordinator."
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded p-2 text-slate-200"
              required
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOverrideModalBookingId(null)}
                className="px-3 py-1 bg-slate-800 text-slate-300 rounded font-bold"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded"
              >
                Confirm Audited State Correction
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
