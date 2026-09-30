"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { GovernanceModulePage } from "./GovernanceModulePage";
import { ActionPanel, type PrivilegedAction } from "./ActionPanel";
import { Drawer, FieldList, InfoNote } from "./controls";
import { decideCommercialAgreement, proposeCommercialAgreement, type LiveGovernanceRecord } from "@/lib/governance-api";
import { useGovernanceCollection } from "@/lib/use-governance";
import { useAdminSession } from "@/lib/firebase/auth";
import { formatDateTime, text } from "@/lib/console/records";

const percent = (bps: unknown) => (typeof bps === "number" ? `${(bps / 100).toFixed(2).replace(/\.?0+$/, "")}%` : "—");

export function CommercialsWorkspace() {
  const { records, loading, error, truncated, refresh } = useGovernanceCollection("commercialAgreements");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [proposing, setProposing] = useState(false);
  const selected = selectedId ? records.find((record) => record.id === selectedId) ?? null : null;
  const pending = records.filter((record) => record.raw.status === "pending-approval").length;
  return <>
    <GovernanceModulePage
      eyebrow="Finance"
      title="Commercial terms"
      description="Versioned commission and payout terms per organizer. An organizer can publish events only with approved terms; the commission is copied onto each event when it's published. One admin proposes, a different admin approves."
      metricLabel="Pending approval"
      metricValue={loading ? "…" : String(pending)}
      records={records}
      loading={loading}
      error={error}
      truncated={truncated}
      onRetry={refresh}
      primaryAction="Open"
      actionLabel={(record) => (record.raw.status === "pending-approval" ? "Decide" : "Open")}
      onAction={(record) => setSelectedId(record.id)}
      emptyMessage="No commercial terms yet. Propose terms for an organizer once the agreement is signed."
      headerAction={<button onClick={() => setProposing(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-indigo-400"><Plus className="h-4 w-4" />Propose terms</button>}
    />
    {proposing && <ProposeDrawer onClose={() => setProposing(false)} onRefresh={refresh} />}
    {selectedId && <AgreementDrawer record={selected} onRefresh={refresh} onClose={() => setSelectedId(null)} />}
  </>;
}

function ProposeDrawer({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void }) {
  const action: PrivilegedAction = {
    key: "propose",
    label: "Propose terms",
    variant: "primary",
    reasonMin: 10,
    reasonLabel: "Basis (signed agreement reference)",
    consequence: "Creates a new version pending approval. It takes effect only when a different admin approves it, and then replaces the organizer's current terms for events published afterwards.",
    inputs: [
      { key: "orgId", label: "Organizer ID (orgId)", placeholder: "e.g. org_abc123" },
      { key: "commission", label: "Commission (%)", placeholder: "e.g. 12 or 12.5", hint: "0–50%, up to two decimals." },
      { key: "cadence", label: "Payout cadence", placeholder: "weekly, fortnightly or monthly" },
    ],
    execute: async ({ requestId, reason, inputs }) => {
      const result = await proposeCommercialAgreement({ requestId, orgId: inputs.orgId ?? "", commissionPercent: inputs.commission ?? "", payoutCadence: inputs.cadence ?? "", note: reason });
      return { message: `Terms ${result.agreementId} proposed. A different admin must approve them before they apply.` };
    },
  };
  return (
    <Drawer label="Propose commercial terms" eyebrow="Finance · commercial terms" title="Propose terms" subtitle="proposeCommercialAgreement (server-side, idempotent)" onClose={onClose}>
      <ActionPanel actions={[action]} commandPrefix="agreement" onRefresh={onRefresh} />
    </Drawer>
  );
}

function AgreementDrawer({ record, onClose, onRefresh }: { record: LiveGovernanceRecord | null; onClose: () => void; onRefresh: () => void }) {
  const { user } = useAdminSession();
  if (!record) return <Drawer label="Terms unavailable" eyebrow="Commercial terms" title="Terms unavailable" onClose={onClose}><InfoNote tone="warn">These terms are no longer in the live list.</InfoNote></Drawer>;
  const raw = record.raw;
  const pending = raw.status === "pending-approval";
  const proposedByMe = !!user && raw.proposedBy === user.uid;
  const actions: PrivilegedAction[] = (["approve", "reject"] as const).map((key) => ({
    key,
    label: key === "approve" ? "Approve terms" : "Reject terms",
    variant: key === "approve" ? "primary" : "danger",
    reasonMin: 10,
    consequence: key === "approve"
      ? `Applies ${percent(raw.commissionBps)} commission to events this organizer publishes from now on. Their current approved terms are superseded; events already published keep their commission.`
      : "Rejects this version. The organizer's current terms (if any) stay in force.",
    disabledReason: proposedByMe ? "You proposed these terms. A different admin must decide them." : null,
    execute: async ({ requestId, reason }) => {
      const result = await decideCommercialAgreement({ requestId, agreementId: record.id, action: key, note: reason });
      return { message: result.status === "approved" ? `Terms approved${result.supersededId ? `; ${result.supersededId} superseded` : ""}.` : "Terms rejected." };
    },
  }));
  return (
    <Drawer label={`Terms ${record.id}`} eyebrow={`Commercial terms · ${record.id}`} title={`${percent(raw.commissionBps)} commission · org ${text(raw, "orgId")}`} subtitle={`Status ${String(raw.status ?? "—")}`} onClose={onClose}>
      {pending && proposedByMe && <InfoNote tone="warn">You proposed these terms, so the server will refuse a decision from your account.</InfoNote>}
      <FieldList fields={[
        { label: "Commission", value: percent(raw.commissionBps) },
        { label: "Payout cadence", value: text(raw, "payoutCadence") },
        { label: "Status", value: String(raw.status ?? "—") },
        { label: "Basis", value: text(raw, "note") },
        { label: "Proposed by", value: text(raw, "proposedBy") },
        { label: "Proposed", value: formatDateTime(raw.proposedAt ?? raw.createdAt) },
        { label: "Decided by", value: text(raw, "decidedBy") },
        { label: "Decision note", value: text(raw, "decisionNote") },
        { label: "Superseded by", value: text(raw, "supersededBy") },
      ]} />
      {pending
        ? <ActionPanel actions={actions} commandPrefix="agreement" onRefresh={onRefresh} />
        : <InfoNote>No decisions are available while these terms are {String(raw.status ?? "—")}.</InfoNote>}
    </Drawer>
  );
}
