"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BadgeCheck, CalendarDays, Info, MapPin, Search, Star, X } from "lucide-react";
import { Avatar, Badge, Card, Chip, Empty, ErrorState, PageHeader, Skeleton, Truncated } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { artFor } from "@/lib/approvals";
import { formatDate } from "@/lib/console/records";
import { cn } from "@/lib/format";
import { ORG_FILTERS, filterOrganizers, mergeOrganizer, orgCounts, orgStatusBadge, sortOrganizers, type OrgCard, type OrgFilter } from "@/lib/organizers";
import { publicOrganizersQuery } from "@/lib/organizers-firestore";
import { categoryEmoji } from "@/lib/overview";
import { QUERY_LIMIT } from "@/lib/governance-api";
import { useGovernanceCollection } from "@/lib/use-governance";
import { useBoundedQuery } from "@/lib/use-query";

const FILTER_EMPTY: Record<OrgFilter, { emoji: string; title: string; body: string }> = {
  all: { emoji: "🪩", title: "No organizers yet", body: "Hosts appear here once their KYC is approved in Approvals." },
  active: { emoji: "😴", title: "No active organizers", body: "Nobody is hosting right now." },
  paused: { emoji: "⏸️", title: "Nobody is paused", body: "Paused organizers can't publish or sell until reactivated." },
  blocked: { emoji: "🛡️", title: "Nobody is blocked", body: "All clear: no organizer is blocked from the marketplace." },
};

export function OrganizerGrid() {
  const { records, loading, error, truncated, refresh, order } = useGovernanceCollection("organizers");
  // Display fields come from the public projection; if it fails the organizer doc's own fields are used.
  const pubs = useBoundedQuery("public-organizers", publicOrganizersQuery, (id, data) => ({ id, data }), QUERY_LIMIT);
  const [filter, setFilter] = useState<OrgFilter>("all");
  const [search, setSearch] = useState("");

  const cards = useMemo(() => {
    const byId = new Map(pubs.rows.map((p) => [p.id, p.data]));
    return sortOrganizers(records.map((r) => mergeOrganizer(r.id, r.raw, byId.get(r.id))));
  }, [records, pubs.rows]);
  const counts = useMemo(() => orgCounts(cards), [cards]);
  const shown = useMemo(() => filterOrganizers(cards, filter, search), [cards, filter, search]);
  const ready = !loading && !error;

  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        overline="Marketplace"
        title={
          <>
            Organizers
            {ready && counts.active > 0 ? (
              <>
                {" "}
                <em className="hl">{counts.active} hosting</em>
              </>
            ) : null}
          </>
        }
        subtitle="Every approved host on PULSE. Open one for its money, team, events and audit trail."
      />

      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Filter by status" className="flex flex-wrap items-center gap-2">
          {ORG_FILTERS.map((f) => (
            <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
              <span
                className={cn(
                  "inline-grid h-[18px] min-w-[18px] place-items-center rounded-pill px-1.5 font-display text-[11px] font-bold leading-none",
                  filter === f.id ? "bg-ink text-text" : "bg-[rgba(255,255,255,0.08)] text-text-2",
                )}
              >
                {ready ? counts[f.id] : "·"}
              </span>
            </Chip>
          ))}
        </div>
        <label className="field ml-auto flex h-10 w-full items-center gap-2 rounded-control px-3.5 sm:w-[320px]">
          <Search aria-hidden className="h-4 w-4 shrink-0 text-text-3" />
          <span className="sr-only">Search organizers</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, city, category…"
            className="h-full min-w-0 flex-1 bg-transparent text-[14px] text-text outline-none placeholder:text-text-3 [&::-webkit-search-cancel-button]:hidden"
          />
          {search ? (
            <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="focus-ring grid h-6 w-6 place-items-center rounded-[8px] text-text-3 hover:text-text">
              <X aria-hidden className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </label>
      </div>

      {loading ? (
        <div aria-busy="true" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="glass rounded-card p-5" style={{ opacity: 1 - i * 0.1 }}>
              <div className="flex items-center gap-3">
                <Skeleton className="h-[52px] w-[52px] rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-2/3 rounded-pill" />
                  <Skeleton className="h-3 w-1/3 rounded-pill" />
                </div>
              </div>
              <Skeleton className="mt-5 h-7 w-1/2 rounded-pill" />
              <Skeleton className="mt-5 h-3 w-full rounded-pill" />
            </div>
          ))}
          <span className="sr-only" role="status">
            Loading organizers…
          </span>
        </div>
      ) : error ? (
        <Card>
          <ErrorState message={error} onRetry={refresh} />
        </Card>
      ) : shown.length === 0 ? (
        <Card>
          {search.trim() ? (
            <Empty emoji="🔎" title={`No match for “${search.trim()}”`} body="Try a name, city or category, or clear the search." />
          ) : (
            <Empty {...FILTER_EMPTY[filter]} />
          )}
        </Card>
      ) : (
        <>
          <p className="sr-only" role="status">
            {shown.length} {shown.length === 1 ? "organizer" : "organizers"} shown
          </p>
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((card) => (
              <li key={card.id} className="min-w-0">
                <OrganizerCard card={card} />
              </li>
            ))}
          </ul>
        </>
      )}
      {ready && truncated ? <Truncated shown={records.length} order={order} /> : null}
      {ready && pubs.error ? (
        <p role="status" className="flex flex-wrap items-center gap-2 rounded-control border border-dashed border-[rgba(255,184,77,0.35)] px-3.5 py-2.5 text-[12px] text-warn">
          <AlertTriangle aria-hidden className="h-3.5 w-3.5 shrink-0" />
          <span>Public profiles couldn&apos;t load ({pubs.error}), so verified and ratings show —.</span>
          <button type="button" onClick={pubs.retry} className="focus-ring rounded-[8px] font-semibold text-text underline-offset-2 hover:underline">
            Retry
          </button>
        </p>
      ) : ready && pubs.truncated ? (
        <p role="status" className="flex items-center gap-2 rounded-control border border-dashed border-line px-3.5 py-2.5 text-[12px] text-text-3">
          <Info aria-hidden className="h-3.5 w-3.5 shrink-0 text-info" />
          <span>Only the first {pubs.rows.length} public profiles loaded; organizers beyond that show — for verified and ratings.</span>
        </p>
      ) : null}
    </PageContainer>
  );
}

