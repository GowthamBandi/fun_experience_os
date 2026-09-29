"use client";

import { useEffect, useState } from "react";
import { subscribeGovernanceCollection, type GovernanceCollection, type LiveGovernanceRecord } from "./governance-api";

export function useGovernanceCollection(name: GovernanceCollection) {
  const [records, setRecords] = useState<LiveGovernanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setLoading(true);
    setError(null);
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeGovernanceCollection(name, (next) => { setRecords(next); setLoading(false); }, (message) => { setError(message); setLoading(false); });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The records could not be loaded.");
      setLoading(false);
    }
    return unsubscribe;
  }, [name]);
  return { records, loading, error };
}
