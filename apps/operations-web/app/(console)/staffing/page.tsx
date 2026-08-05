"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { crewViews, sessionViews, venueName, LIVE_STATUSES, type CrewView } from "@/lib/prototype/repositories";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { DataTable, type Column } from "@/components/ui/table";
import { SearchInput } from "@/components/ui/fields";
import { StatusChip, Badge } from "@/components/ui/primitives";
import { Drawer } from "@/components/ui/overlays";
import { Stagger, Item } from "@/components/motion/Motion";

export default function StaffingPage() {
  const { territory, canAccess, state } = useStore();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<CrewView | null>(null);

  const crew = useMemo(
    () =>
      crewViews(state, territory.id)
        .filter((c) => !query || c.name.toLowerCase().includes(query.toLowerCase()) || c.roleName.toLowerCase().includes(query.toLowerCase())),
    [state, territory.id, query],
  );

  if (!canAccess("/staffing")) return <PageFrame><PermissionDenied module="Staffing" /></PageFrame>;

  const cover = (m: CrewView): number => {
    const missions = sessionViews(state, m.territoryId).filter((s) => LIVE_STATUSES.has(s.status));
    if (!missions.length) return 0;
    return Math.min(100, Math.round((missions.filter((s) => s.venueId === m.venueId).length / missions.length) * 100));
  };

  const columns: Column<CrewView>[] = [
    {
      key: "name",
      header: "Crew",
      render: (m) => (
        <div>
          <p className="font-medium text-ink-lum">{m.name}</p>
          <p className="text-[11px] text-ink-mut">{m.assignment}</p>
        </div>
      ),
    },
    { key: "role", header: "Role", render: (m) => <Badge className="border border-white/8 bg-white/4 text-ink-sec">{m.roleName}</Badge> },
    { key: "shift", header: "Shift", render: (m) => {
      const s = m.shift;
      return <span className="text-xs tabular text-ink-sec">{s ? `${s.from} → ${s.to} · ${s.zone}` : "—"}</span>;
    } },
    { key: "cover", header: "Cover", render: (m) => <span className="tabular text-ink-sec">{cover(m)}%</span> },
    { key: "status", header: "Status", render: (m) => <StatusChip value={m.status} /> },
  ];

  return (
    <PageFrame>
      <PageHeader
        overline={`Staffing · ${territory.name}`}
        title="The crew"
        sub="Everyone who keeps the night moving. Status is real, live from the floor."
        right={<div className="w-52"><SearchInput value={query} onChange={setQuery} placeholder="Name or role…" /></div>}
      />
      <Stagger className="mt-6">
        <Item>
          <DataTable
            columns={columns}
            rows={crew}
            emptyTitle="No crew listed."
            emptyLine="This territory hasn't rostered yet."
            onRowClick={(m) => setOpen(m)}
          />
        </Item>
      </Stagger>

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.name ?? ""}
        sub={open ? `${open.role.replace("-", " ")} · ${open.assignment}` : undefined}
      >
        {open && (
          <div className="space-y-4">
            <div className="flex items-center gap-2"><StatusChip value={open.status} /></div>
            {(() => {
              const s = open.shift;
              return s ? (
                <div className="solid rounded-xl p-4">
                  <p className="overline">Tonight&apos;s shift</p>
                  <p className="mt-1 text-sm tabular text-ink-lum">{s.from} → {s.to} · {s.zone}</p>
                  <p className="text-xs text-ink-mut">{venueName(state, s.venueId)}</p>
                </div>
              ) : null;
            })()}
            <p className="text-sm text-ink-mut">
              Cover tonight: <span className="font-medium text-ink-lum">{cover(open)}%</span> of live missions. {cover(open) >= 70 ? "The floor is covered." : "There are gaps to fill."}
            </p>
          </div>
        )}
      </Drawer>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}
