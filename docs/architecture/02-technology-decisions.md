# 02 — Technology Decisions

> **Status:** Planning draft.
> **Document type:** Technology decision log.
> **This document is a planning draft.** It records decided and open technology choices. No packages are installed and no code is generated for these decisions.

---

## 1. Purpose

Record the technology direction for the platform, separating confirmed decisions, working assumptions and open decisions. This log is a decision record; changes should be appended, not rewritten.

## 2. Confirmed decisions

| # | Area | Decision | Notes |
| --- | --- | --- | --- |
| D1 | Customer app | Flutter (Android + iOS) | Given direction |
| D2 | Super Admin | Next.js with TypeScript | Given direction |
| D3 | Initial backend | Firebase | Auth, data, functions/notifications |
| D4 | Production development | Claude Code (later phase) | No production logic now |
| D5 | Platforms | Android + iOS only for v1 customer app | Web/desktop not in scope |

## 3. Working assumptions (unconfirmed)

| # | Area | Assumption | Risk |
| --- | --- | --- | --- |
| A1 | Data store | Firestore (or Firebase realtime) — exact store open | Query complexity for analytics |
| A2 | Notifications | Firebase Cloud Messaging for push | Provider lock-in |
| A3 | Payments | External provider; **not selected** | Integration unknown |
| A4 | Email/SMS | Third-party services | Cost, deliverability |
| A5 | Analytics | Firebase-based aggregation for v1 | Scale limits |
| A6 | Maps/location | Service areas via geocoding (provider open) | Radius accuracy |

## 4. Open decisions

| # | Area | Question |
| --- | --- | --- |
| Q1 | Data store | Firestore vs. Realtime Database vs. other Firebase products |
| Q2 | Payment provider | Which provider, currency(s), and fee structure |
| Q3 | Auth | Firebase Auth vs. custom identity handling; how anonymous-first signup maps to accounts |
| Q4 | Notification channels | Push-only vs. push + email + SMS in v1 |
| Q5 | Analytics | Aggregated in Firestore vs. exporting to a warehouse |
| Q6 | Admin UI kit | Component library / styling for Next.js Super Admin |
| Q7 | State management (Flutter) | Which state management library for the customer app |
| Q8 | Monorepo layout | Single repo for app + admin vs. separate repos |

## 5. Decision criteria (draft)

Choices should be made against these criteria:

1. Speed to a small live operation (single city) over breadth.
2. Low operational overhead in early phase (managed services preferred).
3. Ability to change later without rewriting the data model (anonymity + role boundaries must not be baked into the UI layer).
4. Cost predictability at small scale.

## 6. Confirmed decisions (restated)

| # | Decision |
| --- | --- |
| C1 | Flutter for the customer app; Next.js + TypeScript for the Super Admin. |
| C2 | Firebase as the initial backend. |
| C3 | Claude Code for production development in a later phase. |
| C4 | No packages installed and no application code generated during this planning phase. |

## 7. Assumptions

| # | Assumption |
| --- | --- |
| A1 | The chosen backend can be prototyped quickly against the draft domain entities. |
| A2 | Decisions Q1–Q8 above will be resolved during the planning phase, not during build. |
| A3 | Team proficiency is sufficient for the confirmed stack. |

## 8. Open questions

See section 4 table. Tracked in `docs/project-records/02-open-questions.md`.

## 9. Dependencies

- **System context:** `docs/architecture/01-system-context.md`.
- **Entities:** `docs/database/01-domain-entity-draft.md`.
- **Security:** backend must honor privacy principles in `docs/security/01-security-and-privacy-principles.md`.

## 10. Related documents

- `docs/project-records/01-decisions-log.md`
- `docs/project-records/02-open-questions.md`
