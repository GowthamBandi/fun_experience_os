/**
 * AUTHORITATIVE SEAT RESERVATION.
 *
 * This is the single place in the platform where a seat may be taken.
 * The browser never decides this. The Flutter Customer app will never decide
 * this. This transaction decides it.
 *
 * GUARANTEES
 *  1. NO OVERSELL. Concurrent callers cannot exceed sellable or physical
 *     capacity, because the admission decision and the counter mutation happen
 *     inside one Firestore transaction over the event document. A multi-spot
 *     request is admitted all-or-nothing (`admitSeats`).
 *  2. IDEMPOTENT. A repeated call with the same requestId returns the original
 *     result and creates nothing new. Survives client retries and double-taps.
 *  3. AUDITED. Every admitted seat writes an append-only audit event naming the
 *     acting user, resolved server-side from the verified auth token.
 *  4. ONE LIVE BOOKING PER CUSTOMER PER EVENT (customer path). Enforced inside
 *     the same transaction through the deterministic guard document
 *     `bookingLocks/{eventId}__{uid}`: two concurrent attempts by one customer
 *     both read and write it, so Firestore serialises them.
 *
 * See ADR-0002 (capacity), ADR-0003 (events are the bookable unit) and
 * ADR-0005 (customer checks, free events confirmed with tickets at once).
 */

