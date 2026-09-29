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
 *     inside one Firestore transaction over the session document.
 *  2. IDEMPOTENT. A repeated call with the same requestId returns the original
 *     result and creates nothing new. Survives client retries and double-taps.
 *  3. AUDITED. Every admitted seat writes an append-only audit event naming the
 *     acting user, resolved server-side from the verified auth token.
 *
 * See ADR-0002 for why occupancy counters live on the session document.
 */

import { Transaction, Timestamp } from "firebase-admin/firestore";
import {
  db,
  sessionRef,
  newBookingRef,
  bookingRef,
  auditRef,
  receiptRef,
  serverNow,
} from "../platform/firestore";
import { DomainError, soldOut, venueFull, invalidInput } from "../platform/errors";
import {
  deriveCapacityLedger,
  admitSeat,
  applySeatReserved,
  EMPTY_OCCUPANCY,
  type CapacityConfig,
  type OccupancyCounters,
  type SeatRequestKind,
} from "../domain/capacity";

/** Session lifecycle states that may accept a new reservation. */
const BOOKABLE_STATUSES = new Set([
  "booking-open",
  "almost-full",
  "scheduled",
  "published",
]);

/** How long a reservation holds a seat before the sweeper releases it. */
export const RESERVATION_HOLD_MINUTES = 15;

export interface ReserveSeatCommand {
  /** Client-generated idempotency key. Same key ⇒ same outcome, once. */
  requestId: string;
  sessionId: string;
  /** Pseudonymous display handle. Never a legal name. */
  alias: string;
  kind: SeatRequestKind;
  /** Resolved server-side from the verified auth token. Never client-supplied. */
  actor: { uid: string; roleId: string };
  /** Where the booking originated. */
  source: "admin-console" | "customer-app" | "organizer-app";
  /** Test/tuning override for the transaction retry budget. Not client-supplied. */
  maxAttempts?: number;
}

export interface ReserveSeatResult {
  bookingId: string;
  status: "reserved" | "confirmed";
  holdExpiresAt: string;
  remainingSellableCapacity: number;
  /** True when this call replayed an earlier identical request. */
  replayed: boolean;
}

interface SessionDoc {
  status: string;
  territoryId: string;
  capacity: CapacityConfig;
  occupancy?: OccupancyCounters;
}

/**
 * Retry budget for the transaction when Firestore detects that a document in
 * the read set changed before commit.
 *
 * MEASURED, NOT GUESSED (test/measure-contention.mjs, capacity 10 / 40
 * concurrent clients against the emulator):
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

export async function reserveSeat(cmd: ReserveSeatCommand): Promise<ReserveSeatResult> {
  validate(cmd);

  const bookingDocRef = newBookingRef();
  const receipt = receiptRef(cmd.requestId);

  return db().runTransaction(
    async (tx: Transaction): Promise<ReserveSeatResult> => {
      /* ---- all reads first: Firestore forbids a read after a write ---- */
      const [receiptSnap, sessionSnap] = await Promise.all([
        tx.get(receipt),
        tx.get(sessionRef(cmd.sessionId)),
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

      if (!sessionSnap.exists) {
        throw new DomainError("SESSION_NOT_FOUND", "That session no longer exists.", {
          nextStep: "Go back and pick a session from the list.",
          detail: { sessionId: cmd.sessionId },
        });
      }

      const session = sessionSnap.data() as SessionDoc;

      if (!BOOKABLE_STATUSES.has(session.status)) {
        throw new DomainError(
          "SESSION_NOT_BOOKABLE",
          bookableRefusal(session.status),
          { nextStep: "Choose a different session.", detail: { status: session.status } }
        );
      }

      const occupancy: OccupancyCounters = { ...EMPTY_OCCUPANCY, ...(session.occupancy ?? {}) };
      const ledger = deriveCapacityLedger(session.capacity, occupancy);

      /* ---- THE NO-OVERSELL DECISION ---- */
      const admission = admitSeat(ledger, cmd.kind);
      if (!admission.admitted) {
        throw admission.reason === "sold-out"
          ? soldOut(admission.message)
          : venueFull(admission.message);
      }

      const nextOccupancy = applySeatReserved(occupancy, cmd.kind);
      const nextLedger = deriveCapacityLedger(session.capacity, nextOccupancy);

      const now = serverNow();
      const holdExpiresAt = Timestamp.fromMillis(
        now.toMillis() + RESERVATION_HOLD_MINUTES * 60_000
      );

      const isComp = cmd.kind === "complimentary";
      const result: ReserveSeatResult = {
        bookingId: bookingDocRef.id,
        status: isComp ? "confirmed" : "reserved",
        holdExpiresAt: holdExpiresAt.toDate().toISOString(),
        remainingSellableCapacity: nextLedger.remainingSellableCapacity,
        replayed: false,
      };

      /* ---- writes ---- */
      tx.set(bookingDocRef, {
        id: bookingDocRef.id,
        sessionId: cmd.sessionId,
        territoryId: session.territoryId,
        alias: cmd.alias,
        bookingType: isComp ? "complimentary" : "individual",
        reservationStatus: isComp ? "not-required" : "active",
        paymentStatus: isComp ? "confirmed" : "pending",
        status: isComp ? "confirmed" : "payment-pending",
        source: cmd.source,
        reservedAt: now,
        reservationExpiresAt: isComp ? null : holdExpiresAt,
        createdAt: now,
        updatedAt: now,
        createdBy: cmd.actor.uid,
      });

      tx.update(sessionRef(cmd.sessionId), {
        occupancy: nextOccupancy,
        // Published so every client reads the same numbers without recomputing
        // them. `status` is deliberately NOT touched here — see below.
        remainingSellableCapacity: nextLedger.remainingSellableCapacity,
        fillRate: nextLedger.fillRate,
        occupancyStatus: nextLedger.occupancyStatus,
        updatedAt: now,
      });

      tx.set(auditRef(), {
        action: "booking.seat-reserved",
        actorUid: cmd.actor.uid,
        actorRoleId: cmd.actor.roleId,
        resourceType: "booking",
        resourceId: bookingDocRef.id,
        sessionId: cmd.sessionId,
        territoryId: session.territoryId,
        after: { status: result.status, kind: cmd.kind },
        requestId: cmd.requestId,
        at: now,
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
  if (!cmd.sessionId) {
    throw invalidInput("No session was selected.");
  }
  const alias = (cmd.alias ?? "").trim();
  if (alias.length < 2 || alias.length > 40) {
    throw invalidInput("Enter a display name between 2 and 40 characters.");
  }
  if (cmd.kind !== "sellable" && cmd.kind !== "complimentary") {
    throw invalidInput("That booking type isn't recognised.");
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
      return "This session hasn't been published yet, so it can't take bookings.";
    default:
      return "This session isn't accepting bookings right now.";
  }
}

/*
 * LIFECYCLE STATUS vs OCCUPANCY STATUS — a distinction the prototype collapsed.
 *
 * `status` is the session's LIFECYCLE: draft -> scheduled -> booking-open ->
 * booking-closed -> live -> completed / cancelled. A human or a schedule moves
 * it. It answers "is this session open for business?"
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
