"use client";

import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/format";
import { RequestIdBook, isConfirmed } from "@/lib/console/actions";
import { mapConsoleError, type ConsoleError } from "@/lib/console/errors";
import type { KeyField } from "@/lib/console/records";

/* ------------------------------------------------------------ drawer */

export function Drawer({ label, eyebrow, title, subtitle, onClose, children, footer }: {
  label: string;
  eyebrow: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/65" role="dialog" aria-modal="true" aria-label={label}>
      <button className="absolute inset-0" onClick={onClose} aria-label="Close" />
      <section className="relative flex h-full w-full max-w-xl flex-col border-l border-white/10 bg-[#0e1621]">
        <header className="flex items-start justify-between gap-4 border-b border-white/8 p-6">
          <div className="min-w-0">
            <p className="overline break-all">{eyebrow}</p>
            <h2 className="mt-1 text-xl font-semibold text-white">{title}</h2>
            {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white" aria-label="Close panel"><X className="h-5 w-5" /></button>
        </header>
        <div className="flex-1 space-y-5 overflow-y-auto p-6">{children}</div>
        {footer && <footer className="flex flex-wrap items-center gap-2 border-t border-white/8 p-4">{footer}</footer>}
      </section>
    </div>
  );
}

export function Modal({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 p-4" role="alertdialog" aria-modal="true" aria-label={label}>
      <section className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#0e1621] p-6 shadow-2xl">{children}</section>
    </div>
  );
}

/* ------------------------------------------------------------ fields */

export function FieldList({ fields, empty = "No details available." }: { fields: KeyField[]; empty?: string }) {
  if (!fields.length) return <p className="text-xs text-slate-500">{empty}</p>;
  return (
    <dl className="divide-y divide-white/8 rounded-xl border border-white/8 bg-[#111b28] px-4">
      {fields.map((field) => (
        <div key={field.label} className="grid grid-cols-[10rem_1fr] gap-3 py-3 text-xs">
          <dt className="text-slate-500">{field.label}</dt>
          <dd className="break-words text-slate-200">{field.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Up to `max` primitive fields from a raw document (fallback detail view). */
export function rawFields(raw: Record<string, unknown>, max = 12): KeyField[] {
  return Object.entries(raw)
    .filter(([, value]) => typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    .slice(0, max)
    .map(([key, value]) => ({ label: key.replace(/([A-Z])/g, " $1"), value: String(value) }));
}

export function ReasonField({ value, onChange, label = "Reason (recorded in the audit trail)", min = 10, placeholder = "Record the evidence, policy and reason…" }: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  min?: number;
  placeholder?: string;
}) {
  const length = value.trim().length;
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-white/10 bg-[#0a111a] p-3 text-sm text-white outline-none focus:border-indigo-400/60" placeholder={placeholder} />
      <span className={cn("mt-1 block text-[11px]", length >= min ? "text-slate-500" : "text-amber-300/80")}>{length >= min ? `${length} characters` : `At least ${min} characters (${length}/${min})`}</span>
    </label>
  );
}

export function TextField({ label, value, onChange, type = "text", placeholder, hint }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-200">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="mt-2 h-11 w-full rounded-xl border border-white/10 bg-[#0a111a] px-3 text-sm text-white outline-none focus:border-indigo-400/60" />
      {hint && <span className="mt-1 block text-[11px] text-slate-500">{hint}</span>}
    </label>
  );
}

/** Explicit typed confirmation for high-risk actions. */
export function TypedConfirmation({ phrase, value, onChange, consequence }: { phrase: string; value: string; onChange: (value: string) => void; consequence: string }) {
  const ok = isConfirmed(value, phrase);
  return (
    <div className="rounded-xl border border-red-400/25 bg-red-400/5 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-red-200"><ShieldAlert className="h-4 w-4" />High-risk action</p>
      <p className="mt-1 text-xs leading-5 text-red-100/80">{consequence}</p>
      <label className="mt-3 block">
        <span className="text-xs text-slate-300">Type <code className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-red-100">{phrase}</code> to confirm</span>
        <input value={value} onChange={(event) => onChange(event.target.value)} autoComplete="off" spellCheck={false} aria-label={`Type ${phrase} to confirm`} className={cn("mt-2 h-10 w-full rounded-lg border bg-[#0a111a] px-3 font-mono text-sm text-white outline-none", ok ? "border-emerald-400/40" : "border-white/10 focus:border-red-400/50")} />
      </label>
    </div>
  );
}

/* ------------------------------------------------------ status notes */

export function ActionError({ error, onRefresh }: { error: ConsoleError; onRefresh?: () => void }) {
  const conflict = error.kind === "conflict";
  const dual = error.kind === "dual-control";
  return (
    <div role="alert" className={cn("rounded-xl border p-4 text-sm", dual ? "border-amber-400/25 bg-amber-400/5 text-amber-100" : "border-red-400/25 bg-red-400/5 text-red-100")}>
      <p className="flex items-start gap-2 font-medium"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /><span>{conflict ? "Someone else changed this — refresh" : dual ? "Dual control: a different admin is required" : "The action was not completed"}</span></p>
      <p className="mt-1 pl-6 text-xs leading-5 opacity-90">{error.message}</p>
      {error.nextStep && <p className="mt-1 pl-6 text-xs leading-5 opacity-75">{error.nextStep}</p>}
      {conflict && onRefresh && <button onClick={onRefresh} className="ml-6 mt-3 inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 px-3 text-xs font-semibold text-white hover:bg-white/5"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>}
    </div>
  );
}

export function SuccessNote({ children }: { children: ReactNode }) {
  return <div role="status" className="flex items-start gap-2 rounded-xl border border-emerald-400/25 bg-emerald-400/5 p-4 text-sm text-emerald-100"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /><div>{children}</div></div>;
}

export function InfoNote({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "warn" }) {
  return <div className={cn("rounded-xl border p-4 text-xs leading-5", tone === "warn" ? "border-amber-400/25 bg-amber-400/5 text-amber-100" : "border-indigo-400/20 bg-indigo-400/5 text-indigo-100")}>{children}</div>;
}

export function ActionButton({ children, onClick, disabled, variant = "secondary", className }: { children: ReactNode; onClick: () => void; disabled?: boolean; variant?: "primary" | "secondary" | "danger" | "warn"; className?: string }) {
  const styles = {
    primary: "bg-indigo-500 font-semibold text-white hover:bg-indigo-400",
    secondary: "border border-white/10 text-slate-200 hover:bg-white/5",
    danger: "border border-red-400/30 text-red-300 hover:bg-red-400/10",
    warn: "border border-amber-400/30 text-amber-300 hover:bg-amber-400/10",
  }[variant];
  return <button type="button" onClick={onClick} disabled={disabled} className={cn("h-10 rounded-xl px-4 text-sm transition disabled:cursor-not-allowed disabled:opacity-40", styles, className)}>{children}</button>;
}

/* -------------------------------------------------------- command hook */

/**
 * Runs a privileged command with: a stable requestId per intended action
 * (retries replay instead of duplicating), a single in-flight guard, and
 * mapped operator-facing errors.
 */
export function useCommand(prefix: string) {
  const book = useRef(new RequestIdBook(prefix));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ConsoleError | null>(null);
  const inFlight = useRef(false);

  const run = useCallback(async <T,>(action: string, fn: (requestId: string) => Promise<T>): Promise<T | null> => {
    if (inFlight.current) return null;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await fn(book.current.idFor(action));
      book.current.reset();
      return result;
    } catch (cause) {
      const mapped = mapConsoleError(cause);
      // A definitive server answer (conflict, validation, refusal) ends this attempt;
      // only transport failures keep the requestId so a retry is replayed safely.
      if (mapped.kind !== "unavailable" && mapped.kind !== "unknown") book.current.reset();
      setError(mapped);
      return null;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, []);

  const clear = useCallback(() => { setError(null); book.current.reset(); }, []);
  return useMemo(() => ({ run, busy, error, clear, setError }), [run, busy, error, clear]);
}
