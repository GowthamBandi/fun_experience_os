# 05 — Version 1 Operating Model

> **Status:** Planning draft — decision-resolution phase (SA-0C).
> **Document type:** Launch operating model proposal.
> **This document is a planning draft.** It proposes a launch configuration for Version 1. Nothing described here is implemented, and nothing here is a permanent platform limitation.

---

## 1. Purpose

Define the proposed operating model for the Version 1 launch: which city model, which activities, how events are staffed and operated, and how operational edge cases (weather, no-shows, waitlists, cancellations) are handled. Each topic below follows the decision format: current context → options → recommendation → status.

Decision identifiers in this document use the `DEC-SA-###` namespace (see `docs/project-records/01-decisions-log.md`).

## 2. Proposed launch configuration (draft)

| Parameter | Proposed v1 value | Status |
| --- | --- | --- |
| Cities | One city | Proposed |
| Operating model | Company-operated events only | Proposed |
| Focus | Sports-first | Proposed |
| Initial activity mix | Box cricket, badminton, selected indoor games | Proposed |
| Participant age | Adults 18 and above | Proposed |
| Team allocation | Random, shortly before the event | Confirmed (existing) |

> This configuration is **proposed for launch only** and is explicitly not a permanent platform constraint. Expansion to more cities, activities and formats is expected after v1 is validated.

## 3. Decision topics

### 3.1 One-city launch

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Earlier docs assumed single-city launch (`docs/product/04-v1-scope.md`) without deciding the city. |
| 2 | Options | (a) Single city, (b) two pilot cities, (c) city-agnostic build with first city at go-live. |
| 3 | Benefits | Focused operations, smaller staffing pool, faster learning, lower risk. |
| 4 | Risks | Sample size too small to validate demand; one city's failure reads as product failure (RSK-SA-014). |
| 5 | Operational consequences | All venue contracts, staffing and marketing in one service area. |
| 6 | Technical consequences | Admin must still support a city scope from day one (design once, run one). |
| 7 | Recommended v1 decision | Launch one city; exact city is a founder decision (OQ-SA-038). |
| 8 | Unresolved | Which city; service-area radius. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-001** |

### 3.2 Company-operated events only

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Confirmed in product vision (D-004): the company creates, prices, schedules and operates. |
| 2 | Options | (a) Company-operated only, (b) company + approved partners, (c) full marketplace. |
| 3 | Benefits | Quality and safety control; consistent pricing; simpler liability. |
| 4 | Risks | Staffing capacity limits growth; venue dependency (RSK-SA-011). |
| 5 | Operational consequences | Company hires coordinators/referees; no third-party host onboarding in v1. |
| 6 | Technical consequences | No host marketplace module; admin has single operator context. |
| 7 | Recommended v1 decision | Company-operated only. |
| 8 | Unresolved | None for v1; partner model is a post-v1 question. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-002** (reaffirms legacy D-004) |

### 3.3 Initial activity categories

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Full candidate list includes badminton, cricket, box cricket, indoor games, tournaments, adventure, social. No launch subset decided. |
| 2 | Options | (a) Box cricket + badminton + selected indoor games (sports-first), (b) broaden to adventure/social immediately, (c) narrow to one activity. |
| 3 | Benefits | Options (a) uses low-complexity, repeatable, high-frequency activities that fit a company-operated model. |
| 4 | Risks | Social/adventure demand untested; indoor games may be hard to differentiate (RSK-SA-009). |
| 5 | Operational consequences | Simple equipment, well-understood venue needs; a small staff team can run most sessions. |
| 6 | Technical consequences | Activity category must be extensible; tournament features needed only for tournament categories. |
| 7 | Recommended v1 decision | Launch set: box cricket, badminton, selected indoor games. Tournaments follow once single events are validated. |
| 8 | Unresolved | Exact indoor-games list; whether a weekend tournament pilot is included at launch. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-003** |

### 3.4 Version 1 age boundary (18+)

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Docs use "18+ (exact values open)" as a default assumption. |
| 2 | Options | (a) 18+ only, (b) 16+ with guardian consent, (c) mixed adult/all-age with per-activity rules. |
| 3 | Benefits | Simpler liability, no guardian flows, aligned with adult sports/evening venues. |
| 4 | Risks | Excludes a segment; age check needs verification support (RSK-SA-003). |
| 5 | Operational consequences | Staff do not manage minors; venue contracts simpler. |
| 6 | Technical consequences | An age-gate and age verification hook are needed; identity verification stays conditional. |
| 7 | Recommended v1 decision | 18+ adults only. |
| 8 | Unresolved | Age-verification method; exact policy wording. |
| 9 | External review | Legal review recommended for age-boundary wording and verification. |
| 10 | Decision status | **Proposed — DEC-SA-004** |

