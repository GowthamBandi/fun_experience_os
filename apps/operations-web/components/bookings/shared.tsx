"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Info, SearchX, Timer } from "lucide-react";
import { cn, inr } from "@/lib/format";
import { Badge, FillMeter, TONES, type Tone } from "@/components/ui/primitives";
import type { SessionCapacityLedger } from "@/lib/prototype/selectors/capacity";
import { canonicalBookingStatus, isoMillis } from "@/lib/prototype/selectors/status";

/* ------------------------------------------------------------------ */
/* Time                                                                */
/* ------------------------------------------------------------------ */

const IST = "Asia/Kolkata";
const dayKey = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: IST });

/**
 * Human time for a record. ISO timestamps become "Today, 14:05",
 * "Yesterday, 09:30" or "27 Sep, 18:00" (IST). Older display strings such as
 * "Today, 12:10" are shown as they were stored.
 */
export function formatWhen(value?: string): string {
  if (!value) return "—";
  const ms = isoMillis(value);
  if (Number.isNaN(ms)) return value;
  const d = new Date(ms);
  const time = d.toLocaleTimeString("en-IN", { timeZone: IST, hour: "2-digit", minute: "2-digit", hour12: false });
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86_400_000);
  if (dayKey(d) === dayKey(now)) return `Today, ${time}`;
  if (dayKey(d) === dayKey(yesterday)) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString("en-IN", { timeZone: IST, day: "numeric", month: "short" })}, ${time}`;
}

/** Sort key for a record time: ISO, or legacy "Today, 14:05" / "Yesterday, 09:30" strings. */
export function whenMillis(value?: string): number {
  const ms = isoMillis(value);
  if (!Number.isNaN(ms)) return ms;
  const m = value?.match(/^(Today|Yesterday),?\s*(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  const d = new Date();
  d.setHours(Number(m[2]), Number(m[3]), 0, 0);
  return d.getTime() - (m[1] === "Yesterday" ? 86_400_000 : 0);
}

/** Re-renders every `intervalMs` and returns the current time in ms. */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Live countdown to an ISO expiry. */
export function Countdown({ expiresAt, label, className }: { expiresAt?: string; label?: string; className?: string }) {
  const now = useNow(1000);
  const ms = isoMillis(expiresAt);
  if (Number.isNaN(ms)) return null;
  const left = ms - now;
  const expired = left <= 0;
  const mins = Math.floor(Math.max(0, left) / 60_000);
  const secs = Math.floor((Math.max(0, left) % 60_000) / 1000);
  const tone = expired ? "text-ink-mut bg-slate-100" : left < 60_000 ? "text-red-700 bg-red-50" : left < 5 * 60_000 ? "text-amber-700 bg-amber-50" : "text-sky-700 bg-sky-50";
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-2 py-0.5 text-xs font-semibold tabular", tone, className)} role="timer" aria-live="off">
      <Timer className="h-3.5 w-3.5" aria-hidden />
      {expired ? "Expired — releasing seat" : `${label ? `${label} ` : ""}${mins}:${String(secs).padStart(2, "0")}`}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Status chips                                                        */
/* ------------------------------------------------------------------ */

const BOOKING_STATUS: Record<string, { label: string; tone: Tone; hint: string }> = {
  "payment-pending": { label: "Waiting for payment", tone: "warn", hint: "Seat is held for 15 minutes while the payment is recorded." },
  confirmed: { label: "Confirmed", tone: "ok", hint: "Paid (or complimentary) seat." },
  "payment-failed": { label: "Payment failed", tone: "danger", hint: "The payment did not go through. The seat was released." },
  "reservation-expired": { label: "Expired", tone: "neutral", hint: "The hold or seat offer ran out. The seat was released." },
  waitlisted: { label: "On waitlist", tone: "info", hint: "Waiting for a seat. Holds no seat." },
  "waitlist-offered": { label: "Seat offered", tone: "brand", hint: "A seat is held for this person until the offer expires." },
  "cancelled-user": { label: "Cancelled by customer", tone: "neutral", hint: "Cancelled at the customer's request." },
  "cancelled-company": { label: "Cancelled by us", tone: "danger", hint: "Cancelled by operations." },
  "no-show": { label: "No-show", tone: "danger", hint: "Paid but did not attend." },
  refunded: { label: "Refunded", tone: "sky", hint: "Fully refunded; the seat was released." },
  completed: { label: "Attended", tone: "ok", hint: "Attended a completed session." },
};

const PAYMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Awaiting payment", tone: "warn" },
  initiated: { label: "Awaiting payment", tone: "warn" },
  confirmed: { label: "Received", tone: "ok" },
  reconciled: { label: "Verified", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  none: { label: "No payment", tone: "neutral" },
  "not-started": { label: "Not started", tone: "neutral" },
  "refund-pending": { label: "Refund in progress", tone: "warn" },
  refunded: { label: "Refunded", tone: "sky" },
};

const REFUND_STATUS: Record<string, { label: string; tone: Tone }> = {
  requested: { label: "Awaiting approval", tone: "warn" },
  "under-review": { label: "Awaiting approval", tone: "warn" },
  approved: { label: "Approved — to pay out", tone: "info" },
  processing: { label: "Approved — to pay out", tone: "info" },
  completed: { label: "Paid out", tone: "ok" },
  failed: { label: "Payout failed", tone: "danger" },
  rejected: { label: "Rejected", tone: "neutral" },
};

const EXCEPTION_STATUS: Record<string, { label: string; tone: Tone }> = {
  recommended: { label: "Awaiting Finance", tone: "warn" },
  "under-review": { label: "Awaiting Finance", tone: "warn" },
  approved: { label: "Approved — to pay out", tone: "info" },
  completed: { label: "Paid out", tone: "ok" },
  rejected: { label: "Rejected", tone: "neutral" },
};

function Chip({ label, tone, title }: { label: string; tone: Tone; title?: string }) {
  return (
    <Badge className={cn("border whitespace-nowrap", TONES[tone])}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      <span title={title}>{label}</span>
    </Badge>
  );
}

export function BookingStatusChip({ status, checkedIn }: { status: string; checkedIn?: boolean }) {
  const s = canonicalBookingStatus(status);
  if (s === "confirmed" && checkedIn) return <Chip label="Checked in" tone="ok" title="Confirmed and checked in at the door." />;
  const m = BOOKING_STATUS[s] ?? { label: status.replace(/-/g, " "), tone: "neutral" as Tone, hint: "" };
  return <Chip label={m.label} tone={m.tone} title={m.hint} />;
}

export function PaymentStatusChip({ status }: { status?: string }) {
  const m = PAYMENT_STATUS[status ?? "none"] ?? { label: (status ?? "—").replace(/-/g, " "), tone: "neutral" as Tone };
  return <Chip label={m.label} tone={m.tone} />;
}

export function RefundStatusChip({ status }: { status: string }) {
  const m = REFUND_STATUS[status] ?? { label: status.replace(/-/g, " "), tone: "neutral" as Tone };
  return <Chip label={m.label} tone={m.tone} />;
}

export function ExceptionStatusChip({ status }: { status: string }) {
  const m = EXCEPTION_STATUS[status] ?? { label: status.replace(/-/g, " "), tone: "neutral" as Tone };
  return <Chip label={m.label} tone={m.tone} />;
}

/* ------------------------------------------------------------------ */
/* Labels                                                              */
/* ------------------------------------------------------------------ */

export function bookingTypeLabel(type?: string): string {
  switch (type) {
    case "complimentary": return "Free pass";
    case "admin": return "Added by staff";
    case "group": return "Group";
    default: return "Paid booking";
  }
}

export function bookingSourceLabel(source?: string): string {
  switch (source) {
    case "customer-app": return "Customer app";
    case "admin": return "Console";
    case "complimentary": return "Free pass";
    case "waitlist-promotion": return "From waitlist";
    case "campaign": return "Campaign";
    default: return "—";
  }
}

export function refundTypeLabel(type?: string): string {
  switch (type) {
    case "company-cancellation": return "Cancelled by us";
    case "user-cancellation": return "Customer cancellation";
    case "duplicate-payment": return "Duplicate payment";
    case "manual-adjustment": return "Exception refund";
    case "partial": return "Partial refund";
    case "full": return "Full refund";
    default: return "Refund";
  }
}

export const exceptionReasonLabel = (reason: string) => reason.replace(/-/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/* ------------------------------------------------------------------ */
/* Layout pieces                                                       */
/* ------------------------------------------------------------------ */

export function PageFrame({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return <div className={cn("mx-auto w-full space-y-6 px-5 py-7 lg:px-8", narrow ? "max-w-5xl" : "max-w-[1440px]")}>{children}</div>;
}

/** One honest line about what is not integrated. */
export function ProviderNotice({ children }: { children?: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-[13px] leading-5 text-sky-800">
      <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{children ?? "Payment provider not connected — payments and refund payouts are recorded manually with their reference."}</span>
    </p>
  );
}

export function Breadcrumbs({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-xs font-medium text-ink-mut">
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" aria-hidden />}
          {it.href ? (
            <Link href={it.href} className="rounded hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30">
              {it.label}
            </Link>
          ) : (
            <span className="text-ink-sec">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function NotFoundCard({ title, line, backHref, backLabel }: { title: string; line: string; backHref: string; backLabel: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-panel border border-edge bg-white px-6 py-16 text-center shadow-panel">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-ink-mut">
        <SearchX className="h-5 w-5" aria-hidden />
      </span>
      <h1 className="font-display text-lg font-bold text-ink-lum">{title}</h1>
      <p className="max-w-md text-sm text-ink-mut">{line}</p>
      <Link href={backHref} className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl border border-edge-strong bg-white px-4 text-sm font-semibold text-ink-lum shadow-lift hover:bg-bg-sunken">
        <ArrowLeft className="h-4 w-4" aria-hidden /> {backLabel}
      </Link>
    </div>
  );
}

/** White card with an optional header row. */
export function Section({ title, sub, right, children, className, bodyClassName }: { title?: string; sub?: string; right?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn("overflow-hidden rounded-panel border border-edge bg-white shadow-panel", className)}>
      {(title || right) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-edge px-5 py-4">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink-lum">{title}</h2>}
            {sub && <p className="mt-0.5 text-xs text-ink-mut">{sub}</p>}
          </div>
          {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function KeyValues({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="divide-y divide-slate-100 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-start justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
          <dt className="shrink-0 text-ink-mut">{k}</dt>
          <dd className="min-w-0 text-right font-medium text-ink-lum">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Money({ value, sign = false, className }: { value: number; sign?: boolean; className?: string }) {
  const neg = value < 0;
  return (
    <span className={cn("tabular", sign && (neg ? "text-red-600" : "text-emerald-700"), className)}>
      {sign ? (neg ? "−" : "+") : ""}
      {inr(Math.abs(value))}
    </span>
  );
}

/** A segmented filter with counts. */
export function Segments<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ id: T; label: string; count?: number }>; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex max-w-full gap-1 overflow-x-auto rounded-xl border border-edge bg-bg-sunken p-1">
      {options.map((o) => (
        <button
          key={o.id}
          role="tab"
          aria-selected={value === o.id}
          onClick={() => onChange(o.id)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 ease-light focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/30",
            value === o.id ? "bg-white text-brand-ink shadow-lift ring-1 ring-edge" : "text-ink-mut hover:text-ink-lum",
          )}
        >
          {o.label}
          {o.count !== undefined && <span className={cn("rounded-full px-1.5 text-[10px] tabular", value === o.id ? "bg-brand-subtle text-brand-ink" : "bg-slate-200/70 text-ink-sec")}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Capacity                                                            */
/* ------------------------------------------------------------------ */

export function CapacityPanel({ ledger, compact = false }: { ledger: SessionCapacityLedger; compact?: boolean }) {
  const confirmed = ledger.confirmedPaidBookings + ledger.confirmedComplimentaryBookings;
  const full = ledger.remainingSellableCapacity === 0 && ledger.sellableCapacity > 0;
  const cells: Array<{ label: string; value: number; tone: string }> = [
    { label: "Confirmed", value: ledger.confirmedPaidBookings, tone: "text-emerald-700" },
    { label: "Free passes", value: ledger.confirmedComplimentaryBookings, tone: "text-sky-700" },
    { label: "Waiting for payment", value: ledger.activeReservationHolds, tone: "text-amber-700" },
    { label: "Seat offers open", value: ledger.waitlistOfferHolds, tone: "text-violet-700" },
    { label: "On waitlist", value: ledger.waitlistCount, tone: "text-indigo-700" },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <p className="text-sm text-ink-sec">
          <span className="font-display text-2xl font-bold tabular text-ink-lum">{ledger.physicalOccupancy}</span>
          <span className="text-ink-mut"> of {ledger.maxPhysicalCapacity} seats taken</span>
        </p>
        <span className={cn("text-sm font-semibold", full ? "text-red-600" : "text-emerald-700")}>
          {full ? "Full" : `${ledger.remainingSellableCapacity} seat${ledger.remainingSellableCapacity === 1 ? "" : "s"} free`}
        </span>
      </div>
      <FillMeter value={ledger.maxPhysicalCapacity ? (ledger.physicalOccupancy / ledger.maxPhysicalCapacity) * 100 : 0} />
      {!compact && (
        <>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            {cells.map((c) => (
              <div key={c.label} className="rounded-xl bg-bg-sunken px-3 py-2.5">
                <dt className="text-[11px] font-medium text-ink-mut">{c.label}</dt>
                <dd className={cn("font-display text-lg font-bold tabular", c.tone)}>{c.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-ink-mut">
            {confirmed} confirmed · break-even at {ledger.breakEvenAttendance} · minimum {ledger.minViableAttendance}
            {ledger.blockedSlots > 0 && ` · ${ledger.blockedSlots} blocked`}
            {ledger.compSlots > 0 && ` · ${ledger.compSlots} reserved for free passes`}
          </p>
        </>
      )}
    </div>
  );
}
