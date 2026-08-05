# 04 — v1 Scope

> **Status:** Planning draft.
> **Document type:** Scope definition.
> **This document is a planning draft.** It defines the intended first release boundary. Nothing here is implemented.

---

## 1. Purpose

Define what is in scope for the first release (v1) of the experience booking and activity operations platform — for both the customer app and the Super Admin — and what is explicitly out of scope. Scope will be refined in the planning phase; this is the working baseline.

## 2. Scope assumptions

- v1 launches in a single city with a curated activity mix.
- The company operates all v1 experiences itself.
- Customer app: Flutter (Android and iOS).
- Super Admin: Next.js with TypeScript.
- Initial backend: Firebase.

## 3. In scope — participant experience (customer app)

| Area | v1 intent |
| --- | --- |
| Account | Anonymous-first signup/onboarding; profile with optional verification later |
| Discover | Browse experiences by city, activity, format (men/women/mixed), date, time |
| Slot view | See joined-participant count, not the roster |
| Booking | Pay for a limited slot; receive temporary random event ID |
| My sessions | Upcoming/history, session instructions, cancellation within policy |
| Check-in | Show temporary random ID at the venue; team allocation where applicable |
| Feedback | Basic rating/feedback per session |

## 4. In scope — Super Admin (operator console)

The Super Admin must let company staff operate experiences end-to-end. Full screen inventory in `docs/admin/04-admin-screen-inventory.md`.

| Area | v1 intent |
| --- | --- |
| Dashboard | Operational snapshot (fill rate, revenue, incidents, upcoming sessions) |
| Cities & service areas | Manage launch cities and service areas |
| Venues | Manage venues and their usable slots |
| Activity categories | Manage supported activity types and rules |
| Experiences & event rooms | Create experience templates and schedule sessions (event rooms/slots) |
| Pricing & capacity | Slot price, capacity, format price modifiers |
| Formats & restrictions | Men-only / women-only / mixed; age restrictions; booking windows |
| Booking operations | View bookings, joined counts, handle cancellations/refunds |
| Payments | View payment and refund status (no payment code in this repo) |
| Promo codes | Create and track promotional codes |
| Teams & allocation | Random team allocation before session start |
| Tournaments | Brackets and scoring for tournament formats |
| Staff & sessions | Assign coordinators and referees; participant check-in |
| Notifications | Send session reminders/updates (see `docs/admin/09-notification-management.md`) |
| Safety | Record safety incidents; handle reports and bans |
| User verification | Verify participant identity where required |
| Roles & audit | Admin roles/permissions; audit history |
| Analytics & reports | Revenue, utilization, operational analytics |

## 5. Out of scope for v1 (explicit)

- Third-party marketplace: external hosts publishing their own experiences.
- Multi-city or multi-country operations (designed for, but not launched).
- Real-time in-session features such as live scorecasting to participants (matches scoring is admin-side; open question).
- Dynamic pricing, auctions, or surge pricing.
- In-app chat / social network between participants.
- Equipment rental and add-on sales.
- Gambling, fantasy leagues, or paid betting.
- A public developer API.

## 6. Launch criteria (draft)

| Criterion | Draft target |
| --- | --- |
| City live | One city with venue contracts and staffing ready |
| Activity mix live | Curated set (e.g., badminton, cricket/box cricket, tournaments) — final mix open |
| Payments working | Book, pay, refund per policy |
| Safety working | Incidents, reports, bans recordable and reportable |
| Staff tooling working | Check-in, team allocation, session management |
| Analytics working | Fill rate, revenue, no-show, incident reporting |

## 7. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | v1 launches single-city, company-operated. |
| C2 | Customer app and Super Admin are both in v1 scope. |
| C3 | Anonymity (joined-count only), temp random IDs and random team allocation are v1 features. |
| C4 | Paid limited-slot booking with fixed capacity is v1. |
| C5 | Men-only, women-only, mixed formats are v1. |
| C6 | Safety (incidents/reports/bans) is v1. |
| C7 | No production code is written during this planning phase. |

## 8. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | Single-city launch is enough to validate the model. | Could need two cities for comparison. |
| A2 | The admin console must cover all listed areas in v1; some may be deferred to v1.1. | Phasing may change. |
| A3 | Firebase can support the v1 data and auth needs. | Backend choice may need revisiting. |
| A4 | Age restriction defaults are 18+ (exact values open). | Config defaults change. |

## 9. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | Which activities launch in the first city and in what proportion? | Catalog seeding |
| Q2 | What are default booking windows and capacity ranges per activity? | Scheduler |
| Q3 | Do v1 sessions allow "bring a friend" group bookings? | Customer app scope |
| Q4 | Is participant verification required for all sessions or only some (e.g., women-only, adventure)? | Verification scope |
| Q5 | What is the minimum viable analytics set for go/no-go decisions? | Reports scope |

## 10. Dependencies

- **Admin areas:** most in-scope admin areas are detailed in `docs/admin/*`.
- **Architecture:** backend approach in `docs/architecture/02-technology-decisions.md`.
- **Data:** entity drafts in `docs/database/01-domain-entity-draft.md`.
- **Security/privacy:** anonymity and verification policy in `docs/security/01-security-and-privacy-principles.md`.

## 11. Related documents

- `01-product-vision.md`
- `02-problem-and-opportunity.md`
- `03-business-model.md`
- `docs/architecture/01-system-context.md`
