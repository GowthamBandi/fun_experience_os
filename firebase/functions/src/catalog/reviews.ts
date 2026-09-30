/**
 * Reviews: one per checked-in participant per event (`reviews/{eventId}__{uid}`).
 *
 * Eligibility (all server-side, in one transaction):
 *  * the caller holds a ticket for the event whose status is `used` (checked in);
 *  * the event is `completed` or its `endsAt` has passed (and it wasn't cancelled);
 *  * no later than 30 days after `endsAt`;
 *  * the caller is NOT an active member of the organizer (no self-reviews).
 * Editing within the window replaces the review (version increments).
 *
 * Aggregates `ratingCount` / `ratingSum` / `ratingAverage` are maintained on
 * `publicOrganizers/{orgId}` and `experiences/{experienceId}` in the same
 * transaction, counting only `published` reviews. Moderation adjusts them.
 */

import type { Transaction, DocumentReference } from "firebase-admin/firestore";
import { assertWellFormed, callable, docId, int, obj, oneOf, requestId, str } from "../platform/callable";
import { requirePhoneUser } from "../platform/actors";
import { requireAdmin } from "../platform/auth";
import { DomainError, precondition } from "../platform/errors";
import { COLLECTIONS, db, type Timestamp } from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { consumeRateLimit } from "../platform/rateLimit";
import { readMembership } from "../access/permissions";
import { eventRef, experienceRef, runCommand, type Json } from "./common";

export const REVIEW_WINDOW_MS = 30 * 24 * 3600_000;
export const REVIEW_RATE_LIMIT = { limit: 10, windowSeconds: 3600 };

export const reviewId = (eventId: string, uid: string) => `${eventId}__${uid}`;

const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|in|net|org|io|co|me|app|link|ly|xyz|info|biz|site|online)\b|\bt\.me\/|wa\.me)/i;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
/** 10+ digits allowing separators (spaces, dots, dashes, brackets, +91 prefix). */
const PHONE_RE = /(\+?\d[\s().-]*){10,}/;

/** Basic anti-spam / contact-harvesting filter. Returns a reason or null. */
export function commentViolation(comment: string): string | null {
  if (URL_RE.test(comment)) return "Reviews can't contain links or web addresses.";
  if (EMAIL_RE.test(comment)) return "Reviews can't contain email addresses.";
  if (PHONE_RE.test(comment)) return "Reviews can't contain phone numbers.";
  return null;
}

function aggregateUpdate(
  tx: Transaction,
  ref: DocumentReference,
  cur: Json | undefined,
  dCount: number,
  dSum: number,
  now: Timestamp
) {
  const count = Math.max(0, ((cur?.ratingCount as number) ?? 0) + dCount);
  const sum = Math.max(0, ((cur?.ratingSum as number) ?? 0) + dSum);
  tx.set(
    ref,
    { ratingCount: count, ratingSum: count === 0 ? 0 : sum, ratingAverage: count === 0 ? null : Math.round((sum / count) * 10) / 10, ratingUpdatedAt: now },
    { merge: true }
  );
}

// ----------------------------------------------------------- submitReview

