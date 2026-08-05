# 01 — Security and Privacy Principles

> **Status:** Planning draft.
> **Document type:** Principles.
> **This document is a planning draft.** It records security and privacy principles only. **It intentionally contains no Firebase security rules, Cloud Functions or payment code.** Any such content must not be added to this repository during the planning phase.

---

## 1. Purpose

State the non-negotiable security and privacy principles for the platform, with emphasis on the platform's unique constraint: **participant anonymity**. These principles govern future backend, app and admin work.

## 2. Privacy principles

| # | Principle |
| --- | --- |
| P1 | **Anonymity by default.** Participants are not identifiable to each other through the customer app. |
| P2 | **Least disclosure.** Expose the minimum data needed: joined counts, not rosters. |
| P3 | **Temporary identifiers.** Temp random event IDs are session-scoped and expire. |
| P4 | **Data minimization.** Collect only what operations require; verification data is conditional. |
| P5 | **Access control by role.** Identifiable participant data is readable only by roles with a need (Safety, Ops, Support, Finance as defined). |
| P6 | **Retention limits.** Define retention periods for bookings, temp IDs, incidents and bans (currently open — see §7). |
| P7 | **Participant rights.** Support participant data access, correction and deletion requests per applicable law. |

## 3. Security principles

| # | Principle |
| --- | --- |
| S1 | **Auth everywhere.** Admin and participant access authenticated; no anonymous admin access. |
| S2 | **RBAC enforced server-side.** Role checks in the backend, never only in the UI. |
| S3 | **Immutability of audit.** Audit history cannot be edited or deleted by any role. |
| S4 | **No oversell guarantees.** Capacity checks are enforced at the data layer, not the UI. |
| S5 | **Least privilege for money.** Refunds and payment data changes require appropriate role + approval thresholds. |
| S6 | **No secrets in client.** Keys and credentials never in app/admin client code or this repo. |
| S7 | **Fail closed.** Deny by default; grant explicitly. |

## 4. Anonymity and safety tension

The platform must balance anonymity with safety:

- Anonymity limits harassment vectors, but also limits accountability → solved by reporting, moderation, and conditional verification.
- Single-gender sessions require a documented, legal-compliant identity/verification approach (open, legal review required).
- Ban enforcement across re-registration is an open problem.

## 5. Data classification (draft)

| Class | Examples | Handling |
| --- | --- | --- |
| Public | Activity catalog, session times, joined counts | Customer app readable |
| Participant-anonymous | Temp event ID, joined status | Session-scoped, expiring |
| Participant-identifiable | Name, contact, verification data | Admin-only, role-limited |
| Financial | Payments, refunds | Finance/Super Admin/Platform Owner, audited |
| Sensitive safety | Incident details, reports, bans | Safety/Super Admin, role-limited |
| Admin | Roles, permissions, audit | Admin-only, immutable audit |

## 6. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | Anonymity is a product-level requirement enforced in the backend. |
| C2 | RBAC is enforced server-side; UI gating is a convenience, not a control. |
| C3 | Audit history is immutable. |
| C4 | Capacity/oversell is enforced at the data layer. |
| C5 | No secrets in client code or this repository. |
| C6 | No security rules, functions or payment code are written during planning. |

## 7. Assumptions

| # | Assumption |
| --- | --- |
| A1 | Applicable law is the launch country's law (data protection, gender segregation). |
| A2 | Payment provider handles PCI-scope concerns (card data never touches our systems). |
| A3 | Firebase provides the identity and rules foundation for v1. |
| A4 | Retention periods will be defined during planning and before any data collection. |

## 8. Open questions

| # | Question |
| --- | --- |
| Q1 | Exact data retention periods for bookings, temp IDs, incidents, bans, and verification data? |
| Q2 | Legal position on gender-segregated sessions and gender verification? |
| Q3 | Is age verification required, and by what method? |
| Q4 | Which roles may view identifiable participant data, and under what conditions (e.g., investigation)? |
| Q5 | How are data deletion/access requests processed with Firestore? |
| Q6 | What happens to team allocation and temp IDs in archives after retention expiry? |

## 9. Dependencies

- **Roles:** `docs/admin/02-admin-users-and-roles.md`.
- **Anonymity behaviors:** `docs/admin/07-participant-and-safety-management.md`.
- **Backend:** `docs/architecture/02-technology-decisions.md`.
- **Legal review:** required before build for gender/verification/retention.

## 10. Related documents

- `docs/product/01-product-vision.md`
- `docs/database/01-domain-entity-draft.md`
