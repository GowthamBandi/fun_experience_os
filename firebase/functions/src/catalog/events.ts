/**
 * Events: a dated occurrence of an approved experience — THE bookable unit
 * (ADR-0003). Capacity, price, venue, responsibility and lifecycle live here.
 *
 * Lifecycle: draft → submitted → approved → published → booking-closed → live
 * → completed; `cancelled` from any pre-completed state; `rejected` from
 * submitted; `changes-requested` returns to draft on the next save.
 *
 * POST-PUBLISH EDIT POLICY (decision, see report / docs):
 *  * draft / changes-requested: fully editable.
 *  * approved (not yet published): editable, but ANY save returns the event to
 *    `draft` — governance approved specific terms, so changed terms need a new
 *    approval.
 *  * submitted: locked while governance reviews it.
 *  * published / booking-closed:
 *      - if ANY booking exists (held, confirmed or completed, or non-zero
 *        occupancy counters) the commercial terms — experience, start time,
 *        duration, venue, arena, price, currency — are REFUSED; the organizer is
 *        told to cancel (full refunds) and create a new event. Customers bought
 *        a specific time/place/price; we never silently change it under them.
 *        Capacity may still change (never below seats already taken).
 *      - if NO booking exists, a change to those terms un-publishes the event
 *        back to `draft` (commission snapshot cleared) for re-approval.
 *      - description-level text lives on the experience and changes through an
 *        experience revision (approved listing unchanged until re-approved).
 *  * live / completed / cancelled / rejected: not editable.
 */

import type { Transaction } from "firebase-admin/firestore";
import { callable, docId, int, obj, oneOf, requestId, str } from "../platform/callable";
import { requirePhoneUser } from "../platform/actors";
import { requireAdmin } from "../platform/auth";
import { DomainError, precondition } from "../platform/errors";
import { COLLECTIONS, db, Timestamp } from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { requirePermission, actorRole } from "../access/permissions";
import { EMPTY_OCCUPANCY, type OccupancyCounters } from "../domain/capacity";
import { experienceRisk, type ExperienceContent } from "./experiences";
import {
  assertResponsibility, eventRef, experienceRef, iso, notFoundHere, num, organizerName, organizerRef,
  parseInstant, runCommand, uidList, type Json,
} from "./common";

export const EVENT_POLICY_VERSION = "EVENT-1.0";
const HOUR = 3600_000;
export const MIN_LEAD_MS = 2 * HOUR;
export const MAX_AHEAD_MS = 400 * 24 * HOUR;
export const LIVE_WINDOW_MS = 3 * HOUR;

const PRE_COMPLETED = ["draft", "submitted", "changes-requested", "approved", "published", "booking-closed", "live"];
const PHASE_ORDER = ["published", "booking-closed", "live", "completed"] as const;
type Phase = (typeof PHASE_ORDER)[number];

// ----------------------------------------------------------------- parsing

export interface EventInput {
  experienceId: string;
  arenaId: string | null;
  venue: { name: string; area: string; city: string; address: string; lat?: number; lng?: number };
  startsAt: Timestamp;
  durationMinutes: number;
  capacity: { max: number; min: number; blocked: number };
  priceMinor: number;
  currency: "INR";
  primaryUid: string;
  staffUids: string[];
}

