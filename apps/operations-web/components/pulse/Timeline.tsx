import { cn } from "@/lib/format";
import { TONE_DOT, type BadgeTone } from "./Badge";

export type TimelineItem = { id: string; at: Date | null; title: string; body?: string; tone?: BadgeTone; actor?: string };

const STAMP = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

const CLOCK = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

const valid = (d: Date | null): d is Date => d instanceof Date && !Number.isNaN(d.getTime());

/** `onSelect` makes each title a button; `stamp="time"` shows only the clock time (for lists already grouped by day). */
export function Timeline({ items, className, onSelect, stamp = "full" }: { items: TimelineItem[]; className?: string; onSelect?: (id: string) => void; stamp?: "full" | "time" }) {
  return (
    <ol className={cn("relative flex flex-col", className)}>
      {items.map((item, i) => (
        <li key={item.id} className="relative flex gap-3.5 pb-5 last:pb-0">
          {i < items.length - 1 ? <span aria-hidden className="absolute left-[5px] top-4 h-[calc(100%-8px)] w-px bg-[linear-gradient(var(--line),transparent)]" /> : null}
          <span aria-hidden className={cn("relative mt-[5px] h-[11px] w-[11px] shrink-0 rounded-full", TONE_DOT[item.tone ?? "muted"])} />
          <div className="min-w-0 flex-1">
            {onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className="focus-ring -mx-1.5 rounded-[8px] px-1.5 text-left text-[14px] font-semibold leading-5 text-text underline-offset-2 hover:underline"
              >
                {item.title}
              </button>
            ) : (
              <div className="text-[14px] font-semibold leading-5 text-text">{item.title}</div>
            )}
            {item.body ? <p className="mt-0.5 break-words text-[13px] leading-5 text-text-2">{item.body}</p> : null}
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[12px] text-text-3">
              {valid(item.at) ? <time dateTime={item.at.toISOString()}>{(stamp === "time" ? CLOCK : STAMP).format(item.at)}</time> : <span>—</span>}
              {item.actor ? (
                <>
                  <span aria-hidden>·</span>
                  <span className="truncate">{item.actor}</span>
                </>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
