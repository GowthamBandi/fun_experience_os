# 02 — Open Questions

> **Status:** Live project record (maintained).
> **Document type:** Question registry.
> Canonical identifiers are `OQ-SA-###`. Legacy identifiers (`Q-###`) map 1:1 (§7). When a question is resolved by a proposal, it moves to the resolved tracker and the decision is logged in `docs/project-records/01-decisions-log.md`.

---

## 1. Blocking questions (must resolve before build)

| ID | Question | Source | Status |
| --- | --- | --- | --- |
| OQ-SA-001 | Which payment provider, currency(s), fee structure? (verified comparison) | `docs/admin/13-pricing-payment-and-refund-policy.md` | **Blocked** (DEC-SA-029) |
| OQ-SA-002 | Final operational data store decision (after evidence phase)? | `docs/architecture/03-operational-data-store-evaluation.md` | Deferred (DEC-SA-059) |
| OQ-SA-003 | Default cancellation/refund policy values per experience template? | `docs/admin/13-pricing-payment-and-refund-policy.md` | Addressed by proposal (DEC-SA-030); values open |
| OQ-SA-004 | Gender verification approach for single-gender sessions (legal review)? | `docs/security/03-gender-format-and-inclusion-policy.md` | Legal review blocked (DEC-SA-043) |
| OQ-SA-005 | Data retention periods (bookings, temp IDs, incidents, bans, verification, gender)? | `docs/security/01-security-and-privacy-principles.md` | Open |
| OQ-SA-006 | Brand name and identity? | `docs/design-system/01-admin-design-direction.md` | Open |
| OQ-SA-007 | Exact launch city and final activity mix? | `docs/product/05-v1-operating-model.md` | Partially addressed (DEC-SA-003); city open |
| OQ-SA-008 | Exact role permission boundaries (refund thresholds, ban authority, city scoping)? | `docs/admin/02-admin-users-and-roles.md` | Open |

## 2. Product questions

| ID | Question | Source | Status |
| --- | --- | --- | --- |
| OQ-SA-009 | Are intro/discount sessions part of v1 marketing? | `docs/product/03-business-model.md` | Open |
| OQ-SA-010 | Can participants see their team before the session or only at check-in? | `docs/admin/07-participant-and-safety-management.md` | Open |
| OQ-SA-011 | Do v1 sessions allow "bring a friend" group bookings? | `docs/product/04-v1-scope.md` | Open |
| OQ-SA-012 | Verification required for all sessions or only some? | `docs/product/04-v1-scope.md` | Addressed by proposal (DEC-SA-047) |
| OQ-SA-013 | Is willingness-to-pay strong enough for a booking fee? | `docs/product/02-problem-and-opportunity.md` | Open (ASM-SA-005) |
| OQ-SA-014 | Do temp random IDs need QR codes for fast check-in? | `docs/admin/07-participant-and-safety-management.md` | Open |
| OQ-SA-015 | Waitlists in v1? | `docs/admin/05-event-management-workflow.md` | Addressed by proposal (DEC-SA-016/024) |

## 3. Operations and safety questions

| ID | Question | Source | Status |
| --- | --- | --- | --- |
| OQ-SA-016 | Minimum-fill threshold and latest cancel time per activity? | `docs/product/05-v1-operating-model.md` | Addressed by proposal (DEC-SA-008/009/023); values open |
| OQ-SA-017 | Who makes the go/cancel call and how is it recorded? | `docs/operations/01-event-operations-lifecycle.md` | Addressed by proposal (DEC-SA-023) |
| OQ-SA-018 | Ban appeal process and who adjudicates? | `docs/admin/07-participant-and-safety-management.md` | Open |
| OQ-SA-019 | Can a banned participant book a different city? | `docs/admin/07-participant-and-safety-management.md` | Open |
| OQ-SA-020 | Data retained about banned users and for how long? | `docs/admin/07-participant-and-safety-management.md` | Open |
| OQ-SA-021 | Age verification method? | `docs/security/04-verification-and-trust-model.md` | Open (links OQ-SA-047) |

## 4. Tournament questions

