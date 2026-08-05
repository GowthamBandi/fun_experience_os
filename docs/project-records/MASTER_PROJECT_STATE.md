# MASTER PROJECT STATE

> **Status:** Live master document — single source of truth (SA-0D).
> **Document type:** Master project state / CTO consolidation.
> **Last updated:** 2026-08-04 (SA-0D — CTO consolidation & architecture review).
> Read this first. Everything else in `docs/` is supporting detail.

---

## 1. Current Vision

A platform where people **pay to join limited-slot, real-world experiences** (sports-first: box cricket, badminton, indoor games; later tournaments, adventure, social), **operated end-to-end by the company**, with **participant anonymity as a core product guarantee**.

Key promises:
- Participants join **anonymously** (see joined counts, not rosters); temporary random IDs per booking for check-in.
- Teams may be **randomly allocated** shortly before the event.
- Supports **women-only / men-only / mixed / open** formats with declared-gender eligibility (legal review pending).
- **No oversell, ever**; capacity is server-enforced.
- The **company creates, prices, schedules and operates** all experiences in v1.

Stack direction: **Flutter** (participant app) · **Next.js + TypeScript** (Super Admin) · **Firebase Auth + FCM** (confirmed) · operational data store **undecided** (evidence-driven, provisional recommendation PostgreSQL — DEC-SA-059).

## 2. Product Status

| Area | Status | Notes |
| --- | --- | --- |
| Problem / opportunity | Draft complete | Needs user-interview validation (ASM-SA-001/005/006) |
| Vision & principles | Complete | Anonymity-first, company-operated |
| Business model | Draft complete | Pay-per-slot; provider selection blocked |
| v1 scope | Draft complete | Single-city, company-operated, sports-first |
| Launch operating model | Proposed (DEC-SA-001…017) | **Awaiting founder approval** |
| Super Admin definition | Draft complete | 14 docs; consolidated to 11 modules (SA-0D) |
| Feature priority | Defined (SA-0D) | v1 / v1.5 / v2 / Future buckets below |
| Brand & identity | **Not started** | Blocks design (OQ-SA-006) |
| Launch city | **Not decided** | Blocks catalog seeding (OQ-SA-038) |

## 3. Architecture Status

| Component | Status |
| --- | --- |
| Participant app (Flutter) | Flutter scaffold only; no app code |
| Super Admin (Next.js + TypeScript) | Not started; no repo decision (monorepo open — OQ-SA-030) |
| Backend | Firebase Auth + FCM confirmed (DEC-SA-061); **data store undecided** (DEC-SA-058/059); evidence phase required (DEC-SA-060) |
| Payment integration | **Blocked** — provider selection pending verified comparison (DEC-SA-029 / OQ-SA-041) |
| Data model | Domain vocabulary canonical (DEC-SA-018/019); **no schema** (entity draft is legacy, uses "event room") |
| Anonymity enforcement | Policies defined (DEC-SA-034…038); query-layer design open (OQ-SA-026) |
| Tech decisions still open | Flutter state management (OQ-SA-029), monorepo (OQ-SA-030), admin UI kit (OQ-SA-031), TeamAllocation persistence (OQ-SA-032), mobile admin (OQ-SA-033) |

## 4. Completed Phases

| Phase | Deliverables | Status |
| --- | --- | --- |
| SA-00 | Documentation foundation: 23 planning docs + README + Flutter scaffold | Complete |
| SA-0C | Decision-resolution: 61 canonical decisions (DEC-SA-001…061), open-question registry (OQ-SA-001…066), assumptions/risk register | Complete |
| SA-0D | CTO consolidation: master state, decision/assumption/risk consolidation, domain + module + feature review, this document | Complete |
| SA-1A | Experience design: franchise hierarchy + operating model, complete auth experience + 9 screen specs, Experience OS design system + motion | Complete |

## 5. Remaining Phases

| Phase | Purpose | Prerequisite |
| --- | --- | --- |
| **SA-0E** | Information Architecture & technical foundation: resolve tech decisions, run data-store evidence, define API/schema | Founder approval of SA-0C proposed decisions |
| SA-0F | Production development (Claude Code): backend + admin + app | SA-0E, payment provider |
| Post-v1 | Multi-city, more formats, verification provider, marketplace options | v1 validation |

## 6. Approved Decisions (summary)

See `docs/project-records/01-decisions-log.md` for the full register and SA-0D merge table.

