import { Badge, ProgressBar } from "@/components/pulse";
import { artFor } from "@/lib/approvals";
import { ratio } from "@/lib/events";
import { inrMinor } from "@/lib/format";
import { eventBadge, type OrgEventRow } from "@/lib/organizers";
import { categoryEmoji } from "@/lib/overview";

/** The category emoji on a tinted tile. */
export function EventEmoji({ category, size = 40 }: { category: string | null; size?: number }) {
  return (
    <span
      aria-hidden
      className="grid shrink-0 place-items-center rounded-[13px]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.48), background: `${artFor(category).color}26`, boxShadow: `inset 0 0 0 1px ${artFor(category).color}33` }}
    >
      {categoryEmoji(category)}
    </span>
  );
}

export function EventTitleCell({ e }: { e: Pick<OrgEventRow, "title" | "category" | "venue"> }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <EventEmoji category={e.category} />
      <div className="min-w-0">
        <div className="truncate font-semibold text-text">{e.title}</div>
        <div className="truncate text-[12px] text-text-3">{e.venue ?? "—"}</div>
      </div>
    </div>
  );
}

/** Sold / capacity over a fill bar; "—" when either side is unknown. */
export function FillCell({ e }: { e: Pick<OrgEventRow, "sold" | "capacity" | "title"> }) {
  const pct = ratio(e.sold, e.capacity);
  return (
    <div className="flex min-w-[120px] flex-col gap-1.5">
      <span className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="num text-text">
          {e.sold ?? "—"}
          <span className="text-text-3">/{e.capacity ?? "—"}</span>
        </span>
        <span className={pct !== null && pct >= 100 ? "font-display text-[11px] font-bold text-ok" : "num text-[11px] text-text-3"}>{pct === null ? "—" : pct >= 100 ? "Full" : `${pct}%`}</span>
      </span>
      <ProgressBar value={e.sold ?? 0} max={e.capacity ?? 0} ariaLabel={`${e.title}: ${pct === null ? "fill unknown" : `${pct}% full`}`} className="[&>div]:h-1.5" />
    </div>
  );
}

export function EventStatusBadge({ status, className }: { status: string | null; className?: string }) {
  const b = eventBadge(status);
  return (
    <Badge tone={b.tone} className={className}>
      {status === "live" ? <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current motion-safe:animate-pulse" /> : null}
      {b.label}
    </Badge>
  );
}

export const priceLabel = (minor: number | null) => (minor === 0 ? "Free" : inrMinor(minor));
