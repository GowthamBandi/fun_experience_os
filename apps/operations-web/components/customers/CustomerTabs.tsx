"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { Gavel, Lock, ShieldCheck } from "lucide-react";
import { Badge, Card, DataTable, Empty, ErrorState, SkeletonRows, type Column } from "@/components/pulse";
import { SummaryPill, Stars } from "@/components/events/EventTabs";
import { Loaded, SectionTitle } from "@/components/organizers/OrganizerTabs";
import { formatDateTime } from "@/lib/console/records";
import {
  ageFrom,
  eligibilitySummary,
  genderLabel,
  holdBadge,
  openRefunds,
  paymentBadge,
  paymentTotals,
  refundBadge,
  refundReasonLabel,
  type CustomerBookingRow,
  type CustomerReviewRow,
  type LegalHoldRow,
  type PaymentRow,
  type RefundRow,
} from "@/lib/customers";
import { bookingBadge, bookingSummary } from "@/lib/events";
import { cn, inrMinor, relTime } from "@/lib/format";
import type { BoundedQuery, OneShot } from "@/lib/use-query";

export type EventTitles = Record<string, string | null>;

const LINK = "focus-ring rounded-[6px] underline-offset-2 hover:text-text hover:underline";

function EventLink({ id, titles, booking }: { id: string | null; titles: EventTitles; booking?: string }) {
  if (!id) return <span className="text-text-3">—</span>;
  const title = titles[id];
  return (
    <Link href={`/events/${encodeURIComponent(id)}${booking ? `?booking=${encodeURIComponent(booking)}` : ""}`} className={cn(LINK, "font-semibold text-text")}>
      {title ?? <span className="font-mono text-[12px] text-text-2">{id}</span>}
    </Link>
  );
}

function When({ at, now }: { at: Date | null; now: Date | null }) {
  return (
    <div className="whitespace-nowrap">
      <div className="text-[13px] text-text-2">{now ? relTime(at, now) : "—"}</div>
      <div className="text-[11px] text-text-3">{formatDateTime(at)}</div>
    </div>
  );
}

/* ---------------------------------------------------------------- bookings */

