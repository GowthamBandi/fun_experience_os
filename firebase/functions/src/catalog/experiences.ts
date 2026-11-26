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

import { isEmulator } from "../platform/security";
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
import { parseAgreementVersion, requireAgreement } from "./agreement";
import { syncEventCancellation } from "./cancellationSync";
import { bool, experienceRef, notFoundHere, organizerName, organizerRef, runCommand, type Json } from "./common";
import {
  CANCELLATION_PRESET_NAMES, cancellationFlags, cancellationSummary, isPresetName, parseCancellationRules, presetRules,
  type CancellationPreset, type CancellationRules,
} from "../commerce/cancellation";

/** The old one-word presets an app may still send as `cancellationPolicy` (read as their rules). */
export const CANCELLATION_POLICIES = CANCELLATION_PRESET_NAMES;
export const SAFETY_LEVELS = ["low", "medium", "high"] as const;
export const EXPERIENCE_POLICY_VERSION = "EXPERIENCE-1.0";

/** Fields that make up an experience's content (copied when a revision is approved). */
export const EXPERIENCE_CONTENT_FIELDS = [
  "title", "tagline", "category", "activity", "description", "highlights", "format", "genderRule",
  "ageMin", "ageMax", "idRequired", "rules", "bring", "safety", "cancellationPolicy", "cancellation", "config",
  "coverStyle", "mediaPaths", "mediaUrls",
] as const;

/**
 * The organizer's cancellation rules from a save: the `cancellation` object
 * (docs/CANCELLATION_POLICY_CONTRACT.md) when sent, else an older app's
 * one-word `cancellationPolicy` read as that preset.
 */
export function parseCancellationInput(d: Json): CancellationRules {
  if (d.cancellation !== undefined && d.cancellation !== null) {
    const p = parseCancellationRules(d.cancellation);
    if (!p.ok) {
      throw new DomainError("INVALID_INPUT", p.message, {
        nextStep: "Fix the cancellation rules and save again.",
        facts: p.tier === undefined ? { field: "cancellation" } : { field: "cancellation", tier: p.tier },
      });
    }
    return p.rules;
  }
  if (isPresetName(d.cancellationPolicy)) return presetRules(d.cancellationPolicy);
  throw new DomainError(
    "INVALID_INPUT",
    d.cancellationPolicy === "custom" ? "Set the custom cancellation rules." : "Cancellation policy is not supported.",
    { facts: { field: "cancellation" } }
  );
}

/**
 * The rules stored on an experience, re-checked before it goes to review (or
 * an event built on it does). A draft saved by an older app has only the
 * one-word preset, which is always fine.
 */
export function storedCancellation(doc: Json): CancellationRules {
  if (doc.cancellation !== undefined && doc.cancellation !== null) {
    const p = parseCancellationRules(doc.cancellation);
    if (!p.ok) {
      throw new DomainError("INVALID_INPUT", p.message, {
        nextStep: "Edit the cancellation rules, save, and try again.",
        facts: { field: "cancellation" },
      });
    }
    return p.rules;
  }
  if (isPresetName(doc.cancellationPolicy)) return presetRules(doc.cancellationPolicy);
  throw new DomainError("INVALID_INPUT", "Choose a cancellation policy first.", {
    nextStep: "Edit the cancellation rules, save, and try again.",
    facts: { field: "cancellation" },
  });
}

/** Case fields the reviewer reads: the rules in plain words and what to look at twice. */
export function cancellationReview(rules: CancellationRules) {
  return {
    cancellationSummary: cancellationSummary(rules),
    cancellationFlags: cancellationFlags(rules).map((f) => f.key),
  };
}

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
  /** Kept for older apps: the preset name, or "custom". The rules are `cancellation`. */
  cancellationPolicy: CancellationPreset;
  cancellation: CancellationRules;
  config: Record<string, unknown>;
  coverStyle: { seed: number } | null;
  mediaPaths: string[];
  /** Download URLs of the same photos, for display (first = cover). */
  mediaUrls: string[];
}

/**
 * A Firebase Storage download URL for an object in `orgMedia/{orgId}/`
 * (production host, or the Storage emulator in local builds).
 */
