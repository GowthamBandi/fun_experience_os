/**
 * Running a live trip: seats, sales, extra dates, cancelling a departure,
 * messages to travellers and the departure manifest.
 *
 * Authority is the organizer membership (ADR-0004), org-wide because a trip
 * has no event scope: `events.operate` for day-to-day changes,
 * `events.publish` to add dates, `events.cancel` to call one off and
 * `attendees.view` for the manifest (traveller names, ages and emergency
 * contacts — never exposed to co-travellers, who only ever read their own
 * booking) and `tickets.scan` to mark travellers as boarded.
 */

import { precondition } from "../platform/errors";
import { Timestamp, db } from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { notify } from "../platform/notify";
import { actorRole, requirePermission, type Permission } from "../access/permissions";
import { docId, int, obj, requestId, str } from "../platform/callable";
import { bool, notFoundHere, runCommand, type Json } from "../catalog/common";
import { DAY_MS, contentOf, parseTripDraft } from "./model";
import { allocateRefunds, executeTripRefund, type TripBookingDoc, type TripPaymentDoc } from "./bookings";
import { T, departureRef, draftRef, tripBookingRef, tripRef } from "./refs";
import type { Transaction } from "firebase-admin/firestore";

async function departureFor(tx: Transaction, orgId: string, departureId: string) {
  const snap = await tx.get(departureRef(departureId));
  if (!snap.exists || snap.data()!.orgId !== orgId) throw notFoundHere("departure");
  return snap.data()!;
}

/** Applies [patch] to the matching departure inside the host trip's stored draft. */
async function readDraftFor(tx: Transaction, tripId: string) {
  const t = await tx.get(tripRef(tripId));
  const hostTripId = t.exists ? (t.data()!.hostTripId as string | undefined) : undefined;
  if (!hostTripId) return null;
  const d = await tx.get(draftRef(hostTripId));
  return d.exists ? { ref: d.ref, data: d.data()! } : null;
}

const iso = (t: unknown) => (t instanceof Timestamp ? t.toDate().toISOString() : null);

/**
 * An idempotent organizer command. [parse] validates the payload BEFORE any
 * read, so malformed input is always INVALID_INPUT (never a permission or
 * not-found answer); authorization is re-checked on every replay.
 */
function opCommand(action: string, permission: Permission) {
  return <A, R extends Json>(
    uid: string,
    data: unknown,
    parse: (d: Json) => A,
    body: (tx: Transaction, now: Timestamp, ctx: { a: A; orgId: string; rid: string; role: string }) => Promise<R>
  ) => {
    const d = obj(data);
    const rid = requestId(d.requestId);
    const orgId = docId(d.orgId, "orgId");
    const a = parse(d);
    return runCommand(action, uid, rid, async (tx, now) => {
      const m = await requirePermission(uid, orgId, permission, { tx });
      return body(tx, now, { a, orgId, rid, role: actorRole(m) });
    }, { authorize: (tx) => requirePermission(uid, orgId, permission, { tx }) });
  };
}

// --------------------------------------------------------- setDepartureSeats

export function setDepartureSeatsCommand(uid: string, data: unknown) {
  return opCommand("trips.departure-seats-set", "events.operate")(uid, data, (d) => ({
    departureId: docId(d.departureId, "departureId"),
    seats: int(d.seats, "Seats", 1, 100),
  }), async (tx, now, { a: { departureId, seats }, orgId, rid, role }) => {
    const dep = await departureFor(tx, orgId, departureId);
    const draft = await readDraftFor(tx, dep.tripId as string);
    const taken = (dep.seatsTaken as number) ?? 0;
    if (seats < taken) throw precondition(`${taken} seats are already booked. You can't go below that.`);
    tx.update(departureRef(departureId), { seatsTotal: seats, updatedAt: now });
    if (draft) {
      const deps = ((draft.data.draft as Json)?.departures as Json[] | undefined) ?? [];
      tx.update(draft.ref, { "draft.departures": deps.map((x) => (x.id === departureId ? { ...x, seatsTotal: seats } : x)), updatedAt: now });
    }
    writeAudit(tx, {
      action: "trips.departure-seats-set", actorUid: uid, actorRole: role, resourceType: "tripDeparture", resourceId: departureId,
      orgId, before: { seatsTotal: dep.seatsTotal }, after: { seatsTotal: seats }, requestId: rid,
    });
    return { departureId, seatsTotal: seats, seatsTaken: taken };
  });
}

