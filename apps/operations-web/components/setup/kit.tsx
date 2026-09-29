"use client";

import Link from "next/link";
import { Fragment, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, Info, SearchX, XCircle } from "lucide-react";
import { cn } from "@/lib/format";
import { Button, StatusChip } from "@/components/ui/primitives";
import { Dialog } from "@/components/ui/overlays";

/** "1 city", "3 cities" */
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ----------------------------------------------------------------------------
 * Shared building blocks for the Setup, Catalog, Staffing and People pages.
 * Everything here is built on the daylight UI kit (components/ui/*).
 * ------------------------------------------------------------------------- */

/** Standard page container (matches the reference pages). */
export function PageShell({ children, narrow = false, className }: { children: ReactNode; narrow?: boolean; className?: string }) {
  return (
    <div className={cn("mx-auto w-full space-y-6 px-4 py-6 sm:px-5 sm:py-7 lg:px-8", narrow ? "max-w-4xl" : "max-w-[1440px]", className)}>
      {children}
    </div>
  );
}

const BTN_VARIANT = {
  primary: "bg-brand text-white shadow-brand hover:bg-brand-hover",
  secondary: "bg-white text-ink-lum border border-edge-strong shadow-lift hover:border-[#b9c0d3] hover:bg-bg-sunken",
  ghost: "text-ink-sec hover:text-ink-lum hover:bg-slate-100",
  lamp: "bg-brand-subtle text-brand-ink hover:bg-[#e3dfff]",
} as const;
const BTN_SIZE = { sm: "h-8 px-3 text-xs rounded-lg", md: "h-10 px-4 text-sm rounded-xl", lg: "h-12 px-5 text-sm rounded-xl" } as const;

/** A link that looks like a Button (never nest a <button> inside an <a>). */
export function LinkButton({
  href,
  children,
  variant = "primary",
  size = "md",
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: keyof typeof BTN_VARIANT;
  size?: keyof typeof BTN_SIZE;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-all duration-200 ease-light",
        "focus:outline-none focus-visible:ring-4 focus-visible:ring-brand/20",
        BTN_VARIANT[variant],
        BTN_SIZE[size],
        className,
      )}
    >
      {children}
    </Link>
  );
}