export function parseEventInput(d: Json, nowMs: number): EventInput {
  const v = obj(d.venue);
  const venue: EventInput["venue"] = {
    name: str(v.name, "Venue name", 2, 100),
    area: str(v.area, "Area", 2, 80),
    city: str(v.city, "City", 2, 60),
    address: str(v.address, "Address", 5, 240),
  };
  if (v.lat !== undefined && v.lat !== null) venue.lat = num(v.lat, "Latitude", -90, 90);
  if (v.lng !== undefined && v.lng !== null) venue.lng = num(v.lng, "Longitude", -180, 180);
  if ((venue.lat === undefined) !== (venue.lng === undefined)) {
    throw new DomainError("INVALID_INPUT", "Provide both latitude and longitude, or neither.");
  }
  const startsAt = parseInstant(d.startsAt, "Start time");
  if (startsAt.toMillis() < nowMs + MIN_LEAD_MS) {
    throw new DomainError("INVALID_INPUT", "Events must start at least 2 hours from now.");
  }
  if (startsAt.toMillis() > nowMs + MAX_AHEAD_MS) {
    throw new DomainError("INVALID_INPUT", "Events can be scheduled at most about a year ahead.");
  }
  const c = obj(d.capacity);
  const max = int(c.max, "Maximum capacity", 1, 5000);
  const min = int(c.min, "Minimum participants", 1, max);
  const blocked = c.blocked === undefined || c.blocked === null ? 0 : int(c.blocked, "Blocked places", 0, max - 1);
  if (d.currency !== "INR") throw new DomainError("INVALID_INPUT", "Only INR pricing is supported.");
  const staffUids = uidList(d.staffUids, "Staff", 50);
  const primaryUid = docId(d.primaryUid, "Responsible person");
  return {
    experienceId: docId(d.experienceId, "experienceId"),
    arenaId: d.arenaId === undefined || d.arenaId === null ? null : docId(d.arenaId, "arenaId"),
    venue,
    startsAt,
    durationMinutes: int(d.durationMinutes, "Duration (minutes)", 15, 14 * 24 * 60),
    capacity: { max, min, blocked },
    priceMinor: int(d.priceMinor, "Price", 0, 10_000_000),
    currency: "INR",
    primaryUid,
    staffUids: staffUids.filter((u) => u !== primaryUid),
  };
}

// ---------------------------------------------------------------- helpers

async function loadEvent(tx: Transaction, orgId: string, eventId: string) {
  const ref = eventRef(eventId);
  const snap = await tx.get(ref);
  if (!snap.exists || snap.data()!.orgId !== orgId) throw notFoundHere("event");
  return { ref, ev: snap.data()! };
}

function occupied(o: Partial<OccupancyCounters> | undefined): number {
  const x = { ...EMPTY_OCCUPANCY, ...(o ?? {}) };
  return x.activeReservationHolds + x.waitlistOfferHolds + x.confirmedPaidBookings + x.confirmedComplimentaryBookings;
}

/** True when any live or historical paid-for claim exists on the event. */
async function hasBookings(tx: Transaction, eventId: string, ev: Json): Promise<boolean> {
  if (occupied(ev.occupancy as Partial<OccupancyCounters>) > 0) return true;
  const q = await tx.get(
    db().collection(COLLECTIONS.bookings)
      .where("eventId", "==", eventId)
      .where("status", "in", ["held", "confirmed", "completed", "payment-orphaned"])
      .limit(1)
  );
  return !q.empty;
}

const tsEq = (a: unknown, b: Timestamp) => a instanceof Timestamp && a.toMillis() === b.toMillis();

function materialChanges(ev: Json, input: EventInput): string[] {
  const out: string[] = [];
  const venue = (ev.venue ?? {}) as Json;
  if (ev.experienceId !== input.experienceId) out.push("experience");
  if (!tsEq(ev.startsAt, input.startsAt)) out.push("start time");
  if (ev.durationMinutes !== input.durationMinutes) out.push("duration");
  if ((ev.arenaId ?? null) !== input.arenaId) out.push("arena");
  if (ev.priceMinor !== input.priceMinor || ev.currency !== input.currency) out.push("price");
  for (const k of ["name", "area", "city", "address", "lat", "lng"] as const) {
    if ((venue[k] ?? null) !== (input.venue[k] ?? null)) {
      out.push("venue");
      break;
    }
  }
  return out;
}

async function loadApprovedExperience(tx: Transaction, orgId: string, experienceId: string) {
  const snap = await tx.get(experienceRef(experienceId));
  if (!snap.exists || snap.data()!.orgId !== orgId) throw notFoundHere("experience");
  const x = snap.data()!;
  if (x.status !== "approved") {
    throw precondition("Events can only be scheduled for an approved experience.", "Submit the experience for review and wait for approval.", {
      experienceStatus: x.status,
    });
  }
  return x;
}

