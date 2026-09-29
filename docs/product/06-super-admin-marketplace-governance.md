# Super Admin Marketplace Governance Model

> **Canonical correction — 2026-09-29.** This document supersedes the earlier assumption that the platform company creates and conducts every event.

## Product boundary

Experience OS is a governed event marketplace. Local event managers and organizers register, pass verification, submit arenas, propose events, sell access and conduct those events. The Super Admin does not schedule staff, check in guests, form teams, score matches or run the venue.

The Super Admin is the marketplace authority. It decides who may operate, what may be published, when money may move and when the platform must intervene to protect customers.

## Actors

| Actor | Responsibility |
| --- | --- |
| Organizer / event manager | Registers a legal or individual profile, submits arenas and events, accepts commercial terms, operates events and responds to customer issues. |
| Arena owner / authorized manager | Supplies ownership or lease proof, safety documents, capacity evidence, facilities and inspection access. May be the organizer or a separate party. |
| Customer | Discovers events, pays, attends, requests support/refunds and submits complaints. |
| Super Admin | Verifies access, approves marketplace supply, sets policy, manages risk, controls refunds and settlements and audits privileged decisions. |
| Finance reviewer | Reconciles money, reviews exceptions and releases settlements within delegated limits. |
| Trust & safety reviewer | Investigates fraud, complaints, disputes, unsafe arenas and organizer misconduct. |

## Super Admin capabilities

### Organizer governance

- Accept, reject or request information on applications.
- Verify PAN, GST, legal entity, directors, beneficial ownership, bank beneficiary and contact channels.
- Approve with conditions, impose volume/reserve limits, pause access, block access or permanently offboard.
- Track linked entities, previous suspensions, device/account relationships and complaint history.
- Require periodic reverification and record every access-state change.

### Arena governance

- Review organizer-submitted arenas rather than creating arenas on their behalf.
- Verify ownership/authorization, geolocation, capacity, fire and safety documents, accessibility, insurance and inspection evidence.
- Approve, approve conditionally, pause bookings, block new events or delist.
- Track document expiry and require reinspection after material capacity/layout changes.

### Event governance

- Review event proposals for organizer eligibility, approved arena, capacity, pricing, fees, refund/cancellation terms, age restrictions, insurance and prohibited-content rules.
- Approve publication, request changes, reject or pause ticket sales.
- Permit automated approval only inside configurable low-risk policy boundaries.
- Intervene after publication when fraud, safety, organizer suspension or customer harm is detected.

### Commercial governance

- Negotiate platform commission, payment fees, taxes, organizer reserves, payout cadence and cancellation liability.
- Version commercial terms with effective dates and dual approval for exceptional rates.
- Prevent an organizer from approving its own commercial exception.
- Measure contribution margin, refund/chargeback cost and negotiated-rate leakage.

### Money control

- Reconcile customer payments, platform fees, tax, organizer earnings, refunds, disputes and chargebacks.
- Hold or release settlements based on event completion, refund windows, reserve rules and fraud state.
- Support partial/full refunds, bulk cancellation refunds and policy exceptions.
- Require reason, actor, evidence and approval threshold for manual money movements.
- Keep an immutable ledger; balances are projections of ledger entries, never independently editable totals.

### Trust, fraud and customer protection

- Detect payment velocity, device/account clusters, payout-account changes, abnormal refund rates, duplicate events and identity links.
- Place reversible holds before irreversible actions.
- Investigate customer complaints without exposing unnecessary identity data.
- Track organizer-level refund rate, fulfillment, cancellation rate, complaints, response SLA and repeat attendance.
- Escalate by severity and financial exposure with explicit ownership and deadlines.

### Policy and audit

- Version organizer, arena, event, pricing, refund, settlement and fraud policies.
- Record the policy version used by every automated and human decision.
- Require step-up authentication and dual control for high-value settlement releases, permanent bans and exceptional commission terms.
- Preserve actor, timestamp, reason, evidence snapshot, before/after state and correlation ID.

## Canonical state machines

| Entity | States |
| --- | --- |
| Organizer | applied → under_review → approved / rejected → paused → blocked / reinstated |
| Arena | draft → submitted → under_review → approved / conditional / rejected → paused / delisted |
| Event | draft → submitted → changes_requested → approved → published → sales_paused → cancelled / completed |
| Refund | requested → policy_checked → approved / rejected → processing → paid / failed |
| Settlement | accruing → pending_reconciliation → ready → held / approved → released → paid / failed |
| Risk case | detected → triaged → investigating → actioned → monitoring → resolved |

## Production controls

- Server-side authorization and state transitions; the browser is never authoritative.
- Idempotent commands for approval, refund, hold and settlement release.
- Two-person approval for configurable monetary/risk thresholds.
- Webhook verification and reconciliation for payment-provider events.
- Field-level encryption for sensitive KYC and payout data.
- Least-privilege roles, scoped queues and audited emergency access.
- Malware scanning, expiry tracking and access logging for uploaded evidence.
- Rate limits, anomaly detection, observability, alerting and disaster-recovery procedures.
- No production claim until authentication, authorization, persistence, payments and audit controls are proven with integration tests.

## Super Admin information architecture

1. Overview — exposure and decisions requiring attention.
2. Approvals — unified organizer, arena, event, commercial and finance queue.
3. Organizers — verification, access state, performance and commercial profile.
4. Arenas — approval, inspection, document expiry and restrictions.
5. Events — proposal/policy review and marketplace intervention.
6. Customers — aggregate journey, complaints and protection outcomes.
7. Risk — fraud, disputes, chargebacks and linked-entity investigations.
8. Refunds — cancellation batches and policy exceptions.
9. Settlements — reconciliation, holds, reserves and releases.
10. Commercials — commissions and contract versions.
11. Policies — governed rules and approval thresholds.
12. Audit — immutable privileged-action history.
