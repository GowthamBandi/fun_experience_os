"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { bookingViews, sessionTitle } from "@/lib/prototype/repositories";
import { inr } from "@/lib/format";
import type { BookingView } from "@/lib/prototype/repositories";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { DataTable, type Column } from "@/components/ui/table";
import { FilterRail, SearchInput } from "@/components/ui/fields";
import { StatusChip, Button } from "@/components/ui/primitives";
import { Stagger, Item } from "@/components/motion/Motion";

const STATUSES = ["payment-confirmed", "checked-in", "cancelled", "no-show"] as const;

export default function BookingsPage() {
  const { territory, canAccess, state, strikeBooking } = useStore();
  const [status, setStatus] = useState<(typeof STATUSES)[number] | "all">("all");
  const [query, setQuery] = useState("");
  const bookings = bookingViews(state, territory.id);

  const rows = useMemo(() => {
    return bookings
      .filter((b) => (status === "all" ? true : b.status === status))
      .filter((b) => !query || b.alias.toLowerCase().includes(query.toLowerCase()) || b.tempId.toLowerCase().includes(query.toLowerCase()));
  }, [bookings, status, query]);

  if (!canAccess("/bookings")) return <PageFrame><PermissionDenied module="Bookings" /></PageFrame>;

  const columns: Column<BookingView>[] = [
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
    { key: "mission", header: "Mission", render: (b) => <span className="text-ink-sec">{b.sessionTitle}</span> },
    { key: "amount", header: "Paid", align: "right", render: (b) => <span className="tabular text-ink-lum">{inr(b.amount)}</span> },
    { key: "status", header: "Status", render: (b) => <StatusChip value={b.status} /> },
    {
      key: "action",
      header: "",
      align: "right",
      render: (b) =>
        b.status === "payment-confirmed" ? (
          <Button variant="lamp" className="h-8 px-3 text-xs" onClick={() => strikeBooking(b.id)}>
            Strike
          </Button>
        ) : (
          <span className="text-[11px] text-ink-mut">—</span>
        ),
    },
  ];

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
