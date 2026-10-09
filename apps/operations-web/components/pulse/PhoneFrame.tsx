import type { ReactNode } from "react";
import { cn } from "@/lib/format";

// 360×720 device for experience previews; the screen scrolls inside the bezel.
export function PhoneFrame({ children, className, label = "Phone preview" }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "relative h-[720px] w-[360px] shrink-0 rounded-[44px] bg-[linear-gradient(160deg,#2a2540,#0b0a12_45%,#1a1726)] p-[10px] shadow-[0_40px_120px_-30px_rgba(142,114,255,0.45),inset_0_0_0_1px_rgba(255,255,255,0.12)]",
        className,
      )}
    >
      <span aria-hidden className="absolute -left-[3px] top-[120px] h-8 w-[3px] rounded-l-[2px] bg-[#2a2540]" />
      <span aria-hidden className="absolute -left-[3px] top-[170px] h-14 w-[3px] rounded-l-[2px] bg-[#2a2540]" />
      <span aria-hidden className="absolute -right-[3px] top-[150px] h-20 w-[3px] rounded-r-[2px] bg-[#2a2540]" />
      <div className="relative h-full w-full overflow-hidden rounded-[34px] bg-ink ring-1 ring-black">
        <span aria-hidden className="absolute left-1/2 top-[10px] z-20 flex h-[28px] w-[112px] -translate-x-1/2 items-center justify-end rounded-pill bg-black pr-3">
          <span className="h-2.5 w-2.5 rounded-full bg-[radial-gradient(circle_at_35%_35%,#3a3a5a,#0b0b14_70%)]" />
        </span>
        <div className="h-full w-full overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>
  );
}
