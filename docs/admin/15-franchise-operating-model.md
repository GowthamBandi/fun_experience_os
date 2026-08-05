# 15 — Franchise Hierarchy and Operating Model

> **Status:** Planning draft — SA-1A.
> **Document type:** Organization + operating model (experience OS).
> **This document is a planning draft.** It defines who operates the platform and how franchises work. **No implementation exists.** Keep implementation out of scope (no backend, no code, no schema).

---

## 1. Purpose

Finalize the platform's organization hierarchy before dashboard design. This document supersedes the flat 10-role framing of `docs/admin/02-admin-users-and-roles.md` (DEC-SA-112) with a command chain plus horizontal (functional) roles, and defines how franchises operate.

The console is referred to as **Experience OS** (working name; brand pending — OQ-SA-006).

## 2. Hierarchy overview

### 2.1 Command chain (vertical)

```
Platform Owner
    ↓
Super Admin
    ↓
Regional Franchise Partner
    ↓
City Manager
    ↓
Operations Manager          (renamed from Event Operations Manager — DEC-SA-063)
    ↓
Venue Manager
    ↓
Event Coordinator
    ↓
Staff
```

### 2.2 Functional roles (horizontal, not in the chain)

| Role | Lane |
| --- | --- |
| Customer Support | Participant help, bookings, refunds within limits |
| Safety & Moderation Officer | Incidents, reports, bans, verification review |
| Finance Manager | Payments, refund approvals, reconciliation, audit views |
| Marketing Manager | Promo codes, notifications, content |
| Analyst | Read-only analytics and reporting |

Functional roles are assigned at the scope they serve (city, franchise, or platform) and report along dotted lines (§6). One person may hold multiple positions (ASM-SA-035), subject to conflict-of-interest rules (e.g., Finance ≠ access-grantor).

### 2.3 Relationship to the legacy 10-role draft (DEC-SA-112)

| Legacy role (DEC-SA-112) | SA-1A position | Change |
| --- | --- | --- |
| Platform Owner | Platform Owner | Retained |
| Super Admin | Super Admin | Retained |
| City Manager | City Manager | Retained |
| Event Operations Manager | Operations Manager | Renamed (DEC-SA-063) |
| Event Coordinator | Event Coordinator | Retained |
| Customer Support | Customer Support (functional) | Retained |
| Safety and Moderation Officer | Safety & Moderation Officer (functional) | Retained |
| Finance Manager | Finance Manager (functional) | Retained |
| Marketing Manager | Marketing Manager (functional) | Retained |
| Analyst | Analyst (functional) | Retained |
| — | Regional Franchise Partner | **New** |
| — | Venue Manager | **New** |
| — | Staff | **New** (task-scoped; replaces generic "coordinator/referee" staff pool) |

> **Decision register:** hierarchy adopted → **DEC-SA-062 (Proposed)**. Rename → **DEC-SA-063 (Proposed)**. Legacy role names remain valid for the roles that are retained.

## 3. Command-chain role catalog

Each chain role defines: responsibilities, permissions, visibility, revenue responsibility, operational responsibility, escalation path, reporting structure, future scalability.

### 3.1 Platform Owner

| Dimension | Definition |
| --- | --- |
| Responsibilities | Platform strategy and brand; franchise governance and licensing; legal/compliance sign-off; global risk and budget; emergency escalation final authority; audit oversight |
| Permissions | Write across all modules at platform scope; create/approve franchises; approve global config; **cannot edit or delete audit history** (DEC-SA-113) |
| Visibility | Full cross-franchise visibility at **review level** (per DEC-SA-034); not routine operations |
| Revenue responsibility | Consolidated platform P&L; growth and margin targets |
| Operational responsibility | Platform-level quality and safety standards; franchise standards compliance |
| Escalation path | Apex; receives escalations from Super Admin; external (investors/board) |
| Reporting structure | External ownership/board; platform-level reports upward from all franchises |
| Future scalability | Multi-country, brand licensing, IPO-grade governance; delegation of oversight |

### 3.2 Super Admin

