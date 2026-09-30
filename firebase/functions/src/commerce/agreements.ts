/**
 * Commercial agreements (ADR-0005 "Ledger → Commission").
 *
 * An organizer can publish only with an approved agreement; its
 * `commissionBps` is copied onto each event at publish time, so a later
 * agreement never rewrites history.
 *
 *   proposeCommercialAgreement  admin proposes a new version (pending-approval)
 *   decideCommercialAgreement   a DIFFERENT admin approves or rejects it
 *
 * Approving supersedes the organizer's previously approved version in the same
 * transaction, so at most one agreement per organizer is ever `approved`.
 */

import { db, serverNow } from "../platform/firestore";
import { DomainError, notFound, precondition } from "../platform/errors";
import { writeAudit } from "../platform/audit";
import { C } from "./config";

export const PAYOUT_CADENCES = ["weekly", "fortnightly", "monthly"] as const;
export type PayoutCadence = (typeof PAYOUT_CADENCES)[number];
export type AgreementStatus = "pending-approval" | "approved" | "rejected" | "superseded";

/** Commission is capped at 50%; anything higher is almost certainly a typo. */
export const MAX_COMMISSION_BPS = 5_000;

interface Admin { uid: string; roleId: string }

export async function proposeCommercialAgreement(
  admin: Admin,
  input: { requestId: string; orgId: string; commissionBps: number; payoutCadence: PayoutCadence; note: string }
): Promise<{ agreementId: string; status: AgreementStatus }> {
  if (!Number.isSafeInteger(input.commissionBps) || input.commissionBps < 0 || input.commissionBps > MAX_COMMISSION_BPS) {
    throw new DomainError("INVALID_INPUT", "Commission must be between 0% and 50%.");
  }
  const receipt = db().collection(C.commandReceipts).doc(`proposeAgreement_${admin.uid}_${input.requestId}`);
  const orgRef = db().collection("organizers").doc(input.orgId);
  return db().runTransaction(async (tx) => {
    const r = await tx.get(receipt);
    if (r.exists) return (r.data() as { result: { agreementId: string; status: AgreementStatus } }).result;
    const org = await tx.get(orgRef);
    if (!org.exists) throw notFound("We couldn't find that organizer.");
    const ref = db().collection(C.commercialAgreements).doc();
    const now = serverNow();
    tx.set(ref, {
      orgId: input.orgId,
      status: "pending-approval",
      commissionBps: input.commissionBps,
      payoutCadence: input.payoutCadence,
      note: input.note,
      proposedBy: admin.uid,
      proposedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    writeAudit(tx, {
      action: "commercial-agreement.proposed",
      actorUid: admin.uid,
      actorRole: `platform:${admin.roleId}`,
      resourceType: "commercialAgreement",
      resourceId: ref.id,
      orgId: input.orgId,
      after: { status: "pending-approval", commissionBps: input.commissionBps, payoutCadence: input.payoutCadence },
      reason: input.note,
      requestId: input.requestId,
    });
    const result = { agreementId: ref.id, status: "pending-approval" as AgreementStatus };
    tx.set(receipt, { action: "proposeCommercialAgreement", actorUid: admin.uid, result, createdAt: now });
    return result;
  });
}

export async function decideCommercialAgreement(
  admin: Admin,
  input: { requestId: string; agreementId: string; action: "approve" | "reject"; note: string }
): Promise<{ agreementId: string; status: AgreementStatus; supersededId: string | null }> {
  const ref = db().collection(C.commercialAgreements).doc(input.agreementId);
  const receipt = db().collection(C.commandReceipts).doc(`decideAgreement_${admin.uid}_${input.requestId}`);
  return db().runTransaction(async (tx) => {
    const r = await tx.get(receipt);
    if (r.exists) return (r.data() as { result: { agreementId: string; status: AgreementStatus; supersededId: string | null } }).result;
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFound("We couldn't find that agreement.");
    const a = snap.data() as { orgId: string; status: AgreementStatus; proposedBy: string; commissionBps: number };
    if (a.status !== "pending-approval") throw precondition("Only an agreement pending approval can be decided.", undefined, { status: a.status });
    if (a.proposedBy === admin.uid) {
      throw new DomainError("NOT_PERMITTED", "A different admin must decide this agreement.", {
        nextStep: "Commercial terms always need two different admins.",
      });
    }
    const current = input.action === "approve"
      ? await tx.get(db().collection(C.commercialAgreements).where("orgId", "==", a.orgId).where("status", "==", "approved"))
      : null;
    const now = serverNow();
    const status: AgreementStatus = input.action === "approve" ? "approved" : "rejected";
    let supersededId: string | null = null;
    for (const doc of current?.docs ?? []) {
      supersededId = doc.id;
      tx.update(doc.ref, { status: "superseded", supersededBy: ref.id, supersededAt: now, updatedAt: now });
    }
    tx.update(ref, { status, decidedBy: admin.uid, decidedAt: now, decisionNote: input.note, updatedAt: now });
    writeAudit(tx, {
      action: `commercial-agreement.${input.action === "approve" ? "approved" : "rejected"}`,
      actorUid: admin.uid,
      actorRole: `platform:${admin.roleId}`,
      resourceType: "commercialAgreement",
      resourceId: ref.id,
      orgId: a.orgId,
      before: { status: a.status },
      after: { status, commissionBps: a.commissionBps, supersededId },
      reason: input.note,
      requestId: input.requestId,
    });
    const result = { agreementId: ref.id, status, supersededId };
    tx.set(receipt, { action: "decideCommercialAgreement", actorUid: admin.uid, result, createdAt: now });
    return result;
  });
}