async function assertArena(tx: Transaction, arenaId: string | null, max: number) {
  if (!arenaId) return;
  const snap = await tx.get(db().collection(COLLECTIONS.arenas).doc(arenaId));
  const a = snap.data();
  if (!snap.exists || !["approved", "active"].includes(String(a?.status))) {
    throw precondition("This venue isn't an approved arena.", "Pick an approved arena, or enter the venue details without one.");
  }
  if (typeof a!.capacity === "number" && max > a!.capacity) {
    throw precondition(`This arena is approved for at most ${a!.capacity} people.`, "Lower the capacity.");
  }
}

// ------------------------------------------------------------------- save

export async function saveEventCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const orgId = docId(d.orgId, "orgId");
  const existingId = d.eventId === undefined || d.eventId === null ? null : docId(d.eventId, "eventId");
  const input = parseEventInput(d, Date.now());

  return runCommand("catalog.event-saved", uid, rid, async (tx, now) => {
    const eventId = existingId ?? db().collection(COLLECTIONS.events).doc().id;
    // A new event has no scope yet: only owners / all-events editors create.
    const m = await requirePermission(uid, orgId, "events.edit", { tx, eventId: existingId ?? undefined });
    const orgSnap = await tx.get(organizerRef(orgId));
    if (!orgSnap.exists) throw notFoundHere("organizer");
    if (orgSnap.data()!.status === "blocked") throw precondition("This organizer is blocked and can't schedule events.", "Contact PULSE support.");

    let current: Json | null = null;
    let nextStatus = "draft";
    let unpublish = false;
    if (existingId) {
      const { ev } = await loadEvent(tx, orgId, existingId);
      current = ev;
      const changes = materialChanges(ev, input);
      switch (ev.status) {
        case "draft":
        case "changes-requested":
        case "approved":
          break;
        case "published":
        case "booking-closed": {
          if (changes.length > 0) {
            if (await hasBookings(tx, existingId, ev)) {
              throw precondition(
                `People have already booked this event, so its ${changes.join(", ")} can't be changed.`,
                "Cancel this event (everyone is refunded in full) and create a new one with the new details.",
                { changes }
              );
            }
            unpublish = true;
          } else {
            nextStatus = ev.status as string;
            const taken = occupied(ev.occupancy as Partial<OccupancyCounters>);
            if (input.capacity.max - input.capacity.blocked < taken) {
              throw precondition(`${taken} places are already taken; capacity can't go below that.`);
            }
          }
          break;
        }
        case "submitted":
          throw precondition("This event is being reviewed and can't be edited right now.", "Wait for the review decision.");
        default:
          throw precondition("This event can no longer be edited.", undefined, { status: ev.status });
      }
    }

    const x = current && current.experienceId === input.experienceId && nextStatus !== "draft"
      ? ((await tx.get(experienceRef(input.experienceId))).data() as Json)
      : await loadApprovedExperience(tx, orgId, input.experienceId);
    await assertArena(tx, input.arenaId, input.capacity.max);
    await assertResponsibility(tx, orgId, eventId, input.primaryUid, input.staffUids);

    const endsAt = Timestamp.fromMillis(input.startsAt.toMillis() + input.durationMinutes * 60_000);
    const doc: Json = {
      orgId,
      experienceId: input.experienceId,
      status: nextStatus,
      title: x.title,
      name: x.title,
      organizerName: organizerName(orgSnap.data()),
      location: `${input.venue.area}, ${input.venue.city}`,
      category: x.category,
      activity: x.activity,
      startsAt: input.startsAt,
      endsAt,
      durationMinutes: input.durationMinutes,
      venue: input.venue,
      arenaId: input.arenaId,
      capacity: {
        maxPhysicalCapacity: input.capacity.max,
        blockedSlots: input.capacity.blocked,
        compSlots: 0,
        minParticipants: input.capacity.min,
        targetParticipants: input.capacity.max - input.capacity.blocked,
      },
      priceMinor: input.priceMinor,
      currency: input.currency,
      eligibility: { ageMin: x.ageMin, ageMax: x.ageMax ?? null, genderRule: x.genderRule },
      cancellationPolicy: x.cancellationPolicy,
      responsibility: { primaryUid: input.primaryUid, staffUids: input.staffUids },
      updatedAt: now,
      updatedBy: uid,
    };
    if (!current) {
      tx.create(eventRef(eventId), {
        ...doc,
        occupancy: EMPTY_OCCUPANCY,
        commissionBps: null,
        publishedAt: null,
        governanceCaseId: null,
        version: 1,
        createdAt: now,
        createdBy: uid,
      });
    } else {
      const reset = nextStatus === "draft" ? { commissionBps: null, commercialAgreementId: null, publishedAt: null } : {};
      tx.update(eventRef(eventId), { ...doc, ...reset, version: ((current.version as number) ?? 0) + 1 });
    }
    writeAudit(tx, {
      action: unpublish ? "catalog.event-unpublished-for-edit" : "catalog.event-saved",
      actorUid: uid,
      actorRole: actorRole(m),
      resourceType: "event",
      resourceId: eventId,
      orgId,
      before: current ? { status: current.status, startsAt: iso(current.startsAt), priceMinor: current.priceMinor } : null,
      after: { status: nextStatus, startsAt: iso(input.startsAt), priceMinor: input.priceMinor, capacity: input.capacity.max },
      requestId: rid,
    });
    return { eventId, status: nextStatus };
  }, { authorize: (tx) => requirePermission(uid, orgId, "events.edit", { tx, eventId: existingId ?? undefined }) });
}

