# 08 — Tournament Management

> **Status:** Planning draft.
> **Document type:** Feature planning (tournaments).
> **This document is a planning draft.** Tournament features are planned but not implemented.

> **Scope note (SA-0C):** `docs/admin/14-tournament-formats-and-scoring.md` (DEC-SA-048) supersedes the framing here: **single elimination is the proposed Version 1 implementation only**, not the permanent domain model. Round robin, group-stage, league, best-of, casual and individual formats must remain future-compatible. This document is retained as history.

---

## 1. Purpose

Define how tournaments (a distinct experience type) are structured and operated in the Super Admin: brackets, scoring, seeding, and the roles of coordinators and referees.

## 2. Scope and assumptions

- A tournament is a scheduled event room (or series) of matches with multiple participants.
- Tournaments are company-operated like other experiences; participants pay to join as individuals or pairs/teams (format open).
- Tournament formats in v1 (draft): single-elimination brackets; round-robin groups are an open question.

## 3. Tournament concepts

| Term | Definition |
| --- | --- |
| Tournament | The overall event |
| Bracket | The elimination structure of matches |
| Match | One pairing with a recorded result |
| Seeding | Initial ordering that shapes the bracket |
| Score | Recorded result per match (points, sets, wickets, etc., per activity rules) |
| Referee | Staff official scoring and adjudicating matches |
| Coordinator | Staff responsible for the overall event logistics |

## 4. Tournament lifecycle

```
Create tournament → Define format → Seed participants → Open bracket →
Run matches (score) → Progress bracket → Champion → Close tournament
```

| Stage | Key actions |
| --- | --- |
| Create | Name, activity, venue, dates, capacity, price |
| Define format | Bracket type, match structure, scoring rules |
| Seed | Random seeding by default; manual override allowed (open) |
| Open | Bookings open; participants join as individuals/pairs/teams |
| Run | Coordinator starts matches; referee records scores |
| Progress | Bracket advances automatically or with confirmation (open) |
| Close | Final results, ratings, analytics |

## 5. Bracket design (draft)

| Aspect | Draft |
| --- | --- |
| Type | Single-elimination |
| Sizing | Bracket sizes fit participant count (e.g., 4/8/16); byes handled for non-powers-of-two |
| Seeding | Random default; manual seeding for fairness (open) |
| Advancement | Winner advances automatically after score entry |
| Consolation | Consolation matches for early exits — open question |

## 6. Scoring

| Aspect | Draft |
| --- | --- |
| Recorded by | Referee (primary), coordinator (fallback) |
| Input | Score per match per activity rules |
| Validation | Score sanity checks per activity (draft) |
| Visibility | Results visible in admin; participant-visible summary is an open question |
| Corrections | Score edits audited; referee or coordinator approval required |

## 7. Roles at the tournament

- **Referee:** on-court official; enters scores, adjudicates disputes, reports incidents.
- **Coordinator:** runs logistics (check-in, bracket start/stop, equipment).
- **Safety Officer:** on-site escalation for incidents (see `docs/admin/07-participant-and-safety-management.md`).

Referee assignments and availability are managed in the Staff module (`docs/admin/04-admin-screen-inventory.md`).

## 8. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | Tournaments are an experience type with brackets and scoring in v1. |
| C2 | Single-elimination brackets are the baseline format. |
| C3 | Referees record match scores; coordinators manage logistics. |
| C4 | Seeding is random by default; manual override is an open decision. |
| C5 | Tournaments are paid, limited-slot experiences like other sessions. |

## 9. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | Participants join as individuals or pre-formed pairs/teams (structure open). | Booking model for teams |
| A2 | Score entry is manual by referees (no live scoring integration). | If live scoring needed, scope grows |
| A3 | Bracket advancement is confirmed by staff, not fully automatic. | Automation level |
| A4 | Match scheduling within the tournament is predefined. | Dynamic scheduling complexity |

## 10. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | Do participants join tournaments individually, as pairs, or as teams? | Booking, brackets |
| Q2 | Are round-robin groups needed in v1? | Format scope |
| Q3 | Can participants see live brackets, or only after the event? | Customer app scope |
| Q4 | How are byes and walkovers handled and recorded? | Bracket logic |
| Q5 | Is there a consolation bracket / rankings for all participants? | Bracket design |
| Q6 | What happens if a match cannot be completed (injury, weather)? | Tournament ops |

## 11. Dependencies

- **Workflow:** tournament sessions follow the event-room lifecycle (`docs/admin/05-event-management-workflow.md`).
- **Safety:** incidents during matches handled via `docs/admin/07-participant-and-safety-management.md`.
- **Analytics:** tournament outcomes feed `docs/admin/10-admin-analytics-and-reports.md`.

## 12. Related documents

- `docs/admin/04-admin-screen-inventory.md`
- `docs/admin/05-event-management-workflow.md`
