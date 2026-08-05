# 11 — Event and Session Domain Model

> **Status:** Planning draft — decision-resolution phase (SA-0C).
> **Document type:** Domain vocabulary and meaning.
> **This document is a planning draft.** It defines domain meaning only. **No database collections or schemas are designed here.**

---

## 1. Purpose

Clarify the meaning of every domain term used across the platform so that screens, analytics and later schema design share one vocabulary. This document also resolves a terminology problem: the earlier docs use "event room" inconsistently.

## 2. The terminology problem with "event room"

Earlier documents (e.g., `docs/admin/05-event-management-workflow.md`, `docs/database/01-domain-entity-draft.md`) use **event room** to mean "a specific scheduled session of an experience (date, time, venue)". The word "room" conflates two different things:

- a **scheduled occurrence** (a time-based unit), and
- a **physical place** (where the activity happens).

A venue can have multiple playing areas, and a scheduled occurrence may span multiple playing areas (e.g., a tournament using two courts). Using one term for both creates ambiguity.

**Recommendation (DEC-SA-019):** deprecate "event room" in favour of two distinct terms:

| Term | Meaning |
| --- | --- |
| **Session** | A scheduled occurrence of an experience at a date/time (the schedulable, bookable unit). |
| **Playing area** | A physical sub-area within a venue where activity happens (court, ground, pitch, table). |

Legacy docs continue to use "event room" until they are updated; a mapping table is provided in §4. This document is the canonical vocabulary going forward.

## 3. Canonical domain vocabulary

| Term | Definition | Examples | Previously called |
| --- | --- | --- | --- |
| Activity category | The kind of activity; defines rules, formats, defaults. | Badminton, cricket, box cricket, indoor games, tournaments | Activity category |
| Experience template | A reusable program definition (recurring offering). | "Saturday Box Cricket" | Experience |
| Event | An organized occurrence; the umbrella concept that may be a single session or a tournament. | Saturday box cricket event; weekend badminton tournament | Event |
| Session | A single scheduled instance of an experience template (one date/time window). | "Saturday Box Cricket — Aug 15, 7:00 PM" | Event room / event slot |
| Playing area | A physical sub-area within a venue where one activity runs. | Court 1, Ground A, Table 4 | Room / court (informal) |
| Venue | A physical location that contains one or more playing areas. | Sports club, indoor hall | Venue |
| Booking | A participant's reserved/confirmed position on a session (one or more slots). | One participant, one slot on session S | Booking |
| Participant | A person who has joined an activity. | A player | Participant |
| Team | A group of participants allocated together for a session. | Team A (6 players) | Team |
| Match | One competition between two (or more) participants/teams. | Badminton doubles match | Match |
| Tournament | An event composed of multiple matches with a defined structure. | Single-elimination badminton tournament | Tournament |
| Staff assignment | Association of a staff member, role and session/event. | Lead coordinator on session S | Assignment |

## 4. Legacy term mapping

| Legacy term | Canonical term | Notes |
| --- | --- | --- |
| Event room | Session | Where "event room" meant the scheduled occurrence |
| Event slot | Session | Same as above |
| Court / ground / playing area | Playing area | Physical sub-area |
| Experience | Experience template | The reusable program definition |
| Event | Event | Retained as umbrella concept |

> **Note on "Event" vs "Session":** "Event" is the umbrella; "session" is the concrete scheduled instance. A tournament is an event made of matches (and often of sub-sessions). A simple one-off game is both an event and a session. Where a term is needed for the schedulable bookable unit, use **session**.

## 5. Recurring activities (worked example)

The recurring model from `docs/product/05-v1-operating-model.md` (DEC-SA-007) maps as follows:

```
Experience template:  "Saturday Box Cricket"
  └─ Session:  "Saturday Box Cricket — Aug 15, 7:00 PM" @ Venue X, Ground A
       ├─ capacity: 12 slots
       ├─ bookings (each → participant)
       ├─ teams: Team A (6), Team B (6)  [random allocation pre-event]
       └─ matches: Match 1 (Team A vs Team B)

Experience template:  "Sunday Morning Badminton Doubles"
  └─ Session:  "Sunday Morning Badminton Doubles — Aug 16, 8:00 AM"
       ├─ venue: Club Y (2 playing areas: Court 1, Court 2)
       ├─ capacity: 8 slots (4 per court)
       └─ matches: 2 doubles matches running concurrently
```

Key points:

- One **experience template** produces many **sessions**.
- One **session** runs at one **venue**, but may use multiple **playing areas**.
- One **session** may contain multiple **teams** and **matches**.
- A **session** is the smallest unit customers book.

## 6. Decision topics

### 6.1 Canonical domain vocabulary adopted

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Mixed terms ("experience", "event", "event room", "slot") across earlier docs. |
| 2 | Options | (a) Adopt the vocabulary above, (b) keep "event room", (c) invent new terms. |
| 3 | Benefits | Single vocabulary for screens, analytics, schema; matches how operators speak. |
| 4 | Risks | Migration cost of updating earlier docs; residual legacy usage (RSK-SA-002). |
| 5 | Operational consequences | Ops screens will label things "session", "playing area", "event" clearly. |
| 6 | Technical consequences | Future schema uses these entity names; no schema now. |
| 7 | Recommended v1 decision | Adopt canonical vocabulary in this document. |
| 8 | Unresolved | Whether "match" needs sub-terms per activity (innings, sets). |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-018** |

### 6.2 Deprecate "event room"

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | "Event room" used across legacy docs; ambiguous (time vs. place). |
| 2 | Options | (a) Replace with "session" (+ "playing area"), (b) redefine "event room" narrowly, (c) keep both. |
| 3 | Benefits | Removes ambiguity; session = schedulable unit; playing area = physical unit. |
| 4 | Risks | Renaming churn in legacy docs (RSK-SA-002). |
| 5 | Operational consequences | Staff understand "session" for schedules and "playing area" for space allocation. |
| 6 | Technical consequences | No schema impact now; naming discipline in future design. |
| 7 | Recommended v1 decision | Deprecate "event room"; use "session" and "playing area" per §3. |
| 8 | Unresolved | None. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-019** |

### 6.3 Session is the smallest bookable unit

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Capacity modeled on the schedulable unit in earlier entity draft. |
| 2 | Options | (a) Book at session level, (b) book at playing-area level, (c) book at match level. |
| 3 | Benefits | (a) matches customer mental model and slot economics. |
| 4 | Risks | Multi-area sessions need capacity summing rules (RSK-SA-002). |
| 5 | Operational consequences | Capacity = sum of usable slots across the session's playing areas. |
| 6 | Technical consequences | Capacity aggregation rule; no schema now. |
| 7 | Recommended v1 decision | Booking is at session level; capacity derives from its playing areas. |
| 8 | Unresolved | None for v1. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-020** |

## 7. Confirmed decisions (this workstream)

| ID | Decision | Status |
| --- | --- | --- |
| DEC-SA-018 | Adopt canonical domain vocabulary | Proposed |
| DEC-SA-019 | Deprecate "event room"; use "session" + "playing area" | Proposed |
| DEC-SA-020 | Session is the smallest bookable unit | Proposed |

## 8. Open questions raised

| ID | Question | Owner |
| --- | --- | --- |
| OQ-SA-052 | Do match sub-terms (innings, sets, overs) need a shared model per activity? | Ops + Analyst |

## 9. Dependencies

- **Capacity:** session-level capacity in `docs/admin/12-capacity-reservation-and-waitlist-policy.md`.
- **Tournaments:** matches under events in `docs/admin/14-tournament-formats-and-scoring.md`.
- **Entity draft:** supersedes terminology in `docs/database/01-domain-entity-draft.md` (kept for history).

## 10. Related documents

- `docs/admin/05-event-management-workflow.md`
- `docs/database/01-domain-entity-draft.md`
- `docs/product/05-v1-operating-model.md`
