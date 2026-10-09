"use client";

import { BarList, Card, CountUp, Empty, ErrorState, Truncated } from "@/components/pulse";
import type { RangeKey, TimeRange } from "@/lib/metrics";
import { RANGE_LABEL, cityCounts, toEv } from "@/lib/overview";
import { eventsStartingBetween } from "@/lib/use-live-events";
import { useBoundedQuery } from "@/lib/use-query";
import { BarListSkeleton } from "./Skeletons";
import { TileHeader } from "./Tile";

const MAX = 250;
const SHOWN = 6;

export function TopCities({ range, rangeKey }: { range: TimeRange; rangeKey: RangeKey }) {
  const { rows, loading, error, truncated, retry } = useBoundedQuery(
    `top-cities|${range.start.getTime()}|${range.end.getTime()}`,
    () => eventsStartingBetween(range.start, range.end, "desc"),
    toEv,
    MAX,
  );
  const cities = cityCounts(rows);
  const total = cities.reduce((n, c) => n + c.count, 0);

  return (
    <Card as="section" aria-labelledby="top-cities" aria-busy={loading || undefined} className="flex flex-col">
      <TileHeader id="top-cities" title="Top cities">
        <span className="overline">{RANGE_LABEL[rangeKey]}</span>
      </TileHeader>

      {loading ? (
        <BarListSkeleton />
      ) : error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : cities.length === 0 ? (
        <Empty emoji="🏙️" title="No events in this range" body="Cities rank here once published events are scheduled in the range." className="py-6" />
      ) : (
        <>
          <p className="mb-4 text-[13px] text-text-2">
            <CountUp value={String(total)} className="num font-bold text-text" /> {total === 1 ? "event" : "events"} across{" "}
            <CountUp value={String(cities.length)} className="num font-bold text-text" /> {cities.length === 1 ? "city" : "cities"}, by start date
          </p>
          <BarList items={cities.slice(0, SHOWN).map((c) => ({ label: c.city, value: c.count, display: new Intl.NumberFormat("en-IN").format(c.count) }))} />
          {cities.length > SHOWN ? <p className="mt-3 text-[12px] text-text-3">+{cities.length - SHOWN} more cities</p> : null}
          {truncated ? <Truncated shown={MAX} className="mt-4" /> : null}
        </>
      )}
    </Card>
  );
}
