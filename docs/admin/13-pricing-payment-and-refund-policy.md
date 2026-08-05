# 13 — Pricing, Payment and Refund Policy

> **Status:** Planning draft — decision-resolution phase (SA-0C).
> **Document type:** Money operations policy.
> **This document is a planning draft.** Provider comparisons are **conceptual only** and must be verified externally before any selection. **No payment code, provider SDK calls or integration details exist in this repository.**

---

## 1. Purpose

Define the Version 1 pricing composition, the payment state model, and a **configurable** cancellation/refund policy model. Payment-provider selection remains **blocked** until a verified comparison is completed.

## 2. Pricing composition (draft)

| Component | Meaning | Who bears it | Notes |
| --- | --- | --- | --- |
| Ticket price | What the participant pays per slot | Participant | Displayed as the headline price |
| Taxes | Applicable taxes (e.g., GST) on the ticket | Participant (pass-through) | Exact treatment open (OQ-SA-042) |
| Platform fee | Company margin / operating fee | Participant or company | Inclusion decision open |
| Venue cost | Rental of playing area(s) | Company | Input to margin, not billed to participant separately |
| Equipment cost | Standard equipment | Company | Input to margin |
| Promo discount | Marketing discount via promo code | Company | Reduces revenue |
| Complimentary booking | Zero-price slot | Company | Audited; excluded from revenue |

**Pricing principle:** the participant sees one all-in price (or price + taxes); venue/equipment costs are internal inputs, not line items (proposed).

## 3. Indian payment-provider comparison (conceptual only)

> The following is an architectural-level comparison. **No current pricing, feature claims or availability claims are asserted here.** Every fact must be verified externally during the blocked selection work (OQ-SA-041).

| Aspect | Aggregators (e.g., Razorpay, Cashfree, PayU, CCAvenue) | UPI-first options (e.g., PhonePe, Google Pay via aggregator) | Notes |
| --- | --- | --- | --- |
| Coverage | Cards, UPI, netbanking, wallets, EMI | UPI dominant | Depends on target participant base |
| Refunds / partial refunds | Typically supported | Provider-dependent | Verify per provider |
| Webhooks / settlement reporting | Typically supported | Verify | Needed for confirmation + reconciliation |
| Dispute/chargeback handling | Typically supported | Verify | Needed for charge disputes |
| KYC / onboarding (merchant) | Required | Required | Company-level requirement |
| International availability (if later) | Varies | Domestic focus | Post-v1 |

**Decision status for provider selection:** **Blocked — DEC-SA-029**. A verified comparison (fees, refunds, webhooks, settlement cycles, dispute handling, onboarding effort) must be approved before any integration design.

## 4. Payment state model (draft)

| State | Meaning | Entry | Exit |
| --- | --- | --- | --- |
| Payment pending | Payment initiated; slot reserved (see `docs/admin/12-capacity-reservation-and-waitlist-policy.md`) | Checkout started | Success / failure / expiry |
| Payment success | Provider confirms capture | Provider response / webhook | Confirmed booking |
| Payment failure | Provider declines or times out | Provider response | Slot released |
| Duplicate payment | Second charge for same booking detected | Reconciliation | One charge retained, other refunded |
| Delayed payment confirmation | Success signal arrives late | Webhook/retry after UI timeout | Reconciliation resolves |
| Webhook confirmation | Server-side confirmation of success | Provider webhook | Confirmed only on server-side verification |
| Refund requested | Participant or company initiates refund | Support/admin action | Approved / rejected |
| Refund approved | Authorized per policy threshold | Finance/support approval | Processing |
| Refund processing | Provider refund in flight | Provider initiated | Completed / failed |
| Refund completed | Money returned | Provider settlement | Closed |
| Partial refund | Portion refunded per policy | Policy decision | Completed (partial) |
| Charge dispute | Participant disputes a charge | Provider dispute | Resolved / upheld / lost |

**Rule:** a booking is **confirmed only after server-side (webhook) confirmation**; the client UI never treats a success screen as final capacity (DEC-SA-028).

## 5. Cancellation policy model (configurable)

Replace "one permanent refund window" with a **configurable policy model** per experience/session:

| Policy dimension | Configurable values (draft) |
| --- | --- |
| Cancellation deadline | e.g., T-24h, T-12h, T-6h relative to session start |
| Refund percentage by window | e.g., 100% before deadline, 50% inside window, 0% at no-show |
| Company/weather cancellation | Always 100% refund (confirmed) |
| No-show | 0% refund (confirmed) |
| Reschedule | Full value as credit or refund per policy (open) |
| Partial session cancellation | Proportional refund policy (open) |

**Recommended v1:** each experience template defines its own policy (deadlines + percentages); the system enforces the policy applicable at cancellation time and records it in the audit trail (DEC-SA-031).

## 6. Financial audit trail

| Requirement | Detail |
| --- | --- |
| Immutable log | All payment and refund state changes recorded (DEC-SA-033) |
| Attribution | Every change records actor, role, timestamp, before/after |
| Reconciliation | Per-session gross/net, refunds, promo spend, disputes |
| Provider refs | External transaction IDs stored for cross-checking |
| Policy snapshot | The cancellation policy in force at booking time is recorded with the booking |

## 7. Decision topics

