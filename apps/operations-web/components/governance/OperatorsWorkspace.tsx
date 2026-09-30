"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { GovernanceModulePage } from "./GovernanceModulePage";
import { ActionPanel, type PrivilegedAction } from "./ActionPanel";
import { Drawer, FieldList, InfoNote } from "./controls";
import { setOperatorAccess, type LiveGovernanceRecord } from "@/lib/governance-api";
import { useGovernanceCollection } from "@/lib/use-governance";
import { useAdminSession } from "@/lib/firebase/auth";
import { CONFIRM_PHRASES, type OperatorRole, type OperatorStatus } from "@/lib/console/actions";
import { ROLE_LABEL, can, toConsoleRole } from "@/lib/console/capabilities";
import { formatDateTime, text } from "@/lib/console/records";

const APPLY_NOTE = "The change applies on the operator's next token refresh (sign out/in, or “Check again”). Suspending or disabling also revokes their sessions.";

/**
 * Operator access (setOperatorAccess — Platform Owner only). Super Admins and
 * Auditors-with-access see the list read-only; the server refuses them too.
 */
export function OperatorsWorkspace() {
  const { consoleRole } = useAdminSession();
  const canManage = can(consoleRole, "access.manage");
  const { records, loading, error, truncated, refresh } = useGovernanceCollection("operators");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [granting, setGranting] = useState(false);
  const selected = selectedId ? records.find((record) => record.id === selectedId) ?? null : null;
  const active = records.filter((record) => (record.raw.status ?? "active") === "active").length;
  return <>
    <GovernanceModulePage
      eyebrow="Control"
      title="Operator access"
      description="Console accounts and their roles. Platform Owners grant, change, suspend or disable access; every change is audited and dual-control actions need two different admins, so keep at least two active admins."
      metricLabel="Active operators"
      metricValue={loading ? "…" : String(active)}
      records={records}
      loading={loading}
      error={error}
      truncated={truncated}
      onRetry={refresh}
      primaryAction={canManage ? "Manage" : "Open"}
      onAction={(record) => setSelectedId(record.id)}
      emptyMessage="No operator records yet. The first Platform Owner is created with the bootstrap script (docs/runbooks/ENVIRONMENTS_AND_DEPLOYMENT.md)."
      headerAction={canManage && <button onClick={() => setGranting(true)} className="inline-flex h-11 items-center gap-2 rounded-xl bg-indigo-500 px-4 text-sm font-semibold text-white hover:bg-indigo-400"><UserPlus className="h-4 w-4" />Grant access</button>}
    >
      {!canManage && <div className="mt-5"><InfoNote>Read-only: only a Platform Owner can change operator access.</InfoNote></div>}
    </GovernanceModulePage>
    {granting && <GrantDrawer onClose={() => setGranting(false)} onRefresh={refresh} />}
    {selectedId && <OperatorDrawer record={selected} onRefresh={refresh} onClose={() => setSelectedId(null)} />}
  </>;
}

const GRANTS: { role: OperatorRole; label: string; variant: PrivilegedAction["variant"]; consequence: string }[] = [
  { role: "super-admin", label: "Grant Super Admin", variant: "primary", consequence: "Gives full governance access: approvals, refunds, settlements, commercials, cancellations and moderation. Cannot manage operator access." },
  { role: "auditor", label: "Grant Auditor (read-only)", variant: "secondary", consequence: "Gives read-only access to the audit trail and settlements. No actions." },
  { role: "platform-owner", label: "Grant Platform Owner", variant: "danger", consequence: "Gives full governance access AND the ability to grant, suspend and disable every operator, including other Platform Owners." },
];

function GrantDrawer({ onClose, onRefresh }: { onClose: () => void; onRefresh: () => void }) {
  const { user } = useAdminSession();
  const actions: PrivilegedAction[] = GRANTS.map((grant) => ({
    key: `grant-${grant.role}`,
    label: grant.label,
    variant: grant.variant,
    reasonMin: 10,
    confirmPhrase: grant.role === "platform-owner" ? CONFIRM_PHRASES.grantPlatformOwner : undefined,
    consequence: `${grant.consequence} ${APPLY_NOTE}`,
    inputs: [{ key: "uid", label: "Firebase Auth UID", placeholder: "Copy from Firebase Console → Authentication", hint: "The account must already exist in Firebase Auth. It must verify its email before it can sign in." }],
    execute: async ({ reason, inputs }) => {
      const result = await setOperatorAccess({ uid: inputs.uid ?? "", roleId: grant.role, status: "active", reason, actorUid: user?.uid });
      return { message: `${result.uid} is now ${ROLE_LABEL[grant.role]} (${result.status}). ${APPLY_NOTE}` };
    },
  }));
  return (
    <Drawer label="Grant operator access" eyebrow="Control · operator access" title="Grant access" subtitle="setOperatorAccess (Platform Owner only)" onClose={onClose}>
      <ActionPanel actions={actions} commandPrefix="access" onRefresh={onRefresh} capability="access.manage" />
    </Drawer>
  );
}

