"use client";

import { useStore } from "@/lib/store";
import { incidentViews, bookingViews, type IncidentView, type BookingView } from "@/lib/prototype/repositories";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { DataTable, type Column } from "@/components/ui/table";
import { StatusChip, Badge } from "@/components/ui/primitives";
import { Stagger, Item } from "@/components/motion/Motion";

export default function PeoplePage() {
  const { territory, canAccess, state } = useStore();

  if (!canAccess("/people")) return <PageFrame><PermissionDenied module="People & safety" /></PageFrame>;

  const incidents = incidentViews(state);
  const bookings = bookingViews(state, territory.id);

  const incidentColumns: Column<IncidentView>[] = [
    { key: "kind", header: "Signal", render: (i) => <span className="font-medium text-ink-lum">{i.kind}</span> },
    { key: "mission", header: "Mission", render: (i) => <span className="text-ink-sec">{i.sessionTitle}</span> },
    { key: "severity", header: "Weight", render: (i) => <StatusChip value={i.severity} /> },
    { key: "status", header: "Status", render: (i) => <StatusChip value={i.status} /> },
    { key: "at", header: "Reported", render: (i) => <span className="tabular text-ink-mut">{i.reportedAt}</span> },
  ];

  const participantColumns: Column<BookingView>[] = [
    { key: "alias", header: "Alias", render: (b) => <span className="font-medium text-ink-lum">{b.alias}</span> },
    { key: "temp", header: "Temp ID", render: (b) => <span className="tabular text-ink-sec">{b.tempId}</span> },
    { key: "mission", header: "Mission", render: (b) => <span className="text-ink-sec">{b.sessionTitle}</span> },
    { key: "phone", header: "Contact", render: (b) => <span className="tabular text-ink-mut">{b.phoneMask}</span> },
    { key: "status", header: "Status", render: (b) => <StatusChip value={b.status} /> },
    {
      key: "safety",
      header: "Safety & Restriction",
      render: (b) => {
        const activeActions = (state.moderationActions ?? []).filter(
          (a) =>
            a.status === "active" &&
            (a.subjectTemporaryId === b.tempId || a.subjectPersonId === b.tempId || a.subjectTemporaryId === b.alias)
        );
        if (activeActions.length > 0) {
          return (
            <Badge className="bg-danger/10 border border-danger/30 text-danger text-[10px] py-0.5 px-1.5 rounded">
              ⚠️ Restricted
            </Badge>
          );
        }
        return <span className="text-xs text-[#12b76a]">✅ Clear</span>;
      }
    }
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
