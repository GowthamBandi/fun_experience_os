/**
 * Marketplace governance commands (authoritative server implementation).
 *
 * Behaviour is kept identical to the console's local workspace implementation
 * (apps/operations-web/lib/prototype/governance/commands.ts):
 *   - optimistic concurrency on `version`
 *   - finalized cases cannot be re-decided
 *   - explicit status transition rules per entity type (ENTITY_TRANSITIONS)
 *   - a reason is mandatory for every non-approval decision
 *   - every change writes an audit event naming the server-resolved actor
 *
 * Server-only rules (the local workspace should mirror these):
 *   - a decision fails when the case's linked record (targetId) is missing
 *   - a `settlement-release` approval is refused while the settlement's
 *     organizer has any risk alert whose status is not `resolved`
 * Every command is idempotent by requestId (commandReceipts).
 */

import type { DocumentData, DocumentSnapshot } from "firebase-admin/firestore";
import { COLLECTIONS, db, serverNow } from "../platform/firestore";
import { DomainError, conflict, invalidInput } from "../platform/errors";
import type { CommandActor } from "../platform/auth";
import { readReceipt, writeAudit, writeReceipt } from "../platform/commands";
import {
  CASE_KIND_LABEL,
  CLOSED_RISK_ALERT_STATUSES,
  INTAKE,
  OPEN_CASE_STATUSES,
  allowedEntityTransitions,
  type EntityStatusCommand,
  type GovernanceCaseKind,
  type GovernanceDecisionCommand,
  type IntakeCommand,
} from "./model";

export const ENTITY_COLLECTION = {
  organizer: COLLECTIONS.organizers,
  arena: COLLECTIONS.arenas,
  event: COLLECTIONS.events,
  "risk-alert": COLLECTIONS.riskAlerts,
} as const;

export const CASE_TARGET: Record<GovernanceCaseKind, { collection: string; approvedStatus: string }> = {
  "organizer-kyc": { collection: COLLECTIONS.organizers, approvedStatus: "active" },
  "arena-verification": { collection: COLLECTIONS.arenas, approvedStatus: "active" },
  "event-approval": { collection: COLLECTIONS.events, approvedStatus: "active" },
  "commission-proposal": { collection: COLLECTIONS.commercialAgreements, approvedStatus: "approved" },
  "fraud-alert": { collection: COLLECTIONS.riskAlerts, approvedStatus: "resolved" },
  "refund-exception": { collection: COLLECTIONS.refundCases, approvedStatus: "approved" },
  "settlement-release": { collection: COLLECTIONS.settlementControls, approvedStatus: "approved-for-release" },
};

export const COMMAND = {
  decideCase: "decideCase",
  setMarketplaceEntityStatus: "setMarketplaceEntityStatus",
  submitGovernanceIntake: "submitGovernanceIntake",
} as const;

function asVersion(value: unknown): number {
  return Number.isSafeInteger(value) ? Number(value) : 0;
}

const words = (value: string) => value.replace(/-/g, " ");

function subjectOf(snap: DocumentSnapshot<DocumentData>): string {
  const data = snap.data() ?? {};
  return String(data.subject ?? data.name ?? data.title ?? snap.id);
}

export interface DecisionResult {
  caseId: string;
  status: GovernanceDecisionCommand["outcome"];
  version: number;
  targetId: string;
  targetStatus: string;
  replayed: boolean;
}