export async function submitReviewCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const eventId = docId(d.eventId, "eventId");
  const rating = int(d.rating, "Rating", 1, 5);
  let comment = "";
  if (d.comment !== undefined && d.comment !== null) {
    if (typeof d.comment !== "string") throw new DomainError("INVALID_INPUT", "Comment must be text.");
    assertWellFormed(d.comment, "Comment");
    comment = d.comment.trim();
    if (comment.length > 1000) throw new DomainError("INVALID_INPUT", "Comments can be at most 1000 characters.");
    const bad = commentViolation(comment);
    if (bad) {
      throw new DomainError("INVALID_INPUT", bad, { nextStep: "Remove contact details and links, then post again." });
    }
  }

  await consumeRateLimit({
    bucket: `review:${uid}`,
    ...REVIEW_RATE_LIMIT,
    message: "You're posting reviews too quickly. Please wait a while.",
  });

  return runCommand("catalog.review-submitted", uid, rid, async (tx, now) => {
    const evSnap = await tx.get(eventRef(eventId));
    if (!evSnap.exists) throw new DomainError("NOT_FOUND", "This event doesn't exist.");
    const ev = evSnap.data()!;
    const orgId = ev.orgId as string;
    const endsMs = (ev.endsAt as Timestamp | undefined)?.toMillis() ?? Number.POSITIVE_INFINITY;

    const member = await readMembership(orgId, uid, tx);
    if (member && member.status === "active") {
      throw new DomainError("NOT_PERMITTED", "Organizer team members can't review their own events.");
    }
    const tickets = await tx.get(
      db().collection(COLLECTIONS.tickets)
        .where("eventId", "==", eventId)
        .where("customerUid", "==", uid)
        .where("status", "==", "used")
        .limit(1)
    );
    if (tickets.empty) {
      throw new DomainError("NOT_PERMITTED", "Only people who attended (checked in) can review this event.", {
        nextStep: "Reviews open for guests whose ticket was scanned at the event.",
      });
    }
    if (ev.status === "cancelled") throw precondition("This event was cancelled, so it can't be reviewed.");
    const ended = ev.status === "completed" || endsMs <= now.toMillis();
    if (!ended) throw precondition("You can review this event once it has ended.");
    if (Number.isFinite(endsMs) && now.toMillis() > endsMs + REVIEW_WINDOW_MS) {
      throw precondition("Reviews close 30 days after the event.");
    }

    const ref = db().collection(COLLECTIONS.reviews).doc(reviewId(eventId, uid));
    const existing = await tx.get(ref);
    const profile = await tx.get(db().collection(COLLECTIONS.publicProfiles).doc(uid));
    const orgAggRef = db().collection("publicOrganizers").doc(orgId);
    const expRef = experienceRef(ev.experienceId as string);
    const [orgAgg, exp] = await Promise.all([tx.get(orgAggRef), tx.get(expRef)]);

    const dn = profile.data()?.displayName;
    const authorName = typeof dn === "string" && dn.trim().length > 0 ? dn.trim().slice(0, 30) : "PULSE member";
    const prev = existing.exists ? existing.data()! : null;
    const status = prev?.status === "hidden" ? "hidden" : "published";
    const version = ((prev?.version as number) ?? 0) + 1;

    if (status === "published") {
      const dCount = prev ? 0 : 1;
      const dSum = rating - ((prev?.rating as number) ?? 0);
      aggregateUpdate(tx, orgAggRef, orgAgg.data(), dCount, dSum, now);
      if (exp.exists) aggregateUpdate(tx, expRef, exp.data(), dCount, dSum, now);
    }
    tx.set(ref, {
      eventId,
      experienceId: ev.experienceId,
      orgId,
      authorUid: uid,
      authorName,
      rating,
      comment,
      status,
      version,
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
      moderation: prev?.moderation ?? null,
    });
    writeAudit(tx, {
      action: prev ? "catalog.review-edited" : "catalog.review-submitted",
      actorUid: uid, actorRole: "customer", resourceType: "review", resourceId: ref.id, orgId,
      before: prev ? { rating: prev.rating, version: prev.version } : null,
      after: { rating, status, version }, requestId: rid,
    });
    return { reviewId: ref.id, status, version };
  });
}

// ---------------------------------------------------------- moderateReview

export async function moderateReviewCommand(admin: { uid: string; roleId: string }, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const id = str(d.reviewId, "reviewId", 9, 260);
  if (!/^[A-Za-z0-9_-]+__[A-Za-z0-9_-]+$/.test(id)) throw new DomainError("INVALID_INPUT", "reviewId is not valid.");
  const status = oneOf(d.status, "status", ["published", "hidden"] as const);
  const reason = str(d.reason, "Reason", 5, 500);
  return runCommand("catalog.review-moderated", admin.uid, rid, async (tx, now) => {
    const ref = db().collection(COLLECTIONS.reviews).doc(id);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "This review doesn't exist.");
    const r = snap.data()!;
    const orgAggRef = db().collection("publicOrganizers").doc(r.orgId);
    const expRef = experienceRef(r.experienceId);
    const [orgAgg, exp] = await Promise.all([tx.get(orgAggRef), tx.get(expRef)]);
    if (r.status !== status) {
      const sign = status === "published" ? 1 : -1;
      aggregateUpdate(tx, orgAggRef, orgAgg.data(), sign, sign * (r.rating as number), now);
      if (exp.exists) aggregateUpdate(tx, expRef, exp.data(), sign, sign * (r.rating as number), now);
      tx.update(ref, {
        status,
        moderation: { by: admin.uid, reason, at: now },
        updatedAt: now,
      });
    }
    writeAudit(tx, {
      action: "catalog.review-moderated", actorUid: admin.uid, actorRole: `platform:${admin.roleId}`,
      resourceType: "review", resourceId: id, orgId: r.orgId,
      before: { status: r.status }, after: { status }, reason, requestId: rid, source: "operations-console",
    });
    return { reviewId: id, status };
  });
}

export const submitReview = callable(async (data, context) => submitReviewCommand(requirePhoneUser(context).uid, data));
export const moderateReview = callable(async (data, context) =>
  moderateReviewCommand(requireAdmin(context, "moderate reviews"), data)
);
