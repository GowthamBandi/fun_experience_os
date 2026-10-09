import type { ReactNode } from "react";
import { cn } from "@/lib/format";

// Highlight words with <em className="hl"> (volt to mint gradient text, defined in globals.css).
export function PageHeader({
  overline,
  title,
  subtitle,
  actions,
  className,
}: {
  overline?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-4", className)}>
      <div className="min-w-0 max-w-3xl">
        {overline ? <div className="overline mb-2 font-semibold">{overline}</div> : null}
        <h1 className="font-display text-[40px] font-bold leading-[1.05] tracking-[-0.03em] text-text [&_em]:not-italic">{title}</h1>
        {subtitle ? <p className="mt-2 text-[15px] leading-[1.5] text-text-2">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}
