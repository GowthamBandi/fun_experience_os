"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { inr } from "@/lib/format";
import { selectFinancialOperationsMetrics } from "@/lib/prototype/selectors/money";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied, Card, Stat } from "@/components/ui/panels";
import { DataTable, type Column } from "@/components/ui/table";
import { Badge, Button } from "@/components/ui/primitives";
import { Stagger, Item } from "@/components/motion/Motion";
import type { TransactionView } from "@/lib/prototype/repositories";
import { transactionViews } from "@/lib/prototype/repositories";
import { OperatorHintPanel } from "@/components/bookings/shared";

export default function MoneyOverviewPage() {
  const { territory, canAccess, state } = useStore();

  const metrics = useMemo(() => selectFinancialOperationsMetrics(state), [state]);
  const tx = useMemo(() => transactionViews(state, territory.id), [state, territory.id]);
  const promos = state.promoCodes;

  if (!canAccess("/money")) return <PageFrame><PermissionDenied module="Money" /></PageFrame>;

  const columns: Column<TransactionView>[] = [
    { key: "id", header: "Reference", render: (t) => <span className="text-ink-mut font-mono text-xs">{t.id}</span> },
    {
      key: "detail",
      header: "Detail",
      render: (t) => (
        <div>
          <p className="font-medium text-ink-lum">{t.sessionTitle}</p>
          <p className="text-[11px] text-ink-mut font-mono">{t.method} · {t.at}</p>
        </div>
      ),
    },
    { key: "type", header: "Type", render: (t) => <span className="capitalize text-ink-sec">{t.kind}</span> },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      render: (t) => (
        <span className={`tabular font-mono font-medium ${t.amount > 0 ? "text-emerald-400" : "text-red-400"}`}>
          {t.amount > 0 ? "+" : "−"}{inr(Math.abs(t.amount))}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (t) => <span className="capitalize text-ink-sec">{t.status}</span> },
  ];

  return (
    <PageFrame>
      <PageHeader
        overline="Financial Operations"
        title="Money"
        sub="How much was collected, refunded, and still needs attention?"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/money/payments">
              <Button variant="ghost" className="h-9 px-3 text-xs">
                Payments
              </Button>
            </Link>
            <Link href="/money/refunds">
              <Button variant="ghost" className="h-9 px-3 text-xs">
                Refunds
              </Button>
            </Link>
            <Link href="/money/reconciliation">
              <Button variant="ghost" className="h-9 px-3 text-xs">
                Payment Check
              </Button>
            </Link>
          </div>
        }
      />

      <div className="mt-6 mb-6">
        <OperatorHintPanel state={state} />
      </div>

      <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Item>
          <Card>
            <Stat label="Collected" value={inr(metrics.grossCollected)} tone="ok" />
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat label="Pending" value={inr(metrics.pendingRevenue)} tone="warm" />
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat label="Refunded" value={inr(metrics.totalRefunded)} tone="warm" />
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat label="Net Revenue" value={inr(metrics.netRevenue)} tone="ok" />
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat label="Refunds Awaiting Review" value={metrics.pendingRefundsCount.toString()} tone={metrics.pendingRefundsCount > 0 ? "warm" : "default"} />
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat label="Payment Mismatches" value={metrics.reconciliationDiscrepanciesCount.toString()} tone={metrics.reconciliationDiscrepanciesCount > 0 ? "danger" : "ok"} />
          </Card>
        </Item>
      </Stagger>

      <Stagger className="mt-8">
        <Item>
          <p className="text-sm font-medium text-ink-sec mb-3">
            Active Promo Codes
          </p>
          <div className="flex flex-wrap gap-2">
            {promos.map((p) => (
              <div key={p.code} className="glass flex items-center gap-2.5 rounded-xl px-3 py-2">
                <span className="font-mono text-xs font-semibold text-ink-lum">{p.code}</span>
                <span className="text-[11px] text-ink-mut">{p.label}</span>
                <Badge className={p.status === "active" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-ink-sec/30 bg-ink-sec/10 text-ink-sec"}>
                  {p.status}
                </Badge>
              </div>
            ))}
          </div>
        </Item>

        <Item className="mt-8 space-y-3">
          <h3 className="font-medium text-ink-sec text-sm">
            Transaction Ledger
          </h3>
          <DataTable columns={columns} rows={tx} emptyTitle="No transactions." emptyLine="The ledger is quiet." />
        </Item>
      </Stagger>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}
