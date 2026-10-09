"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where, type DocumentData, type Query } from "firebase/firestore";
import { getFirebaseClient } from "@/lib/firebase/client";
import { useNow } from "@/lib/hooks";
import { splitLive, toEv, type Ev } from "@/lib/overview";
import { readErrorMessage } from "@/lib/use-query";

export type { Ev } from "@/lib/overview";

const HOUR = 3_600_000;
/** The ±12 h listener window is re-anchored every 30 min so it never goes stale. */
const ANCHOR_MS = 30 * 60_000;
export const LIVE_LIMIT = 100;

/** Events starting in [start, end): range and order on the same field, so the automatic single-field index serves it. */
export function eventsStartingBetween(start: Date, end: Date, direction: "asc" | "desc" = "asc"): Query<DocumentData> {
  return query(
    collection(getFirebaseClient().firestore, "events"),
    where("startsAt", ">=", Timestamp.fromDate(start)),
    where("startsAt", "<", Timestamp.fromDate(end)),
    orderBy("startsAt", direction),
  );
}

export interface LiveEvents {
  live: Ev[];
  soon: Ev[];
  loading: boolean;
  error: string | null;
  /** The window hit LIVE_LIMIT, so some events may be missing. */
  truncated: boolean;
  retry: () => void;
}

/** Events starting between now − 12 h and now + 12 h, live from Firestore, split into live now and starting soon. */
export function useLiveEvents(enabled = true): LiveEvents {
  const now = useNow(30_000);
  const anchor = now ? Math.floor(now.getTime() / ANCHOR_MS) * ANCHOR_MS : null;
  const [events, setEvents] = useState<Ev[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setEvents([]);
      setTruncated(false);
      setLoading(false);
      setError(null);
      return;
    }
    if (anchor === null) return;
    setError(null);
    let unsubscribe = () => {};
    try {
      // Anchored a little wide (one extra slot each side) so the 12 h edges stay covered between re-anchors.
      const q = query(eventsStartingBetween(new Date(anchor - 12 * HOUR - ANCHOR_MS), new Date(anchor + 12 * HOUR + ANCHOR_MS)), limit(LIVE_LIMIT));
      unsubscribe = onSnapshot(
        q,
        (snap) => {
          setEvents(snap.docs.map((d) => toEv(d.id, d.data())));
          setTruncated(snap.size >= LIVE_LIMIT);
          setLoading(false);
          setError(null);
        },
        (err) => {
          setError(readErrorMessage(err));
          setLoading(false);
        },
      );
    } catch (err) {
      setError(readErrorMessage(err));
      setLoading(false);
    }
    return unsubscribe;
  }, [anchor, enabled, attempt]);

  const retry = useCallback(() => {
    setLoading(true);
    setAttempt((n) => n + 1);
  }, []);
  const split = useMemo(() => (now ? splitLive(events, now) : { live: [], soon: [] }), [events, now]);
  return useMemo(() => ({ ...split, loading, error, truncated, retry }), [split, loading, error, truncated, retry]);
}

const LiveEventsContext = createContext<LiveEvents | null>(null);

/** AppShell runs useLiveEvents once (it feeds the rail badge); pages read the same listener through this. */
export const LiveEventsProvider = LiveEventsContext.Provider;

export function useSharedLiveEvents(): LiveEvents {
  const value = useContext(LiveEventsContext);
  if (!value) throw new Error("useSharedLiveEvents must be used inside AppShell.");
  return value;
}
