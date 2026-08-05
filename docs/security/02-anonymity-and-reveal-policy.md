# 02 — Anonymity and Controlled Reveal Policy

> **Status:** Planning draft — decision-resolution phase (SA-0C).
> **Document type:** Privacy / access policy.
> **This document is a planning draft.** It defines what each role may see at each stage. No implementation exists.

---

## 1. Purpose

Define exactly what each role may see during each stage of an event's life, applying the principle of **minimum necessary access** (confirmed in `docs/security/01-security-and-privacy-principles.md`). The key guarantee: other participants never gain access to a participant's legal identity or contact information merely because a controlled reveal has occurred.

## 2. Stages

| # | Stage | Meaning |
| --- | --- | --- |
| S1 | Before booking | User browses the catalog before committing |
| S2 | After booking | Booking confirmed; temp event ID issued |
| S3 | Before registration closes | Booking window still open |
| S4 | Registration closed | Window closed; session imminent |
| S5 | One hour before the event | Pre-event preparation; team allocation |
| S6 | At check-in | Participant arrives at the venue |
| S7 | During the event | Activity in progress |
| S8 | After the event | Session completed |
| S9 | During a safety incident | An incident is being handled |
| S10 | After a report or complaint | A report/complaint is being processed |

## 3. Roles

| # | Role |
| --- | --- |
| R1 | Participant |
| R2 | Assigned coordinator |
| R3 | Event Operations Manager |
| R4 | Customer Support |
| R5 | Safety and Moderation Officer |
| R6 | Finance Manager |
| R7 | Super Admin |
| R8 | Platform Owner |

## 4. Information types

| # | Type | Sensitivity class (from `docs/security/01-security-and-privacy-principles.md`) |
| --- | --- | --- |
| I1 | Legal name | Participant-identifiable |
| I2 | Display name | Participant-anonymous (alias) |
| I3 | Temporary event ID | Participant-anonymous (session-scoped) |
| I4 | Temporary alias | Participant-anonymous |
| I5 | Profile photograph | Participant-identifiable |
| I6 | Gender declaration | Participant-identifiable (policy-sensitive) |
| I7 | Age / age band | Participant-identifiable |
| I8 | Phone number | Participant-identifiable |
| I9 | Email address | Participant-identifiable |
| I10 | Emergency contact | Participant-identifiable (sensitive) |
| I11 | Identity-verification status | Participant-identifiable |
| I12 | Attendance history | Participant-identifiable |
| I13 | Reliability status | Participant-identifiable |
| I14 | Safety reports | Sensitive safety |
| I15 | Payment information | Financial |

## 5. What other participants can see (per stage)

| Stage | Count | Own temp ID/alias | Roster | Other temp aliases | Teams | Legal identity / contact |
| --- | --- | --- | --- | --- | --- | --- |
| S1 Before booking | Joined count | n/a | No | No | No | Never |
| S2 After booking | Count | Yes (issued) | No | No | No | Never |
| S3 Before close | Count | Yes | No | No | No | Never |
| S4 Registration closed | Count | Yes | No | No | No | Never |
| S5 One hour before | Count | Yes | No | No | Own team (aliases) | Never |
| S6 At check-in | Count | Yes (validated) | No | No | Own team (aliases) | Never |
| S7 During event | — | Yes | No | Aliases on field | Own team | Never |
| S8 After event | — | Yes (archived) | No | No | Own team (history) | Never |
| S9 Incident | — | Yes | No | Restricted | — | Never |
| S10 Report/complaint | — | Yes | No | Restricted | — | Never |

**Rule (DEC-SA-036):** the controlled reveal never hands a participant another participant's legal name, photo, phone, email or emergency contact. Identities become visible to **staff** as needed, not to other participants.

## 6. What staff roles can see (summary)

| Role | Identity (I1,I2,I5) | Contact (I8,I9,I10) | Payment (I15) | Safety (I14) | Notes |
| --- | --- | --- | --- | --- | --- |
| Assigned coordinator | S6–S8 (check-in/event) | S6–S8 as needed (S9 too) | No | Report/flag only | Operational need at the venue |
| Event Ops Manager | S2–S8 | S2–S8 (operational) | No | Summary | Runs the session books |
| Customer Support | On-ticket | On-ticket | On-ticket | On-ticket | Only within an open support context |
| Safety & Moderation Officer | S9–S10 + investigation | S9–S10 + investigation | No | Full | Investigation-scoped |
| Finance Manager | No identity by default | No | Full | No | Payments/refunds only; identity only for disputes |
| Super Admin | All stages | All stages | Full | Full | Full operational access |
| Platform Owner | Review level | Review level | Review level | Review level | Audit/oversight, not routine operations |

> "On-ticket" = visible only within the records of an open support/incident context. Finance identity access only for dispute resolution (DEC-SA-038-adjacent, RSK-SA-003).

## 7. Decision topics

### 7.1 Minimum necessary access adopted

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Principles doc already asserts least disclosure (P2). |
| 2 | Options | (a) Enforce per-stage matrix, (b) role-level coarse access, (c) no access control. |
| 3 | Benefits | Reduces data-exposure surface and support burden. |
| 4 | Risks | Over-restriction slows legitimate ops (RSK-SA-003). |
| 5 | Operational consequences | Coordinator can check in without seeing payment data; Finance sees money without seeing identities. |
| 6 | Technical consequences | Access enforced in backend query layer (OQ-SA-026). |
| 7 | Recommended v1 decision | Adopt per-stage matrix above as the access spec. |
| 8 | Unresolved | Exact field-level control granularity. |
| 9 | External review | Privacy legal review recommended. |
| 10 | Decision status | **Approved — DEC-SA-034** |

