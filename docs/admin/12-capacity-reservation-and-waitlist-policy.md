# 12 — Capacity, Reservation and Waitlist Policy

> **Status:** Planning draft — decision-resolution phase (SA-0C).
> **Document type:** Policy and lifecycle proposal.
> **This document is a planning draft.** It defines intended capacity behavior. No implementation exists. Final numeric values are configurable.

---

## 1. Purpose

Define the Version 1 rules for how slots on a session move through states — available, reserved, payment-pending, confirmed, cancelled — and how waitlists, admin bookings and capacity enforcement work. The **client application cannot directly finalize capacity**; capacity is enforced by the server/backend (DEC-SA-027).

## 2. Slot lifecycle (draft)

```
Available → Reserved (payment pending) → Confirmed
                 │                         │
                 ▼                         ▼
            Expired / Released        Cancelled → Available again (or → Waitlist promote)
```

| State | Meaning | How it is entered | How it is exited |
| --- | --- | --- | --- |
| Available | Slot open for booking | Session opened | Reserved / admin-held / complimentary |
| Reserved | Held for a user awaiting payment | User starts checkout | Confirmed on payment · Expired/released on timeout |
| Payment-pending | Equivalent to Reserved in v1 | See above | Same as Reserved |
| Confirmed | Payment captured; slot sold | Payment success | Cancellation → refund → Available |
| Cancelled | Slot freed (refund issued or forfeited per policy) | Refund or admin action | Available again / waitlist promotion |
| Staff-held | Held by operator (see §5) | Admin action | Released by admin |
| Waitlisted | User queued after capacity is full | Capacity full | Auto-promotion to Reserved on slot release |

## 3. Decision topics

### 3.1 Reservation / payment-pending window

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Pay-to-book confirmed (D-010); no reservation window defined. |
| 2 | Options | Hold slot while payment completes: (a) fixed timer, (b) indefinite, (c) no hold. |
| 3 | Benefits | Fixed timer prevents slot squatting and supports waitlists. |
| 4 | Risks | Timer too short frustrates users; too long blocks capacity (RSK-SA-005). |
| 5 | Operational consequences | Released reservations return to Available or promote waitlist. |
| 6 | Technical consequences | Reservation expiry must be reliable (scheduled/event-driven); see `docs/architecture/03-operational-data-store-evaluation.md`. |
| 7 | Recommended v1 decision | Fixed temporary reservation (recommended default **10 minutes**, configurable). |
| 8 | Unresolved | Final default value (OQ-SA-039). |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-021** |

### 3.2 Maximum capacity and overbooking prevention

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | "No oversell" already confirmed (D-009). |
| 2 | Options | Enforce capacity: (a) strict server-side, (b) UI-only, (c) allow oversell with waitlist. |
| 3 | Benefits | Strict enforcement protects participants and operations. |
| 4 | Risks | Race conditions between simultaneous payments (RSK-SA-013). |
| 5 | Operational consequences | No session ever exceeds configured maximum. |
| 6 | Technical consequences | Capacity check + reservation update must be atomic/transactional; client may show counts but cannot finalize. |
| 7 | Recommended v1 decision | Strict server-enforced capacity; client application cannot finalize capacity. |
| 8 | Unresolved | None. |
| 9 | External review | None. |
| 10 | Decision status | **Approved — DEC-SA-022** (reaffirms D-009) |

### 3.3 Minimum viable participant count

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Min-fill proposed in `docs/product/05-v1-operating-model.md` (DEC-SA-008/009). |
| 2 | Options | (a) Ops decision at cutoff, (b) automatic go/cancel, (c) run regardless. |
| 3 | Benefits | Predictable operations and margin protection. |
| 4 | Risks | Customer trust when sessions cancel (RSK-SA-008). |
| 5 | Operational consequences | Cutoff decision; participants notified; auto full refund on cancel. |
| 6 | Technical consequences | Cutoff check + refund trigger; recorded in audit. |
| 7 | Recommended v1 decision | Ops decides at a fixed cutoff; auto full refund on cancel. |
| 8 | Unresolved | Cutoff duration and per-activity minimum values (OQ-SA-040). |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-023** |

### 3.4 Waitlist policy

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Waitlists previously open (Q-015); proposed FIFO in WS1 (DEC-SA-016). |
| 2 | Options | (a) No waitlist, (b) FIFO auto-promote, (c) FIFO manual promote. |
| 3 | Benefits | Recovers cancellations and improves fill. |
| 4 | Risks | Promotion + payment flow complexity (RSK-SA-006). |
| 5 | Operational consequences | Waitlisted user gets a reservation on slot release; payment requested. |
| 6 | Technical consequences | Waitlist queue + promotion transaction; interacts with reservation expiry. |
| 7 | Recommended v1 decision | FIFO waitlist with automatic promotion. |
| 8 | Unresolved | Waitlist commitment (free vs. deposit); notification timing. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-024** |

