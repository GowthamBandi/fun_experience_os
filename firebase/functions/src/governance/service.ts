import { missingKycDocuments } from "../identity/kycDocuments";
import { FieldValue, type DocumentSnapshot, type Firestore, type Transaction } from "firebase-admin/firestore";
import { COLLECTIONS, auditRef, db, receiptRef, serverNow } from "../platform/firestore";
import { DomainError, invalidInput } from "../platform/errors";
import { notify } from "../platform/notify";
import type { VerifiedActor } from "../platform/auth";
import type {
  EntityStatusCommand,
  GovernanceDecisionCommand,
  GovernanceCaseKind,
  GovernanceOutcome,
  ReissueOrganizerCodeCommand,
} from "./model";
import { newOrganizerCode, publicOrganizerDoc, slugify } from "./organizerOnboarding";

const ENTITY_COLLECTION = {
  organizer: COLLECTIONS.organizers,
  arena: COLLECTIONS.arenas,
  event: COLLECTIONS.events,
  "risk-alert": COLLECTIONS.riskAlerts,
} as const;

interface CaseTarget {
  collection: string;
  approved: string;
  /** Target status per non-approval outcome; defaults to the outcome itself. */
  rejected?: string;
  informationRequested?: string;
}

const CASE_TARGET: Record<GovernanceCaseKind, CaseTarget> = {
  // Legacy cases (seeded before ADR-0004) target organizers/{id} directly.
  // Cases created by submitOrganizerApplication carry
  // targetCollection: "organizerApplications" and take the onboarding path.
  "organizer-kyc": { collection: COLLECTIONS.organizers, approved: "active" },
  "arena-verification": { collection: COLLECTIONS.arenas, approved: "active" },
  // ADR-0003: approval makes the item eligible; publishing is the organizer's act.
  "experience-approval": { collection: COLLECTIONS.experiences, approved: "approved", rejected: "rejected", informationRequested: "changes-requested" },
  "event-approval": { collection: COLLECTIONS.events, approved: "approved", rejected: "rejected", informationRequested: "changes-requested" },
  "commission-proposal": { collection: COLLECTIONS.commercialAgreements, approved: "approved" },
  "fraud-alert": { collection: COLLECTIONS.riskAlerts, approved: "resolved" },
  "refund-exception": { collection: COLLECTIONS.refundCases, approved: "approved" },
  "settlement-release": { collection: COLLECTIONS.settlementControls, approved: "approved-for-release" },
};

function targetStatus(target: CaseTarget, outcome: GovernanceOutcome): string {
  if (outcome === "approved") return target.approved;
  if (outcome === "rejected") return target.rejected ?? outcome;
  return target.informationRequested ?? outcome;
}

const APPLICATION_STATUS: Record<GovernanceOutcome, string> = {
  approved: "approved",
  rejected: "rejected",
  "information-requested": "changes-requested",
};

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
  transaction.create(auditRef(), { ...payload, source: "operations-console", at: serverNow(), schemaVersion: 1 });
}

/** Removes plaintext access codes before anything is persisted. */
function receiptSafe(result: Record<string, unknown>): Record<string, unknown> {
  if (!("organizerCode" in result)) return result;
  const { organizerCode: _drop, ...rest } = result;
  void _drop;
  return { ...rest, codeAlreadyIssued: true };
}

const iso = (t: { toDate(): Date } | null | undefined) => (t ? t.toDate().toISOString() : null);

/**
 * Organizer onboarding on approval of an `organizer-kyc` case that targets
 * `organizerApplications/{uid}` (ADR-0004). Returns the one-time code.
 */
