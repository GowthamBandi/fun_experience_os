"use client";

import { useState, type ReactNode } from "react";
import { isConfirmed } from "@/lib/console/actions";
import { ActionButton, ActionError, InfoNote, ReasonField, SuccessNote, TextField, TypedConfirmation, useCommand } from "./controls";
import { OrganizerCodeModal } from "./OrganizerCodeModal";
import { useAdminSession } from "@/lib/firebase/auth";
import { ROLE_LABEL, can, type Capability } from "@/lib/console/capabilities";

export interface ActionOutcome {
  message: ReactNode;
  tone?: "success" | "info";
  organizerCode?: { code: string; orgId?: string | null; expiresAt?: string | null; subject: string };
}

export interface ActionInput {
  key: string;
  label: string;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  type?: "text" | "date";
}

export interface PrivilegedAction {
  key: string;
  label: string;
  variant?: "primary" | "secondary" | "danger" | "warn";
  /** Minimum reason length; 0 means the reason is optional. */
  reasonMin: number;
  reasonLabel?: string;
  /** For commands whose server contract takes no reason. */
  hideReason?: boolean;
  /** When set, the operator must type this phrase (high-risk actions). */
  confirmPhrase?: string;
  /** Plain-language consequence shown in the confirmation step. */
  consequence: string;
  inputs?: ActionInput[];
  disabledReason?: string | null;
  execute: (ctx: { requestId: string; reason: string; inputs: Record<string, string> }) => Promise<ActionOutcome>;
}

/**
 * Two-step privileged action flow: choose an action → confirm (reason, typed
 * phrase for high-risk actions) → server callable with an idempotent
 * requestId. The server writes the audit record.
 */
export function ActionPanel({ actions, commandPrefix, onRefresh, emptyMessage, capability = "governance.decide" }: {
  actions: PrivilegedAction[];
  commandPrefix: string;
  onRefresh?: () => void;
  emptyMessage?: string;
  /** Capability the backing callable requires (lib/console/capabilities). Roles without it see a read-only note. */
  capability?: Capability;
}) {
  const { consoleRole } = useAdminSession();
  const permitted = can(consoleRole, capability);
  const command = useCommand(commandPrefix);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [outcome, setOutcome] = useState<ActionOutcome | null>(null);
  const [codeOpen, setCodeOpen] = useState<ActionOutcome["organizerCode"] | null>(null);

  const selected = actions.find((action) => action.key === selectedKey) ?? null;

  function choose(key: string | null) {
    setSelectedKey(key);
    setReason("");
    setTyped("");
    setInputs({});
    setOutcome(null);
    command.clear();
  }

  const missingInput = selected?.inputs?.some((input) => input.required !== false && !(inputs[input.key] ?? "").trim()) ?? false;
  const ready = !!selected
    && reason.trim().length >= selected.reasonMin
    && (!selected.confirmPhrase || isConfirmed(typed, selected.confirmPhrase))
    && !missingInput;

  async function confirm() {
    if (!selected || !ready) return;
    const result = await command.run(selected.key, (requestId) => selected.execute({ requestId, reason: reason.trim(), inputs }));
    if (result) {
      // Never keep the one-time code anywhere but the modal's own props.
      setOutcome({ message: result.message, tone: result.tone });
      setSelectedKey(null);
      setReason("");
      setTyped("");
      setInputs({});
      if (result.organizerCode) setCodeOpen(result.organizerCode);
    }
  }

  function refresh() {
    command.clear();
    choose(null);
    onRefresh?.();
  }

  const available = actions.filter((action) => !action.disabledReason);

  if (!permitted) {
    return (
      <InfoNote>
        <span data-testid="actions-read-only">Read-only for your role ({consoleRole ? ROLE_LABEL[consoleRole] : "no console role"}). {capability === "access.manage" ? "Only a Platform Owner can change operator access." : "Only a Platform Owner or Super Admin can act on this record."} The server enforces the same rule.</span>
      </InfoNote>
    );
  }

  return (
    <div className="space-y-4">
      {outcome && (outcome.tone === "info" ? <InfoNote tone="warn">{outcome.message}</InfoNote> : <SuccessNote>{outcome.message}</SuccessNote>)}
      {command.error && <ActionError error={command.error} onRefresh={refresh} />}

      {!selected && (
        <div>
          <p className="text-sm font-medium text-slate-200">Governance actions</p>
          {available.length === 0 ? (
            <p className="mt-2 text-xs text-slate-500">{emptyMessage ?? "No actions are available for this record in its current state."}</p>
          ) : (
            <div className="mt-3 flex flex-wrap gap-2">
              {available.map((action) => <ActionButton key={action.key} variant={action.variant ?? "secondary"} onClick={() => choose(action.key)}>{action.label}</ActionButton>)}
            </div>
          )}
          {actions.filter((action) => action.disabledReason).map((action) => <p key={action.key} className="mt-2 text-[11px] text-slate-500">{action.label}: {action.disabledReason}</p>)}
        </div>
      )}

      {selected && (
        <div className="space-y-4 rounded-2xl border border-white/10 bg-[#0b131d] p-4">
          <div>
            <p className="text-sm font-semibold text-white">Confirm: {selected.label}</p>
            {!selected.confirmPhrase && <p className="mt-1 text-xs leading-5 text-slate-400">{selected.consequence}</p>}
          </div>
          {selected.inputs?.map((input) => (
            <TextField key={input.key} type={input.type ?? "text"} label={input.label} placeholder={input.placeholder} hint={input.hint} value={inputs[input.key] ?? ""} onChange={(value) => setInputs((prev) => ({ ...prev, [input.key]: value }))} />
          ))}
          {!selected.hideReason && <ReasonField value={reason} onChange={setReason} min={selected.reasonMin} label={selected.reasonLabel ?? (selected.reasonMin > 0 ? "Reason (required, recorded in the audit trail)" : "Note (optional, recorded in the audit trail)")} />}
          {selected.confirmPhrase && <TypedConfirmation phrase={selected.confirmPhrase} value={typed} onChange={setTyped} consequence={selected.consequence} />}
          <div className="flex flex-wrap justify-end gap-2">
            <ActionButton onClick={() => choose(null)} disabled={command.busy}>Back</ActionButton>
            <ActionButton variant={selected.variant === "danger" ? "danger" : "primary"} onClick={confirm} disabled={!ready || command.busy}>{command.busy ? "Submitting…" : `Confirm ${selected.label.toLowerCase()}`}</ActionButton>
          </div>
        </div>
      )}

      {codeOpen && <OrganizerCodeModal code={codeOpen.code} orgId={codeOpen.orgId} expiresAt={codeOpen.expiresAt} subject={codeOpen.subject} onClose={() => setCodeOpen(null)} />}
    </div>
  );
}
