"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CountUp, Empty, ErrorState, Glyph, SkeletonRows } from "@/components/pulse";
import { cn, relTime } from "@/lib/format";
import { categoryEmoji, type Ev } from "@/lib/overview";
import { useSharedLiveEvents } from "@/lib/use-live-events";
import { Fill } from "@/components/live/LiveEventRow";
import { TileHeader } from "./Tile";

const SHOWN = 4;
const TIME = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

export function LiveNowCard({ now }: { now: Date }) {
  const { live, soon, loading, error, truncated, retry } = useSharedLiveEvents();
  const more = live.length - SHOWN;

  return (
    <Card as="section" aria-labelledby="live-now" aria-busy={loading || undefined} className="flex flex-col">
      <TileHeader id="live-now" title="Live now">
        {!loading && !error ? (
          <span className="flex items-center gap-2 text-[13px] text-text-2">
            <span aria-hidden className="relative flex h-2 w-2">
              {live.length > 0 ? <span className="absolute inline-flex h-full w-full rounded-full bg-ok opacity-60 motion-safe:animate-ping" /> : null}
              <span className={cn("relative inline-flex h-2 w-2 rounded-full", live.length > 0 ? "bg-ok shadow-[0_0_0_4px_rgba(63,221,154,0.18)]" : "bg-text-3")} />
            </span>
            <CountUp value={String(live.length)} className="num font-bold text-text" />
            {live.length === 1 ? "event" : "events"}
          </span>
        ) : null}
      </TileHeader>

      {loading ? (
        <SkeletonRows rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : live.length === 0 ? (
        <div className="flex flex-1 flex-col">
          <Empty
            emoji="🌙"
            title="Nothing live right now"
            body={soon.length ? "Here’s what starts in the next 12 hours." : "Events starting in the next 12 hours will show up here."}
            className="py-6"
          />
          {soon.length ? (
            <ul className="flex flex-col gap-2">
              {soon.slice(0, 3).map((ev) => (
                <li key={ev.id}>
                  <Link href={`/events/${encodeURIComponent(ev.id)}`} className="focus-ring flex items-center gap-3 rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] p-2.5 hover:border-[rgba(142,114,255,0.35)]">
                    <Glyph emoji={categoryEmoji(ev.category)} tone="violet" className="h-9 w-9 rounded-[12px] text-[17px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-text">{ev.title}</span>
                      <span className="block truncate text-[12px] text-text-3">{[ev.city, ev.startsAt ? TIME.format(ev.startsAt) : null].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="num shrink-0 text-[12px] font-bold text-[#C2B4FF]">{relTime(ev.startsAt, now)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-3.5">
            {live.slice(0, SHOWN).map((ev) => (
              <li key={ev.id}>
                <Link href={`/events/${encodeURIComponent(ev.id)}`} className="focus-ring -m-1.5 block rounded-[14px] p-1.5 hover:bg-[rgba(255,255,255,0.04)]">
                  <div className="mb-1.5 flex items-center gap-2.5">
                    <span aria-hidden className="text-[16px] leading-none">
                      {categoryEmoji(ev.category)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-text">
                      {ev.title}
                      {ev.city ? <span className="font-normal text-text-3"> · {ev.city}</span> : null}
                    </span>
                    <span className="shrink-0 text-[11px] text-text-3">ends {relTime(ev.endsAt, now)}</span>
                  </div>
                  <Fill ev={ev} />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-[12px] text-text-3">
            <span>{soon.length ? `${soon.length} more starting in the next 12 h` : "Fill = confirmed bookings / capacity"}</span>
            <Link href="/live" className="focus-ring inline-flex items-center gap-1 rounded-pill font-semibold text-[#C2B4FF] hover:text-text">
              {more > 0 ? `+${more} more on Live` : "Open Live"}
              <ArrowRight aria-hidden className="h-3.5 w-3.5" />
            </Link>
          </div>
        </>
      )}
      {truncated && !error ? <p className="mt-2 text-[11px] text-text-3">Showing the 100 soonest-ending events; some live or upcoming ones may be missing.</p> : null}
    </Card>
  );
}
