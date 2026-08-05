# 03 — Operational Data Store Evaluation

> **Status:** Planning draft — decision-resolution phase (SA-0C).
> **Document type:** Architecture decision framing.
> **This document is a planning draft.** It frames the data-store decision. **No final decision is made here**, and "Firebase" being part of the planned stack does not imply Cloud Firestore is chosen.

---

## 1. Purpose

Frame the choice of the operational data store against the platform's real requirements. The decision is **deferred** until the evidence list in §7 is verified by Claude Code or a senior engineer.

## 2. Options

| Option | Components | Character |
| --- | --- | --- |
| A | Firebase Authentication + Cloud Firestore (operational source of truth) + Cloud Functions + Firebase Cloud Messaging | Fully Firebase-managed |
| B | Firebase Authentication + Firebase Cloud Messaging + PostgreSQL (operational source of truth) + backend API + optional Firebase real-time features | Relational core with Firebase at the edges |
| C | Hybrid with clearly divided ownership | Combination, ownership explicit per domain |

## 3. Evaluation criteria

### 3.1 Fit by requirement

| Requirement | Option A (Firestore) | Option B (PostgreSQL) | Option C (Hybrid) |
| --- | --- | --- | --- |
| Limited-slot transactions (no oversell) | Transactional writes possible; concurrency semantics to verify | Strong ACID transactions | Depends on ownership split |
| Reservation expiry (timed release) | Requires scheduled jobs/triggers; verification needed | Robust via scheduled jobs + transactional release | Depends |
| Payment reconciliation | Queryable; aggregation limits to verify | Strong for joins/aggregations | Depends |
| Refund accounting | Possible; ledger-style queries to verify | Strong (relational integrity) | Depends |
| Tournament relationships | Nested collections; multi-entity queries to verify | Strong relational modeling | Depends |
| Venue and staff scheduling | Conflict queries to verify | Strong constraints + queries | Depends |
| Reporting | Aggregation limits; export patterns needed | Strong SQL reporting | Depends |
| Audit logs | Append-only docs; immutability to verify | Strong (append-only table + constraints) | Depends |
| Search and filtering | Manual/limited; third-party indexing to verify | Full-text + indexed filtering | Depends |
| Data consistency | Eventual consistency by default; verify per operation | Strong consistency | Depends |

### 3.2 Engineering criteria

| Criterion | Option A | Option B | Option C |
| --- | --- | --- | --- |
| Development speed | High within Firebase stack | Medium (backend API needed) | Medium |
| Operational complexity | Low (managed) | Medium (DB + API hosting) | Higher |
| Migration risk | Low now, but rework if switching later | Some setup effort; safer long term | Depends on split |
| Expected v1 scale | Likely fine | Likely fine | Likely fine |

> Scale note (ASM-SA-037): single city, low session count → tens of thousands of bookings, not millions. All three options plausibly handle v1 scale; the decision is about integrity and rework risk, not raw throughput.

## 4. Load-bearing requirements

These requirements most influence the choice and must be tested by the evidence phase:

1. **No oversell under concurrency** (DEC-SA-022) — atomic capacity check + reserve.
2. **Reliable reservation expiry** (DEC-SA-021) — release must not be lost.
3. **Webhook-confirmed payments** (DEC-SA-031) — idempotent, reconciled.
4. **Immutable financial/audit records** (DEC-SA-032, DEC-SA-033) — append-only integrity.
5. **Multi-entity queries** (tournament brackets, staffing schedules, reporting).
6. **Anonymity boundary** enforced in the query layer (OQ-SA-026).

## 5. Decision topics

### 5.1 No implicit Firestore selection

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Stack says "Firebase"; Firestore is one product, not the stack. |
| 2 | Options | Treat data store as an independent decision. |
| 3 | Benefits | Correctly evaluates Option B/C instead of defaulting. |
| 4 | Risks | None — decision is deferred and evidence-driven (RSK-SA-007). |
| 5 | Operational consequences | Ops tooling choices follow whatever is chosen. |
| 6 | Technical consequences | Backend build cannot start until resolved. |
| 7 | Recommended v1 decision | Keep the data-store decision open; Firebase Auth + FCM remain confirmed components (DEC-SA-061). |
| 8 | Unresolved | The core store. |
| 9 | External review | Senior engineer/Claude Code evidence phase required. |
| 10 | Decision status | **Approved — DEC-SA-058** (about framing, not store choice) |

