"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BellRing, Copy, Pencil, RotateCw } from "lucide-react";
import { AreaChart, BarList, Button, Card, Chip, CopyIdPill, Empty, ErrorState, Skeleton } from "@/components/pulse";
import { BackLink } from "@/components/shell/BackLink";
import { PageContainer } from "@/components/shell/PageContainer";
import { formatDateTime } from "@/lib/console/records";
import { countFull } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { getAnnouncementStats } from "@/lib/notifications-api";
import {
  ACTION_META,
  FREQUENCY_META,
  TONE_META,
  announcementActions,
  announcementFormFrom,
  audienceSummary,
  canEdit,
  ctaHint,
  ctrOf,
  effectiveStatus,
  formatRate,
  istDay,
  normalizeSeries,
  previewModel,
  reachOf,
  shortDay,
  statsOf,
  toAnnouncementRow,
  toCta,
  type AnnouncementAction,
  type SeriesPoint,
} from "@/lib/notifications";
import { useLiveDocument } from "@/lib/use-governance";
import { useOneShot } from "@/lib/use-query";
import { AnnouncementActionSheet } from "./AnnouncementActionSheet";
import { FormatPill, MiniStat, StatusBadge } from "./Bits";
import { PhonePreview } from "./PhonePreview";

type Metric = keyof Omit<SeriesPoint, "day">;
const METRICS: Array<{ id: Metric; label: string }> = [
  { id: "shown", label: "Shown" },
  { id: "clicked", label: "Clicked" },
  { id: "dismissed", label: "Dismissed" },
  { id: "acked", label: "Acknowledged" },
];

