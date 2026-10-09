"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarDays, Eye, EyeOff, Gavel, Phone, ShieldAlert } from "lucide-react";
import { Avatar, Badge, Card, CopyIdPill, Empty, ErrorState, Skeleton, Stat, Tabs, type TabItem } from "@/components/pulse";
import { BackLink } from "@/components/shell/BackLink";
import { PageContainer } from "@/components/shell/PageContainer";
import { formatDate } from "@/lib/console/records";
import {
  customerName,
  formatPhone,
  isPermissionDenied,
  openRefunds,
  toCustomer,
  toCustomerBooking,
  toCustomerReview,
  toLegalHold,
  toPayment,
  toRefund,
  userStatusBadge,
} from "@/lib/customers";
import {
  customerBookingsQuery,
  customerLegalHoldsQuery,
  customerPaymentsQuery,
  customerRefundsQuery,
  customerReviewsQuery,
  fetchEventTitles,
  readCustomerSafety,
} from "@/lib/customers-firestore";
import { cn, inrMinor, maskPhone, relTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { averageRating } from "@/lib/organizers";
import { countFull } from "@/lib/overview";
import { useLiveDocument } from "@/lib/use-governance";
import { useMetric } from "@/lib/use-metric";
import { useTabParam } from "@/lib/use-search-param";
import { useBoundedQuery, useOneShot } from "@/lib/use-query";
import {
  CustomerBookingsTab,
  CustomerHoldsTab,
  CustomerPaymentsTab,
  CustomerRefundsTab,
  CustomerReviewsTab,
  CustomerSafetyTab,
  type SafetyRead,
} from "./CustomerTabs";

type TabId = "bookings" | "payments" | "refunds" | "reviews" | "safety" | "holds";
const TAB_IDS: TabId[] = ["bookings", "payments", "refunds", "reviews", "safety", "holds"];
/** Event titles are looked up one doc each; cap the fan-out. */
const TITLE_MAX = 40;
/** A revealed phone masks itself again after this long. */
const REVEAL_MS = 30_000;

export function Customer360({ uid }: { uid: string }) {
  // Remounting re-subscribes the live documents (the retry for a failed listener).
  const [attempt, setAttempt] = useState(0);
  return (
    <Suspense fallback={<Loading />}>
      <View key={`${uid}-${attempt}`} uid={uid} onRetry={() => setAttempt((n) => n + 1)} />
    </Suspense>
  );
}

function Loading() {
  return (
    <PageContainer className="flex flex-col gap-5">
      <Skeleton className="h-8 w-40 rounded-pill" />
      <Skeleton className="h-[200px] rounded-card" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[132px] rounded-card" />
        ))}
      </div>
      <Skeleton className="h-11 w-[520px] max-w-full rounded-pill" />
      <Skeleton className="h-[320px] rounded-card" />
    </PageContainer>
  );
}

/** Masked by default; Reveal is local state only and re-masks itself. The full number never reaches the URL or the title. */
function PhoneReveal({ phone }: { phone: string | null }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!shown) return;
    const t = window.setTimeout(() => setShown(false), REVEAL_MS);
    return () => window.clearTimeout(t);
  }, [shown]);
  if (!phone) return <span>—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("font-mono text-[13px] tracking-[0.02em]", shown ? "text-text" : "text-text-2")} aria-live="polite">
        {shown ? formatPhone(phone) : maskPhone(phone)}
      </span>
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        className="focus-ring inline-flex h-7 items-center gap-1.5 rounded-pill border border-line-soft bg-[rgba(255,255,255,0.04)] px-2.5 text-[12px] font-semibold text-text-2 transition-colors duration-150 hover:border-line hover:text-text"
      >
        {shown ? <EyeOff aria-hidden className="h-3.5 w-3.5" /> : <Eye aria-hidden className="h-3.5 w-3.5" />}
        {shown ? "Hide" : "Reveal"}
      </button>
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] px-4 py-3">
      <dt className="truncate text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3">{label}</dt>
      <dd className="num mt-1 truncate text-[20px] font-bold leading-tight text-text">{value}</dd>
    </div>
  );
}

