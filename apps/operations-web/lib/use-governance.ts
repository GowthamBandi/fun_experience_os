"use client";

import { useCallback, useEffect, useState } from "react";
import { listIsNewestFirst, subscribeDocument, subscribeGovernanceCollection, type GovernanceCollection, type LiveGovernanceRecord, type PageCursor } from "./governance-api";
import type { ListScope } from "./governance-query";
import { describeReadError } from "./console/errors";

/**
 * `enabled: false` skips the listener (e.g. a role the rules would refuse) and reports an empty, settled source.
 * `scope: "open"` reads only items waiting on someone (see lib/governance-query.ts).
 */
export function useGovernanceCollection(name: GovernanceCollection, enabled = true, scope: ListScope = "all") {
  const [records, setRecords] = useState<LiveGovernanceRecord[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Last document of the live page — the startAfter cursor for older pages. */
  const [cursor, setCursor] = useState<PageCursor | null>(null);
  useEffect(() => {
    if (!enabled) { setRecords([]); setTruncated(false); setCursor(null); setLoading(false); setError(null); return; }
    setLoading(true);
    setError(null);
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeGovernanceCollection(
        name,
        (next, more, last) => { setRecords(next); setTruncated(more); setCursor(last); setLoading(false); setError(null); },
        (message) => { setError(describeReadError(message)); setLoading(false); },
        scope,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The records could not be loaded.");
      setLoading(false);
    }
    return unsubscribe;
  }, [name, attempt, enabled, scope]);
  /** Re-subscribes (fresh read) — used by the conflict "refresh" action. */
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  /** The read is ordered newest first, so a truncated list is "the newest N". */
  const newest = listIsNewestFirst(name, scope);
  return { records, loading, error, truncated, refresh, cursor, newest };
}

export function useLiveDocument(collectionName: string | null, id: string | null) {
  const [data, setData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(Boolean(collectionName && id));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!collectionName || !id) { setData(null); setLoading(false); return; }
    setLoading(true);
    setError(null);
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeDocument(collectionName, id, (next) => { setData(next); setLoading(false); }, (message) => { setError(describeReadError(message)); setLoading(false); });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The record could not be loaded.");
      setLoading(false);
    }
    return unsubscribe;
  }, [collectionName, id]);
  return { data, loading, error };
}
