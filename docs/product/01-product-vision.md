# 01 — Product Vision

> **Status:** Planning draft.
> **Document type:** Vision / north star.
> **This document is a planning draft.** No features described here are implemented, and nothing here should be read as a claim about what already exists in code.

---

## 1. Purpose

This document captures the product vision for the **experience booking and activity operations platform**. It answers: what are we building, for whom, and why it matters.

The platform lets people pay to join **limited-slot, real-world experiences** such as badminton, cricket, box cricket, tournaments, casual games, adventures and social activities. The company (not third-party hosts) initially creates, prices, schedules and operates these activities.

A short working name is used throughout the docs: **"the platform"**. The product brand name is not yet decided (see Open Questions).

## 2. Vision statement

Make it simple and safe for people to discover, pay for and join real-world sports and social experiences — while the company can run those experiences reliably at scale, starting small and city by city.

In practical terms:

- Customers book a slot, pay, and show up. They do not need to bring a full team, coordinate a venue, or chase players.
- Participants join anonymously at first. They only see how many other people have joined, and receive temporary random IDs for the session. Teams may be randomly allocated shortly before the event.
- The company controls quality: who runs each session, what the rules are, what a session costs, and how incidents are handled.

## 3. Core users

| User | Who they are | Primary need |
| --- | --- | --- |
| Participant | A customer who pays to join a session | Find, pay for, and join a real experience without friction |
| Platform operator (company staff) | Creates, prices, schedules and runs experiences | Operate experiences reliably and profitably via the Super Admin |
| Coordinator / referee | Staff present at the session | Check participants in, run matches, report incidents |
| Company leadership | Owners, finance, marketing, analysts | Monitor revenue, utilization, safety and growth |

The Super Admin platform serves the operator roles. The customer mobile app serves participants.

## 4. Core loops

### 4.1 Customer loop (book → attend → return)

1. Browse experiences (city, activity, format, time).
2. See slot availability as **joined participant count** (anonymous).
3. Pay to secure a limited slot.
4. Receive a temporary random event ID and session instructions.
5. Check in at the venue; receive team allocation where applicable.
6. Play / attend.
7. Leave a rating or return for the next session.

### 4.2 Operations loop (publish → run → learn)

1. City Manager defines the city and service area.
2. Operations staff create venues, experiences, pricing, slot capacity and schedules.
3. Participants book; slots fill.
4. Event Coordinator and referees run the session; participants check in; teams allocated.
5. Safety incidents, refunds and reports are handled by operations/support.
6. Analysts review utilization, revenue and incidents; the loop repeats.

## 5. What the platform is (and is not) — v1 stance

| | |
| --- | --- |
| **Is** | Company-operated experiences; anonymous booking; paid limited slots; random team allocation; tournaments; Super Admin operations console |
| **Is not (v1)** | Third-party marketplace for external hosts; user-to-user chat/social network; on-demand booking of arbitrary venues; gambling; league management at scale |

## 6. Guiding principles

1. **Anonymity first.** Participants are anonymous until the point where a session needs to know who they are (verification/check-in). Privacy defaults to least disclosure.
2. **Company-quality operations.** Sessions are run by the company or company-approved staff, so quality and safety are controlled.
3. **Slot economics drive scheduling.** Every session has a fixed capacity and price; utilization is the primary operating metric.
4. **Safety is non-negotiable.** Incidents, reports and bans are first-class operational concepts, not afterthoughts.
5. **Start narrow, operate well.** v1 supports a curated set of activity types in a small number of cities before expansion.
6. **Mobile for customers, web for operations.** Customers live in Flutter; operations live in Next.js.

## 7. Confirmed decisions

| # | Decision |
| --- | --- |
| V1 | Customer app is **Flutter** (Android and iOS). |
| V2 | Super Admin is **Next.js with TypeScript**. |
| V3 | Initial backend is **Firebase**. |
| V4 | The company itself creates, prices, schedules and operates activities initially. |
| V5 | Participants are anonymous; they see only the joined-participant count. |
| V6 | Temporary random event IDs are issued to participants. |
| V7 | Teams may be randomly allocated shortly before the event. |
| V8 | Experiences are limited-slot and paid. |
| V9 | Men-only, women-only and mixed formats are supported. |
| V10 | Production development happens later using Claude Code; **no production logic is being written now**. |

## 8. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | Demand is real and underserved for organized casual/group sports bookings in target cities. | Product may need to pivot channels or activity mix. |
| A2 | A single curated activity mix is enough to launch one city. | Initial city scope may need to be narrower/wider. |
| A3 | Participants accept joining without knowing the full roster in advance. | Anonymity feature may need a "known friends" opt-in later. |
| A4 | Company-run operations are scalable with a coordinator + referee model. | May need third-party ops partners sooner. |

## 9. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | What is the brand/product name? | All docs, store listing, admin UI |
| Q2 | Which city launches first, and what is the service-area radius? | v1 scope |
| Q3 | Does "men-only" vs "women-only" stay a permanent product feature or is it a launch-phase constraint? | Config, legal review |
| Q4 | At what size do sessions stop showing joined counts and reveal rosters? | Anonymity policy |
| Q5 | Are there free/discount "intro" sessions in v1? | Business model |

## 10. Dependencies

- **Legal / policy:** gender-segregated sessions and anonymity policy need legal review before build.
- **Payments:** a payment provider must be selected (see `docs/admin/06-booking-and-payment-operations.md`).
- **Design:** admin and customer visual direction are unresolved (see `docs/design-system/01-admin-design-direction.md`).
- **Data:** domain entity drafts must be validated before schema design (`docs/database/01-domain-entity-draft.md`).

## 11. Related documents

- `02-problem-and-opportunity.md`
- `03-business-model.md`
- `04-v1-scope.md`
- `docs/architecture/01-system-context.md`
