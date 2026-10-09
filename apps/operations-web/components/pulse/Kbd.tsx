import type { ReactNode } from "react";
import { cn } from "@/lib/format";

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[6px] border border-line-soft bg-surface-high px-1.5 font-display text-[11px] font-semibold leading-none text-text-2 shadow-[inset_0_-1px_0_rgba(255,255,255,0.06)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}
