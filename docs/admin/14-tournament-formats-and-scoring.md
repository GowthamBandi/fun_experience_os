# 14 — Tournament Formats and Scoring

> **Status:** Planning draft — decision-resolution phase (SA-0C).
> **Document type:** Tournament scope and rules.
> **This document is a planning draft.** Single elimination is the **proposed Version 1 implementation only**, not the permanent domain model. **No tournament algorithms are specified here.**

---

## 1. Purpose

Define the tournament domain so future formats can be added, then fix the Version 1 rules for team creation, seeding, byes, scheduling, scoring, result confirmation and completion. This document supersedes the narrow framing of `docs/admin/08-tournament-management.md` (which remains valid history).

## 2. Future-compatible format support

The domain model must support, and the admin design must not preclude:

| Format | Meaning | v1 status |
| --- | --- | --- |
| Single elimination | Loser of a match is out | **Proposed v1 implementation** |
| Round robin | Everyone plays everyone in a group | Future |
| Group stage + knockout | Groups then knockouts | Future |
| League table | Points table over a period | Future |
| Best-of series | Multiple matches per pairing | Future |
| Casual match series | Repeated casual matches without a ladder | Future |
| Individual competitions | Individuals (not teams) ranked | Future |

> **Design rule (DEC-SA-048):** brackets, matches, scores and standings are modeled so a new format can be layered on without redesigning the core tournament entity.

## 3. Version 1 tournament rules

### 3.1 Team creation

| Aspect | v1 rule (draft) |
| --- | --- |
| Entry unit | Team (pre-formed) or individual with auto-placement into a team — open decision (OQ-SA-022) |
| Team size | Per activity template (e.g., box cricket team size) |
| Team naming | Company-issued or participant-chosen alias (not legal names) |
| Capacity | Fixed tournament capacity; booking at session level per WS2 |

### 3.2 Seeding and random assignment

| Aspect | v1 rule (draft) |
| --- | --- |
| Default | Random seeding |
| Manual override | Allowed, role-limited, audited |
| Fairness | No skill-based seeding in v1 (no ratings yet) |

### 3.3 Byes

| Aspect | v1 rule (draft) |
| --- | --- |
| Handling | Byes assigned for non-power-of-two field sizes |
| Recording | Byes are recorded; a bye is not a walkover |

### 3.4 Match scheduling

| Aspect | v1 rule (draft) |
| --- | --- |
| Predefined | Match slots defined before the event |
| Progression | Next round opens after results confirmed |
| Venue | Matches map to playing areas within the venue |

### 3.5 Score submission, correction, confirmation

| Aspect | v1 rule (draft) |
| --- | --- |
| Submission | Referee (primary) or coordinator (fallback) submits scores |
| Validation | Basic sanity checks per activity rules |
| Correction | Audited; referee or coordinator approval required |
| Confirmation | Result becomes official after confirmation; bracket advances |

### 3.6 Disqualification, walkover, abandoned match

| Aspect | v1 rule (draft) |
| --- | --- |
| Disqualification | Decision recorded with reason; opponent advances |
| Walkover | Opponent awarded the match; recorded, not scored |
| Abandoned match | Recorded with reason; no winner; bracket resolution is a staff decision |

### 3.7 Tie handling

| Aspect | v1 rule (draft) |
| --- | --- |
| Ties | Per-activity tie rules (e.g., super over, tie-break game) are configurable |
| No tie rule configured | Staff decision, audited |

### 3.8 Winner declaration and completion

| Aspect | v1 rule (draft) |
| --- | --- |
| Winner | Declared after final result confirmed |
| Completion | Coordinator closes the tournament; standings recorded; analytics updated |

## 4. Decision topics

### 4.1 Single elimination as v1 scope

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Earlier docs labelled single elimination the "baseline" (D-015). |
| 2 | Options | (a) Single elimination only in v1, (b) multi-format in v1, (c) no tournaments in v1. |
| 3 | Benefits | (a) validates tournaments with least complexity. |
| 4 | Risks | Bracket edge cases (byes, walkovers) still need care (RSK-SA-010). |
| 5 | Operational consequences | Referees and coordinators run one predictable structure. |
| 6 | Technical consequences | Model formats generically to avoid rework (DEC-SA-048). |
| 7 | Recommended v1 decision | Single elimination implemented in v1; future formats designed for, not built. |
| 8 | Unresolved | None for v1 scope. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-048** |

