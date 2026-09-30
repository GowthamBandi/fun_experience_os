/**
 * Experiences: the reusable, category-configurable offering (ADR-0003).
 *
 * Lifecycle: draft → submitted → approved / changes-requested / rejected → archived.
 *
 * REVISIONS. An approved experience is never edited in place. Saving against
 * an approved experience creates (or continues) a draft REVISION — a separate
 * `experiences` document with `previousVersionId` pointing at the approved one.
 * The approved listing stays exactly as approved while the revision goes
 * through governance. When governance approves the revision,
 * `applyApprovedRevision` (run by the `onExperienceRevisionApproved` trigger)
 * copies the revised content onto the ORIGINAL document — keeping its id, its
 * events and its rating aggregate stable — and archives the revision.
 */

import type { Transaction } from "firebase-admin/firestore";
import * as functions from "firebase-functions/v1";
import { callable, docId, int, obj, oneOf, optStr, requestId, str, strList } from "../platform/callable";
import { requirePhoneUser } from "../platform/actors";
import { DomainError, precondition } from "../platform/errors";
import { consumeLimit } from "../platform/rateLimit";
import { isStaleEvent } from "../platform/jobs";
import { logError, logInfo } from "../platform/log";
import { COLLECTIONS, db, serverNow, type Timestamp } from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { requirePermission, actorRole } from "../access/permissions";
import { CATEGORY_KEYS, GENDER_RULES, categoryRisk, validateCategoryConfig, type GenderRule } from "./categories";
import { bool, experienceRef, notFoundHere, organizerName, organizerRef, runCommand, type Json } from "./common";

export const CANCELLATION_POLICIES = ["flexible", "moderate", "strict"] as const;
export const SAFETY_LEVELS = ["low", "medium", "high"] as const;
export const EXPERIENCE_POLICY_VERSION = "EXPERIENCE-1.0";

/** Fields that make up an experience's content (copied when a revision is approved). */
export const EXPERIENCE_CONTENT_FIELDS = [
  "title", "tagline", "category", "activity", "description", "highlights", "format", "genderRule",
  "ageMin", "ageMax", "idRequired", "rules", "bring", "safety", "cancellationPolicy", "config",
  "coverStyle", "mediaPaths",
] as const;

export interface ExperienceContent {
  title: string;
  tagline: string;
  category: string;
  activity: string;
  description: string;
  highlights: string[];
  format: string;
  genderRule: GenderRule;
  ageMin: number;
  ageMax: number | null;
  idRequired: boolean;
  rules: string[];
  bring: string[];
  safety: { level: (typeof SAFETY_LEVELS)[number]; measures: string[] };
  cancellationPolicy: (typeof CANCELLATION_POLICIES)[number];
  config: Record<string, unknown>;
  coverStyle: { seed: number } | null;
  mediaPaths: string[];
}

