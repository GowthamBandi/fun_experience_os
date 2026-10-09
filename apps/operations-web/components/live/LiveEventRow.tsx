"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Glyph, ProgressBar } from "@/components/pulse";
import { cn, relTime } from "@/lib/format";
import { categoryEmoji, type Ev } from "@/lib/overview";
import { useLiveDocument } from "@/lib/use-governance";

/** Occupancy bar shared by the Command Center card and the Live page. */
export function Fill({ ev }: { ev: Ev }) {
  const { taken, capacity } = ev;
  const pct = taken !== null && capacity ? Math.min((taken / capacity) * 100, 100) : 0;
  const full = pct >= 90;
  return (
    <div className="flex items-center gap-3">
      <div
        role="img"
        aria-label={taken !== null && capacity ? `${taken} of ${capacity} places taken` : "Occupancy not recorded"}
        className="h-2 flex-1 overflow-hidden rounded-pill bg-surface-high"
      >
        <div
          className={cn("h-full rounded-pill transition-[width] duration-200 ease-pulse", full ? "bg-[linear-gradient(90deg,var(--primary),var(--warn))]" : "bg-[linear-gradient(90deg,var(--primary),var(--volt))]")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span aria-hidden className="num min-w-[3.25rem] text-right text-[13px] font-bold text-text">
        {taken ?? "—"}/{capacity ?? "—"}
      </span>
    </div>
  );
}

const SOON_END_MS = 30 * 60_000;

function OrganizerName({ ev }: { ev: Ev }) {
  // The event doc usually carries the name; only fetch the organizer when it doesn't.
  const { data } = useLiveDocument("publicOrganizers", ev.organizerName ? null : ev.orgId);
  const fetched = typeof data?.name === "string" && data.name.trim() ? data.name.trim() : null;
  return <>{ev.organizerName ?? fetched ?? "—"}</>;
}

export function LiveEventRow({ ev, phase, now, action }: { ev: Ev; phase: "live" | "soon"; now: Date; action?: ReactNode }) {
  const endingSoon = phase === "live" && ev.endsAt !== null && ev.endsAt.getTime() - now.getTime() <= SOON_END_MS;
  const timing = phase === "live" ? `Ends ${relTime(ev.endsAt, now)}` : `Starts ${relTime(ev.startsAt, now)}`;
  return (
    <li className="rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] p-4">
      <div className="flex flex-wrap items-center gap-3">
        <Glyph emoji={categoryEmoji(ev.category)} tone="violet" className="h-10 w-10 rounded-[12px] text-[18px]" />
        <div className="min-w-0 flex-1 basis-48">
          <div className="truncate text-[14px] font-semibold text-text">{ev.title}</div>
          <div className="truncate text-[12px] text-text-3">
            {ev.city ?? "—"} · <OrganizerName ev={ev} />
          </div>
        </div>
        <Badge tone={endingSoon ? "warn" : phase === "live" ? "ok" : "violet"}>{endingSoon ? "Ending soon" : phase === "live" ? "Live" : "Starting soon"}</Badge>
        <span className="num shrink-0 text-[12px] text-text-2">
          {timing}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="min-w-[12rem] flex-1">
          {ev.taken !== null && ev.capacity ? <ProgressBar value={ev.taken} max={ev.capacity} label="Places taken" /> : <Fill ev={ev} />}
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/events/${encodeURIComponent(ev.id)}`} className="focus-ring inline-flex h-8 items-center rounded-[12px] border border-line bg-surface-high px-3 text-[12px] font-semibold text-text hover:bg-surface-top">
            Open
          </Link>
          {action}
        </div>
      </div>
    </li>
  );
}