/** Breadcrumb trail for detail and create pages. */
export function Crumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs text-ink-mut">
      {items.map((it, i) => (
        <Fragment key={`${it.label}-${i}`}>
          {i > 0 && <ChevronRight className="h-3 w-3 text-slate-300" aria-hidden />}
          {it.href ? (
            <Link href={it.href} className="rounded px-1 py-0.5 font-medium transition-colors hover:bg-slate-100 hover:text-ink-lum">
              {it.label}
            </Link>
          ) : (
            <span className="max-w-[240px] truncate px-1 py-0.5 font-semibold text-ink-sec" aria-current="page">
              {it.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm font-medium text-ink-mut transition-colors hover:text-ink-lum">
      <ArrowLeft className="h-4 w-4" /> {label}
    </Link>
  );
}

/** White card with an optional header row. */
export function Panel({
  title,
  sub,
  right,
  children,
  className,
  bodyClassName,
  icon,
}: {
  title?: string;
  sub?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  icon?: ReactNode;
}) {
  return (
    <section className={cn("rounded-panel border border-edge bg-white shadow-panel", className)}>
      {(title || right) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-edge px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-brand">{icon}</span>}
            <div className="min-w-0">
              {title && <h2 className="font-display text-[15px] font-bold text-ink-lum">{title}</h2>}
              {sub && <p className="mt-0.5 text-[13px] leading-5 text-ink-mut">{sub}</p>}
            </div>
          </div>
          {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/** Label/value rows for detail panels. */
export function DetailList({ rows, className }: { rows: Array<{ label: string; value: ReactNode }>; className?: string }) {
  return (
    <dl className={cn("divide-y divide-slate-100", className)}>
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col gap-0.5 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <dt className="shrink-0 text-[13px] text-ink-mut">{r.label}</dt>
          <dd className="min-w-0 break-words text-sm font-medium text-ink-lum sm:text-right">{r.value === "" || r.value === undefined || r.value === null ? <span className="font-normal text-ink-mut">Not recorded</span> : r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const NOTICE = {
  info: { box: "border-indigo-200 bg-indigo-50 text-indigo-800", icon: Info },
  warn: { box: "border-amber-200 bg-amber-50 text-amber-800", icon: AlertTriangle },
  danger: { box: "border-red-200 bg-red-50 text-red-800", icon: XCircle },
  ok: { box: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: CheckCircle2 },
} as const;

/** Inline notice for warnings, refusals and confirmations. */
export function Notice({ tone = "info", title, children, action, className }: { tone?: keyof typeof NOTICE; title?: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  const t = NOTICE[tone];
  const Icon = t.icon;
  return (
    <div role={tone === "danger" ? "alert" : undefined} className={cn("flex flex-col gap-3 rounded-2xl border px-4 py-3 sm:flex-row sm:items-center", t.box, className)}>
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <div className="min-w-0 text-sm leading-6">
          {title && <p className="font-semibold">{title}</p>}
          {children && <div className={cn(title && "opacity-90")}>{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Friendly card for an unknown id in the URL. */
export function NotFoundCard({ what, backHref, backLabel }: { what: string; backHref: string; backLabel: string }) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 rounded-panel border border-edge bg-white px-6 py-14 text-center shadow-panel">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-ink-mut">
        <SearchX className="h-6 w-6" />
      </span>
      <div>
        <p className="font-display text-lg font-bold text-ink-lum">This {what} could not be found</p>
        <p className="mt-1 max-w-md text-sm text-ink-mut">It may have been removed, or the link is out of date. Nothing was changed.</p>
      </div>
      <LinkButton href={backHref} variant="secondary">
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </LinkButton>
    </div>
  );
}

/** Empty list or first-run prompt with an optional primary link. */
export function EmptyPanel({ icon, title, line, actionHref, actionLabel, children }: { icon?: ReactNode; title: string; line: string; actionHref?: string; actionLabel?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-edge-strong bg-white/70 px-6 py-12 text-center">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-subtle text-brand">{icon ?? <Info className="h-5 w-5" />}</span>
      <p className="font-display text-base font-bold text-ink-lum">{title}</p>
      <p className="max-w-md text-sm leading-6 text-ink-mut">{line}</p>
      {actionHref && actionLabel && <LinkButton href={actionHref}>{actionLabel}</LinkButton>}
      {children}
    </div>
  );
}

/** Horizontal tab bar used inside panels. */
export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string; count?: number }>; value: T; onChange: (id: T) => void }) {
  return (
    <div className="flex gap-1 overflow-x-auto rounded-xl border border-edge bg-bg-sunken p-1" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold transition-all",
            value === t.id ? "bg-white text-brand-ink shadow-lift ring-1 ring-edge" : "text-ink-mut hover:text-ink-lum",
          )}
        >
          {t.label}
          {typeof t.count === "number" && <span className={cn("rounded-full px-1.5 text-[11px] tabular", value === t.id ? "bg-brand-subtle text-brand-ink" : "bg-white text-ink-mut")}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function TextArea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("field w-full rounded-xl px-3.5 py-2.5 text-sm leading-6 text-ink-lum placeholder:text-slate-400 focus:outline-none", className)} {...rest} />;
}

/* ------------------------------ status dialog ------------------------------ */

export interface StatusOption<S extends string> {
  value: S;
  label: string;
  /** What happens when this status is chosen, in plain words. */
  consequence: string;
  /** Require a written reason (taking something out of service). */
  needsReason?: boolean;
}

/**
 * Change an entity's status: choose the new status, read the consequence,
 * give a reason when required. `onConfirm` returns the store command outcome;
 * errors are shown inline and the dialog stays open.
 */
export function StatusDialog<S extends string>({
  open,
  onClose,
  title,
  current,
  options,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  current: S;
  options: StatusOption<S>[];
  onConfirm: (status: S, reason: string) => { error?: string } | void;
}) {
  const choices = options.filter((o) => o.value !== current);
  const [value, setValue] = useState<S | "">("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setValue(choices[0]?.value ?? "");
      setReason("");
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const selected = choices.find((o) => o.value === value);
  const reasonMissing = !!selected?.needsReason && reason.trim().length < 5;

  function submit() {
    if (!selected) return;
    if (reasonMissing) {
      setError("Give a reason of at least 5 characters. It is kept in the audit log.");
      return;
    }
    const out = onConfirm(selected.value, reason.trim());
    if (out && out.error) setError(out.error);
    else onClose();
  }

  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm text-ink-mut">
          Current status <StatusChip value={current} />
        </p>
        <fieldset className="space-y-2">
          <legend className="mb-1.5 text-[13px] font-medium text-ink-sec">New status</legend>
          {choices.map((o) => (
            <label
              key={o.value}
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors",
                value === o.value ? "border-brand bg-brand-subtle/50" : "border-edge hover:bg-slate-50",
              )}
            >
              <input type="radio" name="status" className="mt-1 accent-[#5b4cf5]" checked={value === o.value} onChange={() => { setValue(o.value); setError(null); }} />
              <span>
                <span className="block text-sm font-semibold text-ink-lum">{o.label}</span>
                <span className="block text-[13px] leading-5 text-ink-mut">{o.consequence}</span>
              </span>
            </label>
          ))}
        </fieldset>
        {selected?.needsReason && (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">Reason (required)</span>
            <TextArea rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} placeholder="Why is this changing? This is recorded in the audit log." />
          </label>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={selected?.needsReason ? "danger" : "primary"} onClick={submit} disabled={!selected}>
            {selected ? `Set to ${selected.label.toLowerCase()}` : "Choose a status"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Confirm an action, optionally collecting a required reason. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  confirmLabel,
  tone = "primary",
  reasonLabel,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  /** When set, a reason of at least 5 characters is required. */
  reasonLabel?: string;
  onConfirm: (reason: string) => { error?: string } | void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);
  function submit() {
    if (reasonLabel && reason.trim().length < 5) {
      setError("Give a reason of at least 5 characters.");
      return;
    }
    const out = onConfirm(reason.trim());
    if (out && out.error) setError(out.error);
    else onClose();
  }
  return (
    <Dialog open={open} onClose={onClose} title={title}>
      <div className="space-y-4">
        <div className="text-sm leading-6 text-ink-sec">{body}</div>
        {reasonLabel && (
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-sec">{reasonLabel}</span>
            <TextArea rows={3} value={reason} onChange={(e) => { setReason(e.target.value); setError(null); }} />
          </label>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={tone} onClick={submit}>{confirmLabel}</Button>
        </div>
      </div>
    </Dialog>
  );
}

/** Small key figure used inside detail pages (lighter than MetricTile). */
export function Figure({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "ok" | "warn" | "danger" }) {
  return (
    <div className="rounded-2xl border border-edge bg-white px-4 py-3">
      <p className="text-[12px] font-medium text-ink-mut">{label}</p>
      <p className={cn("mt-1 font-display text-xl font-bold tabular", tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : tone === "danger" ? "text-red-600" : "text-ink-lum")}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-ink-mut">{hint}</p>}
    </div>
  );
}

/** A compact list of linked rows inside a panel. */
export function LinkRows({ rows, empty }: { rows: Array<{ href: string; title: string; meta?: string; right?: ReactNode }>; empty: string }) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-ink-mut">{empty}</p>;
  return (
    <ul className="-mx-2 divide-y divide-slate-100">
      {rows.map((r, i) => (
        <li key={`${r.href}-${i}`}>
          <Link href={r.href} className="flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-slate-50">
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-ink-lum">{r.title}</span>
              {r.meta && <span className="block truncate text-xs text-ink-mut">{r.meta}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              {r.right}
              <ChevronRight className="h-4 w-4 text-slate-300" aria-hidden />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