function OrganizerCard({ card }: { card: OrgCard }) {
  const badge = orgStatusBadge(card.status);
  const accent = artFor(card.categories[0] ?? null).color;
  return (
    <Card as={Link} href={`/partners/${card.id}`} interactive className="group flex h-full flex-col overflow-hidden">
      <span
        aria-hidden
        className="pointer-events-none absolute -right-10 -top-14 h-40 w-40 rounded-full opacity-25 blur-2xl transition-opacity duration-200 ease-pulse group-hover:opacity-45"
        style={{ background: accent }}
      />
      <div className="relative flex items-start gap-3">
        <Avatar name={card.name} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <h2 className="line-clamp-2 break-words font-display text-[18px] font-bold leading-6 tracking-[-0.02em] text-text">{card.name}</h2>
            {card.verified ? <BadgeCheck aria-label="Verified" className="h-4 w-4 shrink-0 text-info" /> : null}
          </div>
          <p className="mt-0.5 truncate text-[13px] text-text-3">{card.handle ? `@${card.handle}` : "—"}</p>
        </div>
        <Badge tone={badge.tone} className="shrink-0">
          {badge.label}
        </Badge>
      </div>

      <p className="relative mt-4 flex items-center gap-1.5 text-[13px] text-text-2">
        <MapPin aria-hidden className="h-3.5 w-3.5 text-text-3" />
        {card.city ?? "—"}
      </p>

      <ul className="relative mb-5 mt-3 flex flex-wrap gap-1.5" aria-label="Categories">
        {card.categories.length ? (
          card.categories.map((c) => (
            <li key={c} className="inline-flex h-7 items-center gap-1 rounded-pill border border-line-soft bg-[rgba(255,255,255,0.04)] px-2.5 text-[12px] font-medium text-text-2">
              <span aria-hidden>{categoryEmoji(c)}</span>
              {artFor(c).label === "Experience" ? c : artFor(c).label}
            </li>
          ))
        ) : (
          <li className="text-[12px] text-text-3">No categories</li>
        )}
      </ul>

      <div className="relative mt-auto flex items-center justify-between gap-3 border-t border-line-soft pt-3.5 text-[12px] text-text-3">
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays aria-hidden className="h-3.5 w-3.5" />
          Since {card.since ? formatDate(card.since) : "—"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Star aria-hidden className={cn("h-3.5 w-3.5", card.rating !== null ? "fill-warn text-warn" : "")} />
          {card.ratingCount === null ? (
            <span aria-label="Rating unknown">—</span>
          ) : card.rating !== null ? (
            <>
              <b className="num text-[13px] font-bold text-text">{card.rating.toFixed(1)}</b>
              <span>({card.ratingCount})</span>
            </>
          ) : (
            "No ratings"
          )}
        </span>
      </div>
    </Card>
  );
}
