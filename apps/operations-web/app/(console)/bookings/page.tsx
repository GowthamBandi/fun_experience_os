"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { inr } from "@/lib/format";
import type { Booking } from "@/lib/prototype/entities";
import { selectBookingList, selectReservationOperationalMetrics } from "@/lib/prototype/selectors/bookings";
import { generateOperationsAlerts } from "@/lib/prototype/selectors/intelligence";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { DataTable, type Column } from "@/components/ui/table";
import { SearchInput } from "@/components/ui/fields";
import { StatusChip, Button } from "@/components/ui/primitives";
import { OperationsAlertsPanel } from "@/components/geo/OperationsAlertsPanel";
import { AIIntelligencePlaceholder } from "@/components/geo/AIIntelligencePlaceholder";
import { Stagger, Item } from "@/components/motion/Motion";

type TabMode = "all" | "queue" | "failures" | "expiring";

export default function ReservationOperationsPage() {
  const {
    territory,
    canAccess,
    state,
    confirmBookingPayment,
    failBookingPayment,
    expireReservation,
    cancelBooking,
    offerWaitlistSlot,
  } = useStore();

  const [tab, setTab] = useState<TabMode>("all");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const metrics = useMemo(() => selectReservationOperationalMetrics(state), [state]);
  const alerts = useMemo(() => generateOperationsAlerts(state), [state]);

  const allBookings = useMemo(() => selectBookingList(state), [state]);

  const filteredBookings = useMemo(() => {
    let list = allBookings;

    if (tab === "queue") {
      list = list.filter((b) => b.status === "waitlisted" || b.status === "waitlist-offered");
    } else if (tab === "failures") {
      list = list.filter((b) => b.status === "payment-failed" || b.paymentStatus === "failed");
    } else if (tab === "expiring") {
      list = list.filter((b) => b.reservationStatus === "active" || b.reservationStatus === "offer-hold");
    }

    if (statusFilter !== "all") {
      list = list.filter((b) => b.status === statusFilter);
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
  }, [allBookings, tab, statusFilter, query]);

  if (!canAccess("/bookings")) return <PageFrame><PermissionDenied module="Bookings" /></PageFrame>;

  const columns: Column<Booking>[] = [
    {
      key: "code",
      header: "Booking Code",
      render: (b) => (
        <div>
          <Link href={`/bookings/${b.id}`} className="font-mono font-bold text-emerald-400 hover:underline">
            {b.bookingCode || b.id}
          </Link>
          <div className="text-[10px] text-slate-500 font-mono">{b.source || "customer-app"}</div>
        </div>
      ),
    },
    {
      key: "alias",
      header: "Participant",
      render: (b) => (
        <div>
          <p className="font-medium text-slate-200">{b.alias}</p>
          <p className="text-[11px] text-slate-400 font-mono">{b.phoneMask}</p>
        </div>
      ),
    },
    {
      key: "session",
      header: "Session",
      render: (b) => (
        <span className="text-slate-300 font-mono text-xs">
          {sessionTitle(state, b.sessionId)}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (b) => (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-slate-800 text-slate-300 border border-slate-700">
          {b.bookingType || "individual"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (b) => <span className="tabular font-mono text-slate-200">{inr(b.amount)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (b) => <StatusChip value={b.status} />,
    },
    {
      key: "expiry",
      header: "Hold / Expiry",
      render: (b) => (
        <span className="text-[11px] font-mono text-amber-400">
          {b.reservationExpiresAt || b.waitlistOfferExpiresAt || "—"}
        </span>
      ),
    },
    {
      key: "action",
      header: "Actions",
      align: "right",
      render: (b) => (
        <div className="flex items-center justify-end gap-1.5 font-mono">
          {(b.status === "payment-pending" || b.status === "reserved") && (
            <>
              <button
                onClick={() => confirmBookingPayment(b.id)}
                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded text-[10px]"
              >
                Confirm Pay
              </button>
              <button
                onClick={() => failBookingPayment(b.id)}
                className="px-2 py-1 bg-red-950 hover:bg-red-900 text-red-300 border border-red-800 rounded text-[10px]"
              >
                Fail Pay
              </button>
            </>
          )}

          {b.status === "waitlisted" && (
            <button
              onClick={() => offerWaitlistSlot(b.sessionId)}
              className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded text-[10px]"
            >
              Offer Slot
            </button>
          )}

          {b.status === "confirmed" && (
            <button
              onClick={() => cancelBooking(b.id)}
              className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded text-[10px]"
            >
              Cancel
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <PageFrame>
      <PageHeader
        overline={`Reservation Operations · ${territory.name}`}
        title="Reservation Operations Command Center"
        sub="Authoritative reservation control, hold countdowns, payment dispatches, and capacity recovery."
        right={
          <Link href="/bookings/new">
            <Button variant="lamp" className="h-9 px-4 text-xs font-mono font-bold">
              + Dispatch Reservation
            </Button>
          </Link>
        }
      />

      {/* Global KPIs Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6 font-mono">
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Total Reservations</div>
          <div className="text-xl font-bold text-slate-200">{metrics.totalBookings}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Active Holds</div>
          <div className="text-xl font-bold text-amber-400">{metrics.activeReservations}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Confirmed Seats</div>
          <div className="text-xl font-bold text-emerald-400">{metrics.confirmed}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Waitlist Queue</div>
          <div className="text-xl font-bold text-purple-400">{metrics.waitlisted}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-3">
          <div className="text-[10px] text-slate-500 uppercase">Payment Failures</div>
          <div className="text-xl font-bold text-red-400">{metrics.paymentFailed}</div>
        </div>
      </div>

      {/* Operations Intelligence Alerts */}
      <div className="mt-6">
        <OperationsAlertsPanel alerts={alerts} />
      </div>

      {/* AI Intelligence Placeholder */}
      <div className="mt-4">
        <AIIntelligencePlaceholder
          title="Reservation Velocity & Capacity Demand Forecast"
          metrics={[
            { label: "Predicted Peak Demand", value: "+28%", hint: "High weekend volume" },
            { label: "Expected Waitlist Clearance", value: "92%", hint: "Fast slot recycling" },
            { label: "Suggested Hold Duration", value: "10 mins", hint: "Optimize conversion" },
            { label: "No-Show Risk Score", value: "Low (4%)", hint: "Stable door arrival" },
          ]}
        />
      </div>

      {/* Main Table Toolbar & Tabs */}
      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2 font-mono text-xs">
            <button
              onClick={() => setTab("all")}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                tab === "all" ? "bg-emerald-600 text-slate-950" : "bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              All Reservations ({allBookings.length})
            </button>
            <button
              onClick={() => setTab("queue")}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                tab === "queue" ? "bg-purple-600 text-white" : "bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              Operational Queue ({metrics.waitlisted})
            </button>
            <button
              onClick={() => setTab("failures")}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                tab === "failures" ? "bg-red-950 text-red-300 border border-red-800" : "bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              Payment Failures ({metrics.paymentFailed})
            </button>
            <button
              onClick={() => setTab("expiring")}
              className={`px-3 py-1.5 rounded-md font-semibold transition-colors ${
                tab === "expiring" ? "bg-amber-950 text-amber-300 border border-amber-800" : "bg-slate-900 text-slate-400 hover:text-slate-200"
              }`}
            >
              Active Holds ({metrics.activeReservations})
            </button>
          </div>

          <div className="w-64">
            <SearchInput value={query} onChange={setQuery} placeholder="Search alias or code…" />
          </div>
        </div>

        <Stagger>
          <Item>
            <DataTable
              columns={columns}
              rows={filteredBookings}
              emptyTitle="No matching reservations found."
              emptyLine="Try relaxing query or tab filter criteria."
            />
          </Item>
        </Stagger>
      </div>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}

