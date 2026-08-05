"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { CapacityBar } from "@/components/geo/CapacityBar";
import { SessionTimeline } from "@/components/geo/SessionTimeline";
import { DataTable, type Column } from "@/components/ui/table";
import { StatusChip, Button } from "@/components/ui/primitives";
import type { Booking } from "@/lib/prototype/entities";

export default function SessionBookingsPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const {
    state,
    confirmBookingPayment,
    failBookingPayment,
    cancelBooking,
    offerWaitlistSlot,
  } = useStore();

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const ledger = useMemo(() => sessionCapacityLedger(state, sessionId), [state, sessionId]);
  const bookings = useMemo(
    () => state.bookings.filter((b) => b.sessionId === sessionId),
    [state, sessionId]
  );

  if (!session) {
    return <div className="p-8 text-xs font-mono text-slate-400">Session not found.</div>;
  }

  const columns: Column<Booking>[] = [
    {
      key: "code",
      header: "Code",
      render: (b) => (
        <Link href={`/bookings/${b.id}`} className="font-mono font-bold text-emerald-400 hover:underline">
          {b.bookingCode || b.id}
        </Link>
      ),
    },
    { key: "alias", header: "Participant", render: (b) => <span className="font-medium text-slate-200">{b.alias}</span> },
    { key: "type", header: "Type", render: (b) => <span className="text-[10px] font-mono text-slate-400">{b.bookingType || "individual"}</span> },
    { key: "amount", header: "Amount", align: "right", render: (b) => <span className="font-mono text-slate-200">{inr(b.amount)}</span> },
    { key: "status", header: "Status", render: (b) => <StatusChip value={b.status} /> },
    {
      key: "action",
      header: "Action",
      align: "right",
      render: (b) => (
        <div className="flex items-center justify-end gap-1.5 font-mono">
          {(b.status === "payment-pending" || b.status === "reserved") && (
            <button
              onClick={() => confirmBookingPayment(b.id)}
              className="px-2 py-1 bg-emerald-600 text-slate-950 font-bold rounded text-[10px]"
            >
              Confirm Pay
            </button>
          )}
          {b.status === "confirmed" && (
            <button
              onClick={() => cancelBooking(b.id)}
              className="px-2 py-1 bg-slate-800 text-slate-300 rounded text-[10px]"
            >
              Cancel
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline={`Session Reservation Workspace · ${session.id}`}
        title={sessionTitle(state, session.id)}
        sub={`${session.date} ${session.startTime} · Venue: ${session.venueId}`}
        right={
          <div className="flex items-center gap-2">
            <Link href={`/missions/${session.id}/waitlist`}>
              <Button variant="ghost" className="h-8 px-3 text-xs">
                Queue Operations ({ledger.waitlistCount})
              </Button>
            </Link>
            <Link href={`/missions/${session.id}/money`}>
              <Button variant="ghost" className="h-8 px-3 text-xs">
                Financial Ledger
              </Button>
            </Link>
            <Link href="/bookings/new">
              <Button variant="lamp" className="h-8 px-3 text-xs font-bold">
                + Add Reservation
              </Button>
            </Link>
          </div>
        }
      />

      <SessionTimeline status={session.status} fillRate={ledger.fillRate} waitlistCount={ledger.waitlistCount} />
      <CapacityBar ledger={ledger} />

      <div className="space-y-3">
        <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
          Session Reservations ({bookings.length})
        </h3>
        <DataTable columns={columns} rows={bookings} emptyTitle="No reservations for this session." emptyLine="Dispatch a new reservation hold." />
      </div>
    </div>
  );
}