### 3.5 Manual, complimentary and staff-held bookings

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Referenced in workstream brief; undefined in earlier docs. |
| 2 | Options | (a) Admin creates bookings for participants, (b) complimentary (zero-priced) bookings, (c) staff-held reserve slots separate from capacity. |
| 3 | Benefits | Supports sponsors, staff, and walk-ins. |
| 4 | Risks | Uncontrolled complimentary/staff slots distort fill analytics and revenue (RSK-SA-013). |
| 5 | Operational consequences | All such slots are labelled with reason and approver; counted separately in reports. |
| 6 | Technical consequences | Booking "origin" and "reason" fields; staff-held slots reduce available capacity visibly. |
| 7 | Recommended v1 decision | Allow all three, each audited and labelled; staff-held slots counted against capacity by default. |
| 8 | Unresolved | Whether staff-held slots are counted against capacity or excluded (founder call, OQ-SA-054). |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-025** |

### 3.6 Session closure and reopening

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Lifecycle has closing/active/completed stages (`docs/admin/05-event-management-workflow.md`). |
| 2 | Options | (a) Booking window closes at a fixed time; (b) closes at capacity; (c) can be reopened by ops. |
| 3 | Benefits | Fixed window is predictable; ops reopening handles mistakes. |
| 4 | Risks | Reopening late creates confusion (RSK-SA-002). |
| 5 | Operational consequences | Ops can reopen a closed session; audited action. |
| 6 | Technical consequences | State transitions guarded by role; audit entry required. |
| 7 | Recommended v1 decision | Fixed booking window per session; ops may reopen with an audited reason. |
| 8 | Unresolved | Reopen cutoff relative to start time. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-026** |

### 3.7 Duplicate bookings and multiple slots per user

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | One user → one booking assumed; duplicates undefined. |
| 2 | Options | (a) Block duplicates for same session; (b) allow multiple slots; (c) allow via "bring a friend". |
| 3 | Benefits | Blocking duplicates prevents accidental double-charge; multi-slot supports groups. |
| 4 | Risks | Multi-slot without clear model confuses teams/check-in (RSK-SA-002). |
| 5 | Operational consequences | Same participant may hold multiple slots if allowed; check-in must handle it. |
| 6 | Technical consequences | Duplicate detection at payment time; per-booking temp IDs. |
| 7 | Recommended v1 decision | Block duplicate bookings by the same account for the same session; multiple slots via a defined multi-slot booking flow only if approved (OQ-SA-055). |
| 8 | Unresolved | Whether v1 allows one user to book multiple slots (founder call, OQ-SA-055). |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-027** |

### 3.8 Client application cannot finalize capacity

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Booking originates in the mobile app; earlier docs imply server control. |
| 2 | Options | (a) Server finalizes capacity after payment, (b) client decrements capacity directly, (c) hybrid. |
| 3 | Benefits | (a) prevents double-sell and spoofing. |
| 4 | Risks | None beyond implementation discipline (RSK-SA-013). |
| 5 | Operational consequences | App shows live counts but never mutates capacity directly. |
| 6 | Technical consequences | Capacity change only via backend after verified payment; transactional. |
| 7 | Recommended v1 decision | Server (backend) is the only writer of capacity. |
| 8 | Unresolved | None. |
| 9 | External review | None. |
| 10 | Decision status | **Approved — DEC-SA-028** |

## 4. Policy summary table

| Rule | v1 rule | ID |
| --- | --- | --- |
| Reservation window | Temporary; recommended 10 min, configurable | DEC-SA-021 |
| Max capacity | Strict, server-enforced; no oversell | DEC-SA-022 |
| Min viable count | Ops decision at cutoff; auto refund on cancel | DEC-SA-023 |
| Waitlist | FIFO with auto-promotion | DEC-SA-024 |
| Admin/complimentary/staff slots | Allowed, audited, labelled | DEC-SA-025 |
| Booking window closure | Fixed per session; audited reopen | DEC-SA-026 |
| Duplicate bookings | Blocked for same account + session; multi-slot open | DEC-SA-027 |
| Capacity writer | Server/backend only | DEC-SA-028 |

## 5. Confirmed decisions (this workstream)

See §4. DEC-SA-022 and DEC-SA-028 are **Approved**; the remainder are **Proposed**.

## 6. Open questions raised

| ID | Question | Owner |
| --- | --- | --- |
| OQ-SA-039 | Final temporary reservation duration (recommended default 10 minutes)? | Founder |
| OQ-SA-040 | Final minimum and maximum participant counts per activity? | Founder + Ops |
| OQ-SA-053 | Should released reservations promote waitlist immediately or only after payment of predecessor? | Ops |
| OQ-SA-054 | Are staff-held slots counted against published capacity? | Founder |
| OQ-SA-055 | Can one user book multiple slots in v1 (bring-a-friend)? | Founder |

## 7. Dependencies

- **Payments:** reservation→confirmation depends on `docs/admin/13-pricing-payment-and-refund-policy.md`.
- **Operating model:** min-fill decisions from `docs/product/05-v1-operating-model.md`.
- **Data store:** reliable expiry/release requires an appropriate store (`docs/architecture/03-operational-data-store-evaluation.md`).

## 8. Related documents

- `docs/admin/11-event-and-session-domain-model.md`
- `docs/admin/05-event-management-workflow.md`
- `docs/product/05-v1-operating-model.md`