// ------------------------------------------------------------ setSalesClosed

export function setSalesClosedCommand(uid: string, data: unknown) {
  return opCommand("trips.sales-closed-set", "events.operate")(uid, data, (d) => ({
    departureId: docId(d.departureId, "departureId"),
    closed: bool(d.closed, "closed"),
  }), async (tx, now, { a: { departureId, closed }, orgId, rid, role }) => {
    const dep = await departureFor(tx, orgId, departureId);
    if (dep.cancelled === true) throw precondition("This departure was cancelled.");
    tx.update(departureRef(departureId), { salesClosed: closed, updatedAt: now });
    writeAudit(tx, {
      action: "trips.sales-closed-set", actorUid: uid, actorRole: role, resourceType: "tripDeparture", resourceId: departureId,
      orgId, before: { salesClosed: dep.salesClosed === true }, after: { salesClosed: closed }, requestId: rid,
    });
    return { departureId, salesClosed: closed };
  });
}

// ----------------------------------------------------------- addTripDeparture

export function addTripDepartureCommand(uid: string, data: unknown) {
  return opCommand("trips.departure-added", "events.publish")(uid, data, (d) => ({
    tripId: docId(d.tripId, "tripId"),
    // Reuse the draft parser for one departure: same id/date/seat rules.
    dep: parseTripDraft({ departures: [d.departure] }).departures[0]!,
  }), async (tx, now, { a: { tripId, dep }, orgId, rid, role }) => {
    const t = await tx.get(tripRef(tripId));
    if (!t.exists || t.data()!.orgId !== orgId) throw notFoundHere("trip");
    if (t.data()!.status !== "live") throw precondition("Dates can only be added to a live trip.");
    const c = contentOf(t.data()!);
    const startMs = Date.parse(dep.start);
    if (startMs < now.toMillis() + (c.bookingCutoffDays + 1) * DAY_MS) {
      throw precondition(`New dates must be at least ${c.bookingCutoffDays + 1} days away so people can still book.`);
    }
    if (dep.seatsTotal > c.groupMax) throw precondition(`A departure has at most ${c.groupMax} seats.`);
    const [existing, draft, already] = await Promise.all([
      tx.get(db().collection(T.tripDepartures).where("tripId", "==", tripId)),
      readDraftFor(tx, tripId),
      tx.get(departureRef(dep.id)),
    ]);
    if (already.exists) throw precondition("That departure already exists.");
    const day = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
    if (existing.docs.some((x) => x.data().cancelled !== true && day((x.data().start as Timestamp).toMillis()) === day(startMs))) {
      throw precondition("There's already a departure that day.");
    }
    tx.create(departureRef(dep.id), {
      tripId, orgId, start: Timestamp.fromMillis(startMs), end: Timestamp.fromMillis(Date.parse(dep.end)),
      seatsTotal: dep.seatsTotal, seatsTaken: 0, roomTaken: {}, priceDelta: dep.priceDelta, longWeekend: dep.longWeekend,
      cancelled: false, salesClosed: false, createdAt: now, updatedAt: now,
    });
    if (draft) {
      const deps = ((draft.data.draft as Json)?.departures as Json[] | undefined) ?? [];
      tx.update(draft.ref, { "draft.departures": [...deps, dep], departuresCount: deps.length + 1, updatedAt: now });
    }
    writeAudit(tx, {
      action: "trips.departure-added", actorUid: uid, actorRole: role, resourceType: "tripDeparture", resourceId: dep.id,
      orgId, after: { tripId, start: dep.start, seatsTotal: dep.seatsTotal }, requestId: rid,
    });
    return { departureId: dep.id, tripId };
  });
}

// ------------------------------------------------------------ cancelDeparture

