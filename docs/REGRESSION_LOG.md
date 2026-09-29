# Regression Log

Every defect found during the production transformation, and the test that stops
it coming back. A fix without a test is not recorded as fixed.

| ID | Severity | Found by | Fixed | Regression test |
|---|---|---|---|---|
| REG-001 | High | `test/tune-retry.test.ts` | ✅ | `concurrency.test.ts` PROOF 1 |
| REG-002 | High | `test/concurrency.test.ts` PROOF 1 | ✅ | `concurrency.test.ts` PROOF 1 |
| REG-003 | Medium | `test/tune-retry.test.ts` | ✅ | `tune-retry.test.ts` |
| REG-004 | High | Overview seat count | ✅ | `services/bookings.test.ts` (seeded confirmed bookings count as seats) |
| REG-005 | High | Code review | ✅ | `sessionOperations.test.ts` (allocation persists auto-created teams) |
| REG-006 | High | BLOCKER-006 origin (`805a0c8`) | ✅ | `liveSession.test.ts` (role ids, display names refused) |
| REG-007 | Medium | Visual review | ✅ | class renamed; crawl screenshots |
| REG-008 | Medium | Mobile crawl (`scripts/crawl.mjs`) | ✅ | `crawl.mjs` overflow check at 390 px |
| REG-009 | Medium | Seed review | ✅ | `services/create.test.ts` + migration `2026-09-29-area-capacity-covers-sessions` |
| REG-010 | High | Emulator | ✅ | `npm run test:functions` (functions load under Node 22) |

---

## REG-001 — Derived occupancy written into the lifecycle status field

**Severity:** High · **Introduced by:** this campaign · **Status:** Fixed

**Symptom:** with capacity exhausted, a booking attempt returned
`SESSION_NOT_BOOKABLE` ("This session is full…") instead of `SOLD_OUT`. Observed
in the retry sweep: all 30 losing clients reported `domain:SESSION_NOT_BOOKABLE`
where `SOLD_OUT` was expected.

**Root cause:** `reserveSeat` wrote the *derived* value `"full"` into the
session's *lifecycle* `status` field. `"full"` is not in `BOOKABLE_STATUSES`, so
on the next attempt the lifecycle gate fired **before** the capacity gate.

**Why it mattered beyond a wrong error code:** the `SOLD_OUT` branch is the only
one that offers the operator *"You can add this person to the waiting list
instead."* Routing through `SESSION_NOT_BOOKABLE` silently removed the waitlist
path — a real capability loss, not a cosmetic one. It also mirrors a modelling
flaw inherited from the prototype, where `SessionStatus` mixes lifecycle
(`draft`, `cancelled`, `completed`) with occupancy (`full`, `almost-full`).

**Fix:** the two concepts are now separate fields. `status` is the lifecycle and
is never written by the booking transaction; `occupancyStatus` is derived and
written on every counter change. Documented in ADR-0002 §3.

**Regression test:** `concurrency.test.ts` PROOF 1 asserts, after a session
fills, that `occupancyStatus === "full"` **and** `status === "booking-open"`, and
that the losing client receives `SOLD_OUT`.

---

## REG-002 — `Firestore.settings()` race crashed the data layer

**Severity:** High · **Introduced by:** this campaign · **Status:** Fixed

**Symptom:** intermittent
`UNEXPECTED: Firestore has already been initialized. You can only call
settings() once, and only before calling any other methods on a Firestore
object.` Under concurrency this surfaced as a failed booking.

**Root cause:** `platform/firestore.ts` called `instance.settings(...)` lazily on
first use of `db()`. Firestore permits `settings()` at most once per instance and
only before any other call. Any other code path touching Firestore first — a
trigger, a second Admin app, a test harness — made `db()` throw.

**Production severity:** this would take down any function whose cold start
happened to lose the race, and it is load-dependent, so it would appear in
production and not in casual local testing.

**Fix:** configuration is now best-effort and never fatal — the flag is a
convenience, not a correctness requirement, so losing the race is harmless while
crashing on it is not.

**Measured side effect:** PROOF 2 (capacity 10, 40 clients) fell from **80,079 ms
to 8,015 ms** once fixed. The thrown error had been driving transaction retries,
so the crash was also the dominant latency cost.

**Regression test:** `concurrency.test.ts` PROOF 1 runs with a second Admin app
already initialised, which is exactly the losing-race condition.

---

## REG-003 — Transaction retry budget set by assumption, not measurement

**Severity:** Medium · **Introduced by:** this campaign · **Status:** Fixed

**Symptom:** `MAX_TRANSACTION_ATTEMPTS = 25` was chosen on the reasoning that a
hot document needs a generous budget. Measured wall time for a 40-client burst:
**110,035 ms**.

**Root cause:** the Firestore SDK backs off exponentially between attempts. A
large budget makes losing contenders climb the entire backoff ladder before
learning the session is full. Correctness is unaffected; latency is destroyed.

**Fix:** budget swept against the real transaction (5 / 10 / 20 / 40). All
budgets held the invariant — 10 booking documents, 10 holds, never 11. Settled on
**20**: every seat sold, zero lost sales, no transient error, 7,697 ms. Full
table in ADR-0002 §Measurements.

**Regression test:** `tune-retry.test.ts` re-runs the sweep and asserts that the
invariant holds at every budget and that at least one budget sells the whole
session with zero lost sales.

---

## Inherited defects — not regressions, tracked separately

The following were found in the prototype during the forensic audit and predate
this campaign. They are tracked in `BLOCKER_LOG.md`, and each will gain a
regression test as its module is migrated: BLOCKER-002 (persistence slice
mismatch), BLOCKER-003 (phantom safety roles), BLOCKER-005 (forged audit actor),
BLOCKER-006 (emergency-mode role comparison).

---

## REG-004 — Confirmed bookings counted as zero seats

**Root cause:** the seed normalised bookings to `confirmed`, while `SEAT_STATUSES` only counted `payment-confirmed`/`checked-in`. **Fix:** one canonical vocabulary with a legacy map and `seatClass()`; idempotent migration for stored workspaces.

## REG-005 — Random team allocation lost its auto-created teams

**Root cause:** teams were created on a throwaway state. **Fix:** created and assigned in one transform; migration `2026-09-29-orphan-team-assignments` repairs stored data.

## REG-006 — Emergency mode denied (display name vs role id)

**Root cause:** `805a0c8` passed `role.name`. **Fix:** the store supplies role ids; callers cannot pass them.

## REG-007 — Stray line above every eyebrow label

**Root cause:** the custom `.overline` class shared its name with Tailwind's `overline` (text-decoration) utility. **Fix:** renamed to `.eyebrow`.

## REG-008 — Pages overflowed horizontally on phones

**Root cause:** CSS grid items default to `min-width: auto`, so wide tables stretched single-column grids. **Fix:** grids default to `grid-cols-1` and `fr` tracks use `minmax(0, …)`; filter rails scroll.

## REG-009 — Sessions larger than their playing area

**Root cause:** seed areas (4 seats) hosted 12–16-seat sessions. **Fix:** seed corrected, repair migration added, and `createSession` now refuses capacity above the area.

## REG-010 — Functions emulator loaded no functions

**Root cause:** `engines.node` was 24, which firebase-tools 13 rejects. **Fix:** Node 22.
