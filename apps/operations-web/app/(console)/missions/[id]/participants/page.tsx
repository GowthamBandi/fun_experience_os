"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectSessionParticipantPool } from "@/lib/prototype/selectors/identity";
import { selectSessionIdentitySummary } from "@/lib/prototype/selectors/identity";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/table";
import { StatusChip, Button } from "@/components/ui/primitives";
import { EmergencyAccessModal } from "@/components/geo/EmergencyAccessModal";
import type { ParticipantPoolItem } from "@/lib/prototype/selectors/identity";

export default function ParticipantPoolPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const {
    state,
    generateTemporaryIdentities,
    lockTemporaryIdentities,
    requestEmergencyIdentityAccess,
    role,
  } = useStore();

  const [selectedBookingForEmergency, setSelectedBookingForEmergency] = useState<any | null>(null);

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const pool = useMemo(() => selectSessionParticipantPool(state, sessionId), [state, sessionId]);
  const summary = useMemo(() => selectSessionIdentitySummary(state, sessionId), [state, sessionId]);

  if (!session) {
    return <div className="p-8 text-xs font-mono text-slate-400">Session not found.</div>;
  }

  const columns: Column<ParticipantPoolItem>[] = [
    {
      key: "tempId",
      header: "Temporary ID",
      render: (p) => (
        <div>
          <span className="font-mono font-bold text-amber-400 text-sm">
            {p.temporaryIdentity?.temporaryCode || "—"}
          </span>
          <div className="text-[10px] text-slate-500 font-mono">
            {p.temporaryIdentity?.status || "not-generated"}
          </div>
        </div>
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
      key: "type",
      header: "Type",
      render: (p) => <span className="font-mono text-slate-400 text-[10px]">{p.booking.bookingType || "individual"}</span>,
    },
    {
      key: "eligibility",
      header: "Eligibility",
      render: (p) =>
        p.isEligible ? (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800">
            ELIGIBLE
          </span>
        ) : (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-950 text-red-400 border border-red-800">
            {p.blockedReason || "INELIGIBLE"}
          </span>
        ),
    },
    {
      key: "team",
      header: "Assigned Team",
      render: (p) => (
        <span className="font-mono text-slate-300">
          {p.teamName ? `${p.teamName}` : <span className="text-slate-500 italic">Unassigned</span>}
        </span>
      ),
    },
    {
      key: "checkIn",
      header: "Check-In State",
      render: (p) => <StatusChip value={p.checkInStatus} />,
    },
    {
      key: "action",
      header: "Emergency Audit",
      align: "right",
      render: (p) => (
        <button
          onClick={() => setSelectedBookingForEmergency(p.booking)}
          className="px-2 py-1 bg-purple-950 hover:bg-purple-900 text-purple-300 border border-purple-800 rounded text-[10px] font-mono font-bold"
        >
          🛡️ Emergency Unmask
        </button>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline={`Participant Pool Workspace · ${session.id}`}
        title={`Participant Roster: ${sessionTitle(state, session.id)}`}
        sub="Anonymous participant pool, temporary identity generation, eligibility verification, and audit-logged emergency identity access."
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={() => generateTemporaryIdentities(sessionId)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded"
            >
              Generate Temporary IDs ({summary.missingIdentityCount} Missing)
            </button>
            <button
              onClick={() => lockTemporaryIdentities(sessionId)}
              disabled={summary.generatedCount === 0 || summary.isFullyLocked}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-bold rounded"
            >
              Lock Identities ({summary.lockedCount}/{summary.eligibleCount})
            </button>
            <Link href={`/missions/${session.id}/teams`}>
              <Button variant="ghost" className="h-8 px-3 text-xs">
                Team Workspace →
              </Button>
            </Link>
          </div>
        }
      />

      {/* Identity Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Eligible Roster</div>
          <div className="text-xl font-bold text-slate-200">{summary.eligibleCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Temp IDs Generated</div>
          <div className="text-xl font-bold text-emerald-400">{summary.generatedCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Identities Locked</div>
          <div className="text-xl font-bold text-amber-400">{summary.lockedCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Missing Identities</div>
          <div className="text-xl font-bold text-red-400">{summary.missingIdentityCount}</div>
        </div>
      </div>

      {/* Roster Table */}
      <div className="space-y-3">
        <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
          Participant Pool Roster ({pool.length})
        </h3>
        <DataTable columns={columns} rows={pool} emptyTitle="No participants in pool." emptyLine="Confirmed reservations will populate this workspace." />
      </div>

      {/* Emergency Unmask Modal */}
      {selectedBookingForEmergency && (
        <EmergencyAccessModal
          booking={selectedBookingForEmergency}
          operatorRole={role.id}
          onConfirm={(reason) => {
            requestEmergencyIdentityAccess({
              sessionId,
              bookingId: selectedBookingForEmergency.id,
              operatorId: role.id,
              operatorRole: role.id,
              reason,
            });
          }}
          onClose={() => setSelectedBookingForEmergency(null)}
        />
      )}
    </div>
  );
}
