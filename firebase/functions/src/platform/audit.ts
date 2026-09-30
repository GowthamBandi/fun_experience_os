import type { Transaction, WriteBatch } from "firebase-admin/firestore";
import { auditRef, serverNow } from "./firestore";

export interface AuditRecord {
  action: string;
  actorUid: string;
  /** "platform:<role>", "org:<orgId>:<owner|staff>", "customer", "system". */
  actorRole: string;
  resourceType: string;
  resourceId: string;
  orgId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string | null;
  requestId?: string | null;
  source?: "pulse-app" | "operations-console" | "webhook" | "scheduler" | "system";
}

/**
 * Appends an audit event inside the caller's transaction/batch. Audit events
 * are append-only: rules deny all client writes and no code path updates them.
 */
export function writeAudit(writer: Transaction | WriteBatch, record: AuditRecord): void {
  const ref = auditRef();
  const doc = {
    ...record,
    orgId: record.orgId ?? null,
    before: record.before ?? null,
    after: record.after ?? null,
    reason: record.reason ?? null,
    requestId: record.requestId ?? null,
    source: record.source ?? "pulse-app",
    at: serverNow(),
    schemaVersion: 2,
  };
  if ("getAll" in writer) {
    (writer as Transaction).create(ref, doc);
  } else {
    (writer as WriteBatch).create(ref, doc);
  }
}
