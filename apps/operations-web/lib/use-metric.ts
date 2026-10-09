"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dailyBuckets, metricErrorMessage, previousRange, type MetricKey, type TimeRange } from "@/lib/metrics";
import { runMetricKey, type MetricScope } from "@/lib/metrics-firestore";

const TTL_MS = 60_000;
const cache = new Map<string, { at: number; value: Promise<number> }>();

/** Caches the in-flight promise so identical concurrent requests share one query; failures are not kept. */
function cached(key: MetricKey, range: TimeRange | undefined, fresh: boolean, scope?: MetricScope): Promise<number> {
  const id = `${key}|${range?.start.getTime() ?? ""}|${range?.end.getTime() ?? ""}|${scope?.orgId ?? ""}`;
  const hit = cache.get(id);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = runMetricKey(key, range, scope);
  const entry = { at: Date.now(), value };
  cache.set(id, entry);
  value.catch(() => {
    if (cache.get(id) === entry) cache.delete(id);
  });
  return value;
}

export interface MetricState {
  value: number | null;
  previous: number | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/** One KPI. Failures stay inside this hook so one card errors without affecting the rest. `orgId` scopes it to one organizer. */
export function useMetric(specKey: MetricKey, range: TimeRange | undefined, compare = false, orgId?: string): MetricState {
  const [state, setState] = useState<Omit<MetricState, "retry">>({ value: null, previous: null, loading: true, error: null });
  const [attempt, setAttempt] = useState(0);
  const retried = useRef(false);
  const start = range?.start.getTime();
  const end = range?.end.getTime();

  useEffect(() => {
    let live = true;
    const current = start !== undefined && end !== undefined ? { start: new Date(start), end: new Date(end) } : undefined;
    setState((s) => ({ ...s, loading: true, error: null }));
    const fresh = retried.current;
    retried.current = false;
    const scope = orgId ? { orgId } : undefined;
    Promise.all([cached(specKey, current, fresh, scope), compare && current ? cached(specKey, previousRange(current), fresh, scope) : Promise.resolve(null)])
      .then(([value, previous]) => live && setState({ value, previous, loading: false, error: null }))
      .catch((err) => live && setState({ value: null, previous: null, loading: false, error: metricErrorMessage(err) }));
    return () => {
      live = false;
    };
  }, [specKey, start, end, compare, attempt, orgId]);

  const retry = useCallback(() => {
    retried.current = true;
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, retry };
}

const dayLabel = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d);

export interface SeriesState {
  points: Array<{ label: string; value: number }>;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/** Daily values for the last `days` IST days, fetched concurrently. */
export function useSeries(specKey: MetricKey, days = 30): SeriesState {
  const [state, setState] = useState<Omit<SeriesState, "retry">>({ points: [], loading: true, error: null });
  const [attempt, setAttempt] = useState(0);
  const retried = useRef(false);

  useEffect(() => {
    let live = true;
    const buckets = dailyBuckets(days, new Date());
    setState((s) => ({ ...s, loading: true, error: null }));
    const fresh = retried.current;
    retried.current = false;
    Promise.all(buckets.map((b) => cached(specKey, b, fresh)))
      .then((values) => live && setState({ points: buckets.map((b, i) => ({ label: dayLabel(b.start), value: values[i]! })), loading: false, error: null }))
      .catch((err) => live && setState({ points: [], loading: false, error: metricErrorMessage(err) }));
    return () => {
      live = false;
    };
  }, [specKey, days, attempt]);

  const retry = useCallback(() => {
    retried.current = true;
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, retry };
}