| Dimension | Definition |
| --- | --- |
| Responsibilities | Day-to-day platform administration; franchise launch and oversight; role/user administration; cross-franchise operational support; config control |
| Permissions | Full access to all modules and all franchises (bypasses city scope — OQ-SA-036); manages admin users, roles, settings; cannot edit audit |
| Visibility | All operational data across franchises (per DEC-SA-034) |
| Revenue responsibility | Monitors and enforces financial controls; not a P&L owner |
| Operational responsibility | Runs the platform operations cadence; resolves cross-franchise conflicts |
| Escalation path | To Platform Owner for legal, brand, and global decisions |
| Reporting structure | To Platform Owner; owns aggregated platform reporting |
| Future scalability | Sub-admin variants, delegation scopes, platform-level automation |

### 3.3 Regional Franchise Partner

| Dimension | Definition |
| --- | --- |
| Responsibilities | Operate an assigned region (one or more franchises/cities); hire and manage City Managers; local brand standards; regional P&L; venue and vendor relationships; regional growth |
| Permissions | Full write within franchise scope: catalog, pricing within limits, scheduling, staffing, bookings; refunds within threshold; no platform-level config; **no visibility into other franchises** |
| Visibility | All data within own franchise; aggregate/benchmark views only across franchises |
| Revenue responsibility | Franchise P&L: revenue, margin, fill targets, cost control |
| Operational responsibility | Regional ops, staffing pools, quality audits, standards compliance |
| Escalation path | Super Admin for cross-region/platform matters; Safety Officer for safety; Finance for money thresholds |
| Reporting structure | To Super Admin / Platform Owner; regional reports roll upward |
| Future scalability | External licensed franchisees, multi-city regions, regional branding, franchisee dashboards |

### 3.4 City Manager

| Dimension | Definition |
| --- | --- |
| Responsibilities | City operating results; venues, catalog, service-area; local staffing; local compliance and marketing budget |
| Permissions | Own-city modules (per legacy City Manager row): venues, catalog, scheduling, bookings read/write; pricing within limits |
| Visibility | Own city fully; cross-city aggregates only |
| Revenue responsibility | City contribution and margin; fill-rate targets |
| Operational responsibility | City operations cadence; venue contracts; staffing coverage |
| Escalation path | To Regional Franchise Partner |
| Reporting structure | To Regional Franchise Partner; functional support from Marketing/Analyst |
| Future scalability | Multi-city portfolios, city-level P&L, sub-city service areas |

### 3.5 Operations Manager (formerly Event Operations Manager)

| Dimension | Definition |
| --- | --- |
| Responsibilities | Scheduling, capacity, staffing, session and tournament operations; min-fill go/cancel decisions (DEC-SA-009/023); rescheduling; operations cadence |
| Permissions | Scheduling/capacity/staffing write; session management; bookings read/write; cutoff decisions; staff substitution |
| Visibility | Sessions and bookings within scope; participant aliases/temp IDs; identity only where the per-stage matrix requires (DEC-SA-034) |
| Revenue responsibility | Session margin: fill, no-show, cost control |
| Operational responsibility | Run cadence, go/cancel, staffing coverage, tournament ops |
| Escalation path | City Manager; Safety Officer for incidents; Finance for refund thresholds |
| Reporting structure | To City Manager; data feeds Analyst |
| Future scalability | Multi-venue ops, automated staffing, demand forecasting |

### 3.6 Venue Manager

| Dimension | Definition |
| --- | --- |
| Responsibilities | Venue operations: playing areas, availability, per-slot cost entry, equipment, on-site compliance, venue staff supervision |
| Permissions | Venue + playing area configuration; session availability at venue; check-in support; cost entry; incident entry |
| Visibility | Own venue(s) and their sessions; venue cost; no cross-venue financials |
| Revenue responsibility | Venue margin: utilization, cost control |
| Operational responsibility | Venue readiness, equipment, safety kit, venue-contact role |
| Escalation path | To Operations Manager |
| Reporting structure | To Operations Manager / City Manager |
| Future scalability | Multi-venue portfolios, venue analytics, equipment tracking |