### 7.2 Participant reveal limits (even after reveal)

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Earlier docs said participants "see joined count" but did not specify post-reveal rules. |
| 2 | Options | (a) Never share legal identity/contact with other participants, (b) reveal fully at check-in, (c) reveal only with mutual consent. |
| 3 | Benefits | (a) preserves safety and dignity; consistent with anonymity-first product. |
| 4 | Risks | Some sports may want names on scoreboards (RSK-SA-003). |
| 5 | Operational consequences | Scoreboards/lines use aliases, not legal names. |
| 6 | Technical consequences | Display of aliases on all participant-facing surfaces. |
| 7 | Recommended v1 decision | Other participants never receive legal identity or contact; aliases/temp IDs only. |
| 8 | Unresolved | Whether display names may be shown on scoreboards. |
| 9 | External review | None beyond privacy review. |
| 10 | Decision status | **Approved — DEC-SA-035** |

### 7.3 Mutual-consent connection (deferred)

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | No connection feature exists in earlier docs. |
| 2 | Options | (a) Mutual-consent "connect after event", (b) public profiles, (c) none. |
| 3 | Benefits | (a) lets participants connect safely; keeps anonymity default. |
| 4 | Risks | Social features expand scope and moderation burden (RSK-SA-003). |
| 5 | Operational consequences | None in v1. |
| 6 | Technical consequences | None in v1; designed for later. |
| 7 | Recommended v1 decision | Design principle only: mutual-consent connection after event completion; **social messaging implementation deferred** past v1. |
| 8 | Unresolved | Connection surface design. |
| 9 | External review | None. |
| 10 | Decision status | **Deferred — DEC-SA-036** |

### 7.4 Authorized emergency access

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Anonymity could block legitimate emergency handling. |
| 2 | Options | (a) Coordinator/safety contact may access identity + emergency contact during an incident, (b) strict anonymity even in emergencies. |
| 3 | Benefits | (a) meets duty-of-care obligations. |
| 4 | Risks | Misuse of emergency access (RSK-SA-003). |
| 5 | Operational consequences | Emergency protocol: incident opens an access window for the assigned coordinator/safety contact. |
| 6 | Technical consequences | Incident-scoped access elevation, audited. |
| 7 | Recommended v1 decision | Authorized emergency access for coordinator/safety contact during an active incident (S9), logged in audit. |
| 8 | Unresolved | Who may trigger elevation; how it is logged and reviewed (OQ-SA-048). |
| 9 | External review | Legal review recommended (duty of care). |
| 10 | Decision status | **Approved — DEC-SA-037** |

### 7.5 Gender and verification data access

| # | Aspect | Content |
| --- | --- | --- |
| 1 | Current context | Gender declaration is policy-sensitive; see `docs/security/03-gender-format-and-inclusion-policy.md`. |
| 2 | Options | Gender declaration visible to (a) staff who run the format, (b) anyone, (c) nobody outside verification. |
| 3 | Benefits | (a) supports eligibility without exposing to participants. |
| 4 | Risks | Discrimination concerns if widely visible (RSK-SA-003). |
| 5 | Operational consequences | Only format-enforcement staff see declarations. |
| 6 | Technical consequences | Field-level access controls. |
| 7 | Recommended v1 decision | Gender declaration visible only to staff who must enforce eligibility; never to other participants. |
| 8 | Unresolved | None beyond legal review. |
| 9 | External review | Legal review required. |
| 10 | Decision status | **Proposed — DEC-SA-038** |

## 8. Confirmed decisions (this workstream)

| ID | Decision | Status |
| --- | --- | --- |
| DEC-SA-034 | Per-stage minimum-necessary-access matrix | Approved |
| DEC-SA-035 | Other participants never get legal identity/contact after reveal | Approved |
| DEC-SA-036 | Mutual-consent connection principle; social messaging deferred | Deferred |
| DEC-SA-037 | Authorized emergency access during incidents (audited) | Approved |
| DEC-SA-038 | Gender declaration visible only to eligibility staff | Proposed |

## 9. Assumptions introduced

| ID | Assumption |
| --- | --- |
| ASM-SA-027 | Aliases/temp IDs are sufficient for venue operations without legal names on public surfaces. |
| ASM-SA-028 | Emergency-access usage will be low and auditable. |

## 10. Open questions raised

| ID | Question | Owner |
| --- | --- | --- |
| OQ-SA-048 | Emergency-access elevation: who triggers, how logged, how reviewed? | Safety Officer + Founder |
| OQ-SA-058 | May display names appear on scoreboards/leaderboards? | Founder |

## 11. Dependencies

- **Roles:** access matrix must align with `docs/admin/02-admin-users-and-roles.md`.
- **Gender formats:** `docs/security/03-gender-format-and-inclusion-policy.md`.
- **Verification:** `docs/security/04-verification-and-trust-model.md`.
- **Backend:** query-layer enforcement (OQ-SA-026) in `docs/architecture/01-system-context.md`.

## 12. Related documents

- `docs/security/01-security-and-privacy-principles.md`
- `docs/admin/07-participant-and-safety-management.md`
- `docs/security/04-verification-and-trust-model.md`
