"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Badge, Card, CountUp, Empty, ErrorState, Glyph, SkeletonRows } from "@/components/pulse";
import { cn } from "@/lib/format";
import { needsYouRows, type NeedsKind } from "@/lib/overview";
import { useSharedAttention } from "@/lib/use-attention";
import { TileHeader } from "./Tile";

const SHOWN = 6;

const AREAS = [
  { label: "Approvals", href: "/approvals", emoji: "🪪", kinds: ["kyc", "experience", "event", "case"] },
  { label: "Risk", href: "/risk", emoji: "🚨", kinds: ["risk"] },
  { label: "Refunds", href: "/refunds", emoji: "💸", kinds: ["refund"] },
  { label: "Settlements", href: "/settlements", emoji: "🏦", kinds: ["settlement"] },
] as const satisfies ReadonlyArray<{ label: string; href: string; emoji: string; kinds: readonly NeedsKind[] }>;

export function NeedsYou({ now }: { now: Date }) {
  const attention = useSharedAttention();
  const rows = needsYouRows(attention.sources, now);
  const urgent = rows.filter((r) => r.severity === "critical").length;
  const truncated = Object.values(attention.sources.truncated).some(Boolean);
  const hidden = rows.length - SHOWN;
  const settled = !attention.loading || rows.length > 0;

  return (
    <Card as="section" aria-labelledby="needs-you" aria-busy={!settled || undefined} className="flex flex-col">
      <TileHeader id="needs-you" title="Needs you 🔥">
        {urgent > 0 ? <Badge tone="err">{urgent} urgent</Badge> : null}
        {rows.length > 0 ? (
          <Badge tone="volt" className="min-w-[24px] justify-center">
            <CountUp value={String(rows.length)} />
            {truncated ? "+" : ""}
          </Badge>
        ) : null}
      </TileHeader>

      {!settled ? (
        <SkeletonRows rows={4} />
      ) : attention.error && rows.length === 0 ? (
        <ErrorState message={attention.error} onRetry={attention.refresh} />
      ) : rows.length === 0 ? (
        <Empty
          emoji="✨"
          title="Nothing needs you 🎉 — the queue is clear."
          body="New KYC applications, risk alerts, refunds and settlements land here the moment they arrive."
          className="flex-1 justify-center"
        />
      ) : (
        <>
          {attention.error ? (
            <p role="alert" className="mb-2 rounded-control border border-[rgba(255,184,77,0.35)] bg-[rgba(255,184,77,0.08)] px-3 py-2 text-[12px] text-warn">
              Some sources didn’t load, so this list may be short.{" "}
              <button type="button" onClick={attention.refresh} className="focus-ring font-semibold underline underline-offset-2">
                Retry
              </button>
            </p>
          ) : null}
          <ul className="flex flex-col gap-2">
            {rows.slice(0, SHOWN).map((row, i) => (
              <li key={row.key}>
                <Link
                  href={row.href}
                  className="focus-ring group flex items-center gap-3 rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] p-3 transition-[background-color,border-color,transform] duration-150 ease-pulse hover:-translate-y-px hover:border-[rgba(142,114,255,0.35)] hover:bg-[rgba(255,255,255,0.05)] motion-reduce:hover:translate-y-0"
                >
                  <Glyph emoji={row.emoji} tone={row.tone} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-bold text-text">{row.title}</p>
                      {row.severity === "critical" ? (
                        <>
                          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-err shadow-[0_0_0_3px_rgba(255,97,120,0.2)]" />
                          <span className="sr-only">Urgent.</span>
                        </>
                      ) : null}
                    </div>
                    <p className="mt-0.5 truncate text-[12px] text-text-3">{row.meta}</p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[12px] px-3.5 text-[13px] transition-[box-shadow,background-color] duration-150 ease-pulse",
                      i === 0
                        ? "bg-volt font-display font-bold text-on-volt group-hover:shadow-[0_10px_28px_-10px_rgba(217,255,63,0.65)]"
                        : "border border-line bg-surface-high font-semibold text-text group-hover:bg-surface-top",
                    )}
                  >
                    {i === 0 ? "Review" : "Open"}
                    <ArrowRight aria-hidden className="h-3.5 w-3.5 transition-transform duration-150 ease-pulse group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-4">
            {hidden > 0 || truncated ? (
              <p className="mb-2 text-[12px] text-text-3">
                {hidden > 0 ? `Showing the ${SHOWN} most pressing of ${rows.length}.` : null}
                {truncated ? " A source hit its 250-row limit, so there may be more." : null}
              </p>
            ) : null}
            <nav aria-label="Queues" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {AREAS.map((area) => {
                const n = rows.filter((r) => (area.kinds as readonly NeedsKind[]).includes(r.kind)).length;
                return (
                  <Link
                    key={area.href}
                    href={area.href}
                    className="focus-ring flex items-center gap-2.5 rounded-control border border-line-soft bg-[rgba(255,255,255,0.02)] px-3 py-2.5 transition-[border-color,background-color] duration-150 ease-pulse hover:border-[rgba(142,114,255,0.35)] hover:bg-[rgba(255,255,255,0.05)]"
                  >
                    <span aria-hidden className="text-[18px] leading-none">
                      {area.emoji}
                    </span>
                    <span className="min-w-0">
                      <CountUp value={String(n)} className={cn("num block text-[20px] font-bold leading-6", n > 0 ? "text-text" : "text-text-3")} />
                      <span className="block truncate text-[12px] text-text-3">{area.label}</span>
                    </span>
                  </Link>
                );
              })}
            </nav>
          </div>
        </>
      )}
    </Card>
  );
}
