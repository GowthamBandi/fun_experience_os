# 04 — Admin Screen Inventory

> **Status:** Planning draft.
> **Document type:** Screen list.
> **This document is a planning draft.** It lists intended screens per module. No screens exist.

---

## 1. Purpose

Enumerate the screens the Super Admin is expected to contain, grouped by module. This is a checklist for scope and estimation, not a design spec. Screen behavior is described at a high level; detailed UX is future work.

## 2. Home

| Screen | Purpose |
| --- | --- |
| Dashboard | Operational snapshot: today's sessions, fill rate, revenue, incidents, pending approvals |

## 3. Locations

| Screen | Purpose |
| --- | --- |
| Cities list | Manage cities, service-area radius, launch state |
| City detail | City profile, service area map, budget limits, staffing |
| Venues list | All venues, filterable by city and activity |
| Venue detail | Address, usable slots/hours, per-slot rental cost, images, availability |

## 4. Catalog

| Screen | Purpose |
| --- | --- |
| Activity categories list | Supported activities (badminton, cricket, box cricket, tournaments, games, adventures, social) |
| Activity category detail | Rules, default formats, age defaults, scoring templates |
| Experiences list | Experience templates (e.g., "Weekend Mixed Badminton") |
| Experience detail | Description, category, venue options, default pricing/capacity, format, restrictions |
| Event rooms / session list | Scheduled sessions (event rooms) with status |
| Event room detail | One scheduled session: date/time, capacity, joined count, bookings, team settings |
| Pricing & capacity settings | Price, capacity, price modifiers, booking window per experience |
| Formats & restrictions | Men-only / women-only / mixed, age restrictions |

## 5. Operations

| Screen | Purpose |
| --- | --- |
| Schedule & sessions (calendar) | Weekly view of sessions, capacity utilization |
| Session creation wizard | Create experience → pick venue/time → set capacity/price → publish |
| Bookings list | All bookings, filterable by session/city/status |
| Booking detail | Participant, payment status, temporary event ID, refund actions |
| Check-in today | Today's sessions with check-in UI and temp-ID validation |
| Team allocation | Random team generation and manual override |
| Team view (session) | Allocated teams for a session |
| Tournaments list | Tournament events |
| Tournament detail | Bracket, matches, scoring, referee assignment |
| Bracket editor | Single-elimination bracket with seeding |
| Match scoring | Record scores per match |
| Staff list | Coordinators and referees, availability, assignments |

## 6. Money

| Screen | Purpose |
| --- | --- |
| Payments list | Payment records, status, filters |
| Payment detail | Amount, method, session, participant, refund history |
| Refunds list | Refund requests, approval workflow, status |
| Promo codes list | Code management |
| Promo code detail | Rules, usage, spend, limits |

## 7. People & Safety

| Screen | Purpose |
| --- | --- |
| Participants list | Booked participants, internal admin view |
| Participant detail | Profile, history, verification status, ban status, temp event IDs |
| Verification queue | Pending identity verification tasks |
| Incidents list | Safety incidents across sessions |
| Incident detail | Description, severity, involved participants, resolution |
| Reports list | Participant-to-participant reports |
| Ban management | Ban status, reason, duration, appeal handling |

## 8. Grow & Learn

| Screen | Purpose |
| --- | --- |
| Notifications compose | Create/schedule notifications and reminders |
| Notification history | Sent notifications, delivery status |
| Analytics dashboard | Revenue, fill rate, no-show, repeat rate, incident rate |
| Reports library | Standard reports and exports |
| Marketing content | Session descriptions, images, promo banner content |

## 9. Admin

| Screen | Purpose |
| --- | --- |
| Roles & permissions | Role definitions and module access matrix |
| User management | Admin user accounts, role assignments, city scopes |
| Audit history | Change log with filters (module, user, date) |
| Settings | Global config: cities context, defaults, policy knobs |

## 10. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | The screen inventory above is the v1 planning baseline. |
| C2 | Screens are role-gated; not every role sees every screen. |
| C3 | Temporary random event IDs and team allocation have dedicated surfaces (booking detail / team allocation). |
| C4 | No screens are implemented yet. |

## 11. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | One screen per concept is enough; some may need multiple views (list + detail + wizard). | Estimation drift |
| A2 | Calendar-based scheduling is the right operations entry point. | Could be list-first. |
| A3 | Support handles refunds in-app rather than via a separate tool. | Support workflow changes |

## 12. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | Which screens can be deferred to v1.1 without breaking operations? | Phasing |
| Q2 | Is "marketing content" a screen or part of Experience detail? | IA |
| Q3 | Does Tournament detail need a mobile-friendly version for referees? | Devices |

## 13. Dependencies

- **IA:** this inventory expands `docs/admin/03-admin-information-architecture.md`.
- **Roles:** visibility per `docs/admin/02-admin-users-and-roles.md`.
- **Data:** screens map to entities in `docs/database/01-domain-entity-draft.md`.

## 14. Related documents

- `docs/admin/03-admin-information-architecture.md`
- `docs/admin/05-event-management-workflow.md`
- `docs/admin/08-tournament-management.md`
