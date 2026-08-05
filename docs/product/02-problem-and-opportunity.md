# 02 — Problem and Opportunity

> **Status:** Planning draft.
> **Document type:** Market / problem framing.
> **This document is a planning draft.** It describes problems and opportunities we believe exist. It is not a market study and no features described here are implemented.

---

## 1. Purpose

Describe the customer problem the platform addresses, why it is worth solving, and the opportunity for the company. This framing guides scope decisions in `04-v1-scope.md` and the business model in `03-business-model.md`.

## 2. The problem

### 2.1 For the participant

Casual players of sports like badminton, cricket and box cricket face recurring friction:

| Problem | Detail |
| --- | --- |
| Coordination burden | Finding enough players, agreeing on a time, splitting costs, booking a court/ground. |
| Commitment fear | Committing to a full team/league before knowing who else is playing. |
| No trust layer | Playing with strangers is unappealing without safety signals, codes of conduct and moderation. |
| Wasted slots | Popular courts are booked by groups that then cancel; solo players cannot fill the gap. |
| Gender / comfort | Some participants prefer men-only, women-only or mixed settings; generic bookings don't offer that choice. |
| Money friction | Paying for a slot is informal (UPI, cash, group splits), leading to no-shows and disputes. |

### 2.2 For the operator (the company)

| Problem | Detail |
| --- | --- |
| Manual ops | Creating sessions, tracking payments and rosters is done in spreadsheets and chat. |
| No slot discipline | Unclear capacity leads to overbooking or underfilling paid courts. |
| No safety pipeline | No structured way to record incidents, reports or bans. |
| No analytics | Revenue, utilization and repeat-rate are not measured. |
| Weak retention | Casual players have no reason to return without structured scheduling and teams. |

## 3. Why now / why this approach

- Pay-per-slot for fixed-capacity sessions matches how courts and grounds are actually rented — capacity is finite, and the marginal cost of an extra participant is low until the slot fills.
- Anonymity (joined-count only) lowers the commitment barrier: players join without knowing the full roster.
- Random team allocation removes the awkwardness of "captain picking teams" and rebalances mixed-skill groups.
- A company-operated model means quality, pricing and safety are controlled end-to-end in a way a pure marketplace cannot guarantee at launch.

## 4. The opportunity

The opportunity is to become the **operating layer for local real-world sports and social experiences**:

1. **Fill spare capacity** in existing venues (courts, grounds) with paid, organized sessions.
2. **Own the participant relationship** — repeat bookings, loyalty, ratings — rather than one-off informal groups.
3. **Expand vertically**: once booking works, add tournaments, verified leagues and cross-city operations.
4. **Monetize multiple ways**: session fees, premium formats, promo codes and, later, partner venues/equipment (see business model).

## 5. What success looks like

| Metric | Meaning |
| --- | --- |
| Slot fill rate | % of sold capacity per session |
| Repeat booking rate | % of participants booking again within a period |
| No-show rate | % of paid participants who do not attend |
| Incident rate | incidents per session |
| Margin per session | revenue minus venue + staffing cost |

These feed the analytics areas defined in `docs/admin/10-admin-analytics-and-reports.md`.

## 6. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | Focus is limited-slot, paid, real-world experiences (sports, games, adventures, social). |
| C2 | Company operates experiences itself at launch rather than hosting third parties. |
| C3 | Anonymity with joined-count only is a core launch behavior, not a temporary hack. |
| C4 | Trust/safety (incidents, reports, bans) is in scope from day one. |
| C5 | Structured slot capacity and pricing are core — no "unlimited" experiences in v1. |

## 7. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | Participants will pay a platform fee for organized sessions instead of informal group booking. | May need free intro sessions to prove willingness to pay. |
| A2 | Anonymity reduces sign-up friction more than it reduces trust. | May need earlier verification/identity exposure. |
| A3 | Venues are available to rent per-slot in target cities. | Venue supply becomes a constraint. |
| A4 | Coordinators/referees can be hired per city at viable cost. | Unit economics break; staffing model must change. |

## 8. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | Is willingness-to-pay strong enough for a booking fee on top of venue cost? | Pricing, business model |
| Q2 | Do participants want "bring your own friends" group bookings in v1, or solo-join only? | Customer app scope |
| Q3 | Which activity mix (badminton, cricket, box cricket, tournaments, adventures, social) generates the strongest early traction? | Launch city activity mix |
| Q4 | How is "women-only" demand sized? | Marketing, format mix |

## 9. Dependencies

- **Data gathering:** this document should be validated with real user interviews before v1 build starts (record in project status).
- **Competitive review:** no formal competitor analysis exists yet (see Open Questions in `docs/project-records/02-open-questions.md`).

## 10. Related documents

- `01-product-vision.md`
- `03-business-model.md`
- `04-v1-scope.md`
