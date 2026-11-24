"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, BellPlus, CalendarClock, Copy, Pencil, Search, Send } from "lucide-react";
import { Button, Card, Chip, Empty, ErrorState, Skeleton, Truncated } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { formatDateTime } from "@/lib/console/records";
import { countFull, relTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import {
  ACTION_META,
  ANNOUNCEMENT_STATUSES,
  STATUS_META,
  announcementActions,
  audienceSummary,
  canEdit,
  ctrOf,
  effectiveStatus,
  filterAnnouncements,
  formatRate,
  statusCounts,
  type AnnouncementAction,
  type AnnouncementRow,
  type AnnouncementStatus,
} from "@/lib/notifications";
import { useAnnouncements } from "@/lib/use-notifications";
import { useSearchParamSetter } from "@/lib/use-search-param";
import { AnnouncementActionSheet } from "./AnnouncementActionSheet";
import { FormatPill, StatusBadge, ToneDot } from "./Bits";
import { NotificationsHeader } from "./NotificationsNav";
import { INPUT } from "./FormBits";

type Filter = AnnouncementStatus | "all";
const FILTERS: Filter[] = ["all", ...ANNOUNCEMENT_STATUSES];

/** The announcements library: status chips, search and row actions (each asks for a reason). */
export function AnnouncementsLibrary() {
  const params = useSearchParams();
  const setParam = useSearchParamSetter();
  const raw = params.get("status");
  const filter: Filter = (FILTERS as readonly string[]).includes(raw ?? "") ? (raw as Filter) : "all";
  const [search, setSearch] = useState("");
  const now = useNow(30_000);
  const { rows, loading, error, truncated, retry } = useAnnouncements();
  const [target, setTarget] = useState<{ row: AnnouncementRow; action: AnnouncementAction } | null>(null);

  const ref = useMemo(() => now ?? new Date(0), [now]);
  const counts = useMemo(() => statusCounts(rows, ref), [rows, ref]);
  const shown = useMemo(() => filterAnnouncements(rows, { status: filter, search, now: ref }), [rows, filter, search, ref]);
  const total = rows.length - counts.archived;

  return (
    <PageContainer className="flex flex-col gap-6">
      <NotificationsHeader
        title={
          <>
            Announcements <em className="hl">library</em>
          </>
        }
        subtitle="In-app messages people see when they open PULSE — popups, full-screen takeovers, bottom sheets, banners and inbox items. Every change is audited."
      />

      <Card className="flex flex-col gap-4 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <Chip key={f} selected={filter === f} onClick={() => setParam("status", f === "all" ? null : f)}>
              {f === "all" ? "All" : STATUS_META[f].label}
              <span className="num text-[11.5px] opacity-70">{f === "all" ? total : counts[f]}</span>
            </Chip>
          ))}
        </div>
        <label className="relative block">
          <span className="sr-only">Search announcements</span>
          <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-text-3" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search title, message or ID" className={`${INPUT} pl-10`} />
        </label>
      </Card>

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={retry} />
        </Card>
      ) : loading ? (
        <div role="status" aria-busy="true" className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-[112px] rounded-card" />
          ))}
          <span className="sr-only">Loading announcements…</span>
        </div>
      ) : shown.length === 0 ? (
        <Card>
          {rows.length === 0 ? (
            <Empty
              emoji="📣"
              title="No announcements yet"
              body="Create one to greet people when they open the app — a launch, a safety notice or an offer."
              action={
                <Link href="/notifications/announcements/new" className="focus-ring inline-flex h-10 items-center gap-2 rounded-[14px] bg-volt px-4 font-display text-[13px] font-bold text-on-volt">
                  <BellPlus aria-hidden className="h-4 w-4" />
                  New announcement
                </Link>
              }
            />
          ) : (
            <Empty emoji="🔎" title="Nothing matches" body={search ? `No ${filter === "all" ? "" : `${STATUS_META[filter].label.toLowerCase()} `}announcements match “${search}”.` : `No ${STATUS_META[filter as AnnouncementStatus]?.label.toLowerCase() ?? ""} announcements.`} />
          )}
        </Card>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Announcements">
          {shown.map((row) => (
            <li key={row.id}>
              <AnnouncementCard row={row} now={now} onAction={(action) => setTarget({ row, action })} />
            </li>
          ))}
        </ul>
      )}
      {truncated ? <Truncated shown={rows.length} order="newest" noun="announcements" /> : null}

      <AnnouncementActionSheet target={target} onClose={() => setTarget(null)} />
    </PageContainer>
  );
}

