# 00 — Project Status

> **Status:** Live project record (maintained).
> **Last updated:** SA-1A experience-design complete (see changelog).

---

## 1. Project summary

| Field | Value |
| --- | --- |
| Project | Experience booking and activity operations platform |
| Phase | Decision resolution (SA-0C) — no production code |
| Stack (directed) | Flutter (customer app) · Next.js + TypeScript (Super Admin) · Firebase (initial backend) |
| Build approach | Production development later using Claude Code |
| Repo state | Contains the initial Flutter scaffold and planning docs; **no production application code, rules, functions or payment integrations** |

## 2. Phase status

| Workstream | Status | Notes |
| --- | --- | --- |
| Documentation foundation | Complete | 23 docs + README (SA-00) |
| Decision resolution (SA-0C) | **Complete** | 11 new docs; 61 canonical decisions; assumptions/risks registered |
| CTO consolidation (SA-0D) | **Complete** | MASTER_PROJECT_STATE.md created; decisions/questions/assumptions/risks classified; modules 14→11; feature priorities set |
| Experience design (SA-1A) | **Complete** | Franchise hierarchy (8-tier + functional roles); complete auth experience + 9 screen specs; Experience OS design system + motion |
| Product definition | Draft complete | Vision, problem, business model, v1 scope, operating model |
| Super Admin definition | Draft complete | 14 docs incl. domain model, capacity, pricing, tournaments |
| Architecture direction | Draft | Data store framed, decision deferred (DEC-SA-059) |
| Security & privacy | Policies drafted | Anonymity reveal, gender formats, verification; legal blocked |
| Operations | Draft complete | Event lifecycle + staffing model |
| Design direction | Draft | Brand/identity unresolved |
| Production code | **Not started** | Next phase after SA-0D approval (SA-0E) |

## 3. Confirmed decisions (top-level, canonical)

See `docs/project-records/01-decisions-log.md` for the full index. Highlights:

| # | Decision | ID | Status |
| --- | --- | --- | --- |
| 1 | Customer app in Flutter | DEC-SA-101 | Approved |
| 2 | Super Admin in Next.js + TypeScript | DEC-SA-102 | Approved |
| 3 | Firebase as initial backend (**not** Firestore-selected) | DEC-SA-103 / DEC-SA-058 | Approved |
| 4 | Company creates/prices/schedules/operates itself | DEC-SA-104 | Approved |
| 5 | Participants anonymous; joined counts only | DEC-SA-105 | Approved |
| 6 | Temporary random event IDs per booking | DEC-SA-106 | Approved |
| 7 | Random team allocation before the event | DEC-SA-107 | Approved |
| 8 | No oversell; server-enforced capacity; client cannot finalize | DEC-SA-022/028 | Approved |
| 9 | Per-stage anonymity matrix; participants never get legal identity/contact | DEC-SA-034/035 | Approved |
| 10 | Audited emergency access during incidents | DEC-SA-037 | Approved |
| 11 | No identity-document image storage by default | DEC-SA-046 | Approved |
| 12 | Data store independent of Firebase selection; provisional Option B (deferred) | DEC-SA-058/059 | Deferred |
| 13 | Payment-provider selection blocked pending verified comparison | DEC-SA-029 | Blocked |
| 14 | Gender/eligibility legal conclusions blocked pending Indian legal review | DEC-SA-043 | Blocked |
| 15 | RBAC with 10 draft roles (boundaries open) | DEC-SA-112 | Approved (draft) |
| 16 | No production code written during planning | DEC-SA-118 | Approved |
| 17 | Franchise hierarchy: 8-tier command chain + 5 functional roles (proposed) | DEC-SA-062 | Proposed |
| 18 | "Event Operations Manager" renamed "Operations Manager" (proposed) | DEC-SA-063 | Proposed |

## 4. Key open decisions (blocking)

| # | Decision | Blocks | Status |
| --- | --- | --- | --- |
| 1 | Payment provider (verified comparison) | All money flows | Blocked (DEC-SA-029) |
| 2 | Operational data store (evidence phase) | Backend build | Deferred (DEC-SA-059) |
| 3 | Default cancellation-policy values | Refund policy defaults | Open (OQ-SA-043) |
| 4 | Gender format legal review | Women-only / men-only | Blocked (DEC-SA-043) |
| 5 | Anonymity/reveal legal review | Privacy implementation | Blocked (OQ-SA-045) |
| 6 | Retention periods | Privacy policy, data model | Open (OQ-SA-005) |
| 7 | Brand name and identity | Design, marketing | Open (OQ-SA-006) |
| 8 | Launch city | Catalog seeding | Open (OQ-SA-038) |
| 9 | Min/max participant counts per activity | Scheduling | Open (OQ-SA-040) |
| 10 | Reservation duration (recommended 10 min) | Capacity UX | Open (OQ-SA-039) |
| 11 | Role permission boundaries | RBAC build | Open (OQ-SA-008) |
| 12 | v1 franchises: internal vs. external licensed franchisees | Franchise rollout | Open (OQ-SA-067) |
| 13 | Idle re-auth thresholds + Platform Owner access protocol | Auth implementation | Open (OQ-SA-069) |

