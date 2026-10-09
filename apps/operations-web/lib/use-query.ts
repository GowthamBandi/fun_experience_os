"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDocs, limit, query, type DocumentData, type Query } from "firebase/firestore";
import { describeReadError } from "@/lib/console/errors";

export interface BoundedQuery<T> {
  rows: T[];
  loading: boolean;
  error: string | null;
  /** More than `max` documents matched; `rows` holds the first `max`. */
  truncated: boolean;
  retry: () => void;
}

export function readErrorMessage(err: unknown): string {
  const code = typeof err === "object" && err !== null ? String((err as { code?: unknown }).code ?? "") : "";
  if (code === "failed-precondition") return "This list needs a Firestore index that isn't deployed yet.";
  return describeReadError(err instanceof Error ? err.message : String(err));
}

/**
 * A one-shot read capped at `max` rows (it asks for max + 1 to detect truncation).
 * It re-runs when `key` changes; a null key skips the read. `build` and `map` are
 * read at run time, so they don't need to be stable.
 */
export function useBoundedQuery<T>(
  key: string | null,
  build: () => Query<DocumentData>,
  map: (id: string, data: DocumentData) => T,
  max = 250,
): BoundedQuery<T> {
  const [state, setState] = useState<Omit<BoundedQuery<T>, "retry">>({ rows: [], loading: key !== null, error: null, truncated: false });
  const [attempt, setAttempt] = useState(0);
  const fns = useRef({ build, map });
  fns.current = { build, map };

  useEffect(() => {
    if (key === null) {
      setState({ rows: [], loading: false, error: null, truncated: false });
      return;
    }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    (async () => {
      try {
        const snap = await getDocs(query(fns.current.build(), limit(max + 1)));
        if (!live) return;
        const docs = snap.docs.slice(0, max);
        setState({ rows: docs.map((d) => fns.current.map(d.id, d.data())), loading: false, error: null, truncated: snap.size > max });
      } catch (err) {
        if (live) setState({ rows: [], loading: false, error: readErrorMessage(err), truncated: false });
      }
    })();
    return () => {
      live = false;
    };
  }, [key, max, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}

export interface OneShot<T> {
  value: T | null;
  loading: boolean;
  error: string | null;
  retry: () => void;
}

/** One async read (e.g. a count aggregation), re-run when `key` changes; a null key skips it. */
export function useOneShot<T>(key: string | null, run: () => Promise<T>): OneShot<T> {
  const [state, setState] = useState<Omit<OneShot<T>, "retry">>({ value: null, loading: key !== null, error: null });
  const [attempt, setAttempt] = useState(0);
  const fn = useRef(run);
  fn.current = run;

  useEffect(() => {
    if (key === null) {
      setState({ value: null, loading: false, error: null });
      return;
    }
    let live = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn.current().then(
      (value) => live && setState({ value, loading: false, error: null }),
      (err) => live && setState({ value: null, loading: false, error: readErrorMessage(err) }),
    );
    return () => {
      live = false;
    };
  }, [key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { ...state, retry };
}
