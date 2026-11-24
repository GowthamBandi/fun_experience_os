import { createHash } from "node:crypto";
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
 *
 * Trip reviews (`submitTripReview`, `kind: "trip"`) live in the same
 * collection as `reviews/{departureId}__{uid}` and count towards the same
 * `publicOrganizers/{orgId}` rating, plus `trips/{tripId}`.
 */

import type { Transaction, DocumentReference } from "firebase-admin/firestore";
import { assertWellFormed, callable, docId, int, obj, oneOf, requestId, str } from "../platform/callable";
import { requireCustomerAction } from "../platform/actors";
import { requireAdmin } from "../platform/auth";
import { DomainError, precondition } from "../platform/errors";
import { COLLECTIONS, db, type Timestamp } from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { consumeRateLimit } from "../platform/rateLimit";
import { readMembership } from "../access/permissions";
import { eventRef, experienceRef, runCommand, type Json } from "./common";
import { departureRef, tripBookingRef, tripRef } from "../trips/refs";

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

/** Optional review comment: text, at most 1000 characters, no links or contact details. */
function parseComment(v: unknown): string {
  if (v === undefined || v === null) return "";
  if (typeof v !== "string") throw new DomainError("INVALID_INPUT", "Comment must be text.");
  assertWellFormed(v, "Comment");
  const comment = v.trim();
  if (comment.length > 1000) throw new DomainError("INVALID_INPUT", "Comments can be at most 1000 characters.");
  const bad = commentViolation(comment);
  if (bad) {
    throw new DomainError("INVALID_INPUT", bad, { nextStep: "Remove contact details and links, then post again." });
  }
  return comment;
}

/** One bucket for event and trip reviews. */
function consumeReviewLimit(uid: string) {
  return consumeRateLimit({
    bucket: `review:${uid}`,
    ...REVIEW_RATE_LIMIT,
    message: "You're posting reviews too quickly. Please wait a while.",
  });
}

/** Display alias from the public profile (never the account or phone). */
function aliasOf(profile: Json | undefined): string {
  const dn = profile?.displayName;
  return typeof dn === "string" && dn.trim().length > 0 ? dn.trim().slice(0, 30) : "PULSE member";
}

export async function submitReviewCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const eventId = docId(d.eventId, "eventId");
  const rating = int(d.rating, "Rating", 1, 5);
  const comment = parseComment(d.comment);
  await consumeReviewLimit(uid);

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

    const authorName = aliasOf(profile.data());
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
    if (status === "published") {
      tx.delete(legacyPublicReviewRef(ref.id));
      tx.set(publicReviewRef(ref.id), {
        kind: "event", orgId, experienceId: ev.experienceId, eventId, title: String(ev.title ?? ""), authorName, rating, comment,
        createdAt: prev?.createdAt ?? now, updatedAt: now,
      });
    }
    writeAudit(tx, {
      action: prev ? "catalog.review-edited" : "catalog.review-submitted",
      actorUid: uid, actorRole: "customer", resourceType: "review", resourceId: ref.id, orgId,
      before: prev ? { rating: prev.rating, version: prev.version } : null,
      after: { rating, status, version }, requestId: rid,
    });
    return { reviewId: ref.id, status, version };
  });
}

/** publicReviews/{id}: what anyone may read about a published review (alias,
 *  rating, comment, date) — never the author's account. Removed when hidden. */
function publicReviewRef(id: string) {
  return db().collection("publicReviews").doc(publicReviewId(id));
}

/** The public copy's document id: derived from the review id but not
 *  reversible, so the public collection never carries the author's account
 *  id (the review id is `<eventOrDepartureId>__<uid>`). */
export function publicReviewId(reviewId: string): string {
  return createHash("sha256").update(`public-review:${reviewId}`).digest("base64url").slice(0, 24);
}

/** Copies written before ids were hashed used the review id itself. */
function legacyPublicReviewRef(id: string) {
  return db().collection("publicReviews").doc(id);
}

// ------------------------------------------------------- submitTripReview

export const tripReviewId = (departureId: string, uid: string) => `${departureId}__${uid}`;

/**
 * Trip reviews: one per boarded traveller per departure
 * (`reviews/{departureId}__{uid}`, `kind: "trip"`).
 *
 * Eligibility (one transaction): the caller's own `confirmed` booking that the
 * organizer marked as boarded (`boardedAt`, set by setTripBoarding); the
 * departure has ended, wasn't cancelled and ended no more than 30 days ago;
 * the caller is not an active member of the organizer. Aggregates go to
 * `publicOrganizers/{orgId}` (the organization's rating) and `trips/{tripId}`.
 */
