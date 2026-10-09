"use client";

import { useState } from "react";
import { GovernanceModulePage } from "@/components/governance/GovernanceModulePage";
import { ActionPanel, type PrivilegedAction } from "@/components/governance/ActionPanel";
import { Drawer, FieldList, InfoNote } from "@/components/governance/controls";
import { ORGANIZER_CODE_WARNING } from "@/components/governance/OrganizerCodeModal";
import { reissueOrganizerCode, type LiveGovernanceRecord } from "@/lib/governance-api";
import { useGovernanceCollection } from "@/lib/use-governance";
import { CONFIRM_PHRASES } from "@/lib/console/actions";
import { canReissueOrganizerCode, caseTargetFields, formatDateTime } from "@/lib/console/records";

/** Approved applicants whose Organizer Code was lost, expired or locked get a new one here. */
export function OrganizerCodes() {
  const { records, loading, error, truncated, refresh } = useGovernanceCollection("organizerApplications");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = selectedId ? records.find((record) => record.id === selectedId) ?? null : null;
  return <>
    <GovernanceModulePage
      eyebrow="Marketplace"
      title="Organizer applications"
      description="Applications are decided from the approvals queue (organizer-kyc cases). Approved applicants whose code was lost, expired or locked can be issued a new Organizer Code here."
      metricLabel="Applications"
      metricValue={loading ? "…" : String(records.length)}
      records={records}
      loading={loading}
      error={error}
      truncated={truncated}
      onRetry={refresh}
      primaryAction="Open"
      actionLabel={(record) => (canReissueOrganizerCode(record.raw) ? "Manage code" : "Open")}
      onAction={(record) => setSelectedId(record.id)}
      emptyMessage="No organizer applications yet."
    />
    {selectedId && <ApplicationDrawer record={selected} onRefresh={refresh} onClose={() => setSelectedId(null)} />}
  </>;
}

function ApplicationDrawer({ record, onClose, onRefresh }: { record: LiveGovernanceRecord | null; onClose: () => void; onRefresh: () => void }) {
  if (!record) {
    return <Drawer label="Application unavailable" eyebrow="Organizer application" title="Application unavailable" onClose={onClose}><InfoNote tone="warn">This application is no longer in the live list.</InfoNote></Drawer>;
  }
  const eligible = canReissueOrganizerCode(record.raw);
  const action: PrivilegedAction = {
    key: "reissue",
    label: "Re-issue Organizer Code",
    variant: "danger",
    reasonMin: 10,
    confirmPhrase: CONFIRM_PHRASES.reissueCode,
    consequence: "Generates a new one-time Organizer Code and immediately invalidates the previous one. Only do this after confirming the applicant's identity through their registered phone/email.",
    disabledReason: eligible ? null : record.raw.status !== "approved" ? "Only approved applications can get a code." : "This organizer has already activated their account.",
    execute: async ({ requestId, reason }) => {
      const result = await reissueOrganizerCode({ requestId, applicantUid: record.id, reason });
      if (!result.organizerCode) {
        return { tone: "info", message: "A code was already issued for this request and cannot be shown again. Start a new re-issue if it was not delivered." };
      }
      return {
        message: "New Organizer Code issued. The previous code no longer works.",
        organizerCode: { code: result.organizerCode, orgId: result.orgId, expiresAt: result.codeExpiresAt ?? null, subject: record.primary },
      };
    },
  };
  return (
    <Drawer label={`Organizer application ${record.primary}`} eyebrow={`Organizer application · ${record.id}`} title={record.primary} subtitle={`${record.status} · version ${record.version}`} onClose={onClose}>
      <FieldList fields={[
        ...caseTargetFields("organizer-kyc", record.raw),
        { label: "Organizer ID", value: typeof record.raw.orgId === "string" ? record.raw.orgId : "—" },
        { label: "Activation", value: record.raw.activationPending === true ? "Code issued, not yet redeemed" : record.raw.orgId ? "Activated" : "—" },
        { label: "Decided", value: formatDateTime(record.raw.decidedAt) },
      ]} />
      <InfoNote>{ORGANIZER_CODE_WARNING} The server records the re-issue in the audit trail (actor, time, organizer); your reason is sent with the request.</InfoNote>
      <ActionPanel actions={[action]} commandPrefix="reissue" onRefresh={onRefresh} />
    </Drawer>
  );
}
