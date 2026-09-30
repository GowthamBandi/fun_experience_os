"use client";

import { useCallback, useEffect, useState } from "react";
import { subscribeDocument, subscribeGovernanceCollection, type GovernanceCollection, type LiveGovernanceRecord, type PageCursor } from "./governance-api";
import { describeReadError } from "./console/errors";

export function useGovernanceCollection(name: GovernanceCollection) {
  const [records, setRecords] = useState<LiveGovernanceRecord[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  /** Last document of the live page — the startAfter cursor for older pages. */
  const [cursor, setCursor] = useState<PageCursor | null>(null);
  useEffect(() => {
    setLoading(true);
    setError(null);
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeGovernanceCollection(
        name,
        (next, more, last) => { setRecords(next); setTruncated(more); setCursor(last); setLoading(false); setError(null); },
        (message) => { setError(describeReadError(message)); setLoading(false); },
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The records could not be loaded.");
      setLoading(false);
    }
    return unsubscribe;
  }, [name, attempt]);
  /** Re-subscribes (fresh read) — used by the conflict "refresh" action. */
  const refresh = useCallback(() => setAttempt((n) => n + 1), []);
  return { records, loading, error, truncated, refresh, cursor };
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
