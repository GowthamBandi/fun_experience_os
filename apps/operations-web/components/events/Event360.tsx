"use client";

import { Suspense, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, CalendarDays, Clock, Copy, Layers, MapPin, Radio, Users, XCircle } from "lucide-react";
import { Badge, Card, Empty, ErrorState, ProgressBar, Skeleton, Stat, Tabs, Tooltip, useToast, type TabItem } from "@/components/pulse";
import { TimelineTab } from "@/components/organizers/OrganizerTabs";
import { PageContainer } from "@/components/shell/PageContainer";
import { artFor, artGradient } from "@/lib/approvals";
import { formatDateTime, toDate } from "@/lib/console/records";
import { eventRange, eventTab, isOffLifecycle, occupancyOf, ratio, startsRel, toBooking, toReview } from "@/lib/events";
import { countEventTickets, eventAuditQuery, eventBookingsQuery, eventReviewsQuery } from "@/lib/events-firestore";
import { useAdminSession } from "@/lib/firebase/auth";
import { inrMinor } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { entityVersion, orgTimeline, toOrgEvent } from "@/lib/organizers";
import { categoryEmoji, countFull } from "@/lib/overview";
import { useLiveDocument } from "@/lib/use-governance";
import { useMetric } from "@/lib/use-metric";
import { useBoundedQuery, useOneShot } from "@/lib/use-query";
import { EventStatusBadge, priceLabel } from "./cells";
import { EventActions } from "./EventActions";
import { BookingsTab, ReviewsTab } from "./EventTabs";

type TabId = "bookings" | "reviews" | "timeline";
const TAB_IDS: TabId[] = ["bookings", "reviews", "timeline"];
const AUDIT_MAX = 100;

const docRow = (id: string, raw: Record<string, unknown>) => ({ id, raw });
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
/** A stable art seed from the id, so each event keeps its own gradient. */
const seedOf = (id: string) => [...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export function Event360({ eventId }: { eventId: string }) {
  // Remounting re-subscribes the live documents (the retry for a failed listener).
  const [attempt, setAttempt] = useState(0);
  return (
    <Suspense fallback={<Loading />}>
      <View key={`${eventId}-${attempt}`} eventId={eventId} onRetry={() => setAttempt((n) => n + 1)} />
    </Suspense>
  );
}

function Loading() {
  return (
    <PageContainer className="flex flex-col gap-5">
      <Skeleton className="h-8 w-40 rounded-pill" />
      <Skeleton className="h-[240px] rounded-card" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-[140px] rounded-card" />
        ))}
      </div>
      <Skeleton className="h-11 w-[360px] max-w-full rounded-pill" />
      <Skeleton className="h-[320px] rounded-card" />
    </PageContainer>
  );
}

function BackLink() {
  return (
    <Link href="/events" className="focus-ring inline-flex w-fit items-center gap-1.5 rounded-pill px-2 py-1 text-[13px] font-semibold text-text-3 transition-colors duration-150 hover:text-text">
      <ArrowLeft aria-hidden className="h-4 w-4" />
      Experiences &amp; Events
    </Link>
  );
}

