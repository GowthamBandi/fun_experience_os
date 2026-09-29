"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, CircleDollarSign, Clock, HandCoins, IndianRupee, RotateCcw, Scale, TrendingUp } from "lucide-react";
import { useStore } from "@/lib/store";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button, StatusChip } from "@/components/ui/primitives";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { DataTable, type Column } from "@/components/ui/table";
import type { Transaction } from "@/lib/prototype/entities";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { paymentMethodLabel, selectFinancialOperationsMetrics } from "@/lib/prototype/selectors/money";
import { Money, PageFrame, ProviderNotice, Section, Segments, formatWhen } from "@/components/bookings/shared";

type Scope = "territory" | "all";
type Kind = "all" | "payment" | "refund" | "other";

const KIND_LABEL: Record<Transaction["kind"], string> = { payment: "Payment", refund: "Refund", promo: "Promotion", adjustment: "Adjustment" };

export default function MoneyPage() {
  const { state, territory, canAccess } = useStore();
  const [scope, setScope] = useState<Scope>("territory");
  const [kind, setKind] = useState<Kind>("all");
  const [limit, setLimit] = useState(25);

  const territoryId = scope === "territory" ? territory.id : undefined;
  const m = useMemo(() => selectFinancialOperationsMetrics(state, territoryId), [state, territoryId]);
  const ledger = useMemo(
    () => state.transactions.filter((t) => !territoryId || t.territoryId === territoryId),
    [state.transactions, territoryId]
  );
  const toVerify = useMemo(
    () => (state.payments ?? []).filter((p) => p.status === "confirmed" && (!territoryId || state.sessions.find((s) => s.id === p.sessionId)?.territoryId === territoryId)).length,
    [state.payments, state.sessions, territoryId]
  );
  const rows = useMemo(
    () => ledger.filter((t) => kind === "all" || (kind === "other" ? t.kind === "promo" || t.kind === "adjustment" : t.kind === kind)),
    [ledger, kind]
  );

  if (!canAccess("/money")) return <PermissionDenied module="Money" />;

  const columns: Array<Column<Transaction>> = [
    { key: "at", header: "When", render: (t) => <span className="whitespace-nowrap text-ink-sec">{formatWhen(t.at)}</span> },
    {
      key: "what",
      header: "Entry",
      render: (t) => {
        const booking = state.bookings.find((b) => b.id === t.bookingId);
        return (
          <div className="min-w-0">
            <p className="font-medium text-ink-lum">
              {KIND_LABEL[t.kind]}
              {booking ? (
                <>
                  {" · "}
                  <Link href={`/bookings/${booking.id}`} className="text-brand hover:underline">
                    {booking.alias}
                  </Link>
                </>
              ) : null}
            </p>
            <p className="max-w-[280px] truncate text-xs text-ink-mut">{sessionTitle(state, t.sessionId)}</p>
          </div>
        );
      },
    },
    {
      key: "ref",
      header: "Method · reference",
      render: (t) => (
        <span className="text-xs text-ink-sec">
          {paymentMethodLabel(t.method)}
          {t.reference && <span className="block font-mono text-ink-mut">{t.reference}</span>}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (t) => <StatusChip value={t.status} /> },
    { key: "amount", header: "Amount", align: "right", render: (t) => <Money value={t.amount} sign className="font-semibold" /> },
  ];

  const actionCards = [
    { href: "/money/refunds", icon: RotateCcw, title: "Refunds to approve", count: m.pendingRefundsCount, amount: m.awaitingApprovalAmount, line: "Finance decides each request", tone: "text-amber-600 bg-amber-50" },
    { href: "/money/refunds", icon: HandCoins, title: "Refunds to pay out", count: m.payoutPendingCount, amount: m.awaitingPayoutAmount, line: "Approved — record the payout reference", tone: "text-sky-600 bg-sky-50" },
    { href: "/money/reconciliation", icon: BadgeCheck, title: "Payments to verify", count: toVerify, amount: undefined, line: "Match against the bank or UPI statement", tone: "text-emerald-600 bg-emerald-50" },
    { href: "/money/reconciliation", icon: Scale, title: "Records that don't match", count: m.reconciliationDiscrepanciesCount, amount: undefined, line: "Bookings and payments that disagree", tone: "text-rose-600 bg-rose-50" },
  ];

  return (
    <PageFrame>
      <PageHeader
        overline="Finance"
        title="Money"
        sub="What was collected, what is owed back, and what still needs a decision. Payments and refunds are the single source of truth; the ledger below is built from them."
        right={
          <>
            <Link href="/money/payments">
              <Button variant="secondary">Payments</Button>
            </Link>
            <Link href="/money/refunds">
              <Button variant="secondary">Refunds</Button>
            </Link>
            <Link href="/money/reconciliation">
              <Button variant="secondary">Reconciliation</Button>
            </Link>
          </>
        }
      />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <Segments label="Scope" value={scope} onChange={setScope} options={[{ id: "territory", label: territory.name }, { id: "all", label: "All territories" }]} />
        <div className="md:max-w-xl">
          <ProviderNotice />
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Collected" value={inr(m.grossCollected)} detail={`${m.confirmedPaymentsCount} payments · ${m.reconciledPaymentsCount} verified`} icon={<IndianRupee className="h-4 w-4" />} tone="emerald" />
        <MetricTile label="Refunded" value={inr(m.totalRefunded)} detail={`${m.refundsCount} refunds paid out`} icon={<RotateCcw className="h-4 w-4" />} tone="sky" />
        <MetricTile label="Net revenue" value={inr(m.netRevenue)} detail={`${inr(m.awaitingApprovalAmount + m.awaitingPayoutAmount)} more owed back if pending refunds are paid`} icon={<TrendingUp className="h-4 w-4" />} tone="violet" />
        <MetricTile label="Awaiting payment" value={inr(m.pendingRevenue)} detail={`${m.pendingPaymentsCount} held seat${m.pendingPaymentsCount === 1 ? "" : "s"} · ${m.failedPaymentsCount} failed`} icon={<Clock className="h-4 w-4" />} tone="amber" />
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {actionCards.map((c) => (
          <Link key={c.title} href={c.href} className="group flex items-start gap-3 rounded-panel border border-edge bg-white p-4 shadow-panel transition-all hover:-translate-y-0.5 hover:border-brand/40 focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/20">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${c.tone}`}>
              <c.icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2 text-sm font-semibold text-ink-lum">
                {c.title}
                <ArrowRight className="h-4 w-4 text-ink-mut transition-transform group-hover:translate-x-0.5" aria-hidden />
              </span>
              <span className="mt-1 block font-display text-xl font-bold tabular text-ink-lum">
                {c.count}
                {c.amount !== undefined && c.count > 0 && <span className="ml-2 text-sm font-semibold text-ink-mut">{inr(c.amount)}</span>}
              </span>
              <span className="block text-xs text-ink-mut">{c.line}</span>
            </span>
          </Link>
        ))}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-ink-lum">Ledger</h2>
            <p className="text-xs text-ink-mut">Built from payment and refund records, plus manual promotions and adjustments</p>
          </div>
          <Segments
            label="Filter ledger"
            value={kind}
            onChange={(v) => {
              setKind(v);
              setLimit(25);
            }}
            options={[
              { id: "all", label: "All", count: ledger.length },
              { id: "payment", label: "Payments", count: ledger.filter((t) => t.kind === "payment").length },
              { id: "refund", label: "Refunds", count: ledger.filter((t) => t.kind === "refund").length },
              { id: "other", label: "Adjustments", count: ledger.filter((t) => t.kind === "promo" || t.kind === "adjustment").length },
            ]}
          />
        </div>
        <DataTable columns={columns} rows={rows.slice(0, limit)} emptyTitle="No money movements yet" emptyLine="Payments and refunds will appear here as they are recorded." />
        {rows.length > limit && (
          <div className="flex justify-center">
            <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + 50)}>
              Show more ({rows.length - limit} remaining)
            </Button>
          </div>
        )}
      </section>

      {state.promoCodes.length > 0 && (
        <Section title="Promo codes" sub="Discount codes that can reduce what customers pay">
          <div className="flex flex-wrap gap-2">
            {state.promoCodes.map((p) => (
              <div key={p.code} className="flex items-center gap-2.5 rounded-xl border border-edge px-3 py-2">
                <CircleDollarSign className="h-4 w-4 text-ink-mut" aria-hidden />
                <span className="font-mono text-xs font-semibold text-ink-lum">{p.code}</span>
                <span className="text-xs text-ink-mut">{p.label}</span>
                <StatusChip value={p.status} />
              </div>
            ))}
          </div>
        </Section>
      )}
    </PageFrame>
  );
}
