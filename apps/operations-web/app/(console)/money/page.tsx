"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { repos } from "@/lib/data/mock";
import { inr } from "@/lib/format";
import type { Transaction } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Card, Stat } from "@/components/ui/panels";
import { DataTable, type Column } from "@/components/ui/table";
import { StatusChip, Badge } from "@/components/ui/primitives";
import { Stagger, Item } from "@/components/motion/Motion";

export default function MoneyPage() {
  const { territory, canAccess } = useStore();

  const tx = repos.transactions().filter((t) => t.territoryId === territory.id);
  const promos = repos.promoCodes();

  const settled = useMemo(() => tx.filter((t) => t.status === "settled" && t.amount > 0).reduce((a, t) => a + t.amount, 0), [tx]);
  const pending = useMemo(() => tx.filter((t) => t.status === "pending").reduce((a, t) => a + t.amount, 0), [tx]);
  const refunded = useMemo(() => tx.filter((t) => t.status === "settled" && t.amount < 0).reduce((a, t) => a + t.amount, 0), [tx]);

  const sessionTitle = (id: string) => repos.sessions().find((s) => s.id === id)?.title ?? id;

  if (!canAccess("/money")) return <PageFrame><PermissionDenied module="Money" /></PageFrame>;

  const columns: Column<Transaction>[] = [
    { key: "id", header: "Ref", render: (t) => <span className="tabular text-ink-sec">{t.id}</span> },
    {
      key: "detail",
      header: "Detail",
      render: (t) => (
        <div>
          <p className="font-medium text-ink-lum">{sessionTitle(t.sessionId)}</p>
          <p className="text-[11px] text-ink-mut">{t.method} · {t.at}</p>
        </div>
      ),
    },
    { key: "type", header: "Kind", render: (t) => <StatusChip value={t.kind} /> },
    { key: "amount", header: "Amount", align: "right", render: (t) => (
      <span className={`tabular font-medium ${t.amount > 0 ? "text-ink-lum" : "text-[#ff8f6b]"}`}>
        {t.amount > 0 ? "+" : "−"}{inr(Math.abs(t.amount))}
      </span>
    ) },
    { key: "status", header: "Status", render: (t) => <StatusChip value={t.status} /> },
  ];

  return (
    <PageFrame>
      <PageHeader
        overline={`Money · ${territory.name}`}
        title="The take"
        sub={`Every rupee is accounted — scoped to ${territory.name}.`}
      />

      <Stagger className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Item><Card><Stat label="Settled take" value={inr(settled)} delta="cleared to the ledger" tone="ok" /></Card></Item>
        <Item><Card><Stat label="Pending" value={inr(pending)} delta="on the wire, still moving" tone="warm" /></Card></Item>
        <Item><Card><Stat label="Returned" value={inr(Math.abs(refunded))} delta="refunds and promos, accounted" /></Card></Item>
      </Stagger>

      <Stagger className="mt-6">
        <Item>
          <p className="overline mb-3">Promo codes · {promos.filter((p) => p.status === "active").length} live</p>
          <div className="flex flex-wrap gap-2">
            {promos.map((p) => (
              <div key={p.code} className="glass flex items-center gap-2.5 rounded-xl px-3 py-2">
                <span className="font-mono text-xs font-semibold text-ink-lum">{p.code}</span>
                <span className="text-[11px] text-ink-mut">{p.label}</span>
                <Badge className={p.status === "active" ? "border border-[#12b76a]/25 bg-[#12b76a]/12 text-[#5fd7a3]" : "border border-white/8 bg-white/4 text-ink-mut"}>{p.status}</Badge>
              </div>
            ))}
          </div>
        </Item>
        <Item className="mt-6">
          <p className="overline mb-3">The ledger</p>
          <DataTable columns={columns} rows={tx} emptyTitle="No transactions." emptyLine="The ledger is quiet." />
        </Item>
      </Stagger>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}
