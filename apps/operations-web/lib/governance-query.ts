/**
 * What each live governance list reads (pure, no Firebase imports): path, filters and
 * ordering, plus the +1 probe that tells a full list from a cut one.
 */

import type { GovernanceCollection } from "./governance-api";
import { OPEN_CASE_STATUS_LIST, OPEN_RISK_STATUS_LIST, OPEN_SETTLEMENT_STATUS_LIST } from "./console/attention";

export const QUERY_LIMIT = 250;

export interface ListSpec {
  path: string;
  /** Single-field equality filter. */
  equals?: { field: string; value: string };
  /** Server-side `status in [...]` (open-item reads); needs a (status, order field) composite. */
  statusIn?: readonly string[];
  order?: { field: string; direction: "asc" | "desc" };
}

/** "all" lists everything newest first; "open" reads only items waiting on someone (Approvals inbox, rail badges, Needs-you). */
export type ListScope = "all" | "open";

const NEWEST = (field: string) => ({ field, direction: "desc" as const });

/**
 * Every timestamp below is written by the backend on create (createdAt) or on every
 * write (updatedAt / at); orderBy drops docs without the field, so only fields the
 * writers always set are used. Collections without one keep document-id order.
 */
export const LIST_SPECS: Record<GovernanceCollection, ListSpec> = {
  governanceCases: { path: "governanceCases", order: NEWEST("createdAt") },
  organizers: { path: "organizers", order: NEWEST("createdAt") },
  arenas: { path: "arenas", order: NEWEST("createdAt") },
  events: { path: "events" },
  commercialAgreements: { path: "commercialAgreements", order: NEWEST("createdAt") },
  riskAlerts: { path: "riskAlerts", order: NEWEST("createdAt") },
  refundCases: { path: "refundCases" },
  settlementControls: { path: "settlementControls" },
  policyVersions: { path: "policyVersions", order: NEWEST("createdAt") },
  auditEvents: { path: "auditEvents", order: NEWEST("at") },
  customers: { path: "customers" },
  users: { path: "users" },
  // Ordering here would need a (scope, createdAt) composite; the list is small and sorted client-side.
  operators: { path: "users", equals: { field: "scope", value: "platform" } },
  refunds: { path: "refunds", order: NEWEST("createdAt") },
  settlements: { path: "settlements", order: NEWEST("createdAt") },
  experiences: { path: "experiences" },
  organizerApplications: { path: "organizerApplications", order: NEWEST("createdAt") },
  reviews: { path: "reviews", order: NEWEST("updatedAt") },
  legalHolds: { path: "legalHolds", order: NEWEST("updatedAt") },
  jobRuns: { path: "jobRuns", order: NEWEST("updatedAt") },
};

/** Open-item reads: the statuses the attention queue and the inbox count, newest first. */
export const OPEN_SPECS: Partial<Record<GovernanceCollection, ListSpec>> = {
  governanceCases: { path: "governanceCases", statusIn: OPEN_CASE_STATUS_LIST, order: NEWEST("createdAt") },
  riskAlerts: { path: "riskAlerts", statusIn: OPEN_RISK_STATUS_LIST, order: NEWEST("createdAt") },
  refunds: { path: "refunds", statusIn: ["under-review"], order: NEWEST("createdAt") },
  settlements: { path: "settlements", statusIn: OPEN_SETTLEMENT_STATUS_LIST, order: NEWEST("createdAt") },
};

export function listSpec(name: GovernanceCollection, scope: ListScope = "all"): ListSpec {
  if (scope === "open") {
    const open = OPEN_SPECS[name];
    if (!open) throw new Error(`No open-item read is defined for ${name}.`);
    return open;
  }
  return LIST_SPECS[name];
}

/** True when the list comes back newest first, so a cut list really is "the newest N". */
export function isNewestFirst(spec: ListSpec): boolean {
  return spec.order?.direction === "desc";
}

/**
 * A read asks for `max + 1` docs: the extra one only proves there is more. Shows at
 * most `max`; truncated only when more than `max` came back (exactly `max` is complete).
 */
export function capRows<T>(rows: readonly T[], max = QUERY_LIMIT): { rows: T[]; truncated: boolean } {
  return { rows: rows.slice(0, max), truncated: rows.length > max };
}