export async function decideGovernanceCase(command: GovernanceDecisionCommand, actor: CommandActor): Promise<DecisionResult> {
  const firestore = db();
  return firestore.runTransaction(async (tx) => {
    /* ---- reads ---- */
    const prior = await readReceipt<DecisionResult>(tx, command.requestId, COMMAND.decideCase, actor.uid, (r) => r.caseId === command.caseId);
    if (prior) return { ...prior, replayed: true };

    const caseRef = firestore.collection(COLLECTIONS.governanceCases).doc(command.caseId);
    const caseSnap = await tx.get(caseRef);
    if (!caseSnap.exists) {
      throw new DomainError("CASE_NOT_FOUND", "This case no longer exists.", {
        nextStep: "Return to the queue and select another case.",
        detail: { caseId: command.caseId },
      });
    }
    const current = caseSnap.data()!;
    const currentVersion = asVersion(current.version);
    if (currentVersion !== command.expectedVersion) {
      throw conflict("Someone else changed this case. Reopen it to see the latest version.", { currentVersion });
    }
    const status = String(current.status ?? "pending");
    if (!OPEN_CASE_STATUSES.includes(status)) {
      throw conflict(`This case is already ${words(status)} and cannot be decided again.`, { status });
    }

    const kind = String(current.kind) as GovernanceCaseKind;
    const target = CASE_TARGET[kind];
    if (!target) throw invalidInput("This governance case type is not supported.");
    const targetId = typeof current.targetId === "string" ? current.targetId.trim() : "";
    if (!targetId) {
      throw new DomainError("TARGET_NOT_FOUND", "This case isn't linked to a marketplace record, so it can't be decided.", {
        nextStep: "Ask platform engineering to link the case to its record.",
        detail: { caseId: command.caseId },
      });
    }
    const targetRef = firestore.collection(target.collection).doc(targetId);
    const targetSnap = await tx.get(targetRef);
    if (!targetSnap.exists) {
      throw new DomainError("TARGET_NOT_FOUND", "The record this case is about no longer exists, so the decision was not saved.", {
        nextStep: "Ask platform engineering to check the case's linked record.",
        detail: { caseId: command.caseId, collection: target.collection, targetId },
      });
    }
    const targetData = targetSnap.data()!;

    if (kind === "settlement-release" && command.outcome === "approved") {
      const organizerName = String(targetData.organizerName ?? current.organizerName ?? "").trim();
      if (!organizerName) {
        throw new DomainError("SETTLEMENT_BLOCKED", "This settlement isn't linked to an organizer, so fraud checks can't confirm it is safe to release.", {
          nextStep: "Add the organizer to the settlement record, then decide again.",
          detail: { targetId },
        });
      }
      const alerts = await tx.get(firestore.collection(COLLECTIONS.riskAlerts).where("organizerName", "==", organizerName));
      const open = alerts.docs.filter((d) => !CLOSED_RISK_ALERT_STATUSES.includes(String(d.data().status ?? "pending")));
      if (open.length) {
        throw new DomainError("SETTLEMENT_BLOCKED", `${organizerName} has an open fraud alert, so this settlement can't be released.`, {
          nextStep: "Resolve the fraud alert first, or request more information on this case.",
          detail: { alertIds: open.map((d) => d.id) },
        });
      }
    }

    /* ---- writes ---- */
    const now = serverNow();
    const nextVersion = currentVersion + 1;
    const targetStatus = command.outcome === "approved" ? target.approvedStatus : command.outcome;
    tx.update(caseRef, {
      status: command.outcome,
      decision: {
        outcome: command.outcome,
        note: command.note,
        actorUid: actor.uid,
        actorName: actor.displayName,
        actorRoleId: actor.roleId,
        decidedAt: now,
      },
      version: nextVersion,
      updatedAt: now,
      updatedBy: actor.uid,
    });
    tx.update(targetRef, {
      status: targetStatus,
      statusReason: command.note || "Approved through the decision queue",
      version: asVersion(targetData.version) + 1,
      updatedAt: now,
      updatedBy: actor.uid,
    });

    const verb = command.outcome === "approved" ? "approved" : command.outcome === "rejected" ? "rejected" : "sent back for information";
    writeAudit(tx, actor, {
      action: "governance.case-decided",
      subject: `${CASE_KIND_LABEL[kind] ?? "Case"} ${verb} — ${subjectOf(caseSnap)}`,
      summary: command.note || "Approved",
      entityType: "governanceCase",
      entityId: command.caseId,
      before: { status },
      after: { status: command.outcome },
      requestId: command.requestId,
      context: {
        targetCollection: target.collection,
        targetId,
        targetBefore: { status: targetData.status ?? null },
        targetAfter: { status: targetStatus },
        policyVersion: current.policyVersion ?? null,
      },
    }, now);

    const result: DecisionResult = { caseId: command.caseId, status: command.outcome, version: nextVersion, targetId, targetStatus, replayed: false };
    writeReceipt(tx, command.requestId, COMMAND.decideCase, actor.uid, result, now);
    return result;
  });
}

export interface EntityStatusResult {
  entityType: EntityStatusCommand["entityType"];
  entityId: string;
  status: EntityStatusCommand["status"];
  version: number;
  replayed: boolean;
}

export async function changeMarketplaceEntityStatus(command: EntityStatusCommand, actor: CommandActor): Promise<EntityStatusResult> {
  const firestore = db();
  return firestore.runTransaction(async (tx) => {
    const prior = await readReceipt<EntityStatusResult>(
      tx, command.requestId, COMMAND.setMarketplaceEntityStatus, actor.uid,
      (r) => r.entityType === command.entityType && r.entityId === command.entityId
    );
    if (prior) return { ...prior, replayed: true };

    const ref = firestore.collection(ENTITY_COLLECTION[command.entityType]).doc(command.entityId);
    const snap = await tx.get(ref);
    if (!snap.exists) {
      throw new DomainError("RECORD_NOT_FOUND", "This record no longer exists.", {
        nextStep: "Refresh the list and select another record.",
        detail: { entityType: command.entityType, entityId: command.entityId },
      });
    }
    const data = snap.data()!;
    const currentVersion = asVersion(data.version);
    if (currentVersion !== command.expectedVersion) {
      throw conflict("Someone else changed this record. Reopen it to see the latest version.", { currentVersion });
    }
    const current = String(data.status ?? "pending");
    if (current === command.status) {
      throw new DomainError("INVALID_TRANSITION", `This record is already ${words(current)}.`, { detail: { current } });
    }
    if (!allowedEntityTransitions(command.entityType, current).includes(command.status)) {
      throw new DomainError(
        "INVALID_TRANSITION",
        `A ${command.entityType.replace("-", " ")} that is ${words(current)} cannot be set to ${words(command.status)}.`,
        {
          nextStep: "Choose one of the statuses offered for this record.",
          detail: { current, requested: command.status, allowed: allowedEntityTransitions(command.entityType, current) },
        }
      );
    }

    const nextVersion = currentVersion + 1;
    const now = serverNow();
    tx.update(ref, { status: command.status, statusReason: command.reason, version: nextVersion, updatedAt: now, updatedBy: actor.uid });
    writeAudit(tx, actor, {
      action: "governance.entity-status-changed",
      subject: `${subjectOf(snap)} → ${words(command.status)}`,
      summary: command.reason,
      entityType: command.entityType,
      entityId: command.entityId,
      before: { status: current },
      after: { status: command.status },
      requestId: command.requestId,
    }, now);
    const result: EntityStatusResult = { entityType: command.entityType, entityId: command.entityId, status: command.status, version: nextVersion, replayed: false };
    writeReceipt(tx, command.requestId, COMMAND.setMarketplaceEntityStatus, actor.uid, result, now);
    return result;
  });
}

