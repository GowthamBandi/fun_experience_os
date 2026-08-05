# 01 — Decisions Log

> **Status:** Live project record (maintained).
> **Document type:** Decision log.
> Entries are appended; earlier entries are not rewritten destructively. Canonical decision identifiers are `DEC-SA-###`. Legacy identifiers (`D-###`) are retained and mapped in §3.

---

## 1. How to log decisions

Each decision entry records: status, the decision, rationale, and follow-ups. Status values: **Approved / Proposed / Blocked / Deferred**. Status changes are annotated in the changelog, not by editing past rows.

## 2. Canonical decision index (DEC-SA-###)

### 2.1 SA-0C decisions (this phase)

| ID | Area | Decision | Status |
| --- | --- | --- | --- |
| DEC-SA-001 | Launch | One-city launch | Proposed |
| DEC-SA-002 | Launch | Company-operated events only | Proposed |
| DEC-SA-003 | Launch | Initial mix: box cricket, badminton, selected indoor games | Proposed |
| DEC-SA-004 | Launch | 18+ adult boundary (proposed v1, not permanent) | Proposed |
| DEC-SA-005 | Launch | Weekends + weekday evenings | Proposed |
| DEC-SA-006 | Launch | Per-slot venue rental contracts | Proposed |
| DEC-SA-007 | Launch | Recurring weekly templates | Proposed |
| DEC-SA-008 | Launch | Per-activity min/max participant counts | Proposed |
| DEC-SA-009 | Launch | Min-fill cancellation at cutoff with auto refund | Proposed |
| DEC-SA-010 | Launch | Flexible staffing (supersedes single-coordinator) | Proposed |
| DEC-SA-011 | Launch | Referee requirement by event type | Proposed |
| DEC-SA-012 | Launch | Company-supplied equipment | Proposed |
| DEC-SA-013 | Launch | Weather cancellation: company decision + full refund | Proposed |
| DEC-SA-014 | Launch | Emergency closure authority + full refund | Proposed |
| DEC-SA-015 | Launch | Grace period + no-refund on no-show | Proposed |
| DEC-SA-016 | Launch | FIFO waitlist with auto-promotion | Proposed |
| DEC-SA-017 | Launch | Reschedule with re-confirmation | Proposed |
| DEC-SA-018 | Domain | Canonical domain vocabulary | Proposed |
| DEC-SA-019 | Domain | Deprecate "event room"; use "session" + "playing area" | Proposed |
| DEC-SA-020 | Domain | Session is the smallest bookable unit | Proposed |
| DEC-SA-021 | Capacity | Temporary reservation (recommended 10 min, configurable) | Proposed |
| DEC-SA-022 | Capacity | Strict server-enforced capacity; no oversell | Approved |
| DEC-SA-023 | Capacity | Min-viable-count decision at cutoff; auto refund | Proposed |
| DEC-SA-024 | Capacity | FIFO waitlist with auto-promotion | Proposed |
| DEC-SA-025 | Capacity | Manual/complimentary/staff-held slots audited | Proposed |
| DEC-SA-026 | Capacity | Fixed booking window; audited reopen | Proposed |
| DEC-SA-027 | Capacity | Block duplicate same-account bookings; multi-slot open | Proposed |
| DEC-SA-028 | Capacity | Server/backend is the only capacity writer | Approved |
| DEC-SA-029 | Money | Payment-provider selection blocked pending verified comparison | Blocked |
| DEC-SA-030 | Money | Configurable per-experience cancellation policy | Proposed |
| DEC-SA-031 | Money | Booking confirmed only on server-side webhook | Proposed |
| DEC-SA-032 | Money | Immutable financial event log (v1) | Proposed |
| DEC-SA-033 | Money | Promo/complimentary audited and separately reported | Proposed |
| DEC-SA-034 | Privacy | Per-stage minimum-necessary-access matrix | Approved |
| DEC-SA-035 | Privacy | Other participants never get legal identity/contact after reveal | Approved |
| DEC-SA-036 | Privacy | Mutual-consent connection principle; social messaging deferred | Deferred |
| DEC-SA-037 | Privacy | Authorized emergency access during incidents (audited) | Approved |
| DEC-SA-038 | Privacy | Gender declaration visible only to eligibility staff | Proposed |
| DEC-SA-039 | Gender | Format set: women-only/men-only/mixed/open; declared-gender eligibility | Proposed |
| DEC-SA-040 | Gender | No invasive verification by default | Proposed |
| DEC-SA-041 | Gender | Coordinator gender requirements configurable per template | Proposed |
| DEC-SA-042 | Gender | Gender declaration never public to participants | Approved |
| DEC-SA-043 | Legal | Gender/eligibility legal conclusions blocked pending Indian legal review | Blocked |
| DEC-SA-044 | Trust | Progressive verification levels (V1–V7) | Proposed |
| DEC-SA-045 | Trust | Specialized verification provider later; no custom KYC | Proposed |
| DEC-SA-046 | Trust | No identity-document image storage by default | Approved |
| DEC-SA-047 | Trust | Per-activity-class verification requirements | Proposed |
| DEC-SA-048 | Tournaments | Single elimination = proposed v1 implementation; model future-compatible | Proposed |
| DEC-SA-049 | Tournaments | Team + individual entry supported | Proposed |
| DEC-SA-050 | Tournaments | Staff-only score submission with audited corrections | Proposed |
| DEC-SA-051 | Tournaments | Standardized result edge-case handling | Proposed |
| DEC-SA-052 | Tournaments | Winner declaration + completion snapshot | Proposed |
| DEC-SA-053 | Staffing | Flexible role-based staffing (8 assignment types) | Proposed |
| DEC-SA-054 | Staffing | Configurable minimum staffing by event type | Proposed |
| DEC-SA-055 | Staffing | Staff check-in, substitution, absence workflows | Proposed |
| DEC-SA-056 | Staffing | Escalation chain and emergency authority | Proposed |
| DEC-SA-057 | Staffing | Responsibility boundary table | Proposed |
| DEC-SA-058 | Data store | Data store is an independent decision; Firestore not implicitly selected | Approved |
| DEC-SA-059 | Data store | Provisional recommendation: Option B (PostgreSQL core), deferred pending evidence | Deferred |
| DEC-SA-060 | Data store | Evidence list must be verified before approval | Deferred |
| DEC-SA-061 | Data store | Firebase Auth + FCM confirmed components either way | Approved |