### 7.1 Provider selection

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Provider unselected across all earlier docs (Q-001). |
| 2 | Options | Aggregators (Razorpay/Cashfree/PayU/CCAvenue class) vs. UPI-first options; see §3. |
| 3 | Benefits | Aggregators give breadth; UPI-first matches likely participant payment habits. |
| 4 | Risks | Fee structures, refund limits, settlement cycles, dispute handling vary (RSK-SA-004). |
| 5 | Operational consequences | Finance workflows, refund speeds, reconciliation cadence depend on provider. |
| 6 | Technical consequences | Webhook reliability, partial-refund support, idempotency matter to our state model. |
| 7 | Recommended v1 decision | None yet — **selection blocked pending verified comparison** (OQ-SA-041). |
| 8 | Unresolved | Provider, currency handling, fees, onboarding. |
| 9 | External review | **Accounting/finance professional** to validate fee + reconciliation impact; provider comparison verified by engineering. |
| 10 | Decision status | **Blocked — DEC-SA-029** |

### 7.2 Configurable cancellation policy model

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Earlier docs had a single draft window (Q-003). |
| 2 | Options | (a) One global window, (b) per-template configurable policy, (c) per-session override. |
| 3 | Benefits | (b) fits activity types with different economics (badminton vs. adventure). |
| 4 | Risks | Policy confusion if not surfaced clearly at booking (RSK-SA-013). |
| 5 | Operational consequences | Support and finance follow the recorded policy; fewer exceptions. |
| 6 | Technical consequences | Policy is data, snapshot at booking; enforced at cancellation. |
| 7 | Recommended v1 decision | Per-experience configurable policy with session override; snapshot stored. |
| 8 | Unresolved | Default template values (OQ-SA-043). |
| 9 | External review | Legal review of terms surfaced to participants. |
| 10 | Decision status | **Proposed — DEC-SA-030** |

### 7.3 Confirmed-only-on-webhook

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Pay-to-book confirmed; confirmation authority undefined. |
| 2 | Options | (a) Client success screen confirms, (b) server-side webhook confirms, (c) manual confirm. |
| 3 | Benefits | (b) prevents capacity being consumed by failed/unconfirmed payments. |
| 4 | Risks | Webhook delay causes UX ambiguity; needs reconciliation (RSK-SA-004). |
| 5 | Operational consequences | Confirmed list is authoritative for ops. |
| 6 | Technical consequences | Idempotent webhook handling; delayed-confirmation reconciliation. |
| 7 | Recommended v1 decision | Booking confirmed only on server-side webhook verification. |
| 8 | Unresolved | Grace window for "payment processing" states. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-031** |

### 7.4 Financial audit trail

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Audit immutability confirmed (D-013). |
| 2 | Options | (a) Event log of all money changes, (b) ledger-style double entry, (c) provider-only records. |
| 3 | Benefits | (a)/(b) support reconciliation and disputes. |
| 4 | Risks | Ledger (b) is heavier to build (RSK-SA-013). |
| 5 | Operational consequences | Finance can reconstruct any booking's money path. |
| 6 | Technical consequences | Store matters (see `docs/architecture/03-operational-data-store-evaluation.md`). |
| 7 | Recommended v1 decision | Immutable event log of all payment/refund changes with provider refs; ledger upgrade post-v1. |
| 8 | Unresolved | Whether v1 needs full double-entry ledger. |
| 9 | External review | **Accounting professional** to validate reconciliation design. |
| 10 | Decision status | **Proposed — DEC-SA-032** |

### 7.5 Promo and complimentary accounting

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Promo codes confirmed single-use-per-booking; complimentary undefined. |
| 2 | Options | Promo: fixed/percent/free-slot. Complimentary: zero-price booking with reason. |
| 3 | Benefits | Clear revenue attribution. |
| 4 | Risks | Misuse inflates discount spend (RSK-SA-013). |
| 5 | Operational consequences | Finance sees promo spend and comp value separately. |
| 6 | Technical consequences | Both reduce gross to net; audited. |
| 7 | Recommended v1 decision | Promo and complimentary bookings labelled, audited, and reported separately from gross revenue. |
| 8 | Unresolved | Free-slot promo approval threshold. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-033** |

## 8. Confirmed decisions (this workstream)

| ID | Decision | Status |
| --- | --- | --- |
| DEC-SA-029 | Payment-provider selection blocked pending verified comparison | Blocked |
| DEC-SA-030 | Configurable per-experience cancellation policy | Proposed |
| DEC-SA-031 | Confirmed only on server-side webhook | Proposed |
| DEC-SA-032 | Immutable financial event log (v1) | Proposed |
| DEC-SA-033 | Promo/complimentary audited and separately reported | Proposed |

## 9. Assumptions introduced

| ID | Assumption |
| --- | --- |
| ASM-SA-024 | The chosen provider supports webhook confirmation, partial refunds and dispute handling. |
| ASM-SA-025 | Card data never touches our systems (provider-hosted). |
| ASM-SA-026 | A single currency (INR) is sufficient for v1. |

## 10. Open questions raised

| ID | Question | Owner |
| --- | --- | --- |
| OQ-SA-041 | Verified provider comparison (fees, refunds, webhooks, settlement, disputes)? | Founder + Finance + Engineering |
| OQ-SA-042 | Tax (GST) treatment of ticket vs. platform fee? | Accountant |
| OQ-SA-043 | Default cancellation policy values per experience template? | Founder + Finance |
| OQ-SA-056 | Refund speed target (e.g., same-day) for company cancellations? | Finance |
| OQ-SA-057 | Partial-session cancellation refund rule? | Founder + Finance |

## 11. Dependencies

- **Capacity:** reservation window in `docs/admin/12-capacity-reservation-and-waitlist-policy.md`.
- **Analytics:** money metrics in `docs/admin/10-admin-analytics-and-reports.md`.
- **Data store:** audit + reconciliation needs in `docs/architecture/03-operational-data-store-evaluation.md`.

## 12. Related documents

- `docs/product/03-business-model.md`
- `docs/admin/06-booking-and-payment-operations.md`
- `docs/security/01-security-and-privacy-principles.md`
