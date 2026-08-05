"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { selectSessionWaitlistQueue } from "@/lib/prototype/selectors/bookings";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { PageHeader } from "@/components/ui/PageHeader";
import { CapacityBar } from "@/components/geo/CapacityBar";
import { DataTable, type Column } from "@/components/ui/table";
import { StatusChip, Button } from "@/components/ui/primitives";
import type { Booking } from "@/lib/prototype/entities";

export default function QueueOperationsPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const {
    state,
    offerWaitlistSlot,
    acceptWaitlistOffer,
    expireWaitlistOffer,
    joinWaitlist,
    role,
  } = useStore();

  const session = useMemo(() => state.sessions.find((s) => s.id === sessionId), [state, sessionId]);
  const ledger = useMemo(() => sessionCapacityLedger(state, sessionId), [state, sessionId]);
  const queue = useMemo(() => selectSessionWaitlistQueue(state, sessionId), [state, sessionId]);

  if (!session) {
    return <div className="p-8 text-xs font-mono text-slate-400">Session not found.</div>;
  }

  const handleSimulateJoin = () => {
    const aliasList = ["SpeedyStriker", "NightOwl", "TurboSmash", "VolleyKing", "PadelPro"];
    const randomAlias = aliasList[Math.floor(Math.random() * aliasList.length)] + Math.floor(Math.random() * 90 + 10);
    joinWaitlist({ sessionId, alias: randomAlias, operatorId: role.id });
  };

  const columns: Column<Booking>[] = [
    {
      key: "order",
      header: "Pos #",
      render: (b) => <span className="font-mono font-bold text-amber-400">#{b.waitlistOrder || 1}</span>,
    },
    {
      key: "code",
      header: "Queue ID",
      render: (b) => <span className="font-mono text-slate-300">{b.bookingCode || b.id}</span>,
    },
    { key: "alias", header: "Participant", render: (b) => <span className="font-medium text-slate-200">{b.alias}</span> },
    { key: "status", header: "Queue State", render: (b) => <StatusChip value={b.status} /> },
    {
      key: "expiry",
      header: "Offer Countdown",
      render: (b) => (
        <span className="font-mono text-purple-400">{b.waitlistOfferExpiresAt || "No active offer"}</span>
      ),
    },
    {
      key: "action",
      header: "Queue Dispatch",
      align: "right",
      render: (b) => (
        <div className="flex items-center justify-end gap-1.5 font-mono">
          {b.status === "waitlisted" && (
            <button
              onClick={() => offerWaitlistSlot(sessionId, role.id)}
              className="px-2 py-1 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded text-[10px]"
            >
              Extend Offer
            </button>
          )}

          {b.status === "waitlist-offered" && (
            <>
              <button
                onClick={() => acceptWaitlistOffer(b.id, role.id)}
                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold rounded text-[10px]"
              >
                Accept Offer
              </button>
              <button
                onClick={() => expireWaitlistOffer(b.id, role.id)}
                className="px-2 py-1 bg-amber-950 hover:bg-amber-900 text-amber-300 border border-amber-800 rounded text-[10px]"
              >
                Expire Offer
              </button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline={`Queue Operations · ${session.id}`}
        title={`Queue Operations: ${sessionTitle(state, session.id)}`}
        sub="Ordered operational waitlist queue, capacity recovery holds, offer expiry countdowns, and automated promotion dispatch."
        right={
          <div className="flex items-center gap-2">
            <button
              onClick={handleSimulateJoin}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-bold"
            >
              + Simulate Waitlist Join
            </button>
            <button
              onClick={() => offerWaitlistSlot(sessionId, role.id)}
              disabled={ledger.remainingSellableCapacity <= 0 || queue.length === 0}
              className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold rounded"
            >
              Offer Top Slot ({ledger.remainingSellableCapacity} Available)
            </button>
          </div>
        }
      />

      <CapacityBar ledger={ledger} />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
            Waitlist Operational Queue ({queue.length})
          </h3>
          <span className="text-slate-400">Remaining Sellable: <strong className="text-emerald-400">{ledger.remainingSellableCapacity}</strong></span>
        </div>
        <DataTable columns={columns} rows={queue} emptyTitle="Queue is empty." emptyLine="No participants currently waiting for this session." />
      </div>
    </div>
  );
}