const ACTION_ICON: Partial<Record<AnnouncementAction, typeof Send>> = { publish: Send, duplicate: Copy };

export function AnnouncementCard({ row, now, onAction }: { row: AnnouncementRow; now: Date | null; onAction: (a: AnnouncementAction) => void }) {
  const router = useRouter();
  const status = effectiveStatus(row.status, row.startsAt, row.endsAt, now ?? new Date(0));
  const actions = announcementActions(row.status === "archived" ? "archived" : status);
  const ctr = ctrOf(row.stats);
  const href = `/notifications/announcements/${encodeURIComponent(row.id)}`;
  const windowText =
    status === "scheduled" && row.startsAt
      ? `Starts ${formatDateTime(row.startsAt)}`
      : row.endsAt
        ? `${status === "ended" ? "Ended" : "Ends"} ${formatDateTime(row.endsAt)}`
        : row.startsAt
          ? `Since ${formatDateTime(row.startsAt)}`
          : "Starts when published";

  return (
    <Card as="article" aria-label={row.title} className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3.5">
        <span className="mt-1.5">
          <ToneDot tone={row.tone} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={href} className="focus-ring min-w-0 truncate rounded-[6px] font-display text-[16.5px] font-bold tracking-[-0.02em] text-text hover:underline">
              {row.title}
            </Link>
            <StatusBadge status={status} />
          </div>
          {row.body ? <p className="mt-1 line-clamp-1 text-[13px] text-text-2">{row.body}</p> : null}
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-text-3">
            <FormatPill format={row.format} />
            <span aria-hidden>·</span>
            <span className="truncate">{audienceSummary(row.audience)}</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock aria-hidden className="h-3.5 w-3.5" />
              {windowText}
            </span>
            {row.updatedAt && now ? (
              <>
                <span aria-hidden>·</span>
                <span title={formatDateTime(row.updatedAt)}>Edited {relTime(row.updatedAt, now)}</span>
              </>
            ) : null}
          </p>
        </div>
      </div>
      <dl className="grid shrink-0 grid-cols-3 gap-2 text-center lg:w-[260px]">
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3">Seen by</dt>
          <dd className="num text-[16px] font-bold text-text">{countFull(row.stats.viewers || row.stats.shown)}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3">Targeted</dt>
          <dd className="num text-[16px] font-bold text-text">{row.status === "draft" ? "—" : countFull(row.stats.targeted)}</dd>
        </div>
        <div>
          <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3">CTR</dt>
          <dd className="num text-[16px] font-bold text-text">{formatRate(ctr)}</dd>
        </div>
      </dl>
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 lg:justify-end">
        {canEdit(status) && row.status !== "archived" && status !== "ended" ? (
          <Button variant="quiet" size="sm" icon={<Pencil />} onClick={() => router.push(`${href}/edit`)}>
            Edit
          </Button>
        ) : null}
        {actions.map((a) => {
          const Icon = ACTION_ICON[a];
          return (
            <Button key={a} variant={a === "publish" || a === "resume" ? "volt" : a === "end" || a === "archive" ? "danger" : "ghost"} size="sm" icon={Icon ? <Icon /> : undefined} onClick={() => onAction(a)}>
              {ACTION_META[a].label}
            </Button>
          );
        })}
        <Link href={href} aria-label={`Open ${row.title}`} className="focus-ring grid h-8 w-8 place-items-center rounded-[12px] text-text-3 hover:bg-[rgba(255,255,255,0.06)] hover:text-text">
          <ArrowUpRight aria-hidden className="h-4 w-4" />
        </Link>
      </div>
    </Card>
  );
}
