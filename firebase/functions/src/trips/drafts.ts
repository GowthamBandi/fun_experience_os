/**
 * Trip drafts and review (organizer → PULSE operations → live).
 *
 * Lifecycle of `tripDrafts/{hostTripId}`:
 *   draft ⇄ in-review → live | changes-requested | rejected
 *   live → draft (a new version; the live trip stays on sale) → in-review → live
 *
 * Approval publishes `trips/{tripId}` and reconciles `tripDepartures`: seat and
 * bed counters of departures already on sale are never reset, and a departure
 * with bookings is never deleted.
 */

import { DomainError, invalidInput, precondition } from "../platform/errors";
import { db, Timestamp } from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { notify } from "../platform/notify";
import { actorRole, requirePermission } from "../access/permissions";
import type { VerifiedActor } from "../platform/auth";
import { docId, isWellFormed, obj, oneOf, requestId } from "../platform/callable";
import { notFoundHere, organizerName, organizerRef, runCommand, bool, type Json } from "../catalog/common";
import { T, departureRef, draftRef, tripIdFor, tripRef } from "./refs";
import { firstIncomplete, parseTripDraft, priceFrom, tripContent, type TripDraftWire } from "./model";

export const TRIP_POLICY_VERSION = "TRIP-1.0";

const EDITABLE = new Set(["draft", "changes-requested"]);

function summary(d: TripDraftWire) {
  return {
    title: d.title.trim(),
    destination: d.destination.trim(),
    style: d.style,
    region: d.region,
    durationDays: d.days.length,
    priceFrom: priceFrom(d),
    departuresCount: d.departures.length,
  };
}

/** The view of a draft the app needs back. */
export function hostTripView(id: string, x: Json) {
  return {
    hostTripId: id,
    status: x.status as string,
    tripId: (x.tripId as string | null) ?? null,
    reviewerNote: (x.reviewerNote as string | null) ?? null,
    version: (x.version as number) ?? 0,
  };
}

// --------------------------------------------------------------- saveTripDraft

export async function saveTripDraftCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const orgId = docId(d.orgId, "orgId");
  const hostTripId = docId(d.hostTripId, "hostTripId");
  const forLive = d.forLive === undefined ? false : bool(d.forLive, "forLive");
  const draft = parseTripDraft(d.draft);

  return runCommand("trips.draft-saved", uid, rid, async (tx, now) => {
    const m = await requirePermission(uid, orgId, "experiences.edit", { tx });
    const org = await tx.get(organizerRef(orgId));
    if (!org.exists) throw notFoundHere("organizer");
    if (org.data()!.status === "blocked") {
      throw precondition("This organizer is blocked and can't change listings.", "Contact PULSE support.");
    }
    const ref = draftRef(hostTripId);
    const snap = await tx.get(ref);
    let status = "draft";
    let version = 1;
    if (snap.exists) {
      const cur = snap.data()!;
      if (cur.orgId !== orgId) throw notFoundHere("trip");
      if (EDITABLE.has(cur.status)) {
        status = cur.status;
      } else if (cur.status === "live" && forLive) {
        status = "draft";
      } else if (cur.status === "in-review") {
        throw precondition("This trip is being reviewed and can't be edited right now.", "Withdraw it from review to make changes.");
      } else if (cur.status === "live") {
        throw precondition("This trip is live. Edits start a new version.", "Use “Edit live trip” to make changes.");
      } else {
        throw precondition("This trip can no longer be edited.", "Duplicate it to start a new trip.", { status: cur.status });
      }
      version = (cur.version ?? 0) + 1;
      tx.update(ref, { draft, ...summary(draft), status, organizerName: organizerName(org.data()), version, updatedAt: now, updatedBy: uid });
    } else {
      tx.create(ref, {
        orgId,
        organizerName: organizerName(org.data()),
        draft,
        ...summary(draft),
        status,
        tripId: null,
        reviewerNote: null,
        submittedAt: null,
        submittedBy: null,
        decidedAt: null,
        decidedBy: null,
        version,
        createdAt: now,
        createdBy: uid,
        updatedAt: now,
        updatedBy: uid,
      });
    }
    // Autosave runs on every edit: audit creation and version starts only.
    if (!snap.exists || (forLive && snap.data()!.status === "live")) {
      writeAudit(tx, {
        action: snap.exists ? "trips.live-revision-started" : "trips.draft-created",
        actorUid: uid,
        actorRole: actorRole(m),
        resourceType: "tripDraft",
        resourceId: hostTripId,
        orgId,
        after: { status, title: draft.title },
        requestId: rid,
      });
    }
    return { hostTripId, status, version, updatedAt: now.toDate().toISOString() };
  }, { authorize: (tx) => requirePermission(uid, orgId, "experiences.edit", { tx }) });
}

// ------------------------------------------------------------- deleteTripDraft

