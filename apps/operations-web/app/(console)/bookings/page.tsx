"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BookingStatusBadge,
  PaymentStatusBadge,
  BookingMetricsSummary,
  deriveBookingMetrics,
  BookingPrimaryAction,
  BookingEmptyState,
  OperatorHintPanel,
  bookingSourceLabel,
  PrototypeModeBanner,
} from "@/components/bookings/shared";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { SearchInput } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { PermissionDenied } from "@/components/ui/panels";
import { Stagger, Item } from "@/components/motion/Motion";
import { useStore } from "@/lib/store";
import { inr } from "@/lib/format";
import type { Booking } from "@/lib/prototype/entities";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { selectBookingList } from "@/lib/prototype/selectors/bookings";

export default function BookingsOverviewPage() {
  const {
    territory,
    canAccess,
    state,
    confirmBookingPayment,
    offerWaitlistSlot,
    acceptWaitlistOffer,
  } = useStore();

  const [tab, setTab] = useState("all");
  const [query, setQuery] = useState("");

  const allBookings = useMemo(() => selectBookingList(state), [state]);
  const metrics = useMemo(() => deriveBookingMetrics(state), [state]);

  const filteredBookings = useMemo(() => {
    let list = allBookings;

    if (tab === "confirmed") {
      list = list.filter((b) => b.status === "confirmed" || b.paymentStatus === "confirmed");
    } else if (tab === "waiting") {
      list = list.filter(
        (b) => b.reservationStatus === "active" || b.status === "reserved" || b.status === "payment-pending"
      );
    } else if (tab === "failures") {
      list = list.filter((b) => b.status === "payment-failed" || b.paymentStatus === "failed");
    } else if (tab === "waitlist") {
      list = list.filter((b) => b.status === "waitlisted" || b.status === "waitlist-offered");
    } else if (tab === "cancelled") {
      list = list.filter(
        (b) => b.status === "cancelled" || b.status === "cancelled-user" || b.status === "cancelled-company"
      );
    }

    if (query) {
      const q = query.toLowerCase();
      list = list.filter(
        (b) =>
          b.alias.toLowerCase().includes(q) ||
          (b.bookingCode && b.bookingCode.toLowerCase().includes(q)) ||
          b.id.toLowerCase().includes(q)
      );
    }

    return list;
  }, [allBookings, tab, query]);

  if (!canAccess("/bookings")) return <PageFrame><PermissionDenied module="Bookings" /></PageFrame>;

  const onAction = (actionKey: string, bookingId: string) => {
    if (actionKey === "confirm-payment" || actionKey === "retry-payment") {
      confirmBookingPayment(bookingId);
    } else if (actionKey === "offer-waitlist") {
      const b = allBookings.find((x) => x.id === bookingId);
      if (b) offerWaitlistSlot(b.sessionId);
    } else if (actionKey === "accept-waitlist") {
      acceptWaitlistOffer(bookingId);
    }
  };

  const columns: Column<Booking>[] = [
    {
      key: "booking",
      header: "Booking",
      render: (b) => (
        <div>
          <Link href={`/bookings/${b.id}`} className="font-medium text-ink-lum hover:underline">
            {b.bookingCode || b.id}
          </Link>
          <div className="text-xs text-ink-mut">{bookingSourceLabel(b.source)}</div>
        </div>
      ),
    },
    {
      key: "participant",
      header: "Participant",
      render: (b) => (
        <div>
          <p className="font-medium text-ink-lum">{b.alias}</p>
          <p className="text-xs text-ink-mut">{b.phoneMask}</p>
        </div>
      ),
    },
    {
      key: "event",
      header: "Event",
      render: (b) => <span className="text-sm text-ink-sec">{sessionTitle(state, b.sessionId)}</span>,
    },
    {
      key: "status",
      header: "Booking Status",
      render: (b) => <BookingStatusBadge status={b.status as string} />,
    },
    {
      key: "payment",
      header: "Payment",
      render: (b) => <PaymentStatusBadge status={b.paymentStatus as string} />,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (b) => <span className="tabular text-ink-lum font-medium">{inr(b.amount)}</span>,
    },
    {
      key: "action",
      header: "Next Action",
      align: "right",
      render: (b) => <BookingPrimaryAction booking={b} onAction={onAction} />,
    },
  ];

  const tabs = [
    { id: "all", label: "All Bookings" },
    { id: "confirmed", label: "Confirmed" },
    { id: "waiting", label: "Waiting for Payment" },
    { id: "failures", label: "Payment Problems" },
    { id: "waitlist", label: "Waiting List" },
    { id: "cancelled", label: "Cancelled" },
  ];

  return (
    <PageFrame>
      <PrototypeModeBanner />
      <PageHeader
        overline={`Bookings · ${territory.name}`}
        title="Bookings"
        sub="See who joined, who paid, who is waiting, and what needs attention."
        right={
          <Link href="/bookings/new">
            <Button variant="primary" className="h-9 px-4 text-sm font-medium">
              + Add Booking
            </Button>
          </Link>
        }
      />

      <Stagger className="mt-6 space-y-6">
        <Item>
          <OperatorHintPanel state={state} />
        </Item>
        <Item>
          <BookingMetricsSummary metrics={metrics} />
        </Item>

        <Item>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-1 overflow-x-auto pb-2 sm:pb-0 hide-scrollbar">
                {tabs.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      tab === t.id ? "bg-ink-lum text-ink-inv" : "text-ink-sec hover:text-ink-lum hover:bg-white/5"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div className="w-full sm:w-64">
                <SearchInput value={query} onChange={setQuery} placeholder="Search bookings..." />
              </div>
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block">
              {filteredBookings.length === 0 ? (
                <BookingEmptyState
                  title="No bookings found"
                  message="No bookings match the selected criteria."
                  actionLabel="Add Booking"
                  actionHref="/bookings/new"
                />
              ) : (
                <DataTable columns={columns} rows={filteredBookings} emptyTitle="No bookings found" emptyLine="No bookings match the selected criteria." />
              )}
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden flex flex-col gap-4">
              {filteredBookings.length === 0 ? (
                <BookingEmptyState
                  title="No bookings found"
                  message="No bookings match the selected criteria."
                  actionLabel="Add Booking"
                  actionHref="/bookings/new"
                />
              ) : (
                filteredBookings.map((b) => (
                  <div key={b.id} className="glass p-4 rounded-xl border border-white/5 flex flex-col gap-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <Link href={`/bookings/${b.id}`} className="font-medium text-ink-lum hover:underline">
                          {b.bookingCode || b.id}
                        </Link>
                        <div className="text-xs text-ink-mut">{bookingSourceLabel(b.source)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-ink-lum tabular">{inr(b.amount)}</div>
                      </div>
                    </div>
                    <div>
                      <div className="font-medium text-ink-lum">{b.alias}</div>
                      <div className="text-xs text-ink-mut">{b.phoneMask}</div>
                      <div className="text-sm text-ink-sec mt-1">{sessionTitle(state, b.sessionId)}</div>
                    </div>
                    <div className="flex gap-2 items-center flex-wrap">
                      <BookingStatusBadge status={b.status as string} />
                      <PaymentStatusBadge status={b.paymentStatus as string} />
                    </div>
                    <div className="mt-2 flex justify-end">
                      <BookingPrimaryAction booking={b} onAction={onAction} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </Item>
      </Stagger>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}
