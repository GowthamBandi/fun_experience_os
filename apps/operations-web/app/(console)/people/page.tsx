"use client";

import { useStore } from "@/lib/store";
import { repos } from "@/lib/data/mock";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { DataTable, type Column } from "@/components/ui/table";
import { StatusChip } from "@/components/ui/primitives";
import { Stagger, Item } from "@/components/motion/Motion";
import type { Booking, Incident } from "@/lib/types";

export default function PeoplePage() {
  const { territory, canAccess } = useStore();

  if (!canAccess("/people")) return <PageFrame><PermissionDenied module="People & safety" /></PageFrame>;

  const incidents = repos.incidents();
  const bookings = repos.bookings();

  const sessionTitle = (id: string) => repos.sessions().find((s) => s.id === id)?.title ?? id;

  const incidentColumns: Column<Incident>[] = [
    { key: "kind", header: "Signal", render: (i) => <span className="font-medium text-ink-lum">{i.kind}</span> },
    { key: "mission", header: "Mission", render: (i) => <span className="text-ink-sec">{sessionTitle(i.sessionId)}</span> },
    { key: "severity", header: "Weight", render: (i) => <StatusChip value={i.severity} /> },
    { key: "status", header: "Status", render: (i) => <StatusChip value={i.status} /> },
    { key: "at", header: "Reported", render: (i) => <span className="tabular text-ink-mut">{i.reportedAt}</span> },
  ];

  const participantColumns: Column<Booking>[] = [
    { key: "alias", header: "Alias", render: (b) => <span className="font-medium text-ink-lum">{b.alias}</span> },
    { key: "temp", header: "Temp ID", render: (b) => <span className="tabular text-ink-sec">{b.tempId}</span> },
    { key: "mission", header: "Mission", render: (b) => <span className="text-ink-sec">{sessionTitle(b.sessionId)}</span> },
    { key: "phone", header: "Contact", render: (b) => <span className="tabular text-ink-mut">{b.phoneMask}</span> },
    { key: "status", header: "Status", render: (b) => <StatusChip value={b.status} /> },
  ];

  return (
    <PageFrame>
      <PageHeader
        overline={`People · ${territory.name}`}
        title="People & safety"
        sub="Participants are aliases and temp IDs. The OS keeps the real world real, and the crew safe."
      />

      <Stagger className="mt-6 space-y-6">
        <Item>
          <p className="overline mb-3">The attention path</p>
          <DataTable columns={incidentColumns} rows={incidents} emptyTitle="No incidents." emptyLine="The night is quiet." />
        </Item>
        <Item>
          <p className="overline mb-3">Participants on the floor</p>
          <DataTable columns={participantColumns} rows={bookings} emptyTitle="Nobody on the floor." emptyLine="The door hasn't opened yet." />
        </Item>
      </Stagger>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}
