"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { resolveDataMode } from "@/lib/firebase/mode";
import type { IntakeInput, GovernanceEntityStatus, GovernanceEntityType, GovernanceOutcome } from "@/lib/prototype/governance/commands";
import {
  adaptGovernanceDoc,
  decideCaseRemote,
  setEntityStatusRemote,
  submitIntakeRemote,
  subscribeGovernanceCollection,
  type GovernanceCollection,
  type LiveGovernanceRecord,
} from "./governance-api";

const LOCAL = resolveDataMode() === "prototype";

function byNewest(a: LiveGovernanceRecord, b: LiveGovernanceRecord) {
  return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
}

/** Governance records for one collection, from the local workspace or live Firestore. */
export function useGovernanceCollection(name: GovernanceCollection) {
  const { state, hydrated } = useStore();
  const [remote, setRemote] = useState<LiveGovernanceRecord[]>([]);
  const [loading, setLoading] = useState(!LOCAL);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (LOCAL) return;
    setLoading(true);
    setError(null);
    let unsubscribe = () => {};
    let cancelled = false;
    subscribeGovernanceCollection(
      name,
      (next) => {
        setRemote(next.sort(byNewest));
        setLoading(false);
      },
      (message) => {
        setError(message);
        setLoading(false);
      },
    )
      .then((off) => (cancelled ? off() : (unsubscribe = off)))
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : "The records could not be loaded.");
        setLoading(false);
      });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [name]);

  const local = useMemo(
    () =>
      LOCAL
        ? state.governance
            .filter((d) => d.collection === name)
            .map((d) => adaptGovernanceDoc(d.id, d.data, d.version, d.updatedAt))
            .sort(byNewest)
        : [],
    [state.governance, name],
  );

  return LOCAL ? { records: local, loading: !hydrated, error: null as string | null } : { records: remote, loading, error };
}

function messageOf(cause: unknown): string {
  if (cause && typeof cause === "object" && "message" in cause) return String((cause as { message: unknown }).message);
  return "The action could not be completed.";
}

/** Governance commands. Resolves to `{ error }` instead of throwing. */
export function useGovernanceActions() {
  const store = useStore();
  const { decideGovernanceCase, setGovernanceEntityStatus, submitGovernanceIntake } = store;

  const decide = useCallback(
    async (caseId: string, version: number, outcome: GovernanceOutcome, note: string): Promise<{ error?: string }> => {
      if (LOCAL) return decideGovernanceCase(caseId, version, outcome, note);
      try {
        await decideCaseRemote(caseId, version, outcome, note);
        return {};
      } catch (cause) {
        return { error: messageOf(cause) };
      }
    },
    [decideGovernanceCase],
  );

  const setStatus = useCallback(
    async (entityType: GovernanceEntityType, entityId: string, version: number, status: GovernanceEntityStatus, reason: string): Promise<{ error?: string }> => {
      if (LOCAL) return setGovernanceEntityStatus(entityType, entityId, version, status, reason);
      try {
        await setEntityStatusRemote(entityType, entityId, version, status, reason);
        return {};
      } catch (cause) {
        return { error: messageOf(cause) };
      }
    },
    [setGovernanceEntityStatus],
  );

  const submitIntake = useCallback(
    async (input: IntakeInput): Promise<{ error?: string }> => {
      if (LOCAL) return submitGovernanceIntake(input);
      try {
        await submitIntakeRemote(input);
        return {};
      } catch (cause) {
        return { error: messageOf(cause) };
      }
    },
    [submitGovernanceIntake],
  );

  return { decide, setStatus, submitIntake };
}