**Core stack:** Flutter (DEC-SA-101) · Next.js + TypeScript (DEC-SA-102) · Firebase initial backend (DEC-SA-103) · Firebase Auth + FCM (DEC-SA-061) · Claude Code development later (DEC-SA-117) · no production code during planning (DEC-SA-118).

**Product/operations:** company operates itself (DEC-SA-104) · participants anonymous, joined counts only (DEC-SA-105) · temporary random event IDs (DEC-SA-106) · random team allocation (DEC-SA-107) · fixed capacity / no oversell (DEC-SA-109/022) · slot reserved only after payment (DEC-SA-110) · company cancellation → automatic full refund (DEC-SA-111) · RBAC with draft roles (DEC-SA-112) · immutable audit (DEC-SA-113) · conditional verification (DEC-SA-114/047) · revenue + operational analytics in v1 (DEC-SA-116).

**Integrity/privacy:** strict server-enforced capacity (DEC-SA-022) · server is the only capacity writer (DEC-SA-028) · per-stage minimum-necessary access (DEC-SA-034) · participants never get each other's legal identity/contact (DEC-SA-035) · audited emergency access (DEC-SA-037) · gender declaration never public (DEC-SA-042) · no identity-document image storage by default (DEC-SA-046) · data store is an independent decision (DEC-SA-058).

## 7. Open Decisions (all founder-blocking)

| Category | Items | Owner |
| --- | --- | --- |
| **Launch config (proposed)** | One-city launch, activity mix, 18+ boundary, hours, venue model, recurring templates, equipment, weather/emergency/no-show/reschedule rules (DEC-SA-001…017) | Founder |
| **Capacity/booking (proposed)** | Reservation window, min-fill cutoff, waitlist, admin/complimentary slots, window reopen, duplicate-block, multi-slot (DEC-SA-021, 023, 025, 026, 027) | Founder |
| **Money (proposed/blocked)** | Configurable cancellation policy (030), webhook confirmation (031), financial event log (032), promo/complimentary accounting (033) — **provider selection blocked** (029) | Founder + Finance + Engineering |
| **Privacy/gender (proposed/blocked)** | Gender declaration access (038), format set (039), no invasive verification (040), coordinator gender (041) — **legal review blocked** (043) | Founder + Legal |
| **Trust (proposed)** | Progressive verification levels (044), provider-not-KYC (045), per-activity requirements (047) | Founder + Engineering + Legal |
| **Tournaments (proposed)** | Single elimination v1 (048), team+individual entry (049), staff-only scoring (050), edge-case rules (051), winner/completion (052) | Founder + Ops |
| **Staffing (proposed)** | Flexible staffing (053), min staffing (054), check-in/substitution/absence (055), escalation/emergency (056), responsibility boundaries (057) | Founder + Ops |
| **Domain (proposed)** | Canonical vocabulary (018), deprecate "event room" (019), session = smallest unit (020) | Founder |
| **Franchising (proposed)** | Franchise hierarchy + Operations Manager rename (DEC-SA-062/063) | Founder |
| **Architecture (deferred)** | Data store (059) pending evidence (060); social messaging (036) deferred | Engineering + Founder |

## 8. Critical Risks

| ID | Risk | Classification |
| --- | --- | --- |
| RSK-SA-008 | Low fill, no-shows and cancellations hurt revenue/trust | **Critical** |
| RSK-SA-003 | Anonymity, gender and emergency-access rules create legal/privacy exposure | **Critical** (legal blocked) |
| RSK-SA-001 | Venue rental costs erode margin | **High** |
| RSK-SA-004 | Payment provider lacks required capabilities | **High** (blocked) |
| RSK-SA-005 | Reservation expiry unreliable → lost/double-sold slots | **High** |
| RSK-SA-007 | Wrong data-store choice → mid-build migration | **High** (deferred) |
| RSK-SA-011 | Staffing gaps and authority misuse | **High** |
| RSK-SA-012 | Identity/verification data breach or provider dependency | **High** (low likelihood) |
| RSK-SA-013 | Overbooking, duplicate payments, financial bugs | **High** (low likelihood) |
| RSK-SA-002 | Terminology migration confusion | **Medium** |
| RSK-SA-006 | Waitlist auto-promotion + payment complexity | **Medium** |
| RSK-SA-009 | Weather cancellations and seasonality | **Medium** |
| RSK-SA-010 | Tournament scoring disputes / bracket edge cases | **Medium** |
| RSK-SA-014 | Single-city failure misreads as product failure | **Medium** |

## 9. Project Metrics