### 3.5 Weekday versus weekend operations

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | No operating-hours model exists yet. |
| 2 | Options | (a) Weekends + weekday evenings, (b) weekends only, (c) full week daytime + evening. |
| 3 | Benefits | Evening/weekend matches working-adult demand; keeps staffing peaks manageable. |
| 4 | Risks | Capacity underused during weekday daytime (RSK-SA-008). |
| 5 | Operational consequences | Venue contracts for specific time bands; staffing rosters by daypart. |
| 6 | Technical consequences | Sessions carry daypart-aware scheduling; no new architecture needed. |
| 7 | Recommended v1 decision | Weekends plus weekday evenings; daypart rules configurable per venue. |
| 8 | Unresolved | Exact slot times and daypart pricing. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-005** |

### 3.6 Venue partnerships

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Assumed per-slot venue rental in earlier docs. |
| 2 | Options | (a) Per-slot rental contracts, (b) dedicated court/ground lease, (c) revenue-share with venue. |
| 3 | Benefits | Per-slot (a) is lowest-risk for one-city testing. |
| 4 | Risks | Availability gaps; price volatility (RSK-SA-001). |
| 5 | Operational consequences | Admin records venue slots and rental cost per session for margin. |
| 6 | Technical consequences | Venue + playing area entities with cost fields; no venue-system integration in v1. |
| 7 | Recommended v1 decision | Per-slot rental contracts, tracked manually in the admin. |
| 8 | Unresolved | Venue selection; rental rate negotiation. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-006** |

### 3.7 Activity frequency and recurring templates

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Earlier docs model recurring "experience templates" producing scheduled sessions. Frequency rules unset. |
| 2 | Options | (a) Fixed recurring templates (e.g., weekly box cricket), (b) one-off events, (c) mixed. |
| 3 | Benefits | Recurring cadence builds habit and predictable fill. |
| 4 | Risks | Rigid cadence may not fit demand; per-slot rentals complicate fixed weekly slots (RSK-SA-008). |
| 5 | Operational consequences | Weekly schedule published in advance; staff rostered on cadence. |
| 6 | Technical consequences | Requires template → session expansion; see `docs/admin/11-event-and-session-domain-model.md`. |
| 7 | Recommended v1 decision | Recurring weekly templates per experience; one-off sessions allowed as exception. |
| 8 | Unresolved | Cadence per activity (weekly vs. biweekly); advance-publishing horizon. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-007** |

### 3.8 Minimum and maximum participant counts

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Fixed capacity confirmed; minimums open. |
| 2 | Options | Configure per activity: min (to run) and max (to sell). |
| 3 | Benefits | Predictable sessions; protects margin. |
| 4 | Risks | Too-high minimums cancel sessions; too-low hurts economics (RSK-SA-008). |
| 5 | Operational consequences | Ops must decide go/cancel at a cutoff time. |
| 6 | Technical consequences | Min/max are config on experience templates; enforced server-side (see `docs/admin/12-capacity-reservation-and-waitlist-policy.md`). |
| 7 | Recommended v1 decision | Per-activity min and max; default min ~60% of max where viable; final values configurable. |
| 8 | Unresolved | Final numeric values per activity (OQ-SA-040). |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-008** |

### 3.9 Cancellation when minimum participation is not reached

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Confirmed: company cancellation → full refund (D-011). Cutoff timing open. |
| 2 | Options | (a) Auto-cancel at fixed cutoff (e.g., T-6h), (b) ops decision with approval, (c) run below minimum at a loss. |
| 3 | Benefits | Auto-cancel is predictable for participants and staff. |
| 4 | Risks | Early/late cutoff both have downsides; customer trust risk (RSK-SA-008). |
| 5 | Operational consequences | Standardized cutoff; all affected participants auto-refunded and notified. |
| 6 | Technical consequences | Scheduled job + refund trigger; recorded in audit. |
| 7 | Recommended v1 decision | Ops decides at a fixed cutoff with a recorded reason; auto-refund on cancel. |
| 8 | Unresolved | Cutoff duration; whether participants see a "needs X more" state. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-009** |

### 3.10 Staff and coordinator requirements

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Earlier docs assumed one coordinator per session. |
| 2 | Options | Flexible staffing: lead coordinator + optional supporting roles (see `docs/operations/02-event-staffing-and-responsibility-model.md`). |
| 3 | Benefits | Scales from small indoor sessions to tournaments. |
| 4 | Risks | Under-staffing at busy sessions (RSK-SA-011). |
| 5 | Operational consequences | Minimum staffing rules per event type. |
| 6 | Technical consequences | Staff assignment entity with role types; no single-coordinator hardcode. |
| 7 | Recommended v1 decision | Adopt flexible staffing model; supersede the "one coordinator" assumption (ASM-SA-039). |
| 8 | Unresolved | Exact minimum-staffing table per event type. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-010** |

