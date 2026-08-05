"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectSessionFinancialSummary } from "@/lib/prototype/selectors/money";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { CapacityBar } from "@/components/geo/CapacityBar";

export default function SessionMoneyPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const { state } = useStore();

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const fin = useMemo(() => selectSessionFinancialSummary(state, sessionId), [state, sessionId]);

  if (!session) {
    return <div className="p-8 text-xs font-mono text-slate-400">Session not found.</div>;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline={`Session Financial Ledger · ${session.id}`}
        title={`Revenue Operations: ${sessionTitle(state, session.id)}`}
        sub="Gross revenue collected, processed refunds, break-even thresholds, and net margin."
        right={
          <Link href={`/missions/${session.id}/bookings`}>
            <span className="text-xs text-emerald-400 hover:underline">← Back to Reservations</span>
          </Link>
        }
      />

      <CapacityBar ledger={fin.ledger} />

      {/* Financial Metrics Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Gross Collected</div>
          <div className="text-xl font-bold text-emerald-400">{inr(fin.grossCollected)}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Total Refunded</div>
          <div className="text-xl font-bold text-red-400">{inr(fin.totalRefunded)}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Net Revenue</div>
          <div className="text-xl font-bold text-slate-200">{inr(fin.netRevenue)}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Break-Even Status</div>
          <div className={`text-base font-bold ${fin.isProfitable ? "text-emerald-400" : "text-amber-400"}`}>
            {fin.isProfitable ? "PROFITABLE ✓" : "BELOW TARGET ⚠️"}
          </div>
          <div className="text-[10px] text-slate-500">Target: {inr(fin.breakEvenRevenue)}</div>
        </div>
      </div>
    </div>
  );
}
