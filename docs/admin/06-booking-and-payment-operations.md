# 06 — Booking and Payment Operations

> **Status:** Planning draft.
> **Document type:** Operational workflow (money).
> **This document is a planning draft.** It describes intended booking/payment/refund operations. **No payment code, provider SDK calls, or Firebase logic appear anywhere in this repository.**

---

## 1. Purpose

Describe how bookings, payments, refunds, cancellations and promo codes are intended to work from an operations perspective, so the Finance Manager and Customer Support roles can define the flows. This is a planning document, not an integration spec.

## 2. Booking flow (intended)

| Step | Who | Action |
| --- | --- | --- |
| 1 | Participant | Selects a live event room |
| 2 | Participant | Confirms slot and price (incl. promo code) |
| 3 | System | Validates capacity: no oversell |
| 4 | Participant | Pays for the slot |
| 5 | System | Marks slot reserved/sold on successful payment |
| 6 | System | Issues temporary random event ID to participant |
| 7 | Participant | Receives confirmation + session instructions |

### Rules (draft)

- A slot is reserved **only after successful payment**.
- Capacity never exceeds configured maximum.
- If payment fails, no reservation is created.
- If the session is cancelled by the company, all affected bookings are refunded automatically per policy.

## 3. Payment statuses (draft taxonomy)

| Status | Meaning |
| --- | --- |
| Pending | Payment initiated, not confirmed |
| Captured | Payment successful; slot reserved |
| Refunded | Fully refunded |
| Partially refunded | Portion refunded |
| Failed | Payment unsuccessful; no slot reserved |
| Disputed | Payment/chargeback under review |

## 4. Cancellations and refunds (operations view)

See `docs/product/03-business-model.md` for the pricing/policy framing. Operations view:

| Scenario | Ops behavior (draft) |
| --- | --- |
| Participant cancels within policy window | Support (or self-service) processes refund per policy |
| Participant cancels outside window | Refund denied or partial per policy; escalation to Finance |
| Company cancels session | Automatic full refunds; affected participants notified |
| No-show | No refund; recorded for analytics |
| Refund above threshold | Requires Finance Manager approval |
| Disputed payment | Customer Support logs dispute; Finance investigates |

Refund approval authority per threshold is defined in `docs/admin/02-admin-users-and-roles.md` (draft matrix).

## 5. Promo codes (ops view)

| Aspect | Draft behavior |
| --- | --- |
| Creation | Marketing Manager creates; Finance can review |
| Types | Fixed amount, percentage, free slot (approval required) |
| Limits | Expiry, max uses, per-user limit, scope (city/experience) |
| Application | One code per booking; applies before payment |
| Tracking | Redemption count, revenue impact, spend reported in analytics |

## 6. Reconciliation (draft)

Finance reconciliation at end of each day/week:

- Payments captured per session/city vs. expected from sold slots.
- Refunds issued vs. approved.
- Promo code spend vs. budget.
- Disputes open.
- Per-session contribution (revenue − venue − staffing).

## 7. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | Pay-to-book; reservation only on successful payment. |
| C2 | No oversell ever. |
| C3 | Company-cancelled sessions → automatic full refund. |
| C4 | Refunds are role-controlled (threshold approval by Finance). |
| C5 | Promo codes are single-use-per-booking in v1. |
| C6 | No payment implementation exists in this repository. |

## 8. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | A single payment provider can support capture, refund, partial refund and dispute handling. | Provider selection risk |
| A2 | Currency is single and per launch country. | Multi-currency later |
| A3 | Participants can complete payment in-app without an external checkout page. | Provider capabilities |
| A4 | Refund speed targets (e.g., same-day) can be met by the provider. | Support SLAs |

## 9. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | Which payment provider? (Not answered during planning.) | All money flows |
| Q2 | Exact cancellation windows and refund percentages per experience type? | Policy config |
| Q3 | Are refunds automatic for participant cancellations within window, or support-processed? | Automation level |
| Q4 | Do promo codes stack with city/format price modifiers? | Pricing math |
| Q5 | What are the Finance approval thresholds for refunds? | Roles |
| Q6 | How are cash/offline payments handled, if at all? | Scope |

## 10. Dependencies

- **Roles:** `docs/admin/02-admin-users-and-roles.md`.
- **Business model:** `docs/product/03-business-model.md`.
- **Screens:** Payments & Refunds, Promo Codes in `docs/admin/04-admin-screen-inventory.md`.
- **Security:** sensitive financial data handling in `docs/security/01-security-and-privacy-principles.md`.

## 11. Related documents

- `docs/admin/05-event-management-workflow.md`
- `docs/admin/10-admin-analytics-and-reports.md`
