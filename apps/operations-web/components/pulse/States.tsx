import type { ReactNode } from "react";
import { AlertTriangle, Info, RotateCw } from "lucide-react";
import { cn, truncatedCopy } from "@/lib/format";
import { Button } from "./Button";

/** Empty and error titles are styled paragraphs, not headings, so they never skip a level under a page h1. */
export function Empty({ emoji, title, body, action, className }: { emoji: string; title: string; body?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      <div
        aria-hidden
        className="grid h-16 w-16 place-items-center rounded-[20px] border border-line-soft bg-[radial-gradient(circle_at_50%_35%,rgba(142,114,255,0.32),rgba(26,23,38,0.6)_70%)] text-[30px] shadow-[0_16px_40px_-16px_rgba(142,114,255,0.6)]"
      >
        {emoji}
      </div>
      <p className="mt-4 font-display text-[18px] font-bold tracking-[-0.02em] text-text">{title}</p>
      {body ? <p className="mt-1.5 max-w-sm text-[14px] leading-[1.5] text-text-2">{body}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, onRetry, className }: { message: string; onRetry?: () => void; className?: string }) {
  return (
    <div role="alert" className={cn("flex flex-col items-center px-6 py-10 text-center", className)}>
      <div aria-hidden className="grid h-14 w-14 place-items-center rounded-[18px] bg-[rgba(255,97,120,0.14)] text-err shadow-[0_0_0_6px_rgba(255,97,120,0.06)]">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <p className="mt-4 font-display text-[17px] font-bold tracking-[-0.02em] text-text">Couldn’t load this</p>
      <p className="mt-1.5 max-w-md break-words text-[13px] leading-[1.5] text-text-2">{message}</p>
      {onRetry ? (
        <Button variant="ghost" size="sm" icon={<RotateCw />} onClick={onRetry} className="mt-4">
          Retry
        </Button>
      ) : null}
    </div>
  );
}

/**
 * A capped read hit its limit. `newest` only when the read is ordered newest first;
 * otherwise the list is just the first N the query returned.
 */
export function Truncated({ shown, newest = false, noun = "records", className }: { shown: number; newest?: boolean; noun?: string; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 rounded-control border border-dashed border-line px-3.5 py-2.5 text-[12px] text-text-3", className)}>
      <Info aria-hidden className="h-3.5 w-3.5 shrink-0 text-info" />
      <span>{truncatedCopy(shown, newest, noun)}</span>
    </p>
  );
}