function View({ eventId, onRetry }: { eventId: string; onRetry: () => void }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname() ?? `/events/${eventId}`;
  const toast = useToast();
  const now = useNow(30_000);
  const { consoleRole } = useAdminSession();
  const highlight = params.get("booking");

  const ev = useLiveDocument("events", eventId);
  const linked = useLiveDocument(highlight ? "bookings" : null, highlight);
  const scope = useMemo(() => ({ eventId }), [eventId]);
  const gross = useMetric("grossBookings", undefined, false, scope);
  const commission = useMetric("commission", undefined, false, scope);
  const refunds = useMetric("refundsAmount", undefined, false, scope);
  const tickets = useOneShot(`event-tickets|${eventId}`, () => countEventTickets(eventId));
  const bookings = useBoundedQuery(`event-bookings|${eventId}`, () => eventBookingsQuery(eventId), toBooking);
  const reviews = useBoundedQuery(`event-reviews|${eventId}`, () => eventReviewsQuery(eventId), toReview);
  const audit = useBoundedQuery(`event-audit|${eventId}`, () => eventAuditQuery(eventId), docRow, AUDIT_MAX);
  const timeline = useMemo(() => orgTimeline([], audit.rows), [audit.rows]);
  const afterAction = () => {
    bookings.retry();
    audit.retry();
    tickets.retry();
    gross.retry();
    commission.retry();
    refunds.retry();
  };

  const tabParam = params.get("tab");
  const tab: TabId = TAB_IDS.includes(tabParam as TabId) ? (tabParam as TabId) : "bookings";
  const setTab = useCallback(
    (id: string) => {
      const next = new URLSearchParams(params.toString());
      if (id === "bookings") next.delete("tab");
      else next.set("tab", id);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  if (ev.loading) return <Loading />;
  if (ev.error) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <BackLink />
        <Card>
          <ErrorState message={ev.error} onRetry={onRetry} />
        </Card>
      </PageContainer>
    );
  }
  if (!ev.data) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <BackLink />
        <Card>
          <Empty
            emoji="🔎"
            title="Event not found"
            body={`There's no event with the ID ${eventId}. It may have been removed, or the link is wrong.`}
            action={<Link href="/events" className="focus-ring inline-flex h-10 items-center rounded-[14px] border border-line bg-surface-high px-4 text-[13px] font-semibold text-text hover:bg-surface-top">Back to events</Link>}
          />
        </Card>
      </PageContainer>
    );
  }

  const d = ev.data;
  const row = toOrgEvent(eventId, d);
  const occ = occupancyOf(d);
  const accent = artFor(row.category).color;
  const venue = d.venue && typeof d.venue === "object" ? (d.venue as Record<string, unknown>) : {};
  const where = [str(venue.name), str(venue.area), str(venue.city)].filter(Boolean).join(" · ") || str(d.location);
  const duration = typeof d.durationMinutes === "number" && d.durationMinutes > 0 ? d.durationMinutes : null;
  const phase = now ? eventTab(row, now) : null;
  const cancelled = row.status === "cancelled";
  const offLifecycle = isOffLifecycle(row.status);
  const fill = ratio(occ.taken, occ.capacity);
  const checkPct = tickets.value ? ratio(tickets.value.checkedIn, tickets.value.admissible) : null;

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(eventId);
      toast.show({ tone: "ok", title: "Event ID copied", body: eventId });
    } catch {
      toast.show({ tone: "err", title: "Couldn't copy", body: "Select the ID and copy it manually." });
    }
  };

  const tabs: TabItem[] = [
    { id: "bookings", label: "Bookings", count: bookings.loading || bookings.error ? undefined : bookings.rows.length },
    { id: "reviews", label: "Reviews", count: reviews.loading || reviews.error ? undefined : reviews.rows.length },
    { id: "timeline", label: "Timeline" },
  ];

  return (
    <PageContainer className="flex flex-col gap-5">
      <BackLink />

      <Card as="header" className="overflow-hidden p-6 lg:p-7">
        <span aria-hidden className="pointer-events-none absolute -left-16 -top-24 h-72 w-72 rounded-full opacity-25 blur-3xl" style={{ background: accent }} />
        <span aria-hidden className="pointer-events-none absolute -right-20 -bottom-28 h-72 w-72 rounded-full bg-primary opacity-[0.16] blur-3xl" />
        <div className="relative flex flex-wrap items-start gap-x-6 gap-y-5">
          <div className="flex min-w-0 flex-1 basis-[440px] items-start gap-4 sm:gap-5">
            <div
              aria-hidden
              className="relative grid h-[92px] w-[92px] shrink-0 place-items-center overflow-hidden rounded-[26px] text-[46px] shadow-[0_18px_44px_-18px_rgba(142,114,255,0.8)]"
              style={{ backgroundImage: artGradient(row.category, seedOf(eventId)) }}
            >
              <span className="drop-shadow-[0_4px_10px_rgba(0,0,0,0.35)]">{categoryEmoji(row.category)}</span>
              {phase === "live" && !cancelled ? (
                <span className="absolute right-2 top-2 flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-70 motion-safe:animate-ping" />
                  <span className="relative inline-flex h-3 w-3 rounded-full border-2 border-[#1A1726] bg-ok" />
                </span>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="overline font-semibold">Event{row.category ? ` · ${artFor(row.category).label === "Experience" ? row.category : artFor(row.category).label}` : ""}</div>
              <h1 className="mt-1 break-words font-display text-[32px] font-bold leading-[1.05] tracking-[-0.03em] text-text sm:text-[40px]">{row.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <EventStatusBadge status={row.status} className="text-[12px]" />
                {phase === "live" && row.status !== "live" && !cancelled ? (
                  <Badge tone="info" className="text-[12px]">
                    <Radio aria-hidden className="h-3.5 w-3.5" />
                    Happening now
                  </Badge>
                ) : null}
                {phase === "past" && row.status !== "completed" && !cancelled ? <Badge tone="warn" className="text-[12px]">Ended, not completed</Badge> : null}
                <Badge tone="muted" className="text-[12px]">
                  {priceLabel(row.priceMinor)}
                  {row.priceMinor ? " / spot" : ""}
                </Badge>
              </div>
              <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-text-2">
                <li className="inline-flex items-center gap-1.5">
                  <Users aria-hidden className="h-3.5 w-3.5 text-text-3" />
                  {row.orgId ? (
                    <Link href={`/partners/${row.orgId}`} className="focus-ring rounded-[6px] font-semibold text-text underline-offset-2 hover:underline">
                      {row.organizerName ?? "Organizer"}
                    </Link>
                  ) : (
                    row.organizerName ?? "—"
                  )}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <MapPin aria-hidden className="h-3.5 w-3.5 text-text-3" />
                  {where ?? "—"}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <CalendarDays aria-hidden className="h-3.5 w-3.5 text-text-3" />
                  {eventRange(row.startsAt, row.endsAt)}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <Clock aria-hidden className="h-3.5 w-3.5 text-text-3" />
                  {now ? startsRel(row.startsAt, now) : "—"}
                  {duration ? ` · ${duration >= 60 ? `${Math.floor(duration / 60)} h${duration % 60 ? ` ${duration % 60} min` : ""}` : `${duration} min`} long` : ""}
                </li>
                {row.experienceId ? (
                  <li className="inline-flex items-center gap-1.5">
                    <Layers aria-hidden className="h-3.5 w-3.5 text-text-3" />
                    <Link href={`/events?experience=${encodeURIComponent(row.experienceId)}`} className="focus-ring rounded-[6px] underline-offset-2 hover:text-text hover:underline">
                      All sessions of this experience
                    </Link>
                  </li>
                ) : null}
                <li>
                  <Tooltip label="Copy event ID">
                    <button
                      type="button"
                      onClick={copyId}
                      aria-label={`Copy event ID ${eventId}`}
                      className="focus-ring inline-flex items-center gap-1.5 rounded-pill border border-line-soft bg-[rgba(255,255,255,0.04)] px-2.5 py-1 font-mono text-[11.5px] text-text-2 transition-colors duration-150 hover:border-line hover:text-text"
                    >
                      {eventId}
                      <Copy aria-hidden className="h-3 w-3" />
                    </button>
                  </Tooltip>
                </li>
              </ul>
            </div>
          </div>
          <div className="flex w-full flex-col items-start gap-2 lg:w-auto lg:items-end">
            <EventActions eventId={eventId} title={row.title} status={row.status} role={consoleRole} onChanged={afterAction} />
            <span className="text-[12px] text-text-3">Version {entityVersion(d.version)}</span>
          </div>
        </div>
        {cancelled ? (
          <div role="status" className="relative mt-5 flex items-start gap-2.5 rounded-control border border-[rgba(255,97,120,0.3)] bg-[rgba(255,97,120,0.08)] px-4 py-3 text-[13px] leading-5 text-[#FFC2CC]">
            <XCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-err" />
            <span>
              <b className="font-semibold text-text">Cancelled{d.cancelledByRole === "admin" ? " by PULSE" : d.cancelledByRole === "organizer" ? " by the organizer" : ""}</b>
              {toDate(d.cancelledAt) ? ` on ${formatDateTime(d.cancelledAt)}` : ""}. Tickets are void and confirmed bookings refunded in full.
              {str(d.cancelReason) ? <> Reason: “{str(d.cancelReason)}”</> : null}
            </span>
          </div>
        ) : offLifecycle ? (
          <div role="status" className="relative mt-5 flex items-start gap-2.5 rounded-control border border-[rgba(255,184,77,0.3)] bg-[rgba(255,184,77,0.08)] px-4 py-3 text-[13px] leading-5 text-[#FFD9A0]">
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <span>
              <b className="font-semibold text-text">Status “{row.status}” is outside the event lifecycle.</b> An older console set it directly, so the event can&apos;t take bookings, change phase or be cancelled.
              {str(d.statusReason) ? <> Reason: “{str(d.statusReason)}”</> : null}
            </span>
          </div>
        ) : null}
      </Card>

      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <Stat
          className="sm:col-span-2 lg:col-span-1"
          label="Capacity"
          value={occ.taken === null && occ.capacity === null ? "—" : `${occ.taken ?? "—"}/${occ.capacity ?? "—"}`}
          hint={fill === null ? "Taken / capacity" : cancelled ? `${fill}% taken when cancelled` : fill >= 100 ? "Sold out" : `${fill}% taken · ${occ.left ?? "—"} left`}
        >
          <ProgressBar value={occ.taken ?? 0} max={occ.capacity ?? 0} ariaLabel={fill === null ? "Capacity taken: unknown" : `Capacity taken: ${fill}%`} className="mt-3" />
          {occ.held || occ.waitlist || occ.blocked ? (
            <p className="mt-2 text-[11px] text-text-3">
              {[occ.held ? `${occ.held} held` : null, occ.waitlist ? `${occ.waitlist} waitlisted` : null, occ.blocked ? `${occ.blocked} blocked` : null].filter(Boolean).join(" · ")}
            </p>
          ) : null}
        </Stat>
        <Stat
          label="Check-ins"
          value={tickets.value ? `${countFull(tickets.value.checkedIn)}/${countFull(tickets.value.admissible)}` : "—"}
          hint={checkPct === null ? "Admitted / valid tickets" : `${checkPct}% admitted`}
          loading={tickets.loading}
          error={tickets.error}
          onRetry={tickets.retry}
        >
          {tickets.value ? <ProgressBar value={tickets.value.checkedIn} max={tickets.value.admissible} ariaLabel={`Checked in: ${checkPct ?? 0}%`} className="mt-3" /> : null}
        </Stat>
        <Stat label="Revenue" value={inrMinor(gross.value)} hint="Captured payments" loading={gross.loading} error={gross.error} onRetry={gross.retry} />
        <Stat label="Commission" value={inrMinor(commission.value)} hint="PULSE share, net of refunds" loading={commission.loading} error={commission.error} onRetry={commission.retry} />
        <Stat label="Refunds" value={inrMinor(refunds.value)} hint="Refunded to customers" loading={refunds.loading} error={refunds.error} onRetry={refunds.retry} />
      </section>

      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Event sections" className="self-start" />

      <div role="tabpanel" aria-label={tabs.find((t) => t.id === tab)?.label}>
        {tab === "bookings" ? <BookingsTab q={bookings} eventId={eventId} highlight={highlight} highlighted={linked} now={now} /> : null}
        {tab === "reviews" ? <ReviewsTab q={reviews} now={now} /> : null}
        {tab === "timeline" ? (
          <TimelineTab
            items={timeline}
            loading={audit.loading}
            error={audit.error}
            truncated={audit.truncated}
            onRetry={audit.retry}
            emptyBody="Saves, reviews, publishing, phase changes and cancellations of this event are recorded here."
          />
        ) : null}
      </div>
    </PageContainer>
  );
}
