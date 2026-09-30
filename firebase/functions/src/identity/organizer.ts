import { FieldValue } from "firebase-admin/firestore";
import { PERMISSIONS, type Membership } from "../access/permissions";
import { writeAudit } from "../platform/audit";
import { COLLECTIONS, db, membershipId, serverNow } from "../platform/firestore";
import { DomainError } from "../platform/errors";
import { consumeRateLimit, resetRateLimit } from "../platform/rateLimit";
import { hashCode, safeEqual } from "../platform/security";
import {
  KYC_POLICY_VERSION,
  ORGANIZER_CODE_LENGTH,
  organizerCaseId,
  publicOrganizerDoc,
} from "../governance/organizerOnboarding";
import {
  CODE_POLICY,
  codeBucket,
  codeFailureAudit,
  codeRefused,
  consumeCodeAttempt,
  auditCodeFailure,
  readReceipt,
  writeReceipt,
  type CodeFailureReason,
  type PhoneActor,
} from "./common";
import type { OrganizerApplicationCommand } from "./model";

const SUBMIT_ACTION = "identity.organizer-application-submitted";

/**
 * Creates (or, after `changes-requested`, resubmits) the caller's organizer
 * application and its `organizer-kyc` governance case. One application per
 * person, keyed by uid; the case id is derived from the uid so a resubmission
 * always reopens the same case.
 */
export async function submitOrganizerApplication(command: OrganizerApplicationCommand, actor: PhoneActor) {
  await consumeRateLimit({
    bucket: `organizer-application-${actor.uid}`,
    limit: 5,
    windowSeconds: 24 * 60 * 60,
    message: "You've submitted too many times today. Please try again tomorrow.",
  });
  const firestore = db();
  const appRef = firestore.collection(COLLECTIONS.organizerApplications).doc(actor.uid);
  const caseId = organizerCaseId(actor.uid);
  const caseRef = firestore.collection(COLLECTIONS.governanceCases).doc(caseId);

  return firestore.runTransaction(async (tx) => {
    const prior = await readReceipt(tx, actor.uid, command.requestId, SUBMIT_ACTION);
    if (prior) return { ...prior, replayed: true };
    const [appSnap, caseSnap] = await Promise.all([tx.get(appRef), tx.get(caseRef)]);
    const now = serverNow();
    const existing = appSnap.data();
    const status = existing?.status as string | undefined;

    if (status === "approved") {
      throw new DomainError("CONFLICT", "Your organizer application is already approved.", {
        nextStep: "Enter your Organizer Code, or ask PULSE support for a new one.",
      });
    }
    if (status === "rejected") {
      throw new DomainError("PRECONDITION", "Your organizer application was not approved.", {
        nextStep: "Contact PULSE support if your circumstances have changed.",
      });
    }
    if (status === "submitted" || status === "under-review") {
      throw new DomainError("CONFLICT", "Your application is already being reviewed.", {
        nextStep: "We'll notify you when there's a decision.",
      });
    }

    const fields = {
      uid: actor.uid,
      phone: actor.phone,
      kind: command.kind,
      displayName: command.displayName,
      legalName: command.legalName,
      city: command.city,
      categories: command.categories,
      about: command.about,
      contactEmail: command.contactEmail,
      status: "submitted",
      caseId,
      activationPending: false,
      submittedAt: now,
      updatedAt: now,
    };
    const caseFields = {
      subject: command.displayName,
      kind: "organizer-kyc",
      targetId: actor.uid,
      targetCollection: COLLECTIONS.organizerApplications,
      applicantUid: actor.uid,
      status: "pending",
      policyVersion: KYC_POLICY_VERSION,
      risk: command.kind === "business" && command.contactEmail ? "low" : "medium",
      location: command.city,
      summary: `${command.kind === "business" ? "Business" : "Individual"} organizer · ${command.categories.join(", ")}`,
      updatedAt: now,
    };

    let resubmitted = false;
    if (status === "changes-requested" && caseSnap.exists) {
      resubmitted = true;
      const c = caseSnap.data()!;
      const version = Number.isSafeInteger(c.version) ? Number(c.version) : 0;
      tx.set(appRef, { ...fields, resubmissions: FieldValue.increment(1), version: FieldValue.increment(1) }, { merge: true });
      tx.update(caseRef, {
        ...caseFields,
        previousDecision: c.decision ?? null,
        decision: FieldValue.delete(),
        version: version + 1,
        updatedBy: actor.uid,
      });
    } else {
      // No application yet (or a draft): a brand-new case. `create` fails if
      // a case already exists for this uid, which would indicate tampering.
      if (caseSnap.exists) {
        throw new DomainError("CONFLICT", "Your application is already being reviewed.");
      }
      tx.set(appRef, { ...fields, createdAt: existing?.createdAt ?? now, resubmissions: 0, version: 0 });
      tx.create(caseRef, { ...caseFields, version: 0, createdAt: now, createdBy: actor.uid });
    }

    const result = { applicationId: actor.uid, caseId, status: "submitted", resubmitted, replayed: false };
    writeAudit(tx, {
      action: resubmitted ? "organizer.application-resubmitted" : "organizer.application-submitted",
      actorUid: actor.uid,
      actorRole: "customer",
      resourceType: "organizerApplication",
      resourceId: actor.uid,
      before: status ? { status } : null,
      after: { status: "submitted", caseId, kind: command.kind, city: command.city },
      requestId: command.requestId,
      source: "pulse-app",
    });
    writeReceipt(tx, actor.uid, command.requestId, SUBMIT_ACTION, result);
    return result;
  });
}

