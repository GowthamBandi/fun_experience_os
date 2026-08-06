"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectPaymentList } from "@/lib/prototype/selectors/money";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/table";
import { Button } from "@/components/ui/primitives";
import type { Payment } from "@/lib/prototype/entities";
import { BookingBackNavigation, PaymentStatusBadge, PrototypeModeBanner } from "@/components/bookings/shared";

export default function PaymentsPage() {
  const { state, confirmBookingPayment, failBookingPayment, reconcilePayment } = useStore();

  const payments = useMemo(() => selectPaymentList(state), [state]);

  const columns: Column<Payment>[] = [
    {
      key: "id",
      header: "Payment",
      render: (p) => <span className="font-mono text-ink-mut">{p.id}</span>,
    },
    {
      key: "booking",
      header: "Booking",
      render: (p) => (
        <Link href={`/bookings/${p.bookingId}`} className="font-medium text-brand hover:underline">
          {p.bookingId}
        </Link>
      ),
    },
    {
      key: "session",
      header: "Session",
      render: (p) => <span className="text-sm text-ink-sec">{sessionTitle(state, p.sessionId)}</span>,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (p) => <span className="font-mono text-ink-lum">{inr(p.amount)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (p) => <PaymentStatusBadge status={p.status as string} />,
    },
    {
      key: "initiated",
      header: "Time",
      render: (p) => <span className="text-ink-mut text-[11px]">{p.initiatedAt}</span>,
    },
    {
      key: "action",
      header: "",
      align: "right",
      render: (p) => (
        <div className="flex items-center justify-end gap-2">
          {p.status === "pending" && (
            <>
              <Button
                variant="primary"
                onClick={() => confirmBookingPayment(p.bookingId)}
                className="h-8 px-3 text-xs"
              >
                Mark as Paid
              </Button>
              <Button
                variant="ghost"
                onClick={() => failBookingPayment(p.bookingId)}
                className="h-8 px-3 text-xs text-red-400 hover:text-red-300 hover:bg-red-950/30"
              >
                Mark Failed
              </Button>
            </>
          )}

          {p.status === "confirmed" && (
            <Button
              variant="secondary"
              onClick={() => reconcilePayment(p.id)}
              className="h-8 px-3 text-xs"
            >
              Verified
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <BookingBackNavigation label="Back to Money" href="/money" />
      
      <PageHeader
        overline="Revenue Operations"
        title="Payments"
        sub="See which payments succeeded, failed, or still need attention."
      />

      <PrototypeModeBanner message="Payment simulation — no payment provider is connected." />

      <div className="space-y-3 pt-4">
        <DataTable columns={columns} rows={payments} emptyTitle="No payments found." emptyLine="New bookings will create payment records here." />
      </div>
    </div>
  );
}