function View({ uid, onRetry }: { uid: string; onRetry: () => void }) {
  const [tab, setTab] = useTabParam(TAB_IDS, "bookings");
  const now = useNow(60_000);

  const user = useLiveDocument("users", uid);
  const profile = useLiveDocument("publicProfiles", uid);
  const scope = useMemo(() => ({ customerUid: uid }), [uid]);
  const bookingCount = useMetric("customerBookings", undefined, false, scope);
  const spent = useMetric("customerSpent", undefined, false, scope);
  const refunded = useMetric("customerRefunded", undefined, false, scope);
  const reviewCount = useMetric("customerReviews", undefined, false, scope);

  const bookings = useBoundedQuery(`customer-bookings|${uid}`, () => customerBookingsQuery(uid), toCustomerBooking);
  const payments = useBoundedQuery(`customer-payments|${uid}`, () => customerPaymentsQuery(uid), toPayment);
  const refunds = useBoundedQuery(`customer-refunds|${uid}`, () => customerRefundsQuery(uid), toRefund);
  const reviews = useBoundedQuery(`customer-reviews|${uid}`, () => customerReviewsQuery(uid), toCustomerReview);
  const holds = useBoundedQuery(`customer-holds|${uid}`, () => customerLegalHoldsQuery(uid), toLegalHold);
  const safety = useOneShot<SafetyRead>(tab === "safety" ? `customer-safety|${uid}` : null, async () => {
    try {
      return { readable: true, data: await readCustomerSafety(uid) };
    } catch (err) {
      if (isPermissionDenied(err)) return { readable: false };
      throw err;
    }
  });

  const eventIds = useMemo(() => {
    const ids = [...bookings.rows, ...payments.rows, ...refunds.rows, ...reviews.rows].map((r) => r.eventId).filter((id): id is string => !!id);
    return [...new Set(ids)].sort().slice(0, TITLE_MAX);
  }, [bookings.rows, payments.rows, refunds.rows, reviews.rows]);
  const titles = useOneShot(eventIds.length ? `customer-event-titles|${eventIds.join(",")}` : null, () => fetchEventTitles(eventIds));
  const open = useMemo(() => openRefunds(refunds.rows), [refunds.rows]);
  const rating = useMemo(() => averageRating(reviews.rows.map((r) => ({ rating: r.rating, status: r.status }))), [reviews.rows]);
  const activeHold = holds.rows.some((h) => h.status === "active");
  const glance = useMemo(() => {
    const kept = bookings.rows.filter((b) => b.status === "confirmed" || b.status === "completed");
    return { last: bookings.rows[0]?.createdAt ?? null, spots: kept.reduce((n, b) => n + (b.spots ?? 0), 0), events: new Set(kept.map((b) => b.eventId)).size };
  }, [bookings.rows]);

  if (user.loading) return <Loading />;
  if (user.error) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <BackLink href="/customers" label="Customers" />
        <Card>
          <ErrorState message={user.error} onRetry={onRetry} />
        </Card>
      </PageContainer>
    );
  }
  if (!user.data) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <BackLink href="/customers" label="Customers" />
        <Card>
          <Empty
            emoji="🔎"
            title="Customer not found"
            body={`There's no PULSE account with the ID ${uid}. It may have been removed, or the link is wrong.`}
            action={<Link href="/customers" className="focus-ring inline-flex h-10 items-center rounded-[14px] border border-line bg-surface-high px-4 text-[13px] font-semibold text-text hover:bg-surface-top">Back to customers</Link>}
          />
        </Card>
      </PageContainer>
    );
  }

  const c = toCustomer(uid, user.data);
  const name = customerName(typeof profile.data?.displayName === "string" ? profile.data.displayName : typeof user.data.displayName === "string" ? user.data.displayName : null);
  const status = userStatusBadge(c.status);
  const bio = typeof profile.data?.bio === "string" && profile.data.bio.trim() ? profile.data.bio.trim() : null;
  const titleMap = titles.value ?? {};
  const count = (q: { loading: boolean; error: string | null; rows: unknown[] }) => (q.loading || q.error ? undefined : q.rows.length);

  const tabs: TabItem[] = [
    { id: "bookings", label: "Bookings", count: count(bookings) },
    { id: "payments", label: "Payments", count: count(payments) },
    { id: "refunds", label: "Refunds", count: count(refunds) },
    { id: "reviews", label: "Reviews", count: count(reviews) },
    { id: "safety", label: "Safety" },
    { id: "holds", label: "Legal holds", count: count(holds) },
  ];

  return (
    <PageContainer className="flex flex-col gap-5">
      <BackLink href="/customers" label="Customers" />

      <Card as="header" className="overflow-hidden p-6 lg:p-7">
        <span aria-hidden className="pointer-events-none absolute -left-16 -top-24 h-72 w-72 rounded-full bg-[#F6A6FF] opacity-[0.14] blur-3xl" />
        <span aria-hidden className="pointer-events-none absolute -right-20 -bottom-28 h-72 w-72 rounded-full bg-primary opacity-[0.18] blur-3xl" />
        <div className="relative flex flex-wrap items-start gap-x-6 gap-y-5">
          <div className="flex min-w-0 flex-1 basis-[420px] items-start gap-4 sm:gap-5">
            <div className="relative shrink-0">
              <Avatar name={name} size={84} className="shadow-[0_18px_44px_-18px_rgba(142,114,255,0.8)]" />
              {activeHold ? (
                <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-[#1A1726] bg-err text-ink" title="Under legal hold">
                  <Gavel aria-hidden className="h-3.5 w-3.5" />
                </span>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="overline font-semibold">{c.operator ? "Console operator account" : "Customer"}</div>
              <h1 className="mt-1 break-words font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-text sm:text-[40px]">{name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {status ? (
                  <Badge tone={status.tone} className="text-[12px]">
                    <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                    {status.label}
                  </Badge>
                ) : (
                  <Badge tone="muted" className="text-[12px]">
                    Status: —
                  </Badge>
                )}
                {c.operator ? <Badge tone="violet" className="text-[12px]">Operator</Badge> : null}
                {activeHold ? (
                  <Badge tone="err" className="text-[12px]">
                    <Gavel aria-hidden className="h-3.5 w-3.5" />
                    Legal hold
                  </Badge>
                ) : null}
                {open.count ? (
                  <Badge tone="warn" className="text-[12px]">
                    <ShieldAlert aria-hidden className="h-3.5 w-3.5" />
                    {open.count} {open.count === 1 ? "refund" : "refunds"} in flight
                  </Badge>
                ) : null}
              </div>
              <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-text-2">
                <li className="inline-flex items-center gap-1.5">
                  <Phone aria-hidden className="h-3.5 w-3.5 text-text-3" />
                  <span className="sr-only">Phone</span>
                  <PhoneReveal phone={c.phone} />
                </li>
                <li className="inline-flex items-center gap-1.5" title={formatDate(c.createdAt)}>
                  <CalendarDays aria-hidden className="h-3.5 w-3.5 text-text-3" />
                  Joined {c.createdAt && now ? relTime(c.createdAt, now) : "—"}
                  {c.createdAt ? <span className="text-text-3">· {formatDate(c.createdAt)}</span> : null}
                </li>
                <li>
                  <CopyIdPill id={uid} noun="customer" />
                </li>
              </ul>
              {profile.error ? (
                <p role="status" className="mt-3 text-[12px] text-warn">
                  Public profile couldn&apos;t load, so the name shows “PULSE member”. {profile.error}
                </p>
              ) : null}
              {bio ? <p className="mt-4 max-w-2xl text-[14px] leading-[1.55] text-text-2">{bio}</p> : null}
            </div>
          </div>
          <dl aria-label="At a glance" className="grid w-full grid-cols-3 gap-2.5 sm:w-auto sm:min-w-[380px]">
            <Fact label="Last booked" value={bookings.loading || bookings.error ? "—" : now && glance.last ? relTime(glance.last, now) : "—"} />
            <Fact label="Spots booked" value={bookings.loading || bookings.error ? "—" : String(glance.spots)} />
            <Fact label="Events" value={bookings.loading || bookings.error ? "—" : `${glance.events}${bookings.truncated ? "+" : ""}`} />
          </dl>
        </div>
      </Card>

      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Bookings" value={countFull(bookingCount.value)} hint="All time · every status" loading={bookingCount.loading} error={bookingCount.error} onRetry={bookingCount.retry} />
        <Stat label="Spent" value={inrMinor(spent.value)} hint="Confirmed + completed bookings, before refunds" loading={spent.loading} error={spent.error} onRetry={spent.retry} />
        <Stat
          label="Refunds"
          value={inrMinor(refunded.value)}
          hint={refunds.loading || refunds.error ? "Refunded (completed)" : open.count ? `Refunded · ${open.count} in flight (${inrMinor(open.amountMinor)})` : "Refunded (completed)"}
          loading={refunded.loading}
          error={refunded.error}
          onRetry={refunded.retry}
        />
        <Stat
          label="Reviews"
          value={countFull(reviewCount.value)}
          hint={rating.average !== null ? `Gives ${rating.average.toFixed(1)}★ on average` : "Written by this customer"}
          loading={reviewCount.loading}
          error={reviewCount.error}
          onRetry={reviewCount.retry}
        />
      </section>

      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Customer sections" className="self-start" />

      <div role="tabpanel" aria-label={tabs.find((t) => t.id === tab)?.label}>
        {tab === "bookings" ? <CustomerBookingsTab q={bookings} titles={titleMap} now={now} /> : null}
        {tab === "payments" ? <CustomerPaymentsTab q={payments} titles={titleMap} now={now} /> : null}
        {tab === "refunds" ? <CustomerRefundsTab q={refunds} titles={titleMap} now={now} /> : null}
        {tab === "reviews" ? <CustomerReviewsTab q={reviews} titles={titleMap} now={now} /> : null}
        {tab === "safety" ? <CustomerSafetyTab safety={safety} bookings={bookings} now={now} /> : null}
        {tab === "holds" ? <CustomerHoldsTab q={holds} now={now} /> : null}
      </div>
    </PageContainer>
  );
}
