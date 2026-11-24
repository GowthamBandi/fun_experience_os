/**
 * Trip bookings: reserve → pay (Razorpay) → confirm → balance → cancel/refund.
 *
 * Seats and room-type beds are counted on the departure (`seatsTaken`,
 * `roomTaken`) and taken at RESERVATION, while the booking is `held` for
 * HOLD_MINUTES. The client never supplies an amount: the quote is computed
 * here from the published trip, and payment is confirmed only by a verified
 * checkout signature or a verified webhook, both of which converge on the
 * idempotent `settleTripCapture()` (same contract as commerce/payments.ts).
 *
 * Money: trip prices are whole rupees; payment and refund documents carry
 * paise (`amountMinor`) like the rest of commerce. Every capture and refund
 * posts balanced `ledgerEntries` (commerce/ledger.ts) with `tripId` +
 * `departureId` and `eventId: null`, at the commission rate snapshotted on the
 * booking at reservation from the org's approved commercial agreement, so
 * buildSettlement pays organizers for trips exactly as for events.
 */

import { randomInt } from "node:crypto";
import type { Transaction } from "firebase-admin/firestore";
import { DomainError, notFound, precondition, soldOut } from "../platform/errors";
import { COLLECTIONS, Timestamp, db, serverNow } from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { notify } from "../platform/notify";
import { logError, logWarn } from "../platform/log";
import { assertWellFormed, docId, obj, requestId } from "../platform/callable";
import { runCommand, bool, type Json } from "../catalog/common";
import { C, CURRENCY, HOLD_MINUTES } from "../commerce/config";
import { captureLines, commissionFor, postLedger, refundLines, refundSplit, type LedgerContext } from "../commerce/ledger";
import { getPaymentProvider, verifyPaymentSignature } from "../commerce/provider";
import { raiseRiskAlert } from "../commerce/shared";
import {
  BALANCE_DUE_DAYS, DAY_MS, DIETS, MAX_TRAVELLERS_PER_BOOKING, TRAVELLER_GENDERS,
  contentOf, daysUntil, depositPerPerson, quoteTrip, refundPercent, tripReference, type TripQuote,
} from "./model";
import { T, departureRef, travellerRef, tripBookingRef, tripPaymentRef, tripRefundRef, tripRef } from "./refs";

export type TripBookingStatus = "held" | "confirmed" | "expired" | "cancelled";

export interface TripPaymentLine { label: string; amount: number; at: Timestamp; paymentId: string }

