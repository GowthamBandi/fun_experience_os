"use client";

import { useCallback, useEffect, useState } from "react";
import { listOrderOf, subscribeDocument, subscribeGovernanceCollection, type GovernanceCollection, type LiveGovernanceRecord, type PageCursor } from "./governance-api";
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
  /** How the read is ordered, so a truncated list says what it kept ("the newest N", "the N longest-waiting"). */
  const order = listOrderOf(name, scope);
  return { records, loading, error, truncated, refresh, cursor, order };
}

/**
 * Live single document. `loading` is true from the very render the id changes (the state is keyed
 * by collection/id), so a caller never sees a settled "not found" before the first snapshot.
 */
export function useLiveDocument(collectionName: string | null, id: string | null) {
  const key = collectionName && id ? `${collectionName}/${id}` : null;
  const [state, setState] = useState<{ key: string | null; data: Record<string, unknown> | null; error: string | null }>({ key: null, data: null, error: null });
  useEffect(() => {
    if (!collectionName || !id) return;
    const k = `${collectionName}/${id}`;
    const fail = (error: string) => setState((s) => ({ key: k, data: s.key === k ? s.data : null, error }));
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeDocument(collectionName, id, (next) => setState({ key: k, data: next, error: null }), (message) => fail(describeReadError(message)));
    } catch (cause) {
      fail(cause instanceof Error ? cause.message : "The record could not be loaded.");
    }
    return unsubscribe;
  }, [collectionName, id]);
  const current = key !== null && state.key === key;
  return { data: current ? state.data : null, loading: key !== null && !current, error: current ? state.error : null };
}
