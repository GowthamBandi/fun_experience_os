"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { repos } from "@/lib/data/mock";
import { inr } from "@/lib/format";
import type { CatalogItem } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { DataTable, type Column } from "@/components/ui/table";
import { SearchInput } from "@/components/ui/fields";
import { StatusChip, Toggle } from "@/components/ui/primitives";
import { Stagger, Item } from "@/components/motion/Motion";

export default function CatalogPage() {
  const { canAccess } = useStore();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(repos.catalog());

  if (!canAccess("/catalog")) return <PageFrame><PermissionDenied module="Catalog" /></PageFrame>;

  const rows = items.filter((i) => !query || i.activity.toLowerCase().includes(query.toLowerCase()) || i.format.toLowerCase().includes(query.toLowerCase()));

  const toggle = (id: string) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: i.status === "live" ? "paused" : "live" } : i)));

  const columns: Column<CatalogItem>[] = [
    {
      key: "name",
      header: "Experience",
      render: (i) => (
        <div>
          <p className="font-medium text-ink-lum">{i.activity}</p>
          <p className="text-[11px] text-ink-mut">{i.format}</p>
        </div>
      ),
    },
    { key: "price", header: "Price", align: "right", render: (i) => <span className="tabular text-ink-lum">{inr(i.price)}</span> },
    { key: "seats", header: "Seats", align: "right", render: (i) => <span className="tabular text-ink-mut">{i.capacity} · min {i.minFill}</span> },
    { key: "status", header: "Status", render: (i) => <StatusChip value={i.status} /> },
    {
      key: "toggle",
      header: "On the shelf",
      render: (i) => <Toggle on={i.status === "live"} onToggle={() => toggle(i.id)} label={i.activity} />,
    },
  ];

  return (
    <PageFrame>
      <PageHeader
        overline="Catalog"
        title="The shelf"
        sub="Everything a territory can sell — experiences, seats, seasons. Pause, never delete."
        right={<div className="w-52"><SearchInput value={query} onChange={setQuery} placeholder="Find an experience…" /></div>}
      />
      <Stagger className="mt-6">
        <Item>
          <DataTable columns={columns} rows={rows} emptyTitle="The shelf is empty." emptyLine="Nothing matches, or nothing is listed yet." />
        </Item>
      </Stagger>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}