export function parseExperienceContent(d: Json, orgId: string): ExperienceContent {
  const category = oneOf(d.category, "category", CATEGORY_KEYS);
  const ageMin = int(d.ageMin, "Minimum age", 13, 99);
  const ageMax = d.ageMax === undefined || d.ageMax === null ? null : int(d.ageMax, "Maximum age", ageMin, 120);
  const genderRule = oneOf(d.genderRule, "Gender rule", GENDER_RULES);
  const idRequired = bool(d.idRequired, "ID required");
  const safetyRaw = obj(d.safety);
  const safety = {
    level: oneOf(safetyRaw.level, "Safety level", SAFETY_LEVELS),
    measures: strList(safetyRaw.measures, "Safety measures", 12, 160),
  };
  if (safety.level === "high" && safety.measures.length === 0) {
    throw new DomainError("INVALID_INPUT", "High-risk experiences must list their safety measures.");
  }
  const config = validateCategoryConfig(category, d.config, { ageMin, ageMax, idRequired, genderRule });
  let coverStyle: { seed: number } | null = null;
  if (d.coverStyle !== undefined && d.coverStyle !== null) {
    coverStyle = { seed: int(obj(d.coverStyle).seed, "Cover style", 0, 1_000_000) };
  }
  const mediaPaths = strList(d.mediaPaths, "Media", 10, 200);
  const mediaPrefix = `orgMedia/${orgId}/`;
  for (const p of mediaPaths) {
    if (!p.startsWith(mediaPrefix) || p.includes("..") || !/^[A-Za-z0-9/_.-]+$/.test(p) || p.split("/").length !== 3) {
      throw new DomainError("INVALID_INPUT", "Photos must be uploaded to your organizer's media folder.");
    }
  }
  return {
    title: str(d.title, "Title", 3, 80),
    tagline: optStr(d.tagline, "Tagline", 120) ?? "",
    category,
    activity: str(d.activity, "Activity", 2, 60),
    description: str(d.description, "Description", 20, 4000),
    highlights: strList(d.highlights, "Highlights", 10, 120),
    format: str(d.format, "Format", 2, 60),
    genderRule,
    ageMin,
    ageMax,
    idRequired,
    rules: strList(d.rules, "Rules", 20, 200),
    bring: strList(d.bring, "Things to bring", 20, 120),
    safety,
    cancellationPolicy: oneOf(d.cancellationPolicy, "Cancellation policy", CANCELLATION_POLICIES),
    config,
    coverStyle,
    mediaPaths,
  };
}

export function experienceRisk(e: Pick<ExperienceContent, "safety" | "category" | "config">): "high" | "medium" | "low" {
  if (e.safety?.level === "high" || categoryRisk(e.category, e.config ?? {}) === "high") return "high";
  if (e.safety?.level === "medium") return "medium";
  return "low";
}

const EDITABLE = new Set(["draft", "changes-requested"]);

// ------------------------------------------------------------ saveExperience

export async function saveExperienceCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const orgId = docId(d.orgId, "orgId");
  const experienceId = d.experienceId === undefined || d.experienceId === null ? null : docId(d.experienceId, "experienceId");
  const content = parseExperienceContent(d, orgId);

  return runCommand("catalog.experience-saved", uid, rid, async (tx, now) => {
    const m = await requirePermission(uid, orgId, "experiences.edit", { tx });
    const orgSnap = await tx.get(organizerRef(orgId));
    if (!orgSnap.exists) throw notFoundHere("organizer");
    if (orgSnap.data()!.status === "blocked") {
      throw precondition("This organizer is blocked and can't change listings.", "Contact PULSE support.");
    }
    const orgName = organizerName(orgSnap.data());

    let target: { id: string; mode: "create" | "update" | "revision"; previousVersionId: string | null; before: Json | null };
    let revisionSeq = 1;
    if (!experienceId) {
      target = { id: db().collection(COLLECTIONS.experiences).doc().id, mode: "create", previousVersionId: null, before: null };
    } else {
      const snap = await tx.get(experienceRef(experienceId));
      if (!snap.exists || snap.data()!.orgId !== orgId) throw notFoundHere("experience");
      const cur = snap.data()!;
      if (EDITABLE.has(cur.status)) {
        target = { id: experienceId, mode: "update", previousVersionId: cur.previousVersionId ?? null, before: { status: cur.status, version: cur.version } };
      } else if (cur.status === "approved") {
        // Continue an open revision if there is one; otherwise start one.
        const open = await tx.get(
          db().collection(COLLECTIONS.experiences).where("previousVersionId", "==", experienceId)
        );
        const live = open.docs.filter((x) => ["draft", "changes-requested", "submitted"].includes(x.data().status));
        if (live.some((x) => x.data().status === "submitted")) {
          throw precondition(
            "A revision of this experience is already waiting for review.",
            "Wait for the review decision before making more changes."
          );
        }
        if (live.length > 0) {
          const r = live[0]!;
          target = { id: r.id, mode: "update", previousVersionId: experienceId, before: { status: r.data().status, version: r.data().version } };
        } else {
          revisionSeq = (typeof cur.revision === "number" ? cur.revision : 1) + 1;
          target = { id: db().collection(COLLECTIONS.experiences).doc().id, mode: "revision", previousVersionId: experienceId, before: null };
        }
      } else if (cur.status === "submitted") {
        throw precondition("This experience is being reviewed and can't be edited right now.", "Wait for the review decision.");
      } else {
        throw precondition("This experience can no longer be edited.", "Create a new experience instead.", { status: cur.status });
      }
    }

    const ref = experienceRef(target.id);
    if (target.mode === "update") {
      tx.update(ref, { ...content, status: "draft", organizerName: orgName, version: ((target.before?.version as number) ?? 0) + 1, updatedAt: now, updatedBy: uid });
    } else {
      tx.create(ref, {
        orgId,
        ...content,
        status: "draft",
        organizerName: orgName,
        previousVersionId: target.previousVersionId,
        revision: revisionSeq,
        ratingCount: 0,
        ratingSum: 0,
        governanceCaseId: null,
        version: 1,
        createdAt: now,
        createdBy: uid,
        updatedAt: now,
        updatedBy: uid,
      });
    }
    writeAudit(tx, {
      action: target.mode === "revision" ? "catalog.experience-revision-created" : "catalog.experience-saved",
      actorUid: uid,
      actorRole: actorRole(m),
      resourceType: "experience",
      resourceId: target.id,
      orgId,
      before: target.before,
      after: { status: "draft", title: content.title, category: content.category, previousVersionId: target.previousVersionId },
      requestId: rid,
    });
    return { experienceId: target.id, status: "draft", previousVersionId: target.previousVersionId };
  }, { authorize: (tx) => requirePermission(uid, orgId, "experiences.edit", { tx }) });
}

