"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Circle, CircleAlert, History, ShieldCheck, X } from "lucide-react";
import { GovernanceModulePage, GovernanceStatus, relativeTime } from "./GovernanceModulePage";
import { useGovernanceActions, useGovernanceCollection } from "@/lib/use-governance";
import type { GovernanceCollection, LiveGovernanceRecord } from "@/lib/governance-api";
import {
  CASE_KIND_LABEL,
  OPEN_CASE_STATUSES,
  allowedEntityTransitions,
  type GovernanceEntityStatus,
  type GovernanceEntityType,
  type GovernanceOutcome,
  type IntakeInput,
  type IntakeKind,
} from "@/lib/prototype/governance/commands";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/format";
import { PermissionDenied } from "@/components/ui/panels";

export interface GovernanceRouteConfig {
  href: string;
  collection: GovernanceCollection;
  eyebrow: string;
  title: string;
  description: string;
  metricLabel: string;
  primaryAction: string;
  entityType?: GovernanceEntityType;
  readOnly?: boolean;
  intake?: IntakeKind;
  intakeLabel?: string;
  icon?: ReactNode;
}

const OWNERS = ["platform-owner", "super-admin"];
const FINANCE_CASES = ["refund-exception", "settlement-release", "commission-proposal"];

/** Who may take governance decisions. Reading is governed by the route policy in lib/nav.ts. */
export function canDecide(roleId: string, subject: { caseKind?: string; entityType?: GovernanceEntityType }): boolean {
  if (OWNERS.includes(roleId)) return true;
  if (roleId === "finance" && subject.caseKind && FINANCE_CASES.includes(subject.caseKind)) return true;
  if (roleId === "safety" && (subject.entityType === "risk-alert" || subject.caseKind === "fraud-alert")) return true;
  return false;
}

const STATUS_ACTION: Record<GovernanceEntityStatus, { label: string; variant: "primary" | "secondary" | "danger" | "warning" | "success" }> = {
  active: { label: "Activate", variant: "success" },
  paused: { label: "Pause", variant: "warning" },
  blocked: { label: "Block", variant: "danger" },
  "under-review": { label: "Send to review", variant: "secondary" },
  resolved: { label: "Resolve", variant: "success" },
};

const HIDDEN_FIELDS = new Set(["checks", "decision", "version", "createdAt", "updatedAt", "schemaVersion", "before", "after"]);

function labelOf(key: string) {
  const spaced = key.replace(/([A-Z])/g, " $1").replace(/Minor$/, "").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function valueOf(key: string, value: unknown): string {
  if (typeof value === "number" && key.endsWith("Minor")) {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value / 100);
  }
  if (typeof value === "number" && key === "commissionBps") return `${(value / 100).toFixed(2).replace(/\.00$/, "")}%`;
  if (key === "kind" && typeof value === "string") return CASE_KIND_LABEL[value] ?? value;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Date(value).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  if (typeof value === "string") return value.replace(/-/g, value.includes(" ") ? "-" : " ");
  return String(value);
}

export function GovernanceRoutePage({ config }: { config: GovernanceRouteConfig }) {
  const { canAccess } = useStore();
  const { records, loading, error } = useGovernanceCollection(config.collection);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const { role } = useStore();
  const selected = records.find((r) => r.id === selectedId) ?? null;

  if (!canAccess(config.href)) return <PermissionDenied module={config.title} />;

  const mayCreate = !!config.intake && OWNERS.includes(role.id);

  return (
    <>
      <GovernanceModulePage
        {...config}
        records={records}
        loading={loading}
        error={error}
        onAction={(r) => setSelectedId(r.id)}
        onCreate={mayCreate ? () => setIntakeOpen(true) : undefined}
        createLabel={config.intakeLabel}
      />
      {selected && <RecordReviewDrawer record={selected} config={config} onClose={() => setSelectedId(null)} />}
      {config.intake && <IntakeDialog open={intakeOpen} kind={config.intake} title={config.intakeLabel ?? "New record"} onClose={() => setIntakeOpen(false)} />}
    </>
  );
}

