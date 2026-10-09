"use client";

import { useEffect, useMemo } from "react";
import { AlertTriangle, Crosshair, Star } from "lucide-react";
import { Badge, Card, DataTable, Empty, SkeletonRows, type Column } from "@/components/pulse";
import { Loaded } from "@/components/organizers/OrganizerTabs";
import { formatDateTime } from "@/lib/console/records";
import { bookingBadge, bookingSummary, toBooking, type BookingRow, type ReviewRow } from "@/lib/events";
import { cn, inrMinor, relTime } from "@/lib/format";
import { averageRating } from "@/lib/organizers";
import type { BoundedQuery } from "@/lib/use-query";

const HIGHLIGHT = "!bg-[rgba(142,114,255,0.14)] shadow-[inset_3px_0_0_#8E72FF] [&>td]:!border-b-[rgba(142,114,255,0.35)]";

/* ---------------------------------------------------------------- bookings */

export function BookingsTab({
  q,
  eventId,
  highlight,
  highlighted,
  now,
}: {
  q: BoundedQuery<BookingRow>;
  eventId: string;
  /** The ?booking= id, if any. */
  highlight: string | null;
  /** The live bookings/{highlight} doc, read separately so it shows even when outside the loaded rows. */
  highlighted: { data: Record<string, unknown> | null; loading: boolean; error: string | null };
  now: Date | null;
}) {
  const summary = useMemo(() => bookingSummary(q.rows), [q.rows]);
  const inRows = !!highlight && q.rows.some((b) => b.id === highlight);

  useEffect(() => {
    if (!highlight || q.loading || !inRows) return;
    const row = document.getElementById(`booking-${highlight}`);
    row?.scrollIntoView({ block: "center", behavior: "smooth" });
    row?.focus({ preventScroll: true });
  }, [highlight, q.loading, inRows]);

  const columns: Array<Column<BookingRow>> = [
    {
      key: "reference",
      header: "Reference",
      sort: (a, b) => (a.reference ?? "").localeCompare(b.reference ?? ""),
      cell: (b) => (
        <span className="inline-flex items-center gap-2">
          <span className="font-mono text-[13px] font-semibold tracking-[0.02em] text-text">{b.reference ?? "—"}</span>
          {b.id === highlight ? <Badge tone="violet">Linked</Badge> : null}
        </span>
      ),
    },
    { key: "alias", header: "Alias", sort: (a, b) => (a.alias ?? "").localeCompare(b.alias ?? ""), cell: (b) => <span className="text-text-2">{b.alias ?? "—"}</span> },
    { key: "spots", header: "Spots", align: "right", sort: (a, b) => (a.spots ?? 0) - (b.spots ?? 0), cell: (b) => b.spots ?? "—" },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sort: (a, b) => (a.amountMinor ?? -1) - (b.amountMinor ?? -1),
      cell: (b) => (b.complimentary ? <span className="text-text-2">Comp</span> : inrMinor(b.amountMinor)),
    },
    {
      key: "status",
      header: "Status",
      cell: (b) => {
        const s = bookingBadge(b.status);
        return <Badge tone={s.tone}>{s.label}</Badge>;
      },
    },
    {
      key: "created",
      header: "Created",
      sort: (a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0),
      cell: (b) => (
        <div className="whitespace-nowrap">
          <div className="text-[13px] text-text-2">{now ? relTime(b.createdAt, now) : "—"}</div>
          <div className="text-[11px] text-text-3">{formatDateTime(b.createdAt)}</div>
        </div>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {highlight ? <LinkedBooking id={highlight} eventId={eventId} doc={highlighted} inRows={inRows} loaded={!q.loading && !q.error} /> : null}
      <Loaded
        q={q}
        skeleton={<DataTable rows={[]} columns={columns} rowKey={(b) => b.id} loading />}
        empty={<Card><Empty emoji="🎟️" title="No bookings yet" body="Bookings for this event appear here as soon as someone reserves a spot." /></Card>}
      >
        {(rows) => (
          <>
            <ul className="flex flex-wrap gap-2 text-[12px]" aria-label="Booking summary">
              <SummaryPill tone="ok" label="Confirmed" value={summary.confirmed} />
              <SummaryPill tone="violet" label="Spots" value={summary.spots} />
              <SummaryPill tone="warn" label="Held" value={summary.held} />
              <SummaryPill tone="err" label="Cancelled" value={summary.cancelled} />
            </ul>
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(b) => b.id}
              rowId={(b) => `booking-${b.id}`}
              rowClassName={(b) => (b.id === highlight ? HIGHLIGHT : undefined)}
              caption="Bookings for this event, newest first"
              className="max-h-[70vh]"
            />
          </>
        )}
      </Loaded>
    </div>
  );
}

export function SummaryPill({ tone, label, value }: { tone: "ok" | "violet" | "warn" | "err"; label: string; value: number }) {
  const dot = { ok: "bg-ok", violet: "bg-primary", warn: "bg-warn", err: "bg-err" }[tone];
  return (
    <li className="inline-flex items-center gap-2 rounded-pill border border-line-soft bg-[rgba(255,255,255,0.03)] px-3 py-1.5">
      <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", dot)} />
      <span className="text-text-3">{label}</span>
      <b className="num text-[13px] text-text">{value}</b>
    </li>
  );
}