export interface TripBookingDoc {
  id: string;
  reference: string;
  customerUid: string;
  orgId: string;
  tripId: string;
  departureId: string;
  title: string;
  departureStart: Timestamp;
  status: TripBookingStatus;
  holdExpiresAt: Timestamp | null;
  travellers: number;
  roomId: string;
  addOnIds: string[];
  pickupId: string;
  dropId: string | null;
  quote: TripQuote;
  payments: TripPaymentLine[];
  /** Whole rupees captured so far. */
  paid: number;
  openPaymentId: string | null;
  refund: number | null;
  /** Commission snapshotted at reservation; a later agreement never rewrites it. */
  commissionBps: number | null;
  cancelledByOrganizer: boolean;
  people: Array<{ name: string; age: number; gender: string; diet: string | null }>;
  emergencyName: string;
  emergencyPhone: string;
  alias: string;
  checked: string[];
  /** Set by the organizer at boarding (setTripBoarding); what unlocks a trip review. */
  boardedAt?: Timestamp | null;
  boardedBy?: string | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface TripPaymentDoc {
  id: string;
  bookingId: string;
  orgId: string;
  tripId: string;
  departureId: string;
  customerUid: string;
  kind: "initial" | "balance";
  provider: "razorpay";
  providerOrderId: string | null;
  providerPaymentId: string | null;
  amountMinor: number;
  currency: string;
  status: "creating" | "created" | "captured" | "failed" | "refunded" | "partially-refunded";
  refundedMinor: number;
  /** Set at capture, when the capture is posted to the ledger. */
  commissionBps?: number | null;
  commissionMinor?: number | null;
  creatingUntil: Timestamp | null;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  capturedAt?: Timestamp | null;
}

export interface TripRefundDoc {
  id: string;
  bookingId: string;
  paymentId: string;
  orgId: string;
  tripId: string;
  customerUid: string;
  amountMinor: number;
  currency: string;
  status: "approved" | "processing" | "completed" | "failed";
  reason: "customer-cancellation" | "departure-cancelled" | "payment-orphaned" | "duplicate-capture";
  providerPaymentId: string | null;
  providerRefundId: string | null;
  lastError: string | null;
  /** False only for refunds of money that never entered the ledger (duplicate captures). */
  ledgerPosted: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

const stranger = () => notFound("We couldn't find that booking.", "Open Your trips and try again.");

function ownBooking(snap: FirebaseFirestore.DocumentSnapshot, uid: string): TripBookingDoc {
  if (!snap.exists || snap.data()!.customerUid !== uid) throw stranger();
  return snap.data() as TripBookingDoc;
}

/* ------------------------------------------------------------- commission */

const validBps = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= 10_000;

/** The org's approved commission (agreements.ts keeps at most one approved), or null. */
async function approvedCommissionBps(tx: Transaction, orgId: string): Promise<number | null> {
  const s = await tx.get(db().collection(C.commercialAgreements).where("orgId", "==", orgId).where("status", "==", "approved"));
  const valid = s.docs
    .map((d) => d.data())
    .filter((a) => validBps(a.commissionBps))
    .sort((a, b) => ((b.updatedAt as Timestamp)?.toMillis?.() ?? 0) - ((a.updatedAt as Timestamp)?.toMillis?.() ?? 0));
  return valid.length ? (valid[0]!.commissionBps as number) : null;
}

const ledgerCtx = (p: TripPaymentDoc, refundId?: string): LedgerContext => ({
  orgId: p.orgId, eventId: null, tripId: p.tripId, departureId: p.departureId, bookingId: p.bookingId, paymentId: p.id, refundId: refundId ?? null,
});

/* ------------------------------------------------------------ seat counters */

type Counters = { seatsTaken: number; roomTaken: Record<string, number> };

function release(dep: Json, roomId: string, n: number): Counters {
  const roomTaken = { ...((dep.roomTaken as Record<string, number>) ?? {}) };
  roomTaken[roomId] = Math.max(0, (roomTaken[roomId] ?? 0) - n);
  return { seatsTaken: Math.max(0, ((dep.seatsTaken as number) ?? 0) - n), roomTaken };
}

function take(dep: Json, roomId: string, n: number): Counters {
  const roomTaken = { ...((dep.roomTaken as Record<string, number>) ?? {}) };
  roomTaken[roomId] = (roomTaken[roomId] ?? 0) + n;
  return { seatsTaken: ((dep.seatsTaken as number) ?? 0) + n, roomTaken };
}

/**
 * Why [n] more travellers can't be seated in [roomId], or null when they can.
 * Plain words plus `facts` (`seatsLeft`, `bedsLeft`, `requested`) so the app
 * can offer the waitlist when the date is full, or the number that still fits.
 */
export function capacityProblem(dep: Json, room: { id: string; label: string; beds: number | null }, n: number): DomainError | null {
  const seatsLeft = Math.max(0, ((dep.seatsTotal as number) ?? 0) - ((dep.seatsTaken as number) ?? 0));
  if (seatsLeft < n) {
    return soldOut(
      seatsLeft <= 0
        ? "Someone just took the last seat on this date."
        : `Only ${seatsLeft} ${seatsLeft === 1 ? "seat is" : "seats are"} left on this date, so we couldn't hold ${n}.`,
      {
        nextStep: seatsLeft <= 0
          ? "Join the waitlist and we'll tell you the moment one opens, or pick another date."
          : `You can book ${seatsLeft === 1 ? "the last one" : `the ${seatsLeft} that are left`}, or pick another date.`,
        facts: { seatsLeft, requested: n },
      }
    );
  }
  if (room.beds !== null) {
    const taken = ((dep.roomTaken as Record<string, number>) ?? {})[room.id] ?? 0;
    const beds = Math.max(0, Math.min(room.beds - taken, seatsLeft));
    if (beds < n) {
      return soldOut(
        beds === 0
          ? `${room.label} just filled up on this date.`
          : `Only ${beds} ${room.label.toLowerCase()} ${beds === 1 ? "bed is" : "beds are"} left, so we couldn't hold ${n}.`,
        {
          nextStep: "Pick another room option — the seat price stays the same apart from the room difference.",
          facts: { seatsLeft, bedsLeft: beds, requested: n, roomId: room.id },
        }
      );
    }
  }
  return null;
}

/** Lapsed holds of other customers reclaimed inline when a date looks full (bounded, like events). */
export const TRIP_LAPSED_SCAN_LIMIT = 200;

/**
 * A departure looks full but some of its seats sit in holds that lapsed and
 * that the sweeper (every 5 minutes) hasn't released yet. Reads them inside
 * [tx] (so a concurrent sweep or payment on the same booking conflicts and
 * retries) and returns the counters with every lapsed hold released, plus
 * the bookings to expire. Only called on the short path.
 */
async function reclaimLapsedTripHolds(tx: Transaction, departureId: string, dep: Json, nowMs: number) {
  const snap = await tx.get(db().collection(T.tripBookings).where("departureId", "==", departureId).limit(TRIP_LAPSED_SCAN_LIMIT));
  let counters: Json = { ...dep };
  const lapsed: TripBookingDoc[] = [];
  for (const d of snap.docs) {
    const b = d.data() as TripBookingDoc;
    if (b.status !== "held" || !b.holdExpiresAt || b.holdExpiresAt.toMillis() > nowMs) continue;
    counters = { ...counters, ...release(counters, b.roomId, b.travellers) };
    lapsed.push(b);
  }
  return { counters, lapsed };
}

/** Keeps `tripTravellers/{departureId}__{uid}` (read access to updates) in step. */
function travellerDelta(tx: Transaction, b: Pick<TripBookingDoc, "departureId" | "customerUid" | "tripId" | "orgId">, current: Json | undefined, delta: 1 | -1) {
  const ref = travellerRef(b.departureId, b.customerUid);
  const n = Math.max(0, ((current?.bookings as number) ?? 0) + delta);
  if (n === 0) tx.delete(ref);
  else tx.set(ref, { departureId: b.departureId, tripId: b.tripId, orgId: b.orgId, uid: b.customerUid, bookings: n, updatedAt: serverNow() });
}

/* ---------------------------------------------------------- reserveTripSeats */

function parsePeople(value: unknown, n: number) {
  if (!Array.isArray(value) || value.length !== n) throw new DomainError("INVALID_INPUT", "Add details for every traveller.");
  return value.map((raw, i) => {
    const p = obj(raw);
    const name = typeof p.name === "string" ? assertWellFormed(p.name, "Name").trim() : "";
    if (name.length < 2 || name.length > 60) throw new DomainError("INVALID_INPUT", "Add each traveller's full name.");
    const age = p.age;
    if (typeof age !== "number" || !Number.isSafeInteger(age) || age < 0 || age > 120) {
      throw new DomainError("INVALID_INPUT", `Add the age of traveller ${i + 1}.`);
    }
    if (!TRAVELLER_GENDERS.includes(p.gender as never)) throw new DomainError("INVALID_INPUT", `Choose the gender of traveller ${i + 1} (for rooming).`);
    const diet = p.diet === undefined || p.diet === null ? null : String(p.diet);
    if (diet !== null && !DIETS.includes(diet as never)) throw new DomainError("INVALID_INPUT", "A meal preference isn't supported.");
    return { name, age, gender: p.gender as string, diet };
  });
}

export async function reserveTripSeatsCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const tripId = docId(d.tripId, "tripId");
  const departureId = docId(d.departureId, "departureId");
  const roomId = String(d.roomId ?? "");
  const pickupId = String(d.pickupId ?? "");
  const dropId = d.dropId === undefined || d.dropId === null ? null : String(d.dropId);
  const travellers = d.travellers;
  if (typeof travellers !== "number" || !Number.isSafeInteger(travellers) || travellers < 1 || travellers > MAX_TRAVELLERS_PER_BOOKING) {
    throw new DomainError("INVALID_INPUT", `You can book 1 to ${MAX_TRAVELLERS_PER_BOOKING} travellers.`);
  }
  const payInFullAsked = d.payInFull === undefined ? false : bool(d.payInFull, "payInFull");
  const addOnIds = Array.isArray(d.addOnIds) ? [...new Set(d.addOnIds.map(String))].slice(0, 20) : [];
  const people = parsePeople(d.people, travellers);
  const emergencyName = typeof d.emergencyName === "string" ? assertWellFormed(d.emergencyName, "Emergency contact").trim() : "";
  const emergencyPhone = typeof d.emergencyPhone === "string" ? d.emergencyPhone.trim() : "";
  if (emergencyName.length < 2 || emergencyName.length > 60) throw new DomainError("INVALID_INPUT", "Add an emergency contact name.");
  if (emergencyPhone.replace(/\D/g, "").length < 10 || emergencyPhone.length > 20 || !/^[0-9+()\s-]+$/.test(emergencyPhone)) {
    throw new DomainError("INVALID_INPUT", "Add a 10-digit emergency contact number.");
  }

