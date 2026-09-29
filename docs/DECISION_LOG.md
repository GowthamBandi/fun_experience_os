# Decision Log — Production Transformation

Decisions taken during the prototype→production campaign. Architecture decisions
with lasting consequence are expanded as ADRs under `docs/adr/`.

| ID | Date | Decision | Authority | Record |
|---|---|---|---|---|
| DEC-PT-001 | 2026-08-22 | Firebase / Firestore is the backend | Human | [ADR-0001](adr/ADR-0001-BACKEND-ARCHITECTURE.md) |
| DEC-PT-002 | 2026-08-22 | Occupancy counters are a transactional projection; bookings are the ledger of record | Engineering | [ADR-0002](adr/ADR-0002-CAPACITY-AND-CONCURRENCY.md) |
| DEC-PT-003 | 2026-08-22 | Single counter document, not per-seat documents | Engineering | ADR-0002 §Measurements |
| DEC-PT-004 | 2026-08-22 | `MAX_TRANSACTION_ATTEMPTS = 20`, measured | Engineering | ADR-0002, REG-003 |
| DEC-PT-005 | 2026-08-22 | Lifecycle status and occupancy status are separate fields | Engineering | ADR-0002 §3, REG-001 |
| DEC-PT-006 | 2026-08-22 | Idempotency key required on every seat-taking command | Engineering | ADR-0002 §4 |
| DEC-PT-007 | 2026-08-22 | The acting user is resolved server-side, never client-supplied | Engineering | below |
| DEC-PT-008 | 2026-08-22 | Operator-facing errors carry business language and a next step | Engineering | below |
| DEC-PT-009 | 2026-08-22 | The capacity engine is ported, not rewritten | Engineering | below |
| DEC-PT-010 | 2026-08-22 | Build against the emulator; deployment is a human gate | Engineering | below |

---

## DEC-PT-007 — The acting user is resolved server-side

**Decision:** every authoritative command derives the actor from the verified
Firebase Auth token on the server. `actor.uid` and `actor.roleId` are never read
from the request body.

**Why:** the prototype demonstrates the failure mode concretely — the participant
detail page passes `operatorId: "op-1"` and `operatorRole: "super-admin"` as
literals (BLOCKER-005), so the privileged-access audit trail records the wrong
person and the role gate is bypassed. A client that tells the server who it is
has told the server nothing.

**Enforced by:** `ReserveSeatCommand.actor` is populated by the callable wrapper
from `request.auth`, not from the payload. Asserted by PROOF 8.

---

## DEC-PT-008 — Operator-facing errors carry business language and a next step

**Decision:** every `DomainError` carries an `operatorMessage` in plain business
language and, where an action exists, a `nextStep`. Internal detail lives in
`detail` and goes to logs only. Codes and stack traces never reach the screen.

**Why:** Mission 16 makes non-technical usability an acceptance criterion, not a
polish item. "This session just sold out. No places are left." with "You can add
this person to the waiting list instead." is operable; `FAILED_PRECONDITION` is
not.

**Enforced by:** PROOF 7 asserts the exact operator message for each unbookable
lifecycle state, and asserts the message contains none of
`error|invalid|failed|constraint|null|undefined`.

---

## DEC-PT-009 — The capacity engine is ported, not rewritten

**Decision:** `sessionCapacityLedger` from
`apps/operations-web/lib/prototype/selectors/capacity.ts` is preserved as
`firebase/functions/src/domain/capacity.ts`. The derivation rules — sellable vs.
physical capacity, complimentary allocation, reservation and offer holds, fill
rate, occupancy status, break-even — are unchanged. Only the **input shape**
changed, from "scan all bookings" to "read counters", for the transactional
reasons in ADR-0002.

**Why:** this is the most valuable asset in the repository. It encodes real
operational judgement that took seven milestones to develop. Mission 2 is
explicit that it must be protected, and rewriting it would silently drop rules
nobody remembers deciding.

**Guard against drift:** `recomputeOccupancyFromBookings()` reimplements the
prototype's classification rules against the ledger of record, and
`occupancyDrift()` reports divergence from the projection. PROOF 3 asserts zero
drift after a 40-client storm.

---

## DEC-PT-010 — Build against the emulator; deployment is a human gate

**Decision:** all backend work is developed and verified against the Firebase
Emulator Suite using the `demo-experience-os` project ID. No cloud project is
created, no rules are deployed, no functions are deployed.

**Why:** BLOCKER-001 establishes that no Firebase project exists for this
platform. Creating one is an infrastructure action reserved to the human. The
emulator path is the correct development path regardless, and it keeps the entire
campaign reversible.

**Consequence:** everything this campaign delivers is verified locally and
deployable on approval, but **nothing is live**. No claim of production readiness
may rest on emulator evidence alone; the gap is recorded in
`PRODUCTION_STATUS.md`.

---

## Inherited decisions this campaign closes or supersedes

| Inherited | Status | Note |
|---|---|---|
| `DEC-SA-059` — data store deferred, provisional PostgreSQL | **Closed** | Superseded by DEC-PT-001 / ADR-0001 |
| `DEC-SA-058` — Firestore not implicitly selected | **Closed** | Firestore now explicitly selected by directive |
| `DEC-SA-060` — evidence list must be verified before approval | **Partially discharged** | The no-oversell item was executed (ADR-0001); the remaining items are moot under the directive |
| `DEC-SA-022 / 028` — no oversell; server-enforced capacity; client cannot finalize | **Now honoured** | Was aspirational in the prototype, which enforced capacity in the browser. Proven by `concurrency.test.ts` |
| `DEC-SA-029` — payment provider | **Still blocked** | BLOCKER-007 |
| `DEC-SA-037` — audited emergency access | **Partially honoured** | Audit pattern proven (PROOF 8); the identity-reveal path itself is BLOCKER-005 |