### 3.7 Event Coordinator

| Dimension | Definition |
| --- | --- |
| Responsibilities | Run a session end-to-end (per staffing model DEC-SA-053…057): check-in, team allocation, incident first-response, scores fallback, session closure; lead-coordinator duties |
| Permissions | Session execution: check-in, team allocation, incident logging, score fallback; **no pricing, capacity or refund changes** |
| Visibility | Assigned sessions; participant aliases/temp IDs; identity at check-in stages per matrix (DEC-SA-034) |
| Revenue responsibility | None directly; protects margin through check-in and no-show diligence |
| Operational responsibility | Session execution, safety first-response, closure |
| Escalation path | On-site to Venue Manager / Operations Manager |
| Reporting structure | To Operations Manager |
| Future scalability | On-site mobile surface (OQ-SA-033), multi-session support |

### 3.8 Staff

| Dimension | Definition |
| --- | --- |
| Responsibilities | Task-scoped duties per assignment: check-in staff, referee, safety contact, equipment handler, activity specialist (DEC-SA-053) |
| Permissions | Task-scoped only: score entry (referee), check-in (check-in staff), incident entry (safety contact) |
| Visibility | Only what the assignment requires — least privilege |
| Revenue responsibility | None |
| Operational responsibility | Execute assigned duties; report incidents; follow the day-of runbook |
| Escalation path | To Event Coordinator / lead coordinator |
| Reporting structure | To Event Coordinator |
| Future scalability | Dedicated staff app/mobile surface, certification records |

## 4. Functional role catalog (compact)

| Role | Responsibilities | Permissions | Visibility | Revenue | Escalation | Reports to |
| --- | --- | --- | --- | --- | --- | --- |
| Customer Support | Booking help, refunds within limits, participant issues, dispute intake | Bookings write, refunds within threshold, promo-code support | On-ticket only (per DEC-SA-034) | None | Refunds above threshold → Finance | City Manager (functional) |
| Safety & Moderation Officer | Incidents, reports, bans, verification review, emergency access oversight | Safety modules write; ban authority (second-approver rules open — OQ-SA-008) | Full safety-scoped (DEC-SA-034) | None | Super Admin / Platform Owner | Platform Owner (functional) |
| Finance Manager | Payments, refund approvals, reconciliation, financial audit views | Money modules; approval thresholds; audit read | Financial only; identity only for disputes (DEC-SA-034) | Owns financial control | Platform Owner for policy | Franchise Partner / Platform Owner (functional) |
| Marketing Manager | Promo codes, notifications, catalog content | Promo + notifications + content write | Campaign scope | None | Promotional sends may require approval (OQ-SA-037) | City / Franchise (functional) |
| Analyst | Read-only analytics and reports | Analytics read at assigned scope | Aggregates + scope data | None | None | Leadership (functional) |

## 5. Franchise operating model

### 5.1 Definition and structure

A **franchise** is the accountable operating unit for one or more cities. The platform creates franchises; a franchise runs cities; cities run venues; venues run events; revenue reports upward.

```
Platform
  └─ Franchise A ── City A1 ── Venue A1.1 ── Sessions
                    City A2 ── Venue A2.1 ── Sessions
  └─ Franchise B ── City B1 ── ...
```

### 5.2 How franchises operate

1. **Creation** — Platform Owner/Super Admin creates a franchise, assigns its region (one or more cities), targets, and an accountable Franchise Partner.
2. **Autonomy** — Franchise manages its own cities, venues, catalog within standards: staffing, venue contracts, local pricing within limits, local marketing budget.
3. **Revenue flow** — Session revenue → venue → city → franchise → platform consolidation. Franchise reports contribution and margin upward on a fixed cadence; Finance reconciles centrally.
4. **Boundaries** — A franchise never sees another franchise's data. Cross-franchise access is explicit and rare (platform roles only).
5. **Standards** — One platform, one brand standard, one safety/quality baseline, one technology stack. Franchise autonomy is over operations, never over safety or financial integrity.

### 5.3 Centralized vs local (autonomy matrix)

