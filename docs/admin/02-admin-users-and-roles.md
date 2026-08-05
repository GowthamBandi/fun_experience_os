# 02 — Admin Users and Roles

> **Status:** Planning draft.
> **Document type:** RBAC draft.
> **This document is a planning draft.** The roles below are a starting draft, **not final**. Permission boundaries are explicitly open and must be refined before build.

---

## 1. Purpose

Draft the initial set of Super Admin roles, describe their responsibilities, and record open questions about permission boundaries. This document does not define final permissions — it is input to role design.

## 2. Draft roles

| # | Role | Draft responsibility |
| --- | --- | --- |
| 1 | Platform Owner | Global configuration, cities/budget ownership, escalation authority, final sign-off |
| 2 | Super Admin | Full access to all modules and configuration |
| 3 | City Manager | Operate one (or more) cities: service areas, venues, catalog, pricing within limits |
| 4 | Event Operations Manager | Scheduling, capacity, staffing, session and tournament operations |
| 5 | Event Coordinator | Per-session execution: check-in, team allocation, incident reporting, session closure |
| 6 | Customer Support | Bookings help, refunds within limits, participant issues, promo-code support |
| 7 | Safety and Moderation Officer | Incidents, participant reports, bans, verification review |
| 8 | Finance Manager | Payments, refund approvals, reconciliation, financial audit views |
| 9 | Marketing Manager | Promo codes, notifications, catalog content/marketing material |
| 10 | Analyst | Read-only access to analytics and reports |

## 3. Draft module access matrix

Legend: **R** read, **W** write, **X** no access. **Draft only.**

| Module | Platform Owner | Super Admin | City Manager | Ops Mgr | Coordinator | Support | Safety | Finance | Marketing | Analyst |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Dashboard | R | R/W | R | R | R | R | R | R | R | R |
| Cities & service areas | W | W | W (own) | R | X | X | X | X | R | R |
| Venues | R/W | W | W (own) | W | R | X | X | R | R | R |
| Activity categories | W | W | R | R/W | X | X | X | R | R/W | R |
| Experiences & event rooms | W | W | W (own) | W | R | R | X | R | R/W | R |
| Pricing & capacity | W | W | W (own, limits) | R/W | X | X | X | W | R | R |
| Formats & restrictions | W | W | R | R/W | X | X | X | R | R | R |
| Bookings | R | W | R | R/W | R | R/W | X | R/W | R | R |
| Payments & refunds | R | W | R | R | X | R/W (limits) | X | W | R | R |
| Promo codes | R | W | R | R | X | R | X | R | W | R |
| Check-in & teams | X | W | R | R/W | W | R | X | X | X | R |
| Tournaments | R | W | R | W | R/W | X | X | R | R | R |
| Notifications | R | W | R/W | R/W | R | R/W | R | X | W | R |
| Incidents / reports / bans | R | W | R | R | R/W | R | W | X | X | R |
| Verification | R | W | R | R | R | R | W | X | X | R |
| Admin roles & audit | W | W | X | X | X | X | X | R | X | R |

> The matrix is a working draft to stimulate discussion. It is **not** final, and several cells are knowingly ambiguous (see Open Questions).

## 4. Cross-cutting permission questions

These boundaries are unresolved and must be answered before role implementation:

| # | Question | Why it matters |
| --- | --- | --- |
| P1 | Can a City Manager view participant identity for their city, or only aggregate counts? | Privacy vs. operational need |
| P2 | What refund amount/percentage can Customer Support approve without Finance sign-off? | Financial control |
| P3 | Can Safety and Moderation Officer unilaterally ban a participant, or is a second approver required? | Abuse of power |
| P4 | Can Event Coordinator edit capacity/pricing at session time, or only report issues? | Supply integrity |
| P5 | Are Analyst and Finance Manager reads separate from write access by construction? | Segregation of duties |
| P6 | Can a Coordinator for a women-only session be any gender, or is it restricted by the operator? | Policy |
| P7 | Can Platform Owner be locked out of audit trails (no privilege to edit/delete audit logs)? | Immutability |
| P8 | Is Super Admin allowed to do everything, including bypass city scoping? | Control |

## 5. Suggested safeguards (draft)

- **Least privilege:** default to X, add R/W only where justified.
- **Segregation of duties:** the person who reconciles (Finance) should not be the person who grants access (Platform Owner). At minimum, audit all financial changes.
- **Immutable audit:** no role may edit or delete audit history (see `docs/security/01-security-and-privacy-principles.md`).
- **City scoping:** all roles except Platform Owner / Super Admin operate within a city scope; cross-city access is explicit.

## 6. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | RBAC is the intended model; roles, not raw user flags. |
| C2 | The ten roles above are a **draft** to be refined. |
| C3 | City scoping is expected for City Manager and Ops roles (exact rules open). |
| C4 | Audit history is immutable by all roles. |
| C5 | Roles will not be implemented until permission boundaries are resolved. |

## 7. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | A single person may hold multiple roles (e.g., Coordinator + Safety in small cities). | Role combination policy needed. |
| A2 | All roles map to identifiable company staff. | Verification of admin identity. |
| A3 | Permissions are scoped by module + city, not per-record. | Fine-grained per-record access could be needed for sensitive data. |

## 8. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | Should role changes require a second approver (two-person rule)? | Admin UX |
| Q2 | How are role assignments granted: Platform Owner only, or self-service for Super Admins? | Governance |
| Q3 | Should there be a read-only "viewer of all" for auditors? | Compliance |

## 9. Dependencies

- **IA:** navigation and modules in `docs/admin/03-admin-information-architecture.md`.
- **Security:** `docs/security/01-security-and-privacy-principles.md`.
- **Finance:** refund approval thresholds in `docs/product/03-business-model.md` and `docs/admin/06-booking-and-payment-operations.md`.

## 10. Related documents

- `docs/admin/01-admin-purpose.md`
- `docs/admin/04-admin-screen-inventory.md`
- `docs/admin/10-admin-analytics-and-reports.md`