function RecordReviewDrawer({ record, config, onClose }: { record: LiveGovernanceRecord; config: GovernanceRouteConfig; onClose: () => void }) {
  const { role } = useStore();
  const { decide, setStatus } = useGovernanceActions();
  const audit = useGovernanceCollection("auditEvents");
  const toast = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCase = config.collection === "governanceCases";
  const caseKind = isCase ? String(record.raw.kind ?? "") : undefined;
  const open = isCase ? OPEN_CASE_STATUSES.includes(record.statusValue) : false;
  const transitions = !isCase && config.entityType ? allowedEntityTransitions(config.entityType, record.statusValue) : [];
  const permitted = canDecide(role.id, { caseKind, entityType: config.entityType });
  const writable = !config.readOnly && permitted && (isCase ? open : transitions.length > 0);

  const history = useMemo(
    () =>
      audit.records.filter((a) => {
        const target = String(a.raw.entityId ?? "");
        return target === record.id || (typeof record.raw.targetId === "string" && target === record.raw.targetId);
      }),
    [audit.records, record.id, record.raw.targetId],
  );

  const checks = Array.isArray(record.raw.checks) ? (record.raw.checks as Array<{ label: string; status: string }>) : [];
  const decision = record.raw.decision as { outcome?: string; note?: string; actorName?: string; decidedAt?: string } | undefined;
  const fields = Object.entries(record.raw).filter(([k, v]) => !HIDDEN_FIELDS.has(k) && v !== null && v !== undefined && v !== "" && typeof v !== "object");

  async function run(fn: () => Promise<{ error?: string }>, success: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await fn();
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success(success, `${record.primary} · recorded in the audit trail`);
    onClose();
  }

  const doDecide = (outcome: GovernanceOutcome) => {
    if (outcome !== "approved" && note.trim().length < 10) {
      setError("Add a reason of at least 10 characters.");
      return;
    }
    void run(() => decide(record.id, record.version, outcome, note), outcome === "approved" ? "Approved" : outcome === "rejected" ? "Rejected" : "Information requested");
  };
  const doStatus = (status: GovernanceEntityStatus) => {
    if (note.trim().length < 10) {
      setError("Add a reason of at least 10 characters.");
      return;
    }
    void run(() => setStatus(config.entityType!, record.id, record.version, status, note), `Status changed to ${status.replace(/-/g, " ")}`);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Review ${record.primary}`}>
      <button className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]" onClick={onClose} aria-label="Close review" />
      <section className="relative flex h-full w-full max-w-xl flex-col border-l border-edge bg-white shadow-glass">
        <header className="border-b border-edge bg-gradient-to-br from-brand-subtle/70 via-white to-white p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="eyebrow text-brand">
                {isCase ? CASE_KIND_LABEL[caseKind ?? ""] ?? "Case" : config.title} · <span className="font-mono normal-case tracking-normal">{record.id}</span>
              </p>
              <h2 className="mt-1 font-display text-xl font-bold text-ink-lum">{record.primary}</h2>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-mut">
                <GovernanceStatus status={record.status} />
                <span>Version {record.version}</span>
                <span>· Updated {relativeTime(record.updatedAt)}</span>
              </div>
            </div>
            <button onClick={onClose} className="rounded-lg p-1.5 text-ink-mut hover:bg-slate-100 hover:text-ink-lum" aria-label="Close">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {checks.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-ink-lum">Verification checks</h3>
              <ul className="mt-3 space-y-2">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-center gap-3 rounded-xl border border-edge bg-bg-sunken px-3 py-2.5 text-sm">
                    {c.status === "passed" ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    ) : c.status === "flagged" ? (
                      <CircleAlert className="h-4 w-4 text-red-600" />
                    ) : (
                      <Circle className="h-4 w-4 text-amber-500" />
                    )}
                    <span className="flex-1 text-ink-sec">{c.label}</span>
                    <span className={cn("text-xs font-semibold capitalize", c.status === "passed" ? "text-emerald-700" : c.status === "flagged" ? "text-red-700" : "text-amber-700")}>{c.status}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-ink-lum">Details</h3>
            <dl className="mt-3 divide-y divide-slate-100 rounded-xl border border-edge">
              {fields.map(([key, value]) => (
                <div key={key} className="grid grid-cols-[10rem_minmax(0,1fr)] gap-3 px-4 py-2.5 text-sm">
                  <dt className="text-ink-mut">{labelOf(key)}</dt>
                  <dd className="break-words font-medium text-ink-lum">{valueOf(key, value)}</dd>
                </div>
              ))}
            </dl>
          </section>

          {decision?.outcome && (
            <section className="rounded-xl border border-edge bg-bg-sunken p-4">
              <p className="text-sm font-semibold text-ink-lum">Decision recorded</p>
              <p className="mt-1 text-sm text-ink-sec">
                <span className="capitalize">{decision.outcome.replace(/-/g, " ")}</span> by {decision.actorName ?? "an administrator"}
                {decision.decidedAt ? ` · ${new Date(decision.decidedAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}` : ""}
              </p>
              {decision.note && <p className="mt-2 text-sm text-ink-mut">“{decision.note}”</p>}
            </section>
          )}

          <section>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-ink-lum">
              <History className="h-4 w-4 text-ink-mut" /> History
            </h3>
            {history.length === 0 ? (
              <p className="mt-2 text-sm text-ink-mut">No recorded actions yet.</p>
            ) : (
              <ol className="mt-3 space-y-3 border-l-2 border-brand-subtle pl-4">
                {history.map((h) => (
                  <li key={h.id} className="relative">
                    <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand ring-4 ring-white" />
                    <p className="text-sm font-medium text-ink-lum">{h.primary}</p>
                    <p className="text-xs text-ink-mut">
                      {String(h.raw.actorName ?? h.raw.actorUid ?? "System")} · {relativeTime(h.updatedAt)}
                      {typeof h.raw.summary === "string" ? ` · ${h.raw.summary}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {writable && (
            <label className="block">
              <span className="text-sm font-semibold text-ink-lum">Reason</span>
              <span className="ml-2 text-xs text-ink-mut">required except for approvals · kept in the audit trail</span>
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value)}
                className="field mt-2 min-h-28 w-full rounded-xl p-3 text-sm"
                placeholder="Record the evidence, policy and reason for this decision…"
                maxLength={2000}
              />
            </label>
          )}
          {!writable && !config.readOnly && (
            <p className="flex items-center gap-2 rounded-xl border border-edge bg-bg-sunken p-3 text-xs text-ink-mut">
              <ShieldCheck className="h-4 w-4" />
              {!permitted ? "Your role can view this record but cannot decide it." : isCase ? "This case is closed. Decisions are final and kept in the audit trail." : "No status changes are available from the current status."}
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <footer className="flex flex-wrap items-center gap-2 border-t border-edge bg-white p-4">
          {!writable ? (
            <Button variant="secondary" className="ml-auto" onClick={onClose}>
              Close
            </Button>
          ) : isCase ? (
            <>
              <Button variant="danger" disabled={busy} onClick={() => doDecide("rejected")}>
                Reject
              </Button>
              <Button variant="secondary" disabled={busy} onClick={() => doDecide("information-requested")}>
                Request information
              </Button>
              <Button className="ml-auto" disabled={busy} onClick={() => doDecide("approved")}>
                {busy ? "Saving…" : "Approve"}
              </Button>
            </>
          ) : (
            transitions.map((t, i) => (
              <Button key={t} variant={STATUS_ACTION[t].variant} disabled={busy} className={i === transitions.length - 1 ? "ml-auto" : undefined} onClick={() => doStatus(t)}>
                {STATUS_ACTION[t].label}
              </Button>
            ))
          )}
        </footer>
      </section>
    </div>
  );
}

const INTAKE_FIELDS: Record<IntakeKind, Array<{ key: keyof IntakeInput; label: string; type?: string; placeholder?: string; required?: boolean }>> = {
  organizer: [
    { key: "name", label: "Organizer / legal name", required: true, placeholder: "e.g. Sridhar Events" },
    { key: "location", label: "City, State", placeholder: "Rajahmundry, Andhra Pradesh" },
    { key: "contactEmail", label: "Contact email", type: "email", placeholder: "ops@organizer.in" },
    { key: "commissionPercent", label: "Proposed commission %", type: "number", placeholder: "12" },
    { key: "summary", label: "Notes for the reviewer", placeholder: "Documents received, context…" },
  ],
  arena: [
    { key: "name", label: "Arena name", required: true, placeholder: "e.g. Godavari Indoor Stadium" },
    { key: "organizerName", label: "Submitted by (organizer)" },
    { key: "location", label: "City, State" },
    { key: "capacity", label: "Declared capacity", type: "number", placeholder: "8000" },
    { key: "summary", label: "Evidence notes", placeholder: "Fire NOC, lease proof…" },
  ],
  event: [
    { key: "name", label: "Event name", required: true },
    { key: "organizerName", label: "Organizer" },
    { key: "location", label: "Arena / city" },
    { key: "projectedGmv", label: "Projected gross sales (₹)", type: "number" },
    { key: "summary", label: "Review notes" },
  ],
  commission: [
    { key: "name", label: "Agreement name", required: true, placeholder: "Organizer terms v2" },
    { key: "organizerName", label: "Organizer" },
    { key: "commissionPercent", label: "Commission %", type: "number", required: true },
    { key: "effectiveFrom", label: "Effective from", type: "date" },
    { key: "summary", label: "Justification" },
  ],
  policy: [
    { key: "name", label: "Policy name and version", required: true, placeholder: "Refund policy v4.2" },
    { key: "effectiveFrom", label: "Effective from", type: "date" },
    { key: "summary", label: "What changed", required: true },
  ],
};

function IntakeDialog({ open, kind, title, onClose }: { open: boolean; kind: IntakeKind; title: string; onClose: () => void }) {
  const { submitIntake } = useGovernanceActions();
  const toast = useToast();
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fields = INTAKE_FIELDS[kind];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const missing = fields.find((f) => f.required && !values[f.key as string]?.trim());
    if (missing) {
      setError(`${missing.label} is required.`);
      return;
    }
    const input: IntakeInput = { kind, name: values.name ?? "" };
    for (const f of fields) {
      const v = values[f.key as string]?.trim();
      if (!v || f.key === "name") continue;
      (input as unknown as Record<string, unknown>)[f.key] = f.type === "number" ? Number(v) : v;
    }
    setBusy(true);
    const result = await submitIntake(input);
    setBusy(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    toast.success(`${title} recorded`, kind === "policy" ? "Published to the policy register." : "A review case was opened in Approvals.");
    setValues({});
    setError(null);
    onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title={title} wide>
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <label key={f.key as string} className={cn("block", (f.key === "summary" || f.key === "name") && "sm:col-span-2")}>
              <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">
                {f.label}
                {f.required && <span className="text-red-500"> *</span>}
              </span>
              {f.key === "summary" ? (
                <textarea
                  className="field min-h-24 w-full rounded-xl p-3 text-sm"
                  value={values[f.key] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key as string]: e.target.value }))}
                />
              ) : (
                <input
                  className="field h-11 w-full rounded-xl px-3.5 text-sm"
                  type={f.type ?? "text"}
                  min={f.type === "number" ? 0 : undefined}
                  value={values[f.key as string] ?? ""}
                  placeholder={f.placeholder}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key as string]: e.target.value }))}
                />
              )}
            </label>
          ))}
        </div>
        {error && (
          <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
