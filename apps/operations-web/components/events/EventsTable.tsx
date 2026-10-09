"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Info, Layers, MapPin, Search, X } from "lucide-react";
import { Card, Chip, DataTable, Empty, ErrorState, PageHeader, SkeletonRows, Tabs, Truncated, type Column, type TabItem } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { artFor } from "@/lib/approvals";
import { DRAFT_STATUSES, EVENT_TABS, eventWhen, facets, filterEvents, parseEventTab, partitionEvents, sortForTab, startsRel, type EventTab } from "@/lib/events";
import { countEventTabs, eventsByStatusQuery, experienceEventsQuery, openEventsQuery } from "@/lib/events-firestore";
import { cn } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { toOrgEvent, type OrgEventRow } from "@/lib/organizers";
import { categoryEmoji } from "@/lib/overview";
import { useLiveDocument } from "@/lib/use-governance";
import { useBoundedQuery, useOneShot } from "@/lib/use-query";
import { useSearchParamSetter } from "@/lib/use-search-param";
import { EventStatusBadge, EventTitleCell, FillCell, priceLabel } from "./cells";

const TAB_STATUSES: Partial<Record<EventTab, readonly string[]>> = { past: ["completed"], drafts: DRAFT_STATUSES, cancelled: ["cancelled"] };

const TAB_EMPTY: Record<EventTab, { emoji: string; title: string; body: string }> = {
  upcoming: { emoji: "🗓️", title: "Nothing on sale", body: "Published events that haven't started yet show up here, soonest first." },
  live: { emoji: "🌙", title: "Nothing live right now", body: "Events running now, or moved to the live phase by their organizer, show up here." },
  past: { emoji: "📼", title: "No past events yet", body: "Completed events, and published ones whose end time has gone by, land here." },
  drafts: { emoji: "✏️", title: "No drafts or reviews", body: "Events still being written, waiting for review or approved but not yet published." },
  cancelled: { emoji: "🧯", title: "Nothing cancelled", body: "Cancelled events, by their organizer or by PULSE, show up here." },
};

const categoryLabel = (c: string) => (artFor(c).label === "Experience" ? c : artFor(c).label);

export function EventsTable() {
  return (
    <Suspense fallback={<Shell />}>
      <View />
    </Suspense>
  );
}

function Shell() {
  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader overline="Marketplace" title="Experiences & Events" />
      <DataTable rows={[]} columns={[{ key: "x", header: "Event", cell: () => null }]} rowKey={() => ""} loading />
    </PageContainer>
  );
}

