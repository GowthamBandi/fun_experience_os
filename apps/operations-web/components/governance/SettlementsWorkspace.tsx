"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { GovernanceModulePage } from "./GovernanceModulePage";
import { ActionPanel, type PrivilegedAction } from "./ActionPanel";
import { Drawer, FieldList, InfoNote } from "./controls";
import { buildSettlement, decideSettlement, type LiveGovernanceRecord } from "@/lib/governance-api";
import { useGovernanceCollection } from "@/lib/use-governance";
import { useAdminSession } from "@/lib/firebase/auth";
import { can } from "@/lib/console/capabilities";
import { CONFIRM_PHRASES, settlementActionsFor, type SettlementAction } from "@/lib/console/actions";
import { formatPaise, needsSettlementDualControl } from "@/lib/console/money";
import { formatDate, formatDateTime, text } from "@/lib/console/records";
import { settlementOutcome } from "@/lib/console/outcomes";

export function SettlementsWorkspace() {
  const { consoleRole } = useAdminSession();
  const canDecide = can(consoleRole, "governance.decide");
  const { records, loading, error, truncated, refresh } = useGovernanceCollection("settlements");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [building, setBuilding] = useState(false);
  const selected = selectedId ? records.find((record) => record.id === selectedId) ?? null : null;
  const attention = records.filter((record) => ["pending-approval", "approved", "held"].includes(String(record.raw.status))).length;
  return <>
    <GovernanceModulePage
      eyebrow="Finance"
      title="Settlements"
      description="Organizer payouts built from the ledger of completed events. Approve, hold, release or mark paid with the bank reference. Above ₹50,000 the admin who approved cannot also mark it paid."
      metricLabel="Need action"
      metricValue={loading ? "…" : String(attention)}
      records={records}
      loading={loading}
      error={error}
      truncated={truncated}
      onRetry={refresh}
      primaryAction="Open"
      actionLabel={(record) => (canDecide && settlementActionsFor(record.raw.status).length ? "Decide" : "Open")}
      onAction={(record) => setSelectedId(record.id)}
      emptyMessage="No settlements yet. Build one for an organizer once their events are completed."
      headerAction={canDecide && <button onClick={() => setBuilding(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-indigo-400"><Plus className="h-4 w-4" />Build settlement</button>}
    />
    {building && <BuildSettlementDrawer onClose={() => setBuilding(false)} onRefresh={refresh} />}
    {selectedId && <SettlementDrawer record={selected} onRefresh={refresh} onClose={() => setSelectedId(null)} />}
  </>;
}

function BuildSettlementDrawer({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void }) {
  const action: PrivilegedAction = {
    key: "build",
    label: "Build settlement",
    variant: "primary",
    reasonMin: 0,
    hideReason: true,
    consequence: "Claims every unsettled organizer-payable ledger entry of this organizer's COMPLETED events up to the period end into one settlement (pending approval). An entry can never be in two settlements.",
    inputs: [
      { key: "orgId", label: "Organizer ID (orgId)", placeholder: "e.g. org_abc123" },
      { key: "periodEnd", label: "Period end (inclusive, IST)", type: "date", hint: "Must not be in the future. Today is clamped to the current time." },
    ],
    execute: async ({ requestId, inputs }) => {
      const result = await buildSettlement({ requestId, orgId: inputs.orgId ?? "", periodEndDate: inputs.periodEnd ?? "" });
      if (!result.settlementId || result.status === "empty") {
        return { tone: "info", message: "Nothing to settle: there are no unsettled ledger entries from completed events for this organizer up to that date." };
      }
      return { message: `Settlement ${result.settlementId} built: ${result.entryCount} entries, net ${formatPaise(result.netMinor)} (status: ${result.status}).` };
    },
  };
  return (
    <Drawer label="Build settlement" eyebrow="Finance · settlements" title="Build settlement" subtitle="buildSettlement (server-side, idempotent)" onClose={onClose}>
      <ActionPanel actions={[action]} commandPrefix="build" onRefresh={onRefresh} />
    </Drawer>
  );
}

const ACTION_COPY: Record<SettlementAction, { label: string; variant: PrivilegedAction["variant"] }> = {
  approve: { label: "Approve settlement", variant: "primary" },
  hold: { label: "Put on hold", variant: "warn" },
  "release-hold": { label: "Release hold", variant: "secondary" },
  "mark-paid": { label: "Mark paid", variant: "danger" },
};

function SettlementDrawer({ record, onClose, onRefresh }: { record: LiveGovernanceRecord | null; onClose: () => void; onRefresh: () => void }) {
  const { user } = useAdminSession();
  if (!record) return <Drawer label="Settlement unavailable" eyebrow="Settlement" title="Settlement unavailable" onClose={onClose}><InfoNote tone="warn">This settlement is no longer in the live list.</InfoNote></Drawer>;
  const raw = record.raw;
  const net = formatPaise(raw.netMinor, raw.currency);
  const dual = needsSettlementDualControl(raw.netMinor);
  const approvedByMe = !!user && raw.approvedBy === user.uid;
  const allowed = settlementActionsFor(raw.status);

  const actions: PrivilegedAction[] = (Object.keys(ACTION_COPY) as SettlementAction[]).map((key) => ({
    key,
    label: ACTION_COPY[key].label,
    variant: ACTION_COPY[key].variant,
    reasonMin: 10,
    confirmPhrase: key === "mark-paid" ? CONFIRM_PHRASES.markPaid : undefined,
    consequence: key === "mark-paid"
      ? `Records that ${net} was paid to the organizer, with the bank/payout reference. Do this only after the transfer is confirmed. This console does not move money.`
      : key === "approve" ? `Approves the payout of ${net}.${dual ? " Above ₹50,000 a different admin must mark it paid." : ""}`
      : key === "hold" ? "Blocks the payout until the hold is released (e.g. pending a fraud or dispute review)."
      : "Returns the settlement to the state it was in before the hold.",
    inputs: key === "mark-paid" ? [{ key: "payoutReference", label: "Payout / bank reference (UTR)", placeholder: "e.g. UTR123456789" }] : undefined,
    disabledReason: allowed.includes(key) ? null : `Not available while the settlement is ${String(raw.status ?? "—")}.`,
    execute: async ({ requestId, reason, inputs }) => {
      const result = await decideSettlement({ requestId, settlementId: record.id, action: key, note: reason, payoutReference: inputs.payoutReference });
      return { message: settlementOutcome(key, result.status) };
    },
  }));

  return (
    <Drawer label={`Settlement ${record.id}`} eyebrow={`Settlement · ${record.id}`} title={`${net} net · org ${text(raw, "orgId")}`} subtitle={`Status ${String(raw.status ?? "—")} · period ending ${formatDate(raw.periodEnd)}`} onClose={onClose}>
      {raw.status === "approved" && dual && approvedByMe && <InfoNote tone="warn">You approved this settlement. It is above ₹50,000, so a different admin must mark it paid; the server will refuse it from your account.</InfoNote>}
      <FieldList fields={[
        { label: "Gross", value: formatPaise(raw.grossMinor, raw.currency) },
        { label: "Commission", value: formatPaise(raw.commissionMinor, raw.currency) },
        { label: "Refunds", value: formatPaise(raw.refundsMinor, raw.currency) },
        { label: "Net payable", value: net },
        { label: "Ledger entries", value: typeof raw.entryCount === "number" ? String(raw.entryCount) : "—" },
        { label: "Status", value: String(raw.status ?? "—") },
        { label: "Held from", value: text(raw, "heldFrom") },
        { label: "Built by", value: text(raw, "builtBy") },
        { label: "Approved by", value: text(raw, "approvedBy") },
        { label: "Paid by", value: text(raw, "paidBy") },
        { label: "Payout reference", value: text(raw, "payoutReference") },
        { label: "Created", value: formatDateTime(raw.createdAt) },
      ]} />
      <ActionPanel actions={actions.filter((action) => allowed.includes(action.key as SettlementAction))} commandPrefix="settlement" onRefresh={onRefresh} emptyMessage={`No decisions are available while the settlement is ${String(raw.status ?? "—")}.`} />
    </Drawer>
  );
}
