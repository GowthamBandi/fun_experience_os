# 03 — Assumptions Register

> **Status:** Live project record (maintained).
> **Document type:** Assumption + risk register.
> This is the consolidated register of all planning assumptions and the key risks that follow from them. It uses the `ASM-SA-###` (assumption) and `RSK-SA-###` (risk) identifier namespaces.

---

## 1. Purpose and fields

Every assumption must be validated before it becomes a basis for build. Fields:

| Field | Meaning |
| --- | --- |
| Assumption ID | `ASM-SA-###` |
| Description | The assumption |
| Reason | Why we are assuming it |
| Risk if incorrect | What breaks |
| Validation method | How to test it |
| Owner | Who is accountable |
| Target phase | When it must be resolved |
| Current status | Active / Needs validation / Superseded / Validated / Invalidated |

Risks use `RSK-SA-###` and are tracked in §3.

## 2. Assumption register

### 2.1 Legacy assumptions (carried from earlier planning docs)

| ID | Description | Reason | Risk if incorrect | Validation method | Owner | Target phase | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ASM-SA-001 | Real demand for organized casual/group sports in target cities | Core premise of the product | Pivot needed if false | User interviews + pilot fill data | Founder | v1 planning | Needs validation |
| ASM-SA-002 | A curated single-city activity mix is enough to validate | Scope control | May need broader catalog | Pilot fill rates | Founder | v1 planning | Active |
| ASM-SA-003 | Participants accept joining without knowing the full roster | Anonymity-first design | May need "known friends" opt-in | User interviews | Founder | v1 planning | Needs validation |
| ASM-SA-004 | Company-run operations scale with coordinator + referee model | Operating premise | May need partners sooner | Pilot staffing data | Event Ops Manager | v1 planning | Active |
| ASM-SA-005 | Willingness to pay for organized sessions over informal booking | Pricing premise | Need free intro sessions | Pricing tests | Founder | v1 planning | Needs validation |
| ASM-SA-006 | Anonymity reduces sign-up friction more than it reduces trust | Product bet | Earlier verification needed | Signup funnel data | Founder | v1 planning | Needs validation |
| ASM-SA-007 | Venues are available to rent per-slot in target cities | Venue model | Venue supply constraint | Venue outreach | City Manager | v1 planning | Active |
| ASM-SA-008 | Coordinators can be hired affordably per city | Cost model | Unit economics break | Cost modeling | Event Ops Manager | v1 planning | Active |
| ASM-SA-009 | Venue rental + staffing leaves viable per-session margin | Margin premise | Pricing/staffing must change | Finance model | Finance Manager | v1 planning | Needs validation |
| ASM-SA-010 | A payment provider supports the required flows (capture, refund, partial) | Money premise | Provider constraint | Provider comparison (OQ-SA-041) | Engineering | v1 planning | Needs validation |
| ASM-SA-011 | Participants are willing to prepay for a slot | Money premise | May need hold-then-pay | Pilot payment data | Founder | v1 planning | Needs validation |
| ASM-SA-012 | Single currency per launch country | Money scope | Multi-currency later | — | Finance Manager | v1 planning | Active |
| ASM-SA-013 | Single-city launch is enough to validate the model | Scope decision | Need two cities | Pilot results | Founder | v1 planning | Active |
| ASM-SA-014 | The admin must cover all listed areas in v1 | Scope assumption | Phasing may change | Scope review | Ops Manager | v1 planning | Active |
| ASM-SA-015 | Firebase supports v1 auth/data/notification needs | Stack assumption | Backend re-evaluation | Data-store evidence (OQ-SA-002) | Engineering | v1 planning | Needs validation |
| ASM-SA-016 | 18+ is the default age floor | Age boundary | Values/policy change | Legal review (OQ-SA-047) | Founder | v1 planning | **Superseded** (by DEC-SA-004) |
| ASM-SA-017 | A single backend serves both apps at v1 scale | Architecture | Split services later | Architecture review | Engineering | v1 planning | Active |
| ASM-SA-018 | Venue booking is manual (admin-managed), not integrated | Scope | Add venue APIs later | — | City Manager | v1 planning | Active |
| ASM-SA-019 | Coordinators/referees use the Super Admin (responsive web), not a separate app | Staff tooling | Separate staff app needed | Staff feedback | Ops Manager | v1 planning | Active |
| ASM-SA-023 | Booking windows are configured per experience | Scheduling model | Could be global/per-session | Pilot ops | Ops Manager | v1 planning | Active |

