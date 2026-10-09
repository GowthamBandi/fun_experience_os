"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, AtSign, BadgeCheck, CalendarDays, MapPin } from "lucide-react";
import { Avatar, Badge, Card, CopyIdPill, Empty, ErrorState, Skeleton, Stat, Tabs, type TabItem } from "@/components/pulse";
import { BackLink } from "@/components/shell/BackLink";
import { PageContainer } from "@/components/shell/PageContainer";
import { artFor } from "@/lib/approvals";
import { formatDate } from "@/lib/console/records";
import { useAdminSession } from "@/lib/firebase/auth";
import { inrMinor } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { agreementSummary, averageRating, mergeOrganizer, orgStatusBadge, orgTimeline, sortMembers, toMember, toOrgEvent, toOrgExperience } from "@/lib/organizers";
import {
  countOrgEvents,
  fetchMemberPeople,
  orgAgreementsQuery,
  orgAuditQuery,
  orgCommercialsQuery,
  orgEventsQuery,
  orgExperiencesQuery,
  orgMembershipsQuery,
  orgResourceAuditQuery,
  orgReviewsQuery,
  orgSettlementsQuery,
} from "@/lib/organizers-firestore";
import { useLiveDocument } from "@/lib/use-governance";
import { useMetric } from "@/lib/use-metric";
import { useTabParam } from "@/lib/use-search-param";
import { useBoundedQuery, useOneShot } from "@/lib/use-query";
import { categoryEmoji, countFull } from "@/lib/overview";
import { EventsTab, ExperiencesTab, MoneyTab, TeamTab, TimelineTab, docRow } from "./OrganizerTabs";
import { OrganizerActions } from "./OrganizerActions";

type TabId = "events" | "experiences" | "money" | "team" | "timeline";
const TAB_IDS: TabId[] = ["events", "experiences", "money", "team", "timeline"];
const AUDIT_MAX = 100;


export function Organizer360({ orgId }: { orgId: string }) {
  // Remounting re-subscribes the live documents (the retry for a failed listener).
  const [attempt, setAttempt] = useState(0);
  return (
    <Suspense fallback={<Loading />}>
      <View key={`${orgId}-${attempt}`} orgId={orgId} onRetry={() => setAttempt((n) => n + 1)} />
    </Suspense>
  );
}

function Loading() {
  return (
    <PageContainer className="flex flex-col gap-5">
      <Skeleton className="h-8 w-40 rounded-pill" />
      <Skeleton className="h-[220px] rounded-card" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[132px] rounded-card" />
        ))}
      </div>
      <Skeleton className="h-11 w-[420px] max-w-full rounded-pill" />
      <Skeleton className="h-[320px] rounded-card" />
    </PageContainer>
  );
}