### 2.2 Legacy decisions (D-###) restated as DEC-SA-1##

| Legacy ID | Canonical ID | Decision | Status |
| --- | --- | --- | --- |
| D-001 | DEC-SA-101 | Customer app built with Flutter (Android + iOS) | Approved |
| D-002 | DEC-SA-102 | Super Admin built with Next.js + TypeScript | Approved |
| D-003 | DEC-SA-103 | Initial backend on Firebase | Approved |
| D-004 | DEC-SA-104 | Company creates/prices/schedules/operates itself | Approved |
| D-005 | DEC-SA-105 | Participants anonymous; joined counts only | Approved |
| D-006 | DEC-SA-106 | Temporary random event IDs per booking | Approved |
| D-007 | DEC-SA-107 | Random team allocation before the event | Approved |
| D-008 | DEC-SA-108 | Men-only / women-only / mixed formats | Approved (refined by DEC-SA-039) |
| D-009 | DEC-SA-109 | Fixed capacity; no oversell | Approved (reaffirmed by DEC-SA-022) |
| D-010 | DEC-SA-110 | Slot reserved only after successful payment | Approved |
| D-011 | DEC-SA-111 | Company-cancelled sessions → automatic full refund | Approved |
| D-012 | DEC-SA-112 | RBAC with 10 draft roles, not final | Approved (boundaries open) |
| D-013 | DEC-SA-113 | Audit history immutable by all roles | Approved |
| D-014 | DEC-SA-114 | Verification conditional per activity/format | Approved (refined by DEC-SA-044/047) |
| D-015 | DEC-SA-115 | Single-elimination baseline | **Refined** — now proposed v1 only (DEC-SA-048) |
| D-016 | DEC-SA-116 | Revenue + operational analytics in v1 | Approved |
| D-017 | DEC-SA-117 | Production development later using Claude Code | Approved |
| D-018 | DEC-SA-118 | No production code/rules/functions/payments written now | Approved |

> Note: **"Firebase selected" (DEC-SA-103) does not imply "Cloud Firestore selected."** The data store is an open, evidence-driven decision (DEC-SA-058/059).

## 3. Legacy mapping

All `D-###` identifiers map to `DEC-SA-1##` per the table above. New entries use `DEC-SA-0##`. Older documents may still reference `D-###`/`Q-###`/`A#`; those references remain valid.

## 4. Entry details