### 2.2 New assumptions (SA-0C phase)

| ID | Description | Reason | Risk if incorrect | Validation method | Owner | Target phase | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ASM-SA-020 | The proposed launch configuration is validated and is not a permanent limitation | WS1 framing | Permanent-limitation misreading | Approval of DEC-SA-001…017 | Founder | v1 planning | Active |
| ASM-SA-021 | Weekend + weekday-evening demand meets minimums at launch | WS1 3.5/3.8 | Sessions keep cancelling | Pilot fill data | Marketing Manager | v1 planning | Needs validation |
| ASM-SA-022 | Per-slot venue rental rates stay stable through the pilot | WS1 3.6 | Margin erosion | Rate re-check | City Manager | v1 build | Active |
| ASM-SA-024 | The chosen provider supports webhooks, partial refunds and disputes | WS4 7.1 | Money flows constrained | Provider comparison (OQ-SA-041) | Engineering | v1 planning | Needs validation |
| ASM-SA-025 | Card data never touches our systems (provider-hosted) | WS4 §2 | PCI scope expands | Provider terms | Engineering | v1 build | Active |
| ASM-SA-026 | Single currency (INR) is sufficient for v1 | WS4 §2 | Multi-currency rework | Finance sign-off | Finance Manager | v1 planning | Active |
| ASM-SA-027 | Aliases/temp IDs are sufficient for venue operations without legal names on public surfaces | WS5 §5 | Sports want names on boards | Pilot check-in | Ops Manager | v1 build | Needs validation |
| ASM-SA-028 | Emergency-access usage will be low and auditable | WS5 7.4 | Abuse of elevation | Audit review | Safety & Moderation Officer | v1 build | Active |
| ASM-SA-029 | Declared-gender eligibility is workable at v1 scale | WS6 11.1 | Misuse or legal friction | Legal review (OQ-SA-046) | Founder | v1 planning | Needs validation |
| ASM-SA-030 | Single-gender formats have sufficient demand to meet minimums | WS6 §2 | Formats underfilled | Pilot demand data | Marketing Manager | v1 planning | Needs validation |
| ASM-SA-031 | A specialized verification provider is available and affordable | WS7 5.2 | Build custom KYC or delay | Provider research (OQ-SA-044) | Engineering | v1 build | Needs validation |
| ASM-SA-032 | Phone OTP verification sufficiently controls abuse at v1 scale | WS7 §3 | Abuse higher than expected | Pilot fraud data | Engineering | v1 build | Needs validation |
| ASM-SA-033 | Tournament demand in v1 justifies the feature | WS8 6 | Low tournament volume | Pilot demand | Ops Manager | v1 planning | Needs validation |
| ASM-SA-034 | Referee staffing can scale to tournament match volume | WS8 §6 | Under-staffing | Staffing plan | Event Ops Manager | v1 build | Active |
| ASM-SA-035 | One person may hold multiple staff roles at small events (subject to conflict rules) | WS9 6.1 | Accountability blur | Staff policy | Event Ops Manager | v1 build | Active |
| ASM-SA-036 | Venue contact can be shared across sessions at the same venue | WS9 §2 | On-site gaps | Pilot ops | City Manager | v1 build | Active |
| ASM-SA-037 | v1 scale (single city) is modest; the store decision is about integrity and rework risk, not throughput | WS10 §3.2 | Scale surprises | Load estimate | Engineering | v1 planning | Active |
| ASM-SA-038 | A managed PostgreSQL service and API hosting are available within budget | WS10 5.2 | Cost/latency issues | Cost estimate (evidence item 8) | Engineering | v1 planning | Needs validation |
| ASM-SA-039 | One coordinator can run most non-tournament sessions solo | Legacy ops assumption (old `docs/operations/01` A1) | Under-staffing | Staffing pilot | Event Ops Manager | v1 planning | **Superseded** (by DEC-SA-053 flexible staffing) |

## 3. Risk register (consolidated)