export function isOrgMediaUrl(url: string, orgId: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return false;
  }
  const hostOk =
    (u.protocol === "https:" && u.hostname === "firebasestorage.googleapis.com") ||
    (u.protocol === "http:" && isEmulator());
  if (!hostOk) return false;
  const m = u.pathname.match(/^\/v0\/b\/[^/]+\/o\/(.+)$/);
  if (!m) return false;
  let object: string;
  try {
    object = decodeURIComponent(m[1]!);
  } catch {
    return false;
  }
  return object.startsWith(`orgMedia/${orgId}/`) && !object.includes("..") && object.split("/").length === 3;
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
  const mediaUrls = strList(d.mediaUrls, "Photos", 10, 1000);
  for (const u of mediaUrls) {
    if (!isOrgMediaUrl(u, orgId)) {
      throw new DomainError("INVALID_INPUT", "Photos must be uploaded to your organizer's media folder.");
    }
  }
  const cancellation = parseCancellationInput(d);
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
    cancellationPolicy: cancellation.preset,
    cancellation,
    config,
    coverStyle,
    mediaPaths,
    mediaUrls,
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
  const agreementVersion = parseAgreementVersion(d.agreementVersion);

  return runCommand("catalog.experience-submitted", uid, rid, async (tx, now) => {
    const m = await requirePermission(uid, orgId, "experiences.submit", { tx });
    const agreement = requireAgreement(agreementVersion, uid, now);
    const ref = experienceRef(experienceId);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()!.orgId !== orgId) throw notFoundHere("experience");
    const cur = snap.data()!;
    if (!EDITABLE.has(cur.status)) {
      throw precondition("Only draft experiences can be sent for review.", undefined, { status: cur.status });
    }
    // The cover is the organizer's own photo, never a PULSE stock cover (owner rule, 24 Nov 2026).
    if (!Array.isArray(cur.mediaUrls) || cur.mediaUrls.length === 0) {
      throw precondition(
        "Add at least one photo of your own before sending this for review.",
        "The first photo is the cover customers see. Use a real photo of the venue or a past session.",
      );
    }
    const orgSnap = await tx.get(organizerRef(orgId));
    if (!orgSnap.exists || orgSnap.data()!.status !== "active") {
      throw precondition("Your organizer account must be active to submit experiences.", "Contact PULSE support.");
    }
    const cancellation = storedCancellation(cur);
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
      ...cancellationReview(cancellation),
      previousVersionId: cur.previousVersionId ?? null,
      submittedBy: uid,
      createdAt: now,
      updatedAt: now,
    });
    tx.update(ref, { status: "submitted", submittedAt: now, governanceCaseId: caseRef.id, organizerAgreement: agreement, version: (cur.version ?? 0) + 1, updatedAt: now, updatedBy: uid });
    writeAudit(tx, {
      action: "catalog.experience-submitted",
      actorUid: uid,
      actorRole: actorRole(m),
      resourceType: "experience",
      resourceId: experienceId,
      orgId,
      before: { status: cur.status },
      after: { status: "submitted", governanceCaseId: caseRef.id, risk, agreementVersion: agreement.version },
      requestId: rid,
    });
    return { experienceId, status: "submitted", caseId: caseRef.id };
  }, { authorize: (tx) => requirePermission(uid, orgId, "experiences.submit", { tx }) });
}

// ------------------------------------------------------ deleteExperienceDraft

/**
 * Deletes a draft that PULSE never saw: status `draft`, never submitted (no
 * governance case), not a revision of an approved experience and with no
 * event. Anything that went to review stays for the record.
 */
export async function deleteExperienceDraftCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const orgId = docId(d.orgId, "orgId");
  const experienceId = docId(d.experienceId, "experienceId");

  return runCommand("catalog.experience-draft-deleted", uid, rid, async (tx) => {
    const m = await requirePermission(uid, orgId, "experiences.edit", { tx });
    const ref = experienceRef(experienceId);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()!.orgId !== orgId) throw notFoundHere("experience");
    const cur = snap.data()!;
    if (cur.status !== "draft" || cur.governanceCaseId || cur.submittedAt) {
      throw precondition("Only drafts that were never sent for review can be deleted.", "Contact PULSE support to remove it.", { status: cur.status });
    }
    if (cur.previousVersionId) {
      throw precondition("This is a change to an approved experience.", "Discard the changes instead.");
    }
    const events = await tx.get(db().collection(COLLECTIONS.events).where("experienceId", "==", experienceId).limit(1));
    if (!events.empty) throw precondition("This experience already has an event.", "Contact PULSE support to remove it.");
    tx.delete(ref);
    writeAudit(tx, {
      action: "catalog.experience-draft-deleted",
      actorUid: uid,
      actorRole: actorRole(m),
      resourceType: "experience",
      resourceId: experienceId,
      orgId,
      before: { status: cur.status, title: cur.title ?? null, category: cur.category ?? null },
      after: null,
      requestId: rid,
    });
    return { experienceId, deleted: true };
  }, { authorize: (tx) => requirePermission(uid, orgId, "experiences.edit", { tx }) });
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
    // Content only: the ORIGINAL's governance state is never changed here. A
    // revision is always cut from an approved original, but by the time it
    // is approved the original may have been suspended, blocked or archived
    // by an operator; approving the revision's content must not re-approve
    // (re-list) it. An approved original simply stays approved.
    const preservedStatus = o.status !== "approved";
    tx.update(origRef, {
      ...content,
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
      before: { revision: o.revision ?? 1, title: o.title, status: o.status ?? null },
      after: { revision: r.revision, title: r.title, revisionId, status: o.status ?? null },
      ...(preservedStatus ? { reason: `Revision content merged; the original's "${String(o.status)}" status was kept.` } : {}),
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
export const deleteExperienceDraft = callable(async (data, context) => {
  const uid = requirePhoneUser(context).uid;
  await consumeLimit("catalogSave", uid);
  return deleteExperienceDraftCommand(uid, data);
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
        // Runs on every delivery (a retry after a merge finds the revision
        // archived): upcoming events take the merged cancellation rules.
        const rev = (await experienceRef(experienceId).get()).data();
        const mergedInto = rev?.status === "archived" && typeof rev.mergedInto === "string" ? rev.mergedInto : null;
        const sync = mergedInto ? await syncEventCancellation(mergedInto) : null;
        logInfo({
          event: "job.completed", job: "onExperienceRevisionApproved", experienceId, orgId: after.orgId ?? null, outcome: out,
          eventsSynced: sync?.eventsUpdated.length ?? 0, bookingsFrozen: sync?.bookingsFrozen ?? 0,
        });
      } catch (e) {
        logError({ event: "job.failed", job: "onExperienceRevisionApproved", experienceId, error: String((e as Error)?.message ?? e), willRetry: true });
        throw e;
      }
    }
  });