// ----------------------------------------------------------------- submit

export async function submitEventCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const orgId = docId(d.orgId, "orgId");
  const eventId = docId(d.eventId, "eventId");
  return runCommand("catalog.event-submitted", uid, rid, async (tx, now) => {
    const m = await requirePermission(uid, orgId, "events.submit", { tx, eventId });
    const { ref, ev } = await loadEvent(tx, orgId, eventId);
    if (ev.status !== "draft" && ev.status !== "changes-requested") {
      throw precondition("Only draft events can be sent for review.", undefined, { status: ev.status });
    }
    const orgSnap = await tx.get(organizerRef(orgId));
    if (!orgSnap.exists || orgSnap.data()!.status !== "active") {
      throw precondition("Your organizer account must be active to submit events.", "Contact PULSE support.");
    }
    const x = await loadApprovedExperience(tx, orgId, ev.experienceId);
    if ((ev.startsAt as Timestamp).toMillis() < now.toMillis() + MIN_LEAD_MS) {
      throw precondition("This event starts too soon to be reviewed.", "Move the start time at least 2 hours ahead.");
    }
    const resp = ev.responsibility as { primaryUid: string; staffUids: string[] };
    await assertResponsibility(tx, orgId, eventId, resp.primaryUid, resp.staffUids ?? []);
    const cap = ev.capacity as { maxPhysicalCapacity: number; blockedSlots: number };
    const sellable = cap.maxPhysicalCapacity - cap.blockedSlots;
    const xRisk = experienceRisk(x as unknown as ExperienceContent);
    const risk = xRisk === "high" ? "high" : sellable > 1000 || xRisk === "medium" ? "medium" : "low";
    const caseRef = db().collection(COLLECTIONS.governanceCases).doc();
    tx.create(caseRef, {
      kind: "event-approval",
      targetId: eventId,
      targetCollection: "events",
      subject: ev.title,
      orgId,
      organizerName: ev.organizerName,
      experienceId: ev.experienceId,
      status: "pending",
      version: 0,
      policyVersion: EVENT_POLICY_VERSION,
      risk,
      location: ev.location,
      startsAt: ev.startsAt,
      projectedGmvMinor: (ev.priceMinor as number) * sellable,
      currency: ev.currency,
      displayValue: `${sellable} places`,
      summary: `${ev.activity} on ${iso(ev.startsAt)}`,
      submittedBy: uid,
      createdAt: now,
      updatedAt: now,
    });
    tx.update(ref, { status: "submitted", submittedAt: now, governanceCaseId: caseRef.id, version: ((ev.version as number) ?? 0) + 1, updatedAt: now, updatedBy: uid });
    writeAudit(tx, {
      action: "catalog.event-submitted", actorUid: uid, actorRole: actorRole(m), resourceType: "event", resourceId: eventId, orgId,
      before: { status: ev.status }, after: { status: "submitted", governanceCaseId: caseRef.id, risk }, requestId: rid,
    });
    return { eventId, status: "submitted", caseId: caseRef.id };
  }, { authorize: (tx) => requirePermission(uid, orgId, "events.submit", { tx, eventId }) });
}