function View() {
  const params = useSearchParams();
  const router = useRouter();
  const setParam = useSearchParamSetter();
  const now = useNow(60_000);
  const experienceId = params.get("experience");
  const bookingId = params.get("booking");
  const tab = parseEventTab(params.get("tab"));

  const [city, setCity] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // ⌘K booking hits without an eventId land here: look the booking up and forward to its event.
  const booking = useLiveDocument(bookingId ? "bookings" : null, bookingId);
  const bookingEvent = typeof booking.data?.eventId === "string" && booking.data.eventId ? booking.data.eventId : null;
  useEffect(() => {
    if (bookingId && bookingEvent) router.replace(`/events/${encodeURIComponent(bookingEvent)}?booking=${encodeURIComponent(bookingId)}`);
  }, [bookingId, bookingEvent, router]);

  const experience = useLiveDocument(experienceId ? "experiences" : null, experienceId);
  const byExperience = useBoundedQuery(experienceId ? `events-exp|${experienceId}` : null, () => experienceEventsQuery(experienceId ?? ""), toOrgEvent);
  const open = useBoundedQuery(experienceId ? null : "events-open", openEventsQuery, toOrgEvent);
  const statuses = experienceId ? undefined : TAB_STATUSES[tab];
  const byStatus = useBoundedQuery(statuses ? `events-status|${statuses.join(",")}` : null, () => eventsByStatusQuery(statuses ?? []), toOrgEvent);
  const counts = useOneShot(experienceId ? null : "events-tab-counts", countEventTabs);

  const openParts = useMemo(() => (now ? partitionEvents(open.rows, now) : null), [open.rows, now]);
  const expParts = useMemo(() => (now ? partitionEvents(byExperience.rows, now) : null), [byExperience.rows, now]);

  // The rows behind the selected tab, and the query whose loading/error/truncated state they share.
  const source = experienceId ? byExperience : tab === "upcoming" || tab === "live" ? open : byStatus;
  const tabRows = useMemo<OrgEventRow[]>(() => {
    if (experienceId) return expParts?.[tab] ?? [];
    if (!openParts) return [];
    if (tab === "upcoming" || tab === "live") return openParts[tab];
    if (tab === "past") return sortForTab([...byStatus.rows, ...openParts.past], "past");
    return byStatus.rows;
  }, [experienceId, expParts, openParts, tab, byStatus.rows]);
  const loading = source.loading || !now || (tab === "past" && !experienceId && open.loading);
  const error = source.error ?? (tab === "past" && !experienceId ? open.error : null);
  const retry = () => {
    source.retry();
    if (tab === "past" && !experienceId) open.retry();
  };

  const cityFacets = useMemo(() => facets(tabRows, "city"), [tabRows]);
  const categoryFacets = useMemo(() => facets(tabRows, "category"), [tabRows]);
  const shown = useMemo(() => filterEvents(tabRows, { city, category, search }), [tabRows, city, category, search]);
  const filtering = !!(city || category || search.trim());

  const tabCount = (id: EventTab): number | undefined => {
    if (experienceId) return expParts && !byExperience.loading && !byExperience.error ? expParts[id].length : undefined;
    if (id === "upcoming" || id === "live") return openParts && !open.loading && !open.error ? openParts[id].length : undefined;
    if (counts.loading || counts.error || !counts.value) return undefined;
    if (id === "past") return openParts && !open.loading && !open.error ? counts.value.completed + openParts.past.length : undefined;
    return counts.value[id as "drafts" | "cancelled"];
  };
  const tabs: TabItem[] = EVENT_TABS.map((t) => ({ id: t.id, label: t.label, count: tabCount(t.id) }));
  const liveCount = experienceId ? expParts?.live.length ?? 0 : openParts?.live.length ?? 0;


  const columns: Array<Column<OrgEventRow>> = [
    { key: "title", header: "Event", sort: (a, b) => a.title.localeCompare(b.title), cell: (e) => <EventTitleCell e={e} /> },
    {
      key: "organizer",
      header: "Organizer",
      sort: (a, b) => (a.organizerName ?? "").localeCompare(b.organizerName ?? ""),
      cell: (e) =>
        e.orgId ? (
          <Link href={`/partners/${e.orgId}`} className="focus-ring block max-w-[200px] truncate rounded-[8px] text-[13px] font-medium text-text-2 underline-offset-2 hover:text-text hover:underline">
            {e.organizerName ?? "—"}
          </Link>
        ) : (
          <span className="text-text-3">{e.organizerName ?? "—"}</span>
        ),
    },
    {
      key: "city",
      header: "City",
      sort: (a, b) => (a.city ?? "").localeCompare(b.city ?? ""),
      cell: (e) => <span className="whitespace-nowrap text-[13px] text-text-2">{e.city ?? "—"}</span>,
    },
    {
      key: "starts",
      header: "Starts",
      sort: (a, b) => (a.startsAt?.getTime() ?? 0) - (b.startsAt?.getTime() ?? 0),
      cell: (e) => (
        <div className="whitespace-nowrap">
          <div className="text-[13px] font-semibold text-text">{now ? startsRel(e.startsAt, now) : "—"}</div>
          <div className="text-[12px] text-text-3">{eventWhen(e.startsAt)}</div>
        </div>
      ),
    },
    { key: "fill", header: "Fill", width: "160px", sort: (a, b) => (a.capacity ? (a.sold ?? 0) / a.capacity : -1) - (b.capacity ? (b.sold ?? 0) / b.capacity : -1), cell: (e) => <FillCell e={e} /> },
    { key: "price", header: "Price", align: "right", sort: (a, b) => (a.priceMinor ?? -1) - (b.priceMinor ?? -1), cell: (e) => priceLabel(e.priceMinor) },
    { key: "status", header: "Status", cell: (e) => <EventStatusBadge status={e.status} /> },
  ];

  const experienceTitle = typeof experience.data?.title === "string" && experience.data.title.trim() ? experience.data.title : null;

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        overline="Marketplace"
        title={
          <>
            Experiences &amp; Events
            {liveCount > 0 ? (
              <>
                {" "}
                <em className="hl">{liveCount} live</em>
              </>
            ) : null}
          </>
        }
        subtitle="Every event on PULSE, from drafts to sold-out nights. Open one for its bookings, check-ins, money and audit trail."
      />

      {bookingId && !bookingEvent ? (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-control border border-dashed border-line px-3.5 py-2.5 text-[13px] text-text-2">
          {booking.loading ? (
            <>
              <Info aria-hidden className="h-4 w-4 shrink-0 text-info" />
              Finding booking <code className="font-mono text-text">{bookingId}</code>…
            </>
          ) : (
            <>
              <AlertTriangle aria-hidden className="h-4 w-4 shrink-0 text-warn" />
              {booking.error
                ? `Booking ${bookingId} couldn't load: ${booking.error}`
                : booking.data
                  ? `Booking ${bookingId} has no event on record.`
                  : `There's no booking with the ID ${bookingId}.`}
              <button type="button" onClick={() => setParam("booking", null)} className="focus-ring rounded-[8px] font-semibold text-text underline-offset-2 hover:underline">
                Dismiss
              </button>
            </>
          )}
        </p>
      ) : null}

      {experienceId ? (
        <div className="glass flex flex-wrap items-center gap-3 rounded-control px-4 py-3" data-testid="experience-filter">
          <span aria-hidden className="grid h-9 w-9 place-items-center rounded-[12px] bg-[rgba(142,114,255,0.16)] text-primary">
            <Layers className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3">Experience</div>
            <div className="truncate font-display text-[15px] font-bold text-text">
              {experience.loading ? "…" : experienceTitle ?? (experience.data ? "Untitled experience" : `Not found · ${experienceId}`)}
              {experience.data && typeof experience.data.category === "string" ? <span className="ml-2 font-sans text-[13px] font-medium text-text-3">{categoryEmoji(experience.data.category)} {categoryLabel(experience.data.category)}</span> : null}
            </div>
          </div>
          <span className="text-[12px] text-text-3">Showing only events scheduled from this experience</span>
          <button type="button" onClick={() => setParam("experience", null)} className="focus-ring inline-flex h-8 items-center gap-1.5 rounded-pill border border-line px-3 text-[12px] font-semibold text-text-2 hover:text-text">
            <X aria-hidden className="h-3.5 w-3.5" />
            Show all events
          </button>
        </div>
      ) : null}

      <Tabs tabs={tabs} value={tab} onChange={(id) => setParam("tab", id === "upcoming" ? null : id)} label="Event phases" className="self-start" />

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <div role="group" aria-label="Filter by city" className="flex flex-wrap items-center gap-2">
            <Chip selected={city === null} onClick={() => setCity(null)}>
              <MapPin aria-hidden className="h-3.5 w-3.5" />
              All cities
            </Chip>
            {cityFacets.map((f) => (
              <Chip key={f.value} selected={city === f.value} onClick={() => setCity(city === f.value ? null : f.value)}>
                {f.value}
                <Count n={f.count} selected={city === f.value} />
              </Chip>
            ))}
            {city && !cityFacets.some((f) => f.value === city) ? (
              <Chip selected onClick={() => setCity(null)}>
                {city}
                <Count n={0} selected />
              </Chip>
            ) : null}
          </div>
          <label className="field ml-auto flex h-10 w-full items-center gap-2 rounded-control px-3.5 sm:w-[300px]">
            <Search aria-hidden className="h-4 w-4 shrink-0 text-text-3" />
            <span className="sr-only">Search events</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search title, organizer, venue…"
              className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-text-3 [&::-webkit-search-cancel-button]:hidden"
            />
            {search ? (
              <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="focus-ring grid h-6 w-6 place-items-center rounded-[8px] text-text-3 hover:text-text">
                <X aria-hidden className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </label>
        </div>
        {categoryFacets.length || category ? (
          <div role="group" aria-label="Filter by category" className="flex flex-wrap items-center gap-2">
            <Chip selected={category === null} onClick={() => setCategory(null)}>
              All categories
            </Chip>
            {categoryFacets.map((f) => (
              <Chip key={f.value} selected={category === f.value} onClick={() => setCategory(category === f.value ? null : f.value)}>
                <span aria-hidden>{categoryEmoji(f.value)}</span>
                {categoryLabel(f.value)}
                <Count n={f.count} selected={category === f.value} />
              </Chip>
            ))}
            {category && !categoryFacets.some((f) => f.value === category) ? (
              <Chip selected onClick={() => setCategory(null)}>
                {categoryEmoji(category)} {categoryLabel(category)}
                <Count n={0} selected />
              </Chip>
            ) : null}
          </div>
        ) : null}
      </div>

      <div role="tabpanel" aria-label={EVENT_TABS.find((t) => t.id === tab)?.label}>
        {loading ? (
          <DataTable rows={[]} columns={columns} rowKey={(e) => e.id} loading />
        ) : error ? (
          <Card>
            <ErrorState message={error} onRetry={retry} />
          </Card>
        ) : shown.length === 0 ? (
          <Card>
            {filtering ? (
              <Empty
                emoji="🔎"
                title="No events match"
                body={`Nothing in ${EVENT_TABS.find((t) => t.id === tab)?.label} matches${search.trim() ? ` “${search.trim()}”` : ""}${city ? ` in ${city}` : ""}${category ? ` for ${categoryLabel(category)}` : ""}.`}
                action={
                  <button
                    type="button"
                    onClick={() => {
                      setCity(null);
                      setCategory(null);
                      setSearch("");
                    }}
                    className="focus-ring inline-flex h-10 items-center rounded-[14px] border border-line bg-surface-high px-4 text-[13px] font-semibold text-text hover:bg-surface-top"
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <Empty {...TAB_EMPTY[tab]} />
            )}
          </Card>
        ) : (
          <>
            <p className="sr-only" role="status">
              {shown.length} {shown.length === 1 ? "event" : "events"} shown
            </p>
            <DataTable rows={shown} columns={columns} rowKey={(e) => e.id} onRowClick={(e) => router.push(`/events/${e.id}`)} caption={`${EVENT_TABS.find((t) => t.id === tab)?.label} events`} className="max-h-[72vh]" />
          </>
        )}
        {!loading && !error && (source.truncated || (tab === "past" && !experienceId && open.truncated)) ? <Truncated shown={tabRows.length} className="mt-4" /> : null}
        {!loading && !error && !experienceId && counts.error ? (
          <p role="status" className="mt-4 flex flex-wrap items-center gap-2 text-[12px] text-warn">
            <AlertTriangle aria-hidden className="h-3.5 w-3.5" />
            Tab counts couldn&apos;t load ({counts.error}).
            <button type="button" onClick={counts.retry} className={cn("focus-ring rounded-[8px] font-semibold text-text underline-offset-2 hover:underline")}>
              Retry
            </button>
          </p>
        ) : null}
      </div>
    </PageContainer>
  );
}

function Count({ n, selected }: { n: number; selected: boolean }) {
  return (
    <span
      className={cn(
        "inline-grid h-[18px] min-w-[18px] place-items-center rounded-pill px-1.5 font-display text-[11px] font-bold leading-none",
        selected ? "bg-ink text-text" : "bg-[rgba(255,255,255,0.08)] text-text-2",
      )}
    >
      {n}
    </span>
  );
}