// ---------------------------------------------------------- submitExperience

export async function submitExperienceCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const orgId = docId(d.orgId, "orgId");
  const experienceId = docId(d.experienceId, "experienceId");

  return runCommand("catalog.experience-submitted", uid, rid, async (tx, now) => {
    const m = await requirePermission(uid, orgId, "experiences.submit", { tx });
    const ref = experienceRef(experienceId);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()!.orgId !== orgId) throw notFoundHere("experience");
    const cur = snap.data()!;
    if (!EDITABLE.has(cur.status)) {
      throw precondition("Only draft experiences can be sent for review.", undefined, { status: cur.status });
    }
    const orgSnap = await tx.get(organizerRef(orgId));
    if (!orgSnap.exists || orgSnap.data()!.status !== "active") {
      throw precondition("Your organizer account must be active to submit experiences.", "Contact PULSE support.");
    }
    const risk = experienceRisk(cur as unknown as ExperienceContent);
    const caseRef = db().collection(COLLECTIONS.governanceCases).doc();
    tx.create(caseRef, {
      kind: "experience-approval",
      targetId: experienceId,
      targetCollection: "experiences",
      subject: cur.title,
      orgId,
      organizerName: organizerName(orgSnap.data()),
      status: "pending",
      version: 0,
      policyVersion: EXPERIENCE_POLICY_VERSION,
      risk,
      location: null,
      summary: cur.previousVersionId
        ? `Revision of an approved ${cur.category} experience`
        : `New ${cur.category} experience: ${cur.activity}`,
      displayValue: `${cur.category} · ${cur.genderRule} · ${cur.ageMin}+`,
      previousVersionId: cur.previousVersionId ?? null,
      submittedBy: uid,
      createdAt: now,
      updatedAt: now,
    });
    tx.update(ref, { status: "submitted", submittedAt: now, governanceCaseId: caseRef.id, version: (cur.version ?? 0) + 1, updatedAt: now, updatedBy: uid });
    writeAudit(tx, {
      action: "catalog.experience-submitted",
      actorUid: uid,
      actorRole: actorRole(m),
      resourceType: "experience",
      resourceId: experienceId,
      orgId,
      before: { status: cur.status },
      after: { status: "submitted", governanceCaseId: caseRef.id, risk },
      requestId: rid,
    });
    return { experienceId, status: "submitted", caseId: caseRef.id };
  }, { authorize: (tx) => requirePermission(uid, orgId, "experiences.submit", { tx }) });
}