type RedeemOutcome = { ok: true; orgId: string } | { ok: false; reason: CodeFailureReason; orgId?: string };

/**
 * Burns the caller's organizer code and makes them the owner of the approved
 * organizer. The activation is keyed by the applicant's uid, so a code typed
 * by anyone else never matches anything.
 */
export async function redeemOrganizerCode(command: { code: string }, actor: PhoneActor) {
  await consumeCodeAttempt(actor, "organizer");
  if (command.code.length !== ORGANIZER_CODE_LENGTH) {
    await auditCodeFailure(actor, "organizer", "bad-format");
    throw codeRefused("bad-format");
  }
  const attemptedHash = hashCode("organizer", command.code);
  const firestore = db();
  const actRef = firestore.collection(COLLECTIONS.organizerActivations).doc(actor.uid);
  const appRef = firestore.collection(COLLECTIONS.organizerApplications).doc(actor.uid);

  const outcome = await firestore.runTransaction<RedeemOutcome>(async (tx) => {
    const actSnap = await tx.get(actRef);
    const fail = (reason: CodeFailureReason, orgId?: string): RedeemOutcome => {
      codeFailureAudit(tx, actor, "organizer", reason, { orgId: orgId ?? null });
      return { ok: false, reason, orgId };
    };
    if (!actSnap.exists) return fail("no-activation");
    const act = actSnap.data()!;
    const orgId = String(act.orgId ?? "");
    // The retention sweep marks lapsed codes `expired` (hash removed); the
    // owner of this activation still deserves the accurate reason.
    if (act.status === "expired") return fail("expired", orgId);
    if (act.status !== "issued" || typeof act.codeHash !== "string") return fail("not-issued", orgId);
    const attempts = Number(act.attempts ?? 0);
    if (attempts >= CODE_POLICY.maxAttemptsPerCode) return fail("locked", orgId);
    if (!safeEqual(act.codeHash, attemptedHash)) {
      tx.update(actRef, { attempts: attempts + 1, lastFailedAt: serverNow() });
      return fail("mismatch", orgId);
    }
    if ((act.expiresAt?.toMillis?.() ?? 0) <= serverNow().toMillis()) return fail("expired", orgId);

    const orgRef = firestore.collection(COLLECTIONS.organizers).doc(orgId);
    const memberRef = firestore.collection(COLLECTIONS.memberships).doc(membershipId(orgId, actor.uid));
    const pubRef = firestore.collection("publicOrganizers").doc(orgId);
    const [orgSnap, memberSnap, pubSnap] = await Promise.all([tx.get(orgRef), tx.get(memberRef), tx.get(pubRef)]);
    const org = orgSnap.data();
    if (!org || org.ownerUid !== actor.uid || org.status === "blocked") return fail("organizer-unavailable", orgId);

    const now = serverNow();
    const prior = memberSnap.data() as Membership | undefined;
    const membership: Membership & Record<string, unknown> = {
      orgId,
      uid: actor.uid,
      role: "owner",
      status: "active",
      permissions: [...PERMISSIONS],
      eventScope: { all: true, eventIds: [] },
      title: "Owner",
      version: prior ? Number(prior.version ?? 0) + 1 : 0,
      activatedAt: now,
      updatedAt: now,
      createdAt: (prior as Record<string, unknown> | undefined)?.createdAt ?? now,
    };
    tx.set(memberRef, membership);
    if (!pubSnap.exists) {
      tx.set(
        pubRef,
        publicOrganizerDoc({
          orgId,
          name: String(org.name ?? ""),
          handle: String(org.handle ?? ""),
          city: String(org.city ?? ""),
          categories: Array.isArray(org.categories) ? org.categories : [],
          about: String(org.about ?? ""),
          hostingSince: org.createdAt ?? now,
        })
      );
    }
    // Burn: the hash is removed so the code can never match again.
    tx.update(actRef, {
      status: "redeemed",
      codeHash: FieldValue.delete(),
      redeemedAt: now,
      version: FieldValue.increment(1),
    });
    tx.set(appRef, { activationPending: false, orgId, activatedAt: now, updatedAt: now }, { merge: true });
    writeAudit(tx, {
      action: "organizer.activated",
      actorUid: actor.uid,
      actorRole: `org:${orgId}:owner`,
      resourceType: "membership",
      resourceId: membershipId(orgId, actor.uid),
      orgId,
      before: prior ? { status: prior.status, role: prior.role } : null,
      after: { status: "active", role: "owner" },
      source: "pulse-app",
    });
    return { ok: true, orgId };
  });

  if (!outcome.ok) throw codeRefused(outcome.reason);
  await resetRateLimit(codeBucket("organizer", actor.uid));
  return { orgId: outcome.orgId };
}