function onboardApprovedOrganizer(
  transaction: Transaction,
  firestore: Firestore,
  ctx: { caseId: string; applicantUid: string; application: DocumentSnapshot; actor: VerifiedActor; nextVersion: number }
) {
  const app = ctx.application.data()!;
  const now = serverNow();
  const orgRef = firestore.collection(COLLECTIONS.organizers).doc();
  const orgId = orgRef.id;
  const name = String(app.displayName ?? "");
  const handle = `${slugify(name)}-${orgId.slice(0, 4).toLowerCase()}`;
  const categories = Array.isArray(app.categories) ? app.categories.map(String) : [];
  const city = String(app.city ?? "");
  const about = String(app.about ?? "");

  transaction.create(orgRef, {
    orgId,
    ownerUid: ctx.applicantUid,
    name,
    subject: name,
    handle,
    legalName: app.legalName ?? null,
    kind: app.kind ?? null,
    city,
    location: city,
    categories,
    about,
    contactEmail: app.contactEmail ?? null,
    applicationId: ctx.applicantUid,
    caseId: ctx.caseId,
    status: "active",
    version: 0,
    createdAt: now,
    updatedAt: now,
    createdBy: ctx.actor.uid,
  });
  transaction.set(
    firestore.collection("publicOrganizers").doc(orgId),
    publicOrganizerDoc({ orgId, name, handle, city, categories, about, hostingSince: now, legalName: app.legalName ?? null, kind: app.kind ?? null })
  );
  const { code, codeHash, expiresAt } = newOrganizerCode();
  transaction.set(firestore.collection(COLLECTIONS.organizerActivations).doc(ctx.applicantUid), {
    uid: ctx.applicantUid,
    orgId,
    codeHash,
    status: "issued",
    attempts: 0,
    expiresAt,
    issuedAt: now,
    issuedBy: ctx.actor.uid,
    version: 0,
  });
  return { orgId, organizerCode: code, codeExpiresAt: iso(expiresAt) };
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
    const onboarding = kind === "organizer-kyc" && current.targetCollection === COLLECTIONS.organizerApplications;
    const collection = onboarding ? COLLECTIONS.organizerApplications : target.collection;
    const targetRef = targetId ? firestore.collection(collection).doc(targetId) : null;
    const targetSnap = targetRef ? await transaction.get(targetRef) : null;
    const now = serverNow();
    const nextVersion = currentVersion + 1;

    let extra: Record<string, unknown> = {};
    if (onboarding) {
      if (!targetRef || !targetSnap?.exists) {
        throw new DomainError("PRECONDITION", "The organizer application for this case is missing.", { nextStep: "Escalate to platform engineering." });
      }
      if (targetSnap.data()?.orgId) throw conflict("This applicant already has an organizer.");
      if (command.outcome === "approved") {
        const missing = await missingKycDocuments(transaction, targetId, String(targetSnap.data()?.kind ?? "individual"));
        if (missing.length) {
          throw new DomainError("PRECONDITION", `Verification documents missing: ${missing.join(", ")}.`, {
            nextStep: "Request changes so the applicant uploads them, then approve.",
            detail: { missing },
          });
        }
      }
    }

    const decision = { outcome: command.outcome, note: command.note, actorUid: actor.uid, actorRoleId: actor.roleId, decidedAt: now };
    transaction.update(caseRef, { status: command.outcome, decision, version: nextVersion, updatedAt: now, updatedBy: actor.uid });

    if (onboarding && targetRef) {
      const applicantUid = targetId;
      if (command.outcome === "approved") {
        extra = onboardApprovedOrganizer(transaction, firestore, { caseId: command.caseId, applicantUid, application: targetSnap!, actor, nextVersion });
      }
      transaction.update(targetRef, {
        status: APPLICATION_STATUS[command.outcome],
        decisionNote: command.note || null,
        decidedAt: now,
        activationPending: command.outcome === "approved",
        ...(extra.orgId ? { orgId: extra.orgId } : {}),
        version: FieldValue.increment(1),
        updatedAt: now,
      });
      const name = String(targetSnap!.data()?.displayName ?? "your organizer profile");
      const messages = {
        approved: { kind: "organizer-approved", title: "You're approved to host on PULSE", body: `${name} is approved. Enter the Organizer Code you receive from PULSE to activate hosting.` },
        rejected: { kind: "organizer-rejected", title: "Organizer application not approved", body: command.note },
        "information-requested": { kind: "organizer-changes-requested", title: "Your organizer application needs changes", body: command.note },
      } as const;
      const m = messages[command.outcome];
      notify(transaction, {
        recipientUid: applicantUid,
        kind: m.kind,
        title: m.title,
        body: m.body,
        dedupeKey: `${command.caseId}:v${nextVersion}`,
        link: { type: "application", id: applicantUid },
      });
    } else if (targetId && targetRef && targetSnap?.exists) {
      transaction.update(targetRef, { status: targetStatus(target, command.outcome), version: FieldValue.increment(1), updatedAt: now, updatedBy: actor.uid });
      if (kind === "experience-approval" || kind === "event-approval") {
        const t = targetSnap.data()!;
        const recipient = [t.submittedBy, t.createdBy].find((v) => typeof v === "string" && v.length > 0) as string | undefined;
        if (recipient) {
          const label = kind === "event-approval" ? "event" : "experience";
          notify(transaction, {
            recipientUid: recipient,
            kind: kind === "event-approval" ? "event-decision" : "experience-decision",
            title: `Your ${label} was ${command.outcome === "approved" ? "approved" : command.outcome === "rejected" ? "not approved" : "sent back for changes"}`,
            body: command.note || `“${String(t.title ?? t.name ?? label)}” passed review.`,
            dedupeKey: `${command.caseId}:v${nextVersion}`,
            link: { type: kind === "event-approval" ? ("event" as const) : ("experience" as const), id: targetId },
          });
        }
      }
    }

    const result: Record<string, unknown> = { caseId: command.caseId, status: command.outcome, version: nextVersion, replayed: false, ...extra };
    audit(transaction, {
      action: "governance.case-decided", actorUid: actor.uid, actorRoleId: actor.roleId,
      resourceType: "governanceCase", resourceId: command.caseId, targetId: targetId || null,
      before: { status: current.status, version: currentVersion },
      after: { status: command.outcome, version: nextVersion, ...(extra.orgId ? { orgId: extra.orgId, codeExpiresAt: extra.codeExpiresAt } : {}) },
      reason: command.note || "Approval checks completed.", policyVersion: current.policyVersion ?? null,
    });
    transaction.create(receiptRef(command.requestId), { action: "governance.case-decided", actorUid: actor.uid, result: receiptSafe(result), createdAt: now });
    return result;
  });
}

