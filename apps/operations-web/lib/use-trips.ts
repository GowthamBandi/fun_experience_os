"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { describeReadError } from "./console/errors";
import { subscribeTripDrafts } from "./governance-api";
import { toTripRow, type TripRow, type TripStatus } from "./trips";

/**
 * Live tripDrafts with one status (null skips the listener and reports an empty, settled source).
 * Rows are unordered; lib/trips.ts tripQueue() orders them.
 */
export function useTripDrafts(status: TripStatus | null) {
  const [state, setState] = useState<{ key: string | null; raw: Array<{ id: string; raw: Record<string, unknown> }>; truncated: boolean; error: string | null }>({
    key: null,
    raw: [],
    truncated: false,
    error: null,
  });
  const [attempt, setAttempt] = useState(0);
  const key = status ? `${status}#${attempt}` : null;

  useEffect(() => {
    if (!status) return;
    const k = `${status}#${attempt}`;
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeTripDrafts(
        status,
        (raw, truncated) => setState({ key: k, raw, truncated, error: null }),
        (message) => setState((s) => ({ key: k, raw: s.key === k ? s.raw : [], truncated: false, error: describeReadError(message) })),
      );
    } catch (cause) {
      setState({ key: k, raw: [], truncated: false, error: cause instanceof Error ? cause.message : "The trips could not be loaded." });
    }
    return unsubscribe;
  }, [status, attempt]);

  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  const current = key !== null && state.key === key;
  const rows: TripRow[] = useMemo(() => (current ? state.raw.map((d) => toTripRow(d.id, d.raw)) : []), [current, state.raw]);
  return {
    rows,
    loading: key !== null && !current,
    error: current ? state.error : null,
    truncated: current ? state.truncated : false,
    refresh,
  };
}
