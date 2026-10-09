"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useReducedMotion } from "framer-motion";
import { RotateCw } from "lucide-react";
import { cn, type deltaPct } from "@/lib/format";
import { Button } from "./Button";
import { Card } from "./Card";
import { Skeleton } from "./Skeleton";
import { formatCountable, parseCountable } from "./count-up";

type Delta = ReturnType<typeof deltaPct>;

const DELTA_TONE: Record<Delta["tone"], string> = {
  up: "bg-[rgba(63,221,154,0.14)] text-ok",
  down: "bg-[rgba(255,97,120,0.14)] text-err",
  new: "bg-[rgba(217,255,63,0.14)] text-volt",
  flat: "bg-[rgba(255,255,255,0.06)] text-text-3",
  none: "",
};

const DELTA_WORD: Record<Delta["tone"], string> = { up: "Up", down: "Down", new: "New", flat: "Flat", none: "" };

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
const COUNT_MS = 600;

function useCountUp(value: string): string {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const from = useRef(0);

  useIsoLayoutEffect(() => {
    const target = parseCountable(value);
    if (!target || reduced) {
      setShown(value);
      if (target) from.current = target.target;
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / COUNT_MS, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      if (p < 1) {
        setShown(formatCountable(target, start + (target.target - start) * eased));
        raf = requestAnimationFrame(tick);
      } else {
        setShown(value);
      }
    };
    setShown(formatCountable(target, start));
    raf = requestAnimationFrame(tick);
    from.current = target.target;
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);

  return shown;
}

export function DeltaPill({ delta, className }: { delta: Delta; className?: string }) {
  if (delta.tone === "none" || !delta.label) return null;
  const spoken = `${DELTA_WORD[delta.tone]} ${delta.label.replace(/[▲▼]\s*/, "")}`;
  return (
    <span
      aria-label={spoken}
      className={cn("inline-flex items-center rounded-pill px-2 py-[3px] font-display text-[12px] font-bold leading-4", DELTA_TONE[delta.tone], className)}
    >
      {delta.tone === "new" ? "✦ new" : delta.label}
    </span>
  );
}

export type StatProps = {
  label: string;
  value: string;
  delta?: Delta;
  hint?: string;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  className?: string;
  children?: ReactNode;
};

export function Stat({ label, value, delta, hint, loading = false, error = null, onRetry, className, children }: StatProps) {
  const shown = useCountUp(loading || error ? "" : value);

  return (
    <Card className={cn("flex min-w-0 flex-col overflow-hidden", className)} aria-busy={loading || undefined}>
      <div className="overline truncate font-semibold">{label}</div>
      {loading ? (
        <div aria-hidden className="mt-3 flex flex-col gap-2.5">
          <Skeleton className="h-[38px] w-36 rounded-[12px]" />
          <Skeleton className="h-[22px] w-20 rounded-pill" />
        </div>
      ) : error ? (
        <div role="alert" className="mt-3 flex flex-col items-start gap-3">
          <p className="text-[13px] leading-5 text-err">{error}</p>
          {onRetry ? (
            <Button variant="ghost" size="sm" icon={<RotateCw />} onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="num mt-2 truncate text-[38px] font-bold leading-[1.1] text-text">
            <span aria-hidden>{shown}</span>
            <span className="sr-only">{value}</span>
          </div>
          {(delta && delta.tone !== "none") || hint ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {delta ? <DeltaPill delta={delta} /> : null}
              {hint ? <span className="text-[12px] text-text-3">{hint}</span> : null}
            </div>
          ) : null}
        </>
      )}
      {children}
    </Card>
  );
}