/**
 * Issues a new Organizer Code for an approved applicant whose code was lost,
 * expired or locked. The previous hash is overwritten, so the old code dies.
 */
export async function reissueOrganizerActivationCode(command: ReissueOrganizerCodeCommand, actor: VerifiedActor) {
  const firestore = db();
  return firestore.runTransaction(async (transaction) => {
    const prior = await replay(transaction, firestore, command.requestId, "governance.organizer-code-reissued", actor);
    if (prior) return { ...prior, replayed: true };
    const ref = firestore.collection(COLLECTIONS.organizerActivations).doc(command.applicantUid);
    const snap = await transaction.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "There's no approved organizer activation for this person.", { nextStep: "Approve their organizer application first." });
    const act = snap.data()!;
    if (act.status === "redeemed") throw conflict("This organizer has already activated their account.");
    const orgSnap = await transaction.get(firestore.collection(COLLECTIONS.organizers).doc(String(act.orgId)));
    if (!orgSnap.exists || orgSnap.data()?.status === "blocked") {
      throw new DomainError("PRECONDITION", "This organizer is blocked or missing.", { nextStep: "Review the organizer's status first." });
    }
    const now = serverNow();
    const { code, codeHash, expiresAt } = newOrganizerCode();
    const version = asVersion(act.version) + 1;
    transaction.update(ref, { codeHash, expiresAt, status: "issued", attempts: 0, reissuedAt: now, reissuedBy: actor.uid, version });
    transaction.set(firestore.collection(COLLECTIONS.organizerApplications).doc(command.applicantUid), { activationPending: true, updatedAt: now }, { merge: true });
    const result = { applicantUid: command.applicantUid, orgId: String(act.orgId), organizerCode: code, codeExpiresAt: iso(expiresAt), replayed: false };
    audit(transaction, {
      action: "governance.organizer-code-reissued", actorUid: actor.uid, actorRoleId: actor.roleId,
      resourceType: "organizerActivation", resourceId: command.applicantUid, orgId: String(act.orgId),
      before: { status: act.status, version: asVersion(act.version) }, after: { status: "issued", version, codeExpiresAt: iso(expiresAt) },
      reason: command.reason ?? "Organizer code re-issued.",
    });
    transaction.create(receiptRef(command.requestId), { action: "governance.organizer-code-reissued", actorUid: actor.uid, result: receiptSafe(result), createdAt: now });
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
    // Organizations (contract §3): the team is told, and the public projection shows the status.
    const orgMessage = command.messageToOrganizer ?? null;
    const orgStatus = command.entityType === "organizer" && ["active", "paused", "blocked"].includes(command.status);
    const publicRef = firestore.collection("publicOrganizers").doc(command.entityId);
    const [publicSnap, members] = orgStatus
      ? await Promise.all([transaction.get(publicRef), transaction.get(firestore.collection(COLLECTIONS.memberships).where("orgId", "==", command.entityId))])
      : [null, null];
    transaction.update(ref, {
      status: command.status, statusReason: command.reason, version: nextVersion, updatedAt: now, updatedBy: actor.uid,
      ...(orgStatus ? { statusMessage: orgMessage } : {}),
    });
    if (orgStatus) {
      if (publicSnap?.exists) transaction.update(publicRef, { status: command.status, statusMessage: orgMessage, updatedAt: now });
      const name = String(current.name ?? current.displayName ?? "Your organization");
      const copy = {
        paused: { title: `${name} is paused by PULSE`, body: "New listings and dates can't be submitted while it's paused." },
        blocked: { title: `${name} is blocked by PULSE`, body: "Hosting is blocked. Contact PULSE support for details." },
        active: { title: `${name} is active again`, body: "You can host and submit new listings again." },
      }[command.status as "active" | "paused" | "blocked"];
      const changed = current.status !== command.status || !!orgMessage;
      for (const m of changed ? members!.docs : []) {
        if (m.get("status") !== "active" || typeof m.get("uid") !== "string") continue;
        notify(transaction, {
          recipientUid: m.get("uid") as string,
          kind: "organization-status",
          title: copy.title,
          body: orgMessage ?? copy.body,
          dedupeKey: `${command.entityId}:v${nextVersion}`,
          link: { type: "organizer", id: command.entityId },
        });
      }
    }
    const result = { entityType: command.entityType, entityId: command.entityId, status: command.status, version: nextVersion, replayed: false };
    audit(transaction, {
      action: "governance.entity-status-changed", actorUid: actor.uid, actorRoleId: actor.roleId,
      resourceType: command.entityType, resourceId: command.entityId,
      before: { status: current.status, version: currentVersion },
      after: { status: command.status, version: nextVersion, ...(orgStatus ? { messageToOrganizer: orgMessage } : {}) },
      reason: command.reason,
    });
    transaction.create(receiptRef(command.requestId), { action: "governance.entity-status-changed", actorUid: actor.uid, result, createdAt: now });
    return result;
  });
}
