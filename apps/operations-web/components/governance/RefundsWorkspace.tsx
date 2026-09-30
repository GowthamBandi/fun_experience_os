"use client";

import { useState } from "react";
import { GovernanceModulePage } from "./GovernanceModulePage";
import { ActionPanel, type PrivilegedAction } from "./ActionPanel";
import { Drawer, FieldList, InfoNote } from "./controls";
import { decideRefund, type LiveGovernanceRecord } from "@/lib/governance-api";
import { useGovernanceCollection } from "@/lib/use-governance";
import { useAdminSession } from "@/lib/firebase/auth";
import { CONFIRM_PHRASES } from "@/lib/console/actions";
import { formatPaise, needsRefundDualControl } from "@/lib/console/money";
import { REFUND_REASON_LABEL, formatDateTime, refundStage, text } from "@/lib/console/records";
import { AWAITING_SECOND_APPROVER, refundOutcome } from "@/lib/console/outcomes";

export function RefundsWorkspace() {
  const { records, loading, error, truncated, refresh } = useGovernanceCollection("refunds");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? records.find((record) => record.id === selectedId) ?? null : null;
  const waiting = records.filter((record) => refundStage(record.raw) !== "decided").length;
  return <>
    <GovernanceModulePage
      eyebrow="Finance"
      title="Refunds"
      description="Organizer-requested and out-of-policy refunds wait here for a platform decision. Organizers never approve refunds. Above ₹10,000 two different admins must approve (dual control)."
      metricLabel="Awaiting decision"
      metricValue={loading ? "…" : String(waiting)}
      records={records}
      loading={loading}
      error={error}
      truncated={truncated}
      onRetry={refresh}
      primaryAction="Open"
      actionLabel={(record) => {
        const stage = refundStage(record.raw);
        return stage === "awaiting-second-approver" ? "Second approval" : stage === "needs-decision" ? "Decide" : "Open";
      }}
      onAction={(record) => setSelectedId(record.id)}
      emptyMessage="No refunds yet. Policy refunds are processed automatically; exceptions appear here."
    />
    {selectedId && <RefundDrawer record={selected} onRefresh={refresh} onClose={() => setSelectedId(null)} />}
  </>;
}

function RefundDrawer({ record, onClose, onRefresh }: { record: LiveGovernanceRecord | null; onClose: () => void; onRefresh: () => void }) {
  const { user } = useAdminSession();
  if (!record) return <Drawer label="Refund unavailable" eyebrow="Refund" title="Refund unavailable" onClose={onClose}><InfoNote tone="warn">This refund is no longer in the live list.</InfoNote></Drawer>;
  const raw = record.raw;
  const stage = refundStage(raw);
  const dual = needsRefundDualControl(raw.amountMinor);
  const approvals = Array.isArray(raw.approvals) ? raw.approvals.length : 0;
  const approvedByMe = !!user && Array.isArray(raw.approvals) && raw.approvals.includes(user.uid);
  const undecided = stage === "decided" ? `This refund is ${String(raw.status)}; there is nothing to decide.` : null;

  const actions: PrivilegedAction[] = [
    {
      key: "approve",
      label: stage === "awaiting-second-approver" ? "Give second approval" : "Approve refund",
      variant: "primary",
      reasonMin: 10,
      confirmPhrase: dual ? CONFIRM_PHRASES.largeRefund : undefined,
      consequence: dual
        ? `Approves a refund of ${formatPaise(raw.amountMinor, raw.currency)} (above ₹10,000). ${stage === "awaiting-second-approver" ? "This is the second approval: money moves to the customer when it succeeds." : "This records the first approval; a different admin must approve before money moves."}`
        : `Approves a refund of ${formatPaise(raw.amountMinor, raw.currency)}; it is sent to the payment provider immediately.`,
      disabledReason: undecided,
      execute: async ({ requestId, reason }) => {
        const result = await decideRefund({ requestId, refundId: record.id, decision: "approve", note: reason });
        return refundOutcome(result.status, "approve");
      },
    },
    {
      key: "reject",
      label: "Reject refund",
      variant: "danger",
      reasonMin: 10,
      consequence: "Rejects this refund request. The customer keeps their booking; the reason is recorded in the audit trail.",
      disabledReason: undecided,
      execute: async ({ requestId, reason }) => {
        const result = await decideRefund({ requestId, refundId: record.id, decision: "reject", note: reason });
        return refundOutcome(result.status, "reject");
      },
    },
  ];

  return (
    <Drawer label={`Refund ${record.id}`} eyebrow={`Refund · ${record.id}`} title={`${formatPaise(raw.amountMinor, raw.currency)} · ${typeof raw.reason === "string" ? REFUND_REASON_LABEL[raw.reason] ?? raw.reason : "Refund"}`} subtitle={`Status ${String(raw.status ?? "—")}`} onClose={onClose}>
      {stage === "awaiting-second-approver" && <InfoNote tone="warn"><strong>{AWAITING_SECOND_APPROVER}.</strong> One admin approved this refund. A different Platform Owner or Super Admin must give the second approval; the server refuses a second approval from the same admin.</InfoNote>}
      {approvedByMe && stage === "awaiting-second-approver" && <InfoNote tone="warn">You gave the first approval. The server will refuse a second approval from your account.</InfoNote>}
      {stage === "needs-decision" && dual && <InfoNote>Dual control applies: this refund is above ₹10,000 and needs approvals from two different admins.</InfoNote>}
      <FieldList fields={[
        { label: "Amount", value: formatPaise(raw.amountMinor, raw.currency) },
        { label: "Status", value: String(raw.status ?? "—") },
        { label: "Approvals", value: `${approvals}${dual ? " of 2" : " of 1"}` },
        { label: "Reason", value: typeof raw.reason === "string" ? REFUND_REASON_LABEL[raw.reason] ?? raw.reason : "—" },
        { label: "Requester note", value: text(raw, "note") },
        { label: "Organizer", value: text(raw, "orgId") },
        { label: "Event", value: text(raw, "eventId") },
        { label: "Booking", value: text(raw, "bookingId") },
        { label: "Requested by", value: text(raw, "requestedBy") },
        { label: "Decided by", value: text(raw, "decidedBy") },
        { label: "Provider refund", value: text(raw, "providerRefundId") },
        { label: "Last error", value: text(raw, "lastError") },
        { label: "Created", value: formatDateTime(raw.createdAt) },
        { label: "Updated", value: formatDateTime(raw.updatedAt) },
      ]} />
      <ActionPanel actions={actions} commandPrefix="refund" onRefresh={onRefresh} />
    </Drawer>
  );
}
