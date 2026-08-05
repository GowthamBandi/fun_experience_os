"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectPaymentList } from "@/lib/prototype/selectors/money";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/table";
import { StatusChip, Button } from "@/components/ui/primitives";
import type { Payment } from "@/lib/prototype/entities";

export default function RevenueOperationsPage() {
  const { state, confirmBookingPayment, failBookingPayment, reconcilePayment } = useStore();

  const payments = useMemo(() => selectPaymentList(state), [state]);

  const columns: Column<Payment>[] = [
    {
      key: "id",
      header: "Payment ID",
      render: (p) => <span className="font-mono text-slate-300 font-bold">{p.id}</span>,
    },
    {
      key: "booking",
      header: "Booking Ref",
      render: (p) => (
        <Link href={`/bookings/${p.bookingId}`} className="font-mono text-emerald-400 hover:underline">
          {p.bookingId}
        </Link>
      ),
    },
    {
      key: "session",
      header: "Session",
      render: (p) => <span className="font-mono text-xs text-slate-300">{sessionTitle(state, p.sessionId)}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (p) => <span className="font-mono text-slate-200">{inr(p.amount)}</span>,
    },
    {
      key: "status",
      header: "Settlement State",
      render: (p) => <StatusChip value={p.status} />,
    },
    {
      key: "initiated",
      header: "Initiated",
      render: (p) => <span className="font-mono text-slate-400 text-[11px]">{p.initiatedAt}</span>,
    },
    {
      key: "action",
      header: "Actions",
      align: "right",
      render: (p) => (
        <div className="flex items-center justify-end gap-1.5 font-mono">
          {p.status === "pending" && (
            <>
              <button
                onClick={() => confirmBookingPayment(p.bookingId)}
                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded text-[10px]"
              >
                Confirm Settlement
              </button>
              <button
                onClick={() => failBookingPayment(p.bookingId)}
                className="px-2 py-1 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 rounded text-[10px]"
              >
                Fail Payment
              </button>
            </>
          )}

          {p.status === "confirmed" && (
            <button
              onClick={() => reconcilePayment(p.id)}
              className="px-2 py-1 bg-blue-950 hover:bg-blue-900 text-blue-300 border border-blue-800 rounded text-[10px]"
            >
              Mark Reconciled
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline="Revenue Operations"
        title="Payment Settlement & Revenue Operations"
        sub="Authoritative payment transaction ledger, settlement confirmation, and failure management."
        right={
          <Link href="/money">
            <Button variant="ghost" className="h-8 px-3 text-xs">
              ← Return to Financial Operations
            </Button>
          </Link>
        }
      />

      <div className="space-y-3">
        <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
          Payment Transactions ({payments.length})
        </h3>
        <DataTable columns={columns} rows={payments} emptyTitle="No payments recorded." emptyLine="Create a reservation to generate payment records." />
      </div>
    </div>
  );
}