import { Transaction, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import {
  db,
  sessionRef,
  newBookingRef,
  bookingRef,
  receiptRef,
  serverNow,
  COLLECTIONS,
} from "../platform/firestore";
import { writeAudit } from "../platform/audit";
import { DomainError, soldOut, venueFull, invalidInput } from "../platform/errors";
import {
  deriveCapacityLedger,
  admitSeats,
  applySeatReserved,
  applySeatsConfirmedDirect,
  applyHoldReleased,
  occupancyProjection,
  EMPTY_OCCUPANCY,
  MAX_SPOTS_PER_BOOKING,
  type CapacityConfig,
  type OccupancyCounters,
  type SeatRequestKind,
} from "../domain/capacity";
import { checkEligibility, type Eligibility } from "../commerce/policy";
import { issueTickets } from "../commerce/tickets";
import { bookingLockId, C, HOLD_MINUTES } from "../commerce/config";

/** Event lifecycle states that may accept a new reservation (ADR-0003). */
const BOOKABLE_STATUSES = new Set(["published"]);

/** How long a reservation holds a seat before the sweeper releases it. */
export const RESERVATION_HOLD_MINUTES = HOLD_MINUTES;

export interface ReserveSeatCommand {
  /** Client-generated idempotency key. Same key ⇒ same outcome, once. */
  requestId: string;
  eventId: string;
  /** Pseudonymous display handle. Never a legal name. */
  alias: string;
  kind: SeatRequestKind;
  /** Seats claimed by this booking, 1..4. Defaults to 1. */
  spots?: number;
  /** Resolved server-side from the verified auth token. Never client-supplied. */
  actor: { uid: string; roleId: string };
  /**
   * Customer path (PULSE app): the booking belongs to this uid, and the
   * eligibility, organizer, start-time and one-live-booking checks apply.
   */
  customerUid?: string;
  /** Where the booking originated. */
  source: "admin-console" | "customer-app" | "organizer-app";
  /** Test/tuning override for the transaction retry budget. Not client-supplied. */
  maxAttempts?: number;
}

export interface ReserveSeatResult {
  bookingId: string;
  status: "held" | "confirmed";
  holdExpiresAt: string | null;
  spots: number;
  amountMinor: number;
  currency: string;
  ticketIds: string[];
  remainingSellableCapacity: number;
  /** True when this call replayed an earlier identical request. */
  replayed: boolean;
}

/** The canonical event document (ADR-0003), fields this transaction reads. */
export interface EventDoc {
  orgId?: string;
  experienceId?: string;
  status: string;
  title?: string;
  startsAt?: Timestamp;
  endsAt?: Timestamp;
  capacity: CapacityConfig;
  occupancy?: OccupancyCounters;
  priceMinor?: number;
  currency?: string;
  eligibility?: Partial<Eligibility>;
  cancellationPolicy?: string;
}

export interface BookingDoc {
  id: string;
  orgId: string | null;
  eventId: string;
  experienceId: string | null;
  customerUid: string | null;
  alias: string;
  spots: number;
  kind: SeatRequestKind;
  bookingType: "individual" | "complimentary";
  status: "held" | "confirmed" | "expired" | "cancelled" | "payment-orphaned" | "completed";
  amountMinor: number;
  currency: string;
  holdExpiresAt: Timestamp | null;
  eligibility: { ageVerifiedOk: boolean; genderOk: boolean } | null;
  requestId: string;
  source: string;
  paymentId: string | null;
  ticketIds: string[];
  refundedMinor: number;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  createdBy: string;
}

/**
 * Retry budget for the transaction when Firestore detects that a document in
 * the read set changed before commit.
 *
 * MEASURED against this exact transaction (test/tune-retry.test.ts, capacity 10,
 * 40 concurrent clients, Firestore emulator):
 *
 *   budget   seats sold   lost sales   wall
 *      5        10/10          0        7,596 ms   (+1 transient error)
 *     10        10/10          0       54,105 ms   (outlier run)
 *     20        10/10          0        7,697 ms
 *     40        10/10          0        7,863 ms
 *
 * The invariant held at EVERY budget: 10 booking documents, 10 holds, never 11.
 * Budget only affects latency and transient-failure rate, never correctness.
 * 20 is chosen: it sold every seat with zero lost sales and no transient error,
 * and going higher bought nothing. See ADR-0002.
 */
export const MAX_TRANSACTION_ATTEMPTS = 20;

/**
 * Lapsed holds of OTHER customers reclaimed inline when capacity is short.
 * Small on purpose: it bounds the transaction's read set (and so contention);
 * the 5-minute sweeper remains the bulk mechanism.
 */
export const LAPSED_RECLAIM_LIMIT = 25;
/** Held bookings read on the short path (existing (eventId, status) index). */
export const LAPSED_SCAN_LIMIT = 100;

/** Idempotency receipts are scoped to the actor so keys can't collide across users. */
export const reserveReceiptId = (uid: string, requestId: string) => `reserveSeat_${uid}_${requestId}`;

/** Is this booking still claiming capacity for its customer? */
export function isLiveBooking(b: Pick<BookingDoc, "status" | "holdExpiresAt"> | undefined, nowMs: number): boolean {
  if (!b) return false;
  if (b.status === "confirmed") return true;
  if (b.status === "held") return !!b.holdExpiresAt && b.holdExpiresAt.toMillis() > nowMs;
  return false;
}

export async function reserveSeat(cmd: ReserveSeatCommand): Promise<ReserveSeatResult> {
  validate(cmd);
  const spots = cmd.spots ?? 1;

  const bookingDocRef = newBookingRef();
  const receipt = receiptRef(reserveReceiptId(cmd.actor.uid, cmd.requestId));
  const eventRef = sessionRef(cmd.eventId);
  const customerUid = cmd.customerUid ?? null;
  const lockRef = customerUid
    ? db().collection(C.bookingLocks).doc(bookingLockId(cmd.eventId, customerUid))
    : null;
  const safetyRef = customerUid ? db().collection(COLLECTIONS.customerSafety).doc(customerUid) : null;

  return db().runTransaction(
    async (tx: Transaction): Promise<ReserveSeatResult> => {
      /* ---- all reads first: Firestore forbids a read after a write ---- */
      const [receiptSnap, eventSnap, lockSnap, safetySnap] = await Promise.all([
        tx.get(receipt),
        tx.get(eventRef),
        lockRef ? tx.get(lockRef) : Promise.resolve(null),
        safetyRef ? tx.get(safetyRef) : Promise.resolve(null),
      ]);

      /* ---- idempotency: replay the original outcome, change nothing ---- */
      if (receiptSnap.exists) {
        const prior = receiptSnap.data() as { result?: ReserveSeatResult; error?: string };
        if (prior.error) {
          throw new DomainError(
            "CONFLICT",
            "This request was already processed and did not succeed.",
            { nextStep: "Start a new booking.", detail: { requestId: cmd.requestId } }
          );
        }
        return { ...(prior.result as ReserveSeatResult), replayed: true };
      }

      if (!eventSnap.exists) {
        throw new DomainError("SESSION_NOT_FOUND", "That event no longer exists.", {
          nextStep: "Go back and pick an event from the list.",
          detail: { eventId: cmd.eventId },
        });
      }

      const event = eventSnap.data() as EventDoc;

      if (!BOOKABLE_STATUSES.has(event.status)) {
        throw new DomainError(
          "SESSION_NOT_BOOKABLE",
          bookableRefusal(event.status),
          { nextStep: "Choose a different session.", detail: { status: event.status } }
        );
      }

      const now = serverNow();
      if (event.startsAt && event.startsAt.toMillis() <= now.toMillis()) {
        throw new DomainError("SESSION_NOT_BOOKABLE", "This event has already started, so it can't take bookings.", {
          nextStep: "Choose a different session.",
        });
      }

      // Second read round (still before any write): organizer + prior booking.
      let priorBookingRef: DocumentReference | null = null;
      let priorBooking: BookingDoc | undefined;
      let organizerStatus: string | undefined;
      if (customerUid) {
        const priorId = lockSnap?.exists ? (lockSnap.data() as { bookingId?: string }).bookingId : undefined;
        priorBookingRef = priorId ? bookingRef(priorId) : null;
        const [orgSnap, priorSnap] = await Promise.all([
          event.orgId ? tx.get(db().collection(COLLECTIONS.organizers).doc(event.orgId)) : Promise.resolve(null),
          priorBookingRef ? tx.get(priorBookingRef) : Promise.resolve(null),
        ]);
        organizerStatus = orgSnap?.exists ? (orgSnap.data() as { status?: string }).status : undefined;
        priorBooking = priorSnap?.exists ? (priorSnap.data() as BookingDoc) : undefined;
      }

      let eligibilitySnapshot: BookingDoc["eligibility"] = null;
      if (customerUid) {
        if (organizerStatus !== "active") {
          throw new DomainError("SESSION_NOT_BOOKABLE", "This organizer isn't taking bookings right now.", {
            nextStep: "Choose a different experience.",
          });
        }
        if (!event.startsAt) {
          throw new DomainError("SESSION_NOT_BOOKABLE", "This event isn't accepting bookings right now.");
        }
        const verdict = checkEligibility(
          event.eligibility,
          safetySnap?.exists ? (safetySnap.data() as { birthDate?: unknown; gender?: unknown }) : undefined,
          event.startsAt.toDate()
        );
        if (!verdict.ok) {
          throw new DomainError("NOT_ELIGIBLE", verdict.message, {
            nextStep:
              verdict.reason === "profile"
                ? "Complete your profile (birth date and gender) in the PULSE app."
                : "Browse other experiences that fit you.",
            detail: { reason: verdict.reason },
          });
        }
        eligibilitySnapshot = verdict.snapshot;
        if (isLiveBooking(priorBooking, now.toMillis())) {
          throw new DomainError("CONFLICT", "You already have a booking for this event.", {
            nextStep: "Open My bookings to see it.",
            detail: { bookingId: priorBookingRef?.id },
          });
        }
      }

      const priceMinor = event.priceMinor ?? 0;
      if (!Number.isSafeInteger(priceMinor) || priceMinor < 0) {
        throw new DomainError("SESSION_NOT_BOOKABLE", "This event isn't accepting bookings right now.", {
          detail: { reason: "bad-price" },
        });
      }
      const isComp = cmd.kind === "complimentary";
      const amountMinor = isComp ? 0 : priceMinor * spots;
      if (amountMinor > 0) {
        const commercial = await tx.get(db().collection(COLLECTIONS.eventCommercials).doc(cmd.eventId));
        const bps = commercial.data()?.commissionBps;
        if (typeof bps !== "number" || !Number.isSafeInteger(bps) || bps < 0 || bps > 10_000) {
          // No agreed commercial terms → no money may move (ADR-0005).
          throw new DomainError("SESSION_NOT_BOOKABLE", "This event isn't accepting payments right now.", {
            nextStep: "Try again later.",
            detail: { reason: "no-commission-terms" },
          });
        }
      }

      let occupancy: OccupancyCounters = { ...EMPTY_OCCUPANCY, ...(event.occupancy ?? {}) };

      // A prior hold that lapsed but hasn't been swept yet is expired here,
      // in this transaction, so its capacity is released exactly once.
      const expirePrior =
        !!priorBookingRef && priorBooking?.status === "held" && !isLiveBooking(priorBooking, now.toMillis());
      if (expirePrior) occupancy = applyHoldReleased(occupancy, priorBooking!.spots ?? 1);

      /* ---- THE NO-OVERSELL DECISION ---- */
      let admission = admitSeats(deriveCapacityLedger(event.capacity, occupancy), cmd.kind, spots);

      // Short on capacity? Other customers' holds that have lapsed but that
      // releaseExpiredHolds hasn't swept yet (it runs every 5 minutes) still
      // count as occupied. Reclaim up to LAPSED_RECLAIM_LIMIT of them here, in
      // this transaction, exactly as the sweeper would: the query read makes
      // the transaction conflict with a concurrent sweep or payment on those
      // bookings, so each hold is released exactly once. Only on the short
      // path, so a normal reservation pays no extra read.
      const reclaimed: { ref: DocumentReference; spots: number; orgId: string | null }[] = [];
      if (!admission.admitted) {
        const lapsed = await tx.get(
          db()
            .collection(COLLECTIONS.bookings)
            .where("eventId", "==", cmd.eventId)
            .where("status", "==", "held")
            .limit(LAPSED_SCAN_LIMIT)
        );
        // Served by the existing (eventId, status) index; lapsed ones are
        // picked in memory. Any beyond the scan window are left to the sweeper.
        for (const d of lapsed.docs) {
          if (reclaimed.length >= LAPSED_RECLAIM_LIMIT) break;
          if (priorBookingRef && d.id === priorBookingRef.id) continue; // already released above
          const b = d.data() as BookingDoc;
          if (b.status !== "held" || isLiveBooking(b, now.toMillis())) continue;
          occupancy = applyHoldReleased(occupancy, b.spots ?? 1);
          reclaimed.push({ ref: d.ref, spots: b.spots ?? 1, orgId: b.orgId ?? null });
        }
        if (reclaimed.length) admission = admitSeats(deriveCapacityLedger(event.capacity, occupancy), cmd.kind, spots);
      }
      if (!admission.admitted) {
        throw admission.reason === "sold-out"
          ? soldOut(admission.message)
          : venueFull(admission.message);
      }

      const confirmedNow = isComp || amountMinor === 0;
      const nextOccupancy = isComp
        ? applySeatReserved(occupancy, "complimentary", spots)
        : confirmedNow
          ? applySeatsConfirmedDirect(occupancy, spots)
          : applySeatReserved(occupancy, "sellable", spots);
      const projection = occupancyProjection(event.capacity, nextOccupancy);

      const holdExpiresAt = confirmedNow
        ? null
        : Timestamp.fromMillis(now.toMillis() + RESERVATION_HOLD_MINUTES * 60_000);

      /* ---- writes ---- */
      if (expirePrior) {
        tx.update(priorBookingRef!, { status: "expired", expiredAt: now, updatedAt: now });
      }
      for (const r of reclaimed) {
        tx.update(r.ref, { status: "expired", expiredAt: now, updatedAt: now });
        // Same audit record the sweeper writes (commerce/holds.ts).
        writeAudit(tx, {
          action: "booking.hold-expired",
          actorUid: "system",
          actorRole: "system",
          resourceType: "booking",
          resourceId: r.ref.id,
          orgId: r.orgId,
          before: { status: "held" },
          after: { status: "expired", spots: r.spots, reclaimedBy: bookingDocRef.id },
          reason: "Lapsed hold reclaimed inline by a new reservation.",
          source: "system",
        });
      }

      const ticketIds =
        confirmedNow && customerUid
          ? issueTickets(tx, {
              bookingId: bookingDocRef.id,
              eventId: cmd.eventId,
              orgId: event.orgId ?? "",
              customerUid,
              alias: cmd.alias.trim(),
              spots,
            })
          : [];

      const booking: BookingDoc = {
        id: bookingDocRef.id,
        orgId: event.orgId ?? null,
        eventId: cmd.eventId,
        experienceId: event.experienceId ?? null,
        customerUid,
        alias: cmd.alias.trim(),
        spots,
        kind: cmd.kind,
        bookingType: isComp ? "complimentary" : "individual",
        status: confirmedNow ? "confirmed" : "held",
        amountMinor,
        currency: event.currency ?? "INR",
        holdExpiresAt,
        eligibility: eligibilitySnapshot,
        requestId: cmd.requestId,
        source: cmd.source,
        paymentId: null,
        ticketIds,
        refundedMinor: 0,
        createdAt: now,
        updatedAt: now,
        createdBy: cmd.actor.uid,
      };
      tx.set(bookingDocRef, booking);

      tx.update(eventRef, { ...projection, updatedAt: now });

      if (lockRef) {
        tx.set(lockRef, {
          eventId: cmd.eventId,
          customerUid,
          bookingId: bookingDocRef.id,
          updatedAt: now,
        });
      }

      const result: ReserveSeatResult = {
        bookingId: bookingDocRef.id,
        status: booking.status as "held" | "confirmed",
        holdExpiresAt: holdExpiresAt ? holdExpiresAt.toDate().toISOString() : null,
        spots,
        amountMinor,
        currency: booking.currency,
        ticketIds,
        remainingSellableCapacity: projection.remainingSellableCapacity,
        replayed: false,
      };

      writeAudit(tx, {
        action: "booking.seat-reserved",
        actorUid: cmd.actor.uid,
        actorRole: cmd.actor.roleId,
        resourceType: "booking",
        resourceId: bookingDocRef.id,
        orgId: event.orgId ?? null,
        after: { status: result.status, kind: cmd.kind, spots, eventId: cmd.eventId, amountMinor },
        requestId: cmd.requestId,
        source: cmd.source === "admin-console" ? "operations-console" : "pulse-app",
      });

      tx.set(receipt, {
        requestId: cmd.requestId,
        command: "reserveSeat",
        actorUid: cmd.actor.uid,
        result,
        at: now,
      });

      return result;
    },
    { maxAttempts: cmd.maxAttempts ?? MAX_TRANSACTION_ATTEMPTS }
  );
}

/* ------------------------------------------------------------------ */

function validate(cmd: ReserveSeatCommand): void {
  if (!cmd.requestId || cmd.requestId.length < 8) {
    throw invalidInput("This booking request is missing its reference. Please try again.");
  }
  if (!cmd.eventId) {
    throw invalidInput("No event was selected.");
  }
  const alias = (cmd.alias ?? "").trim();
  if (alias.length < 2 || alias.length > 40) {
    throw invalidInput("Enter a display name between 2 and 40 characters.");
  }
  if (cmd.kind !== "sellable" && cmd.kind !== "complimentary") {
    throw invalidInput("That booking type isn't recognised.");
  }
  const spots = cmd.spots ?? 1;
  if (!Number.isSafeInteger(spots) || spots < 1 || spots > MAX_SPOTS_PER_BOOKING) {
    throw invalidInput(`You can book 1 to ${MAX_SPOTS_PER_BOOKING} spots at a time.`);
  }
}

function bookableRefusal(status: string): string {
  switch (status) {
    case "full":
      return "This session is full, so no more places can be booked.";
    case "cancelled":
      return "This session was cancelled, so it can't take bookings.";
    case "completed":
      return "This session has already finished.";
    case "booking-closed":
      return "Bookings have closed for this session.";
    case "draft":
    case "submitted":
    case "approved":
      return "This session hasn't been published yet, so it can't take bookings.";
    default:
      return "This session isn't accepting bookings right now.";
  }
}

/*
 * LIFECYCLE STATUS vs OCCUPANCY STATUS — a distinction the prototype collapsed.
 *
 * `status` is the event's LIFECYCLE (ADR-0003): draft -> submitted -> approved
 * -> published -> booking-closed -> live -> completed / cancelled. A human or a
 * schedule moves it. It answers "is this event open for business?"
 *
 * `occupancyStatus` is DERIVED from the counters every time they change:
 * healthy | almost-full | full | overbooked | under-minimum. Nothing moves it
 * directly. It answers "how full is it?"
 *
 * An earlier revision wrote the derived value "full" into `status`. That made
 * the lifecycle gate shadow the capacity gate, so a sold-out session answered
 * SESSION_NOT_BOOKABLE instead of SOLD_OUT — and the operator silently lost the
 * "add to the waiting list" path that only the SOLD_OUT branch offers.
 * Caught by test/tune-retry.test.ts. Regression covered by PROOF 1 and REG-001.
 */

export { bookingRef };