| Metric | Value |
| --- | --- |
| Planning documents | 38 (incl. project records) |
| Canonical decisions (DEC-SA) | 63 (approved 15 · proposed ~42 · blocked 2 · deferred 3 · 1 refined legacy) |
| Legacy decisions | 18 (DEC-SA-101…118) |
| Decisions merged in SA-0D | 4 pairs → 4 (see decisions log §SA-0D) |
| Open questions (OQ-SA) | 69 registered; 6 closed as answered; 8 merged; **genuinely open ≈ 55** |
| Assumptions (ASM-SA) | 39 (2 superseded · 1 meta → retire on approval · ~15 needs validation) |
| Risks (RSK-SA) | 14 (2 critical · 6 high · 6 medium) |
| Super Admin modules | Consolidated 14 → **11** |
| Launch city | Undecided (OQ-SA-038) |
| Payment provider | Unselected (DEC-SA-029) |
| Data store | Undecided (DEC-SA-059) |

### 9.1 Project health (SA-0D assessment)

| Dimension | Score | Why |
| --- | --- | --- |
| Documentation quality | 85% | Extensive and consistent, but overlapping (legacy vs canonical), legacy terminology, and pre-SA-0D there was no master entry point |
| Architecture readiness | 35% | Context + tech decisions exist; data store blocked, no schema/API/backend pattern, anonymity query layer open |
| Business readiness | 40% | Model defined; payments blocked, launch city open, unit economics + demand unvalidated |
| Operational readiness | 45% | Lifecycle + staffing defined; staffing table, min-fill values, runbook tooling open |
| Security readiness | 50% | Principles + access matrices strong; legal reviews (gender, anonymity, age, retention) all blocked |
| Design readiness | 20% | Admin direction only; no brand, no UI kit, no wireframes, zero participant-app design |
| Engineering readiness | 20% | Flutter scaffold only; no admin/backend repos, no repo layout, no state mgmt/UI-kit choice |

## 10. Version 1 Feature List (SA-0D baseline)

> Scope discipline: v1 must prove booking + operations in one city. Anything that only helps after repeat volume or multi-city is deferred.

**v1 (must-ship):**
- Participant app: phone-OTP signup, browse by city/activity/format, joined-count view, book + pay, temp event ID, my sessions, cancellation within policy, check-in, post-session rating.
- Admin: dashboard; locations (cities, venues, playing areas); catalog (activities, experience templates, pricing/capacity, formats & restrictions); scheduling (sessions, booking windows, min-fill); bookings (list/detail, check-in, waitlist); money (payments, refunds, promo codes); people & safety (participants, incidents, reports & bans, phone-verified status); tournaments (single elimination: bracket, seeding, scoring, byes); staffing (assignments, staff check-in, substitution); notifications (transactional); analytics (revenue, fill, no-show, incident); RBAC + audit.
- Backend: server-enforced capacity, reservation expiry, webhook-confirmed payment, immutable money/audit log, anonymity-safe query layer.

**v1.5 (post-launch hardening, not launch-blocking):** QR check-in, SMS channel + email receipts, automated refunds, waitlist auto-promotion polish, multi-slot/bring-a-friend (if approved), live brackets to participants, standings/ratings, reschedule flows, verification provider (V3), reconciliation exports.

**v2:** multi-city operations, multi-format tournaments (round robin, group+knockout), adventure/high-risk with V3/V4 verification, loyalty/trusted-participant badges, analytics warehouse, dedicated mobile admin for staff.

**Future:** third-party marketplace, social messaging (mutual-consent connect), live scorecasting, equipment rental, public API, leagues at scale, cross-country ops, dynamic pricing.

## 11. Next Engineering Phase (SA-0E — not started)

Founder approval of the SA-0C proposed decisions is the gate. SA-0E then executes:

1. **Tech decision closure** — Flutter state management, monorepo vs separate repos, admin UI kit, TeamAllocation persistence (OQ-SA-029…032).
2. **Data-store evidence phase** — verify the 10 items in `docs/architecture/03-operational-data-store-evaluation.md` §6, then approve DEC-SA-059.
3. **Payment provider comparison** — verified vendor table (fees, refunds, webhooks, settlement, disputes) to unblock DEC-SA-029 (with Finance).
4. **Information architecture & schema** — wireframe-level admin IA; domain schema from the canonical vocabulary (sessions, playing areas, bookings, capacity, money, safety).
5. **API / backend skeleton** — enforcement of anonymity + capacity + audit in the query/service layer.
6. **Design system kickoff** — brand + admin tokens + participant app direction.