export async function submitTripReviewCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const bookingId = docId(d.bookingId, "bookingId");
  const rating = int(d.rating, "Rating", 1, 5);
  const comment = parseComment(d.comment);
  await consumeReviewLimit(uid);

  return runCommand("trips.review-submitted", uid, rid, async (tx, now) => {
    const bSnap = await tx.get(tripBookingRef(bookingId));
    if (!bSnap.exists || bSnap.data()!.customerUid !== uid) {
      throw new DomainError("NOT_FOUND", "We couldn't find that booking.", { nextStep: "Open Your trips and try again." });
    }
    const b = bSnap.data()!;
    const orgId = b.orgId as string;
    const departureId = b.departureId as string;
    const tripId = b.tripId as string;

    const member = await readMembership(orgId, uid, tx);
    if (member && member.status === "active") {
      throw new DomainError("NOT_PERMITTED", "Organizer team members can't review their own trips.");
    }
    if (b.status !== "confirmed") throw precondition("Only confirmed bookings can review this trip.");
    const depSnap = await tx.get(departureRef(departureId));
    const dep = depSnap.data();
    if (!dep || dep.cancelled === true) throw precondition("This departure was cancelled, so it can't be reviewed.");
    if (!b.boardedAt) {
      throw new DomainError("NOT_PERMITTED", "Only travellers the organizer marked as boarded can review this trip.", {
        nextStep: "Reviews open for travellers the trip captain checked in at boarding.",
      });
    }
    const endMs = (dep.end as Timestamp | undefined)?.toMillis() ?? Number.POSITIVE_INFINITY;
    if (endMs > now.toMillis()) throw precondition("You can review this trip once it has ended.");
    if (now.toMillis() > endMs + REVIEW_WINDOW_MS) throw precondition("Reviews close 30 days after the trip.");

    const ref = db().collection(COLLECTIONS.reviews).doc(tripReviewId(departureId, uid));
    const tRef = tripRef(tripId);
    const orgAggRef = db().collection("publicOrganizers").doc(orgId);
    const [existing, profile, orgAgg, trip] = await Promise.all([
      tx.get(ref),
      tx.get(db().collection(COLLECTIONS.publicProfiles).doc(uid)),
      tx.get(orgAggRef),
      tx.get(tRef),
    ]);
    const authorName = aliasOf(profile.data());
    const title = String(trip.data()?.title ?? b.title ?? "");
    const prev = existing.exists ? existing.data()! : null;
    const status = prev?.status === "hidden" ? "hidden" : "published";
    const version = ((prev?.version as number) ?? 0) + 1;

    if (status === "published") {
      const dCount = prev ? 0 : 1;
      const dSum = rating - ((prev?.rating as number) ?? 0);
      aggregateUpdate(tx, orgAggRef, orgAgg.data(), dCount, dSum, now);
      if (trip.exists) aggregateUpdate(tx, tRef, trip.data(), dCount, dSum, now);
    }
    tx.set(ref, {
      kind: "trip",
      tripId,
      departureId,
      orgId,
      title,
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
    if (status === "published") {
      tx.delete(legacyPublicReviewRef(ref.id));
      tx.set(publicReviewRef(ref.id), {
        kind: "trip", orgId, tripId, departureId, title, authorName, rating, comment,
        createdAt: prev?.createdAt ?? now, updatedAt: now,
      });
    }
    writeAudit(tx, {
      action: prev ? "trips.review-edited" : "trips.review-submitted",
      actorUid: uid, actorRole: "customer", resourceType: "review", resourceId: ref.id, orgId,
      before: prev ? { rating: prev.rating, version: prev.version } : null,
      after: { rating, status, version, bookingId }, requestId: rid,
    });
    return { reviewId: ref.id, status, version };
  });
}

// ---------------------------------------------------------- moderateReview

/**
 * Hides or restores an event review or a trip review (`kind: "trip"`; a
 * review without `kind` is an event review). Aggregates move on the
 * organizer and on the experience (event) or the trip.
 */
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
    const isTrip = r.kind === "trip";
    const orgAggRef = db().collection("publicOrganizers").doc(r.orgId);
    // The rated listing: the trip, or the event's experience.
    const targetRef = isTrip ? tripRef(r.tripId) : experienceRef(r.experienceId);
    const [orgAgg, target, ev] = await Promise.all([
      tx.get(orgAggRef),
      tx.get(targetRef),
      !isTrip && status === "published" && r.status !== status && r.eventId ? tx.get(eventRef(r.eventId)) : Promise.resolve(null),
    ]);
    if (r.status !== status) {
      const sign = status === "published" ? 1 : -1;
      aggregateUpdate(tx, orgAggRef, orgAgg.data(), sign, sign * (r.rating as number), now);
      if (target.exists) aggregateUpdate(tx, targetRef, target.data(), sign, sign * (r.rating as number), now);
      tx.update(ref, {
        status,
        moderation: { by: admin.uid, reason, at: now },
        updatedAt: now,
      });
      tx.delete(legacyPublicReviewRef(id));
      if (status === "hidden") tx.delete(publicReviewRef(id));
      else if (isTrip) {
        tx.set(publicReviewRef(id), {
          kind: "trip", orgId: r.orgId, tripId: r.tripId, departureId: r.departureId,
          title: String(r.title ?? target.data()?.title ?? ""), authorName: r.authorName,
          rating: r.rating, comment: r.comment, createdAt: r.createdAt, updatedAt: now,
        });
      } else {
        tx.set(publicReviewRef(id), {
          kind: "event", orgId: r.orgId, experienceId: r.experienceId, eventId: r.eventId,
          title: String(ev?.data()?.title ?? ""), authorName: r.authorName,
          rating: r.rating, comment: r.comment, createdAt: r.createdAt, updatedAt: now,
        });
      }
    }
    writeAudit(tx, {
      action: "catalog.review-moderated", actorUid: admin.uid, actorRole: `platform:${admin.roleId}`,
      resourceType: "review", resourceId: id, orgId: r.orgId,
      before: { status: r.status }, after: { status }, reason, requestId: rid, source: "operations-console",
    });
    return { reviewId: id, status };
  });
}

export const submitReview = callable(async (data, context) => submitReviewCommand((await requireCustomerAction(context)).uid, data));
export const submitTripReview = callable(async (data, context) => submitTripReviewCommand((await requireCustomerAction(context)).uid, data));
export const moderateReview = callable(async (data, context) =>
  moderateReviewCommand(requireAdmin(context, "moderate reviews"), data)
);
