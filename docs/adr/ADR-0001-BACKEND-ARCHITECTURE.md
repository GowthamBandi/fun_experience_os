# ADR-0001 — Backend architecture: Firebase / Firestore

- **Status:** Accepted
- **Date:** 2026-08-22
- **Decided by:** Engineering Authority (human directive)
- **Supersedes:** `DEC-SA-059` (data store deferred, provisional Option B / PostgreSQL)

---

## Context

`docs/architecture/03-operational-data-store-evaluation.md` left the operational
data store **deferred** (`DEC-SA-059`), with a *provisional* recommendation of
Option B (PostgreSQL core, Firebase Auth/FCM at the edges), pending an evidence
phase whose first item was:

> Transactional no-oversell pattern in Firestore (document transactions,
> concurrency limits) vs. PostgreSQL (row locks).

Meanwhile `firebase/README.md` had already pre-committed the scaffold to
Firestore ("PR-0C — Domain data migration to Firestore"), and
`PROTOTYPE_TO_PRODUCTION_HANDOFF.md` instructed replacement with "real
PostgreSQL queries". Three documents disagreed.

## Decision

**Firebase is the backend. Firestore is the operational database. Firebase
Authentication is the identity provider. Server-authoritative logic runs in
Cloud Functions.**

This was directed by the Engineering Authority as a platform-level constraint,
not derived from the evidence phase. The directive is binding and the deferral
in `DEC-SA-059` is closed.

The governing reason is **platform reach, not database mechanics**: the same
backend must serve the Next.js Super Admin now and the Flutter Organizer and
Customer apps later, from one canonical domain. A relational core would have
required a bespoke API tier in front of every client before either mobile app
could exist.

## Evidence gathered before the directive

A controlled proof of the no-oversell pattern was run against **real PostgreSQL
17.10** (capacity 10, 40 concurrent connections, genuine parallelism):

| Strategy | Verdict | Wall |
|---|---|---|
| Naive read-modify-write at READ COMMITTED — *the prototype's exact shape* | **OVERSOLD by 2** | 352 ms |
| Pessimistic `SELECT … FOR UPDATE` | HOLDS | 841 ms |
| `SERIALIZABLE` + bounded retry | HOLDS | 433 ms |
| Atomic conditional `UPDATE` + `CHECK` | HOLDS | 266 ms |
| `CHECK` constraint backstop | Rejects overfill (SQLSTATE 23514) | — |

**The finding that survives the directive and matters most is the first row.**
The read-modify-write shape used by
`lib/prototype/services/bookings.ts::createBookingReservation` oversells under
concurrency. That is a property of the *shape*, not of the engine, and it would
have shipped on either backend. It is the reason `reserveSeat` exists.

The PostgreSQL workspace was deleted after the directive; no PostgreSQL
dependency remains in the repository.

## Consequences

**Accepted:**

- Firestore has **no declarative constraints**. PostgreSQL's `CHECK` gave a
  database-level backstop that refuses an illegal value even if application
  logic is wrong. Firestore has no equivalent. The invariant must therefore be
  enforced by transaction logic plus security rules, and *proven by test rather
  than guaranteed by schema*. See ADR-0002 and `test/concurrency.test.ts`.
- Firestore has a per-document sustained write ceiling (~1/sec). Hot documents
  are a real constraint on design. Measured and addressed in ADR-0002.
- Cross-entity integrity (foreign keys) is not enforced by the store. Referential
  correctness becomes the writer's responsibility, and drift becomes possible.
  Reconciliation is therefore a first-class requirement, not a nicety.
- Reporting and analytics across collections are weaker than SQL. Aggregations
  must be maintained as projections or exported.

**Gained:**

- One backend, three clients, no bespoke API tier before mobile can start.
- Security rules enforce authorization at the datastore boundary, for every
  client at once, rather than in each app.
- Managed operations: no server to run, patch, or scale for v1.

## Status of the constraint

Firestore's lack of a declarative backstop means the no-oversell guarantee rests
entirely on tested code. `test/concurrency.test.ts` is therefore **not optional
coverage — it is the constraint**. It must run in CI and must never be skipped.