  return runCommand("trips.seats-reserved", uid, rid, async (tx, now) => {
    const [tSnap, dSnap, profile] = await Promise.all([
      tx.get(tripRef(tripId)),
      tx.get(departureRef(departureId)),
      tx.get(db().collection(COLLECTIONS.publicProfiles).doc(uid)),
    ]);
    if (!tSnap.exists || tSnap.data()!.status !== "live") throw notFound("This trip isn't available any more.");
    if (!dSnap.exists || dSnap.data()!.tripId !== tripId) throw notFound("That departure isn't available any more.");
    const trip = tSnap.data()!;
    const commissionBps = await approvedCommissionBps(tx, trip.orgId as string);
    if (commissionBps === null) {
      // No agreed commercial terms → no money may move (ADR-0005).
      throw new DomainError("SESSION_NOT_BOOKABLE", "This trip isn't accepting payments right now.", {
        nextStep: "Try again later.",
        detail: { reason: "no-commission-terms" },
      });
    }
    const dep = dSnap.data()!;
    const c = contentOf(trip);
    const nowMs = now.toMillis();
    const startMs = (dep.start as Timestamp).toMillis();
    if (startMs <= nowMs) throw precondition("That departure has already left.");
    if (dep.cancelled === true) throw precondition("The organizer cancelled that departure. Pick another date.");
    if (dep.salesClosed === true) throw precondition("The organizer closed bookings for that date.", "Pick another date.");
    if (nowMs >= startMs - c.bookingCutoffDays * DAY_MS) {
      throw precondition(`Bookings for that date closed ${c.bookingCutoffDays} days before departure.`, "Pick a later date.");
    }
    for (const p of people) {
      if (p.age < c.ageMin || (c.ageMax !== null && p.age > c.ageMax)) {
        const label = c.ageMax === null ? `${c.ageMin}+` : `${c.ageMin}–${c.ageMax}`;
        throw new DomainError("NOT_ELIGIBLE", `${p.name} doesn't fit the age rule (${label}).`);
      }
      if (c.gender === "womenOnly" && p.gender !== "woman") throw new DomainError("NOT_ELIGIBLE", "This trip is for women only.");
      if (c.gender === "menOnly" && p.gender !== "man") throw new DomainError("NOT_ELIGIBLE", "This trip is for men only.");
    }
    const room = c.rooms.find((r) => r.id === roomId);
    if (!room) throw new DomainError("INVALID_INPUT", "Pick a room option.");
    if (!c.pickups.some((p) => p.id === pickupId)) throw new DomainError("INVALID_INPUT", "Pick a pickup point.");
    if (dropId !== null && !c.drops.some((p) => p.id === dropId)) throw new DomainError("INVALID_INPUT", "Pick a drop point.");
    const known = new Set(c.addOns.map((a) => a.id));
    if (addOnIds.some((a) => !known.has(a))) throw new DomainError("INVALID_INPUT", "One of the add-ons isn't offered any more.");
    let seats: Json = dep;
    let lapsed: TripBookingDoc[] = [];
    if (capacityProblem(dep, room, travellers)) {
      const r = await reclaimLapsedTripHolds(tx, departureId, dep, nowMs);
      seats = r.counters;
      lapsed = r.lapsed;
      const problem = capacityProblem(seats, room, travellers);
      if (problem) throw problem;
    }

    // The balance is due 15 days out, so later bookings pay in full.
    const payInFull = payInFullAsked || daysUntil(startMs, nowMs) <= BALANCE_DUE_DAYS;
    const quote = quoteTrip({
      room, priceDelta: (dep.priceDelta as number) ?? 0, travellers, addOns: c.addOns, addOnIds,
      depositPerPerson: depositPerPerson(c), payInFull,
    });
    if (!(quote.dueNow > 0)) throw precondition("This booking doesn't need a payment.");

    const ref = db().collection(T.tripBookings).doc();
    const alias = typeof profile.data()?.displayName === "string" ? String(profile.data()!.displayName).slice(0, 30) : "Traveller";
    const holdExpiresAt = Timestamp.fromMillis(nowMs + HOLD_MINUTES * 60_000);
    const booking: TripBookingDoc = {
      id: ref.id,
      reference: tripReference(randomInt),
      customerUid: uid,
      orgId: trip.orgId as string,
      tripId,
      departureId,
      title: c.title.trim(),
      departureStart: dep.start as Timestamp,
      status: "held",
      holdExpiresAt,
      travellers,
      roomId,
      addOnIds,
      pickupId,
      dropId,
      quote,
      payments: [],
      paid: 0,
      openPaymentId: null,
      refund: null,
      commissionBps,
      cancelledByOrganizer: false,
      people,
      emergencyName,
      emergencyPhone,
      alias,
      checked: [],
      createdAt: now,
      updatedAt: now,
    };
    for (const l of lapsed) {
      tx.update(tripBookingRef(l.id), { status: "expired", expiredAt: now, updatedAt: now });
      writeAudit(tx, {
        action: "trips.hold-expired", actorUid: "system", actorRole: "system", resourceType: "tripBooking", resourceId: l.id,
        orgId: l.orgId, before: { status: "held" }, after: { status: "expired", travellers: l.travellers, reclaimedBy: ref.id },
        reason: "Lapsed hold reclaimed inline by a new reservation.", source: "system",
      });
    }
    tx.create(ref, booking);
    tx.update(departureRef(departureId), { ...take(seats, roomId, travellers), updatedAt: now });
    writeAudit(tx, {
      action: "trips.seats-reserved", actorUid: uid, actorRole: "customer", resourceType: "tripBooking", resourceId: ref.id,
      orgId: booking.orgId, after: { tripId, departureId, travellers, roomId, totalRupees: quote.total, dueNowRupees: quote.dueNow },
      requestId: rid,
    });
    return {
      bookingId: ref.id,
      status: "held",
      reference: booking.reference,
      amountDue: quote.dueNow,
      holdExpiresAt: holdExpiresAt.toDate().toISOString(),
    };
  });
}

/* ---------------------------------------------------------- payment orders */

export interface TripOrderResult {
  paymentId: string;
  provider: "razorpay";
  providerOrderId: string;
  keyId: string;
  amountMinor: number;
  currency: string;
}

const CREATE_LEASE_MS = 30_000;

/**
 * Opens (or reuses) the Razorpay order for what [bookingId] owes now:
 * the first payment of a `held` booking ("initial"), or the remaining balance
 * of a `confirmed` one ("balance").
 */
export async function createTripOrder(uid: string, bookingId: string, purpose: "initial" | "balance"): Promise<TripOrderResult> {
  const provider = getPaymentProvider();
  const claim = await db().runTransaction(async (tx) => {
    const b = ownBooking(await tx.get(tripBookingRef(bookingId)), uid);
    const now = serverNow();
    let amount: number;
    if (purpose === "initial") {
      if (b.status === "confirmed") throw precondition("This booking is already paid.", "Open Your trips to see it.");
      if (b.status === "cancelled") {
        throw b.cancelledByOrganizer
          ? new DomainError("PRECONDITION", "The organizer cancelled this departure, so there's nothing to pay. You haven't been charged.", { nextStep: "Pick another date.", facts: { reason: "departure-cancelled" } })
          : new DomainError("PRECONDITION", "These seats were released, so there's nothing to pay. You haven't been charged.", { nextStep: "Start a new booking if seats are still available.", facts: { reason: "released" } });
      }
      if (b.status !== "held" || !b.holdExpiresAt || b.holdExpiresAt.toMillis() <= now.toMillis()) {
        throw new DomainError("PRECONDITION", "Your hold on these seats ran out, so they went back on sale. You haven't been charged.", {
          nextStep: "Start a new booking if seats are still available.",
          facts: { reason: "hold-expired" },
        });
      }
      amount = b.quote.dueNow;
    } else {
      if (b.status !== "confirmed") throw precondition("Only confirmed bookings have a balance to pay.");
      if (b.departureStart.toMillis() <= now.toMillis()) throw precondition("This trip has already started.", "Settle the balance with your trip captain.");
      amount = b.quote.total - b.paid;
      if (!(amount > 0)) throw precondition("Nothing is left to pay on this booking.");
    }
    const amountMinor = amount * 100;
    const existing = b.openPaymentId ? await tx.get(tripPaymentRef(b.openPaymentId)) : null;
    const cur = existing?.exists ? (existing.data() as TripPaymentDoc) : null;
    if (cur && cur.kind === purpose && cur.amountMinor === amountMinor) {
      if (cur.status === "created" && cur.providerOrderId) return { reuse: cur };
      if (cur.status === "creating" && cur.creatingUntil && cur.creatingUntil.toMillis() > now.toMillis()) {
        throw new DomainError("CONTENTION", "We're already setting up your payment.", { nextStep: "Try again in a few seconds." });
      }
    }
    const reuseId = cur && cur.status === "creating" && cur.kind === purpose && cur.amountMinor === amountMinor;
    const ref = reuseId ? tripPaymentRef(cur!.id) : db().collection(T.tripPayments).doc();
    const payment: TripPaymentDoc = {
      id: ref.id,
      bookingId,
      orgId: b.orgId,
      tripId: b.tripId,
      departureId: b.departureId,
      customerUid: uid,
      kind: purpose,
      provider: "razorpay",
      providerOrderId: null,
      providerPaymentId: null,
      amountMinor,
      currency: CURRENCY,
      status: "creating",
      refundedMinor: 0,
      creatingUntil: Timestamp.fromMillis(now.toMillis() + CREATE_LEASE_MS),
      createdAt: reuseId ? cur!.createdAt : now,
      updatedAt: now,
    };
    tx.set(ref, payment);
    tx.update(tripBookingRef(bookingId), { openPaymentId: ref.id, updatedAt: now });
    return { create: payment };
  });

  const keyId = provider.keyId();
  if ("reuse" in claim && claim.reuse) return orderResult(claim.reuse, keyId);
  const p = (claim as { create: TripPaymentDoc }).create;
  const { providerOrderId } = await provider.createOrder({
    amountMinor: p.amountMinor,
    currency: p.currency,
    receipt: p.id,
    notes: { kind: "trip", tripPaymentId: p.id, tripBookingId: p.bookingId, tripId: p.tripId },
  });
  const recorded = await db().runTransaction(async (tx) => {
    const s = await tx.get(tripPaymentRef(p.id));
    if (!s.exists) throw notFound("We couldn't find that payment.");
    const cur = s.data() as TripPaymentDoc;
    if (cur.providerOrderId) return cur;
    const now = serverNow();
    const status = cur.status === "creating" ? ("created" as const) : cur.status;
    tx.update(tripPaymentRef(p.id), { providerOrderId, status, creatingUntil: null, updatedAt: now });
    writeAudit(tx, {
      action: "trips.payment-order-created", actorUid: uid, actorRole: "customer", resourceType: "tripPayment", resourceId: p.id,
      orgId: p.orgId, after: { providerOrderId, amountMinor: p.amountMinor, bookingId: p.bookingId, kind: p.kind },
    });
    return { ...cur, providerOrderId, status, creatingUntil: null };
  });
  return orderResult(recorded, keyId);
}

function orderResult(p: TripPaymentDoc, keyId: string): TripOrderResult {
  return { paymentId: p.id, provider: "razorpay", providerOrderId: p.providerOrderId!, keyId, amountMinor: p.amountMinor, currency: p.currency };
}

/* -------------------------------------------------------- confirmTripPayment */

export async function confirmTripPaymentCommand(uid: string, input: { paymentId: string; providerPaymentId: string; providerSignature: unknown }) {
  const s = await tripPaymentRef(input.paymentId).get();
  const payment = s.exists ? (s.data() as TripPaymentDoc) : null;
  if (!payment || payment.customerUid !== uid) throw notFound("We couldn't find that payment.");
  if (!payment.providerOrderId || !verifyPaymentSignature(payment.providerOrderId, input.providerPaymentId, input.providerSignature)) {
    await db().runTransaction(async (tx) => {
      writeAudit(tx, {
        action: "trips.payment-signature-rejected", actorUid: uid, actorRole: "customer", resourceType: "tripPayment",
        resourceId: payment.id, orgId: payment.orgId, after: { providerPaymentId: input.providerPaymentId.slice(0, 64) },
      });
    });
    logWarn({ event: "security.payment-signature-rejected", uid, orgId: payment.orgId, paymentId: payment.id });
    throw new DomainError("NOT_PERMITTED", "We couldn't verify this payment.", {
      nextStep: "If money left your account, it will be confirmed automatically or refunded. Contact support if not.",
    });
  }
  const out = await settleTripCapture({
    paymentId: payment.id,
    providerOrderId: payment.providerOrderId,
    providerPaymentId: input.providerPaymentId,
    amountMinor: payment.amountMinor,
    currency: payment.currency,
    source: "client",
  });
  if (out.outcome === "amount-mismatch" || out.outcome === "order-mismatch") {
    throw precondition("We couldn't confirm this payment automatically.", "Our team has been alerted and will contact you.");
  }
  return { bookingId: out.bookingId, status: out.bookingStatus, outcome: out.outcome };
}

/* ------------------------------------------------------- settleTripCapture */

export interface TripCaptureInput {
  paymentId: string;
  providerOrderId: string | null;
  providerPaymentId: string;
  amountMinor: number;
  currency: string;
  source: "client" | "webhook";
}

export type TripSettleOutcome =
  | "confirmed" | "readmitted" | "balance-paid" | "already-settled" | "orphaned" | "duplicate-capture"
  | "amount-mismatch" | "order-mismatch";

export interface TripSettleResult { outcome: TripSettleOutcome; bookingId: string; bookingStatus: TripBookingStatus; refundIds: string[] }

function newRefund(
  id: string, p: TripPaymentDoc, amountMinor: number, reason: TripRefundDoc["reason"], ledgerPosted: boolean, providerPaymentId?: string
): TripRefundDoc {
  const now = serverNow();
  return {
    id, bookingId: p.bookingId, paymentId: p.id, orgId: p.orgId, tripId: p.tripId, customerUid: p.customerUid,
    amountMinor, currency: p.currency, status: "approved", reason,
    providerPaymentId: providerPaymentId ?? p.providerPaymentId, providerRefundId: null, lastError: null, ledgerPosted,
    createdAt: now, updatedAt: now,
  };
}

/**
 * Posts the ledger reversal of a refund of [amountMinor] against [p] (whose
 * refundedMinor is [refundedBefore]), as commerce/refundCore.ts does. A
 * payment captured before trips posted to the ledger has nothing to reverse.
 */
function postTripRefundLedger(tx: Transaction, refundId: string, p: TripPaymentDoc, refundedBefore: number, amountMinor: number): boolean {
  if (typeof p.commissionMinor !== "number") return false;
  const { commissionReversal } = refundSplit(p.amountMinor, p.commissionMinor, refundedBefore, amountMinor);
  postLedger(tx, `tref_${refundId}`, "refund", ledgerCtx(p, refundId), refundLines(amountMinor, commissionReversal), {
    txnGrossMinor: amountMinor,
    txnCommissionMinor: commissionReversal,
  });
  return true;
}

/**
 * THE capture transaction for trip payments. Idempotent: any number of client
 * confirmations and webhook deliveries settle a provider payment once.
 */
export async function settleTripCapture(input: TripCaptureInput): Promise<TripSettleResult> {
  const result = await db().runTransaction(async (tx): Promise<TripSettleResult> => {
    const pSnap = await tx.get(tripPaymentRef(input.paymentId));
    if (!pSnap.exists) throw notFound("We couldn't find that payment.");
    const payment = pSnap.data() as TripPaymentDoc;
    const bRef = tripBookingRef(payment.bookingId);
    const dupId = `dup_${input.providerPaymentId}`.slice(0, 120);
    const [bSnap, dSnap, tvSnap, dupSnap] = await Promise.all([
      tx.get(bRef),
      tx.get(departureRef(payment.departureId)),
      tx.get(travellerRef(payment.departureId, payment.customerUid)),
      tx.get(tripRefundRef(dupId)),
    ]);
    if (!bSnap.exists || !dSnap.exists) throw notFound("We couldn't find that booking.");
    const b = bSnap.data() as TripBookingDoc;
    const dep = dSnap.data()!;
    const now = serverNow();
    const base = { bookingId: b.id, bookingStatus: b.status };

    if (payment.status === "captured" || payment.status === "refunded" || payment.status === "partially-refunded") {
      if (payment.providerPaymentId === input.providerPaymentId) return { ...base, outcome: "already-settled", refundIds: [] };
      if (dupSnap.exists) return { ...base, outcome: "duplicate-capture", refundIds: [dupId] };
      // The second charge never entered the ledger, so its refund is ledger-neutral.
      tx.create(tripRefundRef(dupId), newRefund(dupId, payment, input.amountMinor, "duplicate-capture", false, input.providerPaymentId));
      raiseRiskAlert(tx, `dup-capture_${input.providerPaymentId}`, {
        kind: "payment-duplicate-capture", severity: "medium", orgId: payment.orgId,
        summary: "A trip payment order was paid twice; the second payment is being refunded.",
        detail: { tripPaymentId: payment.id, providerPaymentId: input.providerPaymentId, amountMinor: input.amountMinor },
      });
      return { ...base, outcome: "duplicate-capture", refundIds: [dupId] };
    }
    if (input.amountMinor !== payment.amountMinor || input.currency !== payment.currency) {
      raiseRiskAlert(tx, `amount-mismatch_${input.providerPaymentId}`, {
        kind: "payment-amount-mismatch", severity: "high", orgId: payment.orgId,
        summary: "A captured trip payment did not match the amount owed. The booking was NOT updated.",
        detail: { tripPaymentId: payment.id, expectedMinor: payment.amountMinor, receivedMinor: input.amountMinor, receivedCurrency: input.currency },
      });
      tx.update(tripPaymentRef(payment.id), { riskFlag: "amount-mismatch", updatedAt: now });
      return { ...base, outcome: "amount-mismatch", refundIds: [] };
    }
    if (input.providerOrderId && payment.providerOrderId && input.providerOrderId !== payment.providerOrderId) {
      raiseRiskAlert(tx, `order-mismatch_${input.providerPaymentId}`, {
        kind: "payment-order-mismatch", severity: "high", orgId: payment.orgId,
        summary: "A trip capture referenced a different provider order than the payment record.",
        detail: { tripPaymentId: payment.id, providerOrderId: input.providerOrderId, expected: payment.providerOrderId },
      });
      return { ...base, outcome: "order-mismatch", refundIds: [] };
    }

    // The booking's reservation-time snapshot is authoritative; the org's
    // current agreement is only a fallback for bookings made before snapshots.
    // Money has already moved, so a missing rate can't block the capture —
    // but it is never silent.
    const snapshotBps = validBps(b.commissionBps) ? b.commissionBps : await approvedCommissionBps(tx, payment.orgId);
    const bps = snapshotBps ?? 0;
    const commissionMinor = commissionFor(payment.amountMinor, bps);
    const captured: TripPaymentDoc = {
      ...payment, status: "captured", providerPaymentId: input.providerPaymentId,
      providerOrderId: payment.providerOrderId ?? input.providerOrderId, commissionBps: bps, commissionMinor,
      creatingUntil: null, capturedAt: now, updatedAt: now,
    };
    const rupees = payment.amountMinor / 100;
    const line: TripPaymentLine = {
      label: payment.kind === "balance" ? "Balance payment" : rupees >= b.quote.total ? "Paid in full" : "Booking amount",
      amount: rupees, at: now, paymentId: payment.id,
    };
    const actor = input.source === "webhook" ? { actorUid: "razorpay", actorRole: "system", source: "webhook" as const } : { actorUid: payment.customerUid, actorRole: "customer", source: "pulse-app" as const };

    let outcome: TripSettleOutcome | null = null;
    if (payment.kind === "initial") {
      if (b.status === "held") {
        outcome = "confirmed";
      } else if (b.status === "expired" || (b.status === "cancelled" && !b.cancelledByOrganizer && b.paid === 0)) {
        // Late capture: the seats were released (by the sweeper, an inline
        // reclaim, or the customer letting the hold go). Re-admit when the
        // departure is still on and has room, and the customer hasn't booked
        // this date again meanwhile (that would charge them twice for one
        // trip); otherwise refund in full.
        const open = dep.cancelled !== true && (dep.start as Timestamp).toMillis() > now.toMillis();
        const [tSnap, mine] = await Promise.all([
          tx.get(tripRef(b.tripId)),
          tx.get(db().collection(T.tripBookings).where("customerUid", "==", b.customerUid).limit(200)),
        ]);
        const rebooked = mine.docs.some((d) => {
          const o = d.data() as TripBookingDoc;
          return o.id !== b.id && o.departureId === b.departureId &&
            (o.status === "confirmed" || (o.status === "held" && !!o.holdExpiresAt && o.holdExpiresAt.toMillis() > now.toMillis()));
        });
        const room = tSnap.exists ? contentOf(tSnap.data()!).rooms.find((r) => r.id === b.roomId) : undefined;
        if (open && !rebooked && room && !capacityProblem(dep, room, b.travellers)) {
          tx.update(departureRef(b.departureId), { ...take(dep, b.roomId, b.travellers), updatedAt: now });
          outcome = "readmitted";
        }
      }
    } else if (b.status === "confirmed" && b.quote.total - b.paid >= rupees) {
      outcome = "balance-paid";
    }

    // Every valid capture enters the ledger; an orphaned one is reversed below.
    if (snapshotBps === null) {
      raiseRiskAlert(tx, `commission-missing_${payment.id}`, {
        kind: "capture-without-commission-terms", severity: "high", orgId: payment.orgId,
        summary: "A trip payment was captured with no agreed commission on the booking or organizer; it was recorded at 0% and needs an admin correction.",
        detail: { tripPaymentId: payment.id, tripBookingId: b.id, tripId: payment.tripId, amountMinor: payment.amountMinor },
      });
    }
    postLedger(tx, `tcap_${payment.id}`, "capture", ledgerCtx(payment), captureLines(payment.amountMinor, commissionMinor), {
      txnGrossMinor: payment.amountMinor,
      txnCommissionMinor: commissionMinor,
    });

    if (outcome) {
      tx.set(tripPaymentRef(payment.id), captured);
      tx.update(bRef, {
        status: "confirmed",
        holdExpiresAt: null,
        payments: [...b.payments, line],
        paid: b.paid + rupees,
        openPaymentId: b.openPaymentId === payment.id ? null : b.openPaymentId,
        updatedAt: now,
        ...(outcome === "confirmed" || outcome === "readmitted" ? { confirmedAt: now } : {}),
      });
      if (outcome !== "balance-paid") travellerDelta(tx, b, tvSnap.data(), 1);
      // Seats were counted at reservation; touching the departure tells
      // organizer screens watching it that its manifest changed.
      if (outcome === "confirmed") tx.update(departureRef(b.departureId), { updatedAt: now });
      notify(tx, {
        recipientUid: payment.customerUid,
        kind: "trip-booking",
        title: outcome === "balance-paid" ? "Balance received" : "Your trip is booked!",
        body: outcome === "balance-paid"
          ? `₹${rupees} received for ${b.title}. You're fully paid.`
          : `${b.travellers === 1 ? "Your seat" : `Your ${b.travellers} seats`} on ${b.title} ${b.travellers === 1 ? "is" : "are"} confirmed. Booking ${b.reference}.`,
        dedupeKey: `${payment.id}`,
        link: { type: "trip-booking", id: b.id },
      });
      writeAudit(tx, {
        action: `trips.${outcome}`, ...actor, resourceType: "tripBooking", resourceId: b.id, orgId: payment.orgId,
        before: { status: b.status, paid: b.paid }, after: { status: "confirmed", paid: b.paid + rupees, tripPaymentId: payment.id, commissionMinor },
      });
      return { outcome, bookingId: b.id, bookingStatus: "confirmed", refundIds: [] };
    }

    // Orphaned: money arrived for a booking that can't take it any more
    // (cancelled, released with no room left, or already paid). Refund it all.
    const refundId = `orph_${payment.id}`;
    tx.set(tripPaymentRef(payment.id), { ...captured, refundedMinor: payment.amountMinor, status: "refunded" });
    postTripRefundLedger(tx, refundId, captured, 0, payment.amountMinor);
    tx.create(tripRefundRef(refundId), newRefund(refundId, captured, payment.amountMinor, "payment-orphaned", true));
    tx.update(bRef, { openPaymentId: b.openPaymentId === payment.id ? null : b.openPaymentId, updatedAt: now });
    notify(tx, {
      recipientUid: payment.customerUid,
      kind: "refund-update",
      title: "Payment refunded",
      body: `Your payment of ₹${rupees} for ${b.title} arrived after the booking could no longer take it. We're refunding it in full.`,
      dedupeKey: refundId,
      link: { type: "trip-booking", id: b.id },
    });
    writeAudit(tx, {
      action: "trips.payment-orphaned", ...actor, resourceType: "tripBooking", resourceId: b.id, orgId: payment.orgId,
      before: { status: b.status }, after: { refundId, amountMinor: payment.amountMinor },
    });
    return { outcome: "orphaned", bookingId: b.id, bookingStatus: b.status, refundIds: [refundId] };
  });
  for (const id of result.refundIds) await executeTripRefund(id);
  return result;
}

export async function markTripPaymentFailed(paymentId: string, reason: string): Promise<boolean> {
  return db().runTransaction(async (tx) => {
    const s = await tx.get(tripPaymentRef(paymentId));
    if (!s.exists) return false;
    const p = s.data() as TripPaymentDoc;
    if (p.status !== "created" && p.status !== "creating") return false;
    tx.update(tripPaymentRef(paymentId), { status: "failed", lastError: reason.slice(0, 200), updatedAt: serverNow() });
    return true;
  });
}

/* ------------------------------------------------------------------ refunds */

/**
 * Allocates a refund of [amountMinor] over a booking's captured payments,
 * newest first, inside [tx], posting each part's ledger reversal. From this
 * commit the money is owed back and can never be settled out. Returns the
 * refund documents created.
 */
export function allocateRefunds(
  tx: Transaction,
  payments: TripPaymentDoc[],
  amountMinor: number,
  reason: TripRefundDoc["reason"],
  tag: string
): string[] {
  let left = amountMinor;
  const ids: string[] = [];
  const now = serverNow();
  const sorted = payments
    .filter((p) => p.status === "captured" || p.status === "partially-refunded")
    .sort((a, b) => (b.capturedAt?.toMillis() ?? 0) - (a.capturedAt?.toMillis() ?? 0));
  for (const p of sorted) {
    if (left <= 0) break;
    const refundable = p.amountMinor - (p.refundedMinor ?? 0);
    const amount = Math.min(refundable, left);
    if (amount <= 0) continue;
    const id = `${tag}_${p.id}`.slice(0, 140);
    const ledgerPosted = postTripRefundLedger(tx, id, p, p.refundedMinor ?? 0, amount);
    tx.create(tripRefundRef(id), newRefund(id, p, amount, reason, ledgerPosted));
    const refunded = (p.refundedMinor ?? 0) + amount;
    tx.update(tripPaymentRef(p.id), { refundedMinor: refunded, status: refunded >= p.amountMinor ? "refunded" : "partially-refunded", updatedAt: now });
    ids.push(id);
    left -= amount;
  }
  return ids;
}

/** Sends an `approved` trip refund to the provider. Never throws (retried by the sweeper). */
export async function executeTripRefund(refundId: string): Promise<TripRefundDoc["status"] | null> {
  const snap = await tripRefundRef(refundId).get();
  if (!snap.exists) return null;
  const r = snap.data() as TripRefundDoc;
  if (r.status !== "approved" || r.providerRefundId) return r.status;
  if (!r.providerPaymentId) {
    await tripRefundRef(refundId).update({ lastError: "no-provider-payment", updatedAt: serverNow() });
    return "approved";
  }
  try {
    const out = await getPaymentProvider().refund({
      providerPaymentId: r.providerPaymentId,
      amountMinor: r.amountMinor,
      refundId,
      notes: { kind: "trip", tripRefundId: refundId, tripBookingId: r.bookingId },
    });
    const status = out.status === "processed" ? "completed" : out.status === "failed" ? "failed" : "processing";
    await db().runTransaction(async (tx) => {
      const cur = await tx.get(tripRefundRef(refundId));
      if (!cur.exists || cur.data()!.status !== "approved") return;
      tx.update(tripRefundRef(refundId), { status, providerRefundId: out.providerRefundId, lastError: null, updatedAt: serverNow() });
      writeAudit(tx, {
        action: "trips.refund-sent-to-provider", actorUid: "system", actorRole: "system", resourceType: "tripRefund",
        resourceId: refundId, orgId: r.orgId, after: { status, amountMinor: r.amountMinor }, source: "system",
      });
    });
    return status;
  } catch (e) {
    const message = String((e as Error)?.message ?? e).slice(0, 300);
    await tripRefundRef(refundId).update({ lastError: message, updatedAt: serverNow() });
    logError({ event: "refund.provider-error", refundId, orgId: r.orgId, amountMinor: r.amountMinor, error: message });
    return "approved";
  }
}

/** `refund.processed` / `refund.failed` for a trip refund. Idempotent. */
export async function completeTripRefund(refundId: string, outcome: "processed" | "failed"): Promise<"completed" | "failed" | "ignored"> {
  return db().runTransaction(async (tx) => {
    const s = await tx.get(tripRefundRef(refundId));
    if (!s.exists) return "ignored";
    const r = s.data() as TripRefundDoc;
    if (r.status !== "approved" && r.status !== "processing") return "ignored";
    const status = outcome === "processed" ? "completed" : "failed";
    tx.update(tripRefundRef(refundId), { status, updatedAt: serverNow() });
    if (status === "completed") {
      notify(tx, {
        recipientUid: r.customerUid, kind: "refund-update", title: "Refund sent",
        body: `Your refund of ₹${(r.amountMinor / 100).toFixed(0)} has been processed by the bank.`,
        dedupeKey: `${refundId}-completed`, link: { type: "trip-booking", id: r.bookingId },
      });
    } else {
      raiseRiskAlert(tx, `refund-failed_${refundId}`, {
        kind: "refund-failed", severity: "high", orgId: r.orgId,
        summary: "A trip refund failed at the payment provider and needs manual action.",
        detail: { tripRefundId: refundId, amountMinor: r.amountMinor, tripBookingId: r.bookingId },
      });
    }
    return status;
  });
}

/* --------------------------------------------------------- cancelTripBooking */

export async function cancelTripBookingCommand(uid: string, data: unknown) {
  const d = obj(data);
  const rid = requestId(d.requestId);
  const bookingId = docId(d.bookingId, "bookingId");
  const out = await runCommand("trips.booking-cancelled", uid, rid, async (tx, now) => {
    const b = ownBooking(await tx.get(tripBookingRef(bookingId)), uid);
    if (b.status === "confirmed" && b.departureStart.toMillis() <= now.toMillis()) {
      throw precondition("This trip has already started, so it can't be cancelled here.", "Talk to your trip captain.");
    }
    return cancelTripBookingInTx(tx, now, bookingId, b, {
      actorUid: uid, actorRole: "customer", cancelledBy: uid, reason: null, requestId: rid, source: "pulse-app",
    });
  });
  if (!out.replayed) for (const id of out.refundIds) await executeTripRefund(id);
  return { bookingId: out.bookingId, status: out.status, refund: out.refund, replayed: out.replayed };
}

/**
 * Cancels [b] inside [tx]: frees its seats, refunds what the trip's refund
 * policy allows for how far out the departure is, and audits it. Shared by
 * the customer's own cancellation and the unpaid-balance sweep. Returns the
 * refund ids to execute after the commit.
 */
export async function cancelTripBookingInTx(
  tx: Transaction,
  now: Timestamp,
  bookingId: string,
  b: TripBookingDoc,
  who: {
    actorUid: string;
    actorRole: string;
    cancelledBy: string;
    reason: string | null;
    requestId: string | null;
    source: "pulse-app" | "scheduler";
  }
): Promise<{ bookingId: string; status: string; refund: number; refundIds: string[] }> {
  if (b.status === "cancelled" || b.status === "expired") {
    return { bookingId, status: b.status, refund: b.refund ?? 0, refundIds: [] };
  }
  const [dSnap, tSnap, tvSnap, paySnap] = await Promise.all([
    tx.get(departureRef(b.departureId)),
    tx.get(tripRef(b.tripId)),
    tx.get(travellerRef(b.departureId, b.customerUid)),
    tx.get(db().collection(T.tripPayments).where("bookingId", "==", bookingId)),
  ]);
  const nowMs = now.toMillis();
  let refund = 0;
  let refundIds: string[] = [];
  if (b.status === "confirmed" && b.paid > 0) {
    const preset = tSnap.exists ? contentOf(tSnap.data()!).refund : "standard";
    const pct = refundPercent(preset, daysUntil(b.departureStart.toMillis(), nowMs));
    refund = Math.round((b.paid * pct) / 100);
    if (refund > 0) {
      refundIds = allocateRefunds(tx, paySnap.docs.map((x) => x.data() as TripPaymentDoc), refund * 100, "customer-cancellation", `cxl_${bookingId}`);
    }
  }
  if (dSnap.exists) tx.update(departureRef(b.departureId), { ...release(dSnap.data()!, b.roomId, b.travellers), updatedAt: now });
  if (b.status === "confirmed") travellerDelta(tx, b, tvSnap.data(), -1);
  tx.update(tripBookingRef(bookingId), {
    status: "cancelled", refund, holdExpiresAt: null, cancelledAt: now, cancelledBy: who.cancelledBy,
    cancelReason: who.reason, updatedAt: now,
  });
  writeAudit(tx, {
    action: "trips.booking-cancelled", actorUid: who.actorUid, actorRole: who.actorRole, resourceType: "tripBooking", resourceId: bookingId,
    orgId: b.orgId, before: { status: b.status, paid: b.paid }, after: { status: "cancelled", refund },
    reason: who.reason, requestId: who.requestId, source: who.source,
  });
  return { bookingId, status: "cancelled", refund, refundIds };
}

/* --------------------------------------------------------- hold sweeper */

/** Releases seats of unpaid holds past their expiry, and retries stuck refunds. */
export async function releaseExpiredTripHolds(limit = 200): Promise<{ released: number; refundsRetried: number }> {
  const now = serverNow();
  const due = await db().collection(T.tripBookings)
    .where("status", "==", "held").where("holdExpiresAt", "<=", now).limit(limit).get();
  let released = 0;
  for (const doc of due.docs) {
    const did = await db().runTransaction(async (tx) => {
      const s = await tx.get(doc.ref);
      const b = s.data() as TripBookingDoc | undefined;
      if (!b || b.status !== "held" || !b.holdExpiresAt || b.holdExpiresAt.toMillis() > Date.now()) return false;
      const dSnap = await tx.get(departureRef(b.departureId));
      const t = serverNow();
      if (dSnap.exists) tx.update(departureRef(b.departureId), { ...release(dSnap.data()!, b.roomId, b.travellers), updatedAt: t });
      tx.update(doc.ref, { status: "expired", expiredAt: t, updatedAt: t });
      return true;
    });
    if (did) released++;
  }
  const stuck = await db().collection(T.tripRefunds).where("status", "==", "approved").limit(50).get();
  for (const r of stuck.docs) await executeTripRefund(r.id);
  return { released, refundsRetried: stuck.size };
}

/** Resolves the trip payment a provider entity belongs to (notes, else order id). */
export async function resolveTripPaymentId(entity: { notes?: unknown; order_id?: unknown }): Promise<string | null> {
  const notes = (entity.notes && typeof entity.notes === "object" ? entity.notes : {}) as Record<string, unknown>;
  if (typeof notes.tripPaymentId === "string" && /^[A-Za-z0-9_-]{4,128}$/.test(notes.tripPaymentId)) {
    const s = await tripPaymentRef(notes.tripPaymentId).get();
    if (s.exists) return s.id;
  }
  if (typeof entity.order_id === "string" && entity.order_id.length > 0) {
    const q = await db().collection(T.tripPayments).where("providerOrderId", "==", entity.order_id).limit(1).get();
    if (!q.empty) return q.docs[0]!.id;
  }
  return null;
}

export async function resolveTripRefundId(entity: { notes?: unknown; id?: unknown }): Promise<string | null> {
  const notes = (entity.notes && typeof entity.notes === "object" ? entity.notes : {}) as Record<string, unknown>;
  if (typeof notes.tripRefundId === "string" && /^[A-Za-z0-9_-]{4,150}$/.test(notes.tripRefundId)) {
    const s = await tripRefundRef(notes.tripRefundId).get();
    if (s.exists) return s.id;
  }
  if (typeof entity.id === "string") {
    const q = await db().collection(T.tripRefunds).where("providerRefundId", "==", entity.id).limit(1).get();
    if (!q.empty) return q.docs[0]!.id;
  }
  return null;
}