// ------------------------------------------------ revision approval (trigger)

/**
 * Folds an approved revision into its original experience. Idempotent: a
 * revision that is no longer `approved` (already merged) is a no-op.
 */
export async function applyApprovedRevision(revisionId: string): Promise<"merged" | "skipped"> {
  return db().runTransaction(async (tx: Transaction) => {
    const revRef = experienceRef(revisionId);
    const rev = await tx.get(revRef);
    if (!rev.exists) return "skipped";
    const r = rev.data()!;
    if (r.status !== "approved" || !r.previousVersionId) return "skipped";
    const origRef = experienceRef(r.previousVersionId);
    const orig = await tx.get(origRef);
    const now: Timestamp = serverNow();
    if (!orig.exists || orig.data()!.orgId !== r.orgId) {
      // Original vanished: the revision simply stands on its own.
      tx.update(revRef, { previousVersionId: null, updatedAt: now });
      return "skipped";
    }
    const content: Json = {};
    for (const f of EXPERIENCE_CONTENT_FIELDS) content[f] = r[f] ?? null;
    const o = orig.data()!;
    tx.update(origRef, {
      ...content,
      status: "approved",
      revision: r.revision ?? (o.revision ?? 1) + 1,
      lastRevisionId: revisionId,
      version: (o.version ?? 0) + 1,
      updatedAt: now,
      updatedBy: "system",
    });
    tx.update(revRef, { status: "archived", mergedInto: r.previousVersionId, archivedAt: now, updatedAt: now });
    writeAudit(tx, {
      action: "catalog.experience-revision-merged",
      actorUid: "system",
      actorRole: "system",
      resourceType: "experience",
      resourceId: r.previousVersionId,
      orgId: r.orgId,
      before: { revision: o.revision ?? 1, title: o.title },
      after: { revision: r.revision, title: r.title, revisionId },
      source: "system",
    });
    return "merged";
  });
}

export const saveExperience = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  await consumeLimit("catalogSave", uid);
  return saveExperienceCommand(uid, data);
});
export const submitExperience = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  await consumeLimit("catalogSubmit", uid);
  return submitExperienceCommand(uid, data);
});

/**
 * Folds an approved revision into its original. RETRIED (failurePolicy):
 * applyApprovedRevision is idempotent (a merged revision is `archived`, so a
 * replay is a no-op); stale events (> 24 h) are dropped with an ERROR log.
 */
export const onExperienceRevisionApproved = functions
  .region("asia-south1")
  .runWith({ failurePolicy: true })
  .firestore.document(`${COLLECTIONS.experiences}/{experienceId}`)
  .onUpdate(async (change, ctx) => {
    const before = change.before.data();
    const after = change.after.data();
    if (after.status === "approved" && before.status !== "approved" && after.previousVersionId) {
      const experienceId = ctx.params.experienceId as string;
      if (isStaleEvent(ctx.timestamp, 24 * 3_600_000, { job: "onExperienceRevisionApproved", experienceId })) return;
      try {
        const out = await applyApprovedRevision(experienceId);
        logInfo({ event: "job.completed", job: "onExperienceRevisionApproved", experienceId, orgId: after.orgId ?? null, outcome: out });
      } catch (e) {
        logError({ event: "job.failed", job: "onExperienceRevisionApproved", experienceId, error: String((e as Error)?.message ?? e), willRetry: true });
        throw e;
      }
    }
  });
