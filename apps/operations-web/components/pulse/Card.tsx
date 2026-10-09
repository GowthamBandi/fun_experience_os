import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/format";

export type CardProps = HTMLAttributes<HTMLElement> & {
  as?: ElementType;
  className?: string;
  interactive?: boolean;
  children?: ReactNode;
};

export function Card({ as: Tag = "div", className, interactive = false, children, ...rest }: CardProps) {
  return (
    <Tag
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
