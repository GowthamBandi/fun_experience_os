"use client";

import { RotateCw } from "lucide-react";
import { Skeleton, Sparkline, Stat } from "@/components/pulse";
import { deltaPct, inrCompact, inrMinor } from "@/lib/format";
import { ratio, type RangeKey, type TimeRange } from "@/lib/metrics";
import { RANGE_COMPARE, countFull, percent } from "@/lib/overview";
import { useMetric, useSeries, type MetricState } from "@/lib/use-metric";
import { Tile } from "./Tile";

const SERIES_DAYS: Record<RangeKey, number> = { today: 14, "7d": 14, "30d": 30 };
const LABEL_RANGE: Record<RangeKey, string> = { today: "today", "7d": "7 days", "30d": "30 days" };
const IN_RANGE: Record<RangeKey, string> = { today: "today", "7d": "in the last 7 days", "30d": "in the last 30 days" };

/** Loading, error and retry for a figure built from two metrics. */
function pair(a: MetricState, b: MetricState) {
  return {
    loading: a.loading || b.loading,
    error: a.error ?? b.error,
    retry: () => {
      if (a.error) a.retry();
      if (b.error) b.retry();
    },
  };
}

function GrossSpark({ days }: { days: number }) {
  const series = useSeries("grossBookings", days);
  const values = series.points.map((p) => p.value);
  const flat = values.length > 0 && values.every((v) => v === 0);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0">
      <div className="pointer-events-auto flex items-center justify-between gap-2 px-5 pb-1 text-[11px] text-text-3">
        <span>{flat ? `No payments in the last ${days} days` : `Daily, last ${days} days`}</span>
        {series.error ? (
          <button type="button" onClick={series.retry} className="focus-ring inline-flex items-center gap-1 rounded-pill px-1.5 text-err hover:text-text">
            <RotateCw aria-hidden className="h-3 w-3" />
            Trend failed · retry
          </button>
        ) : null}
      </div>
      {series.loading ? (
        <Skeleton className="mx-5 mb-5 h-[84px] rounded-[16px]" />
      ) : series.error ? (
        <div aria-hidden className="h-[110px]" />
      ) : (
        <Sparkline values={values} height={110} />
      )}
    </div>
  );
}

export function KpiBento({ range, rangeKey, start }: { range: TimeRange; rangeKey: RangeKey; start: number }) {
  const gross = useMetric("grossBookings", range, true);
  const bookings = useMetric("confirmedBookings", range, true);
  const issued = useMetric("ticketsIssued", range, true);
  const checkedIn = useMetric("ticketsCheckedIn", range, true);
  const refunds = useMetric("refundsAmount", range, true);
  const customers = useMetric("newCustomers", range, true);
  const organizers = useMetric("activeOrganizers", undefined);

  const compare = RANGE_COMPARE[rangeKey];
  const checkRate = ratio(checkedIn.value, issued.value);
  const checkPrev = ratio(checkedIn.previous, issued.previous);
  const refundRate = ratio(refunds.value, gross.value);
  const refundPrev = ratio(refunds.previous, gross.previous);
  const checkState = pair(checkedIn, issued);
  const grossDelta = deltaPct(gross.value, gross.previous);
  const customersDelta = deltaPct(customers.value, customers.previous);
  const bookingsDelta = deltaPct(bookings.value, bookings.previous);
  const vs = (d: ReturnType<typeof deltaPct>) => (d.tone === "none" ? undefined : compare);
  const refundState = pair(refunds, gross);

  return (
    <>
      <Tile index={start} className="md:col-span-6 xl:col-span-5 xl:row-span-2">
        <Stat
          label={`Gross bookings · ${LABEL_RANGE[rangeKey]}`}
          value={inrMinor(gross.value)}
          delta={grossDelta}
          hint={vs(grossDelta)}
          loading={gross.loading}
          error={gross.error}
          onRetry={gross.retry}
          className="min-h-[268px] bg-[linear-gradient(150deg,#2a1f5c_0%,#1A1726_60%)] pb-[136px] shadow-[0_30px_80px_-40px_rgba(142,114,255,0.55)] [&_.num]:text-[52px] [&_.num]:leading-[1.05]"
        >
          <GrossSpark days={SERIES_DAYS[rangeKey]} />
        </Stat>
      </Tile>
      <Tile index={start + 1} className="col-span-1 md:col-span-2 xl:col-span-2">
        <Stat
          label="Bookings"
          value={countFull(bookings.value)}
          delta={bookingsDelta}
          hint={[vs(bookingsDelta), bookings.value === 0 ? `No captured payments ${IN_RANGE[rangeKey]}` : null].filter(Boolean).join(" · ") || undefined}
          loading={bookings.loading}
          error={bookings.error}
          onRetry={bookings.retry}
        />
      </Tile>
      <Tile index={start + 2} className="col-span-1 md:col-span-2 xl:col-span-2">
        <Stat
          label="Check-ins"
          value={percent(checkRate)}
          delta={deltaPct(checkRate, checkPrev)}
          hint={checkRate === null ? (issued.value === 0 ? "No tickets issued" : undefined) : `${countFull(checkedIn.value)} of ${countFull(issued.value)} tickets`}
          loading={checkState.loading}
          error={checkState.error}
          onRetry={checkState.retry}
        />
      </Tile>
      <Tile index={start + 3} className="md:col-span-2 xl:col-span-3">
        <Stat
          label="Refund rate"
          value={percent(refundRate)}
          delta={deltaPct(refundRate, refundPrev)}
          goodWhenDown
          hint={refundRate === null ? (gross.value === 0 ? "No payments to compare" : undefined) : `${inrCompact(refunds.value)} refunded`}
          loading={refundState.loading}
          error={refundState.error}
          onRetry={refundState.retry}
        />
      </Tile>
      <Tile index={start + 4} className="col-span-1 md:col-span-3 xl:col-span-4">
        <Stat
          label="New customers"
          value={countFull(customers.value)}
          delta={customersDelta}
          hint={vs(customersDelta)}
          loading={customers.loading}
          error={customers.error}
          onRetry={customers.retry}
        />
      </Tile>
      <Tile index={start + 5} className="col-span-1 md:col-span-3 xl:col-span-3">
        <Stat
          label="Active organizers"
          value={countFull(organizers.value)}
          hint="On PULSE right now"
          loading={organizers.loading}
          error={organizers.error}
          onRetry={organizers.retry}
        />
      </Tile>
    </>
  );
}