| ID | Question | Source | Status |
| --- | --- | --- | --- |
| OQ-SA-022 | Tournament entry: pre-formed teams, individuals, or both? | `docs/admin/14-tournament-formats-and-scoring.md` | Addressed by proposal (DEC-SA-049); details open |
| OQ-SA-023 | Round-robin/consolation needed in v1? | `docs/admin/14-tournament-formats-and-scoring.md` | Addressed (single elimination v1, DEC-SA-048) |
| OQ-SA-024 | Can participants see live brackets, or only after the event? | `docs/admin/14-tournament-formats-and-scoring.md` | Open |
| OQ-SA-025 | How are byes and walkovers handled and recorded? | `docs/admin/14-tournament-formats-and-scoring.md` | Addressed by proposal (DEC-SA-051) |

## 5. Architecture and data questions

| ID | Question | Source | Status |
| --- | --- | --- | --- |
| OQ-SA-026 | How is the anonymity boundary enforced in the backend query layer? | `docs/architecture/01-system-context.md` | Open |
| OQ-SA-027 | Is a dedicated analytics warehouse needed in v1? | `docs/admin/10-admin-analytics-and-reports.md` | Open |
| OQ-SA-028 | How is venue/staffing cost captured per session for margin? | `docs/admin/10-admin-analytics-and-reports.md` | Open |
| OQ-SA-029 | Which Flutter state-management approach? | `docs/architecture/02-technology-decisions.md` | Open |
| OQ-SA-030 | Monorepo vs. separate repos for app and admin? | `docs/architecture/02-technology-decisions.md` | Open |
| OQ-SA-031 | Which UI component library for the Next.js admin? | `docs/design-system/01-admin-design-direction.md` | Open |
| OQ-SA-032 | Is TeamAllocation persisted or derived at runtime? | `docs/database/01-domain-entity-draft.md` | Open |
| OQ-SA-033 | Do coordinators/referees need a mobile-optimized admin view? | `docs/design-system/01-admin-design-direction.md` | Open |

## 6. Roles and governance questions

| ID | Question | Source | Status |
| --- | --- | --- | --- |
| OQ-SA-034 | Can a City Manager view participant identity for their city, or counts only? | `docs/admin/02-admin-users-and-roles.md` | Open |
| OQ-SA-035 | Should role changes require a second approver? | `docs/admin/02-admin-users-and-roles.md` | Open |
| OQ-SA-036 | Is Super Admin allowed to bypass city scoping? | `docs/admin/02-admin-users-and-roles.md` | Open |
| OQ-SA-037 | Who approves promotional notification sends? | `docs/admin/09-notification-management.md` | Open |

## 7. Legacy mapping

| Legacy | Canonical | Legacy | Canonical | Legacy | Canonical | Legacy | Canonical |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Q-001 | OQ-SA-001 | Q-011 | OQ-SA-011 | Q-021 | OQ-SA-021 | Q-031 | OQ-SA-031 |
| Q-002 | OQ-SA-002 | Q-012 | OQ-SA-012 | Q-022 | OQ-SA-022 | Q-032 | OQ-SA-032 |
| Q-003 | OQ-SA-003 | Q-013 | OQ-SA-013 | Q-023 | OQ-SA-023 | Q-033 | OQ-SA-033 |
| Q-004 | OQ-SA-004 | Q-014 | OQ-SA-014 | Q-024 | OQ-SA-024 | Q-034 | OQ-SA-034 |
| Q-005 | OQ-SA-005 | Q-015 | OQ-SA-015 | Q-025 | OQ-SA-025 | Q-035 | OQ-SA-035 |
| Q-006 | OQ-SA-006 | Q-016 | OQ-SA-016 | Q-026 | OQ-SA-026 | Q-036 | OQ-SA-036 |
| Q-007 | OQ-SA-007 | Q-017 | OQ-SA-017 | Q-027 | OQ-SA-027 | Q-037 | OQ-SA-037 |
| Q-008 | OQ-SA-008 | Q-018 | OQ-SA-018 | Q-028 | OQ-SA-028 | | |
| Q-009 | OQ-SA-009 | Q-019 | OQ-SA-019 | Q-029 | OQ-SA-029 | | |
| Q-010 | OQ-SA-010 | Q-020 | OQ-SA-020 | Q-030 | OQ-SA-030 | | |

