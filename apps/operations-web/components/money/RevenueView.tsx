"use client";

import { Suspense, useMemo } from "react";
import { AreaChart, BarList, Card, Chip, CountUp, DeltaPill, Empty, ErrorState, PageHeader, Skeleton, Stat, Truncated } from "@/components/pulse";
import { BarListSkeleton, BentoSkeleton } from "@/components/overview/Skeletons";
import { Tile, TileHeader } from "@/components/overview/Tile";
import { PageContainer } from "@/components/shell/PageContainer";
import { deltaPct, inrCompact, inrMinor } from "@/lib/format";
import { ratio, type RangeKey, type TimeRange } from "@/lib/metrics";
import { IN_RANGE, RANGE_COMPARE, RANGE_KEYS, RANGE_LABEL, categoryEmoji, countFull, percent, toEv, type Ev } from "@/lib/overview";
import { bookedValueBy, netMinor, seriesSummary, type BookedBreakdown } from "@/lib/revenue";
import { eventsStartingBetween } from "@/lib/use-live-events";
import { useConsoleRange } from "@/lib/use-console-range";
import { pair, useMetric, useSeries } from "@/lib/use-metric";
import { useBoundedQuery, type BoundedQuery } from "@/lib/use-query";

const MAX = 250;
const SHOWN = 6;
const TREND_DAYS = 30;
const GRID = "grid grid-cols-2 gap-3.5 md:grid-cols-6 xl:grid-cols-12";

/** Full rupees while they fit a card; compact from ₹10L up. */
const money = (minor: number | null) => (minor !== null && Math.abs(minor) >= 1e8 ? inrCompact(minor) : inrMinor(minor));

