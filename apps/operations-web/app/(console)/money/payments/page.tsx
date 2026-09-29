"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BadgeCheck, CircleX, Clock, IndianRupee } from "lucide-react";
import { useStore } from "@/lib/store";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { SearchInput } from "@/components/ui/fields";
import { DataTable, type Column } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import type { Payment } from "@/lib/prototype/entities";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { paymentMethodLabel } from "@/lib/prototype/selectors/money";
import { Breadcrumbs, Countdown, PageFrame, PaymentStatusChip, ProviderNotice, Segments, formatWhen, whenMillis } from "@/components/bookings/shared";
import { RecordPaymentDialog, ReasonDialog } from "@/components/bookings/dialogs";

type Filter = "all" | "pending" | "received" | "verified" | "failed" | "cancelled";

const matches = (p: Payment, f: Filter) =>
  f === "all" ||
  (f === "pending" && (p.status === "pending" || p.status === "initiated")) ||
  (f === "received" && p.status === "confirmed") ||
  (f === "verified" && p.status === "reconciled") ||
  (f === "failed" && p.status === "failed") ||
  (f === "cancelled" && p.status === "cancelled");

export default function PaymentsPage() {
  const toast = useToast();
  const { state, territory, canAccess, reconcilePayment, failBookingPayment } = useStore();
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [paying, setPaying] = useState<string>();
  const [failing, setFailing] = useState<string>();

  const bookings = useMemo(() => new Map(state.bookings.map((b) => [b.id, b])), [state.bookings]);
  const scoped = useMemo(() => {
    const ids = new Set(state.sessions.filter((s) => s.territoryId === territory.id).map((s) => s.id));
    return (state.payments ?? [])
      .filter((p) => ids.has(p.sessionId))
      .sort((a, b) => whenMillis(b.confirmedAt ?? b.failedAt ?? b.initiatedAt) - whenMillis(a.confirmedAt ?? a.failedAt ?? a.initiatedAt));
  }, [state.payments, state.sessions, territory.id]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return scoped.filter((p) => {
      const b = bookings.get(p.bookingId);
      return matches(p, filter) && (!q || `${p.id} ${p.providerReference ?? ""} ${b?.alias ?? ""} ${b?.bookingCode ?? ""}`.toLowerCase().includes(q));
    });
  }, [scoped, filter, query, bookings]);

  if (!canAccess("/money/payments")) return <PermissionDenied module="Money" />;

  const count = (f: Filter) => scoped.filter((p) => matches(p, f)).length;
  const sum = (f: Filter) => scoped.filter((p) => matches(p, f)).reduce((a, p) => a + p.amount, 0);

  const verify = (p: Payment) => {
    const out = reconcilePayment(p.id);
    if (out.error) toast.error("Payment not verified", out.error);
    else toast.success("Payment verified", `${inr(p.amount)} · ${p.providerReference} matched against the statement.`);
  };

  const columns: Array<Column<Payment>> = [
    {
      key: "who",
      header: "Booking",
      render: (p) => {
        const b = bookings.get(p.bookingId);
        return b ? (
          <div>
            <Link href={`/bookings/${b.id}`} className="font-semibold text-ink-lum hover:text-brand">
              {b.alias}
            </Link>
            <p className="font-mono text-[11px] text-ink-mut">{b.bookingCode ?? b.id}</p>
          </div>
        ) : (
          <span className="text-ink-mut">Booking removed</span>
        );
      },
    },
    { key: "session", header: "Session", render: (p) => <span className="block max-w-[220px] truncate text-ink-sec">{sessionTitle(state, p.sessionId)}</span> },
    {
      key: "method",
      header: "Method · reference",
      render: (p) => (
        <div className="text-xs">
          <p className="text-ink-sec">{p.paymentMethod ? paymentMethodLabel(p.paymentMethod) : "Not paid yet"}</p>
          {p.providerReference ? <p className="font-mono text-ink-mut">{p.providerReference}</p> : p.failureReason ? <p className="text-ink-mut">{p.failureReason}</p> : null}
        </div>
      ),
    },
    {
      key: "when",
      header: "When",
      render: (p) => {
        const b = bookings.get(p.bookingId);
        return (
          <div className="flex flex-col items-start gap-1 text-xs text-ink-sec">
            <span className="whitespace-nowrap">{formatWhen(p.confirmedAt ?? p.failedAt ?? p.cancelledAt ?? p.initiatedAt)}</span>
            {p.status === "pending" && b?.reservationExpiresAt && <Countdown expiresAt={b.reservationExpiresAt} label="Hold" />}
          </div>
        );
      },
    },
    { key: "status", header: "Status", render: (p) => <PaymentStatusChip status={p.status} /> },
    { key: "amount", header: "Amount", align: "right", render: (p) => <span className="font-semibold text-ink-lum">{inr(p.amount)}</span> },
    {
      key: "act",
      header: "",
      align: "right",
      render: (p) =>
        p.status === "pending" || p.status === "initiated" ? (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="success" onClick={() => setPaying(p.bookingId)}>
              Record payment
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setFailing(p.bookingId)}>
              Failed
            </Button>
          </div>
        ) : p.status === "confirmed" ? (
          <Button size="sm" variant="secondary" onClick={() => verify(p)}>
            Mark verified
          </Button>
        ) : null,
    },
  ];

  const failingBooking = failing ? bookings.get(failing) : undefined;

  return (
    <PageFrame>
      <Breadcrumbs items={[{ label: "Money", href: "/money" }, { label: "Payments" }]} />
      <PageHeader
        overline={`Finance · ${territory.name}`}
        title="Payments"
        sub="Every payment attached to a booking. Record payments as they arrive, mark failures, and verify received payments against the bank or UPI statement."
      />
      <ProviderNotice />

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Received" value={inr(sum("received") + sum("verified"))} detail={`${count("received") + count("verified")} payments`} icon={<IndianRupee className="h-4 w-4" />} tone="emerald" onClick={() => setFilter("received")} />
        <MetricTile label="Verified" value={count("verified")} detail={`${count("received")} still to verify`} icon={<BadgeCheck className="h-4 w-4" />} tone="sky" onClick={() => setFilter("verified")} />
        <MetricTile label="Awaiting payment" value={inr(sum("pending"))} detail={`${count("pending")} seat${count("pending") === 1 ? "" : "s"} on hold`} icon={<Clock className="h-4 w-4" />} tone="amber" onClick={() => setFilter("pending")} />
        <MetricTile label="Failed" value={count("failed")} detail={inr(sum("failed"))} icon={<CircleX className="h-4 w-4" />} tone="rose" onClick={() => setFilter("failed")} />
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0 overflow-x-auto pb-1">
            <Segments
              label="Filter payments"
              value={filter}
              onChange={setFilter}
              options={[
                { id: "all", label: "All", count: count("all") },
                { id: "pending", label: "Awaiting payment", count: count("pending") },
                { id: "received", label: "Received", count: count("received") },
                { id: "verified", label: "Verified", count: count("verified") },
                { id: "failed", label: "Failed", count: count("failed") },
                { id: "cancelled", label: "Cancelled", count: count("cancelled") },
              ]}
            />
          </div>
          <div className="lg:w-80">
            <SearchInput value={query} onChange={setQuery} placeholder="Search name, code or reference" />
          </div>
        </div>
        <DataTable columns={columns} rows={rows} emptyTitle={scoped.length ? "No payments match" : "No payments yet"} emptyLine={scoped.length ? "Try another filter or search." : "Paid bookings create payment records here."} />
      </section>

      <RecordPaymentDialog booking={paying ? bookings.get(paying) : undefined} open={Boolean(paying)} onClose={() => setPaying(undefined)} />
      <ReasonDialog
        open={Boolean(failing)}
        onClose={() => setFailing(undefined)}
        title="Record a failed payment?"
        description={<>The seat held for {failingBooking?.alias ?? "this booking"} is released and offered to the waitlist.</>}
        placeholder="e.g. Card declined by the issuing bank"
        minLength={3}
        confirmLabel="Mark payment failed"
        onConfirm={(reason) => (failing ? failBookingPayment(failing, reason) : undefined)}
        successTitle="Payment marked as failed"
        successDetail="The seat was released."
      />
    </PageFrame>
  );
}
