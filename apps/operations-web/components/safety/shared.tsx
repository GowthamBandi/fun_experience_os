"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Clock, Info } from "lucide-react";
import { useStore, type CommandOutcome } from "@/lib/store";
import { safetyGate, type SafetyAction } from "@/lib/safety/access";
import { tournamentGate, type TournamentAction } from "@/lib/tournaments/access";
import type { IncidentSlaState } from "@/lib/prototype/selectors/safety";
import { Button, Badge } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlays";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/format";

/* ------------------------------ permissions ------------------------------ */

export type Gate = { allowed: boolean; reason?: string };

/** Safety matrix gate for the signed-in operator, optionally scoped to a record's territory. */
export function useSafetyGate() {
  const { role, operator } = useStore();
  return useCallback(
    (action: SafetyAction, recordTerritoryId?: string): Gate => safetyGate(role.id, action, { operatorTerritoryId: operator?.territoryId, recordTerritoryId }),
    [role.id, operator?.territoryId],
  );
}

export function useTournamentGate() {
  const { role, operator } = useStore();
  return useCallback(
    (action: TournamentAction, tournamentTerritoryId?: string): Gate =>
      tournamentGate(role.id, action, { operatorTerritoryId: operator?.territoryId, tournamentTerritoryId }),
    [role.id, operator?.territoryId],
  );
}

/** A button that is disabled with an explanation when the operator's role can't take the action. */
export function GatedButton({ gate, children, className, ...rest }: { gate: Gate; children: ReactNode } & React.ComponentProps<typeof Button>) {
  if (gate.allowed)
    return (
      <Button className={className} {...rest}>
        {children}
      </Button>
    );
  return (
    <span title={gate.reason} className="inline-flex cursor-not-allowed">
      <Button {...rest} className={className} disabled aria-disabled="true" aria-describedby={undefined}>
        {children}
      </Button>
      <span className="sr-only">{gate.reason}</span>
    </span>
  );
}

/** Shown under an action group when the operator can view but not act. */
export function PermissionNote({ reason }: { reason?: string }) {
  if (!reason) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      {reason}
    </p>
  );
}

/* -------------------------------- visuals -------------------------------- */

const SEVERITY_STYLE: Record<string, string> = {
  critical: "bg-red-600 text-white border-red-600",
  high: "bg-orange-50 text-orange-700 border-orange-200",
  medium: "bg-amber-50 text-amber-700 border-amber-200",
  low: "bg-slate-100 text-slate-600 border-slate-200",
};

export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  return (
    <Badge className={cn("border font-semibold capitalize", SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.low, className)}>
      {severity === "critical" && <AlertTriangle className="h-3 w-3" />}
      {severity}
    </Badge>
  );
}

/** Left accent colour for list rows by severity. */
export const SEVERITY_BAR: Record<string, string> = {
  critical: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-amber-300",
  low: "bg-slate-300",
};

export function SlaChip({ sla }: { sla: IncidentSlaState }) {
  if (sla.phase === "unknown") return <span className="text-xs text-ink-mut">—</span>;
  const tone = sla.overdue
    ? "border-red-200 bg-red-50 text-red-700"
    : sla.phase === "met"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : "border-sky-200 bg-sky-50 text-sky-700";
  return (
    <Badge className={cn("border whitespace-nowrap", tone)}>
      <Clock className="h-3 w-3" />
      {sla.label}
    </Badge>
  );
}

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 py-2 text-sm">
      <dt className="text-ink-mut">{label}</dt>
      <dd className="min-w-0 break-words text-ink-lum">{children}</dd>
    </div>
  );
}

export function DrawerSection({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-t border-edge pt-4 first:border-0 first:pt-0">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="eyebrow">{title}</h3>
        {right}
      </div>
      {children}
    </section>
  );
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn("field min-h-[92px] w-full rounded-xl px-3.5 py-2.5 text-sm text-ink-lum placeholder:text-slate-400", props.className)}
    />
  );
}

/* -------------------------------- dialogs -------------------------------- */

/**
 * A dialog whose submit runs a store command. Refusals stay in the dialog as
 * an inline error; success closes it and shows a toast.
 */
export function CommandDialog({
  open,
  onClose,
  title,
  children,
  confirmLabel,
  variant = "primary",
  canSubmit = true,
  onSubmit,
  success,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  variant?: "primary" | "danger" | "success" | "warning";
  canSubmit?: boolean;
  onSubmit: () => CommandOutcome | void;
  success: string | ((r: CommandOutcome) => string);
  wide?: boolean;
}) {
  const toast = useToast();
  const [error, setError] = useState<string | undefined>();
  useEffect(() => {
    if (open) setError(undefined);
  }, [open]);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const r = onSubmit() ?? {};
    if (r.error) {
      setError(r.error);
      return;
    }
    toast.success(typeof success === "function" ? success(r) : success);
    onClose();
  }
  return (
    <Dialog open={open} onClose={onClose} title={title} wide={wide}>
      <form onSubmit={submit} className="space-y-4">
        {children}
        {error && (
          <p role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant={variant} disabled={!canSubmit}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** Required-reason dialog: the reason is validated for length before the command runs. */
export function ReasonDialog({
  open,
  onClose,
  title,
  consequence,
  label = "Reason",
  placeholder,
  minLength = 10,
  confirmLabel,
  variant = "primary",
  success,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  consequence?: ReactNode;
  label?: string;
  placeholder?: string;
  minLength?: number;
  confirmLabel: string;
  variant?: "primary" | "danger" | "success" | "warning";
  success: string;
  onSubmit: (reason: string) => CommandOutcome | void;
}) {
  const [reason, setReason] = useState("");
  useEffect(() => {
    if (open) setReason("");
  }, [open]);
  const short = reason.trim().length < minLength;
  return (
    <CommandDialog
      open={open}
      onClose={onClose}
      title={title}
      confirmLabel={confirmLabel}
      variant={variant}
      canSubmit={!short}
      success={success}
      onSubmit={() => onSubmit(reason.trim())}
    >
      {consequence && <div className="text-sm leading-6 text-ink-sec">{consequence}</div>}
      <label className="block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">{label}</span>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} placeholder={placeholder} required autoFocus />
        <span className={cn("mt-1.5 block text-xs", short ? "text-ink-mut" : "text-emerald-700")}>
          {short ? `At least ${minLength} characters (${reason.trim().length}/${minLength}).` : "Recorded in the audit trail with your name."}
        </span>
      </label>
    </CommandDialog>
  );
}

/** Segmented tab bar used by the Safety and Tournament pages. */
export function TabBar<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: string; icon?: React.ComponentType<{ className?: string }>; count?: number }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-edge p-2" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors",
            value === t.id ? "bg-brand-subtle text-brand-ink" : "text-ink-mut hover:bg-slate-50 hover:text-ink-lum",
          )}
        >
          {t.icon && <t.icon className="h-4 w-4" />}
          {t.label}
          {typeof t.count === "number" && t.count > 0 && (
            <span
              className={cn("rounded-full px-1.5 py-0.5 text-[11px] leading-none", value === t.id ? "bg-white text-brand-ink" : "bg-slate-100 text-ink-sec")}
            >
              {t.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