/** The ?booking= deep link, summarised above the table (it may sit beyond the loaded rows). */
function LinkedBooking({
  id,
  eventId,
  doc,
  inRows,
  loaded,
}: {
  id: string;
  eventId: string;
  doc: { data: Record<string, unknown> | null; loading: boolean; error: string | null };
  inRows: boolean;
  loaded: boolean;
}) {
  if (doc.loading) return <SkeletonRows rows={1} />;
  if (doc.error || !doc.data) {
    return (
      <p role="status" className="flex items-center gap-2 rounded-control border border-dashed border-[rgba(255,184,77,0.35)] px-3.5 py-2.5 text-[13px] text-warn">
        <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
        {doc.error ? `Booking ${id} couldn't load: ${doc.error}` : `There's no booking with the ID ${id}.`}
      </p>
    );
  }
  const b = toBooking(id, doc.data);
  const s = bookingBadge(b.status);
  const elsewhere = b.eventId !== null && b.eventId !== eventId;
  return (
    <Card as="section" aria-label="Linked booking" className="overflow-hidden border-[rgba(142,114,255,0.45)] p-0" data-testid="linked-booking">
      <span aria-hidden className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-primary" />
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-primary opacity-20 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-x-8 gap-y-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <span aria-hidden className="grid h-11 w-11 place-items-center rounded-[14px] bg-[rgba(142,114,255,0.18)] text-primary">
            <Crosshair className="h-5 w-5" />
          </span>
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3">Linked booking</div>
            <div className="font-mono text-[20px] font-bold tracking-[0.03em] text-text">{b.reference ?? id}</div>
          </div>
        </div>
        <dl className="flex flex-wrap gap-x-7 gap-y-2 text-[13px]">
          <div>
            <dt className="text-[11px] text-text-3">Alias</dt>
            <dd className="font-semibold text-text">{b.alias ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-text-3">Spots</dt>
            <dd className="num font-semibold text-text">{b.spots ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-text-3">Amount</dt>
            <dd className="num font-semibold text-text">{b.complimentary ? "Comp" : inrMinor(b.amountMinor)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-text-3">Created</dt>
            <dd className="text-text-2">{formatDateTime(b.createdAt)}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-text-3">Customer</dt>
            <dd className="font-mono text-[12px] text-text-2">{b.customerUid ?? "—"}</dd>
          </div>
        </dl>
        <Badge tone={s.tone} className="ml-auto">
          {s.label}
        </Badge>
      </div>
      {elsewhere ? (
        <p role="status" className="relative border-t border-line-soft px-5 py-2.5 text-[12px] text-warn">
          This booking belongs to a different event ({b.eventId}).
        </p>
      ) : loaded && !inRows ? (
        <p className="relative border-t border-line-soft px-5 py-2.5 text-[12px] text-text-3">It isn&apos;t among the bookings loaded below.</p>
      ) : null}
    </Card>
  );
}

/* ----------------------------------------------------------------- reviews */

export function Stars({ value, className }: { value: number | null; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5", className)} aria-label={value === null ? "No rating" : `${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} aria-hidden className={cn("h-3.5 w-3.5", value !== null && i <= Math.round(value) ? "fill-warn text-warn" : "text-text-3 opacity-40")} />
      ))}
    </span>
  );
}

export function ReviewsTab({ q, now }: { q: BoundedQuery<ReviewRow>; now: Date | null }) {
  const published = useMemo(() => q.rows.filter((r) => r.status === "published"), [q.rows]);
  const avg = useMemo(() => averageRating(published.map((r) => ({ rating: r.rating, status: r.status }))), [published]);
  const dist = useMemo(() => [5, 4, 3, 2, 1].map((n) => ({ n, count: published.filter((r) => r.rating === n).length })), [published]);
  const hidden = q.rows.length - published.length;

  return (
    <Loaded
      q={q}
      skeleton={<SkeletonRows rows={4} />}
      empty={<Card><Empty emoji="💬" title="No reviews yet" body="Checked-in attendees can review the event once it has ended." /></Card>}
    >
      {(rows) => (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)]">
          <Card as="section" aria-label="Rating summary" className="h-fit overflow-hidden">
            <span aria-hidden className="pointer-events-none absolute -left-10 -top-16 h-40 w-40 rounded-full bg-warn opacity-15 blur-3xl" />
            <div className="relative">
              <div className="overline font-semibold">Average</div>
              <div className="num mt-1 text-[52px] font-bold leading-none text-text">{avg.average !== null ? avg.average.toFixed(1) : "—"}</div>
              <Stars value={avg.average} className="mt-2" />
              <p className="mt-1 text-[12px] text-text-3">
                {avg.count} published{hidden ? ` · ${hidden} hidden` : ""}
              </p>
              <ul className="mt-4 flex flex-col gap-1.5">
                {dist.map((d) => (
                  <li key={d.n} className="flex items-center gap-2 text-[12px]">
                    <span className="num w-3 text-text-2">{d.n}</span>
                    <Star aria-hidden className="h-3 w-3 fill-warn text-warn" />
                    <span aria-hidden className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-high">
                      <span className="block h-full rounded-pill bg-warn" style={{ width: `${avg.count ? (d.count / avg.count) * 100 : 0}%` }} />
                    </span>
                    <span className="num w-5 text-right text-text-3">{d.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
          <ul className="flex flex-col gap-3">
            {rows.map((r) => (
              <li key={r.id} className="glass rounded-card p-5">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-display text-[15px] font-bold text-text">{r.author ?? "—"}</span>
                  <Stars value={r.rating} />
                  {r.status === "hidden" ? <Badge tone="muted">Hidden</Badge> : null}
                  <span className="ml-auto text-[12px] text-text-3">{now ? relTime(r.at, now) : "—"}</span>
                </div>
                <p className={cn("mt-2 text-[14px] leading-[1.55]", r.comment ? "text-text-2" : "italic text-text-3")}>{r.comment ?? "No comment"}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Loaded>
  );
}
