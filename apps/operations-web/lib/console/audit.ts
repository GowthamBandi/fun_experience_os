/**
 * Pure audit-trail helpers: client-side filtering of loaded pages and merging
 * the live first page with older pages fetched via startAfter. Server-side
 * filtering (where action == …) would need composite indexes on auditEvents,
 * so the console filters what it has loaded and lets the operator page back.
 */

import type { DisplayRecord } from "./records";

export interface AuditFilter {
  action: string;
  resourceType: string;
  /** Free text matched against orgId, resourceId, actorUid and requestId. */
  subject: string;
}

export const EMPTY_AUDIT_FILTER: AuditFilter = { action: "", resourceType: "", subject: "" };

const str = (value: unknown) => (typeof value === "string" ? value : "");

export function auditFacets(records: DisplayRecord[]) {
  const actions = new Set<string>();
  const resourceTypes = new Set<string>();
  for (const record of records) {
    if (str(record.raw.action)) actions.add(str(record.raw.action));
    if (str(record.raw.resourceType)) resourceTypes.add(str(record.raw.resourceType));
  }
  return { actions: [...actions].sort(), resourceTypes: [...resourceTypes].sort() };
}

export function filterAudit(records: DisplayRecord[], filter: AuditFilter): DisplayRecord[] {
  const subject = filter.subject.trim().toLowerCase();
  return records.filter((record) => {
    const raw = record.raw;
    if (filter.action && str(raw.action) !== filter.action) return false;
    if (filter.resourceType && str(raw.resourceType) !== filter.resourceType) return false;
    if (subject) {
      const haystack = [raw.orgId, raw.resourceId, raw.actorUid, raw.requestId, record.id].map(str).join(" ").toLowerCase();
      if (!haystack.includes(subject)) return false;
    }
    return true;
  });
}

function millis(value: unknown): number {
  if (value && typeof value === "object") {
    const v = value as { toMillis?: () => number; seconds?: number };
    if (typeof v.toMillis === "function") return v.toMillis();
    if (typeof v.seconds === "number") return v.seconds * 1000;
  }
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

/**
 * Live page ∪ retained older pages, de-duplicated by id, newest first.
 * `retained` holds the live page as it was when paging started plus every older
 * page, so records pushed out of the live window by new events are not lost.
 */
export function mergeAuditPages(live: DisplayRecord[], retained: DisplayRecord[]): DisplayRecord[] {
  const byId = new Map<string, DisplayRecord>();
  for (const record of [...retained, ...live]) byId.set(record.id, record);
  return [...byId.values()].sort((a, b) => millis(b.raw.at) - millis(a.raw.at));
}
