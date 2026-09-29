import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { COLLECTIONS, auditRef, db, receiptRef, serverNow } from "../platform/firestore";
import { DomainError, invalidInput } from "../platform/errors";
import type { VerifiedActor } from "../platform/auth";
import type { EntityStatusCommand, GovernanceDecisionCommand, GovernanceCaseKind } from "./model";

const ENTITY_COLLECTION = {
  organizer: COLLECTIONS.organizers,
  arena: COLLECTIONS.arenas,
  event: COLLECTIONS.events,
  "risk-alert": COLLECTIONS.riskAlerts,
} as const;

const CASE_TARGET = {
  "organizer-kyc": { collection: COLLECTIONS.organizers, approved: "active" },
  "arena-verification": { collection: COLLECTIONS.arenas, approved: "active" },
  "event-approval": { collection: COLLECTIONS.events, approved: "active" },
  "commission-proposal": { collection: COLLECTIONS.commercialAgreements, approved: "approved" },
  "fraud-alert": { collection: COLLECTIONS.riskAlerts, approved: "resolved" },
  "refund-exception": { collection: COLLECTIONS.refundCases, approved: "approved" },
  "settlement-release": { collection: COLLECTIONS.settlementControls, approved: "approved-for-release" },
} as const;

function conflict(message: string, detail?: Record<string, unknown>): DomainError {
  return new DomainError("CONFLICT", message, { nextStep: "Refresh the record and review the latest state before trying again.", detail });
}

function asVersion(value: unknown): number {
  return Number.isSafeInteger(value) ? Number(value) : 0;
}

async function replay(transaction: Transaction, firestore: Firestore, requestId: string, action: string, actor: VerifiedActor) {
  const ref = firestore.collection(COLLECTIONS.commandReceipts).doc(requestId);
  const snap = await transaction.get(ref);
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (data.action !== action || data.actorUid !== actor.uid) throw conflict("This request ID has already been used for another action.");
  return data.result as Record<string, unknown>;
}

function audit(transaction: Transaction, payload: Record<string, unknown>) {
  transaction.create(auditRef(), { ...payload, at: serverNow(), schemaVersion: 1 });
}

export async function decideGovernanceCase(command: GovernanceDecisionCommand, actor: VerifiedActor) {
  const firestore = db();
  return firestore.runTransaction(async (transaction) => {
    const prior = await replay(transaction, firestore, command.requestId, "governance.case-decided", actor);
    if (prior) return { ...prior, replayed: true };

    const caseRef = firestore.collection(COLLECTIONS.governanceCases).doc(command.caseId);
    const caseSnap = await transaction.get(caseRef);
    if (!caseSnap.exists) throw new DomainError("BOOKING_NOT_FOUND", "This governance case no longer exists.", { nextStep: "Return to the queue and select another case." });
    const current = caseSnap.data()!;
    const currentVersion = asVersion(current.version);
    if (currentVersion !== command.expectedVersion) throw conflict("Someone else changed this case while you were reviewing it.", { currentVersion });
    if (!["pending", "under-review", "information-requested"].includes(String(current.status))) throw conflict("This case has already reached a final decision.");

    const kind = String(current.kind) as GovernanceCaseKind;
    const target = CASE_TARGET[kind];
    if (!target) throw invalidInput("This governance case type is not supported.");
    const targetId = typeof current.targetId === "string" ? current.targetId : "";
    const targetRef = targetId ? firestore.collection(target.collection).doc(targetId) : null;
    const targetSnap = targetRef ? await transaction.get(targetRef) : null;
    const now = serverNow();
    const nextVersion = currentVersion + 1;
    const decision = { outcome: command.outcome, note: command.note, actorUid: actor.uid, actorRoleId: actor.roleId, decidedAt: now };
    transaction.update(caseRef, { status: command.outcome, decision, version: nextVersion, updatedAt: now, updatedBy: actor.uid });

    if (targetId) {
      if (targetRef && targetSnap?.exists) {
        const targetStatus = command.outcome === "approved" ? target.approved : command.outcome;
        transaction.update(targetRef, { status: targetStatus, version: FieldValue.increment(1), updatedAt: now, updatedBy: actor.uid });
      }
    }

    const result = { caseId: command.caseId, status: command.outcome, version: nextVersion, replayed: false };
    audit(transaction, {
      action: "governance.case-decided", actorUid: actor.uid, actorRoleId: actor.roleId,
      resourceType: "governanceCase", resourceId: command.caseId, targetId: targetId || null,
      before: { status: current.status, version: currentVersion }, after: { status: command.outcome, version: nextVersion },
      reason: command.note || "Approval checks completed.", policyVersion: current.policyVersion ?? null,
    });
    transaction.create(receiptRef(command.requestId), { action: "governance.case-decided", actorUid: actor.uid, result, createdAt: now });
    return result;
  });
}

export async function changeMarketplaceEntityStatus(command: EntityStatusCommand, actor: VerifiedActor) {
  const firestore = db();
  return firestore.runTransaction(async (transaction) => {
    const prior = await replay(transaction, firestore, command.requestId, "governance.entity-status-changed", actor);
    if (prior) return { ...prior, replayed: true };
    const collection = ENTITY_COLLECTION[command.entityType];
    const ref = firestore.collection(collection).doc(command.entityId);
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new DomainError("BOOKING_NOT_FOUND", "This marketplace record no longer exists.", { nextStep: "Refresh the list and select another record." });
    const current = snap.data()!;
    const currentVersion = asVersion(current.version);
    if (currentVersion !== command.expectedVersion) throw conflict("Someone else changed this record while you were reviewing it.", { currentVersion });
    const nextVersion = currentVersion + 1;
    const now = serverNow();
    transaction.update(ref, { status: command.status, statusReason: command.reason, version: nextVersion, updatedAt: now, updatedBy: actor.uid });
    const result = { entityType: command.entityType, entityId: command.entityId, status: command.status, version: nextVersion, replayed: false };
    audit(transaction, {
      action: "governance.entity-status-changed", actorUid: actor.uid, actorRoleId: actor.roleId,
      resourceType: command.entityType, resourceId: command.entityId,
      before: { status: current.status, version: currentVersion }, after: { status: command.status, version: nextVersion }, reason: command.reason,
    });
    transaction.create(receiptRef(command.requestId), { action: "governance.entity-status-changed", actorUid: actor.uid, result, createdAt: now });
    return result;
  });
}