### 4.2 Entry unit (teams vs individuals)

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Previously open (Q-022). |
| 2 | Options | (a) Pre-formed teams, (b) individuals auto-placed, (c) both. |
| 3 | Benefits | (a) simpler for sports like box cricket; (b) lowers entry friction. |
| 4 | Risks | Auto-placement with strangers needs trust mechanisms (RSK-SA-010). |
| 5 | Operational consequences | Check-in and bracket seeding depend on entry unit. |
| 6 | Technical consequences | Booking model for tournament slots. |
| 7 | Recommended v1 decision | Both: pre-formed teams for team sports; individual entry for individual sports. |
| 8 | Unresolved | Exact auto-placement rules for individuals. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-049** |

### 4.3 Scoring control

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Referee-first scoring assumed. |
| 2 | Options | (a) Referee/coordinator only, (b) participant-reported, (c) automated. |
| 3 | Benefits | (a) keeps integrity. |
| 4 | Risks | Manual-only can be slow (RSK-SA-010). |
| 5 | Operational consequences | Score approval owner per match. |
| 6 | Technical consequences | Score state machine (submitted → confirmed → corrected). |
| 7 | Recommended v1 decision | Staff-only submission with audited corrections. |
| 8 | Unresolved | Whether participants see live brackets (Q-024/OQ-SA-024). |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-050** |

### 4.4 Result edge cases

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Byes/walkovers/ties previously open (Q-025). |
| 2 | Options | Standardized handling per §3.6–3.7 with staff decision on unconfigured cases. |
| 3 | Benefits | Predictable, auditable outcomes. |
| 4 | Risks | Staff discretion inconsistent (RSK-SA-010). |
| 5 | Operational consequences | Coordinators follow the recorded rules. |
| 6 | Technical consequences | Result type taxonomy (win/loss/walkover/abandoned/disqualified). |
| 7 | Recommended v1 decision | Adopt §3.6–3.7 rules; unconfigured cases are staff decisions, audited. |
| 8 | Unresolved | Per-activity tie rules. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-051** |

### 4.5 Completion and standings

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | No completion flow defined. |
| 2 | Options | Final match result → winner → standings snapshot → close. |
| 3 | Benefits | Clean analytics and rating inputs. |
| 4 | Risks | None significant. |
| 5 | Operational consequences | Coordinator closes; results feed analytics. |
| 6 | Technical consequences | Standings snapshot at completion. |
| 7 | Recommended v1 decision | Winner declared on final confirmation; coordinator closes; standings recorded. |
| 8 | Unresolved | Whether individual ratings derive from results. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-052** |

## 5. Confirmed decisions (this workstream)

| ID | Decision | Status |
| --- | --- | --- |
| DEC-SA-048 | Single elimination = proposed v1 implementation; model stays future-compatible | Proposed |
| DEC-SA-049 | Team + individual entry supported | Proposed |
| DEC-SA-050 | Staff-only score submission with audited corrections | Proposed |
| DEC-SA-051 | Standardized result edge-case handling | Proposed |
| DEC-SA-052 | Winner declaration + completion snapshot | Proposed |

## 6. Assumptions introduced

| ID | Assumption |
| --- | --- |
| ASM-SA-033 | Tournament demand is strong enough in v1 to meet minimums without prior single-event validation. |
| ASM-SA-034 | Referee staffing can be scaled for tournament match volume. |

## 7. Open questions raised

| ID | Question | Owner |
| --- | --- | --- |
| OQ-SA-022 | Tournament entry: pre-formed teams, individuals, or both in v1? | Founder |
| OQ-SA-024 | Can participants see live brackets, or only after the event? | Founder |
| OQ-SA-063 | Per-activity tie-break rules (super over, tie-break)? | Ops |
| OQ-SA-064 | Do standings generate participant ratings in v1? | Analyst |

## 8. Dependencies

- **Domain model:** `docs/admin/11-event-and-session-domain-model.md`.
- **Staffing:** referee roles in `docs/operations/02-event-staffing-and-responsibility-model.md`.
- **Operating model:** tournament cadence in `docs/product/05-v1-operating-model.md`.

## 9. Related documents

- `docs/admin/08-tournament-management.md`
- `docs/admin/04-admin-screen-inventory.md`