### DEC-SA-112 / D-012 Admin RBAC (approved as draft)
- Roles: Platform Owner, Super Admin, City Manager, Event Operations Manager, Event Coordinator, Customer Support, Safety and Moderation Officer, Finance Manager, Marketing Manager, Analyst.
- Permission boundaries explicitly open (OQ-SA-008).

### DEC-SA-115 → DEC-SA-048 (tournament format)
- Single elimination is the **proposed Version 1 implementation**, not a permanent architecture. Future formats (round robin, group+knockout, league, best-of, casual series, individual) must remain possible.

### DEC-SA-059 (data store, deferred)
- Provisional recommendation: Option B — PostgreSQL as operational source of truth, Firebase Auth + FCM retained.
- Must not be treated as final until evidence items (WS10 §6) are verified by Claude Code or a senior engineer.

## 5. SA-0D consolidation (CTO review)

### 5.1 Classification of all canonical decisions

| Class | Decision IDs | Count |
| --- | --- | --- |
| Approved | 022, 028, 034, 035, 037, 042, 046, 058, 061, 101–117 (except 108/114/115 refinements) | 15 canonical + 16 legacy |
| Proposed (awaiting founder) | 001–021, 023, 025–027, 030–033, 038–041, 044, 045, 047–057 | 43 |
| Blocked | 029 (payment provider), 043 (gender/eligibility legal) | 2 |
| Deferred | 036 (social messaging), 059 (data store), 060 (evidence) | 3 |
| Outdated | 002 (superseded by 104), 016/024 and 010/053 (duplicated) | merged below |
| Merged | see §5.2 | 4 pairs |

### 5.2 Merged decisions

| Keep | Absorbed | Rationale |
| --- | --- | --- |
| DEC-SA-104 (company-operated) | DEC-SA-002 | 002 reaffirmed 104 with no new content |
| DEC-SA-053 (flexible staffing) | DEC-SA-010 | Identical proposal written twice (WS1 + WS9) |
| DEC-SA-016 (FIFO waitlist) | DEC-SA-024 | Identical proposal written twice (WS1 + WS2) |
| DEC-SA-008 (min/max config) | DEC-SA-023 (cutoff decision) | One decision: per-activity min/max + ops decision at cutoff |

### 5.3 Notes
- DEC-SA-022 ↔ DEC-SA-028 ↔ legacy DEC-SA-109 all express "no oversell / server-enforced"; 022/028 are the canonical forms, 109 is retained as legacy mapping only.
- DEC-SA-108 (formats) refined by DEC-SA-039; DEC-SA-114 (verification) refined by DEC-SA-044/047; DEC-SA-115 refined by DEC-SA-048. Retained as legacy history.
- Status changes are annotated here, not by rewriting earlier rows.

### 5.4 SA-1A decisions (authentication + franchise hierarchy)

| ID | Area | Decision | Status |
| --- | --- | --- | --- |
| DEC-SA-062 | Organization | Franchise hierarchy adopted: 8-tier command chain (Platform Owner → Super Admin → Regional Franchise Partner → City Manager → Operations Manager → Venue Manager → Event Coordinator → Staff) + 5 functional roles; supersedes the flat 10-role framing of DEC-SA-112 (legacy names retained for retained roles) | Proposed |
| DEC-SA-063 | Organization | "Event Operations Manager" renamed "Operations Manager" | Proposed |

### 5.5 SA-1A design decisions (auth experience, non-canonical)

Recorded in `docs/auth/01-authentication-experience.md` §9.1 and `docs/design-system/02-experience-os-design-system.md` §6.1: single shared OTP component, warm-revisit splash skip, OTP-first recovery, device-trust default, idle re-auth thresholds, three distinct exception surfaces (Unauthorized / Maintenance / Platform disabled), Inter + working indigo tokens (pending brand OQ-SA-006).

## 6. Changelog

| Date | Change |
| --- | --- |
| 2026-08-04 | Initial decision log created with D-001 … D-018. |
| 2026-08-04 | SA-0C phase: added canonical DEC-SA-001…061, legacy mapping to DEC-SA-101…118, and this changelog. No prior entries rewritten. |
| 2026-08-04 | SA-0D phase: added classification of all decisions, merged 4 duplicate pairs (002→104, 010→053, 016→024, 023→008). No decisions deleted; see §5. |
| 2026-08-04 | SA-1A phase: added DEC-SA-062 (franchise hierarchy) and DEC-SA-063 (Operations Manager rename), both Proposed; recorded auth/design-system design decisions (§5.5). |