### 5.2 Provisional recommendation

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Load-bearing requirements are transactional and relational. |
| 2 | Options | A, B, or C. |
| 3 | Benefits | B gives ACID integrity for capacity, payments, refunds, audit, tournaments and reporting; Firebase still covers auth and push. |
| 4 | Risks | Backend API adds build effort; deployment complexity (RSK-SA-007). |
| 5 | Operational consequences | A backend service must be hosted and monitored. |
| 6 | Technical consequences | PostgreSQL + API in front of the admin/app; Firebase Auth/FCM retained. |
| 7 | Recommended v1 decision | **Provisional: Option B**, pending the evidence phase. Option C is the fallback if specific real-time needs justify Firestore for parts. |
| 8 | Unresolved | Evidence verification (see §7). |
| 9 | External review | Senior engineer to verify §7 evidence before approval. |
| 10 | Decision status | **Deferred — DEC-SA-059** (provisional recommendation only) |

## 6. What must be verified before approval

Claude Code or a senior engineer must produce evidence on:

| # | Evidence item |
| --- | --- |
| 1 | Transactional no-oversell pattern in Firestore (document transactions, concurrency limits) vs. PostgreSQL (row locks). |
| 2 | Reliable reservation-expiry mechanism in each option (Cloud Functions/Scheduled + triggers vs. DB scheduler/jobs). |
| 3 | Idempotent webhook payment confirmation + reconciliation pattern in each option. |
| 4 | Append-only audit immutability achievable in each option (including admin write access). |
| 5 | Reporting: sample the core reports (`docs/admin/10-admin-analytics-and-reports.md`) against each option. |
| 6 | Tournament bracket queries: modeled against each option. |
| 7 | Search/filtering (cities, activities, sessions) without a separate search service. |
| 8 | Hosting/runtime cost estimate for v1 scale on the chosen backend (e.g., managed PostgreSQL + API hosting). |
| 9 | Migration risk if the provisional choice proves wrong mid-build. |
| 10 | Effort delta: Option B backend API vs. Option A pure-Firebase. |

## 7. Confirmed decisions (this workstream)

| ID | Decision | Status |
| --- | --- | --- |
| DEC-SA-058 | Data store is an independent decision; Firestore is not implicitly selected | Approved |
| DEC-SA-059 | Provisional recommendation: Option B, deferred pending evidence | Deferred |
| DEC-SA-060 | Evidence list in §6 must be verified before any approval | Deferred |
| DEC-SA-061 | Firebase Auth + Firebase Cloud Messaging are confirmed components either way | Approved |

## 8. Assumptions introduced

| ID | Assumption |
| --- | --- |
| ASM-SA-037 | v1 scale (single city) is modest; the decision is about integrity and rework risk. |
| ASM-SA-038 | A managed PostgreSQL service and API hosting are available within budget. |

## 9. Open questions raised

| ID | Question | Owner |
| --- | --- | --- |
| OQ-SA-002 | Final data store decision (after evidence phase)? | Founder + Engineering |
| OQ-SA-027 | Is a dedicated analytics warehouse needed, or is the operational store enough for v1? | Analyst + Engineering |

## 10. Dependencies

- **Capacity:** atomic rules in `docs/admin/12-capacity-reservation-and-waitlist-policy.md`.
- **Money:** reconciliation/audit in `docs/admin/13-pricing-payment-and-refund-policy.md`.
- **Domain:** entities in `docs/database/01-domain-entity-draft.md` and `docs/admin/11-event-and-session-domain-model.md`.

## 11. Related documents

- `docs/architecture/01-system-context.md`
- `docs/architecture/02-technology-decisions.md`
- `docs/admin/10-admin-analytics-and-reports.md`
