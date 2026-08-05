"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { repos } from "@/lib/data/mock";
import { fillRate, inr } from "@/lib/format";
import type { Session } from "@/lib/types";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { DataTable, type Column } from "@/components/ui/table";
import { FilterRail, SearchInput } from "@/components/ui/fields";
import { StatusChip, FillMeter, Button } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/overlays";
import { Stagger, Item } from "@/components/motion/Motion";

const STATUSES = ["live", "closing", "open", "scheduled", "draft", "closed", "cancelled"] as const;

export default function MissionsPage() {
  const { territory, canAccess } = useStore();
  const [status, setStatus] = useState<(typeof STATUSES)[number] | "all">("all");
  const [query, setQuery] = useState("");
  const [openSession, setOpenSession] = useState<Session | null>(null);

  const rows = useMemo(() => {
    return repos
      .sessions()
      .filter((s) => s.territoryId === territory.id)
      .filter((s) => (status === "all" ? true : s.status === status))
      .filter((s) => !query || s.title.toLowerCase().includes(query.toLowerCase()));
  }, [territory.id, status, query]);

  if (!canAccess("/missions")) return <PageFrame><PermissionDenied module="Missions" /></PageFrame>;

  const columns: Column<Session>[] = [
    {
      key: "title",
      header: "Mission",
      render: (s) => (
        <div>
          <p className="font-medium text-ink-lum">{s.title}</p>
          <p className="text-[11px] text-ink-mut">{s.activity} · {s.format}</p>
        </div>
      ),
    },
    { key: "time", header: "Time", render: (s) => <span className="tabular text-ink-sec">{s.time}</span> },
    {
      key: "fill",
      header: "Fill",
      width: "180px",
      render: (s) => (
        <div className="w-36">
          <FillMeter value={fillRate(s.booked, s.capacity)} />
          <p className="mt-1 text-[11px] tabular text-ink-mut">
            {s.booked}/{s.capacity}{s.waitlist > 0 ? ` · ${s.waitlist} wait` : ""}
          </p>
        </div>
      ),
    },
    { key: "take", header: "Take", align: "right", render: (s) => <span className="tabular text-ink-lum">{inr(s.price * s.booked)}</span> },
    { key: "status", header: "Status", render: (s) => <StatusChip value={s.status} /> },
  ];

  return (
    <PageFrame>
      <PageHeader
        overline={`Missions · ${territory.name}`}
        title="The night's missions"
        sub="Every scheduled session, from draft to the wrap."
        right={
          <div className="flex items-center gap-2">
            <FilterRail options={STATUSES} value={status} onChange={setStatus} />
            <div className="w-52"><SearchInput value={query} onChange={setQuery} placeholder="Find a mission…" /></div>
          </div>
        }
      />

      <Stagger className="mt-6">
        <Item>
          <DataTable
            columns={columns}
            rows={rows}
            emptyTitle={rows.length === 0 ? "No missions match." : "No missions tonight."}
            emptyLine={rows.length === 0 ? "Loosen the filters, or wait for the night." : "The floor is quiet in this territory."}
            onRowClick={(s) => setOpenSession(s)}
          />
        </Item>
      </Stagger>

      <Drawer
        open={!!openSession}
        onClose={() => setOpenSession(null)}
        title={openSession?.title ?? ""}
        sub={openSession ? `${openSession.time} · ${openSession.booked}/${openSession.capacity} seated` : undefined}
      >
        {openSession && <SessionDetail session={openSession} />}
      </Drawer>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}

function SessionDetail({ session }: { session: Session }) {
  const { territory } = useStore();
  const [bookings, setBookings] = useState(
    repos.bookings().filter((b) => b.sessionId === session.id),
  );
  const venue = repos.venues().find((v) => v.id === session.venueId);
  const fill = fillRate(session.booked, session.capacity);

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <StatusChip value={session.status} />
        <span className="text-xs text-ink-mut">{venue?.name ?? session.venueId}</span>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="solid rounded-xl p-3">
          <p className="overline">Fill</p>
          <p className="mt-1 text-lg font-semibold tabular text-ink-lum">{fill}%</p>
        </div>
        <div className="solid rounded-xl p-3">
          <p className="overline">Waiting</p>
          <p className="mt-1 text-lg font-semibold tabular text-ink-lum">{session.waitlist}</p>
        </div>
        <div className="solid rounded-xl p-3">
          <p className="overline">Take</p>
          <p className="mt-1 text-lg font-semibold tabular text-ink-lum">{inr(session.price * session.booked)}</p>
        </div>
      </div>

      <div>
        <p className="overline mb-2">The door · check-in</p>
        <div className="space-y-1.5">
          {bookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-white/3 px-3 py-2.5">
              <div className="min-w-0">
                <p className="truncate text-sm text-ink-lum">
                  {b.alias} <span className="text-ink-mut">· {b.tempId}</span>
                </p>
                <p className="text-[11px] text-ink-mut">{b.phoneMask}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusChip value={b.status} />
                {b.status !== "checked-in" && (
                  <Button
                    variant="lamp"
                    className="h-8 px-3 text-xs"
                    onClick={() =>
                      setBookings((prev) => prev.map((x) => (x.id === b.id ? { ...x, status: "checked-in" } : x)))
                    }
                  >
                    Strike
                  </Button>
                )}
              </div>
            </div>
          ))}
          {bookings.length === 0 && <p className="text-sm text-ink-mut">No bookings yet on this mission.</p>}
        </div>
      </div>
    </div>
  );
}