| Area | Centralized (platform) | Local (franchise) |
| --- | --- | --- |
| Brand, platform identity | Yes | Follows standards |
| Technology, Experience OS | Yes | None |
| Safety & moderation policy | Yes | Executes locally |
| Financial control & reconciliation | Yes | Local P&L reporting |
| Pricing | Limits + approval levels | Within limits |
| Catalog & scheduling | Guidelines | Decided locally |
| Staffing & hiring | Standards | Recruited locally |
| Venue contracts | Standards | Negotiated locally |
| Marketing | Brand + approval for promos | Budget and campaigns local |

### 5.4 v1 stance

- v1 runs **one region / one franchise** (the launch city, OQ-SA-038) under company operation.
- **External/licensed franchisees are post-v1** (OQ-SA-067). This keeps v1 consistent with the approved company-operated decision (DEC-SA-104) while building the hierarchy to scale.
- The hierarchy is implemented in the data model and RBAC from day one (design once, run one), matching DEC-SA-001's "design once, run one" principle.

## 6. Escalation and reporting structure

### 6.1 Escalation paths

| Situation | Primary | Then | Final |
| --- | --- | --- | --- |
| Session execution issue | Staff → Coordinator | Venue Manager → Operations Manager | City Manager |
| Min-fill / go-cancel | Operations Manager decision | — | — |
| Venue/ops issue | Venue Manager | Operations Manager | City Manager |
| Safety incident | Safety contact / Coordinator | Safety & Moderation Officer | Super Admin |
| Refund above threshold | Customer Support | Finance Manager | Franchise Partner |
| Policy/legal/brand | — | Super Admin | Platform Owner |

### 6.2 Reporting lines

- **Solid lines:** the command chain (§2.1). Accountability flows upward; goals flow downward.
- **Dotted lines:** functional roles serve at their assigned scope and report functionally (Safety → Platform Owner; Finance → Franchise/Platform finance; Marketing → City/Franchise; Analyst → Leadership; Support → City Manager).
- **Audit:** all roles are subject to immutable audit (DEC-SA-113); no role edits audit history.

## 7. Future scalability

- Multi-region and multi-country operation under one platform (data store and RBAC scoped by franchise from day one).
- External licensed franchisees with franchisee onboarding, dashboards, and per-franchise brand surfaces (post-v1, OQ-SA-067).
- Deeper per-franchise P&L, benchmark analytics across franchises, and regional automation.
- Sub-roles and delegation within the chain (e.g., assistant operations manager) without new positions.

## 8. Decisions and open questions

### 8.1 Decisions (this workstream)

| ID | Decision | Status |
| --- | --- | --- |
| DEC-SA-062 | Franchise hierarchy adopted: 8-tier command chain + 5 functional roles; supersedes the flat 10-role framing (DEC-SA-112 retained for legacy role names) | Proposed |
| DEC-SA-063 | "Event Operations Manager" renamed "Operations Manager" | Proposed |

### 8.2 Open questions

| ID | Question | Owner |
| --- | --- | --- |
| OQ-SA-067 | v1 franchises: internal company regions (recommended) or external licensed partners? | Founder |
| OQ-SA-008 | Exact role permission boundaries (refund thresholds, ban authority, city scoping) — extends to the 13 positions | Founder |

## 9. Dependencies

- **RBAC:** `docs/admin/02-admin-users-and-roles.md` (legacy role matrix retained; hierarchy maps onto it).
- **Access:** per-stage visibility matrix `docs/security/02-anonymity-and-reveal-policy.md`.
- **Staffing:** on-site assignments `docs/operations/02-event-staffing-and-responsibility-model.md`.
- **Operating model:** launch configuration `docs/product/05-v1-operating-model.md`.
- **Authentication:** staff sign-in designed in `docs/auth/01-authentication-experience.md`.

## 10. Related documents

- `docs/project-records/01-decisions-log.md` (DEC-SA-062/063)
- `docs/project-records/MASTER_PROJECT_STATE.md` (§7 open decisions)
- `docs/admin/01-admin-purpose.md`
