"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Clock, IndianRupee, RotateCcw, TrendingUp } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, inr } from "@/lib/format";
import { MetricTile } from "@/components/ui/panels";
import { DataTable, type Column } from "@/components/ui/table";
import type { Payment, Refund } from "@/lib/prototype/entities";
import { paymentMethodLabel, selectSessionFinancialSummary } from "@/lib/prototype/selectors/money";
import { PaymentStatusChip, ProviderNotice, RefundStatusChip, Section, formatWhen, refundTypeLabel, whenMillis } from "@/components/bookings/shared";
import { SessionFrame } from "@/components/bookings/SessionFrame";

export default function SessionMoneyPage() {
  const params = useParams();
  const sessionId = String(params.id ?? "");
  const { state } = useStore();

  const fin = useMemo(() => selectSessionFinancialSummary(state, sessionId), [state, sessionId]);
  const payments = useMemo(
    () => (state.payments ?? []).filter((p) => p.sessionId === sessionId).sort((a, b) => whenMillis(b.confirmedAt ?? b.initiatedAt) - whenMillis(a.confirmedAt ?? a.initiatedAt)),
    [state.payments, sessionId]
  );
  const refunds = useMemo(() => (state.refunds ?? []).filter((r) => r.sessionId === sessionId), [state.refunds, sessionId]);
  const bookings = useMemo(() => new Map(state.bookings.map((b) => [b.id, b])), [state.bookings]);
  const aliasOf = (id: string) => bookings.get(id)?.alias ?? "Booking removed";

  const scaleMax = Math.max(fin.targetRevenue, fin.grossCollected, fin.projectedRevenue, 1);
  const pct = (v: number) => `${Math.max(0, Math.min(100, (v / scaleMax) * 100))}%`;
  const gap = fin.breakEvenRevenue - fin.netRevenue;

  const paymentColumns: Array<Column<Payment>> = [
    {
      key: "who",
      header: "Booking",
      render: (p) => (
        <Link href={`/bookings/${p.bookingId}`} className="font-semibold text-ink-lum hover:text-brand">
          {aliasOf(p.bookingId)}
        </Link>
      ),
    },
    {
      key: "ref",
      header: "Method · reference",
      render: (p) => (
        <span className="text-xs text-ink-sec">
          {p.paymentMethod ? paymentMethodLabel(p.paymentMethod) : "Not paid yet"}
          {p.providerReference && <span className="block font-mono text-ink-mut">{p.providerReference}</span>}
        </span>
      ),
    },
    { key: "when", header: "When", render: (p) => <span className="whitespace-nowrap text-xs text-ink-sec">{formatWhen(p.confirmedAt ?? p.failedAt ?? p.initiatedAt)}</span> },
    { key: "status", header: "Status", render: (p) => <PaymentStatusChip status={p.status} /> },
    { key: "amount", header: "Amount", align: "right", render: (p) => <span className="font-semibold text-ink-lum">{inr(p.amount)}</span> },
  ];

  const refundColumns: Array<Column<Refund>> = [
    {
      key: "who",
      header: "Booking",
      render: (r) => (
        <Link href={`/bookings/${r.bookingId}`} className="font-semibold text-ink-lum hover:text-brand">
          {aliasOf(r.bookingId)}
        </Link>
      ),
    },
    { key: "type", header: "Type", render: (r) => <span className="text-ink-sec">{refundTypeLabel(r.type)}</span> },
    { key: "when", header: "Requested", render: (r) => <span className="whitespace-nowrap text-xs text-ink-sec">{formatWhen(r.requestedAt)}</span> },
    { key: "status", header: "Status", render: (r) => <RefundStatusChip status={r.status} /> },
    { key: "amount", header: "Amount", align: "right", render: (r) => <span className="font-semibold text-ink-lum">{inr(r.amount)}</span> },
  ];

  const bars: Array<{ label: string; value: number; color: string }> = [
    { label: "Collected", value: fin.grossCollected, color: "bg-emerald-500" },
    { label: "Net after refunds", value: fin.netRevenue, color: "bg-violet-500" },
    { label: "If open holds pay and pending refunds go out", value: Math.max(0, fin.projectedRevenue), color: "bg-sky-400" },
  ];

  return (
    <SessionFrame sessionId={sessionId} current="money" sub="What this session has collected, what is owed back, and how it compares with break-even.">
      <ProviderNotice />
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Collected" value={inr(fin.grossCollected)} detail={`${fin.paidBookings} paid seat${fin.paidBookings === 1 ? "" : "s"} · ${fin.complimentaryBookings} free pass${fin.complimentaryBookings === 1 ? "" : "es"}`} icon={<IndianRupee className="h-4 w-4" />} tone="emerald" />
        <MetricTile label="Refunded" value={inr(fin.totalRefunded)} detail={`${inr(fin.refundsAwaitingApproval + fin.refundsAwaitingPayout)} more in progress`} icon={<RotateCcw className="h-4 w-4" />} tone="sky" />
        <MetricTile label="Net revenue" value={inr(fin.netRevenue)} detail={`Seat price ${inr(fin.price)}`} icon={<TrendingUp className="h-4 w-4" />} tone="violet" />
        <MetricTile label="Awaiting payment" value={inr(fin.pendingAmount)} detail={fin.failedAmount ? `${inr(fin.failedAmount)} failed` : "Seats on hold"} icon={<Clock className="h-4 w-4" />} tone="amber" />
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Section title="Break-even" sub={`Break-even is ${fin.ledger.breakEvenAttendance} paid seats (${inr(fin.breakEvenRevenue)}); full target is ${fin.ledger.targetAttendance} seats (${inr(fin.targetRevenue)}).`}>
          <div className="space-y-4">
            {bars.map((b) => (
              <div key={b.label}>
                <div className="mb-1.5 flex justify-between text-xs">
                  <span className="text-ink-sec">{b.label}</span>
                  <span className="font-semibold tabular text-ink-lum">{inr(b.value)}</span>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-slate-100">
                  <div className={cn("h-full rounded-full", b.color)} style={{ width: pct(b.value) }} />
                  <div className="absolute inset-y-0 w-[3px] -translate-x-1/2 rounded-full bg-slate-800" style={{ left: pct(fin.breakEvenRevenue) }} aria-hidden />
                </div>
              </div>
            ))}
            <p className="text-xs text-ink-mut">The dark marker on each bar is break-even.</p>
            <p className={cn("rounded-xl px-3 py-2 text-sm font-medium", fin.isProfitable ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800")}>
              {fin.isProfitable ? `Above break-even by ${inr(fin.netRevenue - fin.breakEvenRevenue)}.` : `${inr(gap)} short of break-even — about ${Math.ceil(gap / Math.max(fin.price, 1))} more paid seat${Math.ceil(gap / Math.max(fin.price, 1)) === 1 ? "" : "s"}.`}
            </p>
          </div>
        </Section>
        <Section title="Refunds in progress">
          <dl className="space-y-2.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-ink-mut">Awaiting approval</dt>
              <dd className="font-semibold tabular text-amber-700">{inr(fin.refundsAwaitingApproval)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-ink-mut">Approved, to pay out</dt>
              <dd className="font-semibold tabular text-sky-700">{inr(fin.refundsAwaitingPayout)}</dd>
            </div>
            <div className="flex justify-between border-t border-edge pt-2.5">
              <dt className="text-ink-mut">Paid out</dt>
              <dd className="font-semibold tabular text-ink-lum">{inr(fin.totalRefunded)}</dd>
            </div>
          </dl>
          <Link href="/money/refunds" className="mt-4 inline-block text-xs font-semibold text-brand hover:text-brand-hover">
            Open refunds →
          </Link>
        </Section>
      </div>

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink-lum">Payments</h2>
        <DataTable columns={paymentColumns} rows={payments} emptyTitle="No payments yet" emptyLine="Paid bookings for this session will appear here." />
      </section>
      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink-lum">Refunds</h2>
        <DataTable columns={refundColumns} rows={refunds} emptyTitle="No refunds" emptyLine="Refunds for this session will appear here." />
      </section>
    </SessionFrame>
  );
}
