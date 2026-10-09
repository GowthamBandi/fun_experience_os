"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useNow } from "@/lib/hooks";
import { rangeFor, type RangeKey, type TimeRange } from "@/lib/metrics";
import { parseRange } from "@/lib/overview";
import { useSearchParamSetter } from "@/lib/use-search-param";

export interface ConsoleRange {
  now: Date | null;
  rangeKey: RangeKey;
  /** Start of today in IST (epoch ms), or null before the clock is known. */
  dayKey: number | null;
  range: TimeRange | null;
  setRange: (key: RangeKey) => void;
}

/** The `?range=` time range shared by console dashboards. Needs a Suspense boundary (useSearchParams). */
export function useConsoleRange(): ConsoleRange {
  const now = useNow();
  const params = useSearchParams();
  const rangeKey = parseRange(params.get("range"));
  // Ranges only move at IST midnight; keying on the day keeps the metric hooks' inputs stable.
  const dayKey = now ? rangeFor("today", now).start.getTime() : null;
  const range = useMemo(() => (dayKey === null ? null : rangeFor(rangeKey, new Date(dayKey))), [rangeKey, dayKey]);
  const setParam = useSearchParamSetter();
  const setRange = useCallback((key: RangeKey) => setParam("range", key === "today" ? null : key), [setParam]);
  return { now, rangeKey, dayKey, range, setRange };
}