// ---------------------------------------------------------------- publish

export async function publishEventCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const orgId = docId(d.orgId, "orgId");
  const eventId = docId(d.eventId, "eventId");
  return runCommand("catalog.event-published", uid, rid, async (tx, now) => {
    const m = await requirePermission(uid, orgId, "events.publish", { tx, eventId });
    const { ref, ev } = await loadEvent(tx, orgId, eventId);
    const orgSnap = await tx.get(organizerRef(orgId));
    const xSnap = await tx.get(experienceRef(ev.experienceId));
    const agreements = await tx.get(
      db().collection(COLLECTIONS.commercialAgreements).where("orgId", "==", orgId).where("status", "==", "approved")
    );
    if (ev.status !== "approved") {
      throw precondition(
        ev.status === "published" ? "This event is already published." : "This event must be approved before it can be published.",
        ev.status === "published" ? undefined : "Submit it for review and wait for approval.",
        { status: ev.status }
      );
    }
    if (!xSnap.exists || xSnap.data()!.status !== "approved") {
      throw precondition("The experience for this event is no longer approved.", "Resolve the experience review first.");
    }
    const orgStatus = orgSnap.exists ? orgSnap.data()!.status : null;
    if (orgStatus !== "active") {
      throw precondition("Your organizer account isn't active, so events can't be published.", "Contact PULSE support.", { orgStatus });
    }
    const valid = agreements.docs
      .map((a) => ({ id: a.id, ...a.data() }) as Json & { id: string })
      .filter((a) => Number.isSafeInteger(a.commissionBps) && (a.commissionBps as number) >= 0 && (a.commissionBps as number) <= 10_000)
      .sort((a, b) => ((b.updatedAt as Timestamp)?.toMillis?.() ?? 0) - ((a.updatedAt as Timestamp)?.toMillis?.() ?? 0));
    const agreement = valid[0];
    if (!agreement) {
      throw precondition(
        "You need approved commercial terms with PULSE before publishing.",
        "Your PULSE contact will share the commission agreement; publishing unlocks once it's approved."
      );
    }
    if ((ev.startsAt as Timestamp).toMillis() <= now.toMillis()) {
      throw precondition("This event's start time has passed.", "Create a new event with a future date.");
    }
    const resp = ev.responsibility as { primaryUid: string; staffUids: string[] } | undefined;
    if (!resp?.primaryUid) throw precondition("Assign a responsible person before publishing.");
    await assertResponsibility(tx, orgId, eventId, resp.primaryUid, resp.staffUids ?? []);

    tx.update(ref, {
      status: "published",
      publishedAt: now,
      publishedBy: uid,
      commissionBps: agreement.commissionBps,
      commercialAgreementId: agreement.id,
      version: ((ev.version as number) ?? 0) + 1,
      updatedAt: now,
      updatedBy: uid,
    });
    writeAudit(tx, {
      action: "catalog.event-published", actorUid: uid, actorRole: actorRole(m), resourceType: "event", resourceId: eventId, orgId,
      before: { status: ev.status }, after: { status: "published", commissionBps: agreement.commissionBps, commercialAgreementId: agreement.id },
      requestId: rid,
    });
    return { eventId, status: "published", commissionBps: agreement.commissionBps as number, publishedAt: now.toDate().toISOString() };
  }, { authorize: (tx) => requirePermission(uid, orgId, "events.publish", { tx, eventId }) });
}