### 3.11 Referees and activity specialists

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Referees referenced for tournaments; specialists not defined. |
| 2 | Options | (a) Referee required for tournaments only, (b) also for competitive single events, (c) none for casual sessions. |
| 3 | Benefits | Keeps casual sessions cheap; ensures credibility for competitive formats. |
| 4 | Risks | Score disputes without referees (RSK-SA-010). |
| 5 | Operational consequences | Referee pool per city; assignment per session type. |
| 6 | Technical consequences | Referee as a staff-assignment type; score approval workflow. |
| 7 | Recommended v1 decision | Referees required for tournaments; optional for single competitive sessions; none for casual. |
| 8 | Unresolved | Which single sessions are "competitive." |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-011** |

### 3.12 Equipment responsibility

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Equipment assumed company-provided in earlier docs. |
| 2 | Options | (a) Company supplies all, (b) venue supplies, (c) participants bring own (BYO). |
| 3 | Benefits | Company supply ensures consistency and safety checks. |
| 4 | Risks | Cost and logistics; damage liability (RSK-SA-011). |
| 5 | Operational consequences | Equipment checklist per activity; equipment handler role at larger events. |
| 6 | Technical consequences | Equipment list as config data; no inventory system in v1. |
| 7 | Recommended v1 decision | Company supplies standard equipment for box cricket/badminton; indoor games use venue-stored gear where viable. |
| 8 | Unresolved | Equipment purchasing/amortization; damage policy. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-012** |

### 3.13 Weather-related cancellation

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Weather cancellation mentioned as company decision in earlier docs. |
| 2 | Options | (a) Company decision per session, (b) automatic weather rules from data source, (c) participant opt-out on rain. |
| 3 | Benefits | Company decision keeps control; no third-party data dependency. |
| 4 | Risks | Inconsistent calls; late notices (RSK-SA-009). |
| 5 | Operational consequences | Defined threshold and decision authority; full refunds on weather cancellation. |
| 6 | Technical consequences | Cancellation reason taxonomy (weather); notification flow. |
| 7 | Recommended v1 decision | Company decision at a cutoff with recorded reason; full refunds. |
| 8 | Unresolved | Who decides and how late; outdoor-vs-indoor rules. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-013** |

### 3.14 Emergency closure

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Not previously defined. |
| 2 | Options | Immediate closure authority at the event (safety contact/lead coordinator) with escalation. |
| 3 | Benefits | Safety first; staff empowered. |
| 4 | Risks | Misuse of authority (RSK-SA-011). |
| 5 | Operational consequences | Emergency action plan; incident recording; refunds/credits decision after the fact. |
| 6 | Technical consequences | Incident + session state transitions; see `docs/admin/07-participant-and-safety-management.md`. |
| 7 | Recommended v1 decision | Lead coordinator or safety contact may close the event immediately; logged as an incident; participants fully refunded. |
| 8 | Unresolved | Refund/credit mechanism for partially completed sessions. |
| 9 | External review | Legal review recommended for liability language. |
| 10 | Decision status | **Proposed — DEC-SA-014** |

### 3.15 Late arrivals and no-shows

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | No-shows recorded; refund policy open. |
| 2 | Options | Late arrivals: allowed grace period vs. slot forfeiture. No-shows: no refund (existing draft). |
| 3 | Benefits | Clear rules reduce dispute handling. |
| 4 | Risks | Hard rules can alienate customers (RSK-SA-008). |
| 5 | Operational consequences | Check-in window; coordinator discretion for grace. |
| 6 | Technical consequences | Check-in states include late/no-show; analytics feed. |
| 7 | Recommended v1 decision | Defined grace period (configurable, e.g., 15 minutes) after which a slot may be re-released; no-show → no refund. |
| 8 | Unresolved | Exact grace; whether released slots go to waitlist. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-015** |

### 3.16 Waitlists

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Previously listed as open (Q-015). |
| 2 | Options | (a) No waitlist in v1, (b) simple FIFO waitlist with auto-promote on cancellation, (c) waitlist with manual promote. |
| 3 | Benefits | Waitlist recovers cancellations and improves fill (b). |
| 4 | Risks | Promotion timing and payment flow complexity (RSK-SA-006). |
| 5 | Operational consequences | Waitlisted users auto-join when a slot opens; need payment at promotion. |
| 6 | Technical consequences | Waitlist state + reservation expiry interaction; see `docs/admin/12-capacity-reservation-and-waitlist-policy.md`. |
| 7 | Recommended v1 decision | Simple FIFO waitlist with automatic promotion; payment requested on promotion. |
| 8 | Unresolved | Waitlist fee/commitment model (free vs. deposit). |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-016** |