| ID | Risk | Related decision | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- | --- | --- |
| RSK-SA-001 | Venue rental costs erode per-session margin | DEC-SA-006 | Medium | High | Track venue cost per session; renegotiate; min-fill rules |
| RSK-SA-002 | Domain-terminology migration causes stale docs/implementation confusion | DEC-SA-018/019 | Medium | Medium | Canonical vocabulary doc; legacy mapping table |
| RSK-SA-003 | Anonymity, gender and emergency-access rules create legal/privacy exposure | DEC-SA-034…043 | Medium | High | Legal review (OQ-SA-045/046/047); field-level access controls |
| RSK-SA-004 | Payment provider lacks required capabilities (refunds, webhooks, disputes) | DEC-SA-029 | Medium | High | Blocked provider comparison (OQ-SA-041) |
| RSK-SA-005 | Reservation expiry unreliable → lost or double-sold slots | DEC-SA-021 | Medium | High | Server-side expiry; data-store evidence (WS10) |
| RSK-SA-006 | Waitlist auto-promotion and payment flow complexity | DEC-SA-024 | Medium | Medium | FIFO rules; promotion to reservation with payment window |
| RSK-SA-007 | Wrong data-store choice → mid-build migration | DEC-SA-059 | Medium | High | Evidence phase before approval (WS10 §6) |
| RSK-SA-008 | Low fill, no-shows and cancellations hurt revenue and trust | DEC-SA-008/009 | High | High | Min-fill policy, waitlist, marketing, reliable reminders |
| RSK-SA-009 | Weather cancellations and demand seasonality reduce revenue | DEC-SA-013 | Medium | Medium | Weather cutoff policy; indoor-heavy initial mix |
| RSK-SA-010 | Tournament scoring disputes and bracket edge cases | DEC-SA-048…052 | Medium | Medium | Referee-led scoring; audited corrections; documented edge rules |
| RSK-SA-011 | Staffing gaps and authority misuse at events | DEC-SA-053…057 | Medium | High | Minimum staffing, check-in, escalation, audited emergency authority |
| RSK-SA-012 | Identity/verification data breach or provider dependency | DEC-SA-044…047 | Low | High | Provider-hosted data; no document storage by default |
| RSK-SA-013 | Overbooking, duplicate payments or financial bugs | DEC-SA-022/027/031 | Low | High | Server-enforced capacity; webhook confirmation; financial audit trail |
| RSK-SA-014 | Single-city failure misreads as product failure | DEC-SA-001 | Medium | High | Clear success metrics; phased validation |

## 4. SA-0D assumption status review (CTO)

| Status | Assumptions | Meaning |
| --- | --- | --- |
| **Validated** | None yet | Nothing has been tested; no production data exists |
| **Needs testing** | ASM-SA-001, 003, 005, 006, 009, 010, 011, 015, 021, 024, 027, 029, 030, 031, 032, 033, 038 | Demand, pricing, trust, provider/data-store capabilities — all open to validation (user interviews, pilot, provider comparisons) |
| **Still assumption (Active)** | ASM-SA-002, 004, 007, 008, 012, 013, 014, 017, 018, 019, 022, 023, 025, 026, 028, 034, 035, 036, 037 | Working assumptions with no contradiction found; acceptable for planning |
| **Superseded** | ASM-SA-016 (18+ default → DEC-SA-004), ASM-SA-039 (one coordinator → DEC-SA-053) | Replaced by approved/proposed decisions |
| **Meta / retire on approval** | ASM-SA-020 | "Proposed launch config is validated" — resolves when DEC-SA-001…017 are approved |

> SA-0D finding: no assumption is validated or invalidated yet — all must be resolved before build (validation method + owner columns in §2 stand).

### 4.1 SA-0D risk classification

| Class | Risks | Count |
| --- | --- | --- |
| **Critical** | RSK-SA-008 (fill/no-show), RSK-SA-003 (legal/privacy) | 2 |
| **High** | RSK-SA-001, 004, 005, 007, 011, 012, 013 | 7 |
| **Medium** | RSK-SA-002, 006, 009, 010, 014 | 5 |
| **Low / Resolved** | None (no risk has been retired; all remain open) | 0 |

## 5. Changelog

| Date | Change |
| --- | --- |
| 2026-08-04 | Initial assumptions register created (ASM-SA-001…038) with consolidated risk register (RSK-SA-001…014). |
| 2026-08-04 | Added ASM-SA-039 (legacy "one coordinator" assumption, superseded by DEC-SA-053); corrected ASM-SA-008 status. |
| 2026-08-04 | SA-0D review added (§4): no assumptions validated yet; 2 superseded, 1 meta, ~18 needs testing, ~19 active. |
