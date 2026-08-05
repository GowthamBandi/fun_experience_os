# 03 — Admin Information Architecture

> **Status:** Planning draft.
> **Document type:** IA / navigation structure.
> **This document is a planning draft.** The structure below is a proposal for review; no UI exists.

---

## 1. Purpose

Define the proposed navigation and grouping of the Super Admin so staff can move from daily tasks (run a session) to rare tasks (adjust a city) without getting lost. The IA is designed to mirror the operational workflow in `docs/admin/05-event-management-workflow.md`.

## 2. Primary navigation groups

The Super Admin is proposed to have seven top-level groups:

| # | Group | Modules | Primary owner |
| --- | --- | --- | --- |
| 1 | Home | Dashboard | All |
| 2 | Locations | Cities & service areas, Venues | City Manager |
| 3 | Catalog | Activity categories, Experiences & event rooms, Pricing & capacity, Formats & restrictions | Ops Manager / City Manager |
| 4 | Operations | Sessions & schedules, Bookings, Check-in & teams, Tournaments, Coordinators & referees | Event Ops / Coordinator |
| 5 | Money | Payments & refunds, Promo codes | Finance / Support |
| 6 | People & Safety | Participants, Verification, Incidents, Reports & bans | Safety / Support |
| 7 | Grow & Learn | Notifications, Analytics & reports, Marketing content | Marketing / Analyst |

Plus two cross-cutting groups:

| # | Group | Modules |
| --- | --- | --- |
| 8 | Admin | Roles & permissions, Audit history, Settings |
| 9 | Profile | Own account, notifications preferences |

## 3. Proposed left-navigation tree (draft)

```
Home
  Dashboard
Locations
  Cities & Service Areas
  Venues
Catalog
  Activity Categories
  Experiences
  Event Rooms / Sessions
  Pricing & Capacity
  Formats & Restrictions
Operations
  Schedule & Sessions
  Bookings
  Check-in & Teams
  Tournaments
  Staff (Coordinators & Referees)
Money
  Payments & Refunds
  Promo Codes
People & Safety
  Participants
  Verification
  Safety Incidents
  Reports & Bans
Grow & Learn
  Notifications
  Analytics & Reports
  Marketing Content
Admin
  Roles & Permissions
  Audit History
  Settings
```

## 4. IA principles

1. **Workflow order:** catalog → schedule → book → run → close → analyze, reflected in group ordering.
2. **City-first filtering:** a global "city" context selector narrows most modules to one city; cross-city reports are explicit.
3. **Session-centric operations:** Event Coordinators work from a "today's sessions" entry point, not by hunting through modules.
4. **Separation of money and safety:** financial and safety data are visually and logically separated from catalog tasks.
5. **Progressive disclosure:** admin/governance items are one level deeper and role-gated.

## 5. Draft

A higher-fidelity IA (wireframe-level sitemap) is a future planning artifact. Recorded as pending work in `docs/project-records/00-project-status.md`.

## 6. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | Nine top-level groups (seven functional + Admin + Profile). |
| C2 | City-scoped global filter at the top level. |
| C3 | Operations and Money are separate groups. |
| C4 | People & Safety is one group (safety is the connective concern). |

## 7. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | Left-side navigation is the right layout for the admin (draft). | Could be top-nav for narrow screens. |
| A2 | Modules map 1:1 to screens; some may split later. | IA updates needed. |
| A3 | All roles share the same IA; roles only hide modules. | Role-specific IA could be needed. |

## 8. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | Should Tournaments live under Operations or Catalog? | Navigation grouping |
| Q2 | Should Marketing Content be its own group in v1? | IA size |
| Q3 | Do we need a dedicated "Referee" work surface, or is it part of sessions? | Staff UX |

## 9. Dependencies

- **Screens:** every IA item expands in `docs/admin/04-admin-screen-inventory.md`.
- **Roles:** visibility gating follows `docs/admin/02-admin-users-and-roles.md`.
- **Workflow:** IA order mirrors `docs/admin/05-event-management-workflow.md`.

## 10. Related documents

- `docs/admin/01-admin-purpose.md`
- `docs/admin/04-admin-screen-inventory.md`
- `docs/admin/05-event-management-workflow.md`
