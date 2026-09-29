/**
 * Shared command plumbing: audit events and idempotency receipts.
 *
 * AUDIT EVENT SHAPE (schemaVersion 1) — identical to the console's local
 * workspace implementation (apps/operations-web/lib/prototype/governance/commands.ts):
 *
 *   { action, subject, summary, entityType, entityId, before, after,
 *     actorUid, actorName, actorRoleId, at, schemaVersion, requestId?, ...context }
 *
 * COMMAND RECEIPT SHAPE — `commandReceipts/{requestId}`:
 *
 *   { requestId, command, actorUid, result, createdAt, expiresAt }
 *
 * `expiresAt` is the Firestore TTL field (see firestore.indexes.json
 * fieldOverrides). A receipt only needs to outlive the client retry horizon.
 */

import type { DocumentReference, Transaction } from "firebase-admin/firestore";
import { Timestamp, auditRef, receiptRef } from "./firestore";
import { conflict } from "./errors";

export const AUDIT_SCHEMA_VERSION = 1;
export const RECEIPT_TTL_DAYS = 7;

export interface AuditActor {
  uid: string;
  displayName: string;
  roleId: string;
}

/** The actor recorded for scheduled / automatic work. */
export const SYSTEM_ACTOR: AuditActor = { uid: "system", displayName: "System", roleId: "system" };

export interface AuditEntry {
  action: string;
  subject: string;
  summary: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  requestId?: string;
  /** Extra indexed context (territoryId, sessionId, policyVersion, reason, targetId...). */
  context?: Record<string, unknown>;
}

export function auditPayload(actor: AuditActor, entry: AuditEntry, at: Timestamp): Record<string, unknown> {
  return {
    ...(entry.context ?? {}),
    action: entry.action,
    subject: entry.subject,
    summary: entry.summary,
    entityType: entry.entityType,
    entityId: entry.entityId,
    before: entry.before ?? null,
    after: entry.after ?? null,
    requestId: entry.requestId ?? null,
    actorUid: actor.uid,
    actorName: actor.displayName,
    actorRoleId: actor.roleId,
    at,
    schemaVersion: AUDIT_SCHEMA_VERSION,
  };
}

export function writeAudit(tx: Transaction, actor: AuditActor, entry: AuditEntry, at: Timestamp): DocumentReference {
  const ref = auditRef();
  tx.create(ref, auditPayload(actor, entry, at));
  return ref;
}

export interface CommandReceipt<T> {
  requestId: string;
  command: string;
  actorUid: string;
  result: T;
  createdAt: Timestamp;
  expiresAt: Timestamp;
}

/**
 * Validates a stored receipt against the incoming command. Returns the stored
 * result when it is a genuine replay, `null` when there is no receipt, and
 * throws CONFLICT when the request ID was used by another actor, for another
 * command, or for another subject (`sameSubject` returns false).
 */
export function replayFrom<T>(
  data: Record<string, unknown> | undefined,
  command: string,
  actorUid: string,
  sameSubject: (result: T) => boolean = () => true
): T | null {
  if (!data) return null;
  const result = data.result as T | undefined;
  if (data.command !== command || data.actorUid !== actorUid || result === undefined || !sameSubject(result)) {
    throw conflict("This request ID has already been used for another action.", { command });
  }
  return result;
}

export async function readReceipt<T>(
  tx: Transaction,
  requestId: string,
  command: string,
  actorUid: string,
  sameSubject?: (result: T) => boolean
): Promise<T | null> {
  const snap = await tx.get(receiptRef(requestId));
  return replayFrom<T>(snap.exists ? snap.data() : undefined, command, actorUid, sameSubject);
}

export function receiptPayload<T>(requestId: string, command: string, actorUid: string, result: T, now: Timestamp): CommandReceipt<T> {
  return {
    requestId,
    command,
    actorUid,
    result,
    createdAt: now,
    expiresAt: Timestamp.fromMillis(now.toMillis() + RECEIPT_TTL_DAYS * 86_400_000),
  };
}

export function writeReceipt<T>(tx: Transaction, requestId: string, command: string, actorUid: string, result: T, now: Timestamp) {
  tx.create(receiptRef(requestId), receiptPayload(requestId, command, actorUid, result, now));
}