// ---------------------------------------------------------- responsibility

export async function setEventResponsibilityCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const orgId = docId(d.orgId, "orgId");
  const eventId = docId(d.eventId, "eventId");
  const primaryUid = docId(d.primaryUid, "Responsible person");
  const staffUids = uidList(d.staffUids, "Staff", 50).filter((u) => u !== primaryUid);
  return runCommand("catalog.event-responsibility-set", uid, rid, async (tx, now) => {
    const m = await requirePermission(uid, orgId, "events.edit", { tx, eventId });
    const { ref, ev } = await loadEvent(tx, orgId, eventId);
    if (["completed", "cancelled", "rejected"].includes(ev.status)) {
      throw precondition("This event is closed; its team can't be changed.", undefined, { status: ev.status });
    }
    await assertResponsibility(tx, orgId, eventId, primaryUid, staffUids);
    tx.update(ref, { responsibility: { primaryUid, staffUids }, version: ((ev.version as number) ?? 0) + 1, updatedAt: now, updatedBy: uid });
    writeAudit(tx, {
      action: "catalog.event-responsibility-set", actorUid: uid, actorRole: actorRole(m), resourceType: "event", resourceId: eventId, orgId,
      before: { responsibility: ev.responsibility ?? null }, after: { responsibility: { primaryUid, staffUids } }, requestId: rid,
    });
    return { eventId, primaryUid, staffUids };
  }, { authorize: (tx) => requirePermission(uid, orgId, "events.edit", { tx, eventId }) });
}

// ------------------------------------------------------------------ phase

export async function setEventPhaseCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const orgId = docId(d.orgId, "orgId");
  const eventId = docId(d.eventId, "eventId");
  const phase = oneOf(d.phase, "phase", ["booking-closed", "live", "completed"] as const);
  return runCommand("catalog.event-phase-set", uid, rid, async (tx, now) => {
    const m = await requirePermission(uid, orgId, "events.operate", { tx, eventId });
    const { ref, ev } = await loadEvent(tx, orgId, eventId);
    const from = PHASE_ORDER.indexOf(ev.status as Phase);
    const to = PHASE_ORDER.indexOf(phase);
    if (from < 0) throw precondition("Only published events move through these phases.", undefined, { status: ev.status });
    if (to <= from) {
      throw precondition(`This event is already ${ev.status}; phases only move forward.`, undefined, { status: ev.status, phase });
    }
    const startsMs = (ev.startsAt as Timestamp).toMillis();
    if (phase === "live" && now.toMillis() < startsMs - LIVE_WINDOW_MS) {
      throw precondition("An event can go live at most 3 hours before it starts.");
    }
    if (phase === "completed" && now.toMillis() < startsMs) {
      throw precondition("An event can only be completed after it has started.");
    }
    const stamp = { "booking-closed": "bookingClosedAt", live: "liveAt", completed: "completedAt" }[phase];
    tx.update(ref, { status: phase, [stamp]: now, version: ((ev.version as number) ?? 0) + 1, updatedAt: now, updatedBy: uid });
    writeAudit(tx, {
      action: "catalog.event-phase-set", actorUid: uid, actorRole: actorRole(m), resourceType: "event", resourceId: eventId, orgId,
      before: { status: ev.status }, after: { status: phase }, requestId: rid,
    });
    return { eventId, status: phase };
  }, { authorize: (tx) => requirePermission(uid, orgId, "events.operate", { tx, eventId }) });
}

// ----------------------------------------------------------------- cancel

