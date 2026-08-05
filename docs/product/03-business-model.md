# 03 — Business Model

> **Status:** Planning draft.
> **Document type:** Revenue / operating model.
> **This document is a planning draft.** No revenue logic, payment code or financial features exist. All figures below are planning targets to be validated.

---

## 1. Purpose

Describe how the platform earns revenue, how experiences are priced, and how money flows for bookings, refunds and promotions. This drives the Finance Manager and Marketing Manager areas of the Super Admin.

## 2. Revenue model

The company operates experiences itself. Revenue comes from participants paying to occupy slots.

| Stream | Description | v1 stance |
| --- | --- | --- |
| Session fee | Per-slot fee for joining a scheduled experience | Core |
| Premium formats | Higher-priced formats (tournaments, adventure, special events) | Likely |
| Intro / promo-priced sessions | Discounted first sessions to drive acquisition | Open question |
| Equipment / add-ons | Rented equipment at the venue | Open question, likely later |
| Partner / venue revenue share | Third-party venue or sponsor deals | Later, not v1 |

## 3. Pricing model

### 3.1 Slot pricing

Each experience type is priced per slot with a defined capacity.

| Concept | Meaning |
| --- | --- |
| Base price | Price for one participant slot on one scheduled session |
| Capacity | Number of slots per session (fixed; no oversell planned) |
| Format price modifiers | Men-only / women-only / mixed or tournament sessions may be priced differently |
| City / venue modifiers | Price may vary by city, venue quality, and time of day |

### 3.2 Pricing principles (planning targets)

- Price must cover venue cost + staffing (coordinator/referee) + platform fees per session.
- Discounting is allowed via promo codes, tracked as a marketing cost.
- No dynamic/auction pricing in v1.

## 4. Booking and money flow

1. Participant selects a session and pays for a slot.
2. Payment is captured at booking time (no pay-at-venue planned).
3. Slot is reserved only after successful payment.
4. Cancellation/refund rules apply per policy (see below).
5. The company reconciles revenue per session, city and experience.

> **Constraint:** This document intentionally contains **no payment code or provider API details**. Provider selection is an open decision (see `docs/admin/06-booking-and-payment-operations.md`).

## 5. Cancellations and refunds (planning draft policy)

| Scenario | Draft policy | Status |
| --- | --- | --- |
| Participant cancels well before the session | Full or partial refund per window | Draft — needs decision |
| Participant cancels close to the session | No refund, or refund minus fee | Draft — needs decision |
| Company cancels the session | Full refund (automatic) | Draft — needs decision |
| No-show | No refund | Draft — needs decision |
| Weather / force majeure | Company decision per city | Draft — needs decision |

All cancellation policies must be reviewed by finance and legal before any implementation.

## 6. Promo codes

| Area | Planning notes |
| --- | --- |
| Purpose | Acquisition (first-time), retention (repeat), fill-rate (off-peak slots) |
| Types | Fixed discount, percentage, free-slot (subject to approval) |
| Constraints | One code per booking, expiry, usage limits, per-experience or per-city scoping |
| Tracking | Promo usage and its effect on revenue must be reportable |

## 7. Financial roles in the Super Admin

The Finance Manager is the owner of financial data and reconciliation. See `docs/admin/02-admin-users-and-roles.md` for the full role draft.

## 8. Unit economics (working target)

| Component | Notes |
| --- | --- |
| Revenue per session | slots sold × price − discounts |
| Direct cost | venue rent + staffing + equipment |
| Contribution | revenue − direct cost |
| Platform cost | payment fees, Firebase/backend, support |
| Target | contribution positive per session after ramp-up; exact targets unset |

## 9. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | Pay-per-slot booking; slot reserved only after payment. |
| C2 | The company prices, collects and reconciles all v1 revenue. |
| C3 | Fixed capacity per session — no oversell. |
| C4 | Refunds exist; exact windows are not yet decided. |
| C5 | No dynamic pricing in v1. |

## 10. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | Venue rental + staffing leaves a viable margin per session. | Pricing or staffing model must change. |
| A2 | A standard payment provider supports the required flows (capture, refund, partial refund). | Provider selection constraint. |
| A3 | Participants are willing to prepay for a slot. | May need pay-at-venue or hold-then-pay. |
| A4 | Currency: single currency per country at launch (exact currency by launch city). | Multi-currency complexity later. |

## 11. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | What is the default cancellation window and refund percentage? | Refund feature |
| Q2 | Which payment provider and what fees? | Money flow |
| Q3 | Are intro/discount sessions part of v1 marketing? | Pricing, promo codes |
| Q4 | What are the target margin and utilization thresholds for greenlighting a session? | Scheduler, analytics |
| Q5 | Who can approve refunds above a threshold, and at what level? | Role permissions |

## 12. Dependencies

- **Payments:** provider + flow selection (see `docs/admin/06-booking-and-payment-operations.md`).
- **Roles:** refund approval authority depends on `docs/admin/02-admin-users-and-roles.md`.
- **Scope:** pricing/refund decisions feed `docs/product/04-v1-scope.md`.

## 13. Related documents

- `01-product-vision.md`
- `02-problem-and-opportunity.md`
- `docs/admin/06-booking-and-payment-operations.md`
- `docs/admin/10-admin-analytics-and-reports.md`
