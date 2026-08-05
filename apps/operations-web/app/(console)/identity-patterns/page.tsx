"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectIdentityPatternList } from "@/lib/prototype/selectors/identity";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataTable, type Column } from "@/components/ui/table";
import { StatusChip, Button } from "@/components/ui/primitives";
import type { IdentityPattern } from "@/lib/prototype/entities";

export default function IdentityPatternsCatalogPage() {
  const { state } = useStore();
  const patterns = useMemo(() => selectIdentityPatternList(state), [state]);

  const columns: Column<IdentityPattern>[] = [
    {
      key: "name",
      header: "Pattern Name",
      render: (p) => (
        <Link href={`/identity-patterns/${p.id}`} className="font-mono font-bold text-emerald-400 hover:underline">
          {p.name}
        </Link>
      ),
    },
    { key: "prefix", header: "Prefix", render: (p) => <span className="font-mono font-bold text-amber-400">{p.prefix}</span> },
    { key: "separator", header: "Separator", render: (p) => <span className="font-mono text-slate-300">&apos;{p.separator}&apos;</span> },
    { key: "length", header: "Number Length", align: "right", render: (p) => <span className="font-mono text-slate-200">{p.numberLength} digits</span> },
    { key: "example", header: "Generated Example", render: (p) => <span className="font-mono font-bold text-slate-200 bg-slate-900 border border-slate-800 px-2 py-0.5 rounded">{p.example}</span> },
    { key: "status", header: "Status", render: (p) => <StatusChip value={p.status} /> },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 space-y-6 font-mono text-xs">
      <PageHeader
        overline="Identity Configuration"
        title="Identity Pattern Catalog"
        sub="Configure non-identifying temporary identity code formats (e.g. CR-07, MX-014, NIGHT-22)."
        right={
          <Link href="/identity-patterns/new">
            <Button variant="lamp" className="h-9 px-4 text-xs font-mono font-bold">
              + Create Identity Pattern
            </Button>
          </Link>
        }
      />

      <div className="space-y-3">
        <h3 className="font-bold text-slate-200 uppercase tracking-wider text-xs">
          Identity Code Formats ({patterns.length})
        </h3>
        <DataTable columns={columns} rows={patterns} emptyTitle="No identity patterns found." emptyLine="Create a new identity pattern format." />
      </div>
    </div>
  );
}
