import type { ReactNode } from "react";
import { cn } from "@/lib/format";

/** Shared page gutters and max width for console pages. */
export const PAGE_CONTAINER = "mx-auto w-full max-w-[1440px] px-5 pb-12 pt-2 lg:px-7";

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn(PAGE_CONTAINER, className)}>{children}</div>;
}
