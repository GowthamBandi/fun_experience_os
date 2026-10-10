"use client";

import { createContext, useCallback, useContext, useMemo } from "react";
import { buildAttentionQueue, type AttentionInput, type AttentionItem } from "@/lib/console/attention";
import { canViewRoute } from "@/lib/console/capabilities";
import { useAdminSession } from "@/lib/firebase/auth";
import { useGovernanceCollection } from "@/lib/use-governance";

export type AttentionRoute = "approvals" | "risk" | "refunds";

export interface Attention {
  items: AttentionItem[];
  total: number;
  byRoute: Record<AttentionRoute, number>;
  loading: boolean;
  /** First source that failed to load; counts are then incomplete. */
  error: string | null;
  /** Re-subscribes the sources that failed. */
  refresh: () => void;
  /** The open-item sources behind the counts (Needs-you rows on the Command Center). */
  sources: Required<AttentionInput>;
}

/** The Command Center's attention queue, shared by the rail badges and the notifications drawer. */
export function useAttention(): Attention {
  const { consoleRole } = useAdminSession();
  // Auditors cannot read these collections; skip the listeners rather than collect permission errors.
  // Open items only, longest-waiting first: a capped read of the whole collection would count an arbitrary sample.
  const enabled = canViewRoute(consoleRole, "/approvals");
  const cases = useGovernanceCollection("governanceCases", enabled, "open");
  const risks = useGovernanceCollection("riskAlerts", enabled, "open");
  const refunds = useGovernanceCollection("refunds", enabled, "open");
  const settlements = useGovernanceCollection("settlements", enabled, "open");
  const sources = [cases, risks, refunds, settlements];
  const loading = sources.some((s) => s.loading);
  const error = sources.find((s) => s.error)?.error ?? null;
  const refresh = useCallback(() => {
    for (const s of [cases, risks, refunds, settlements]) if (s.error) s.refresh();
  }, [cases.error, risks.error, refunds.error, settlements.error]); // eslint-disable-line react-hooks/exhaustive-deps

  const sourceData = useMemo<Required<AttentionInput>>(
    () => ({
      governanceCases: cases.records,
      riskAlerts: risks.records,
      refunds: refunds.records,
      settlements: settlements.records,
      truncated: { governanceCases: cases.truncated, riskAlerts: risks.truncated, refunds: refunds.truncated, settlements: settlements.truncated },
    }),
    [cases.records, risks.records, refunds.records, settlements.records, cases.truncated, risks.truncated, refunds.truncated, settlements.truncated],
  );
  const items = useMemo(() => buildAttentionQueue(sourceData), [sourceData]);

  return useMemo(() => {
    const count = (href: string) => items.filter((i) => i.href === href).reduce((n, i) => n + i.count, 0);
    return {
      items,
      total: items.reduce((n, i) => n + i.count, 0),
      byRoute: { approvals: count("/approvals"), risk: count("/risk"), refunds: count("/refunds") },
      loading,
      error,
      refresh,
      sources: sourceData,
    };
  }, [items, loading, error, refresh, sourceData]);
}

const AttentionContext = createContext<Attention | null>(null);

/** AppShell runs useAttention once; pages read the same listeners through this. */
export const AttentionProvider = AttentionContext.Provider;

export function useSharedAttention(): Attention {
  const value = useContext(AttentionContext);
  if (!value) throw new Error("useSharedAttention must be used inside AppShell.");
  return value;
}