function Legend({ tone, label, value, hint }: { tone: string; label: string; value: string; hint?: string }) {
  return (
    <div className="min-w-0 text-[12px]">
      <div className="flex min-w-0 items-center gap-2">
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone}`} />
        <span className="truncate text-text-2">{label}</span>
        <span className="ml-auto font-display font-bold tabular-nums text-text">{value}</span>
      </div>
      {hint ? <p className="mt-0.5 pl-[18px] text-[11px] leading-4 text-text-3">{hint}</p> : null}
    </div>
  );
}

/** Where the range's gross went: kept (net) against refunded, with PULSE's commission inside net. */
function MoneySplit({ gross, refunds, commission, net }: { gross: number | null; refunds: number | null; commission: number | null; net: number | null }) {
  if (gross === null || refunds === null) return null;
  const base = Math.max(gross, refunds);
  if (base <= 0) return null;
  const share = net === null || commission === null ? null : net - commission;
  // Bar widths clamp at zero; the legend shows the real, possibly negative, figures.
  const kept = Math.max(net ?? 0, 0);
  const commissionShare = commission !== null && commission > 0 ? Math.min(commission, kept) / base : 0;
  const keptShare = kept / base;
  const refundShare = Math.min(refunds / base, 1);
  return (
    <div className="mt-auto pt-6">
      <div
        role="img"
        aria-label={`Of ${inrMinor(gross)} captured, ${inrMinor(refunds)} refunded, ${inrMinor(net)} net, ${inrMinor(commission)} PULSE commission, ${inrMinor(share)} organizer share`}
        className="flex h-3 overflow-hidden rounded-pill bg-surface-high"
      >
        <span className="h-full bg-[linear-gradient(90deg,var(--primary),#B4A3FF)]" style={{ width: `${(keptShare - commissionShare) * 100}%` }} />
        <span className="h-full bg-info" style={{ width: `${commissionShare * 100}%` }} />
        <span className="h-full bg-err" style={{ width: `${refundShare * 100}%` }} />
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <Legend tone="bg-primary" label="Organizer share" hint="Net − commission (organizer payable movement); not a payout" value={inrCompact(share)} />
        <Legend tone="bg-info" label="PULSE commission" value={inrCompact(commission)} />
        <Legend tone="bg-err" label="Refunded" value={inrCompact(refunds)} />
      </div>
    </div>
  );
}

function MoneyStats({ range, rangeKey }: { range: TimeRange; rangeKey: RangeKey }) {
  const gross = useMetric("grossBookings", range, true);
  const refunds = useMetric("refundsAmount", range, true);
  const commission = useMetric("commission", range, true);

  const compare = RANGE_COMPARE[rangeKey];
  const net = netMinor(gross.value, refunds.value);
  const netPrev = netMinor(gross.previous, refunds.previous);
  const take = ratio(commission.value, gross.value);
  const takePrev = ratio(commission.previous, gross.previous);
  const netState = pair(gross, refunds);
  const takeState = pair(commission, gross);

  const grossDelta = deltaPct(gross.value, gross.previous);
  const refundsDelta = deltaPct(refunds.value, refunds.previous);
  const commissionDelta = deltaPct(commission.value, commission.previous);
  const netDelta = deltaPct(net, netPrev);
  const vs = (d: ReturnType<typeof deltaPct>) => (d.tone === "none" ? undefined : compare);
  const join = (...parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join(" · ") || undefined;

  return (
    <>
      <Tile index={0} className="md:col-span-6 xl:col-span-5 xl:row-span-2">
        <Stat
          label={`Gross bookings · ${RANGE_LABEL[rangeKey]}`}
          value={inrMinor(gross.value)}
          delta={grossDelta}
          hint={join(vs(grossDelta), gross.value === 0 && `No captured payments ${IN_RANGE[rangeKey]}`)}
          loading={gross.loading}
          error={gross.error}
          onRetry={gross.retry}
          className="min-h-[268px] bg-[linear-gradient(150deg,#2a1f5c_0%,#1A1726_62%)] shadow-[0_30px_80px_-40px_rgba(142,114,255,0.55)] [&>.num]:text-[48px] [&>.num]:leading-[1.05] md:[&>.num]:text-[56px]"
        >
          <p className="mt-3 text-[13px] text-text-3">Captured payments in the ledger</p>
          {netState.loading || commission.loading ? null : <MoneySplit gross={gross.value} refunds={refunds.value} commission={commission.value} net={net} />}
        </Stat>
      </Tile>
      <Tile index={1} className="md:col-span-3 xl:col-span-4">
        <Stat
          label="Net"
          value={money(net)}
          delta={netDelta}
          hint={join(vs(netDelta), "Gross − refunds")}
          loading={netState.loading}
          error={netState.error}
          onRetry={netState.retry}
          className={net !== null && net < 0 ? "[&>.num]:text-err" : undefined}
        />
      </Tile>
      <Tile index={2} className="md:col-span-3 xl:col-span-3">
        <Stat
          label="Commission"
          value={money(commission.value)}
          delta={commissionDelta}
          hint={join(vs(commissionDelta), "Net of reversals")}
          loading={commission.loading}
          error={commission.error}
          onRetry={commission.retry}
        />
      </Tile>
      <Tile index={3} className="md:col-span-3 xl:col-span-4">
        <Stat
          label="Refunds"
          value={money(refunds.value)}
          delta={refundsDelta}
          goodWhenDown
          hint={join(vs(refundsDelta), refunds.value === 0 ? `None paid out ${IN_RANGE[rangeKey]}` : "Paid out")}
          loading={refunds.loading}
          error={refunds.error}
          onRetry={refunds.retry}
        />
      </Tile>
      <Tile index={4} className="md:col-span-3 xl:col-span-3">
        <Stat
          label="Take rate"
          value={percent(take)}
          delta={deltaPct(take, takePrev)}
          hint={take === null ? (gross.value === 0 ? "No payments to compare" : undefined) : "Commission ÷ gross"}
          loading={takeState.loading}
          error={takeState.error}
          onRetry={takeState.retry}
        />
      </Tile>
    </>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] px-3.5 py-2.5">
      <div className="overline truncate text-[10px] font-semibold">{label}</div>
      <div className="num mt-0.5 truncate text-[18px] font-bold text-text">{value}</div>
      {sub ? <div className="truncate text-[11px] text-text-3">{sub}</div> : null}
    </div>
  );
}

function Trend() {
  const series = useSeries("grossBookings", TREND_DAYS);
  const summary = seriesSummary(series.points);
  const half = Math.floor(series.points.length / 2);
  const recent = series.points.slice(half).reduce((n, p) => n + p.value, 0);
  const earlier = series.points.slice(0, half).reduce((n, p) => n + p.value, 0);
  const momentum = deltaPct(recent, earlier);

  return (
    <Card as="section" aria-labelledby="rev-trend" aria-busy={series.loading || undefined} className="flex flex-col">
      <TileHeader id="rev-trend" title="Gross bookings, last 30 days">
        {!series.loading && !series.error && momentum.tone !== "none" ? (
          <span className="flex items-center gap-2 text-[12px] text-text-3">
            <DeltaPill delta={momentum} />
            <span className="hidden sm:inline">last 15 days vs the 15 before</span>
          </span>
        ) : null}
      </TileHeader>
      {series.loading ? (
        <div aria-hidden className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[66px] rounded-control" />
            ))}
          </div>
          <Skeleton className="h-[240px] rounded-[16px]" />
        </div>
      ) : series.error ? (
        <ErrorState message={series.error} onRetry={series.retry} />
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <Figure label="30-day total" value={inrCompact(summary.total)} />
            <Figure label="Daily average" value={inrCompact(Math.round(summary.average))} />
            <Figure label="Best day" value={summary.best ? inrCompact(summary.best.value) : "—"} sub={summary.best?.label} />
            <Figure label="Days with sales" value={`${summary.activeDays} of ${series.points.length}`} />
          </div>
          {summary.total === 0 ? (
            <Empty emoji="📈" title="No captured payments in 30 days" body="The trend fills in as bookings are paid." className="py-6" />
          ) : (
            <AreaChart points={series.points} format={inrMinor} height={240} />
          )}
          <p className="mt-3 text-[12px] text-text-3">Captured payments per IST day, from the ledger.</p>
        </>
      )}
    </Card>
  );
}

function Breakdown({
  id,
  title,
  rangeKey,
  query,
  data,
  noun,
  label,
}: {
  id: string;
  title: string;
  rangeKey: RangeKey;
  query: BoundedQuery<Ev>;
  data: BookedBreakdown;
  noun: [string, string];
  label: (key: string, label: string) => string;
}) {
  const { loading, error, truncated, retry } = query;
  const n = data.rows.length;
  return (
    <Card as="section" aria-labelledby={id} aria-busy={loading || undefined} className="flex flex-col">
      <TileHeader id={id} title={title}>
        <span className="overline">{RANGE_LABEL[rangeKey]}</span>
      </TileHeader>
      <p className="-mt-2 mb-4 text-[12px] text-text-3">Booked value by event date</p>
      {loading ? (
        <BarListSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : n === 0 ? (
        <Empty emoji="🎟️" title="No paid bookings for events in this range" body="Booked value shows here once scheduled events starting in the range sell paid spots." className="py-6" />
      ) : (
        <>
          <p className="mb-4 text-[13px] text-text-2">
            <CountUp value={inrMinor(data.total)} className="num font-bold text-text" /> booked across{" "}
            <CountUp value={countFull(n)} className="num font-bold text-text" /> {n === 1 ? noun[0] : noun[1]}
          </p>
          <BarList
            items={data.rows.slice(0, SHOWN).map((r) => ({
              label: label(r.key, r.label),
              value: r.value,
              display: `${inrCompact(r.value)} · ${percent(ratio(r.value, data.total))}`,
            }))}
          />
          {n > SHOWN ? (
            <p className="mt-3 text-[12px] text-text-3">
              +{n - SHOWN} more {n - SHOWN === 1 ? noun[0] : noun[1]}
            </p>
          ) : null}
          {data.unknown > 0 ? (
            <p className="mt-3 text-[12px] text-text-3">
              {data.unknown} {data.unknown === 1 ? "event has" : "events have"} no price or paid count and {data.unknown === 1 ? "is" : "are"} left out.
            </p>
          ) : null}
        </>
      )}
      {!loading && !error && truncated ? <Truncated shown={MAX} noun="events" className="mt-4" /> : null}
    </Card>
  );
}

function Breakdowns({ range, rangeKey }: { range: TimeRange; rangeKey: RangeKey }) {
  const query = useBoundedQuery(
    `revenue-events|${range.start.getTime()}|${range.end.getTime()}`,
    () => eventsStartingBetween(range.start, range.end, "desc"),
    toEv,
    MAX,
  );
  const byCity = useMemo(() => bookedValueBy(query.rows, "city"), [query.rows]);
  const byCategory = useMemo(() => bookedValueBy(query.rows, "category"), [query.rows]);

  return (
    <>
      <Tile index={6} className="md:col-span-6 xl:col-span-6">
        <Breakdown id="rev-city" title="By city" rangeKey={rangeKey} query={query} data={byCity} noun={["city", "cities"]} label={(_, l) => l} />
      </Tile>
      <Tile index={7} className="md:col-span-6 xl:col-span-6">
        <Breakdown
          id="rev-category"
          title="By category"
          rangeKey={rangeKey}
          query={query}
          data={byCategory}
          noun={["category", "categories"]}
          label={(key, l) => `${categoryEmoji(key || null)} ${l}`}
        />
      </Tile>
    </>
  );
}

const SKELETON_CELLS = [
  "md:col-span-6 xl:col-span-5 xl:row-span-2 h-[268px] xl:h-auto",
  "md:col-span-3 xl:col-span-4 h-[132px]",
  "md:col-span-3 xl:col-span-3 h-[132px]",
  "md:col-span-3 xl:col-span-4 h-[132px]",
  "md:col-span-3 xl:col-span-3 h-[132px]",
  "md:col-span-6 xl:col-span-12 h-[400px]",
];

function Header() {
  return (
    <PageHeader
      overline="Money"
      title={
        <>
          Revenue, <em className="hl">by the ledger</em>
        </>
      }
      subtitle="Captured payments, refunds paid out and PULSE commission net of reversals."
    />
  );
}

function Revenue() {
  const { rangeKey, range, setRange } = useConsoleRange();

  return (
    <PageContainer>
      <Header />
      <div role="group" aria-label="Time range" className="mb-5 mt-5 flex flex-wrap gap-2">
        {RANGE_KEYS.map((key) => (
          <Chip key={key} selected={key === rangeKey} onClick={() => setRange(key)}>
            {RANGE_LABEL[key]}
          </Chip>
        ))}
      </div>
      <div className={GRID}>
        {range ? (
          <>
            <MoneyStats range={range} rangeKey={rangeKey} />
            <Tile index={5} className="md:col-span-6 xl:col-span-12">
              <Trend />
            </Tile>
            <Breakdowns range={range} rangeKey={rangeKey} />
          </>
        ) : (
          <BentoSkeleton cells={SKELETON_CELLS} />
        )}
      </div>
    </PageContainer>
  );
}

export function RevenueView() {
  return (
    <Suspense
      fallback={
        <PageContainer>
          <Header />
          <div className={`${GRID} mt-[72px]`}>
            <BentoSkeleton cells={SKELETON_CELLS} />
          </div>
        </PageContainer>
      }
    >
      <Revenue />
    </Suspense>
  );
}
