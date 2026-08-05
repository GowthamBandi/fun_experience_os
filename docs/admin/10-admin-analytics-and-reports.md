# 10 — Admin Analytics and Reports

> **Status:** Planning draft.
> **Document type:** Reporting / analytics scope.
> **This document is a planning draft.** No analytics dashboards or reports exist.

---

## 1. Purpose

Define the metrics, dashboards and reports the Super Admin must surface for operators, finance and leadership. Analytics are split into revenue analytics and operational analytics, with safety and retention as supporting areas.

## 2. Metric framework

| Layer | Question | Example metrics |
| --- | --- | --- |
| Fill | Are slots selling? | Fill rate per session, capacity utilization, waitlist pressure |
| Money | Are we profitable? | Revenue, margin, refunds, promo spend |
| People | Are people returning? | Repeat rate, no-show rate, ratings |
| Safety | Is it safe? | Incidents per session, report volume, ban actions |
| Operations | Is it running? | Sessions on time, check-in rate, staff utilization |

## 3. Revenue analytics (Finance / leadership)

| Metric | Definition (draft) |
| --- | --- |
| Gross revenue | Total slot payments captured |
| Net revenue | Gross − refunds − promo discounts |
| Contribution | Net revenue − direct costs (venue + staffing) |
| Refund rate | Refunded amount ÷ gross revenue |
| Promo spend | Discount value consumed via codes |
| Avg revenue per session | Net revenue ÷ sessions |
| Payments by status | Captured / refunded / failed / disputed |

## 4. Operational analytics (Operations)

| Metric | Definition (draft) |
| --- | --- |
| Fill rate | Sold slots ÷ capacity (per session, per experience, per city) |
| Sessions run | Completed sessions vs. scheduled |
| Cancellation rate | Sessions cancelled by company ÷ scheduled |
| Check-in rate | Checked-in ÷ sold (no-show rate = inverse) |
| Time-to-fill | Hours from live to full (or % at window close) |
| Team allocation runs | Number / success of automated allocations |
| Tournament metrics | Matches played, completed vs. scheduled |

## 5. Safety analytics (Safety / leadership)

| Metric | Definition (draft) |
| --- | --- |
| Incident rate | Incidents ÷ sessions (per activity, city) |
| Incident severity mix | Counts by Low/Medium/High |
| Report volume | Participant reports received / resolved |
| Ban actions | Bans issued by type and duration |
| Open cases | Incidents/reports not yet resolved |

## 6. Dashboard layout (draft)

| Dashboard | Audience | Primary tiles |
| --- | --- | --- |
| Executive | Leadership | Revenue, margin, fill, incident rate, top experiences |
| Operations | Ops Manager | Today's sessions, fill, check-in, upcoming |
| Finance | Finance Manager | Payments, refunds, reconciliation status |
| Marketing | Marketing Manager | Promo spend, fill by campaign, repeat rate |
| Safety | Safety Officer | Open incidents, reports, ban actions |

## 7. Reports and exports

- Standard reports: daily/weekly revenue, session fill, incident log.
- Exports: CSV at minimum; PDF for finance (draft).
- Time ranges: day, week, month, custom.
- Scope filters: city, activity, experience, venue.

## 8. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | Revenue and operational analytics are both v1. |
| C2 | Fill rate, revenue, no-show and incident rate are core metrics. |
| C3 | Dashboards are role-scoped (executive, operations, finance, marketing, safety). |
| C4 | Standard reports and CSV export are planned. |
| C5 | No analytics implementation exists in this repository. |

## 9. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | Firestore/backend analytics queries are sufficient for v1 volume. | May need dedicated analytics later |
| A2 | Daily batch numbers are acceptable; no real-time analytics needed. | Dashboard freshness |
| A3 | Analysts can read everything; write access is not needed. | Role config |
| A4 | Contribution requires venue and staffing cost data entry. | Cost data model |

## 10. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | What is the exact go/no-go metric set for a session or city? | Business rules |
| Q2 | Is a dedicated analytics warehouse needed in v1, or is Firebase sufficient? | Architecture |
| Q3 | Which reports must exist at launch vs. ad-hoc querying? | Report scope |
| Q4 | How is "cost" (venue + staffing) captured per session for margin? | Data model |
| Q5 | Are ratings/feedback aggregated into analytics? | Feedback model |

## 11. Dependencies

- **Data:** metrics depend on entities in `docs/database/01-domain-entity-draft.md`.
- **Roles:** Analyst and Finance views in `docs/admin/02-admin-users-and-roles.md`.
- **Business model:** margin and promo concepts from `docs/product/03-business-model.md`.

## 12. Related documents

- `docs/admin/04-admin-screen-inventory.md`
- `docs/admin/06-booking-and-payment-operations.md`
- `docs/product/03-business-model.md`
