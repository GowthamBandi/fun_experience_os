"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { selectBookingById } from "@/lib/prototype/selectors/bookings";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { sessionTitle, venueName } from "@/lib/prototype/selectors/lookups";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import {
  BookingBackNavigation,
  BookingStatusBadge,
  PaymentStatusBadge,
  BookingTimeline,
  PaymentCountdown,
  bookingTypeLabel,
  bookingSourceLabel,
  PrototypeModeBanner,
} from "@/components/bookings/shared";
import { Item, Stagger } from "@/components/motion/Motion";

export default function BookingDetailPage() {
  const params = useParams();
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
  
  const payment = useMemo(
    () => (state.payments ?? []).find((p) => p.bookingId === id),
    [state, id]
  );
  const refund = useMemo(
    () => (state.refunds ?? []).find((r) => r.bookingId === id),
    [state, id]
  );

  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [showMoreActions, setShowMoreActions] = useState(false);

  if (!booking) {
    return (
      <div className="mx-auto max-w-4xl p-8 space-y-4">
        <BookingBackNavigation breadcrumbs={[{ label: "Bookings", href: "/bookings" }]} />
        <div className="p-8 text-center text-ink-mut">Booking not found.</div>
      </div>
    );
  }

  const handleCancel = () => {
    cancelBooking(booking.id, cancelReason || "Operator cancelled reservation");
    setIsCancelModalOpen(false);
  };

  const isPending = booking.status === "payment-pending" || booking.status === "reserved";
  const isConfirmed = booking.status === "confirmed";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8 space-y-8">
      <PrototypeModeBanner />
      <BookingBackNavigation breadcrumbs={[{ label: "Bookings", href: "/bookings" }]} />

      <PageHeader
        overline="Booking Details"
        title="Booking Details"
        sub="What is happening with this booking?"
      />

      <Stagger className="space-y-6">
        <Item>
          {/* Header Section */}
          <div className="glass p-6 rounded-2xl flex flex-col md:flex-row justify-between gap-6 items-start md:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-3">
                <span className="text-xl font-medium text-ink-lum">{booking.bookingCode || booking.id}</span>
                <BookingStatusBadge status={booking.status as string} />
                <PaymentStatusBadge status={booking.paymentStatus as string} />
              </div>
              <div className="text-ink-sec text-sm">
                {booking.alias} • {booking.phoneMask}
              </div>
              <div className="text-ink-mut text-sm">
                {session ? sessionTitle(state, session.id) : "Unknown Session"} • {booking.createdAt}
              </div>
            </div>
            
            <div className="text-left md:text-right space-y-1">
              <div className="text-2xl font-semibold text-ink-lum">{inr(booking.amount)}</div>
              <div className="text-ink-sec text-sm">{bookingTypeLabel(booking.bookingType)}</div>
            </div>
          </div>
        </Item>

        <Item>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Left Column: Timeline & Summary */}
            <div className="space-y-6">
              <div className="glass p-6 rounded-2xl space-y-4">
                <h3 className="text-sm font-semibold text-ink-lum">Booking Summary</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-mut">Event</span>
                    <span className="text-ink-sec text-right">{session ? sessionTitle(state, session.id) : "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-mut">Venue</span>
                    <span className="text-ink-sec text-right">{session ? venueName(state, session.venueId) : "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-mut">Booking Type</span>
                    <span className="text-ink-sec text-right">{bookingTypeLabel(booking.bookingType)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-ink-mut">Current Status</span>
                    <BookingStatusBadge status={booking.status as string} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-mut">Space Impact</span>
                    <span className="text-ink-sec text-right">
                      {(booking.status as string) === "cancelled" || (booking.status as string) === "reservation-expired" 
                        ? "This booking does not use a space." 
                        : "This booking currently uses one event space."}
                    </span>
                  </div>
                </div>
              </div>
              
              <div className="glass p-6 rounded-2xl space-y-4">
                <h3 className="text-sm font-semibold text-ink-lum">Timeline & History</h3>
                <BookingTimeline booking={booking} />
                <div className="pt-4 mt-4 border-t border-ink-mut/10 space-y-2 text-xs text-ink-mut">
                  <div>Created: {booking.createdAt}</div>
                  {booking.confirmedAt && <div>Confirmed: {booking.confirmedAt}</div>}
                  {booking.cancelledAt && <div>Cancelled: {booking.cancelledAt}</div>}
                  {booking.checkedIn && <div>Checked In: Yes</div>}
                </div>
              </div>
            </div>

            {/* Right Column: Payment Section */}
            <div className="space-y-6">
              <div className="glass p-6 rounded-2xl space-y-6">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink-lum">Payment Details</h3>
                  <PaymentStatusBadge status={booking.paymentStatus as string} />
                </div>
                
                {isPending && (
                  <div className="bg-brand/10 text-brand p-4 rounded-xl flex items-center justify-between">
                    <span className="text-sm font-medium">Time to pay</span>
                    <PaymentCountdown expiresAt={booking.reservationExpiresAt} />
                  </div>
                )}

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-ink-mut">Amount</span>
                    <span className="text-ink-lum font-medium">{inr(booking.amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-mut">Payment Method</span>
                    <span className="text-ink-sec text-right">{payment?.paymentMethod || booking.method || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-ink-mut">Gateway Provider</span>
                    <span className="text-ink-sec text-right">{payment?.provider || "-"}</span>
                  </div>
                  {refund && (
                    <div className="flex justify-between items-center bg-red-950/20 p-2 rounded-lg -mx-2 px-2 mt-2 border border-red-900/30">
                      <span className="text-ink-mut">Refund Record</span>
                      <span className="text-ink-sec">{refund.id} ({refund.status})</span>
                    </div>
                  )}
                </div>

                <div className="pt-4 border-t border-ink-mut/10 space-y-3">
                  {isPending && (
                    <Button onClick={() => confirmBookingPayment(booking.id)} className="w-full justify-center">
                      Mark as Paid
                    </Button>
                  )}
                  {isConfirmed && !refund && (
                    <Button variant="danger" onClick={() => setIsCancelModalOpen(true)} className="w-full justify-center">
                      Cancel Booking
                    </Button>
                  )}
                  
                  <div className="pt-2">
                    <button 
                      onClick={() => setShowMoreActions(!showMoreActions)}
                      className="text-xs text-brand hover:underline w-full text-center"
                    >
                      {showMoreActions ? "Hide advanced actions" : "Show advanced actions"}
                    </button>
                    
                    {showMoreActions && (
                      <div className="mt-3 space-y-2 p-3 bg-ink-base rounded-xl border border-ink-mut/10">
                        {isPending && (
                          <>
                            <Button variant="ghost" className="w-full justify-start text-xs text-red-400" onClick={() => failBookingPayment(booking.id)}>
                              Mark Payment Problem
                            </Button>
                            <Button variant="ghost" className="w-full justify-start text-xs text-amber-400" onClick={() => expireReservation(booking.id)}>
                              Expire Now
                            </Button>
                          </>
                        )}
                        {!isConfirmed && (
                          <Button variant="ghost" className="w-full justify-start text-xs text-red-400" onClick={() => setIsCancelModalOpen(true)}>
                            Cancel Booking
                          </Button>
                        )}
                        {isConfirmed && !refund && (
                          <Button variant="ghost" className="w-full justify-start text-xs text-amber-400" onClick={() => initiateRefund({ bookingId: booking.id, amount: booking.amount, reason: "Manual request", operatorId: role.id })}>
                            Request Refund
                          </Button>
                        )}
                        {refund && refund.status === "requested" && (
                          <Button variant="ghost" className="w-full justify-start text-xs text-emerald-400" onClick={() => approveRefund(refund.id, role.id)}>
                            Approve Refund
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

          </div>
        </Item>
      </Stagger>

      {/* Cancel Modal */}
      {isCancelModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-ink-base border border-ink-mut/20 p-6 rounded-2xl max-w-md w-full space-y-5 shadow-2xl">
            <h3 className="text-lg font-medium text-ink-lum">Cancel this booking?</h3>
            
            <div className="space-y-4 text-sm text-ink-sec">
              <p>This will release one space, create a {inr(booking.amount)} refund request, and may offer the space to the next waiting person.</p>
              
              <div className="space-y-2">
                <label className="text-xs font-medium text-ink-mut">Reason for cancellation</label>
                <input 
                  type="text" 
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="e.g. Guest requested via phone"
                  className="w-full bg-ink-min border border-ink-mut/20 rounded-lg px-3 py-2 text-ink-lum placeholder:text-ink-mut/50 focus:outline-none focus:border-brand"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="lamp" className="flex-1 justify-center" onClick={() => setIsCancelModalOpen(false)}>
                Keep Booking
              </Button>
              <Button variant="danger" className="flex-1 justify-center" onClick={handleCancel}>
                Cancel Booking
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
