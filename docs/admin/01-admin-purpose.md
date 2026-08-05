# 01 — Admin Purpose

> **Status:** Planning draft.
> **Document type:** Product framing for the Super Admin.
> **This document is a planning draft.** No part of the Super Admin exists in code.

---

## 1. Purpose

The **Super Admin** is the company's operations console for the experience booking platform. It is where company staff create, price, schedule, run, monitor and report on real-world experiences. It is the counterpart to the customer mobile app: the customer app is how participants discover and join; the Super Admin is how the company operates.

This document states why the Super Admin exists, its operating principles, and the boundary between admin and customer systems.

## 2. Why a Super Admin exists

The company operates experiences itself. That requires control surfaces the customer app must not expose:

| Need | Admin surface |
| --- | --- |
| Define supply | Cities, service areas, venues, activity categories |
| Define the catalog | Experience templates, event rooms/slots, pricing, capacity |
| Set participation rules | Men/women/mixed formats, age restrictions, booking windows |
| Run the money | Payments, refunds, cancellations, promo codes |
| Run the session | Check-in, temporary random IDs, team allocation |
| Run tournaments | Brackets, scoring, referee assignments |
| Keep people safe | Incidents, reports, bans, verification |
| Coordinate people | Coordinators, referees, notifications |
| Govern access | Roles, permissions, audit history |
| Learn | Revenue and operational analytics |

## 3. Operating principles

1. **The admin is a single source of truth for operations.** Sessions, bookings, payments and incidents are managed here; the customer app is a window into that data, not a separate system.
2. **Anonymity is enforced at the data level, not just the UI.** The admin can see participant records internally, but the customer app only shows joined counts and temporary random IDs. Access to identifiable participant data is role-limited.
3. **Every change is traceable.** Audit history records who did what in operational and financial areas.
4. **Draft-first workflow.** Experiences, sessions and policies move through draft → scheduled → live → completed states, so nothing accidental goes live.
5. **Permissions over convenience.** Roles and permission boundaries are a first-class design concern, not an afterthought (see `docs/admin/02-admin-users-and-roles.md`).

## 4. Boundary between admin and customer app

| Concern | Super Admin | Customer app |
| --- | --- | --- |
| Catalog & schedule | Create/publish | Browse |
| Participant data | Manage internally | Profile (own data only) |
| Joined counts | Full bookings view | Count only (no roster) |
| Teams | Allocate/view | See own team at the right time |
| Money | Configure & reconcile | Pay, see own payment status |
| Safety | Record/handle | Report via support flow |
| Analytics | Full | Limited (own history) |

## 5. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | Super Admin is **Next.js with TypeScript** (as directed). |
| C2 | The company (staff roles) uses the Super Admin; participants use the mobile app. |
| C3 | Super Admin is the single source of truth for operations data. |
| C4 | Anonymity constraints apply to what the customer app exposes, not to internal admin data access (which is role-limited). |
| C5 | Audit history covers operational and financial changes. |
| C6 | Nothing in the Super Admin is implemented yet. |

## 6. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | All operational roles are internal employees (or approved contractors) in v1. | May need external organizer access later. |
| A2 | One admin console covers all cities; cities are a filter, not separate installs. | IA and permissions must be scoped by city. |
| A3 | The Super Admin does not serve end users; the mobile app handles all participant self-service. | Exception handling for phone/email support in Customer Support role. |

## 7. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | Should there be a public "operator portal" later, or admin-only forever? | Roadmap |
| Q2 | Are city-scoped admins granted data access for their city only? | Permissions |
| Q3 | Does the Super Admin need a participant-facing support view (acting as the user)? | Support tooling |

## 8. Dependencies

- **Roles/permissions:** `docs/admin/02-admin-users-and-roles.md`.
- **IA:** `docs/admin/03-admin-information-architecture.md`.
- **Architecture:** `docs/architecture/01-system-context.md`.

## 9. Related documents

- All files under `docs/admin/`.
- `docs/product/04-v1-scope.md`.
