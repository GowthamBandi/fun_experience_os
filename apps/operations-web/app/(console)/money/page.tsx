"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { inr } from "@/lib/format";
import { selectFinancialOperationsMetrics } from "@/lib/prototype/selectors/money";
import { generateOperationsAlerts } from "@/lib/prototype/selectors/intelligence";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Card, Stat } from "@/components/ui/panels";
import { DataTable, type Column } from "@/components/ui/table";
import { StatusChip, Badge, Button } from "@/components/ui/primitives";
import { OperationsAlertsPanel } from "@/components/geo/OperationsAlertsPanel";
import { AIIntelligencePlaceholder } from "@/components/geo/AIIntelligencePlaceholder";
import { Stagger, Item } from "@/components/motion/Motion";
import type { TransactionView } from "@/lib/prototype/repositories";
import { transactionViews } from "@/lib/prototype/repositories";

export default function FinancialOperationsPage() {
  const { territory, canAccess, state } = useStore();

  const metrics = useMemo(() => selectFinancialOperationsMetrics(state), [state]);
  const alerts = useMemo(() => generateOperationsAlerts(state), [state]);
  const tx = useMemo(() => transactionViews(state, territory.id), [state, territory.id]);
  const promos = state.promoCodes;

  if (!canAccess("/money")) return <PageFrame><PermissionDenied module="Money" /></PageFrame>;

  const columns: Column<TransactionView>[] = [
    { key: "id", header: "Ref", render: (t) => <span className="tabular font-mono text-slate-400">{t.id}</span> },
    {
      key: "detail",
      header: "Detail",
      render: (t) => (
        <div>
          <p className="font-medium text-slate-200">{t.sessionTitle}</p>
          <p className="text-[11px] text-slate-400 font-mono">{t.method} · {t.at}</p>
        </div>
      ),
    },
    { key: "type", header: "Kind", render: (t) => <StatusChip value={t.kind} /> },
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
    { key: "status", header: "Status", render: (t) => <StatusChip value={t.status} /> },
  ];

  return (
    <PageFrame>
      <PageHeader
        overline={`Financial Operations · ${territory.name}`}
        title="Financial Operations Command Center"
        sub="Gross revenue accounting, payment settlement, refund approvals, and break-even tracking."
        right={
          <div className="flex flex-wrap items-center gap-2 font-mono">
            <Link href="/money/payments">
              <Button variant="ghost" className="h-9 px-3 text-xs">
                Revenue Operations ({metrics.confirmedPaymentsCount})
              </Button>
            </Link>
            <Link href="/money/refunds">
              <Button variant="ghost" className="h-9 px-3 text-xs">
                Refunds ({metrics.pendingRefundsCount} Pending)
              </Button>
            </Link>
            <Link href="/money/reconciliation">
              <Button variant="lamp" className="h-9 px-3 text-xs font-bold">
                Reconciliation ({metrics.reconciliationDiscrepanciesCount})
              </Button>
            </Link>
          </div>
        }
      />

      {/* Financial Operations KPI Cards */}
      <Stagger className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Item>
          <Card>
            <Stat label="Gross Collected" value={inr(metrics.grossCollected)} delta={`${metrics.confirmedPaymentsCount} confirmed payments`} tone="ok" />
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat label="Pending Revenue" value={inr(metrics.pendingRevenue)} delta={`${metrics.pendingPaymentsCount} on the wire`} tone="warm" />
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat label="Total Refunded" value={inr(metrics.totalRefunded)} delta={`${metrics.refundsCount} completed refunds`} tone="warm" />
          </Card>
        </Item>
        <Item>
          <Card>
            <Stat label="Net Revenue" value={inr(metrics.netRevenue)} delta="settled after refunds" tone="ok" />
          </Card>
        </Item>
      </Stagger>

      {/* Operations Intelligence Alerts */}
      <div className="mt-6">
        <OperationsAlertsPanel alerts={alerts} />
      </div>

      {/* AI Intelligence Placeholder */}
      <div className="mt-4">
        <AIIntelligencePlaceholder
          title="Revenue & Dynamic Pricing Intelligence Forecast"
          metrics={[
            { label: "Projected Night Revenue", value: "₹48,500", hint: "Based on current fill" },
            { label: "Refund Rate Risk", value: "Low (1.8%)", hint: "Healthy conversion" },
            { label: "Suggested Base Price", value: "₹499 (+10%)", hint: "High demand session s-2" },
            { label: "Breakeven Margin", value: "+34%", hint: "Exceeds operational threshold" },
          ]}
        />
      </div>

      {/* Active Promos & Ledger */}
      <Stagger className="mt-6">
        <Item>
          <p className="overline mb-3 font-mono text-xs text-slate-400 uppercase tracking-wider">
            Active Promo Codes · {promos.filter((p) => p.status === "active").length} live
          </p>
          <div className="flex flex-wrap gap-2">
            {promos.map((p) => (
              <div key={p.code} className="bg-slate-900 border border-slate-800 flex items-center gap-2.5 rounded-xl px-3 py-2">
                <span className="font-mono text-xs font-semibold text-slate-200">{p.code}</span>
                <span className="text-[11px] text-slate-400">{p.label}</span>
                <Badge className={p.status === "active" ? "border border-emerald-800 bg-emerald-950 text-emerald-300" : "border border-slate-800 bg-slate-950 text-slate-500"}>
                  {p.status}
                </Badge>
              </div>
            ))}
          </div>
        </Item>

        <Item className="mt-6 space-y-3">
          <h3 className="font-bold text-slate-200 font-mono text-xs uppercase tracking-wider">
            Financial Ledger Transactions ({tx.length})
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

