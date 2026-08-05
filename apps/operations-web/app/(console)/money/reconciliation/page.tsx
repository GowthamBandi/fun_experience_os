"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectFinancialOperationsMetrics } from "@/lib/prototype/selectors/money";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";

export default function ReconciliationPage() {
  const { state, reconcilePayment } = useStore();

  const metrics = useMemo(() => selectFinancialOperationsMetrics(state), [state]);
  const payments = useMemo(() => state.payments ?? [], [state]);
  const bookings = useMemo(() => state.bookings, [state]);

  // Find discrepancies
  const bookingIds = new Set(bookings.map((b) => b.id));
  const unmatchedPayments = payments.filter((p) => !bookingIds.has(p.bookingId));
  const unpaidConfirmedBookings = bookings.filter(
    (b) =>
      (b.status === "confirmed" || b.paymentStatus === "confirmed") &&
      b.bookingType !== "complimentary" &&
      !payments.some((p) => p.bookingId === b.id && (p.status === "confirmed" || p.status === "reconciled"))
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline="Financial Operations"
        title="Revenue & Booking Reconciliation Command Center"
        sub="Audit mismatch detection between payment gateway settlement records and reservation state."
        right={
          <Link href="/money">
            <Button variant="ghost" className="h-8 px-3 text-xs">
              ← Return to Financial Operations
            </Button>
          </Link>
        }
      />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Confirmed Transactions</div>
          <div className="text-xl font-bold text-emerald-400">{metrics.confirmedPaymentsCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Discrepancies Flagged</div>
          <div className="text-xl font-bold text-amber-400">{metrics.reconciliationDiscrepanciesCount}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Net Settled Revenue</div>
          <div className="text-xl font-bold text-slate-200">{inr(metrics.netRevenue)}</div>
        </div>
      </div>

      {/* Discrepancies Grid */}
      <div className="space-y-4">
        <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
          Reconciliation Audit Discrepancies
        </h3>

        {unmatchedPayments.length === 0 && unpaidConfirmedBookings.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-6 text-center text-slate-400">
            ✓ All payments and bookings are 100% reconciled. No financial discrepancies detected.
          </div>
        ) : (
          <div className="space-y-3">
            {unmatchedPayments.map((p) => (
              <div key={p.id} className="bg-slate-900 border border-amber-800/80 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-bold text-amber-300">Unmatched Payment Record: {p.id}</div>
                  <div className="text-slate-400 text-[11px]">Amount: {inr(p.amount)} · Booking Ref: {p.bookingId} (Missing in state)</div>
                </div>
                <button
                  onClick={() => reconcilePayment(p.id)}
                  className="px-3 py-1 bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold rounded"
                >
                  Force Reconcile
                </button>
              </div>
            ))}

            {unpaidConfirmedBookings.map((b) => (
              <div key={b.id} className="bg-slate-900 border border-red-800/80 rounded-lg p-3 flex items-center justify-between">
                <div>
                  <div className="font-bold text-red-300">Confirmed Booking Lacks Settlement Record: {b.bookingCode || b.id}</div>
                  <div className="text-slate-400 text-[11px]">Participant: {b.alias} · Amount: {inr(b.amount)}</div>
                </div>
                <Link href={`/bookings/${b.id}`}>
                  <button className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded">
                    View Reservation
                  </button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