export async function deleteTripDraftCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const orgId = docId(d.orgId, "orgId");
  const hostTripId = docId(d.hostTripId, "hostTripId");
  return runCommand("trips.draft-deleted", uid, rid, async (tx) => {
    const m = await requirePermission(uid, orgId, "experiences.edit", { tx });
    const snap = await tx.get(draftRef(hostTripId));
    if (!snap.exists) return { hostTripId, deleted: false };
    const cur = snap.data()!;
    if (cur.orgId !== orgId) throw notFoundHere("trip");
    if (cur.status !== "draft" || cur.tripId) throw precondition("Only unpublished drafts can be deleted.");
    tx.delete(draftRef(hostTripId));
    writeAudit(tx, {
      action: "trips.draft-deleted", actorUid: uid, actorRole: actorRole(m), resourceType: "tripDraft",
      resourceId: hostTripId, orgId, before: { status: cur.status, title: cur.title ?? null }, requestId: rid,
    });
    return { hostTripId, deleted: true };
  }, { authorize: (tx) => requirePermission(uid, orgId, "experiences.edit", { tx }) });
}

// ------------------------------------------------------------------ submitTrip

export async function submitTripCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const orgId = docId(d.orgId, "orgId");
  const hostTripId = docId(d.hostTripId, "hostTripId");
  return runCommand("trips.submitted", uid, rid, async (tx, now) => {
    const m = await requirePermission(uid, orgId, "experiences.submit", { tx });
    const ref = draftRef(hostTripId);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()!.orgId !== orgId) throw notFoundHere("trip");
    const cur = snap.data()!;
    if (!EDITABLE.has(cur.status)) throw precondition("This trip was already submitted.", undefined, { status: cur.status });
    const org = await tx.get(organizerRef(orgId));
    if (!org.exists || org.data()!.status !== "active") {
      throw precondition("Your organizer account must be active to submit trips.", "Contact PULSE support.");
    }
    const draft = parseTripDraft(cur.draft);
    let live = new Set<string>();
    if (cur.tripId) {
      const deps = await tx.get(db().collection(T.tripDepartures).where("tripId", "==", cur.tripId));
      live = new Set(deps.docs.map((x) => x.id));
    }
    const missing = firstIncomplete(draft, now.toMillis(), live);
    if (missing) throw precondition(missing, "Finish that step in the trip builder, then submit again.");
    const version = (cur.version ?? 0) + 1;
    tx.update(ref, {
      status: "in-review",
      submittedAt: now,
      submittedBy: uid,
      reviewerNote: null,
      organizerName: organizerName(org.data()),
      version,
      updatedAt: now,
      updatedBy: uid,
    });
    writeAudit(tx, {
      action: "trips.submitted", actorUid: uid, actorRole: actorRole(m), resourceType: "tripDraft",
      resourceId: hostTripId, orgId, before: { status: cur.status }, after: { status: "in-review", revisionOf: cur.tripId ?? null },
      requestId: rid,
    });
    return { hostTripId, status: "in-review", version };
  }, { authorize: (tx) => requirePermission(uid, orgId, "experiences.submit", { tx }) });
}

// ---------------------------------------------------------------- withdrawTrip

export async function withdrawTripCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const orgId = docId(d.orgId, "orgId");
  const hostTripId = docId(d.hostTripId, "hostTripId");
  return runCommand("trips.withdrawn", uid, rid, async (tx, now) => {
    const m = await requirePermission(uid, orgId, "experiences.submit", { tx });
    const ref = draftRef(hostTripId);
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()!.orgId !== orgId) throw notFoundHere("trip");
    const cur = snap.data()!;
    if (cur.status !== "in-review") throw precondition("Only trips in review can be withdrawn.");
    const version = (cur.version ?? 0) + 1;
    tx.update(ref, { status: "draft", version, updatedAt: now, updatedBy: uid });
    writeAudit(tx, {
      action: "trips.withdrawn", actorUid: uid, actorRole: actorRole(m), resourceType: "tripDraft",
      resourceId: hostTripId, orgId, before: { status: "in-review" }, after: { status: "draft" }, requestId: rid,
    });
    return { hostTripId, status: "draft", version };
  }, { authorize: (tx) => requirePermission(uid, orgId, "experiences.submit", { tx }) });
}

// ------------------------------------------------------------------ reviewTrip

export const REVIEW_OUTCOMES = ["approved", "changes-requested", "rejected"] as const;
export type ReviewOutcome = (typeof REVIEW_OUTCOMES)[number];

export function parseReviewCommand(value: unknown) {
  const d = obj(value);
  const outcome = oneOf(d.outcome, "outcome", REVIEW_OUTCOMES);
  const note = typeof d.note === "string" ? d.note.trim() : "";
  if (!isWellFormed(note)) throw invalidInput("The note contains invalid characters.");
  if (outcome !== "approved" && note.length < 10) throw invalidInput("Explain the decision in at least 10 characters.");
  if (note.length > 2000) throw invalidInput("The note is too long.");
  const expectedVersion = d.expectedVersion;
  if (typeof expectedVersion !== "number" || !Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw invalidInput("expectedVersion must be a non-negative whole number.");
  }
  return { requestId: requestId(d.requestId), hostTripId: docId(d.hostTripId, "hostTripId"), outcome, note, expectedVersion };
}

