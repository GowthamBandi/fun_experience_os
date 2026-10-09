"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

// CSS-only: shown on hover and on keyboard focus inside the wrapper.
export function Tooltip({ label, children, side = "top" }: { label: string; children: ReactNode; side?: "top" | "bottom" }) {
  const id = useId();
  const child = isValidElement(children) ? cloneElement(children as ReactElement<{ "aria-describedby"?: string }>, { "aria-describedby": id }) : children;
  return (
    <span className="group/tip relative inline-flex">
      {child}
      <span
        role="tooltip"
        id={id}
        className={
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-[260px] -translate-x-1/2 rounded-[10px] border border-line bg-surface-top px-2.5 py-1.5 text-[12px] font-medium leading-4 text-text opacity-0 shadow-[0_12px_32px_-12px_rgba(0,0,0,0.6)] transition-[opacity,transform] duration-150 ease-pulse group-focus-within/tip:opacity-100 group-hover/tip:opacity-100 " +
          (side === "top"
            ? "bottom-full mb-2 translate-y-1 group-focus-within/tip:translate-y-0 group-hover/tip:translate-y-0"
            : "top-full mt-2 -translate-y-1 group-focus-within/tip:translate-y-0 group-hover/tip:translate-y-0")
        }
      >
        {label}
      </span>
    </span>
  );
}
