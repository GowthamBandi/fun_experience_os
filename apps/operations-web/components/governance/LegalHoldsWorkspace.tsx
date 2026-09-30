"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { GovernanceModulePage } from "./GovernanceModulePage";
import { ActionPanel, type PrivilegedAction } from "./ActionPanel";
import { Drawer, FieldList, InfoNote } from "./controls";
import { setLegalHold, type LiveGovernanceRecord } from "@/lib/governance-api";
import { useGovernanceCollection } from "@/lib/use-governance";
import { useAdminSession } from "@/lib/firebase/auth";
import { can } from "@/lib/console/capabilities";
import { formatDateTime, text } from "@/lib/console/records";

/**
 * Legal holds (docs/runbooks/DATA_RETENTION.md). While a user's hold is
 * active, scheduled retention never deletes their KYC documents. Admins place
 * and release holds; auditors see them read-only. Every change is audited.
 */
export function LegalHoldsWorkspace() {
  const { consoleRole } = useAdminSession();
  const canAct = can(consoleRole, "governance.decide");
  const { records, loading, error, truncated, refresh } = useGovernanceCollection("legalHolds");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const selected = selectedId ? records.find((record) => record.id === selectedId) ?? null : null;
  const active = records.filter((record) => record.raw.status === "active").length;
  return <>
    <GovernanceModulePage
      eyebrow="Compliance"
      title="Legal holds"
      description="A hold stops scheduled retention from deleting a user's documents (for example during a dispute, investigation or legal request). Place it before anything is due for deletion; release it when the matter is closed."
      metricLabel="Active holds"
      metricValue={loading ? "…" : String(active)}
      records={records}
      loading={loading}
      error={error}
      truncated={truncated}
      onRetry={refresh}
      primaryAction="Open"
      actionLabel={() => "Open"}
      onAction={(record) => setSelectedId(record.id)}
      emptyMessage="No legal holds. Retention runs normally for everyone."
      headerAction={canAct && <button onClick={() => setPlacing(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-indigo-400"><Plus className="h-4 w-4" />Place hold</button>}
    />
    {placing && <PlaceHoldDrawer onClose={() => setPlacing(false)} onRefresh={refresh} />}
    {selectedId && <HoldDrawer record={selected} onRefresh={refresh} onClose={() => setSelectedId(null)} />}
  </>;
}

function PlaceHoldDrawer({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void }) {
  const action: PrivilegedAction = {
    key: "place",
    label: "Place legal hold",
    variant: "warn",
    reasonMin: 10,
    reasonLabel: "Why (case, request or matter)",
    consequence: "While the hold is active, scheduled retention will not delete this user's documents. Nothing else about the account changes.",
    inputs: [
      { key: "subjectId", label: "User uid", placeholder: "Firebase Auth uid" },
      { key: "reference", label: "Reference (optional)", placeholder: "e.g. ticket or case number", required: false },
    ],
    execute: async ({ requestId, reason, inputs }) => {
      const result = await setLegalHold({ requestId, subjectId: inputs.subjectId ?? "", action: "place", reason, reference: inputs.reference });
      return { message: `Hold ${result.holdId} is active.` };
    },
  };
  return (
    <Drawer label="Place legal hold" eyebrow="Compliance · legal holds" title="Place legal hold" subtitle="setLegalHold (server-side, audited, idempotent)" onClose={onClose}>
      <ActionPanel actions={[action]} commandPrefix="hold" onRefresh={onRefresh} />
    </Drawer>
  );
}

function HoldDrawer({ record, onClose, onRefresh }: { record: LiveGovernanceRecord | null; onClose: () => void; onRefresh: () => void }) {
  if (!record) return <Drawer label="Hold unavailable" eyebrow="Legal hold" title="Hold unavailable" onClose={onClose}><InfoNote tone="warn">This hold is no longer in the live list.</InfoNote></Drawer>;
  const raw = record.raw;
  const activeHold = raw.status === "active";
  const release: PrivilegedAction = {
    key: "release",
    label: "Release hold",
    variant: "danger",
    reasonMin: 10,
    consequence: "Retention resumes for this user. Anything already past its retention period may be deleted on the next daily run.",
    execute: async ({ requestId, reason }) => {
      await setLegalHold({ requestId, subjectId: String(raw.subjectId ?? ""), action: "release", reason });
      return { message: "Hold released." };
    },
  };
  return (
    <Drawer label={`Legal hold ${record.id}`} eyebrow={`Legal hold · ${record.id}`} title={`User ${text(raw, "subjectId")}`} subtitle={`Status ${String(raw.status ?? "—")}`} onClose={onClose}>
      <FieldList fields={[
        { label: "Status", value: String(raw.status ?? "—") },
        { label: "Subject", value: `${text(raw, "subjectType")} ${text(raw, "subjectId")}` },
        { label: "Reason", value: text(raw, "reason") },
        { label: "Reference", value: text(raw, "reference") },
        { label: "Placed by", value: text(raw, "placedBy") },
        { label: "Placed", value: formatDateTime(raw.placedAt) },
        { label: "Released by", value: text(raw, "releasedBy") },
        { label: "Released", value: formatDateTime(raw.releasedAt) },
        { label: "Release reason", value: text(raw, "releaseReason") },
      ]} />
      {activeHold
        ? <ActionPanel actions={[release]} commandPrefix="hold" onRefresh={onRefresh} />
        : <InfoNote>This hold is released. Place a new hold if the matter reopens.</InfoNote>}
    </Drawer>
  );
}