## 8. New questions (SA-0C phase)

| ID | Question | Owner | Status |
| --- | --- | --- | --- |
| OQ-SA-038 | Which city launches first, and what is the service-area radius? | Founder | Open |
| OQ-SA-039 | Final temporary reservation duration (recommended default 10 minutes)? | Founder | Open |
| OQ-SA-040 | Final numeric minimum/maximum participant counts per activity? | Founder + Ops | Open |
| OQ-SA-041 | Verified payment-provider comparison (fees, refunds, webhooks, settlement, disputes)? | Founder + Finance + Engineering | Blocked (DEC-SA-029) |
| OQ-SA-042 | Tax (GST) treatment of ticket vs. platform fee? | Accountant | Open |
| OQ-SA-043 | Default cancellation-policy values per experience template? | Founder + Finance | Open |
| OQ-SA-044 | Which specialized verification provider (timing, cost, data terms)? | Founder + Engineering + Legal | Open |
| OQ-SA-045 | Indian legal review of anonymity/controlled-reveal policy — outcome? | Legal | Blocked |
| OQ-SA-046 | Indian legal review of women-only/men-only formats — outcome? | Legal | Blocked |
| OQ-SA-047 | Legal review of age boundary + age-verification method? | Legal | Blocked |
| OQ-SA-048 | Emergency-access elevation: who triggers, how logged, how reviewed? | Safety + Founder | Open |
| OQ-SA-049 | Retention for gender declarations and verification statuses? | Legal + Privacy | Open |
| OQ-SA-050 | Waitlist commitment model (free vs. deposit)? | Founder | Open |
| OQ-SA-051 | Complimentary-booking approval threshold? | Finance | Open |
| OQ-SA-052 | Do match sub-terms (innings, sets, overs) need a shared model per activity? | Ops + Analyst | Open |
| OQ-SA-053 | Should released reservations promote the waitlist immediately or only after predecessor payment? | Ops | Open |
| OQ-SA-054 | Are staff-held slots counted against published capacity? | Founder | Open |
| OQ-SA-055 | Can one user book multiple slots in v1 (bring-a-friend)? | Founder | Open |
| OQ-SA-056 | Refund speed target for company cancellations (e.g., same-day)? | Finance | Open |
| OQ-SA-057 | Partial-session cancellation refund rule? | Founder + Finance | Open |
| OQ-SA-058 | May display names appear on scoreboards/leaderboards? | Founder | Open |
| OQ-SA-059 | "Prefer not to say" behavior on single-gender formats? | Founder | Open |
| OQ-SA-060 | Same-gender coordinator required or preferred for women-only sessions? | Founder + Ops | Open |
| OQ-SA-061 | Do prize tournaments require identity verification in v1? | Founder + Ops | Open |
| OQ-SA-062 | What is the verification-failure appeal path for V3? | Safety Officer | Open |
| OQ-SA-063 | Per-activity tie-break rules (super over, tie-break)? | Ops | Open |
| OQ-SA-064 | Do standings generate participant ratings in v1? | Analyst | Open |
| OQ-SA-065 | May one person be lead coordinator and referee at the same event? | Ops | Open |
| OQ-SA-066 | Absence window for arranging cover? | Ops | Open |
| OQ-SA-067 | v1 franchises: internal operations vs. external licensed franchisees? | Founder | Open (recommendation: internal for v1, external post-v1) |
| OQ-SA-068 | Regional Franchise Partner owned territory model: exclusive city rights, fees, and performance obligations? | Founder | Open |
| OQ-SA-069 | Idle re-auth thresholds (recommended 15 min light / 8h full) and Platform Owner founder+security access protocol? | Founder + Security | Open |

## 9. Resolved tracker