function OperatorDrawer({ record, onClose, onRefresh }: { record: LiveGovernanceRecord | null; onClose: () => void; onRefresh: () => void }) {
  const { user } = useAdminSession();
  if (!record) return <Drawer label="Operator unavailable" eyebrow="Operator" title="Operator unavailable" onClose={onClose}><InfoNote tone="warn">This operator is no longer in the live list.</InfoNote></Drawer>;
  const raw = record.raw;
  const currentRole = toConsoleRole(raw.roleId);
  const status = (typeof raw.status === "string" ? raw.status : "active") as OperatorStatus;
  const self = !!user && user.uid === record.id;

  const change = (key: string, label: string, variant: PrivilegedAction["variant"], roleId: OperatorRole | null, next: OperatorStatus, consequence: string, confirmPhrase?: string, disabledReason?: string | null): PrivilegedAction => ({
    key,
    label,
    variant,
    reasonMin: 10,
    confirmPhrase,
    consequence: `${consequence} ${APPLY_NOTE}`,
    disabledReason: disabledReason ?? (!roleId ? "The current role is not a console role; grant a role first." : null),
    execute: async ({ reason }) => {
      const result = await setOperatorAccess({ uid: record.id, roleId: roleId ?? "", status: next, reason, actorUid: user?.uid });
      return { message: `Access updated: ${ROLE_LABEL[result.roleId as OperatorRole] ?? result.roleId}, ${result.status}. ${APPLY_NOTE}` };
    },
  });

  const selfRole = self ? "Ask another Platform Owner to change your own role (prevents locking yourself out)." : null;
  const selfStatus = self ? "You cannot suspend or disable your own account." : null;
  const actions: PrivilegedAction[] = [
    ...GRANTS.map((grant) => change(`role-${grant.role}`, `Make ${ROLE_LABEL[grant.role]}`, grant.variant, grant.role, "active", grant.consequence,
      grant.role === "platform-owner" ? CONFIRM_PHRASES.grantPlatformOwner : undefined,
      selfRole ?? (currentRole === grant.role && status === "active" ? `Already an active ${ROLE_LABEL[grant.role]}.` : null))),
    change("suspend", "Suspend", "warn", currentRole, "suspended", "Blocks console access and revokes current sessions. Reversible with Reactivate.", CONFIRM_PHRASES.suspendOperator, selfStatus ?? (status === "suspended" ? "Already suspended." : null)),
    change("disable", "Disable", "danger", currentRole, "disabled", "Disables console access and revokes current sessions (for leavers).", CONFIRM_PHRASES.disableOperator, selfStatus ?? (status === "disabled" ? "Already disabled." : null)),
    change("reactivate", "Reactivate", "primary", currentRole, "active", "Restores console access with the current role.", undefined, status === "active" ? "Already active." : null),
  ];

  return (
    <Drawer label={`Operator ${record.primary}`} eyebrow={`Operator · ${record.id}`} title={record.primary} subtitle={`${currentRole ? ROLE_LABEL[currentRole] : text(raw, "roleId")} · ${status}${self ? " · you" : ""}`} onClose={onClose}>
      <FieldList fields={[
        { label: "UID", value: record.id },
        { label: "Email", value: text(raw, "email") },
        { label: "Role", value: currentRole ? ROLE_LABEL[currentRole] : text(raw, "roleId") },
        { label: "Status", value: status },
        { label: "Updated", value: formatDateTime(raw.updatedAt) },
        { label: "Updated by", value: text(raw, "updatedBy") },
        { label: "Created by", value: text(raw, "createdBy") },
      ]} />
      <ActionPanel actions={actions} commandPrefix="access" onRefresh={onRefresh} capability="access.manage" />
    </Drawer>
  );
}
