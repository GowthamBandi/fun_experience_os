"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Gavel } from "lucide-react";
import { Badge, Button, Card, Empty, ErrorState, PageHeader, Sheet, Skeleton, Truncated, useToast } from "@/components/pulse";
import { EventLink } from "@/components/customers/CustomerTabs";
import { Stars, SummaryPill } from "@/components/events/EventTabs";
import { PageContainer } from "@/components/shell/PageContainer";
import { useAdminSession } from "@/lib/firebase/auth";
import { RequestIdBook } from "@/lib/console/actions";
import { can } from "@/lib/console/capabilities";
import { rethrowForSheet } from "@/lib/console/errors";
import { formatDateTime } from "@/lib/console/records";
import { fetchEventTitles } from "@/lib/customers-firestore";
import { cn, relTime } from "@/lib/format";
import { moderateReview } from "@/lib/governance-api";
import { useNow } from "@/lib/hooks";
import { averageRating } from "@/lib/organizers";
import { fetchOrganizerNames } from "@/lib/organizers-firestore";
import { REVIEW_FILTERS, distinctIds, filterReviews, nameOrId, moderationAction, reviewCounts, reviewModerationKey, sortReviews, toModReview, type ModReview, type ModerationAction, type ReviewFilter } from "@/lib/trust";
import { useGovernanceCollection } from "@/lib/use-governance";
import { useOneShot } from "@/lib/use-query";
import { CountChips, ReadOnly, SearchField } from "./TrustBits";

/** Event titles are looked up one doc each; cap the fan-out. */
const TITLE_MAX = 40;

const FILTER_EMPTY: Record<ReviewFilter, { emoji: string; title: string; body: string }> = {
  all: { emoji: "💬", title: "No reviews yet", body: "Reviews appear after attendees who checked in rate an event that has ended." },
  published: { emoji: "💬", title: "Nothing published", body: "No review is visible on PULSE right now." },
  hidden: { emoji: "🙈", title: "Nothing hidden", body: "All clear: no review has been hidden." },
};

export function ReviewsFeed() {
  const { records, loading, error, truncated, refresh, order } = useGovernanceCollection("reviews");
  const { consoleRole: role } = useAdminSession();
  const permitted = can(role, "governance.decide");
  const now = useNow();
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<{ review: ModReview; action: ModerationAction } | null>(null);

  const reviews = useMemo(() => sortReviews(records.map((r) => toModReview(r.id, r.raw))), [records]);
  const counts = useMemo(() => reviewCounts(reviews), [reviews]);
  const avg = useMemo(() => averageRating(reviews.map((r) => ({ rating: r.rating, status: r.status }))), [reviews]);
  const eventIds = useMemo(() => distinctIds(reviews.map((r) => r.eventId), TITLE_MAX), [reviews]);
  const orgIds = useMemo(() => distinctIds(reviews.map((r) => r.orgId), TITLE_MAX), [reviews]);
  const orgNames = useOneShot(orgIds.length ? `review-org-names|${orgIds.join(",")}` : null, () => fetchOrganizerNames(orgIds));
  const orgNameMap = useMemo(() => orgNames.value ?? {}, [orgNames.value]);
  const titles = useOneShot(eventIds.length ? `review-event-titles|${eventIds.join(",")}` : null, () => fetchEventTitles(eventIds));
  const titleMap = useMemo(() => titles.value ?? {}, [titles.value]);
  const shown = useMemo(() => filterReviews(reviews, filter, search, titleMap), [reviews, filter, search, titleMap]);
  const ready = !loading && !error;

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        overline="Trust"
        title={
          <>
            Reviews
            {ready && counts.hidden > 0 ? (
              <>
                {" "}
                <em className="hl">{counts.hidden} hidden</em>
              </>
            ) : null}
          </>
        }
        subtitle="Verified-attendee reviews of organizer events. Hide reviews that break policy (abuse, personal data, off-topic) or restore them. Rating aggregates update server-side; every decision is audited."
      />

      {ready && reviews.length > 0 ? (
        <ul aria-label="Review summary" className="flex flex-wrap items-center gap-2 text-[12px]">
          <li className="inline-flex items-center gap-2 rounded-pill border border-line-soft bg-[rgba(255,255,255,0.03)] px-3 py-1.5">
            <Stars value={avg.average} tone="volt" />
            <b className="num text-[13px] text-text">{avg.average ?? "—"}</b>
            <span className="text-text-3">average of published</span>
          </li>
          <SummaryPill tone="ok" label="Published" value={counts.published} />
          <SummaryPill tone="err" label="Hidden" value={counts.hidden} />
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <CountChips label="Filter by status" filters={REVIEW_FILTERS} value={filter} counts={counts} ready={ready} onChange={setFilter} />
        <SearchField value={search} onChange={setSearch} label="Search reviews" placeholder="Search text, author, event…" />
      </div>

      {loading ? (
        <div aria-busy="true" className="columns-1 gap-4 md:columns-2 xl:columns-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="glass mb-4 break-inside-avoid rounded-card p-5" style={{ opacity: 1 - i * 0.1 }}>
              <Skeleton className="h-3.5 w-24 rounded-pill" />
              <Skeleton className="mt-4 h-3 w-full rounded-pill" />
              <Skeleton className={cn("mt-2 h-3 rounded-pill", i % 2 ? "w-1/2" : "w-4/5")} />
            </div>
          ))}
          <span className="sr-only" role="status">
            Loading reviews…
          </span>
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={refresh} />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          {search.trim() ? <Empty emoji="🔎" title={`No match for “${search.trim()}”`} body="Try words from the review, the author or the event, or clear the search." /> : <Empty {...FILTER_EMPTY[filter]} />}
        </Card>
      ) : (
        <>
          <p className="sr-only" role="status">
            {shown.length} {shown.length === 1 ? "review" : "reviews"} shown
          </p>
          <ul className="columns-1 gap-4 md:columns-2 xl:columns-3">
            {shown.map((r) => (
              <li key={r.id} className="mb-4 break-inside-avoid">
                <ReviewCard review={r} titles={titleMap} orgNames={orgNameMap} now={now} permitted={permitted} onModerate={(action) => setTarget({ review: r, action })} />
              </li>
            ))}
          </ul>
        </>
      )}
      {ready && truncated ? <Truncated shown={records.length} order={order} /> : null}
      {ready && !permitted ? (
        <div>
          <ReadOnly role={role} what="reviews" />
        </div>
      ) : null}

      <ModerateSheet target={target} onClose={() => setTarget(null)} />
    </PageContainer>
  );
}