function View({ orgId, onRetry }: { orgId: string; onRetry: () => void }) {
  const params = useSearchParams();
  const [tab, setTab] = useTabParam(TAB_IDS, "events");
  const now = useNow(60_000);
  const { consoleRole } = useAdminSession();

  const org = useLiveDocument("organizers", orgId);
  const pub = useLiveDocument("publicOrganizers", orgId);

  const gross = useMetric("grossBookings", undefined, false, orgId);
  const refunds = useMetric("refundsAmount", undefined, false, orgId);
  const eventCount = useOneShot(`org-events-count|${orgId}`, () => countOrgEvents(orgId));
  const reviews = useBoundedQuery(`org-reviews|${orgId}`, () => orgReviewsQuery(orgId), (_id, d) => d);
  const events = useBoundedQuery(`org-events|${orgId}`, () => orgEventsQuery(orgId), toOrgEvent);
  const experiences = useBoundedQuery(`org-experiences|${orgId}`, () => orgExperiencesQuery(orgId), toOrgExperience);
  const agreements = useBoundedQuery(`org-agreements|${orgId}`, () => orgAgreementsQuery(orgId), docRow);
  const commercials = useBoundedQuery(`org-commercials|${orgId}`, () => orgCommercialsQuery(orgId), docRow);
  const settlements = useBoundedQuery(`org-settlements|${orgId}`, () => orgSettlementsQuery(orgId), docRow);
  const members = useBoundedQuery(`org-members|${orgId}`, () => orgMembershipsQuery(orgId), toMember);
  const auditByOrg = useBoundedQuery(`org-audit|${orgId}`, () => orgAuditQuery(orgId), docRow, AUDIT_MAX);
  const auditOnOrg = useBoundedQuery(`org-audit-resource|${orgId}`, () => orgResourceAuditQuery(orgId), docRow, AUDIT_MAX);

  const memberRows = useMemo(() => sortMembers(members.rows), [members.rows]);
  const uids = memberRows.map((m) => m.uid);
  const names = useOneShot(uids.length ? `org-member-names|${uids.join(",")}` : null, () => fetchMemberPeople(uids));
  const eventTitles = useMemo(() => new Map(events.rows.map((e) => [e.id, e.title])), [events.rows]);
  const rating = useMemo(() => averageRating(reviews.rows), [reviews.rows]);
  const timeline = useMemo(() => orgTimeline(auditByOrg.rows, auditOnOrg.rows), [auditByOrg.rows, auditOnOrg.rows]);
  const terms = agreementSummary(agreements.rows).current?.raw ?? null;
  // The organizer doc is live; these lists are one-shot reads, so re-read them after an action.
  const afterAction = () => {
    agreements.retry();
    auditByOrg.retry();
    auditOnOrg.retry();
  };


  if (org.loading) return <Loading />;
  if (org.error) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <BackLink href="/partners" label="Organizers" />
        <Card>
          <ErrorState message={org.error} onRetry={onRetry} />
        </Card>
      </PageContainer>
    );
  }
  if (!org.data) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <BackLink href="/partners" label="Organizers" />
        <Card>
          <Empty emoji="🔎" title="Organizer not found" body={`There's no organizer with the ID ${orgId}. It may have been removed, or the link is wrong.`} action={<Link href="/partners" className="focus-ring inline-flex h-10 items-center rounded-[14px] border border-line bg-surface-high px-4 text-[13px] font-semibold text-text hover:bg-surface-top">Back to organizers</Link>} />
        </Card>
      </PageContainer>
    );
  }

  const card = mergeOrganizer(orgId, org.data, pub.data);
  const badge = orgStatusBadge(card.status);
  const about = typeof pub.data?.about === "string" && pub.data.about.trim() ? pub.data.about : typeof org.data.about === "string" && org.data.about.trim() ? org.data.about : null;
  const accent = artFor(card.categories[0] ?? null).color;
  const suspended = card.status === "paused" || card.status === "blocked";
  const statusReason = typeof org.data.statusReason === "string" && org.data.statusReason.trim() ? org.data.statusReason : null;

  const ratingHint = reviews.truncated ? `newest ${reviews.rows.length} reviews` : rating.count ? `from ${rating.count} ${rating.count === 1 ? "review" : "reviews"}` : "No reviews yet";
  const tabs: TabItem[] = [
    { id: "events", label: "Events", count: events.loading || events.error ? undefined : events.rows.length },
    { id: "experiences", label: "Experiences", count: experiences.loading || experiences.error ? undefined : experiences.rows.length },
    { id: "money", label: "Money" },
    { id: "team", label: "Team", count: members.loading || members.error ? undefined : members.rows.length },
    { id: "timeline", label: "Timeline" },
  ];

  return (
    <PageContainer className="flex flex-col gap-5">
      <BackLink href="/partners" label="Organizers" />

      <Card as="header" className="overflow-hidden p-6 lg:p-7">
        <span aria-hidden className="pointer-events-none absolute -left-16 -top-24 h-72 w-72 rounded-full opacity-25 blur-3xl" style={{ background: accent }} />
        <span aria-hidden className="pointer-events-none absolute -right-20 -bottom-28 h-72 w-72 rounded-full bg-primary opacity-[0.16] blur-3xl" />
        <div className="relative flex flex-wrap items-start gap-x-6 gap-y-5">
          <div className="flex min-w-0 flex-1 basis-[420px] items-start gap-4 sm:gap-5">
            <div className="relative shrink-0">
              <Avatar name={card.name} size={84} className="shadow-[0_18px_44px_-18px_rgba(142,114,255,0.8)]" />
              {card.verified ? (
                <span className="absolute -bottom-1 -right-1 grid h-7 w-7 place-items-center rounded-full border-2 border-[#1A1726] bg-info text-ink" title="Verified">
                  <BadgeCheck aria-hidden className="h-4 w-4" />
                </span>
              ) : null}
            </div>
            <div className="min-w-0 flex-1">
              <div className="overline font-semibold">Organizer</div>
              <h1 className="mt-1 break-words font-display text-[34px] font-bold leading-[1.05] tracking-[-0.03em] text-text sm:text-[40px]">{card.name}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Badge tone={badge.tone} className="text-[12px]">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
                  {badge.label}
                </Badge>
                {card.verified === true ? (
                  <Badge tone="info" className="text-[12px]">
                    <BadgeCheck aria-hidden className="h-3.5 w-3.5" />
                    Verified
                  </Badge>
                ) : card.verified === false ? (
                  <Badge tone="muted" className="text-[12px]">
                    Not verified
                  </Badge>
                ) : (
                  <Badge tone="muted" className="text-[12px]">
                    Verified: —
                  </Badge>
                )}
                {card.categories.map((c) => (
                  <Badge key={c} tone="muted" className="text-[12px] capitalize">
                    <span aria-hidden>{categoryEmoji(c)}</span>
                    {c}
                  </Badge>
                ))}
              </div>
              <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-text-2">
                <li className="inline-flex items-center gap-1.5">
                  <MapPin aria-hidden className="h-3.5 w-3.5 text-text-3" />
                  {card.city ?? "—"}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <AtSign aria-hidden className="h-3.5 w-3.5 text-text-3" />
                  {card.handle ?? "—"}
                </li>
                <li className="inline-flex items-center gap-1.5">
                  <CalendarDays aria-hidden className="h-3.5 w-3.5 text-text-3" />
                  Hosting since {card.since ? formatDate(card.since) : "—"}
                </li>
                <li>
                  <CopyIdPill id={orgId} noun="organizer" />
                </li>
              </ul>
              {pub.error ? (
                <p role="status" className="mt-3 text-[12px] text-warn">
                  Public profile couldn&apos;t load, so verified shows —. {pub.error}
                </p>
              ) : !pub.loading && !pub.data ? (
                <p className="mt-3 text-[12px] text-text-3">No public profile on record, so verified shows —.</p>
              ) : null}
              {about ? <p className="mt-4 max-w-2xl text-[14px] leading-[1.55] text-text-2">{about}</p> : null}
            </div>
          </div>
          <div className="flex w-full flex-col items-start gap-2 lg:w-auto lg:items-end">
            <OrganizerActions
              orgId={orgId}
              org={org.data}
              name={card.name}
              role={consoleRole}
              currentBps={typeof terms?.commissionBps === "number" ? terms.commissionBps : null}
              currentCadence={typeof terms?.payoutCadence === "string" ? terms.payoutCadence : null}
              onChanged={afterAction}
            />
            <span className="text-[12px] text-text-3">Version {card.version}</span>
          </div>
        </div>
        {suspended ? (
          <div role="status" className="relative mt-5 flex items-start gap-2.5 rounded-control border border-[rgba(255,184,77,0.3)] bg-[rgba(255,184,77,0.08)] px-4 py-3 text-[13px] leading-5 text-[#FFD9A0]">
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <span>
              <b className="font-semibold text-text">{card.status === "paused" ? "Paused" : "Blocked"}.</b> They can&apos;t publish or sell until reactivated.
              {statusReason ? <> Reason: “{statusReason}”</> : null}
            </span>
          </div>
        ) : null}
      </Card>

      <section aria-label="Key numbers" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Gross bookings" value={inrMinor(gross.value)} hint="All time · captured payments" loading={gross.loading} error={gross.error} onRetry={gross.retry} />
        <Stat label="Events" value={countFull(eventCount.value)} hint="All statuses" loading={eventCount.loading} error={eventCount.error} onRetry={eventCount.retry} />
        <Stat
          label="Average rating"
          value={rating.average !== null ? `${rating.average.toFixed(1)}★` : "—"}
          hint={ratingHint}
          loading={reviews.loading}
          error={reviews.error}
          onRetry={reviews.retry}
        />
        <Stat label="Refunds" value={inrMinor(refunds.value)} hint="All time · refunded to customers" loading={refunds.loading} error={refunds.error} onRetry={refunds.retry} />
      </section>

      <Tabs tabs={tabs} value={tab} onChange={setTab} label="Organizer sections" className="self-start" />

      <div role="tabpanel" aria-label={tabs.find((t) => t.id === tab)?.label}>
        {tab === "events" ? <EventsTab q={events} /> : null}
        {tab === "experiences" ? <ExperiencesTab q={experiences} now={now} /> : null}
        {tab === "money" ? <MoneyTab agreements={agreements} commercials={commercials} settlements={settlements} eventTitles={eventTitles} /> : null}
        {tab === "team" ? <TeamTab q={{ ...members, rows: memberRows }} names={names} /> : null}
        {tab === "timeline" ? (
          <TimelineTab
            items={timeline}
            loading={auditByOrg.loading || auditOnOrg.loading}
            error={auditByOrg.error ?? auditOnOrg.error}
            truncated={auditByOrg.truncated || auditOnOrg.truncated}
            onRetry={() => {
              auditByOrg.retry();
              auditOnOrg.retry();
            }}
          />
        ) : null}
      </div>
    </PageContainer>
  );
}
