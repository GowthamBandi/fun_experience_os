# 02 — Event Staffing and Responsibility Model

> **Status:** Planning draft — decision-resolution phase (SA-0C).
> **Document type:** Staffing and accountability.
> **This document is a planning draft.** It replaces the earlier assumption of "one coordinator per session" (ASM-SA-039) with a flexible staffing model. Nothing here is implemented.

---

## 1. Purpose

Define who does what at an event, which assignments are required versus optional, how staff check in and are substituted, and how authority (opening, closure, scores, incidents, emergencies) is delegated. This is the accountability backbone for `docs/operations/01-event-operations-lifecycle.md`.

## 2. Staff assignment types

| Type | Responsibility | Typically required for |
| --- | --- | --- |
| Lead coordinator | Overall event accountability; opening/closing; escalation | All events |
| Supporting coordinator | Assists with check-in, flow, crowd, logistics | Larger/casual-multi events |
| Referee | Match adjudication and score submission | Tournaments, competitive single events |
| Activity specialist | Rules expertise, drills, game setup | New or specialist activities |
| Safety contact | Duty-of-care owner; incident handling; emergency access | High-risk events, all events ideally |
| Venue contact | Venue-side liaison (access, facilities, issues) | Every venue session (may be shared) |
| Check-in staff | Participant validation and temp-ID checks | Larger sessions |
| Equipment handler | Setup/teardown and equipment accountability | Box cricket, tournaments |

## 3. Required vs optional assignments (draft)

| Event type | Required | Optional |
| --- | --- | --- |
| Casual single session (badminton) | Lead coordinator | Safety contact, venue contact |
| Box cricket session | Lead coordinator, equipment handler | Referee, safety contact |
| Competitive single session | Lead coordinator, referee | Safety contact, check-in staff |
| Tournament | Lead coordinator, referee(s), safety contact, check-in staff | Supporting coordinator, equipment handler |
| Adventure activity | Lead coordinator, safety contact, activity specialist | — |
| Social experience | Lead coordinator | Supporting coordinator |

> Minimum staffing rules are **configurable per event type**; the table above is the proposed v1 default (DEC-SA-054).

## 4. Staff workflows

### 4.1 Staff check-in
- Staff confirm presence via the admin at the venue (role: coordinator/safety).
- A missing required assignment before start triggers the absence flow (§4.3).

### 4.2 Substitution
- Ops may substitute a staff member for another with the same role.
- Substitutions are audited; the on-site lead is always identifiable.

### 4.3 Absence
- If a **required** assignment is absent at start, the lead coordinator (or Ops via phone) decides: run with cover, merge roles, or escalate to cancellation decision.
- Recorded in the session log.

### 4.4 Escalation
| Level | Issue | Escalate to |
| --- | --- | --- |
| On-site | Minor disputes, equipment issues | Lead coordinator |
| Operations | Min-fill, refunds, substitution gaps | Event Operations Manager |
| Safety | Injury, threat, incident | Safety contact → Safety & Moderation Officer |
| Emergency | Life-safety emergency | Emergency services first, then escalation |
| Governance | Misconduct by staff | Safety Officer + Super Admin |

### 4.5 Emergency authority
- The safety contact (or lead coordinator) may close the event immediately (DEC-SA-014).
- Emergency access to participant identity/contact is allowed during an active incident and is audited (DEC-SA-037).

## 5. Responsibility boundaries

| Action | Who can do it | Requires |
| --- | --- | --- |
| Open an event | Lead coordinator | Session in scheduled/closing state |
| Check participants in | Check-in staff, coordinator | Temp-ID validation |
| Submit match scores | Referee (primary), coordinator (fallback) | Match in progress |
| Approve/correct scores | Referee or coordinator | Audited |
| Close an event | Lead coordinator | All matches/results resolved |
| Log an incident | Anyone on-site staff | Immediate entry |
| Approve refunds | Customer Support (within limits) / Finance | Threshold per roles doc |
| Cancel session | Event Ops Manager | Approval + audit |

## 6. Decision topics

### 6.1 Flexible staffing model

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Earlier docs assumed one coordinator per session (ASM-SA-039). |
| 2 | Options | (a) Flexible role-based model, (b) fixed one-coordinator, (c) per-event custom. |
| 3 | Benefits | Scales from a casual session to a tournament; clarity of accountability. |
| 4 | Risks | Under-staffing if minimums are not enforced (RSK-SA-011). |
| 5 | Operational consequences | Roster planning by event type; same person may hold multiple roles at small events. |
| 6 | Technical consequences | Staff assignment entity with role type; no single-coordinator assumption. |
| 7 | Recommended v1 decision | Adopt flexible staffing; supersede ASM-SA-039. |
| 8 | Unresolved | Whether one person may hold lead coordinator + referee at the same event. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-053** |

