# ADR-0002 — Capacity authority and the no-oversell guarantee

- **Status:** Accepted, proven by test
- **Date:** 2026-08-22
- **Depends on:** ADR-0001
- **Proof:** `firebase/functions/test/concurrency.test.ts` — 12/12 passing

---

## Context

The platform sells limited seats on scheduled sessions. Selling the same seat
twice is the worst failure this business can have: it produces a person standing
at a venue with a paid booking and nowhere to play.

The prototype computed capacity with `sessionCapacityLedger`, which scans every
booking of a session and derives a ledger. The derivation rules are good and
were preserved. The **write path** was not: `createBookingReservation` read the
ledger, decided, then inserted — a read-modify-write, which oversells under
concurrency (proven in ADR-0001, PostgreSQL arm, oversold by 2 of 10).

Firestore offers no `CHECK` constraint, so the invariant must be held by the
transaction and proven by test.

## Decision

### 1. Occupancy counters live on the session document

`scheduledSessions/{id}` carries:

- `capacity` — static configuration (`maxPhysicalCapacity`, `blockedSlots`,
  `compSlots`, `minParticipants`, `targetParticipants`)
- `occupancy` — live counters (`activeReservationHolds`, `waitlistOfferHolds`,
  `confirmedPaidBookings`, `confirmedComplimentaryBookings`, `waitlistCount`)

**Source of truth is explicit:** the booking documents are the **ledger of
record**; `occupancy` is a **transactional projection** of them. The projection
exists because a transaction that scans N booking documents is unusable — it
would read N documents per attempt and abort whenever any unrelated booking of
the same session changed.

The projection is only ever mutated inside the same transaction that mutates the
corresponding booking. `recomputeOccupancyFromBookings()` rebuilds it from the
record and `occupancyDrift()` reports divergence; any drift is a defect.
Reconciliation is asserted after the 40-client storm in PROOF 3.

### 2. One transaction is the only way a seat may be taken

`firebase/functions/src/bookings/reserveSeat.ts` is the single write path. It
reads the session document and the idempotency receipt, applies `admitSeat()`,
and writes the booking, the updated counters, the audit event and the receipt —
atomically. No other code may create a booking.

### 3. Lifecycle status and occupancy status are separate fields

- `status` — the **lifecycle**: `draft → scheduled → booking-open →
  booking-closed → live → completed / cancelled`. Moved by a human or a schedule.
  Answers *"is this session open for business?"*
- `occupancyStatus` — **derived** from the counters on every change:
  `healthy | almost-full | full | overbooked | under-minimum`. Answers
  *"how full is it?"*

The prototype collapsed these into one field, and so did the first revision of
`reserveSeat`. See REG-001 — the consequence was that a sold-out session
answered `SESSION_NOT_BOOKABLE` instead of `SOLD_OUT`, and the operator silently
lost the "add to the waiting list" path that only the `SOLD_OUT` branch offers.

### 4. Idempotency is mandatory on every seat-taking command

Every call carries a client-generated `requestId`, recorded in
`commandReceipts/{requestId}` inside the same transaction. A repeat returns the
original result and creates nothing. This survives client retries, double-taps
and network replays. Proven in PROOF 5 and PROOF 6.

### 5. Reservation holds carry a real expiry instant

`reservationExpiresAt` is a Firestore `Timestamp`, set from the **server** clock
(`RESERVATION_HOLD_MINUTES = 15`). The prototype stored the string
`"15:00 mins"`, which can never be evaluated, so held capacity was only ever
released by an operator clicking a button. Proven in PROOF 9.

> **Open:** the sweeper that releases expired holds is not yet built. Until it
> exists, expired holds still occupy capacity. Tracked as BLOCKER-004.

## Measurements

Retry budget, measured against the real transaction — capacity 10, 40 concurrent
clients, Firestore emulator (`test/tune-retry.test.ts`):

| `maxAttempts` | Seats sold | Lost sales | Booking docs | Wall |
|---|---|---|---|---|
| 5 | 10/10 | 0 | 10 | 7,596 ms (+1 transient error) |
| 10 | 10/10 | 0 | 10 | 54,105 ms (outlier run) |
| **20** | **10/10** | **0** | **10** | **7,697 ms** |
| 40 | 10/10 | 0 | 10 | 7,863 ms |

**The invariant held at every budget — 10 documents, 10 holds, never 11.** The
budget affects latency and transient-failure rate only, never correctness.
`MAX_TRANSACTION_ATTEMPTS = 20`.

Hot-document contention, single counter vs. per-seat documents
(`test/measure-contention.mjs`):

| Design | Capacity / clients | Verdict | Wall | p95 |
|---|---|---|---|---|
| Single counter document | 1 / 2 | CORRECT | 3,176 ms | 3,176 ms |
| Single counter document | 10 / 40 | CORRECT | 12,928 ms | 12,849 ms |
| Per-seat documents | 10 / 40 | CORRECT | 7,473 ms | 7,405 ms |
| Per-seat documents | 50 / 120 | CORRECT | 44,202 ms | 43,038 ms |

Per-seat documents make capacity a *structural* invariant — only N seat
documents exist, so overselling is unrepresentable rather than merely rejected —
and are ~40% faster at capacity 10. They were **not** adopted, because:

- the single-counter design is already proven correct at every retry budget;
- sessions in this business are 4–40 seats, not 10,000, so the hot-document
  ceiling is not reached;
- per-seat documents add a seat lifecycle, per-seat release-on-expiry, and a
  sequential claim probe that scales worse at higher capacity (44 s at 50/120);
- the counter design keeps the whole ledger readable in one document read, which
  every client — including the future Flutter apps — needs on every session view.

This is recorded so the decision can be revisited on evidence if session sizes
or burst profiles change. The measurement instrument is retained.

## Consequences

- The no-oversell guarantee rests entirely on tested code, because Firestore
  offers no declarative backstop (ADR-0001). `test/concurrency.test.ts` must run
  in CI and must never be skipped.
- Every future seat-affecting operation — waitlist promotion, transfer, comp
  issue, cancellation, refund-driven release — must go through a transaction
  that mutates counters and booking together, or the projection will drift.
- Latency under a 40-way burst is ~8 s wall for the whole storm. Acceptable for
  admin-console booking. Must be re-measured before a public customer app opens
  sales on a single session.
