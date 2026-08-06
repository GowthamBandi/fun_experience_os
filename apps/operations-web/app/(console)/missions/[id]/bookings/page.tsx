"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { selectSessionFinancialSummary } from "@/lib/prototype/selectors/money";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import {
  BookingBackNavigation,
  BookingStatusBadge,
  PaymentStatusBadge,
  BookingPrimaryAction,
  CapacitySummary,
  BookingEmptyState,
  bookingTypeLabel,
} from "@/components/bookings/shared";
import type { Booking } from "@/lib/prototype/entities";

export default function EventBookingsPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const {
    state,
    confirmBookingPayment,
    failBookingPayment,
    cancelBooking,
  } = useStore();

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const ledger = useMemo(() => sessionCapacityLedger(state, sessionId), [state, sessionId]);
  const financialSummary = useMemo(() => selectSessionFinancialSummary(state, sessionId), [state, sessionId]);
  
  const bookings = useMemo(
    () => state.bookings.filter((b) => b.sessionId === sessionId),
    [state, sessionId]
  );

  const groups = useMemo(() => ({
    confirmed: bookings.filter((b) => b.status === "confirmed" && b.amount > 0),
    freePasses: bookings.filter((b) => b.status === "confirmed" && b.amount === 0),
    waitingForPayment: bookings.filter((b) => b.status === "payment-pending" || b.status === "reserved"),
    paymentProblems: bookings.filter((b) => b.status === "payment-failed"),
    cancelled: bookings.filter((b) => b.status === "cancelled"),
    waitingList: bookings.filter((b) => b.status === "waitlisted" || b.status === "waitlist-offered"),
  }), [bookings]);

  const pendingAmount = useMemo(
    () => groups.waitingForPayment.reduce((sum, b) => sum + b.amount, 0),
    [groups.waitingForPayment]
  );
  const failedAmount = useMemo(
    () => groups.paymentProblems.reduce((sum, b) => sum + b.amount, 0),
    [groups.paymentProblems]
  );

  if (!session) {
    return <BookingEmptyState title="Session not found" message="This session does not exist." />;
  }

  const handleAction = (actionKey: string, bookingId: string) => {
    if (actionKey === "confirm-payment" || actionKey === "retry-payment") {
      confirmBookingPayment(bookingId);
    } else if (actionKey === "cancel") {
      cancelBooking(bookingId);
    }
  };

  const BookingCard = ({ booking }: { booking: Booking }) => (
    <div className="glass p-4 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4 mb-3">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-ink-lum text-sm">{booking.alias}</span>
          <span className="text-ink-mut text-xs">• {booking.phoneMask}</span>
        </div>
        <div className="flex items-center gap-2">
          <BookingStatusBadge status={booking.status as string} />
          <PaymentStatusBadge status={booking.paymentStatus as string} />
          <span className="text-ink-sec text-xs">{bookingTypeLabel(booking.bookingType)}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <BookingPrimaryAction
          booking={booking}
          onAction={handleAction}
        />
      </div>
    </div>
  );

  const Section = ({ title, items }: { title: string; items: Booking[] }) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-8">
        <h3 className="text-sm font-bold text-ink-lum mb-3 flex items-center gap-2">
          {title} <span className="bg-ink-sec/10 text-ink-sec px-2 py-0.5 rounded-full text-xs">{items.length}</span>
        </h3>
        <div>
          {items.map((b) => (
            <BookingCard key={b.id} booking={b} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 space-y-8">
      <BookingBackNavigation label="Back to Event" href={`/missions/${sessionId}/overview`} />
      
      <PageHeader
        overline="Event Bookings"
        title="Event Bookings"
        sub="How full is this event?"
        right={
          <Link href={`/missions/${sessionId}/waitlist`}>
            <Button variant="secondary" className="font-bold">
              Waiting List ({groups.waitingList.length})
            </Button>
          </Link>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass p-5 rounded-2xl">
          <CapacitySummary ledger={ledger} />
        </div>
        <div className="glass p-5 rounded-2xl flex flex-col justify-center gap-4">
          <div>
            <div className="text-sm text-ink-sec mb-1">Collected Revenue</div>
            <div className="text-2xl font-bold text-ink-lum">{inr(financialSummary.grossCollected)}</div>
          </div>
          <div className="flex gap-6">
            <div>
              <div className="text-xs text-ink-mut mb-1">Pending</div>
              <div className="font-medium text-ink-sec">{inr(pendingAmount)}</div>
            </div>
            <div>
              <div className="text-xs text-ink-mut mb-1">Failed</div>
              <div className="font-medium text-red-400">{inr(failedAmount)}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <Section title="Confirmed" items={groups.confirmed} />
        <Section title="Waiting for Payment" items={groups.waitingForPayment} />
        <Section title="Payment Problems" items={groups.paymentProblems} />
        <Section title="Free Passes" items={groups.freePasses} />
        <Section title="Waiting List" items={groups.waitingList} />
        <Section title="Cancelled" items={groups.cancelled} />
        
        {bookings.length === 0 && (
          <BookingEmptyState 
            title="No bookings yet" 
            message="No one has booked a space in this event." 
          />
        )}
      </div>
    </div>
  );
}
