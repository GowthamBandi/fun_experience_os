"use client";

import { useId, useMemo, useState } from "react";
import { ChevronDown, Clock3 } from "lucide-react";
import { Badge, Card, Empty, ErrorState, PageHeader, Skeleton, TONE_DOT, Tooltip, Truncated } from "@/components/pulse";
import { PageContainer } from "@/components/shell/PageContainer";
import { jobErrorLines, formatDateTime } from "@/lib/console/records";
import { formatDuration, jobCards, jobInfo, type JobCard } from "@/lib/control";
import { cn, relTime } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { useGovernanceCollection } from "@/lib/use-governance";
import { JsonBlock, SummaryPill } from "./ControlBits";

/**
 * Scheduled-job summaries (jobRuns: one document per job per IST day, written by platform/jobs.ts).
 * Alerts on these jobs are configured in Cloud Monitoring (docs/runbooks/OBSERVABILITY.md);
 * this page is where an operator looks first.
 */
export function SystemHealthView() {
  const { records, loading, error, truncated, refresh, order } = useGovernanceCollection("jobRuns");
  const now = useNow();
  const cards = useMemo(() => jobCards(records), [records]);
  const failing = cards.filter((c) => c.health.tone === "err").length;
  const ready = !loading && !error;
  return (
    <PageContainer className="flex flex-col gap-6">
      <PageHeader
        overline="Control"
        title={
          <>
            System <em className="hl">health</em>
          </>
        }
        subtitle="Daily summaries of the scheduled jobs: seat-hold release and refund retries (every 5 min), event reminders (every 15 min) and data retention (daily). A job whose last run failed is flagged; open it to read the errors."
      />

      {ready && cards.length > 0 ? (
        <ul aria-label="Job summary" className="flex flex-wrap gap-2 text-[12px]">
          <SummaryPill label="Jobs" value={cards.length} />
          <SummaryPill label="Last run failed" value={failing} tone={failing > 0 ? "err" : "ok"} />
        </ul>
      ) : null}

      {error ? (
        <Card>
          <ErrorState message={error} onRetry={refresh} />
        </Card>
      ) : loading ? (
        <div role="status" aria-busy="true" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <Card key={i} className="flex flex-col gap-4" style={{ opacity: 1 - i * 0.18 }}>
              <div className="flex items-center gap-3">
                <Skeleton className="h-3 w-3 rounded-full" />
                <Skeleton className="h-4 w-2/5 rounded-pill" />
              </div>
              <Skeleton className="h-3 w-1/3 rounded-pill" />
              <div className="grid grid-cols-3 gap-3">
                <Skeleton className="h-12 rounded-control" />
                <Skeleton className="h-12 rounded-control" />
                <Skeleton className="h-12 rounded-control" />
              </div>
              <span className="sr-only">Loading…</span>
            </Card>
          ))}
        </div>
      ) : cards.length === 0 ? (
        <Card>
          <Empty emoji="🩺" title="No job runs recorded yet" body="They appear within minutes of the first deploy." />
        </Card>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Scheduled jobs">
          {cards.map((card) => (
            <li key={card.recordId} className="flex">
              <JobCardView card={card} now={now} />
            </li>
          ))}
        </ul>
      )}
      {ready && truncated ? <Truncated shown={records.length} order={order} /> : null}
    </PageContainer>
  );
}

const DAY_WORD = { ok: "healthy", err: "failed", muted: "no result" } as const;

