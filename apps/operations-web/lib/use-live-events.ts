"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, Timestamp, where, type DocumentData, type Query } from "firebase/firestore";
import { getFirebaseClient } from "@/lib/firebase/client";
import { useNow } from "@/lib/hooks";
import { liveCutMatters, splitLive, toEv, type Ev } from "@/lib/overview";
import { readErrorMessage } from "@/lib/use-query";

export type { Ev } from "@/lib/overview";

/** The listener's "not ended" cut-off is re-anchored every 30 min, so ended events stop taking up the limit. */
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

/**
 * Events that haven't ended by `since`, soonest-ending first. A single range, so the
 * single-field index on endsAt serves it. catalog/events.ts writes endsAt on every
 * save (startsAt + duration), so no event is missed for lacking it.
 */
export function eventsEndingAfter(since: Date): Query<DocumentData> {
  return query(collection(getFirebaseClient().firestore, "events"), where("endsAt", ">=", Timestamp.fromDate(since)), orderBy("endsAt", "asc"));
}

export interface LiveEvents {
  live: Ev[];
  soon: Ev[];
  loading: boolean;
  error: string | null;
  /** More than LIVE_LIMIT events matched and the cut fell among live or soon ones, so some may be missing. */
  truncated: boolean;
  retry: () => void;
}

/**
 * Events not yet ended, live from Firestore, split client-side into live now and
 * starting within 12 h. Multi-day events stay live until their endsAt.
 */
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
      const q = query(eventsEndingAfter(new Date(anchor)), limit(LIVE_LIMIT + 1));
      unsubscribe = onSnapshot(
        q,
        (snap) => {
          const all = snap.docs.map((d) => toEv(d.id, d.data()));
          setEvents(all.slice(0, LIVE_LIMIT));
          setTruncated(liveCutMatters(all, LIVE_LIMIT, new Date()));
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
