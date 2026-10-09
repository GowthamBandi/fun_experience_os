import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/format";

export type ChipProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> & { selected?: boolean; children: ReactNode };

export function Chip({ selected = false, onClick, children, className, type = "button", ...rest }: ChipProps) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "focus-ring inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-pill border px-3.5 text-[13px]",
        "transition-[background-color,border-color,color,transform] duration-150 ease-pulse active:scale-[0.97] motion-reduce:active:scale-100",
        selected
          ? "border-text bg-text font-bold text-ink"
          : "border-line font-medium text-text-2 hover:border-[rgba(255,255,255,0.22)] hover:bg-[rgba(255,255,255,0.04)] hover:text-text",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