export async function cancelDepartureCommand(uid: string, data: unknown) {
  const out = await opCommand("trips.departure-cancelled", "events.cancel")(uid, data, (d) => ({
    departureId: docId(d.departureId, "departureId"),
    reason: str(d.reason, "Reason", 5, 300),
  }), async (tx, now, { a: { departureId, reason }, orgId, rid, role }) => {
    const dep = await departureFor(tx, orgId, departureId);
    if (dep.cancelled === true) return { departureId, cancelled: true, bookings: 0, refundIds: [] as string[] };
    const [bookings, payments, t] = await Promise.all([
      tx.get(db().collection(T.tripBookings).where("departureId", "==", departureId)),
      tx.get(db().collection(T.tripPayments).where("departureId", "==", departureId)),
      tx.get(tripRef(dep.tripId as string)),
    ]);
    const title = t.exists ? String(t.data()!.title ?? "your trip") : "your trip";
    const byBooking = new Map<string, TripPaymentDoc[]>();
    for (const p of payments.docs) {
      const x = p.data() as TripPaymentDoc;
      byBooking.set(x.bookingId, [...(byBooking.get(x.bookingId) ?? []), x]);
    }
    const refundIds: string[] = [];
    let affected = 0;
    for (const s of bookings.docs) {
      const b = s.data() as TripBookingDoc;
      if (b.status !== "held" && b.status !== "confirmed") continue;
      affected++;
      // Everyone gets back everything they paid.
      const refund = b.status === "confirmed" ? b.paid : 0;
      if (refund > 0) refundIds.push(...allocateRefunds(tx, byBooking.get(b.id) ?? [], refund * 100, "departure-cancelled", `dc_${b.id}`));
      tx.update(s.ref, {
        status: "cancelled", refund, cancelledByOrganizer: true, holdExpiresAt: null, cancelledAt: now, cancelledBy: uid, updatedAt: now,
      });
      if (b.status === "confirmed") {
        notify(tx, {
          recipientUid: b.customerUid,
          kind: "trip-cancelled",
          title: "Your trip departure was cancelled",
          body: `The organizer cancelled ${title}: ${reason}. ${refund > 0 ? `Your ₹${refund} is being refunded in full (5–7 working days).` : ""}`.trim(),
          dedupeKey: `${departureId}:${b.id}`,
          link: { type: "trip-booking", id: b.id },
        });
      }
    }
    tx.update(departureRef(departureId), {
      cancelled: true, salesClosed: true, seatsTaken: 0, roomTaken: {}, cancelReason: reason, cancelledAt: now, updatedAt: now,
    });
    tx.create(db().collection(T.tripUpdates).doc(), {
      departureId, tripId: dep.tripId, orgId, important: true, createdAt: now, createdBy: uid,
      text: `This departure has been cancelled: ${reason}. Everyone gets a full refund in 5–7 working days.`,
    });
    writeAudit(tx, {
      action: "trips.departure-cancelled", actorUid: uid, actorRole: role, resourceType: "tripDeparture", resourceId: departureId,
      orgId, before: { cancelled: false, seatsTaken: dep.seatsTaken ?? 0 }, after: { cancelled: true, bookings: affected, refunds: refundIds.length },
      reason, requestId: rid,
    });
    return { departureId, cancelled: true, bookings: affected, refundIds };
  });
  if (!out.replayed) for (const id of out.refundIds) await executeTripRefund(id);
  return { departureId: out.departureId, cancelled: out.cancelled, bookings: out.bookings, replayed: out.replayed };
}

// -------------------------------------------------------- postDepartureUpdate

export function postDepartureUpdateCommand(uid: string, data: unknown) {
  return opCommand("trips.update-posted", "events.operate")(uid, data, (d) => ({
    departureId: docId(d.departureId, "departureId"),
    text: str(d.text, "Message", 5, 1000),
    important: d.important === undefined ? false : bool(d.important, "important"),
  }), async (tx, now, { a: { departureId, text, important }, orgId, rid, role }) => {
    const dep = await departureFor(tx, orgId, departureId);
    const travellers = await tx.get(db().collection(T.tripTravellers).where("departureId", "==", departureId));
    const ref = db().collection(T.tripUpdates).doc();
    tx.create(ref, { departureId, tripId: dep.tripId, orgId, text, important, createdAt: now, createdBy: uid });
    for (const tv of travellers.docs) {
      notify(tx, {
        recipientUid: tv.data().uid as string,
        kind: "trip-update",
        title: important ? "Important trip update" : "Trip update",
        body: text.slice(0, 240),
        dedupeKey: ref.id,
        link: { type: "trip-departure", id: departureId },
      });
    }
    writeAudit(tx, {
      action: "trips.update-posted", actorUid: uid, actorRole: role, resourceType: "tripDeparture", resourceId: departureId,
      orgId, after: { updateId: ref.id, important, recipients: travellers.size }, requestId: rid,
    });
    return { updateId: ref.id, departureId, recipients: travellers.size };
  });
}

