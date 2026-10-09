import type { ElementType, HTMLAttributes, KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/format";

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  className?: string;
  interactive?: boolean;
  children?: ReactNode;
  href?: string;
};

export function Card({ as: Tag = "div", className, interactive = false, children, onKeyDown, ...rest }: CardProps) {
  // Interactive cards that aren't already a button, link or component get button semantics for keyboard users.
  const pseudoButton = interactive && typeof Tag === "string" && Tag !== "button" && Tag !== "a";
  const handleKey = pseudoButton
    ? (e: KeyboardEvent<HTMLElement>) => {
        onKeyDown?.(e);
        if (e.defaultPrevented || e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          e.currentTarget.click();
        }
      }
    : onKeyDown;

  return (
    <Tag
      role={pseudoButton ? "button" : undefined}
      tabIndex={pseudoButton ? 0 : undefined}
      onKeyDown={handleKey}
      className={cn(
        "glass relative rounded-card p-5",
        interactive &&
          "focus-ring cursor-pointer transition-[transform,border-color,box-shadow] duration-200 ease-pulse hover:-translate-y-0.5 hover:border-[rgba(142,114,255,0.4)] hover:shadow-[0_18px_48px_-20px_rgba(142,114,255,0.45)] motion-reduce:hover:translate-y-0",
        className,
      )}
      {...rest}
    >
      {children}
    </Tag>
  );
}
