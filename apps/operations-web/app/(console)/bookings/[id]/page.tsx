"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectBookingById } from "@/lib/prototype/selectors/bookings";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { CapacityBar } from "@/components/geo/CapacityBar";
import { SessionTimeline } from "@/components/geo/SessionTimeline";
import { StatusChip, Button } from "@/components/ui/primitives";

export default function BookingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const {
    state,
    confirmBookingPayment,
    failBookingPayment,
    expireReservation,
    cancelBooking,
    initiateRefund,
    approveRefund,
    role,
  } = useStore();

  const booking = useMemo(() => selectBookingById(state, id), [state, id]);
  const session = useMemo(
    () => (booking ? state.sessions.find((s) => s.id === booking.sessionId) : null),
    [state, booking]
  );
  const ledger = useMemo(
    () => (booking ? sessionCapacityLedger(state, booking.sessionId) : null),
    [state, booking]
  );
  const payment = useMemo(
    () => (state.payments ?? []).find((p) => p.bookingId === id),
    [state, id]
  );
  const refund = useMemo(
    () => (state.refunds ?? []).find((r) => r.bookingId === id),
    [state, id]
  );

  if (!booking) {
    return (
      <div className="mx-auto max-w-4xl p-8 font-mono text-xs text-slate-400 space-y-4">
        <div>❌ Reservation record <strong className="text-slate-200">{id}</strong> not found.</div>
        <Link href="/bookings" className="text-emerald-400 hover:underline">
          ← Return to Reservation Operations
        </Link>
      </div>
    );
  }

  const handleCancelAndRefund = () => {
    cancelBooking(booking.id, "Operator cancelled reservation");
  };

  const handleRefundRequest = () => {
    initiateRefund({
      bookingId: booking.id,
      amount: booking.amount,
      reason: "Manual operator refund dispatch",
      operatorId: role.id,
    });
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline={`Reservation Control · ${booking.bookingCode || booking.id}`}
        title={`Reservation: ${booking.alias}`}
        sub={`Created ${booking.createdAt} · Channel: ${booking.source || "customer-app"} · Type: ${booking.bookingType || "individual"}`}
        right={
          <div className="flex items-center gap-2">
            <StatusChip value={booking.status} />
            <Link href="/bookings">
              <Button variant="ghost" className="h-8 px-3 text-xs">
                ← Back
              </Button>
            </Link>
          </div>
        }
      />

      {/* Session Operational Timeline */}
      {session && (
        <SessionTimeline
          status={session.status}
          fillRate={ledger?.fillRate}
          waitlistCount={ledger?.waitlistCount}
        />
      )}

      {/* Capacity Impact Ledger */}
      {ledger && <CapacityBar ledger={ledger} />}

      {/* Reservation Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Reservation Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-300 border-b border-slate-800 pb-2">
            Reservation State & Capacity Impact
          </div>
          <div className="space-y-1.5 text-slate-400">
            <div><strong className="text-slate-300">Booking Code:</strong> {booking.bookingCode || booking.id}</div>
            <div><strong className="text-slate-300">Participant:</strong> {booking.alias} ({booking.phoneMask})</div>
            <div><strong className="text-slate-300">Session:</strong> {sessionTitle(state, booking.sessionId)}</div>
            <div><strong className="text-slate-300">Reservation Status:</strong> <span className="text-amber-400 font-bold">{booking.reservationStatus || "active"}</span></div>
            <div><strong className="text-slate-300">Hold Countdown:</strong> {booking.reservationExpiresAt || booking.waitlistOfferExpiresAt || "Permanent / Confirmed"}</div>
            <div><strong className="text-slate-300">Capacity Bucket:</strong> {booking.status === "confirmed" ? "Confirmed Paid Capacity" : booking.reservationStatus === "offer-hold" ? "Waitlist Offer Hold" : "Active Reservation Hold"}</div>
          </div>

          <div className="pt-2 flex flex-wrap gap-2">
            {(booking.status === "payment-pending" || booking.status === "reserved") && (
              <>
                <button
                  onClick={() => confirmBookingPayment(booking.id)}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded"
                >
                  Confirm Payment
                </button>
                <button
                  onClick={() => failBookingPayment(booking.id)}
                  className="px-3 py-1.5 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 rounded"
                >
                  Simulate Payment Failure
                </button>
                <button
                  onClick={() => expireReservation(booking.id)}
                  className="px-3 py-1.5 bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800 rounded"
                >
                  Expire Hold Now
                </button>
              </>
            )}

            {booking.status === "confirmed" && (
              <button
                onClick={handleCancelAndRefund}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded"
              >
                Cancel Booking & Release Capacity
              </button>
            )}
          </div>
        </div>

        {/* Payment & Refund Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-300 border-b border-slate-800 pb-2">
            Financial & Payment Settlement
          </div>
          <div className="space-y-1.5 text-slate-400">
            <div><strong className="text-slate-300">Amount:</strong> <span className="text-emerald-400 font-bold">{inr(booking.amount)}</span></div>
            <div><strong className="text-slate-300">Payment Status:</strong> <span className="text-emerald-400 font-bold">{booking.paymentStatus || "pending"}</span></div>
            <div><strong className="text-slate-300">Payment Record ID:</strong> {payment?.id || "pay-simulated"}</div>
            <div><strong className="text-slate-300">Gateway Provider:</strong> {payment?.provider || "Razorpay Simulator"}</div>
            <div><strong className="text-slate-300">Refund Record:</strong> {refund ? `${refund.id} (${refund.status})` : "None"}</div>
          </div>

          <div className="pt-2 flex flex-wrap gap-2">
            {booking.status === "confirmed" && !refund && (
              <button
                onClick={handleRefundRequest}
                className="px-3 py-1.5 bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800 rounded"
              >
                Request Refund (₹{booking.amount})
              </button>
            )}

            {refund && (refund.status === "requested" || refund.status === "under-review") && (
              <button
                onClick={() => approveRefund(refund.id, role.id)}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded"
              >
                Finance Approve & Settle Refund
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