// ------------------------------------------------------------ setTripBoarding

/** Boarding can be marked from a day before the start until reviews close. */
export const BOARDING_OPENS_MS = DAY_MS;
export const BOARDING_CLOSES_MS = 30 * DAY_MS;

/**
 * The organizer's team marks a confirmed booking as boarded (or undoes it).
 * `boardedAt` is the attendance record a trip review needs (catalog/reviews.ts
 * submitTripReview), the trip twin of a scanned event ticket.
 */
export function setTripBoardingCommand(uid: string, data: unknown) {
  return opCommand("trips.boarding-set", "tickets.scan")(uid, data, (d) => ({
    departureId: docId(d.departureId, "departureId"),
    bookingId: docId(d.bookingId, "bookingId"),
    boarded: bool(d.boarded, "boarded"),
  }), async (tx, now, { a: { departureId, bookingId, boarded }, orgId, rid, role }) => {
    const dep = await departureFor(tx, orgId, departureId);
    const bSnap = await tx.get(tripBookingRef(bookingId));
    const b = bSnap.exists ? (bSnap.data() as TripBookingDoc) : null;
    if (!b || b.orgId !== orgId || b.departureId !== departureId) throw notFoundHere("booking");
    if (b.status !== "confirmed") throw precondition("Only confirmed bookings can be marked as boarded.");
    if (dep.cancelled === true) throw precondition("This departure was cancelled.");
    const startMs = (dep.start as Timestamp).toMillis();
    const endMs = (dep.end as Timestamp).toMillis();
    if (now.toMillis() < startMs - BOARDING_OPENS_MS) throw precondition("Boarding opens 24 hours before the departure.");
    if (now.toMillis() > endMs + BOARDING_CLOSES_MS) throw precondition("Boarding can't be changed more than 30 days after the trip.");
    const was = b.boardedAt != null;
    if (was !== boarded) {
      tx.update(bSnap.ref, { boardedAt: boarded ? now : null, boardedBy: boarded ? uid : null, updatedAt: now });
    }
    writeAudit(tx, {
      action: "trips.boarding-set", actorUid: uid, actorRole: role, resourceType: "tripBooking", resourceId: bookingId,
      orgId, before: { boarded: was }, after: { boarded, departureId }, requestId: rid,
    });
    return { bookingId, boarded };
  });
}

// ------------------------------------------------------------ getTripManifest

export async function getTripManifestQuery(uid: string, data: unknown) {
  const d = obj(data);
  const orgId = docId(d.orgId, "orgId");
  const departureId = docId(d.departureId, "departureId");
  await requirePermission(uid, orgId, "attendees.view");
  const dep = await departureRef(departureId).get();
  if (!dep.exists || dep.data()!.orgId !== orgId) throw notFoundHere("departure");
  const snap = await db().collection(T.tripBookings).where("departureId", "==", departureId).limit(200).get();
  const entries = snap.docs
    .map((s) => s.data() as TripBookingDoc)
    .filter((b) => b.status === "confirmed")
    .sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis())
    .map((b) => ({
      bookingId: b.id,
      reference: b.reference,
      alias: b.alias,
      travellers: b.travellers,
      roomId: b.roomId,
      pickupId: b.pickupId,
      dropId: b.dropId,
      addOnIds: b.addOnIds,
      total: b.quote.total,
      paid: b.paid,
      people: b.people,
      emergencyName: b.emergencyName,
      emergencyPhone: b.emergencyPhone,
      boarded: b.boardedAt != null,
      bookedAt: iso(b.createdAt),
    }));
  return { departureId, tripId: dep.data()!.tripId, entries };
}
