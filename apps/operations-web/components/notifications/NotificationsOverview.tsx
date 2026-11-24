"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, LayoutTemplate, Megaphone, Radio, Send } from "lucide-react";
import { Badge, Card, Empty, ErrorState, ProgressBar, Skeleton, Stat } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { formatDateTime } from "@/lib/console/records";
import { countFull, relTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { subscribeRecentBroadcasts, type Rows } from "@/lib/notifications-api";
import {
  BROAD_PUSHES_PER_DAY,
  audienceSummary,
  broadPushesUsed,
  ctrOf,
  formatRate,
  notificationStatusBadge,
  overviewSummary,
  recipientsLabel,
  type AnnouncementRow,
} from "@/lib/notifications";
import { useAdminNotifications, useAnnouncements } from "@/lib/use-notifications";
import { FormatPill, StatusBadge, ToneDot } from "./Bits";
import { NotificationsHeader } from "./NotificationsNav";

/** Notification center home: what's live or scheduled, recent sends, reach and CTR at a glance. */
export function NotificationsOverview() {
  const now = useNow(30_000);
  const announcements = useAnnouncements();
  const sends = useAdminNotifications();
  const [broadcasts, setBroadcasts] = useState<{ rows: Rows; error: string | null }>({ rows: [], error: null });
  useEffect(() => subscribeRecentBroadcasts((rows) => setBroadcasts({ rows, error: null }), (error) => setBroadcasts({ rows: [], error })), []);

  const ref = useMemo(() => now ?? new Date(0), [now]);
  const summary = useMemo(() => overviewSummary(announcements.rows, sends.rows, ref), [announcements.rows, sends.rows, ref]);
  const used = broadPushesUsed(broadcasts.rows, ref);
  const loadingA = announcements.loading;

  return (
    <PageContainer className="flex flex-col gap-6">
      <NotificationsHeader
        title={
          <>
            Notification <em className="hl">center</em>
          </>
        }
        subtitle="Announcements people see when they open PULSE, pushes and inbox messages to anyone you choose, and reusable templates — all audited."
      />

      <section aria-label="At a glance" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Live now" value={countFull(summary.live.length)} hint={`${summary.scheduled.length} scheduled · ${summary.drafts} drafts`} loading={loadingA} error={announcements.error} onRetry={announcements.retry} />
        <Stat label="Seen by (live)" value={countFull(summary.liveViewers)} hint={`CTR ${formatRate(summary.liveCtr)} across live announcements`} loading={loadingA} error={announcements.error} onRetry={announcements.retry} />
        <Stat label="Sends · 7 days" value={countFull(summary.sends7d)} hint={`${countFull(summary.reached7d)} people reached · ${summary.scheduledSends} scheduled`} loading={sends.loading} error={sends.error} onRetry={sends.retry} />
        <Stat label="Broad pushes · 24 h" value={`${used}/${BROAD_PUSHES_PER_DAY}`} hint="Everyone / customers / cities — shared with Broadcast" error={broadcasts.error}>
          <ProgressBar value={used} max={BROAD_PUSHES_PER_DAY} ariaLabel="Broad pushes used in the last 24 hours" className="mt-3" />
        </Stat>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card as="section" aria-label="Live and scheduled" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 font-display text-[17px] font-bold tracking-[-0.02em] text-text">
              <Radio aria-hidden className="h-4 w-4 text-ok" /> Live &amp; scheduled
            </h2>
            <Link href="/notifications/announcements" className="focus-ring inline-flex items-center gap-1 rounded text-[12.5px] font-semibold text-text-3 hover:text-text">
              Library <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          </div>
          {announcements.error ? (
            <ErrorState message={announcements.error} onRetry={announcements.retry} />
          ) : loadingA ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-[72px] rounded-control" />
              ))}
            </div>
          ) : summary.live.length + summary.scheduled.length === 0 ? (
            <Empty
              emoji="📣"
              title="Nothing live right now"
              body="Publish an announcement to greet people when they open the app."
              action={
                <Link href="/notifications/announcements/new" className="focus-ring inline-flex h-10 items-center gap-2 rounded-[14px] bg-volt px-4 font-display text-[13px] font-bold text-on-volt">
                  <Megaphone aria-hidden className="h-4 w-4" /> New announcement
                </Link>
              }
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {[...summary.live, ...summary.scheduled].slice(0, 8).map((r) => (
                <LiveRow key={r.id} row={r} now={now} />
              ))}
            </ul>
          )}
        </Card>

        <div className="flex flex-col gap-6">
          <Card as="section" aria-label="Recent sends" className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-display text-[17px] font-bold tracking-[-0.02em] text-text">
                <Send aria-hidden className="h-4 w-4 text-[#C2B4FF]" /> Recent sends
              </h2>
              <Link href="/notifications/send" className="focus-ring inline-flex items-center gap-1 rounded text-[12.5px] font-semibold text-text-3 hover:text-text">
                Send <ArrowUpRight aria-hidden className="h-3.5 w-3.5" />
              </Link>
            </div>
            {sends.error ? (
              <ErrorState message={sends.error} onRetry={sends.retry} />
            ) : sends.loading ? (
              <Skeleton className="h-[160px] rounded-control" />
            ) : sends.rows.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-text-3">No notifications sent yet.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-line-soft">
                {sends.rows.slice(0, 6).map((s) => {
                  const b = notificationStatusBadge(s.status);
                  const at = s.status === "scheduled" ? s.scheduleAt : s.sentAt ?? s.createdAt;
                  return (
                    <li key={s.id} className="flex items-start gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold text-text">{s.title}</p>
                        <p className="truncate text-[12px] text-text-3">
                          {audienceSummary(s.audience)} · {recipientsLabel(s)}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <Badge tone={b.tone}>{b.label}</Badge>
                        <span className="text-[11.5px] text-text-3" title={formatDateTime(at)}>
                          {at && now ? relTime(at, now) : "—"}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card as="section" aria-label="Shortcuts" className="grid gap-2 sm:grid-cols-3 xl:grid-cols-1">
            <Shortcut href="/notifications/announcements/new" icon={<Megaphone aria-hidden className="h-4 w-4" />} title="New announcement" body="Popup, full screen, sheet, banner or inbox" />
            <Shortcut href="/notifications/send" icon={<Send aria-hidden className="h-4 w-4" />} title="Send a notification" body="Push + inbox, now or scheduled" />
            <Shortcut href="/notifications/templates" icon={<LayoutTemplate aria-hidden className="h-4 w-4" />} title="Templates" body="Start from a saved message" />
          </Card>
        </div>
      </div>
    </PageContainer>
  );
}

function LiveRow({ row, now }: { row: AnnouncementRow; now: Date | null }) {
  const scheduled = row.startsAt && now && row.startsAt.getTime() > now.getTime();
  return (
    <li>
      <Link
        href={`/notifications/announcements/${encodeURIComponent(row.id)}`}
        className="focus-ring group flex items-center gap-3 rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] p-3 transition-[background-color,border-color] duration-150 hover:border-[rgba(142,114,255,0.35)] hover:bg-[rgba(142,114,255,0.08)]"
      >
        <ToneDot tone={row.tone} />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate text-[14px] font-semibold text-text">{row.title}</span>
            <StatusBadge status={scheduled ? "scheduled" : "live"} />
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-text-3">
            <FormatPill format={row.format} />
            <span>· {audienceSummary(row.audience)}</span>
            {scheduled ? (
              <span className="inline-flex items-center gap-1">
                · <CalendarClock aria-hidden className="h-3 w-3" /> {formatDateTime(row.startsAt)}
              </span>
            ) : row.endsAt ? (
              <span>· ends {formatDateTime(row.endsAt)}</span>
            ) : null}
          </p>
        </div>
        <dl className="hidden shrink-0 grid-cols-2 gap-4 text-right sm:grid">
          <div>
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3">Seen</dt>
            <dd className="num text-[15px] font-bold text-text">{countFull(row.stats.viewers || row.stats.shown)}</dd>
          </div>
          <div>
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-text-3">CTR</dt>
            <dd className="num text-[15px] font-bold text-text">{formatRate(ctrOf(row.stats))}</dd>
          </div>
        </dl>
        <ArrowUpRight aria-hidden className="h-4 w-4 shrink-0 text-text-3 transition-colors group-hover:text-text" />
      </Link>
    </li>
  );
}

function Shortcut({ href, icon, title, body }: { href: string; icon: ReactNode; title: string; body: string }) {
  return (
    <Link href={href} className="focus-ring flex items-center gap-3 rounded-control border border-line-soft p-3 transition-colors duration-150 hover:border-[rgba(142,114,255,0.35)] hover:bg-[rgba(142,114,255,0.08)]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-[rgba(142,114,255,0.18)] text-[#C2B4FF]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13.5px] font-semibold text-text">{title}</span>
        <span className="block truncate text-[12px] text-text-3">{body}</span>
      </span>
    </Link>
  );
}
