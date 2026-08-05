"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { repos } from "@/lib/data/mock";
import { inr } from "@/lib/format";
import type { Booking, BookingStatus } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { DataTable, type Column } from "@/components/ui/table";
import { FilterRail, SearchInput } from "@/components/ui/fields";
import { StatusChip, Button } from "@/components/ui/primitives";
import { Stagger, Item } from "@/components/motion/Motion";

const STATUSES = ["confirmed", "checked-in", "cancelled", "no-show"] as const;

export default function BookingsPage() {
  const { territory, canAccess } = useStore();
  const [status, setStatus] = useState<(typeof STATUSES)[number] | "all">("all");
  const [query, setQuery] = useState("");
  const [bookings, setBookings] = useState(repos.bookings());

  const sessionTitle = (id: string) => repos.sessions().find((s) => s.id === id)?.title ?? id;

  const rows = useMemo(() => {
    return bookings
      .filter((b) => (status === "all" ? true : b.status === status))
      .filter((b) => !query || b.alias.toLowerCase().includes(query.toLowerCase()) || b.tempId.toLowerCase().includes(query.toLowerCase()));
  }, [bookings, status, query]);

  if (!canAccess("/bookings")) return <PageFrame><PermissionDenied module="Bookings" /></PageFrame>;

  const columns: Column<Booking>[] = [
    {
      key: "alias",
      header: "Participant",
      render: (b) => (
        <div>
          <p className="font-medium text-ink-lum">{b.alias}</p>
          <p className="text-[11px] text-ink-mut">{b.phoneMask}</p>
        </div>
      ),
    },
    { key: "temp", header: "Temp ID", render: (b) => <span className="tabular text-ink-sec">{b.tempId}</span> },
    { key: "mission", header: "Mission", render: (b) => <span className="text-ink-sec">{sessionTitle(b.sessionId)}</span> },
    { key: "amount", header: "Paid", align: "right", render: (b) => <span className="tabular text-ink-lum">{inr(b.amount)}</span> },
    { key: "status", header: "Status", render: (b) => <StatusChip value={b.status} /> },
    {
      key: "action",
      header: "",
      align: "right",
      render: (b) =>
        b.status === "confirmed" ? (
          <Button variant="lamp" className="h-8 px-3 text-xs" onClick={() => strike(b.id)}>
            Strike
          </Button>
        ) : (
          <span className="text-[11px] text-ink-mut">—</span>
        ),
    },
  ];

  const strike = (id: string) =>
    setBookings((prev) => prev.map((b) => (b.id === id ? { ...b, status: "checked-in" as BookingStatus } : b)));

  return (
    <PageFrame>
      <PageHeader
        overline={`Bookings · ${territory.name}`}
        title="The door"
        sub="Confirmed becomes seated. Every strike is a person walking in."
        right={
          <div className="flex flex-wrap items-center gap-2">
            <FilterRail options={STATUSES} value={status} onChange={setStatus} />
            <div className="w-52"><SearchInput value={query} onChange={setQuery} placeholder="Alias or temp ID…" /></div>
          </div>
        }
      />
      <Stagger className="mt-6">
        <Item>
          <DataTable
            columns={columns}
            rows={rows}
            emptyTitle="Nobody here."
            emptyLine="Either the filters are tight, or the door is quiet."
          />
        </Item>
      </Stagger>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}