### 3.17 Event rescheduling

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Rescheduling mentioned but undefined. |
| 2 | Options | (a) Move session to new slot with participant re-confirmation, (b) cancel + rebook, (c) no rescheduling. |
| 3 | Benefits | Preserves bookings and revenue when feasible. |
| 4 | Risks | New slot conflicts; participant churn. |
| 5 | Operational consequences | All participants notified; they confirm or are refunded. |
| 6 | Technical consequences | Session state transition + bulk re-confirmation flow. |
| 7 | Recommended v1 decision | Reschedule only when the venue alternative exists; participants re-confirm within a window or are auto-refunded. |
| 8 | Unresolved | Re-confirmation window; credit vs. refund preference. |
| 9 | External review | None. |
| 10 | Decision status | **Proposed — DEC-SA-017** |

## 4. Operating-model summary

| Parameter | Proposed v1 value |
| --- | --- |
| Cities | One |
| Operator | Company only |
| Activity mix | Box cricket, badminton, selected indoor games (sports-first) |
| Age | 18+ adults only |
| Week pattern | Weekends + weekday evenings |
| Venue | Per-slot rental contracts |
| Cadence | Recurring weekly templates |
| Min/max | Per-activity, configurable |
| Min-fill failure | Ops decision at cutoff; auto full refund |
| Staffing | Flexible roles; lead coordinator minimum |
| Referees | Required for tournaments |
| Equipment | Company-supplied standard kit |
| Weather | Company decision at cutoff; full refund |
| Emergency | Immediate closure authority; full refund |
| No-show | No refund |
| Waitlist | FIFO with auto-promotion |
| Rescheduling | With participant re-confirmation |

## 5. Confirmed decisions (this workstream)

| ID | Decision | Status |
| --- | --- | --- |
| DEC-SA-001 | One-city launch | Proposed |
| DEC-SA-002 | Company-operated events only | Proposed |
| DEC-SA-003 | Launch mix: box cricket, badminton, selected indoor games | Proposed |
| DEC-SA-004 | 18+ adult boundary (proposed v1, not permanent) | Proposed |
| DEC-SA-005 | Weekends + weekday evenings | Proposed |
| DEC-SA-006 | Per-slot venue rental contracts | Proposed |
| DEC-SA-007 | Recurring weekly templates | Proposed |
| DEC-SA-008 | Per-activity min/max participant counts | Proposed |
| DEC-SA-009 | Min-fill cancellation at cutoff with auto refund | Proposed |
| DEC-SA-010 | Flexible staffing (supersedes single-coordinator) | Proposed |
| DEC-SA-011 | Referee requirement by event type | Proposed |
| DEC-SA-012 | Company-supplied equipment | Proposed |
| DEC-SA-013 | Weather cancellation: company decision + full refund | Proposed |
| DEC-SA-014 | Emergency closure authority + full refund | Proposed |
| DEC-SA-015 | Grace period + no-refund on no-show | Proposed |
| DEC-SA-016 | FIFO waitlist with auto-promotion | Proposed |
| DEC-SA-017 | Reschedule with re-confirmation | Proposed |

## 6. Assumptions introduced

| ID | Assumption |
| --- | --- |
| ASM-SA-020 | The proposed launch configuration is validated before build and is not permanent. |
| ASM-SA-021 | Weekend/evening demand is strong enough to meet minimums at launch. |
| ASM-SA-022 | Per-slot venue rental rates remain stable for the v1 pilot period. |

## 7. Open questions raised

| ID | Question | Owner |
| --- | --- | --- |
| OQ-SA-038 | Which city launches first, and what is the service-area radius? | Founder |
| OQ-SA-040 | Final numeric min/max participant counts per activity? | Founder + Ops |
| OQ-SA-043 | Final cancellation cutoff and window values per activity? | Founder + Ops |

## 8. Dependencies

- **Staffing:** flexible staffing model in `docs/operations/02-event-staffing-and-responsibility-model.md`.
- **Capacity/waitlist:** `docs/admin/12-capacity-reservation-and-waitlist-policy.md`.
- **Money:** cancellation/refund mechanics in `docs/admin/13-pricing-payment-and-refund-policy.md`.
- **Domain:** template → session model in `docs/admin/11-event-and-session-domain-model.md`.

## 9. Related documents

- `docs/product/04-v1-scope.md`
- `docs/product/01-product-vision.md`
- `docs/operations/01-event-operations-lifecycle.md`