export function CustomerBookingsTab({ q, titles, now }: { q: BoundedQuery<CustomerBookingRow>; titles: EventTitles; now: Date | null }) {
  const summary = useMemo(() => bookingSummary(q.rows), [q.rows]);
  const columns: Array<Column<CustomerBookingRow>> = [
    {
      key: "reference",
      header: "Reference",
      sort: (a, b) => (a.reference ?? "").localeCompare(b.reference ?? ""),
      cell: (b) =>
        b.eventId ? (
          <Link href={`/events/${encodeURIComponent(b.eventId)}?booking=${encodeURIComponent(b.id)}`} className={cn(LINK, "font-mono text-[13px] font-semibold tracking-[0.02em] text-text")}>
            {b.reference ?? b.id}
          </Link>
        ) : (
          <span className="font-mono text-[13px] font-semibold text-text">{b.reference ?? "—"}</span>
        ),
    },
    { key: "event", header: "Event", cell: (b) => <EventLink id={b.eventId} titles={titles} /> },
    { key: "spots", header: "Spots", align: "right", sort: (a, b) => (a.spots ?? 0) - (b.spots ?? 0), cell: (b) => b.spots ?? "—" },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sort: (a, b) => (a.amountMinor ?? -1) - (b.amountMinor ?? -1),
      cell: (b) => (b.complimentary ? <span className="text-text-2">Comp</span> : inrMinor(b.amountMinor)),
    },
    { key: "refunded", header: "Refunded", align: "right", cell: (b) => (b.refundedMinor ? <span className="text-info">{inrMinor(b.refundedMinor)}</span> : <span className="text-text-3">{b.refundedMinor === 0 ? "₹0" : "—"}</span>) },
    {
      key: "status",
      header: "Status",
      cell: (b) => {
        const s = bookingBadge(b.status);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    { key: "created", header: "Booked", sort: (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0), cell: (b) => <When at={b.createdAt} now={now} /> },
  ];

  return (
    <Loaded
      q={q}
      skeleton={<DataTable rows={[]} columns={columns} rowKey={(b) => b.id} loading />}
      empty={<Card><Empty emoji="🎟️" title="No bookings yet" body="When this customer reserves a spot, the booking shows up here with its reference and status." /></Card>}
    >
      {(rows) => (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-wrap gap-2 text-[12px]" aria-label="Booking summary">
            <SummaryPill tone="ok" label="Confirmed" value={summary.confirmed} />
            <SummaryPill tone="violet" label="Spots" value={summary.spots} />
            <SummaryPill tone="warn" label="Held" value={summary.held} />
            <SummaryPill tone="err" label="Cancelled" value={summary.cancelled} />
          </ul>
          <DataTable rows={rows} columns={columns} rowKey={(b) => b.id} caption="This customer's bookings, newest first" className="max-h-[70vh]" />
        </div>
      )}
    </Loaded>
  );
}

/* ---------------------------------------------------------------- payments */

export function CustomerPaymentsTab({ q, titles, now }: { q: BoundedQuery<PaymentRow>; titles: EventTitles; now: Date | null }) {
  const totals = useMemo(() => paymentTotals(q.rows), [q.rows]);
  const columns: Array<Column<PaymentRow>> = [
    {
      key: "payment",
      header: "Payment",
      cell: (p) => (
        <div>
          <div className="font-mono text-[12.5px] font-semibold text-text">{p.providerPaymentId ?? p.id}</div>
          <div className="text-[11px] text-text-3">{p.providerPaymentId ? "Razorpay payment" : "Not yet paid"}</div>
        </div>
      ),
    },
    { key: "event", header: "Event", cell: (p) => <EventLink id={p.eventId} titles={titles} booking={p.bookingId ?? undefined} /> },
    { key: "amount", header: "Amount", align: "right", sort: (a, b) => (a.amountMinor ?? -1) - (b.amountMinor ?? -1), cell: (p) => inrMinor(p.amountMinor) },
    { key: "refunded", header: "Refunded", align: "right", cell: (p) => (p.refundedMinor ? <span className="text-info">{inrMinor(p.refundedMinor)}</span> : <span className="text-text-3">{inrMinor(p.refundedMinor)}</span>) },
    {
      key: "status",
      header: "Status",
      cell: (p) => {
        const s = paymentBadge(p.status);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    { key: "when", header: "Captured", sort: (a, b) => ((a.capturedAt ?? a.createdAt)?.getTime() ?? 0) - ((b.capturedAt ?? b.createdAt)?.getTime() ?? 0), cell: (p) => <When at={p.capturedAt ?? p.createdAt} now={now} /> },
  ];

  return (
    <Loaded
      q={q}
      skeleton={<DataTable rows={[]} columns={columns} rowKey={(p) => p.id} loading />}
      empty={<Card><Empty emoji="💳" title="No payments yet" body="Payment attempts for this customer's bookings appear here, captured or not." /></Card>}
    >
      {(rows) => (
        <div className="flex flex-col gap-4">
          <ul className="flex flex-wrap gap-2 text-[12px]" aria-label="Payment summary">
            <MoneyPill tone="ok" label="Captured" value={inrMinor(totals.captured)} />
            <MoneyPill tone="info" label="Refunded (approved)" value={inrMinor(totals.refunded)} />
            <MoneyPill tone="violet" label="Attempts" value={String(rows.length)} />
          </ul>
          <DataTable rows={rows} columns={columns} rowKey={(p) => p.id} caption="This customer's payments, newest first" className="max-h-[70vh]" />
        </div>
      )}
    </Loaded>
  );
}

function MoneyPill({ tone, label, value }: { tone: "ok" | "info" | "violet" | "warn"; label: string; value: string }) {
  const dot = { ok: "bg-ok", info: "bg-info", violet: "bg-primary", warn: "bg-warn" }[tone];
  return (
    <li className="inline-flex items-center gap-2 rounded-pill border border-line-soft bg-[rgba(255,255,255,0.03)] px-3 py-1.5">
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      <span className="text-text-3">{label}</span>
      <b className="num text-[13px] text-text">{value}</b>
    </li>
  );
}

/* ----------------------------------------------------------------- refunds */

export function CustomerRefundsTab({ q, titles, now }: { q: BoundedQuery<RefundRow>; titles: EventTitles; now: Date | null }) {
  const open = useMemo(() => openRefunds(q.rows), [q.rows]);
  const columns: Array<Column<RefundRow>> = [
    { key: "amount", header: "Amount", align: "right", sort: (a, b) => (a.amountMinor ?? -1) - (b.amountMinor ?? -1), cell: (r) => <span className="num font-semibold text-text">{inrMinor(r.amountMinor)}</span> },
    {
      key: "reason",
      header: "Reason",
      cell: (r) => (
        <div className="max-w-[340px]">
          <div className="text-[13px] font-semibold text-text">{refundReasonLabel(r.reason)}</div>
          {r.note ? <div className="mt-0.5 line-clamp-2 text-[12px] text-text-3">“{r.note}”</div> : null}
        </div>
      ),
    },
    { key: "event", header: "Event", cell: (r) => <EventLink id={r.eventId} titles={titles} booking={r.bookingId ?? undefined} /> },
    {
      key: "status",
      header: "Status",
      cell: (r) => {
        const s = refundBadge(r.status);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    { key: "requested", header: "Requested", sort: (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0), cell: (r) => <When at={r.createdAt} now={now} /> },
  ];

  return (
    <Loaded
      q={q}
      skeleton={<DataTable rows={[]} columns={columns} rowKey={(r) => r.id} loading />}
      empty={<Card><Empty emoji="↩️" title="No refunds" body="Refund requests for this customer's bookings, from them, the organizer or a cancellation, show up here." /></Card>}
    >
      {(rows) => (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 text-[12px]">
            <ul className="flex flex-wrap gap-2" aria-label="Refund summary">
              <MoneyPill tone="warn" label="In flight" value={`${open.count} · ${inrMinor(open.amountMinor)}`} />
              <MoneyPill tone="violet" label="Requests" value={String(rows.length)} />
            </ul>
            {open.count ? (
              <Link href="/refunds" className="focus-ring ml-auto rounded-pill px-2 py-1 text-[12px] font-semibold text-primary hover:underline">
                Decide in Refunds →
              </Link>
            ) : null}
          </div>
          <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} caption="This customer's refunds, newest first" className="max-h-[70vh]" />
        </div>
      )}
    </Loaded>
  );
}

/* ----------------------------------------------------------------- reviews */

export function CustomerReviewsTab({ q, titles, now }: { q: BoundedQuery<CustomerReviewRow>; titles: EventTitles; now: Date | null }) {
  return (
    <Loaded q={q} skeleton={<SkeletonRows rows={3} />} empty={<Card><Empty emoji="💬" title="No reviews yet" body="Customers can review an event they checked in to once it has ended." /></Card>}>
      {(rows) => (
        <ul className="grid gap-3 lg:grid-cols-2">
          {rows.map((r) => (
            <li key={r.id} className="glass rounded-card p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Stars value={r.rating} />
                <span className="num text-[13px] font-bold text-text">{r.rating ?? "—"}</span>
                {r.status === "hidden" ? <Badge tone="muted">Hidden</Badge> : null}
                <span className="ml-auto text-[12px] text-text-3">{now ? relTime(r.at, now) : "—"}</span>
              </div>
              <p className={cn("mt-2 text-[14px] leading-[1.55]", r.comment ? "text-text-2" : "italic text-text-3")}>{r.comment ? `“${r.comment}”` : "No comment"}</p>
              <div className="mt-3 text-[12px] text-text-3">
                on <EventLink id={r.eventId} titles={titles} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Loaded>
  );
}

/* ------------------------------------------------------------------ safety */

export type SafetyRead = { readable: true; data: Record<string, unknown> | null } | { readable: false };

export function CustomerSafetyTab({ safety, bookings, now }: { safety: OneShot<SafetyRead>; bookings: BoundedQuery<CustomerBookingRow>; now: Date | null }) {
  const checks = useMemo(() => eligibilitySummary(bookings.rows), [bookings.rows]);
  let profile: ReactNode;
  if (safety.loading) profile = <SkeletonRows rows={2} />;
  else if (safety.error) profile = <ErrorState message={safety.error} onRetry={safety.retry} />;
  else if (!safety.value?.readable) {
    profile = (
      <Empty
        emoji="🔒"
        title="Not readable from the console"
        body="Birth date and gender live in customerSafety, which the Firestore rules let only the customer read. The console never sees them; the server still enforces each event's age and gender limits at booking."
      />
    );
  } else if (!safety.value.data) {
    profile = <Empty emoji="🪪" title="No safety profile" body="This customer hasn't completed their profile (birth date and gender) yet." />;
  } else {
    const d = safety.value.data;
    const age = now ? ageFrom(d.birthDate, now) : null;
    profile = (
      <dl className="grid grid-cols-2 gap-4 text-[13px]">
        <div>
          <dt className="text-[11px] text-text-3">Age</dt>
          <dd className="num text-[28px] font-bold text-text">{age ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] text-text-3">Gender</dt>
          <dd className="mt-1.5 text-[15px] font-semibold text-text">{genderLabel(d.gender)}</dd>
        </div>
      </dl>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card as="section" aria-labelledby="safety-profile">
        <SectionTitle id="safety-profile" icon={<Lock />} title="Safety profile" aside={<span className="font-mono text-[11px] text-text-3">customerSafety</span>} />
        {profile}
      </Card>
      <Card as="section" aria-labelledby="safety-checks">
        <SectionTitle id="safety-checks" icon={<ShieldCheck />} title="Checks at booking" />
        {bookings.loading ? (
          <SkeletonRows rows={2} />
        ) : bookings.error ? (
          <ErrorState message={bookings.error} onRetry={bookings.retry} />
        ) : bookings.rows.length === 0 ? (
          <Empty emoji="🛡️" title="No bookings to check" body="Each booking records whether the customer met the event's age and gender rules." />
        ) : (
          <>
            <dl className="grid grid-cols-3 gap-3">
              <CheckTile label="Checked" value={checks.checked} tone="text-ok" />
              <CheckTile label="Failed a rule" value={checks.failed} tone={checks.failed ? "text-err" : "text-text"} />
              <CheckTile label="Not recorded" value={checks.unrecorded} tone="text-text-2" />
            </dl>
            <p className="mt-4 text-[12px] leading-5 text-text-3">
              From the eligibility flags reserveSeat stores on each booking{bookings.truncated ? `, across the newest ${bookings.rows.length}` : ""}. A failed rule normally stops the booking, so a non-zero count is worth a look.
            </p>
          </>
        )}
      </Card>
    </div>
  );
}

function CheckTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] px-4 py-3">
      <dt className="text-[11px] text-text-3">{label}</dt>
      <dd className={cn("num mt-1 text-[26px] font-bold leading-none", tone)}>{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------- legal holds */

export function CustomerHoldsTab({ q, now }: { q: BoundedQuery<LegalHoldRow>; now: Date | null }) {
  const manage = (
    <Link href="/legal-holds" className="focus-ring inline-flex h-10 items-center rounded-[14px] border border-line bg-surface-high px-4 text-[13px] font-semibold text-text hover:bg-surface-top">
      Open legal holds
    </Link>
  );
  return (
    <Loaded
      q={q}
      skeleton={<SkeletonRows rows={2} />}
      empty={<Card><Empty emoji="⚖️" title="No legal holds" body="A hold pauses retention deletion of this customer's records while a dispute or legal request is open." action={manage} /></Card>}
    >
      {(rows) => (
        <ul className="flex flex-col gap-3">
          {rows.map((h) => {
            const b = holdBadge(h.status);
            return (
              <li key={h.id} className={cn("glass relative overflow-hidden rounded-card p-5", h.status === "active" && "border-[rgba(255,97,120,0.35)]")}>
                {h.status === "active" ? <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-err" /> : null}
                <div className="flex flex-wrap items-center gap-3">
                  <span aria-hidden className="grid h-9 w-9 place-items-center rounded-[12px] bg-[rgba(255,97,120,0.12)] text-err">
                    <Gavel className="h-4 w-4" />
                  </span>
                  <Badge tone={b.tone}>{b.label}</Badge>
                  {h.reference ? <span className="font-mono text-[12px] text-text-2">{h.reference}</span> : null}
                  <span className="ml-auto text-[12px] text-text-3">placed {now ? relTime(h.placedAt, now) : "—"}</span>
                </div>
                <p className="mt-3 text-[14px] leading-[1.55] text-text">{h.reason ?? "—"}</p>
                <dl className="mt-3 flex flex-wrap gap-x-7 gap-y-2 text-[12px]">
                  <div>
                    <dt className="text-text-3">Placed</dt>
                    <dd className="text-text-2">{formatDateTime(h.placedAt)}</dd>
                  </div>
                  {h.releasedAt ? (
                    <div>
                      <dt className="text-text-3">Released</dt>
                      <dd className="text-text-2">
                        {formatDateTime(h.releasedAt)}
                        {h.releaseReason ? ` · “${h.releaseReason}”` : ""}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </li>
            );
          })}
          <li className="self-start">{manage}</li>
        </ul>
      )}
    </Loaded>
  );
}