function ReviewCard({ review: r, titles, orgNames, now, permitted, onModerate }: { review: ModReview; titles: Record<string, string | null>; orgNames: Record<string, string | null>; now: Date | null; permitted: boolean; onModerate: (a: ModerationAction) => void }) {
  const hidden = r.status === "hidden";
  const action = moderationAction(r.status);
  const org = r.orgId ? nameOrId(r.orgId, orgNames) : null;
  return (
    <article className={cn("glass rounded-card p-5", hidden && "border-dashed opacity-80")}>
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <Stars value={r.rating} tone="volt" />
        <span className="num text-[13px] font-bold text-text">{r.rating ?? "—"}</span>
        {hidden ? <Badge tone="muted">Hidden</Badge> : r.status === "published" ? null : <Badge tone="muted">{r.status ?? "—"}</Badge>}
        <span className="ml-auto text-[12px] text-text-3" title={formatDateTime(r.postedAt)}>
          {now ? relTime(r.postedAt, now) : "—"}
        </span>
      </div>
      <p className={cn("mt-3 whitespace-pre-line break-words text-[14px] leading-[1.6]", r.comment ? "text-text" : "italic text-text-3")}>{r.comment ? `“${r.comment}”` : "No comment"}</p>
      <div className="mt-4 flex flex-col gap-1 border-t border-line-soft pt-3 text-[12px] text-text-3">
        <span>
          from <b className="font-semibold text-text-2">{r.author ?? "—"}</b>
        </span>
        <span className="min-w-0 truncate">
          on <EventLink id={r.eventId} titles={titles} />
        </span>
        {r.orgId && org ? (
          <span className="min-w-0 truncate">
            by{" "}
            <Link href={`/partners/${encodeURIComponent(r.orgId)}`} className={cn("focus-ring rounded-[6px] underline-offset-2 hover:text-text hover:underline", org.isName ? "font-semibold text-text-2" : "font-mono text-[12px] text-text-2")}>
              {org.text}
            </Link>
          </span>
        ) : null}
      </div>
      {r.moderationReason ? (
        <p className="mt-3 flex items-start gap-2 rounded-[12px] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-[12px] leading-5 text-text-2">
          <Gavel aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-3" />
          <span className="min-w-0 break-words">
            {r.moderationReason}
            {r.moderatedAt && now ? <span className="text-text-3"> · {relTime(r.moderatedAt, now)}</span> : null}
          </span>
        </p>
      ) : null}
      {permitted ? (
        <div className="mt-4 flex justify-end">
          <Button size="sm" variant={action.status === "hidden" ? "danger" : "ghost"} icon={action.status === "hidden" ? <EyeOff /> : <Eye />} onClick={() => onModerate(action)}>
            {action.label}
          </Button>
        </div>
      ) : null}
    </article>
  );
}

function ModerateSheet({ target, onClose }: { target: { review: ModReview; action: ModerationAction } | null; onClose: () => void }) {
  const toast = useToast();
  const book = useRef(new RequestIdBook("review"));
  const confirm = async (reason: string) => {
    if (!target) return;
    const { review, action } = target;
    try {
      const result = await moderateReview({ requestId: book.current.idFor(reviewModerationKey(review, action.status)), reviewId: review.id, status: action.status, reason });
      book.current.reset();
      toast.show({ tone: result.status === "hidden" ? "info" : "ok", title: `Review ${result.status === "hidden" ? "hidden" : "published"}`, body: review.author ? `By ${review.author}.` : undefined });
    } catch (cause) {
      rethrowForSheet(cause, book.current);
    }
  };
  return (
    <Sheet
      open={!!target}
      title={target ? `${target.action.label} this review?` : ""}
      description={target?.action.consequence}
      confirmLabel={target ? `${target.action.label} review` : ""}
      tone={target?.action.tone ?? "danger"}
      requireReason
      minReason={10}
      reasonLabel="Reason (kept in the audit trail)"
      onConfirm={confirm}
      onClose={onClose}
    />
  );
}
