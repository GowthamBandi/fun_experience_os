"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Globe2, Pencil, Plus, RefreshCw } from "lucide-react";
import { useStore } from "@/lib/store";
import { franchiseDetail } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { inr } from "@/lib/format";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { useCommandFeedback } from "@/components/ui/toast";
import { plural, Crumbs, DetailList, Figure, LinkButton, LinkRows, NotFoundCard, Notice, PageShell, Panel, StatusDialog } from "@/components/setup/kit";
import { EditDrawer, type FieldDef } from "@/components/setup/form";
import { RecordActivity } from "@/components/setup/shared";
import { FRANCHISE_STATUS, franchiseFromValues, franchiseSteps, franchiseValues } from "@/components/setup/schemas";

export default function FranchiseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { state, canAccess, role, updateFranchise, changeFranchiseStatus } = useStore();
  const feedback = useCommandFeedback();
  const detail = useMemo(() => franchiseDetail(state, id), [state, id]);
  const [editing, setEditing] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);

  if (!canAccess("/franchises")) return <PermissionDenied module="Franchises" />;
  if (!detail) return <PageShell><NotFoundCard what="franchise" backHref="/franchises" backLabel="All franchises" /></PageShell>;

  const canManage = geoCan(role.id, "manage-franchise");
  const canAddTerritory = geoCan(role.id, "create-territory") && detail.status === "active";
  const m = detail.metrics;
  const fields: FieldDef[] = franchiseSteps().flatMap((s) => s.fields);
  const statusLabel = detail.status === "inactive" ? "paused" : detail.status;

  return (
    <PageShell>
      <Crumbs items={[{ label: "Setup", href: "/setup" }, { label: "Franchises", href: "/franchises" }, { label: detail.name }]} />
      <PageHeader
        overline={`Franchise · ${detail.isInternal ? "Internal" : "External"} ${detail.type}`}
        title={detail.name}
        sub={`${detail.legalEntity} · Head: ${detail.franchiseHead} · Since ${detail.startDate}`}
        right={
          <>
            <StatusChip value={statusLabel} />
            {canManage && (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" /> Edit
                </Button>
                <Button variant="secondary" onClick={() => setStatusOpen(true)}>
                  <RefreshCw className="h-4 w-4" /> Change status
                </Button>
              </>
            )}
            {canAddTerritory && (
              <LinkButton href={`/territories/new?franchiseId=${detail.id}`}>
                <Plus className="h-4 w-4" /> Add territory
              </LinkButton>
            )}
          </>
        }
      />

      {detail.status !== "active" && (
        <Notice tone="warn" title={`This franchise is ${statusLabel}`}>
          Its territories are paused and no new territories can be added until it is active again.
        </Notice>
      )}
      {detail.territories.length === 0 && detail.status === "active" && (
        <Notice tone="info" title="No territories yet" action={canAddTerritory ? <LinkButton href={`/territories/new?franchiseId=${detail.id}`} size="sm">Add territory</LinkButton> : undefined}>
          Add a territory to start adding cities and venues under this franchise.
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Figure label="Territories" value={m.territoryCount} />
        <Figure label="Cities" value={m.cityCount} />
        <Figure label="Venues" value={m.venueCount} />
        <Figure label="Upcoming sessions" value={m.activeSessions} hint={m.activeSessions ? `${m.fillRate}% average fill` : undefined} />
        <Figure label="Settled revenue" value={inr(m.revenue)} hint={`${m.refundRate}% refunded`} />
        <Figure label="Open incidents" value={m.incidentCount} tone={m.incidentCount ? "warn" : undefined} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <Panel title="Details">
          <DetailList
            rows={[
              { label: "Legal entity", value: detail.legalEntity },
              { label: "Franchise head", value: detail.franchiseHead },
              { label: "Contact", value: detail.contactDetails },
              { label: "Platform revenue share", value: `${detail.revenueShare}%` },
              { label: "Start date", value: detail.startDate },
              { label: "Ownership", value: detail.isInternal ? "Platform-owned" : "External partner" },
              { label: "Notes", value: detail.notes },
            ]}
          />
        </Panel>
        <Panel title="Territories" sub={`${detail.territories.length} under this franchise`} icon={<Globe2 className="h-4 w-4" />}>
          <LinkRows
            empty="No territories yet."
            rows={detail.territories.map((t) => ({
              href: `/territories/${t.id}`,
              title: t.name,
              meta: `${t.state} · ${plural(t.cities, "city", "cities")} · ${plural(t.venues, "venue")} · Manager: ${t.managerName}`,
              right: <StatusChip value={t.status} />,
            }))}
          />
        </Panel>
      </div>

      <Panel title="Recent changes" sub="From the audit log">
        <RecordActivity state={state} match={[detail.name]} />
      </Panel>

      <EditDrawer
        open={editing}
        onClose={() => setEditing(false)}
        title={`Edit ${detail.name}`}
        fields={fields}
        initial={franchiseValues(detail)}
        onSave={(v) => {
          const { status: _s, assignedTerritories: _a, ...patch } = franchiseFromValues(v);
          void _s;
          void _a;
          const out = updateFranchise(detail.id, patch);
          feedback(out, "Franchise updated");
          return out;
        }}
      />
      <StatusDialog
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title={`Change status — ${detail.name}`}
        current={detail.status}
        options={FRANCHISE_STATUS}
        onConfirm={(s, reason) => {
          const out = changeFranchiseStatus(detail.id, s, reason);
          feedback(out, `Franchise set to ${s === "inactive" ? "paused" : s}`);
          return out;
        }}
      />
    </PageShell>
  );
}
