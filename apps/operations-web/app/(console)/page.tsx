"use client";

import { Suspense, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Chip, CountUp, PageHeader, Skeleton } from "@/components/pulse";
import { KpiBento } from "@/components/overview/KpiBento";
import { LiveNowCard } from "@/components/overview/LiveNowCard";
import { NeedsYou } from "@/components/overview/NeedsYou";
import { PrivilegedActivity } from "@/components/overview/PrivilegedActivity";
import { Tile } from "@/components/overview/Tile";
import { TopCities } from "@/components/overview/TopCities";
import { formatCount } from "@/lib/console/attention";
import { useAdminSession } from "@/lib/firebase/auth";
import { inrCompact } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import { rangeFor, type RangeKey } from "@/lib/metrics";
import { RANGE_KEYS, RANGE_LABEL, greetingFor, headlineFor, parseRange } from "@/lib/overview";
import { useSharedAttention } from "@/lib/use-attention";
import { useSharedLiveEvents } from "@/lib/use-live-events";
import { useMetric } from "@/lib/use-metric";

function Headline({ live, attention }: { live: number; attention: number }) {
  const h = headlineFor(live, attention);
  if (h.kind === "buzzing") {
    return (
      <>
        The city’s <em className="hl">buzzing</em> tonight.
      </>
    );
  }
  if (h.kind === "needs") {
    return h.n === 1 ? (
      <>
        <em className="hl">1 thing</em> needs you.
      </>
    ) : (
      <>
        <em className="hl">{h.n} things</em> need you.
      </>
    );
  }
  return (
    <>
      All <em className="hl">quiet</em> right now.
    </>
  );
}

const Pending = () => <span aria-hidden className="skeleton inline-block h-3.5 w-8 rounded-pill align-middle" />;

function Summary({ dayKey }: { dayKey: number }) {
  const attention = useSharedAttention();
  const live = useSharedLiveEvents();
  const today = useMemo(() => rangeFor("today", new Date(dayKey)), [dayKey]);
  const gross = useMetric("grossBookings", today);
  const truncated = Object.values(attention.sources.truncated).some(Boolean);

  return (
    <>
      {attention.loading ? <Pending /> : <CountUp value={formatCount(attention.total, truncated)} className="num font-bold text-text" />}{" "}
      {attention.total === 1 ? "thing needs" : "things need"} you ·{" "}
      {live.loading ? <Pending /> : live.error ? "—" : <CountUp value={String(live.live.length)} className="num font-bold text-text" />}{" "}
      {live.live.length === 1 ? "event" : "events"} live ·{" "}
      {gross.loading ? <Pending /> : <span className="num font-bold text-text">{inrCompact(gross.value)}</span>} moved today
    </>
  );
}

const SKELETON_CELLS = [
  "md:col-span-6 xl:col-span-5 xl:row-span-2 h-[268px] xl:h-auto",
  "col-span-1 md:col-span-2 xl:col-span-2 h-[132px]",
  "col-span-1 md:col-span-2 xl:col-span-2 h-[132px]",
  "md:col-span-2 xl:col-span-3 h-[132px]",
  "col-span-1 md:col-span-3 xl:col-span-4 h-[132px]",
  "col-span-1 md:col-span-3 xl:col-span-3 h-[132px]",
  "md:col-span-6 xl:col-span-7 xl:row-span-2 h-[420px]",
  "md:col-span-6 xl:col-span-5 h-[204px]",
  "md:col-span-6 xl:col-span-5 h-[204px]",
];

function BentoSkeleton() {
  return (
    <>
      {SKELETON_CELLS.map((c, i) => (
        <div key={i} aria-hidden className={`col-span-2 rounded-card border border-line-soft bg-[rgba(26,23,38,0.6)] p-5 ${c}`}>
          <Skeleton className="h-3 w-24 rounded-pill" />
          <Skeleton className="mt-3 h-8 w-32 rounded-[12px]" />
        </div>
      ))}
    </>
  );
}

const GRID = "grid grid-cols-2 gap-3.5 md:grid-cols-6 xl:grid-cols-12";
const PAGE = "mx-auto w-full max-w-[1440px] px-5 pb-12 pt-2 lg:px-7";

function CommandCenter() {
  const { user } = useAdminSession();
  const attention = useSharedAttention();
  const live = useSharedLiveEvents();
  const now = useNow();
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const params = useSearchParams();
  const rangeKey = parseRange(params.get("range"));
  // Ranges only move at IST midnight; keying on the day keeps the metric hooks' inputs stable.
  const dayKey = now ? rangeFor("today", now).start.getTime() : null;
  const range = useMemo(() => (dayKey === null ? null : rangeFor(rangeKey, new Date(dayKey))), [rangeKey, dayKey]);

  const setRange = useCallback(
    (key: RangeKey) => {
      const next = new URLSearchParams(params.toString());
      if (key === "today") next.delete("range");
      else next.set("range", key);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const firstName = user?.displayName?.trim().split(/\s+/)[0] || null;
  const hello = now ? greetingFor(now) : null;
  const ready = !attention.loading && !live.loading;

  return (
    <div className={PAGE}>
      <PageHeader
        overline={
          hello ? (
            <span className="text-[13px] normal-case tracking-normal">
              {hello.date} ·{" "}
              <b className="font-semibold text-text">
                {hello.greeting}
                {firstName ? `, ${firstName}` : ""} <span aria-hidden className="text-[#C2B4FF]">✦</span>
              </b>
            </span>
          ) : (
            <span aria-hidden className="skeleton inline-block h-3.5 w-48 rounded-pill align-middle" />
          )
        }
        title={ready ? <Headline live={live.live.length} attention={attention.total} /> : <Skeleton className="h-[44px] w-[min(520px,90%)] rounded-[14px]" />}
        subtitle={dayKey !== null ? <Summary dayKey={dayKey} /> : null}
        className="[&_h1]:text-[34px] md:[&_h1]:text-[44px]"
      />

      <div role="group" aria-label="Time range" className="mb-5 mt-5 flex flex-wrap gap-2">
        {RANGE_KEYS.map((key) => (
          <Chip key={key} selected={key === rangeKey} onClick={() => setRange(key)}>
            {RANGE_LABEL[key]}
          </Chip>
        ))}
      </div>

      <div className={GRID}>
        {range && now ? (
          <>
            <KpiBento range={range} rangeKey={rangeKey} start={0} />
            <Tile index={6} className="md:col-span-6 xl:col-span-7 xl:row-span-2">
              <NeedsYou now={now} />
            </Tile>
            <Tile index={7} className="md:col-span-6 xl:col-span-5">
              <LiveNowCard now={now} />
            </Tile>
            <Tile index={8} className="md:col-span-6 xl:col-span-5">
              <TopCities range={range} rangeKey={rangeKey} />
            </Tile>
            <Tile index={9} className="md:col-span-6 xl:col-span-12">
              <PrivilegedActivity />
            </Tile>
          </>
        ) : (
          <BentoSkeleton />
        )}
      </div>
    </div>
  );
}

export default function CommandCenterPage() {
  return (
    <Suspense
      fallback={
        <div className={PAGE}>
          <Skeleton className="h-4 w-48 rounded-pill" />
          <Skeleton className="mt-4 h-[44px] w-[min(520px,90%)] rounded-[14px]" />
          <div className={`${GRID} mt-[88px]`}>
            <BentoSkeleton />
          </div>
        </div>
      }
    >
      <CommandCenter />
    </Suspense>
  );
}