/** One announcement: preview, settings, stats and the 30-day chart (getAnnouncementStats). */
export function AnnouncementDetail({ id }: { id: string }) {
  const router = useRouter();
  const doc = useLiveDocument("announcements", id);
  const now = useNow(30_000);
  const [metric, setMetric] = useState<Metric>("shown");
  const [action, setAction] = useState<AnnouncementAction | null>(null);
  const stats = useOneShot(`ann-stats|${id}`, () => getAnnouncementStats(id));

  const row = useMemo(() => (doc.data ? toAnnouncementRow(id, doc.data) : null), [doc.data, id]);
  const form = useMemo(() => (doc.data ? announcementFormFrom(doc.data) : null), [doc.data]);
  const today = istDay(now ?? new Date());
  const series = useMemo(() => normalizeSeries(stats.value?.series, today), [stats.value, today]);

  if (doc.loading) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <Skeleton className="h-8 w-40 rounded-pill" />
        <Skeleton className="h-[160px] rounded-card" />
        <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-6">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[86px] rounded-control" />
          ))}
        </div>
        <Skeleton className="h-[320px] rounded-card" />
      </PageContainer>
    );
  }
  if (doc.error || !row || !form) {
    return (
      <PageContainer className="flex flex-col gap-5">
        <BackLink href="/notifications/announcements" label="Announcements" />
        <Card>{doc.error ? <ErrorState message={doc.error} /> : <Empty emoji="🔎" title="Announcement not found" body={`There's no announcement with the ID ${id}.`} />}</Card>
      </PageContainer>
    );
  }

  const status = effectiveStatus(row.status, row.startsAt, row.endsAt, now ?? new Date());
  const s = stats.value ? statsOf(stats.value.stats) : row.stats;
  const ctr = stats.value && typeof stats.value.ctr === "number" ? stats.value.ctr : ctrOf(s);
  const reach = reachOf(s);
  const actions = announcementActions(row.status === "archived" ? "archived" : status);
  const editable = canEdit(status) && row.status !== "archived" && status !== "ended";
  const primary = toCta(form.primaryCta);
  const secondary = toCta(form.secondaryCta);
  const raw = row.raw;
  const tone = TONE_META[row.tone];

  return (
    <PageContainer className="flex flex-col gap-6">
      <BackLink href="/notifications/announcements" label="Announcements" />

      <Card as="header" className="overflow-hidden p-6 lg:p-7">
        <span aria-hidden className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full opacity-[0.2] blur-3xl" style={{ background: tone.accent }} />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 flex-1 basis-[420px]">
            <div className="overline flex items-center gap-2 font-semibold">
              <BellRing aria-hidden className="h-3.5 w-3.5" /> Announcement · {tone.label}
            </div>
            <h1 className="mt-1 break-words font-display text-[32px] font-bold leading-[1.08] tracking-[-0.03em] text-text sm:text-[38px]">{row.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
              <StatusBadge status={status} className="text-[12px]" />
              <FormatPill format={row.format} />
              <span className="text-[12px] text-text-2">{audienceSummary(row.audience)}</span>
              <CopyIdPill id={id} noun="announcement" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editable ? (
              <Button variant="ghost" icon={<Pencil />} onClick={() => router.push(`/notifications/announcements/${encodeURIComponent(id)}/edit`)}>
                Edit
              </Button>
            ) : null}
            {actions.map((a) => (
              <Button key={a} variant={a === "publish" || a === "resume" ? "volt" : a === "end" || a === "archive" ? "danger" : "ghost"} icon={a === "duplicate" ? <Copy /> : undefined} onClick={() => setAction(a)}>
                {ACTION_META[a].label}
              </Button>
            ))}
          </div>
        </div>
      </Card>

      <section aria-label="Results">
        <dl className="grid gap-3 sm:grid-cols-3 xl:grid-cols-7">
          <MiniStat label="Targeted" value={row.status === "draft" ? "—" : countFull(s.targeted)} hint="Estimated at publish" />
          <MiniStat label="Seen by" value={countFull(s.viewers)} hint={reach !== null ? `${formatRate(reach)} of targeted` : "Distinct people"} tone="violet" />
          <MiniStat label="Shown" value={countFull(s.shown)} hint="Per person per day" />
          <MiniStat label="Clicked" value={countFull(s.clicked)} />
          <MiniStat label="Dismissed" value={countFull(s.dismissed)} />
          <MiniStat label="Acknowledged" value={countFull(s.acked)} />
          <MiniStat label="CTR" value={formatRate(ctr)} hint="Clicks per viewer" tone="ok" />
        </dl>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-text">Last 30 days</h2>
                <p className="text-[12.5px] text-text-3">India time. Counters update as people open the app.</p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Metric">
                {METRICS.map((m) => (
                  <Chip key={m.id} selected={metric === m.id} onClick={() => setMetric(m.id)}>
                    {m.label}
                  </Chip>
                ))}
                <Button variant="quiet" size="sm" icon={<RotateCw />} onClick={stats.retry} aria-label="Refresh stats">
                  Refresh
                </Button>
              </div>
            </div>
            {stats.loading && !stats.value ? (
              <Skeleton className="h-[220px] rounded-[16px]" />
            ) : stats.error ? (
              <ErrorState message={stats.error} onRetry={stats.retry} />
            ) : (
              <AreaChart points={series.map((p) => ({ label: shortDay(p.day), value: p[metric] }))} format={(v) => countFull(Math.round(v))} />
            )}
          </Card>

          <Card className="flex flex-col gap-4">
            <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-text">What people did</h2>
            <BarList
              items={[
                { label: "Saw it", value: s.viewers, display: countFull(s.viewers) },
                { label: "Tapped a button", value: s.clicked, display: countFull(s.clicked) },
                { label: "Closed it", value: s.dismissed, display: countFull(s.dismissed) },
                { label: "Acknowledged", value: s.acked, display: countFull(s.acked) },
              ]}
            />
          </Card>

          <Card className="flex flex-col gap-3">
            <h2 className="font-display text-[17px] font-bold tracking-[-0.02em] text-text">Settings</h2>
            <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
              <Detail label="Audience" value={audienceSummary(row.audience)} />
              <Detail label="Window" value={`${row.startsAt ? formatDateTime(row.startsAt) : "When published"} → ${row.endsAt ? formatDateTime(row.endsAt) : "until ended"}`} />
              <Detail label="How often" value={FREQUENCY_META[form.frequency].label} />
              <Detail label="Priority" value={String(form.priority)} />
              <Detail label="Closing" value={[form.dismissible ? "Can close" : "No close button", form.requireAck ? "requires “I understand”" : null].filter(Boolean).join(" · ")} />
              <Detail label="Main button" value={primary ? `${primary.label} — ${ctaHint(primary)}` : "None"} />
              <Detail label="Second button" value={secondary ? `${secondary.label} — ${ctaHint(secondary)}` : "None"} />
              <Detail label="Push" value={row.sendPush ? (row.pushStatus ? `On · ${row.pushStatus}` : "On · sends when it goes live") : "Off"} />
              <Detail label="Published" value={row.publishedAt ? `${formatDateTime(row.publishedAt)}${typeof raw.publishedBy === "string" ? ` · ${raw.publishedBy}` : ""}` : "Not yet"} />
              <Detail label="Last edited" value={`${formatDateTime(row.updatedAt)}${typeof raw.updatedBy === "string" ? ` · ${raw.updatedBy}` : ""}`} />
              {typeof raw.statusReason === "string" && raw.statusReason ? <Detail label="Last status reason" value={raw.statusReason} /> : null}
            </dl>
            <p className="text-[12px] text-text-3">
              Every change is recorded in the <Link href="/audit" className="focus-ring rounded underline hover:text-text">audit trail</Link> (search for {id}).
            </p>
          </Card>
        </div>
        <aside aria-label="Preview" className="flex flex-col items-center gap-3 xl:sticky xl:top-4">
          <PhonePreview model={previewModel(form)} label="How it looks in the app" />
        </aside>
      </div>

      <AnnouncementActionSheet target={action ? { row, action } : null} onClose={() => setAction(null)} onDone={() => stats.retry()} />
    </PageContainer>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-text-3">{label}</dt>
      <dd className="mt-0.5 break-words text-text-2">{value}</dd>
    </div>
  );
}