function JobCardView({ card, now }: { card: JobCard; now: Date | null }) {
  const [open, setOpen] = useState(false);
  const panel = useId();
  const info = jobInfo(card.job);
  const errors = jobErrorLines(card.raw.lastErrors);
  const steps = card.raw.lastSteps && typeof card.raw.lastSteps === "object" ? card.raw.lastSteps : null;
  const failed = card.health.tone === "err";
  const expandable = errors.length > 0 || steps !== null;
  return (
    <Card as="article" aria-label={info.label} className={cn("flex w-full flex-col gap-4", failed && "border-[rgba(255,97,120,0.4)] shadow-[0_18px_48px_-24px_rgba(255,97,120,0.5)]")}>
      <div className="flex items-start gap-3">
        <span aria-hidden className={cn("mt-1.5 h-[11px] w-[11px] shrink-0 rounded-full", TONE_DOT[card.health.tone])} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-[18px] font-bold leading-tight tracking-[-0.02em] text-text">{info.label}</h2>
          <p className="mt-0.5 truncate font-mono text-[11.5px] text-text-3">{card.job}</p>
        </div>
        <Badge tone={card.health.tone}>{card.health.label}</Badge>
      </div>

      {info.blurb ? <p className="text-[13px] leading-[1.5] text-text-2">{info.blurb}</p> : null}

      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text-2">
        <Clock3 aria-hidden className="h-3.5 w-3.5 text-text-3" />
        <span>Last run</span>
        <Tooltip label={card.lastRun ? formatDateTime(card.lastRun) : "No run time recorded"}>
          <b tabIndex={0} className="focus-ring num rounded-[6px] text-text">
            {now && card.lastRun ? relTime(card.lastRun, now) : "—"}
          </b>
        </Tooltip>
        {info.cadence ? <Badge tone="muted">{info.cadence}</Badge> : null}
      </p>

      <dl className="grid grid-cols-3 gap-2.5">
        <Count label="Runs today" value={card.runs === null ? "—" : String(card.runs)} />
        <Count label="Failures" value={card.failures === null ? "—" : String(card.failures)} tone={card.failures ? "err" : undefined} />
        <Count label="Last took" value={formatDuration(card.durationMs)} />
      </dl>

      {card.history.length > 0 ? (
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-text-3">Earlier</span>
          <ul className="flex items-center gap-1.5" aria-label="Earlier days, oldest first">
            {[...card.history].reverse().map((h) => (
              <li key={h.date}>
                <Tooltip label={`${h.date}: ${DAY_WORD[h.tone]}`}>
                  <span tabIndex={0} aria-label={`${h.date}: ${DAY_WORD[h.tone]}`} className={cn("focus-ring block h-2.5 w-2.5 rounded-full", h.tone === "ok" ? "bg-ok" : h.tone === "err" ? "bg-err" : "bg-text-3")} />
                </Tooltip>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {expandable ? (
        <div className="mt-auto">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={panel}
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "focus-ring inline-flex h-9 items-center gap-1.5 rounded-pill border px-3.5 text-[13px] font-semibold hover:text-text",
              errors.length > 0 ? "border-[rgba(255,97,120,0.35)] text-err hover:bg-[rgba(255,97,120,0.08)]" : "border-line text-text-2 hover:border-[rgba(255,255,255,0.22)]",
            )}
          >
            {errors.length > 0 ? `${errors.length} error${errors.length === 1 ? "" : "s"}` : "Last steps"}
            <ChevronDown aria-hidden className={cn("h-4 w-4 transition-transform duration-200 ease-pulse motion-reduce:transition-none", open && "rotate-180")} />
          </button>
          {open ? (
            <div id={panel} className="mt-3 flex flex-col gap-3">
              {errors.length > 0 ? (
                <ul className="flex flex-col gap-1.5" aria-label="Last errors">
                  {errors.map((line, i) => (
                    <li key={i} className="break-words rounded-control border border-[rgba(255,97,120,0.25)] bg-[rgba(255,97,120,0.07)] px-3 py-2 font-mono text-[12px] leading-5 text-text">
                      {line}
                    </li>
                  ))}
                </ul>
              ) : null}
              {failed ? <p className="text-[12px] text-text-3">The last run did not finish cleanly. See docs/runbooks/OBSERVABILITY.md for this job.</p> : null}
              <JsonBlock label="Last steps" value={steps} />
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-auto text-[12px] text-text-3">No errors recorded.</p>
      )}
    </Card>
  );
}

function Count({ label, value, tone }: { label: string; value: string; tone?: "err" }) {
  return (
    <div className="rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
      <dt className="text-[11px] text-text-3">{label}</dt>
      <dd className={cn("num mt-0.5 font-display text-[18px] font-bold leading-tight", tone === "err" ? "text-err" : "text-text")}>{value}</dd>
    </div>
  );
}