**Gate condition for SA-0E:** founder decision record on all proposed DEC-SA items (§7 above) and resolution of the four owner-locked questions (city, provider, retention, role boundaries).

## 12. Canonical Terminology (SA-0D)

| Term | Meaning | Used for |
| --- | --- | --- |
| Activity (category) | Kind of activity; defines rules/formats/defaults | Badminton, box cricket, indoor games |
| Experience template | Reusable program definition producing sessions | "Saturday Box Cricket" |
| Session | One scheduled instance (date/time/venue) — **smallest bookable unit** | What customers book |
| Playing area | Physical sub-area of a venue | Court 1, Ground A |
| Venue | Physical location containing playing areas | Sports club, hall |
| Slot | One participant position on a session | Capacity unit |
| Booking | A participant's reserved/confirmed position on a session | Payment, temp ID, check-in |
| Participant | A person who joined an activity (v1 = payer; "customer" deprecated as a separate term) | App user |
| Team | Participants allocated together for a session | Random allocation |
| Match | One competition between participants/teams | Tournament unit |
| Tournament | Event of multiple matches with defined structure | Brackets, scoring |
| Staff assignment | Staff member + role + session/event | Lead coordinator, referee, safety contact |
| Admin role | A Super Admin access identity (RBAC) | Event Coordinator role ≠ "coordinator" on-site assignment |

Disambiguation notes: "Coordinator" is used both as an admin role (Event Coordinator) and an on-site assignment (lead/supporting coordinator) — treat as distinct. "Organizer" = the company (no third-party hosts in v1); "Moderator" = deprecated in favour of Safety and Moderation Officer role.

## 13. Source Map

| Topic | Primary document | Secondary / legacy |
| --- | --- | --- |
| Vision | `docs/product/01-product-vision.md` | — |
| Problem | `docs/product/02-problem-and-opportunity.md` | — |
| Business model | `docs/product/03-business-model.md` | `docs/admin/13-pricing-payment-and-refund-policy.md` |
| v1 scope / priorities | `docs/product/04-v1-scope.md` | MASTER §10 |
| Operating model | `docs/product/05-v1-operating-model.md` | — |
| Domain vocabulary | `docs/admin/11-event-and-session-domain-model.md` | `docs/database/01-domain-entity-draft.md` (legacy) |
| Capacity/waitlist | `docs/admin/12-capacity-reservation-and-waitlist-policy.md` | — |
| Pricing/payments/refunds | `docs/admin/13-pricing-payment-and-refund-policy.md` | `docs/admin/06-booking-and-payment-operations.md` |
| Tournaments | `docs/admin/14-tournament-formats-and-scoring.md` | `docs/admin/08-tournament-management.md` (legacy) |
| Staffing | `docs/operations/02-event-staffing-and-responsibility-model.md` | `docs/operations/01-event-operations-lifecycle.md` |
| Anonymity/reveal | `docs/security/02-anonymity-and-reveal-policy.md` | `docs/admin/07-participant-and-safety-management.md` |
| Gender policy | `docs/security/03-gender-format-and-inclusion-policy.md` | — |
| Verification | `docs/security/04-verification-and-trust-model.md` | — |
| Admin design | `docs/design-system/01-admin-design-direction.md` | — |
| Data store | `docs/architecture/03-operational-data-store-evaluation.md` | — |
| System context | `docs/architecture/01-system-context.md` | — |
| Tech decisions | `docs/architecture/02-technology-decisions.md` | — |
| Franchise hierarchy / ops model | `docs/admin/15-franchise-operating-model.md` | `docs/admin/02-admin-users-and-roles.md` (legacy 10-role baseline) |
| Authentication experience | `docs/auth/01-authentication-experience.md` | `docs/auth/02-screen-specifications.md` (screen specs) |
| Experience OS design system | `docs/design-system/02-experience-os-design-system.md` | `docs/design-system/01-admin-design-direction.md` |

## 14. Changelog

| Date | Change |
| --- | --- |
| 2026-08-04 | Created as SA-0D deliverable: single source of truth consolidating vision, decisions, risks, metrics, feature priorities and next phase. |
| 2026-08-04 | SA-1A update: added Experience design phase row (§4), franchising OQ-SA-067/068 + idle re-auth OQ-SA-069 tracking, 4 new docs, metrics (38 docs, 63 decisions, 69 questions), and source-map entries for franchise model, auth experience, and Experience OS design system. |
