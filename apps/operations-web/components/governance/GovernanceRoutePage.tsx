"use client";

import { useState } from "react";
import { GovernanceModulePage } from "./GovernanceModulePage";
import { ActionPanel, type PrivilegedAction } from "./ActionPanel";
import { Drawer, FieldList, InfoNote, rawFields } from "./controls";
import { adminCancelEvent, decideCase, setEntityStatus, type GovernanceCollection, type LiveGovernanceRecord } from "@/lib/governance-api";
import { useGovernanceCollection, useLiveDocument } from "@/lib/use-governance";
import { CONFIRM_PHRASES, type EntityStatus } from "@/lib/console/actions";
import { caseTargetFields, formatDateTime, text } from "@/lib/console/records";
import { caseOutcome } from "@/lib/console/outcomes";
import { isOpenCase } from "@/lib/console/attention";

export interface GovernanceRouteConfig {
  collection: GovernanceCollection;
  eyebrow: string;
  title: string;
  description: string;
  metricLabel: string;
  primaryAction: string;
  entityType?: "organizer" | "arena" | "event" | "risk-alert";
  readOnly?: boolean;
  /** Events page: expose the admin emergency cancellation (adminCancelEvent). */
  allowAdminCancel?: boolean;
  emptyMessage?: string;
}

export function GovernanceRoutePage({ config }: { config: GovernanceRouteConfig }) {
  const { records, loading, error, truncated, refresh } = useGovernanceCollection(config.collection);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Always render the live version of the selected record (versions move under us).
  const selected = selectedId ? records.find((record) => record.id === selectedId) ?? null : null;
  return <>
    <GovernanceModulePage {...config} metricValue={loading ? "…" : String(records.length)} records={records} loading={loading} error={error} truncated={truncated} onRetry={refresh} onAction={(record) => setSelectedId(record.id)} emptyMessage={config.emptyMessage} />
    {selectedId && <RecordDrawer record={selected} config={config} onRefresh={refresh} onClose={() => setSelectedId(null)} />}
  </>;
}

const CASE_TARGET_COLLECTION: Record<string, string> = {
  "organizer-kyc": "organizers",
  "arena-verification": "arenas",
  "experience-approval": "experiences",
  "event-approval": "events",
};

const KIND_LABEL: Record<string, string> = {
  "organizer-kyc": "Organizer approval (KYC)",
  "arena-verification": "Arena verification",
  "experience-approval": "Experience approval",
  "event-approval": "Event approval",
  "commission-proposal": "Commission proposal",
  "fraud-alert": "Fraud alert",
  "refund-exception": "Refund exception",
  "settlement-release": "Settlement release",
};

function RecordDrawer({ record, config, onClose, onRefresh }: { record: LiveGovernanceRecord | null; config: GovernanceRouteConfig; onClose: () => void; onRefresh: () => void }) {
  const isCase = config.collection === "governanceCases";
  const kind = record ? String(record.raw.kind ?? "") : "";
  const targetCollection = record && isCase ? (typeof record.raw.targetCollection === "string" ? record.raw.targetCollection : CASE_TARGET_COLLECTION[kind] ?? null) : null;
  const targetId = record && isCase && typeof record.raw.targetId === "string" ? record.raw.targetId : null;
  const target = useLiveDocument(targetCollection, targetId);

  if (!record) {
    return <Drawer label="Record unavailable" eyebrow={config.eyebrow} title="Record unavailable" onClose={onClose}><InfoNote tone="warn">This record is no longer in the live list (it may have been removed or you lost access). Close and refresh the list.</InfoNote></Drawer>;
  }

  const actions: PrivilegedAction[] = config.readOnly ? [] : isCase ? caseActions(record, kind) : [...entityActions(config, record), ...(config.allowAdminCancel ? [cancelEventAction(record)] : [])];
  const targetFields = caseTargetFields(kind, target.data);

  return (
    <Drawer label={`Review ${record.primary}`} eyebrow={`${config.eyebrow} · ${record.id}`} title={record.primary} subtitle={`Version ${record.version} · ${record.status}${isCase && kind ? ` · ${KIND_LABEL[kind] ?? kind}` : ""}`} onClose={onClose}>
      {isCase && (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Case</p>
          <FieldList fields={[
            { label: "Kind", value: KIND_LABEL[kind] ?? (kind || "—") },
            { label: "Status", value: String(record.raw.status ?? "—") },
            { label: "Summary", value: text(record.raw, "summary") },
            { label: "Policy", value: text(record.raw, "policyVersion") },
            { label: "Submitted", value: formatDateTime(record.raw.createdAt) },
          ]} />
        </section>
      )}
      {isCase && targetCollection && targetId && (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Target · {targetCollection}/{targetId}</p>
          {target.loading ? <p className="text-xs text-slate-500">Loading the submitted record…</p>
            : target.error ? <InfoNote tone="warn">{target.error}</InfoNote>
            : !target.data ? <InfoNote tone="warn">The target record was not found. Do not approve without reviewing it.</InfoNote>
            : <FieldList fields={targetFields.length ? targetFields : rawFields(target.data)} />}
        </section>
      )}
      {!isCase && (
        <section>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.1em] text-slate-500">Details</p>
          <FieldList fields={config.collection === "events" ? [...caseTargetFields("event-approval", record.raw), { label: "Record ID", value: record.id }] : rawFields(record.raw)} />
        </section>
      )}
      {!config.readOnly && <ActionPanel actions={actions} commandPrefix={config.collection} onRefresh={onRefresh} />}
      {config.readOnly && <InfoNote>This view is read-only. Decisions on these records are made by the server workflows described on this page.</InfoNote>}
    </Drawer>
  );
}