| ID | Question | Resolution | Date |
| --- | --- | --- | --- |
| OQ-SA-015 | Waitlists in v1? | Proposed: FIFO waitlist with auto-promotion (DEC-SA-016/024) — awaiting approval | 2026-08-04 |
| OQ-SA-016 | Minimum-fill threshold/timing? | Proposed: ops decision at cutoff, auto refund (DEC-SA-009/023) — values open | 2026-08-04 |
| OQ-SA-017 | Go/cancel decision authority? | Proposed: Event Ops Manager at cutoff with recorded reason (DEC-SA-023) | 2026-08-04 |
| OQ-SA-023 | Tournament formats in v1? | Proposed: single elimination only; future formats designed for (DEC-SA-048) | 2026-08-04 |
| OQ-SA-025 | Byes/walkovers handling? | Proposed: standardized edge-case rules (DEC-SA-051) | 2026-08-04 |
| OQ-SA-003 | Refund windows? | Proposed: configurable per-experience policy model (DEC-SA-030); default values still open (OQ-SA-043) | 2026-08-04 |
| OQ-SA-012 | Verification all vs some? | Proposed: per-activity-class requirements (DEC-SA-047) | 2026-08-04 |

> Rows above are **addressed by proposals**, not fully resolved; they stay monitored until the proposal is approved.

## 10. SA-0D consolidation (CTO review)

### 10.1 Questions merged (duplicates)

| Canonical (keep) | Merged from | Rationale |
| --- | --- | --- |
| OQ-SA-041 (provider comparison) | OQ-SA-001 | Same question |
| OQ-SA-043 (cancellation defaults) | OQ-SA-003 | Same question |
| OQ-SA-038 (launch city + radius) | OQ-SA-007 | Same question |
| OQ-SA-055 (multi-slot booking) | OQ-SA-011 | Same question |
| OQ-SA-040 (min/max counts) | OQ-SA-016 | Same question |
| OQ-SA-005 (retention periods) | OQ-SA-020, OQ-SA-049 | Same question |

### 10.2 Questions closed (already answered by approved proposals)

| ID | Question | Answered by |
| --- | --- | --- |
| OQ-SA-012 | Verification all vs some | DEC-SA-047 (per-activity-class requirements) |
| OQ-SA-015 | Waitlists in v1 | DEC-SA-016/024 (FIFO auto-promote) |
| OQ-SA-017 | Go/cancel authority | DEC-SA-023 (ops at cutoff) |
| OQ-SA-022 | Tournament entry unit | DEC-SA-049 (team + individual) |
| OQ-SA-023 | Round-robin in v1 | DEC-SA-048 (single elimination only) |
| OQ-SA-025 | Byes/walkovers | DEC-SA-051 (standardized edge cases) |

### 10.3 Genuinely open questions (net count ≈ 52)

After merging §10.1 and closing §10.2, the remaining genuinely open questions are all other IDs in §§1–8, plus the new-phase SA-0D items tracked in the MASTER_PROJECT_STATE.md §7. Owner-locked items requiring founder/business input: launch city (OQ-SA-038), payment provider (OQ-SA-041), reservation duration (OQ-SA-039), min/max counts (OQ-SA-040), cancellation defaults (OQ-SA-043), retention periods (OQ-SA-005), role boundaries (OQ-SA-008), multi-slot (OQ-SA-055), waitlist commitment (OQ-SA-050), staff-held slots (OQ-SA-054).

### 10.4 Note
Questions are marked merged/closed here; IDs are never deleted or renumbered to preserve history (RSK-SA-002).

### 10.5 SA-1A phase questions (authentication + franchise hierarchy)

| ID | Question | Owner | Status |
| --- | --- | --- | --- |
| OQ-SA-067 | v1 franchises: internal operations vs. external licensed franchisees? | Founder | Open (recommendation: internal for v1, external post-v1) |
| OQ-SA-068 | Regional Franchise Partner owned territory model: exclusive city rights, fees, and performance obligations? | Founder | Open |
| OQ-SA-069 | Idle re-auth thresholds (recommended 15 min light / 8h full) and Platform Owner founder+security access protocol? | Founder + Security | Open |

Added during SA-1A; tracked with the SA-0D items in MASTER_PROJECT_STATE.md §7. Reuses existing OQ-SA-008, OQ-SA-033, OQ-SA-036, OQ-SA-037.
