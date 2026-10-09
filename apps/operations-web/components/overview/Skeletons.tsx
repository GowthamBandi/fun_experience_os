import { Skeleton } from "@/components/pulse";

/** Placeholder bento cells; each entry is the cell's span and height classes. */
export function BentoSkeleton({ cells }: { cells: string[] }) {
  return (
    <>
      {cells.map((c, i) => (
        <div key={i} aria-hidden className={`col-span-2 rounded-card border border-line-soft bg-[rgba(26,23,38,0.6)] p-5 ${c}`}>
          <Skeleton className="h-3 w-24 rounded-pill" />
          <Skeleton className="mt-3 h-8 w-32 rounded-[12px]" />
        </div>
      ))}
    </>
  );
}

/** Placeholder rows shaped like a BarList. */
export function BarListSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3.5 pt-1">
      {["w-[90%]", "w-[70%]", "w-1/2", "w-[35%]"].map((w) => (
        <div key={w} className="grid grid-cols-[6rem_1fr_3rem] items-center gap-3">
          <Skeleton className="h-3.5 rounded-pill" />
          <Skeleton className={`h-2 rounded-pill ${w}`} />
          <Skeleton className="h-3.5 rounded-pill" />
        </div>
      ))}
    </div>
  );
}