Full list: `docs/project-records/02-open-questions.md`.

## 5. Assumptions (top-level)

Full register with validation owners: `docs/project-records/03-assumptions-register.md`. Highlights:

| ID | Assumption | Status |
| --- | --- | --- |
| ASM-SA-001/005/006 | Demand and willingness-to-pay exist | Needs validation |
| ASM-SA-015/037 | Firebase + modest v1 scale assumptions | Needs validation |
| ASM-SA-021 | Weekend/evening demand meets minimums | Needs validation |
| ASM-SA-029/030 | Declared-gender eligibility workable; single-gender demand | Needs validation |
| ASM-SA-024/031/032 | Provider + phone-OTP abuse control | Needs validation |
| ASM-SA-035 | One person may hold multiple staff roles | Active |
| ~~Single coordinator per session~~ | **Superseded** by flexible staffing (DEC-SA-053) | Superseded |
| ~~18+ default floor~~ | **Superseded** by proposed v1 boundary (DEC-SA-004) | Superseded |

## 6. Next actions

| Priority | Action | Owner |
| --- | --- | --- |
| High | **Founder approval of SA-0C proposed decisions** (DEC-SA-001…017, 018…020, 021/023…027, 030…033, 038…041, 044/045/047, 048…057) — consolidated in `MASTER_PROJECT_STATE.md` §7 | Founder |
| High | Resolve blocking items: provider comparison (OQ-SA-041), data-store evidence phase (DEC-SA-060), launch city (OQ-SA-038), min/max values (OQ-SA-040), retention (OQ-SA-005), role boundaries (OQ-SA-008) | Founder + Finance + Engineering |
| High | Legal reviews: gender formats (OQ-SA-046), anonymity/reveal (OQ-SA-045), age boundary (OQ-SA-047), retention | Legal |
| High | Run data-store evidence list (`docs/architecture/03-operational-data-store-evaluation.md` §6) — gate for DEC-SA-059 | Engineering |
| Medium | Validate assumptions with user interviews and pilot planning | Founder + Marketing |
| Medium | Confirm reservation duration (OQ-SA-039), waitlist commitment (OQ-SA-050), multi-slot booking (OQ-SA-055) | Founder |
| Low | Brand identity (OQ-SA-006) | Founder |
| Medium | SA-1A follow-ups: franchise v1 model (OQ-SA-067), Regional territory model (OQ-SA-068), idle re-auth thresholds + founder/security protocol (OQ-SA-069) | Founder + Ops + Security |
| High | Founder approval of SA-1A proposed decisions DEC-SA-062/063 (franchise hierarchy + Operations Manager rename) | Founder |

## 7. Changelog

| Date | Change |
| --- | --- |
| 2026-08-04 | Created documentation foundation: 23 planning docs + README. |
| 2026-08-04 | SA-0C complete: 11 new docs (operating model, event/session domain, capacity/reservation/waitlist, pricing/payments/refunds, anonymity reveal, gender formats, verification, tournament formats, staffing model, data-store evaluation, assumptions register). 61 canonical decisions (DEC-SA-001…061) + legacy mapping (DEC-SA-101…118). Open questions migrated to OQ-SA-### with legacy mapping. No production code generated. |
| 2026-08-04 | SA-0D complete: CTO consolidation. Created `MASTER_PROJECT_STATE.md` (single source of truth). Classified all decisions (4 duplicate pairs merged), closed 6 questions, merged 6 question pairs, reviewed all 39 assumptions and 14 risks, defined canonical terminology, consolidated Super Admin 14 modules → 11, set v1/v1.5/v2/Future feature priorities, and published health scores (see MASTER §9.1). No documents deleted. |
| 2026-08-04 | SA-1A complete: Experience OS design. Created franchise operating model (`docs/admin/15`) with 8-tier command chain + 5 functional roles (DEC-SA-062/063 proposed), complete authentication experience (`docs/auth/01`) with splash/login/role-check/verification/session lifecycle + UX review (12 verdicts), 9 screen specifications (`docs/auth/02`), and Experience OS design system + motion language (`docs/design-system/02`). Added OQ-SA-067/068/069. No production code generated. |