function caseActions(record: LiveGovernanceRecord, kind: string): PrivilegedAction[] {
  const open = isOpenCase(record.raw);
  const closed = open ? null : "This case has already reached a final decision.";
  const organizer = kind === "organizer-kyc";
  const decide = (outcome: "approved" | "rejected" | "information-requested") => async ({ requestId, reason }: { requestId: string; reason: string }) => {
    const result = await decideCase({ requestId, caseId: record.id, expectedVersion: record.version, outcome, note: reason });
    const mapped = caseOutcome(kind, outcome, result);
    return {
      message: mapped.message,
      tone: mapped.tone,
      organizerCode: mapped.showCode && result.organizerCode ? { code: result.organizerCode, orgId: result.orgId ?? null, expiresAt: result.codeExpiresAt ?? null, subject: record.primary } : undefined,
    };
  };
  return [
    {
      key: "approve",
      label: organizer ? "Approve organizer" : "Approve",
      variant: "primary",
      reasonMin: 0,
      confirmPhrase: organizer ? CONFIRM_PHRASES.approveOrganizer : undefined,
      consequence: organizer
        ? "Creates the organizer account and issues a one-time Organizer Code. The code is shown once; the applicant activates hosting with it."
        : kind === "event-approval"
          ? "Marks the event approved. The organizer can then publish it (only with an approved experience, active organizer, commercial terms and a responsible person)."
          : kind === "experience-approval" ? "Marks the experience approved so the organizer can schedule events from it." : "Records an approval decision on this case.",
      disabledReason: closed,
      execute: decide("approved"),
    },
    { key: "request-info", label: "Request changes / information", variant: "warn", reasonMin: 10, consequence: "Sends the case back to the submitter with your reason.", disabledReason: closed, execute: decide("information-requested") },
    { key: "reject", label: "Reject", variant: "danger", reasonMin: 10, consequence: "Rejects the submission. The submitter is notified with your reason.", disabledReason: closed, execute: decide("rejected") },
  ];
}

const ENTITY_ACTIONS: Record<NonNullable<GovernanceRouteConfig["entityType"]>, { status: EntityStatus; label: string; variant: PrivilegedAction["variant"] }[]> = {
  organizer: [{ status: "active", label: "Activate", variant: "primary" }, { status: "paused", label: "Pause organizer", variant: "warn" }, { status: "blocked", label: "Block organizer", variant: "danger" }],
  arena: [{ status: "active", label: "Activate", variant: "primary" }, { status: "paused", label: "Pause", variant: "warn" }, { status: "blocked", label: "Block", variant: "danger" }],
  event: [{ status: "active", label: "Activate", variant: "primary" }, { status: "paused", label: "Pause", variant: "warn" }, { status: "blocked", label: "Block", variant: "danger" }],
  "risk-alert": [{ status: "resolved", label: "Resolve", variant: "primary" }, { status: "paused", label: "Pause exposure", variant: "warn" }, { status: "blocked", label: "Block", variant: "danger" }],
};

function entityActions(config: GovernanceRouteConfig, record: LiveGovernanceRecord): PrivilegedAction[] {
  if (!config.entityType) return [];
  const entityType = config.entityType;
  return ENTITY_ACTIONS[entityType].map(({ status, label, variant }) => {
    const suspendOrganizer = entityType === "organizer" && (status === "paused" || status === "blocked");
    const block = status === "blocked";
    return {
      key: `status-${status}`,
      label,
      variant,
      reasonMin: 10,
      confirmPhrase: suspendOrganizer ? CONFIRM_PHRASES.suspendOrganizer : block ? CONFIRM_PHRASES.blockEntity : undefined,
      consequence: suspendOrganizer
        ? `${status === "blocked" ? "Blocks" : "Pauses"} this organizer: they can't publish or sell until reactivated. Existing bookings are not refunded by this action.`
        : block ? "Blocks this record in the marketplace." : `Sets the status to “${status}”.`,
      disabledReason: record.raw.status === status ? `Already ${status}.` : null,
      execute: async ({ requestId, reason }) => {
        const result = await setEntityStatus({ requestId, entityType, entityId: record.id, expectedVersion: record.version, status, reason });
        return { message: `Status set to “${result.status}” (version ${result.version}).${result.replayed ? " This request had already been applied." : ""}` };
      },
    } satisfies PrivilegedAction;
  });
}

const NOT_CANCELLABLE = new Set(["cancelled", "completed"]);

function cancelEventAction(record: LiveGovernanceRecord): PrivilegedAction {
  const status = String(record.raw.status ?? "");
  return {
    key: "admin-cancel",
    label: "Cancel event (emergency intervention)",
    variant: "danger",
    reasonMin: 10,
    confirmPhrase: CONFIRM_PHRASES.cancelEvent,
    consequence: "Emergency intervention: cancels this organizer's event, voids every ticket and issues a 100% refund to every attendee with a confirmed booking. Attendees are notified. This cannot be undone.",
    disabledReason: NOT_CANCELLABLE.has(status) ? `The event is ${status}.` : null,
    execute: async ({ requestId, reason }) => {
      await adminCancelEvent({ requestId, eventId: record.id, reason });
      return { message: "Event cancelled. Refunds for every confirmed booking are being issued; attendees are notified." };
    },
  };
}