### 6.2 Minimum staffing rules

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | No minimums defined. |
| 2 | Options | Configurable per event type (default table in §3). |
| 3 | Benefits | Safety and quality floor per event type. |
| 4 | Risks | Too-strict minimums raise cost (RSK-SA-011). |
| 5 | Operational consequences | Scheduling blocks publish until required roles assigned. |
| 6 | Technical consequences | Assignment validation before publish. |
| 7 | Recommended v1 decision | Enforce required roles before a session goes live; allow cover decisions as exceptions. |
| 8 | Unresolved | Final minimum-staffing table. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-054** |

### 6.3 Staff check-in, substitution, absence

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Undefined previously. |
| 2 | Options | Standardize check-in + substitution + absence flow (§4.1–4.3). |
| 3 | Benefits | Predictable operations; audit trail of who was on site. |
| 4 | Risks | Manual process noise (RSK-SA-011). |
| 5 | Operational consequences | Ops gets early signal on absences. |
| 6 | Technical consequences | Staff check-in records; absence flags. |
| 7 | Recommended v1 decision | Adopt §4.1–4.3 workflows. |
| 8 | Unresolved | Absence window (how late can cover be arranged). |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-055** |

### 6.4 Escalation and emergency authority

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Emergency closure defined in WS1 (DEC-SA-014). |
| 2 | Options | On-site authority + escalation chain (§4.4–4.5). |
| 3 | Benefits | Safety decisions happen fast; governance preserved. |
| 4 | Risks | Authority misuse (RSK-SA-011). |
| 5 | Operational consequences | Clear who decides what, on-site and remotely. |
| 6 | Technical consequences | Escalation matrix as config; incident access elevation. |
| 7 | Recommended v1 decision | Adopt §4.4–4.5 escalation and emergency authority. |
| 8 | Unresolved | None. |
| 9 | External review | Legal review of emergency procedures recommended. |
| 10 | Decision status | **Proposed — DEC-SA-056** |

### 6.5 Opening, closure, scores, incidents

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Responsibilities spread across docs. |
| 2 | Options | Consolidate into the boundary table in §5. |
| 3 | Benefits | Single accountability reference. |
| 4 | Risks | Role overlaps cause disputes (RSK-SA-011). |
| 5 | Operational consequences | Coordinators and referees know their lane. |
| 6 | Technical consequences | Permission-gated actions. |
| 7 | Recommended v1 decision | Adopt §5 responsibility boundaries. |
| 8 | Unresolved | None. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-057** |

## 7. Confirmed decisions (this workstream)

| ID | Decision | Status |
| --- | --- | --- |
| DEC-SA-053 | Flexible role-based staffing; supersedes single-coordinator assumption | Proposed |
| DEC-SA-054 | Configurable minimum staffing by event type | Proposed |
| DEC-SA-055 | Staff check-in, substitution, absence workflows | Proposed |
| DEC-SA-056 | Escalation chain and emergency authority | Proposed |
| DEC-SA-057 | Responsibility boundary table | Proposed |

## 8. Assumptions introduced

| ID | Assumption |
| --- | --- |
| ASM-SA-035 | A single person may hold multiple roles at small events (subject to conflict rules). |
| ASM-SA-036 | Venue contact can be shared across sessions at the same venue. |

## 9. Open questions raised

| ID | Question | Owner |
| --- | --- | --- |
| OQ-SA-060 | Same-gender coordinator requirement for women-only sessions (ties to gender policy)? | Founder + Ops |
| OQ-SA-065 | May one person be lead coordinator and referee at the same event? | Ops |
| OQ-SA-066 | Absence window for arranging cover? | Ops |

## 10. Dependencies

- **Lifecycle:** `docs/operations/01-event-operations-lifecycle.md`.
- **Tournaments:** referee duties in `docs/admin/14-tournament-formats-and-scoring.md`.
- **Safety:** incident and emergency access in `docs/security/02-anonymity-and-reveal-policy.md`.

## 11. Related documents

- `docs/admin/02-admin-users-and-roles.md`
- `docs/product/05-v1-operating-model.md`