export interface IntakeResult {
  id: string;
  collection: string;
  caseId: string | null;
  kind: IntakeCommand["kind"];
  name: string;
  replayed: boolean;
}

/** Records an incoming application / submission and opens its review case. */
export async function submitGovernanceIntake(command: IntakeCommand, actor: CommandActor): Promise<IntakeResult> {
  const firestore = db();
  const spec = INTAKE[command.kind];
  const entityRef = firestore.collection(spec.collection).doc(`${spec.prefix}-${firestore.collection(spec.collection).doc().id}`);
  const caseRef = spec.caseKind
    ? firestore.collection(COLLECTIONS.governanceCases).doc(`case-${firestore.collection(COLLECTIONS.governanceCases).doc().id}`)
    : null;

  return firestore.runTransaction(async (tx) => {
    const prior = await readReceipt<IntakeResult>(
      tx, command.requestId, COMMAND.submitGovernanceIntake, actor.uid,
      (r) => r.kind === command.kind && r.name === command.name
    );
    if (prior) return { ...prior, replayed: true };

    const now = serverNow();
    const nowIso = now.toDate().toISOString();
    const summary = command.summary || (command.kind === "policy" ? "Policy version" : "Submitted for review");
    const data: Record<string, unknown> = {
      name: command.name,
      status: command.kind === "policy" ? "published" : command.kind === "commission" ? "pending" : "under-review",
      summary,
      submittedBy: actor.displayName,
      submittedByUid: actor.uid,
    };
    if (command.location) data.location = command.location;
    if (command.organizerName) data.organizerName = command.organizerName;
    if (command.contactEmail) data.contactEmail = command.contactEmail;
    if (command.capacity) data.displayValue = `${command.capacity.toLocaleString("en-IN")} capacity`;
    if (command.projectedGmv) {
      data.projectedGmvMinor = Math.round(command.projectedGmv * 100);
      data.currency = "INR";
    }
    if (command.commissionPercent !== undefined) data.commissionBps = Math.round(command.commissionPercent * 100);
    if (command.effectiveFrom) data.effectiveFrom = command.effectiveFrom;

    tx.create(entityRef, { ...data, version: 0, createdAt: now, updatedAt: now, createdBy: actor.uid, updatedBy: actor.uid });

    if (caseRef && spec.caseKind) {
      tx.create(caseRef, {
        subject: command.name,
        kind: spec.caseKind,
        targetId: entityRef.id,
        status: "pending",
        location: command.location ?? "",
        summary,
        policyVersion: spec.policy,
        risk: command.risk ?? "medium",
        submittedAt: nowIso,
        ...(data.displayValue ? { displayValue: data.displayValue } : {}),
        ...(data.projectedGmvMinor ? { projectedGmvMinor: data.projectedGmvMinor, currency: "INR" } : {}),
        ...(command.commissionPercent !== undefined ? { displayValue: `${command.commissionPercent}% proposed` } : {}),
        version: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: actor.uid,
        updatedBy: actor.uid,
      });
    }

    writeAudit(tx, actor, {
      action: "governance.intake-recorded",
      subject: `${spec.caseKind ? CASE_KIND_LABEL[spec.caseKind] : "Policy"} recorded — ${command.name}`,
      summary,
      entityType: command.kind,
      entityId: entityRef.id,
      after: { status: data.status },
      requestId: command.requestId,
      context: { caseId: caseRef?.id ?? null, collection: spec.collection },
    }, now);

    const result: IntakeResult = {
      id: entityRef.id,
      collection: spec.collection,
      caseId: caseRef?.id ?? null,
      kind: command.kind,
      name: command.name,
      replayed: false,
    };
    writeReceipt(tx, command.requestId, COMMAND.submitGovernanceIntake, actor.uid, result, now);
    return result;
  });
}
