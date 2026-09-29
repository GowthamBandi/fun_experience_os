"use client";

import { useMemo } from "react";
import Link from "next/link";
import { BadgeCheck, CircleCheck, Scale, TriangleAlert } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn, inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { Button } from "@/components/ui/primitives";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { DataTable, type Column } from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import type { Payment } from "@/lib/prototype/entities";
import { sessionTitle } from "@/lib/prototype/selectors/lookups";
import { paymentMethodLabel, selectReconciliationIssues } from "@/lib/prototype/selectors/money";
import { Breadcrumbs, PageFrame, ProviderNotice, Section, formatWhen } from "@/components/bookings/shared";

export default function ReconciliationPage() {
  const toast = useToast();
  const { state, territory, canAccess, reconcilePayment } = useStore();

  const sessionIds = useMemo(() => new Set(state.sessions.filter((s) => s.territoryId === territory.id).map((s) => s.id)), [state.sessions, territory.id]);
  const issues = useMemo(() => selectReconciliationIssues(state, sessionIds), [state, sessionIds]);
  const payments = useMemo(() => (state.payments ?? []).filter((p) => sessionIds.has(p.sessionId)), [state.payments, sessionIds]);
  const toVerify = payments.filter((p) => p.status === "confirmed");
  const verified = payments.filter((p) => p.status === "reconciled");
  const bookings = useMemo(() => new Map(state.bookings.map((b) => [b.id, b])), [state.bookings]);

  if (!canAccess("/money/reconciliation")) return <PermissionDenied module="Money" />;

  const received = toVerify.length + verified.length;
  const verify = (p: Payment) => {
    const out = reconcilePayment(p.id);
    if (out.error) toast.error("Payment not verified", out.error);
    else toast.success("Payment verified", `${inr(p.amount)} · ${p.providerReference}`);
  };

  const columns: Array<Column<Payment>> = [
    {
      key: "who",
      header: "Booking",
      render: (p) => {
        const b = bookings.get(p.bookingId);
        return (
          <div>
            {b ? (
              <Link href={`/bookings/${b.id}`} className="font-semibold text-ink-lum hover:text-brand">
                {b.alias}
              </Link>
            ) : (
              <span className="text-ink-mut">Booking removed</span>
            )}
            <p className="max-w-[220px] truncate text-xs text-ink-mut">{sessionTitle(state, p.sessionId)}</p>
          </div>
        );
      },
    },
    { key: "ref", header: "Reference", render: (p) => <span className="font-mono text-xs text-ink-sec">{p.providerReference ?? "—"}</span> },
    { key: "method", header: "Method", render: (p) => <span className="text-ink-sec">{paymentMethodLabel(p.paymentMethod)}</span> },
    { key: "when", header: "Received", render: (p) => <span className="whitespace-nowrap text-xs text-ink-sec">{formatWhen(p.confirmedAt)}</span> },
    { key: "amount", header: "Amount", align: "right", render: (p) => <span className="font-semibold text-ink-lum">{inr(p.amount)}</span> },
    {
      key: "act",
      header: "",
      align: "right",
      render: (p) => (
        <Button size="sm" variant="secondary" onClick={() => verify(p)}>
          <BadgeCheck className="h-3.5 w-3.5" /> Matches statement
        </Button>
      ),
    },
  ];

  return (
    <PageFrame>
      <Breadcrumbs items={[{ label: "Money", href: "/money" }, { label: "Reconciliation" }]} />
      <PageHeader
        overline={`Finance · ${territory.name}`}
        title="Reconciliation"
        sub="Check that every booking and payment agree, then match received payments against the bank or UPI statement by their reference."
      />
      <ProviderNotice>Payment provider not connected — statements are not imported. Compare each reference with your bank or UPI statement, then mark it as matching.</ProviderNotice>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Records that don't match" value={issues.length} detail={`${issues.filter((i) => i.severity === "high").length} need action today`} icon={<TriangleAlert className="h-4 w-4" />} tone="rose" />
        <MetricTile label="To verify" value={toVerify.length} detail={inr(toVerify.reduce((a, p) => a + p.amount, 0))} icon={<Scale className="h-4 w-4" />} tone="amber" />
        <MetricTile label="Verified" value={verified.length} detail={inr(verified.reduce((a, p) => a + p.amount, 0))} icon={<BadgeCheck className="h-4 w-4" />} tone="emerald" />
        <MetricTile label="Verified share" value={received ? `${Math.round((verified.length / received) * 100)}%` : "—"} detail={`${verified.length} of ${received} received payments`} icon={<CircleCheck className="h-4 w-4" />} tone="sky" />
      </section>

      <Section title="Records that don't match" sub="Each item names what is wrong and what to do next">
        {issues.length === 0 ? (
          <p className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <CircleCheck className="h-4 w-4" aria-hidden /> Every booking and payment in {territory.name} agrees.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {issues.map((i) => (
              <li key={i.id} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 gap-3">
                  <span className={cn("mt-1 h-2.5 w-2.5 shrink-0 rounded-full", i.severity === "high" ? "bg-red-500" : "bg-amber-400")} aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink-lum">
                      {i.title} <span className="font-normal text-ink-mut">· {inr(i.amount)}</span>
                    </p>
                    <p className="text-xs leading-5 text-ink-mut">{i.detail}</p>
                  </div>
                </div>
                {i.bookingId && (
                  <Link href={`/bookings/${i.bookingId}`} className="shrink-0">
                    <Button size="sm" variant="secondary">
                      Open booking
                    </Button>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <section className="space-y-3">
        <div>
          <h2 className="text-[15px] font-semibold text-ink-lum">Payments to verify</h2>
          <p className="text-xs text-ink-mut">Received payments not yet matched against the statement</p>
        </div>
        <DataTable columns={columns} rows={toVerify} emptyTitle="Nothing to verify" emptyLine="Every received payment has been matched against the statement." />
      </section>
    </PageFrame>
  );
}
