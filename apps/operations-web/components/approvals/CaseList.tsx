"use client";

import { useEffect, useRef } from "react";
import { Badge, ErrorState, Glyph, SkeletonRows, Tabs, Truncated } from "@/components/pulse";
import { LANES, caseBadge, caseGlyph, caseMeta, type Lane } from "@/lib/approvals";
import type { LiveGovernanceRecord } from "@/lib/governance-api";
import { cn } from "@/lib/format";

const LANE_EMPTY: Record<Lane, string> = {
  all: "No one is waiting for approval.",
  hosts: "No host applications are waiting.",
  experiences: "No experience or event submissions are waiting.",
  info: "No cases are waiting on more information.",
};

export function CaseList({
  lane,
  onLane,
  counts,
  records,
  selectedId,
  onSelect,
  loading,
  error,
  onRetry,
  truncated,
  shown,
  now,
}: {
  lane: Lane;
  onLane: (lane: Lane) => void;
  counts: Record<Lane, number>;
  records: LiveGovernanceRecord[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  truncated: boolean;
  shown: number;
  now: Date | null;
}) {
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    if (!selectedId) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-case="${CSS.escape(selectedId)}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedId]);

  return (
    <aside aria-label="Approval queue" className="flex min-h-0 flex-col gap-3 rounded-card border border-line-soft bg-[rgba(26,23,38,0.55)] p-3 backdrop-blur-[12px] lg:h-full">
      <Tabs label="Queue lanes" value={lane} onChange={(id) => onLane(id as Lane)} tabs={LANES.map((l) => ({ ...l, count: loading || error ? undefined : counts[l.id] }))} className="!grid w-full grid-cols-2 !rounded-[20px] [&>button]:justify-center" />
      <div className="min-h-0 flex-1 overflow-y-auto pr-0.5 max-lg:max-h-[360px]">
        {loading ? (
          <SkeletonRows rows={5} />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : records.length === 0 ? (
          <p className="rounded-control border border-dashed border-line px-4 py-8 text-center text-[13px] text-text-3">{LANE_EMPTY[lane]}</p>
        ) : (
          <ul ref={listRef} aria-label="Cases" className="flex flex-col gap-1.5">
            {records.map((r) => {
              const on = r.id === selectedId;
              const glyph = caseGlyph(r.raw);
              const badge = caseBadge(r.raw.status);
              return (
                <li key={r.id} data-case={r.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(r.id)}
                    aria-current={on ? "true" : undefined}
                    className={cn(
                      "focus-ring group relative flex w-full items-center gap-3 rounded-control border p-3 text-left transition-[background-color,border-color,box-shadow] duration-200 ease-pulse",
                      on
                        ? "border-[rgba(142,114,255,0.45)] bg-[linear-gradient(180deg,rgba(142,114,255,0.2),rgba(142,114,255,0.08))] shadow-[0_10px_30px_-18px_rgba(142,114,255,0.9)]"
                        : "border-transparent hover:border-line-soft hover:bg-[rgba(255,255,255,0.04)]",
                    )}
                  >
                    {on ? <span aria-hidden className="absolute -left-[3px] top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-pill bg-primary" /> : null}
                    <Glyph emoji={glyph.emoji} tone={glyph.tone} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[14.5px] font-bold tracking-[-0.01em] text-text">{r.primary}</span>
                      <span className="mt-0.5 block truncate text-[12px] text-text-3">{caseMeta(r.raw, now)}</span>
                    </span>
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {!loading && !error && truncated ? <Truncated shown={shown} className="mt-3" /> : null}
      </div>
    </aside>
  );
}
