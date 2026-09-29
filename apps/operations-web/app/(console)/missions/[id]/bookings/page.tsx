"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { inr } from "@/lib/format";
import { Button } from "@/components/ui/primitives";
import { SearchInput } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import type { Booking } from "@/lib/prototype/entities";
import { sessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { selectSessionFinancialSummary } from "@/lib/prototype/selectors/money";
import { canonicalBookingStatus, CANCELLABLE_STATUSES, seatClass } from "@/lib/prototype/selectors/status";
import { BookingStatusChip, CapacityPanel, Countdown, Section, Segments, formatWhen, whenMillis } from "@/components/bookings/shared";
import { CancelBookingDialog, RecordPaymentDialog } from "@/components/bookings/dialogs";
import { SessionFrame } from "@/components/bookings/SessionFrame";

type Group = "seated" | "holds" | "waitlist" | "closed" | "all";

const groupOf = (b: Booking): Exclude<Group, "all"> => {
  const cls = seatClass(b);
  if (cls === "paid" || cls === "comp") return "seated";
  if (cls === "hold") return "holds";
  if (cls === "waitlist" || cls === "offer") return "waitlist";
  return "closed";
};

export default function SessionBookingsPage() {
  const params = useParams();
  const sessionId = String(params.id ?? "");
  const router = useRouter();
  const { state, canAccess } = useStore();
  const [group, setGroup] = useState<Group>("seated");
  const [query, setQuery] = useState("");
  const [paying, setPaying] = useState<Booking>();
  const [cancelling, setCancelling] = useState<Booking>();

  const canManage = canAccess("/bookings");
  const ledger = useMemo(() => sessionCapacityLedger(state, sessionId), [state, sessionId]);
  const fin = useMemo(() => selectSessionFinancialSummary(state, sessionId), [state, sessionId]);
  const bookings = useMemo(
    () => state.bookings.filter((b) => b.sessionId === sessionId).sort((a, b) => whenMillis(a.createdAt) - whenMillis(b.createdAt)),
    [state.bookings, sessionId]
  );
  const counts = useMemo(() => {
    const c: Record<Group, number> = { seated: 0, holds: 0, waitlist: 0, closed: 0, all: bookings.length };
    for (const b of bookings) c[groupOf(b)]++;
    return c;
  }, [bookings]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookings.filter((b) => (group === "all" || groupOf(b) === group) && (!q || `${b.alias} ${b.bookingCode ?? ""} ${b.tempId ?? ""}`.toLowerCase().includes(q)));
  }, [bookings, group, query]);

  const columns: Array<Column<Booking>> = [
    {
      key: "who",
      header: "Participant",
      render: (b) => (
        <div>
          <p className="font-semibold text-ink-lum">{b.alias}</p>
          <p className="text-xs text-ink-mut">
            <span className="font-mono">{b.bookingCode ?? b.id}</span>
            {b.tempId ? ` · ${b.tempId}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (b) => (
        <div className="flex flex-col items-start gap-1">
          <BookingStatusChip status={b.status} checkedIn={b.checkedIn} />
          {seatClass(b) === "hold" && <Countdown expiresAt={b.reservationExpiresAt} label="Hold" />}
          {seatClass(b) === "offer" && <Countdown expiresAt={b.waitlistOfferExpiresAt} label="Offer" />}
        </div>
      ),
    },
    { key: "type", header: "Type", render: (b) => <span className="text-ink-sec">{b.bookingType === "complimentary" ? "Free pass" : inr(b.amount)}</span> },
    { key: "when", header: "Booked", render: (b) => <span className="whitespace-nowrap text-xs text-ink-sec">{formatWhen(b.createdAt)}</span> },
    {
      key: "act",
      header: "",
      align: "right",
      render: (b) => {
        if (!canManage) return null;
        const cls = seatClass(b);
        return (
          <div className="flex justify-end gap-2">
            {cls === "hold" && (
              <Button size="sm" variant="success" onClick={(e) => { e.stopPropagation(); setPaying(b); }}>
                Record payment
              </Button>
            )}
            {CANCELLABLE_STATUSES.has(canonicalBookingStatus(b.status)) && !b.checkedIn && cls !== "waitlist" && cls !== "offer" && (
              <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setCancelling(b); }}>
                Cancel
              </Button>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <SessionFrame
      sessionId={sessionId}
      current="bookings"
      sub="Who holds a seat, who is still paying, and who is waiting. Unpaid holds release automatically after 15 minutes."
      right={
        canManage ? (
          <Link href={`/bookings/new?session=${sessionId}`}>
            <Button>
              <Plus className="h-4 w-4" /> Add booking
            </Button>
          </Link>
        ) : undefined
      }
    >
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Section title="Capacity">
          <CapacityPanel ledger={ledger} />
        </Section>
        <Section title="Money" right={<Link href={`/missions/${sessionId}/money`} className="text-xs font-semibold text-brand hover:text-brand-hover">Details →</Link>}>
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-mut">Collected</dt>
              <dd className="font-semibold tabular text-ink-lum">{inr(fin.grossCollected)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-mut">Awaiting payment</dt>
              <dd className="font-semibold tabular text-amber-700">{inr(fin.pendingAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-mut">Refunded</dt>
              <dd className="font-semibold tabular text-sky-700">{inr(fin.totalRefunded)}</dd>
            </div>
            <div className="flex justify-between border-t border-edge pt-2.5">
              <dt className="text-ink-mut">Net revenue</dt>
              <dd className="font-display text-lg font-bold tabular text-ink-lum">{inr(fin.netRevenue)}</dd>
            </div>
          </dl>
        </Section>
      </div>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 overflow-x-auto pb-1">
            <Segments
              label="Filter bookings"
              value={group}
              onChange={setGroup}
              options={[
                { id: "seated", label: "Confirmed", count: counts.seated },
                { id: "holds", label: "Waiting for payment", count: counts.holds },
                { id: "waitlist", label: "Waitlist", count: counts.waitlist },
                { id: "closed", label: "Cancelled & expired", count: counts.closed },
                { id: "all", label: "All", count: counts.all },
              ]}
            />
          </div>
          <div className="lg:w-72">
            <SearchInput value={query} onChange={setQuery} placeholder="Search name, code or temp ID" />
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          onRowClick={canManage ? (b) => router.push(`/bookings/${b.id}`) : undefined}
          emptyTitle={bookings.length ? "Nobody in this group" : "No bookings yet"}
          emptyLine={bookings.length ? "Choose another filter." : "Bookings for this session will appear here."}
        />
        {group === "waitlist" && counts.waitlist > 0 && (
          <p className="text-xs text-ink-mut">
            Manage the queue and seat offers on the{" "}
            <Link href={`/missions/${sessionId}/waitlist`} className="font-semibold text-brand hover:underline">
              Waitlist tab
            </Link>
            .
          </p>
        )}
      </section>

      <RecordPaymentDialog booking={paying} open={Boolean(paying)} onClose={() => setPaying(undefined)} />
      <CancelBookingDialog booking={cancelling} open={Boolean(cancelling)} onClose={() => setCancelling(undefined)} />
    </SessionFrame>
  );
}
