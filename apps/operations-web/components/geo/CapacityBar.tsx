"use client";

import type { SessionCapacityLedger } from "@/lib/prototype/selectors/capacity";

export function CapacityBar({ ledger }: { ledger: SessionCapacityLedger }) {
  const {
    maxPhysicalCapacity,
    blockedSlots,
    sellableCapacity,
    confirmedPaidBookings,
    confirmedComplimentaryBookings,
    activeReservationHolds,
    waitlistOfferHolds,
    remainingSellableCapacity,
    fillRate,
    occupancyStatus,
  } = ledger;

  const getStatusBadge = () => {
    switch (occupancyStatus) {
      case "full":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-950 text-red-400 border border-red-800">FULL (0 Left)</span>;
      case "almost-full":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-950 text-amber-400 border border-amber-800">ALMOST FULL ({fillRate}%)</span>;
      case "overbooked":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-purple-950 text-purple-400 border border-purple-800 animate-pulse">OVERBOOKED</span>;
      case "under-minimum":
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-blue-950 text-blue-400 border border-blue-800">BELOW MIN</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">HEALTHY ({fillRate}%)</span>;
    }
  };

  // Percentage calculations for bar
  const pctConfirmedPaid = sellableCapacity > 0 ? (confirmedPaidBookings / sellableCapacity) * 100 : 0;
  const pctConfirmedComp = sellableCapacity > 0 ? (confirmedComplimentaryBookings / sellableCapacity) * 100 : 0;
  const pctReserved = sellableCapacity > 0 ? (activeReservationHolds / sellableCapacity) * 100 : 0;
  const pctOfferHold = sellableCapacity > 0 ? (waitlistOfferHolds / sellableCapacity) * 100 : 0;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Capacity Inventory</span>
          {getStatusBadge()}
        </div>
        <div className="text-xs text-slate-300 font-mono">
          <span className="text-emerald-400 font-semibold">{remainingSellableCapacity}</span> / {sellableCapacity} sellable remaining
        </div>
      </div>

      {/* Visual Multi-Segment Bar */}
      <div className="h-3 w-full bg-slate-950 rounded-full overflow-hidden flex border border-slate-800">
        <div style={{ width: `${pctConfirmedPaid}%` }} className="bg-emerald-500 transition-all duration-300" title={`Confirmed Paid: ${confirmedPaidBookings}`} />
        <div style={{ width: `${pctConfirmedComp}%` }} className="bg-blue-500 transition-all duration-300" title={`Confirmed Comp: ${confirmedComplimentaryBookings}`} />
        <div style={{ width: `${pctReserved}%` }} className="bg-amber-500 transition-all duration-300" title={`Active Reservation Holds: ${activeReservationHolds}`} />
        <div style={{ width: `${pctOfferHold}%` }} className="bg-purple-500 transition-all duration-300" title={`Waitlist Offer Holds: ${waitlistOfferHolds}`} />
      </div>

      {/* Legend Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs font-mono text-slate-400 pt-1">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
          <span>Confirmed ({confirmedPaidBookings})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
          <span>Comp ({confirmedComplimentaryBookings})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
          <span>Held ({activeReservationHolds})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-purple-500 inline-block" />
          <span>Offer Hold ({waitlistOfferHolds})</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-slate-700 inline-block" />
          <span>Blocked ({blockedSlots})</span>
        </div>
      </div>
    </div>
  );
}
