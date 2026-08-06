"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { sessionTitle, venueName } from "@/lib/prototype/selectors/lookups";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, FillMeter, Badge, StatusChip } from "@/components/ui/primitives";
import { BookingBackNavigation, CapacitySummary, PrototypeModeBanner, bookingTypeLabel } from "@/components/bookings/shared";
import type { BookingType, BookingSource } from "@/lib/prototype/entities";
import { Stagger, Item } from "@/components/motion/Motion";
import { CheckCircle } from "lucide-react";

type UiBookingType = "Customer Booking" | "Staff Added Booking" | "Free Pass";
type PaymentOption = "Mark as Paid" | "Waiting for Payment" | "Free Pass";

export default function AddBookingPage() {
  const router = useRouter();
  const { state, createBookingReservation, confirmBookingPayment, role } = useStore();

  const [step, setStep] = useState<number>(1);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [alias, setAlias] = useState("");
  const [uiBookingType, setUiBookingType] = useState<UiBookingType>("Customer Booking");
  const [note, setNote] = useState("");
  const [paymentOption, setPaymentOption] = useState<PaymentOption>("Mark as Paid");
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);

  const activeSessions = useMemo(
    () => state.sessions.filter((s) => s.status !== "cancelled" && s.status !== "archived"),
    [state.sessions]
  );

  const selectedSession = useMemo(
    () => state.sessions.find((s) => s.id === selectedSessionId),
    [state.sessions, selectedSessionId]
  );

  const ledger = useMemo(
    () => (selectedSessionId ? sessionCapacityLedger(state, selectedSessionId) : null),
    [state, selectedSessionId]
  );

  const isFull = ledger ? ledger.remainingSellableCapacity === 0 : false;

  const handleSelectSession = (id: string) => {
    setSelectedSessionId(id);
    setStep(2);
  };

  const handleStep2Continue = () => {
    setStep(3);
  };

  const handleStep3Continue = (e: React.FormEvent) => {
    e.preventDefault();
    if (!alias.trim()) return;
    setStep(4);
  };

  const handleConfirm = () => {
    if (!selectedSessionId || !selectedSession) return;

    let type: BookingType = "individual";
    let source: BookingSource = "admin";

    if (uiBookingType === "Customer Booking") {
      type = "individual";
    } else if (uiBookingType === "Staff Added Booking") {
      type = "admin";
      source = "admin";
    } else if (uiBookingType === "Free Pass") {
      type = "complimentary";
      source = "complimentary";
    }

    if (paymentOption === "Free Pass") {
      type = "complimentary";
      source = "complimentary";
    }

    const res = createBookingReservation({
      sessionId: selectedSessionId,
      alias,
      bookingType: type,
      source,
      amount: paymentOption === "Free Pass" ? 0 : selectedSession.basePrice,
      operatorId: role.id,
      notes: note,
    } as any);

    if (res.error) {
      alert(res.error);
      return;
    }

    if (res.booking) {
      if (paymentOption === "Mark as Paid") {
        confirmBookingPayment(res.booking.id);
      }
      setCreatedBookingId(res.booking.id);
      setStep(5);
    }
  };

  const resetForm = () => {
    setStep(1);
    setSelectedSessionId("");
    setAlias("");
    setUiBookingType("Customer Booking");
    setNote("");
    setPaymentOption("Mark as Paid");
    setCreatedBookingId(null);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 space-y-6">
      <BookingBackNavigation label="Back to Bookings" href="/bookings" />

      <PageHeader
        overline="Add Booking"
        title="Add Booking"
        sub="Add someone to an event or place them on the waiting list."
      />

      <div className="mt-8">
        {step === 1 && (
          <Stagger className="space-y-4">
            <Item>
              <h2 className="text-lg font-medium text-ink-lum mb-4">Choose Event</h2>
            </Item>
            {activeSessions.length === 0 ? (
              <Item>
                <div className="p-8 text-center text-ink-mut glass rounded-xl">
                  No active events available.
                </div>
              </Item>
            ) : (
              activeSessions.map((session) => {
                const sessionLedger = sessionCapacityLedger(state, session.id);
                const totalJoined = sessionLedger.confirmedPaidBookings + sessionLedger.confirmedComplimentaryBookings;
                const isSessionFull = sessionLedger.remainingSellableCapacity === 0;
                const vName = venueName(state, session.venueId);

                return (
                  <Item key={session.id}>
                    <div className="glass rounded-xl p-5 flex flex-col md:flex-row gap-5 items-start md:items-center">
                      <div className="flex-1 space-y-3 w-full">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-ink-lum">
                            {sessionTitle(state, session.id)}
                          </h3>
                          <Badge>{session.date} • {session.startTime}</Badge>
                          <StatusChip value={session.status as string} />
                        </div>
                        
                        <div className="text-sm text-ink-sec flex items-center gap-2">
                          <svg className="w-4 h-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          {vName}
                        </div>

                        <div className="flex flex-col gap-1 w-full max-w-sm">
                          <div className="flex justify-between text-xs text-ink-sec">
                            <span>{totalJoined} / {sessionLedger.sellableCapacity} joined</span>
                            {isSessionFull ? (
                              <span className="text-brand-solid font-bold">Full</span>
                            ) : (
                              <span>{sessionLedger.remainingSellableCapacity} spaces left</span>
                            )}
                          </div>
                          <FillMeter value={sessionLedger.fillRate} />
                          {sessionLedger.waitlistCount > 0 && (
                            <div className="text-xs text-ink-mut mt-1">
                              {sessionLedger.waitlistCount} waiting
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-3 w-full md:w-auto shrink-0 border-t border-white/5 pt-4 md:border-0 md:pt-0">
                        <div className="text-lg font-medium text-ink-lum">
                          {inr(session.basePrice)}
                        </div>
                        <Button 
                          variant="primary" 
                          onClick={() => handleSelectSession(session.id)}
                          className="w-full md:w-auto"
                        >
                          Choose Event
                        </Button>
                      </div>
                    </div>
                  </Item>
                );
              })
            )}
          </Stagger>
        )}

        {step === 2 && ledger && selectedSession && (
          <Stagger className="max-w-xl glass rounded-2xl p-6 space-y-6">
            <Item>
              <h2 className="text-lg font-medium text-ink-lum mb-2">Check Spaces</h2>
              <div className="text-sm text-ink-sec mb-6">
                {sessionTitle(state, selectedSession.id)} • {selectedSession.date} {selectedSession.startTime}
              </div>
            </Item>

            <Item>
              <div className="bg-black/20 rounded-xl p-5 border border-white/5 space-y-4">
                <CapacitySummary ledger={ledger} />
              </div>
            </Item>

            <Item>
              {isFull ? (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl bg-brand-solid/10 text-brand-solid border border-brand-solid/20 text-sm">
                    This event is full. You can add this person to the waiting list.
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                    <Button variant="primary" onClick={handleStep2Continue}>Add to Waiting List</Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end gap-3 mt-8">
                  <Button variant="ghost" onClick={() => setStep(1)}>Back</Button>
                  <Button variant="primary" onClick={handleStep2Continue}>Continue</Button>
                </div>
              )}
            </Item>
          </Stagger>
        )}

        {step === 3 && (
          <form onSubmit={handleStep3Continue} className="max-w-xl glass rounded-2xl p-6 space-y-6">
            <h2 className="text-lg font-medium text-ink-lum mb-6">Participant Details</h2>
            
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-lum">Name / Alias <span className="text-brand-solid">*</span></label>
                <input
                  type="text"
                  required
                  value={alias}
                  onChange={(e) => setAlias(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-ink-lum focus:outline-none focus:border-brand-solid focus:ring-1 focus:ring-brand-solid"
                  placeholder="e.g. John Doe"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-lum">Booking Type</label>
                <select
                  value={uiBookingType}
                  onChange={(e) => setUiBookingType(e.target.value as UiBookingType)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-ink-lum focus:outline-none focus:border-brand-solid focus:ring-1 focus:ring-brand-solid appearance-none"
                >
                  <option value="Customer Booking">Customer Booking</option>
                  <option value="Staff Added Booking">Staff Added Booking</option>
                  <option value="Free Pass">Free Pass</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-ink-lum">Note (Optional)</label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-ink-lum focus:outline-none focus:border-brand-solid focus:ring-1 focus:ring-brand-solid resize-none h-24"
                  placeholder="Add any special requirements or notes..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>Back</Button>
              <Button type="submit" variant="primary" disabled={!alias.trim()}>Continue</Button>
            </div>
          </form>
        )}

        {step === 4 && selectedSession && (
          <Stagger className="max-w-xl glass rounded-2xl p-6 space-y-6">
            <Item>
              <h2 className="text-lg font-medium text-ink-lum mb-6">Payment Options</h2>
            </Item>

            <Item>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-4 border border-white/10 rounded-xl cursor-pointer hover:bg-white/5 transition-colors bg-black/20">
                  <input
                    type="radio"
                    name="payment"
                    value="Mark as Paid"
                    checked={paymentOption === "Mark as Paid"}
                    onChange={(e) => setPaymentOption(e.target.value as PaymentOption)}
                    className="w-4 h-4 accent-brand-solid"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-ink-lum">Mark as Paid</div>
                    <div className="text-sm text-ink-mut">Customer has already paid via cash or external terminal.</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-4 border border-white/10 rounded-xl cursor-pointer hover:bg-white/5 transition-colors bg-black/20">
                  <input
                    type="radio"
                    name="payment"
                    value="Waiting for Payment"
                    checked={paymentOption === "Waiting for Payment"}
                    onChange={(e) => setPaymentOption(e.target.value as PaymentOption)}
                    className="w-4 h-4 accent-brand-solid"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-ink-lum">Waiting for Payment</div>
                    <div className="text-sm text-ink-mut">Generate a payment link or collect payment later.</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-4 border border-white/10 rounded-xl cursor-pointer hover:bg-white/5 transition-colors bg-black/20">
                  <input
                    type="radio"
                    name="payment"
                    value="Free Pass"
                    checked={paymentOption === "Free Pass"}
                    onChange={(e) => setPaymentOption(e.target.value as PaymentOption)}
                    className="w-4 h-4 accent-brand-solid"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-ink-lum">Free Pass</div>
                    <div className="text-sm text-ink-mut">Provide this booking for free (Complimentary).</div>
                  </div>
                </label>
              </div>
            </Item>

            <Item>
              <div className="bg-black/30 p-4 rounded-xl flex justify-between items-center border border-white/5 mt-4">
                <span className="text-ink-sec">Amount Due</span>
                <span className="text-xl font-medium text-ink-lum">
                  {paymentOption === "Free Pass" ? inr(0) : inr(selectedSession.basePrice)}
                </span>
              </div>
            </Item>

            <Item>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="ghost" onClick={() => setStep(3)}>Back</Button>
                <Button variant="primary" onClick={() => setStep(5)}>Continue</Button>
              </div>
            </Item>
            
            <Item>
              <PrototypeModeBanner />
            </Item>
          </Stagger>
        )}

        {step === 5 && !createdBookingId && selectedSession && (
          <Stagger className="max-w-xl glass rounded-2xl p-6 space-y-6">
            <Item>
              <h2 className="text-lg font-medium text-ink-lum mb-6">Confirm Booking</h2>
            </Item>

            <Item>
              <div className="space-y-4 bg-black/20 p-5 rounded-xl border border-white/5">
                <div className="grid grid-cols-2 gap-y-4 text-sm">
                  <div className="text-ink-mut">Event</div>
                  <div className="text-ink-lum font-medium text-right">{sessionTitle(state, selectedSession.id)}</div>
                  
                  <div className="text-ink-mut">Participant</div>
                  <div className="text-ink-lum font-medium text-right">{alias}</div>
                  
                  <div className="text-ink-mut">Booking Type</div>
                  <div className="text-ink-lum font-medium text-right">{uiBookingType}</div>
                  
                  <div className="text-ink-mut">Space</div>
                  <div className="text-ink-lum font-medium text-right">{isFull ? "Waiting List" : "Confirmed Spot"}</div>
                  
                  <div className="text-ink-mut">Payment Status</div>
                  <div className="text-ink-lum font-medium text-right">{paymentOption}</div>

                  <div className="text-ink-mut">Amount</div>
                  <div className="text-ink-lum font-medium text-right">
                    {paymentOption === "Free Pass" ? inr(0) : inr(selectedSession.basePrice)}
                  </div>
                </div>
              </div>
            </Item>

            <Item>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="ghost" onClick={() => setStep(4)}>Back</Button>
                <Button variant="primary" onClick={handleConfirm}>Confirm Booking</Button>
              </div>
            </Item>
          </Stagger>
        )}

        {step === 5 && createdBookingId && (
          <Stagger className="max-w-xl glass rounded-2xl p-8 text-center space-y-6 mx-auto">
            <Item>
              <div className="flex justify-center mb-6">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-green-500" />
                </div>
              </div>
              <h2 className="text-2xl font-medium text-ink-lum mb-2">Booking Successful</h2>
              <p className="text-ink-sec text-sm">
                The booking for {alias} has been {isFull ? "added to the waiting list" : "confirmed"}.
              </p>
            </Item>
            
            <Item>
              <div className="flex flex-col sm:flex-row justify-center gap-3 mt-8">
                <Button 
                  variant="lamp" 
                  onClick={() => router.push(`/bookings/${createdBookingId}`)}
                >
                  View Booking
                </Button>
                <Button 
                  variant="primary" 
                  onClick={resetForm}
                >
                  Add Another
                </Button>
              </div>
              <div className="mt-4">
                <Button 
                  variant="ghost" 
                  onClick={() => router.push('/bookings')}
                  className="text-ink-mut"
                >
                  Back to Bookings
                </Button>
              </div>
            </Item>
          </Stagger>
        )}
      </div>
    </div>
  );
}