async function cancelInTx(
  tx: Transaction,
  now: Timestamp,
  eventId: string,
  ev: Json,
  actor: { uid: string; role: string; by: "organizer" | "admin" },
  reason: string,
  rid: string
) {
  if (!PRE_COMPLETED.includes(ev.status as string)) {
    throw precondition(`This event is ${ev.status} and can't be cancelled.`, undefined, { status: ev.status });
  }
  const caseId = ev.governanceCaseId as string | null;
  const caseSnap = caseId && ev.status === "submitted" ? await tx.get(db().collection(COLLECTIONS.governanceCases).doc(caseId)) : null;
  tx.update(eventRef(eventId), {
    status: "cancelled",
    cancelledAt: now,
    cancelledBy: actor.uid,
    cancelledByRole: actor.by,
    cancelReason: reason,
    statusBeforeCancel: ev.status,
    version: ((ev.version as number) ?? 0) + 1,
    updatedAt: now,
    updatedBy: actor.uid,
  });
  if (caseSnap?.exists && ["pending", "under-review", "information-requested"].includes(caseSnap.data()!.status)) {
    tx.update(caseSnap.ref, { status: "cancelled", version: (caseSnap.data()!.version ?? 0) + 1, updatedAt: now, cancelReason: "Event cancelled by organizer." });
  }
  writeAudit(tx, {
    action: actor.by === "admin" ? "catalog.event-cancelled-by-admin" : "catalog.event-cancelled",
    actorUid: actor.uid, actorRole: actor.role, resourceType: "event", resourceId: eventId, orgId: ev.orgId as string,
    before: { status: ev.status }, after: { status: "cancelled" }, reason, requestId: rid,
    source: actor.by === "admin" ? "operations-console" : "pulse-app",
  });
  return { eventId, status: "cancelled" };
}

const cancelReason = (v: unknown) => str(v, "Reason", 10, 500);

export async function cancelEventCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const orgId = docId(d.orgId, "orgId");
  const eventId = docId(d.eventId, "eventId");
  const reason = cancelReason(d.reason);
  return runCommand("catalog.event-cancelled", uid, rid, async (tx, now) => {
    const m = await requirePermission(uid, orgId, "events.cancel", { tx, eventId });
    const { ev } = await loadEvent(tx, orgId, eventId);
    return cancelInTx(tx, now, eventId, ev, { uid, role: actorRole(m), by: "organizer" }, reason, rid);
  }, { authorize: (tx) => requirePermission(uid, orgId, "events.cancel", { tx, eventId }) });
}

export async function adminCancelEventCommand(admin: { uid: string; roleId: string }, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const eventId = docId(d.eventId, "eventId");
  const reason = cancelReason(d.reason);
  return runCommand("catalog.event-cancelled-by-admin", admin.uid, rid, async (tx, now) => {
    const snap = await tx.get(eventRef(eventId));
    if (!snap.exists) throw notFoundHere("event");
    return cancelInTx(tx, now, eventId, snap.data()!, { uid: admin.uid, role: `platform:${admin.roleId}`, by: "admin" }, reason, rid);
  });
}

// --------------------------------------------------------------- exports

export const saveEvent = callable(async (data, context) => saveEventCommand(requirePhoneUser(context).uid, data));
export const submitEvent = callable(async (data, context) => submitEventCommand(requirePhoneUser(context).uid, data));
export const publishEvent = callable(async (data, context) => publishEventCommand(requirePhoneUser(context).uid, data));
export const setEventResponsibility = callable(async (data, context) =>
  setEventResponsibilityCommand(requirePhoneUser(context).uid, data)
);
export const setEventPhase = callable(async (data, context) => setEventPhaseCommand(requirePhoneUser(context).uid, data));
export const cancelEvent = callable(async (data, context) => cancelEventCommand(requirePhoneUser(context).uid, data));
export const adminCancelEvent = callable(async (data, context) =>
  adminCancelEventCommand(requireAdmin(context, "cancel events"), data)
);

