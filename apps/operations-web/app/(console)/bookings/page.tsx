"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Clock, ListOrdered, Plus, Ticket } from "lucide-react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { SearchInput, Select } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { inr } from "@/lib/format";
import type { Booking } from "@/lib/prototype/entities";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { canonicalBookingStatus, isoMillis, seatClass } from "@/lib/prototype/selectors/status";
import { BookingStatusChip, Countdown, PageFrame, ProviderNotice, Segments, bookingSourceLabel, formatWhen, useNow, whenMillis } from "@/components/bookings/shared";
import { RecordPaymentDialog } from "@/components/bookings/dialogs";

type Group = "all" | "holds" | "confirmed" | "waitlist" | "failed" | "closed";

const groupOf = (b: Booking): Exclude<Group, "all"> => {
  const cls = seatClass(b);
  if (cls === "hold") return "holds";
  if (cls === "paid" || cls === "comp") return "confirmed";
  if (cls === "waitlist" || cls === "offer") return "waitlist";
  if (canonicalBookingStatus(b.status) === "payment-failed") return "failed";
  return "closed";
};

export default function BookingsPage() {
  const router = useRouter();
  const toast = useToast();
  const { state, territory, canAccess, acceptWaitlistOffer } = useStore();
  const [group, setGroup] = useState<Group>("all");
  const [sessionId, setSessionId] = useState("all");
  const [query, setQuery] = useState("");
  const [paying, setPaying] = useState<Booking>();
  const now = useNow(30_000);

  const sessions = useMemo(() => state.sessions.filter((s) => s.territoryId === territory.id), [state.sessions, territory.id]);
  const sessionById = useMemo(() => new Map(state.sessions.map((s) => [s.id, s])), [state.sessions]);
  const scoped = useMemo(() => {
    const ids = new Set(sessions.map((s) => s.id));
    return state.bookings.filter((b) => ids.has(b.sessionId)).sort((a, b) => whenMillis(b.createdAt) - whenMillis(a.createdAt));
  }, [state.bookings, sessions]);

  const counts = useMemo(() => {
    const c: Record<Group, number> = { all: scoped.length, holds: 0, confirmed: 0, waitlist: 0, failed: 0, closed: 0 };
    for (const b of scoped) c[groupOf(b)]++;
    return c;
  }, [scoped]);

  const expiringSoon = useMemo(
    () => scoped.filter((b) => seatClass(b) === "hold" && isoMillis(b.reservationExpiresAt) - now < 5 * 60_000).length,
    [scoped, now]
  );
  const offers = scoped.filter((b) => seatClass(b) === "offer").length;
  const confirmedValue = scoped.filter((b) => seatClass(b) === "paid").reduce((a, b) => a + b.amount, 0);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter(
      (b) =>
        (group === "all" || groupOf(b) === group) &&
        (sessionId === "all" || b.sessionId === sessionId) &&
        (!q || `${b.alias} ${b.bookingCode ?? ""} ${b.id} ${b.phoneMask} ${b.paymentReference ?? ""}`.toLowerCase().includes(q))
    );
  }, [scoped, group, sessionId, query]);

  if (!canAccess("/bookings")) return <PermissionDenied module="Bookings" />;

  const accept = (b: Booking) => {
    const out = acceptWaitlistOffer(b.id);
    if (out.error) toast.error("Offer not accepted", out.error);
    else toast.success("Offer accepted", `${b.alias}'s seat is held for 15 minutes while the payment is recorded.`);
  };

  const columns: Array<Column<Booking>> = [
    {
      key: "booking",
      header: "Booking",
      render: (b) => (
        <div className="min-w-0">
          <Link href={`/bookings/${b.id}`} onClick={(e) => e.stopPropagation()} className="font-mono text-xs font-semibold text-brand-ink hover:underline">
            {b.bookingCode ?? b.id}
          </Link>
          <p className="whitespace-nowrap text-xs text-ink-mut">
            {formatWhen(b.createdAt)} · {bookingSourceLabel(b.source)}
          </p>
        </div>
      ),
    },
    {
      key: "who",
      header: "Participant",
      render: (b) => (
        <div>
          <p className="whitespace-nowrap font-semibold text-ink-lum">{b.alias}</p>
          <p className="whitespace-nowrap text-xs text-ink-mut">{b.phoneMask}</p>
        </div>
      ),
    },
    {
      key: "session",
      header: "Session",
      render: (b) => {
        const s = sessionById.get(b.sessionId);
        return (
          <div className="max-w-[240px]">
            <p className="truncate text-ink-sec">{sessionTitle(state, b.sessionId)}</p>
            <p className="whitespace-nowrap text-xs text-ink-mut">{s ? `${s.date} · ${s.startTime}` : "—"}</p>
          </div>
        );
      },
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
    { key: "amount", header: "Amount", align: "right", render: (b) => <span className="font-medium text-ink-lum">{b.bookingType === "complimentary" ? "Free" : inr(b.amount)}</span> },
    {
      key: "action",
      header: "",
      align: "right",
      render: (b) => {
        const cls = seatClass(b);
        if (cls === "hold")
          return (
            <Button size="sm" variant="success" onClick={(e) => { e.stopPropagation(); setPaying(b); }}>
              Record payment
            </Button>
          );
        if (cls === "offer")
          return (
            <Button size="sm" variant="lamp" onClick={(e) => { e.stopPropagation(); accept(b); }}>
              Accept offer
            </Button>
          );
        return (
          <Link href={`/bookings/${b.id}`} onClick={(e) => e.stopPropagation()} className="text-xs font-semibold text-brand hover:text-brand-hover">
            Open
          </Link>
        );
      },
    },
  ];

  return (
    <PageFrame>
      <PageHeader
        overline={`Operations · ${territory.name}`}
        title="Bookings"
        sub="Every seat, payment hold and waitlist entry for this territory. Unpaid holds release their seat automatically after 15 minutes."
        right={
          <Link href="/bookings/new">
            <Button>
              <Plus className="h-4 w-4" /> New booking
            </Button>
          </Link>
        }
      />
      <ProviderNotice />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Confirmed seats" value={counts.confirmed} detail={`${inr(confirmedValue)} booked value`} icon={<Ticket className="h-4 w-4" />} tone="emerald" onClick={() => setGroup("confirmed")} />
        <MetricTile label="Waiting for payment" value={counts.holds} detail={expiringSoon ? `${expiringSoon} expire within 5 minutes` : "Seats held for 15 minutes"} icon={<Clock className="h-4 w-4" />} tone="amber" onClick={() => setGroup("holds")} />
        <MetricTile label="Waitlist" value={counts.waitlist} detail={offers ? `${offers} seat offer${offers === 1 ? "" : "s"} open` : "No open offers"} icon={<ListOrdered className="h-4 w-4" />} tone="violet" onClick={() => setGroup("waitlist")} />
        <MetricTile label="Payment failed" value={counts.failed} detail="Seats released — contact the customer" icon={<AlertTriangle className="h-4 w-4" />} tone="rose" onClick={() => setGroup("failed")} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 2xl:flex-row 2xl:items-center">
          <div className="min-w-0 flex-1 overflow-x-auto pb-1">
            <Segments
              label="Filter by status"
              value={group}
              onChange={setGroup}
              options={[
                { id: "all", label: "All", count: counts.all },
                { id: "holds", label: "Waiting for payment", count: counts.holds },
                { id: "confirmed", label: "Confirmed", count: counts.confirmed },
                { id: "waitlist", label: "Waitlist", count: counts.waitlist },
                { id: "failed", label: "Payment failed", count: counts.failed },
                { id: "closed", label: "Cancelled & expired", count: counts.closed },
              ]}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-2 2xl:w-[480px]">
            <Select value={sessionId} onChange={(e) => setSessionId(e.target.value)} aria-label="Filter by session">
              <option value="all">All sessions</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {sessionTitle(state, s.id)} · {s.date} {s.startTime}
                </option>
              ))}
            </Select>
            <SearchInput value={query} onChange={setQuery} placeholder="Search name, code or reference" />
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          onRowClick={(b) => router.push(`/bookings/${b.id}`)}
          emptyTitle={scoped.length ? "No bookings match these filters" : "No bookings yet"}
          emptyLine={scoped.length ? "Clear the search or choose another status." : `Bookings for sessions in ${territory.name} will appear here.`}
        />
      </section>

      <RecordPaymentDialog booking={paying} open={Boolean(paying)} onClose={() => setPaying(undefined)} />
    </PageFrame>
  );
}
