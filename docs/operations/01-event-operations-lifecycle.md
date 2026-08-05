# 01 — Event Operations Lifecycle

> **Status:** Planning draft.
> **Document type:** Operational runbook (offline view).
> **This document is a planning draft.** It describes operational practice around events. No tooling exists.

---

## 1. Purpose

Describe the day-to-day operational lifecycle of an event from the staff's perspective — the offline/runbook companion to the system workflow in `docs/admin/05-event-management-workflow.md`. This is about how staff operate, not software features.

## 2. Operation phases

| Phase | Timeframe | Who | Key tasks |
| --- | --- | --- | --- |
| Plan | Weeks before | City Manager / Ops Mgr | Confirm venue, staffing, pricing, capacity |
| Publish | Days before | Ops Mgr | Create event room, open booking window |
| Fill | Until window close | All | Monitor fill, marketing, min-fill decisions |
| Prepare | Day before / day of | Coordinator | Check-in prep, team allocation readiness, equipment |
| Run | Session time | Coordinator / Referee | Check-in, matches, incidents, safety |
| Close | After session | Coordinator / Ops | Close session, record costs, sign-off |
| Review | After close | Ops / Analyst | Utilization, revenue, incidents, repeat |

## 3. Pre-event checklist (draft)

- [ ] Venue booked and confirmed for the exact slot.
- [ ] Coordinator assigned; referee assigned if tournament/required.
- [ ] Equipment confirmed (nets, balls, first-aid).
- [ ] Booking window and price correct.
- [ ] Age/format restrictions correct for the session type.
- [ ] Emergency contact and safety kit at venue.

## 4. Day-of runbook (draft)

| Time | Action |
| --- | --- |
| Before start | Coordinator arrives; venue ready; check-in station ready |
| At start | Participants check in with temp event ID; no-shows flagged |
| During | Matches/sessions run; referee records scores; incidents logged |
| End | Session closed; teams/outcomes finalized; incident sign-off |

## 5. Fill and cancellation decisions

- Below minimum fill: Ops decides cancel vs. run (draft policy; threshold open).
- Company cancellation → full refunds + notification (confirmed).
- Last-minute reschedule → notify all participants, log change.

## 6. Costs and reconciliation

| Cost item | Recorded by | Source |
| --- | --- | --- |
| Venue rental | Ops | Venue contract / per-slot rate |
| Staffing | Ops | Coordinator/referee assignments |
| Equipment | Ops | Expense note |
| Refunds/promos | Finance | Payment records |

Reconciliation flows feed `docs/admin/10-admin-analytics-and-reports.md`.

## 7. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | Every event has an assigned coordinator; referees assigned where required. |
| C2 | Company cancellation triggers automatic full refunds. |
| C3 | Costs (venue + staffing) are captured per session for margin. |
| C4 | No production tooling exists yet; this runbook documents intended practice. |

## 8. Assumptions

| # | Assumption |
| --- | --- |
| A1 | One coordinator can run most non-tournament sessions solo. |
| A2 | Venues are contracted per slot rather than dedicated. |
| A3 | Staff availability planning is manual (spreadsheets) before tooling exists. |
| A4 | Sessions are single-location (one venue per event room). |

## 9. Open questions

| # | Question |
| --- | --- |
| Q1 | What is the minimum-fill threshold and the latest cancel time? |
| Q2 | Who makes the go/cancel call and how is it recorded? |
| Q3 | What is the staffing model for large events (e.g., tournaments)? |
| Q4 | How are venue contracts tracked (per-slot rates, penalties)? |
| Q5 | Is a staff checklist feature needed in the Super Admin, or paper? |

## 10. Dependencies

- **Workflow:** `docs/admin/05-event-management-workflow.md` (same lifecycle, system view).
- **Safety:** `docs/admin/07-participant-and-safety-management.md`.
- **Money:** `docs/admin/06-booking-and-payment-operations.md`.

## 11. Related documents

- `docs/admin/08-tournament-management.md`
- `docs/product/04-v1-scope.md`
