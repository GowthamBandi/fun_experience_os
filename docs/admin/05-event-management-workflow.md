# 05 — Event Management Workflow

> **Status:** Planning draft.
> **Document type:** Workflow definition.
> **This document is a planning draft.** Workflows describe intended behavior; nothing is implemented.

> **Terminology note (SA-0C):** this legacy document uses "event room" to mean a scheduled session. The canonical domain vocabulary in `docs/admin/11-event-and-session-domain-model.md` (DEC-SA-018/019) replaces "event room" with **session** and introduces **playing area** for the physical sub-area. This document is retained as history; treat it through that mapping.

---

## 1. Purpose

Define the end-to-end lifecycle of an experience session — from catalog template to completed session — as the Super Admin will operate it. This is the backbone workflow that most admin screens support.

## 2. Vocabulary

| Term | Definition |
| --- | --- |
| Experience | A bookable template (e.g., "Weekend Mixed Badminton") |
| Event room | A specific scheduled session of an experience (date, time, venue) |
| Slot | One participant position within an event room |
| Format | Men-only / women-only / mixed |
| Capacity | Total slots in an event room |

## 3. Lifecycle stages

```
Draft → Scheduled → Live (open for booking) → Closing → Filling/Active → Completed → Archived
```

| Stage | Meaning | Key actions |
| --- | --- | --- |
| Draft | Template created, not public | Set category, venue, pricing, capacity, format, restrictions |
| Scheduled | Session has date/time but booking not yet open | Confirm venue, staffing, booking window start |
| Live | Open for booking | Participants join and pay; monitor fill |
| Closing | Booking window closed, session imminent | Check-in prep, team allocation |
| Active | Session in progress | Check-in, matches, incidents |
| Completed | Session finished | Close out, incident sign-off, payout costs recorded |
| Archived | Session older than retention window | Read-only, analytics only |

## 4. Session lifecycle detail

### 4.1 Create experience template

1. Choose activity category.
2. Set name, description, images, rules.
3. Set format options (men/women/mixed), age restriction, default booking window.
4. Associate candidate venues.

### 4.2 Schedule an event room

1. Pick experience → venue → date/time.
2. Set capacity and price (inherit template defaults, override allowed).
3. Set booking window open/close times.
4. Assign coordinator(s) and referee(s) where required.
5. Publish → session becomes Live at booking-window open.

### 4.3 During booking

- Monitor joined-participant count (participants see count only, never the roster).
- Fill tracking; auto/manual decisions for minimum-fill cancellation (draft policy — see Open Questions).
- Handle cancellations/refunds per policy (`docs/admin/06-booking-and-payment-operations.md`).

### 4.4 Closing and check-in

- Booking window closes.
- Temporary random event IDs are already issued at booking time.
- Random team allocation runs shortly before the session (or per activity rules).
- Participants check in at the venue using their temp ID; coordinator validates.
- No-shows recorded.

### 4.5 During session

- Matches/rounds run; scores recorded (tournaments: see `docs/admin/08-tournament-management.md`).
- Incidents logged (see `docs/admin/07-participant-and-safety-management.md`).

### 4.6 Completion

- Coordinator closes the session.
- Finance reconciles revenue vs. costs (venue, staffing).
- Analytics updated.

## 5. Minimum-fill and oversell rules (draft)

| Rule | Draft stance | Status |
| --- | --- | --- |
| Oversell | Never allowed — capacity is fixed | Confirmed |
| Minimum fill | Sessions below a threshold may be cancelled with full refunds | Draft — threshold and timing open |
| Waitlist | Not planned in v1 | Open |
| Override capacity | Admin-only, audited | Draft |

## 6. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | Lifecycle model: Draft → Scheduled → Live → Closing → Active → Completed → Archived. |
| C2 | Capacity is fixed; no oversell. |
| C3 | Event rooms are the schedulable unit; experiences are templates. |
| C4 | Temporary random event IDs are issued at booking time. |
| C5 | Team allocation runs shortly before the session and is random by default. |

## 7. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | Booking windows are per-experience (set by operator). | Could be global or per-session. |
| A2 | The same coordinator flow works for sports and social/adventure sessions. | May need per-activity checklists. |
| A3 | Minimum-fill cancellation will be needed. | Policy must be defined and communicated. |

## 8. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | What is the minimum-fill threshold (e.g., % of capacity) and how late can a session be cancelled? | Scheduler, refunds |
| Q2 | How far before a session must team allocation complete? | Notification timing |
| Q3 | Are check-in and team allocation one step or two? | Coordinator UX |
| Q4 | Should waiting lists exist in v1 to backfill cancellations? | Booking model |
| Q5 | What happens if a coordinator does not close a session on time? | Ops governance |

## 9. Dependencies

- **Screens:** `docs/admin/04-admin-screen-inventory.md`.
- **Booking/money:** `docs/admin/06-booking-and-payment-operations.md`.
- **Safety:** `docs/admin/07-participant-and-safety-management.md`.
- **Tournaments:** `docs/admin/08-tournament-management.md`.

## 10. Related documents

- `docs/operations/01-event-operations-lifecycle.md` (operational, offline view of the same lifecycle).
- `docs/product/04-v1-scope.md`.
