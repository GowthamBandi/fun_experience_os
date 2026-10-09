import { cn } from "@/lib/format";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton", className)} />;
}

export function SkeletonRows({ rows = 5, className }: { rows?: number; className?: string }) {
  return (
    <div role="status" aria-busy="true" className={cn("flex flex-col gap-2", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className="flex items-center gap-3 rounded-control border border-line-soft bg-[rgba(255,255,255,0.03)] p-3"
          style={{ opacity: 1 - (i / Math.max(rows, 1)) * 0.55 }}
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-[13px]" />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-3/5 rounded-pill" />
            <Skeleton className="h-3 w-2/5 rounded-pill" />
          </div>
          <Skeleton className="h-8 w-16 shrink-0 rounded-[12px]" />
        </div>
      ))}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