export async function reviewTripCommand(actor: VerifiedActor, data: unknown) {
  const c = parseReviewCommand(data);
  return runCommand("trips.reviewed", actor.uid, c.requestId, async (tx, now) => {
    const ref = draftRef(c.hostTripId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw notFoundHere("trip");
    const cur = snap.data()!;
    if ((cur.version ?? 0) !== c.expectedVersion) {
      throw new DomainError("CONFLICT", "The organizer changed this trip while you were reviewing it.", {
        nextStep: "Refresh and review the latest version.",
        detail: { currentVersion: cur.version ?? 0 },
      });
    }
    if (cur.status !== "in-review") throw precondition("This trip isn't waiting for review any more.", "Refresh the queue.", { status: cur.status });
    const draft = parseTripDraft(cur.draft);
    const orgId = cur.orgId as string;
    const version = (cur.version ?? 0) + 1;
    let tripId: string | null = (cur.tripId as string | null) ?? null;

    if (c.outcome === "approved") {
      tripId = tripId ?? tripIdFor(c.hostTripId);
      const tRef = tripRef(tripId);
      const [tSnap, depSnap, org] = await Promise.all([
        tx.get(tRef),
        tx.get(db().collection(T.tripDepartures).where("tripId", "==", tripId)),
        tx.get(organizerRef(orgId)),
      ]);
      const existing = new Map(depSnap.docs.map((x) => [x.id, x.data()]));
      const operator = organizerName(org.data());
      tx.set(tRef, {
        orgId,
        hostTripId: c.hostTripId,
        status: "live",
        operator,
        content: tripContent(draft),
        ...summary(draft),
        refund: draft.refund,
        publishedAt: tSnap.exists ? tSnap.data()!.publishedAt ?? now : now,
        approvedBy: actor.uid,
        version: (tSnap.exists ? (tSnap.data()!.version ?? 0) : 0) + 1,
        updatedAt: now,
      });
      const keep = new Set<string>();
      for (const dep of draft.departures) {
        keep.add(dep.id);
        const start = Timestamp.fromMillis(Date.parse(dep.start));
        const end = Timestamp.fromMillis(Date.parse(dep.end));
        const prev = existing.get(dep.id);
        if (prev) {
          const taken = (prev.seatsTaken as number) ?? 0;
          tx.update(departureRef(dep.id), {
            start, end, priceDelta: dep.priceDelta, longWeekend: dep.longWeekend,
            seatsTotal: Math.max(dep.seatsTotal, taken), updatedAt: now,
          });
        } else {
          tx.create(departureRef(dep.id), {
            tripId, orgId, start, end,
            seatsTotal: dep.seatsTotal, seatsTaken: 0, roomTaken: {},
            priceDelta: dep.priceDelta, longWeekend: dep.longWeekend,
            cancelled: false, salesClosed: false, createdAt: now, updatedAt: now,
          });
        }
      }
      // Departures dropped from the new version disappear only when nobody is on them.
      for (const [id, prev] of existing) {
        if (!keep.has(id) && ((prev.seatsTaken as number) ?? 0) === 0 && prev.cancelled !== true) tx.delete(departureRef(id));
      }
    }

    const status = c.outcome === "approved" ? "live" : c.outcome;
    tx.update(ref, {
      status,
      tripId,
      reviewerNote: c.outcome === "approved" ? null : c.note,
      decidedAt: now,
      decidedBy: actor.uid,
      version,
      updatedAt: now,
    });
    const recipient = (cur.submittedBy ?? cur.createdBy) as string | undefined;
    if (recipient) {
      notify(tx, {
        recipientUid: recipient,
        kind: "trip-decision",
        title: c.outcome === "approved" ? "Your trip is live" : c.outcome === "rejected" ? "Your trip wasn't approved" : "Your trip needs changes",
        body: c.note || `“${draft.title.trim()}” passed review and is now on sale.`,
        dedupeKey: `${c.hostTripId}:v${version}`,
        link: { type: "host-trip", id: c.hostTripId },
      });
    }
    writeAudit(tx, {
      action: "trips.reviewed", actorUid: actor.uid, actorRole: `platform:${actor.roleId}`, resourceType: "tripDraft",
      resourceId: c.hostTripId, orgId, before: { status: cur.status, version: cur.version ?? 0 },
      after: { status, version, tripId }, reason: c.note || "Trip review checks completed.",
      requestId: c.requestId, source: "operations-console",
    });
    return { hostTripId: c.hostTripId, status, tripId, version, policyVersion: TRIP_POLICY_VERSION };
  });
}
