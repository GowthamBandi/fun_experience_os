"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { BookingBackNavigation } from "@/components/bookings/shared";
import { Stagger, Item } from "@/components/motion/Motion";

export default function ReconciliationPage() {
  const { state, reconcilePayment } = useStore();

  const payments = useMemo(() => state.payments ?? [], [state]);
  const bookings = useMemo(() => state.bookings, [state]);

  const bookingIds = new Set(bookings.map((b) => b.id));
  const unmatchedPayments = payments.filter((p) => !bookingIds.has(p.bookingId));
  const unpaidConfirmedBookings = bookings.filter(
    (b) =>
      (b.status === "confirmed" || b.paymentStatus === "confirmed") &&
      b.bookingType !== "complimentary" &&
      !payments.some((p) => p.bookingId === b.id && (p.status === "confirmed" || p.status === "reconciled"))
  );

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <BookingBackNavigation label="Back to Money" href="/money" />
      
      <PageHeader
        overline="Financial Operations"
        title="Payment Check"
        sub="Find bookings and payments that do not match."
      />

      <div className="pt-4">
        {unmatchedPayments.length === 0 && unpaidConfirmedBookings.length === 0 ? (
          <div className="glass p-8 rounded-xl text-center text-ink-sec flex flex-col items-center justify-center gap-3">
            <div className="text-4xl text-emerald-500">✓</div>
            <p>All payments and bookings match. No problems found.</p>
          </div>
        ) : (
          <Stagger className="space-y-4">
            {unmatchedPayments.map((p) => (
              <Item key={p.id}>
                <div className="glass p-5 rounded-xl border border-warn/30">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-ink-lum font-medium text-lg">Payment received but booking not confirmed</h4>
                      <p className="text-ink-mut text-sm mt-1">
                        Amount: <span className="font-mono text-ink-lum">{inr(p.amount)}</span> · Payment ID: {p.id}
                      </p>
                      <p className="text-ink-sec text-sm mt-3 bg-ink-sec/10 p-3 rounded-lg">
                        <span className="font-medium text-ink-lum">Why it matters:</span> We took money but didn&apos;t confirm their spot. This will cause confusion at the door.
                      </p>
                    </div>
                    <Button
                      variant="primary"
                      onClick={() => reconcilePayment(p.id)}
                    >
                      Resolve
                    </Button>
                  </div>
                </div>
              </Item>
            ))}

            {unpaidConfirmedBookings.map((b) => (
              <Item key={b.id}>
                <div className="glass p-5 rounded-xl border border-red-500/30">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-ink-lum font-medium text-lg">Booking confirmed but payment missing</h4>
                      <p className="text-ink-mut text-sm mt-1">
                        Amount expected: <span className="font-mono text-ink-lum">{inr(b.amount)}</span> · Participant: {b.alias}
                      </p>
                      <p className="text-ink-sec text-sm mt-3 bg-ink-sec/10 p-3 rounded-lg">
                        <span className="font-medium text-ink-lum">Why it matters:</span> The guest thinks they have a reservation, but they haven&apos;t paid. We are losing revenue.
                      </p>
                    </div>
                    <Link href={`/bookings/${b.id}`}>
                      <Button variant="secondary">
                        Review Booking
                      </Button>
                    </Link>
                  </div>
                </div>
              </Item>
            ))}
          </Stagger>
        )}
      </div>
    </div>
  );
}
