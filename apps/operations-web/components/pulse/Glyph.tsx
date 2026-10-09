import { cn } from "@/lib/format";
import { TONE_TINT, type BadgeTone } from "./Badge";

export function Glyph({ emoji, tone, className }: { emoji: string; tone: BadgeTone; className?: string }) {
  return (
    <span aria-hidden className={cn("grid h-10 w-10 shrink-0 select-none place-items-center rounded-[13px] text-[20px] leading-none", TONE_TINT[tone], className)}>
      {emoji}
    </span>
  );
}
