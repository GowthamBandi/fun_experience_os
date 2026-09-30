# ADR-0003: Canonical marketplace data model

- **Status:** Accepted
- **Date:** 2026-09-30
- **Supersedes:**
  - the `scheduledSessions` naming in ADR-0002 (the mechanism stands, the collection is renamed `events`)
  - the franchise/territory tenancy assumptions in `docs/FIRESTORE_DATA_MODEL.md`
  - `docs/database/01-domain-entity-draft.md`
- **Canonical business rules:** governed marketplace. **Organizers create and operate experiences; Experience OS governs.**

## Context

The reconstruction (`EXPERIENCE_OS_RECONSTRUCTION.md` §11, §24–25) found two data models that never met:

- **Governance:** `organizers`, `arenas`, `events`, all flat display documents.
- **Operations:** `scheduledSessions` and `bookings`, franchise-tenanted and company-operated.

Approving an event never made anything bookable. Customers had no read path, staff did not exist, and there were no tickets, reviews or ledger.

## Decision

**One chain, one direction of ownership:**

```
organizer ─┬─ memberships (owner / staff: permissions × event scope)
           ├─ experiences (reusable offering, category-configurable)
           │     └─ events (a dated occurrence = the bookable unit; capacity lives here)
           │            ├─ bookings (a customer's reservation) ── payments ── refunds
           │            │      └─ tickets (admission credential, signed QR, check-in state)
           │            └─ reviews (one per participant per event)
           └─ ledgerEntries → settlements
venues (arenas) are referenced by events
```

### Collections

| Collection | Key | Written by | Read by |
| --- | --- | --- | --- |
| `users/{uid}` | auth uid | server | self, platform admins |
| `publicProfiles/{uid}` | auth uid | self (validated fields) | any signed-in user |
| `customerSafety/{uid}` | auth uid | server (`updateMyProfile`) | self only (never organizers) |
| `organizerApplications/{uid}` | applicant uid (one per person) | server | applicant, admins |
| `organizers/{orgId}` | id | server | public fields: anyone; full: admins |
| `organizerActivations/{uid}` | uid | server | nobody (hash only) |
| `memberships/{orgId}__{uid}` | org + uid | server | the member, org managers with `staff.manage`, admins |
| `staffInvites/{inviteId}` | id | server | org managers with `staff.manage` (no code hash exposed) |
| `experiences/{id}` | id | server | approved: anyone; draft: org members with `experiences.view` |
| `events/{id}` | id | server | published: anyone; otherwise: org members in scope, admins |
| `arenas/{id}` | id | server | approved: anyone |
| `bookings/{id}` | id | server | customer (own), org members with `attendees.view` in event scope, admins |
| `tickets/{id}` | id | server | customer (own), org members with `tickets.scan` in scope, admins |
| `payments/{id}`, `refunds/{id}` | id | server | customer (own), admins; organizers see refunds for their org with `refunds.view` |
| `paymentEvents/{providerEventId}` | provider event id | webhook | nobody (dedupe store) |
| `ledgerEntries/{id}` | id | server (append-only) | admins; organizer with `earnings.view` for own org |
| `settlements/{id}` | id | server | admins; organizer with `earnings.view` |
| `reviews/{eventId}__{uid}` | event + author | server | published: anyone |
| `userNotifications/{id}` | dedupe key | server | recipient |
| `governanceCases`, `commercialAgreements`, `riskAlerts`, `policyVersions` | existing | server | admins |
| `auditEvents`, `commandReceipts`, `rateLimits` | existing / new | server | admins, auditors / nobody |

**Every client write goes through a callable function.** The single exception is a user editing a validated whitelist on their own `publicProfiles` document.

### Key rules

1. **Experience vs event vs booking vs ticket are separate documents.**
   - An experience holds the reusable definition and category `config`.
   - An event holds the date/time, venue, capacity, price, responsibility and lifecycle.
   - A booking holds the customer's claim on N spots.
   - A ticket is one admission per spot.
2. **The event is the bookable unit.** `reserveSeat` (ADR-0002) now reads `events/{id}`. The governance `event-approval` case targets the event. Approval moves the event to `approved`. **Publishing is the organizer's act** (`publishEvent`), and it is allowed only when the event is `approved`, the experience is `approved`, the organizer is `active` and the responsibility invariant holds.
3. **Responsibility invariant.** An event cannot be published, and cannot remain published, without `responsibility.primaryUid`. That uid must be an **active** membership of the owning organizer with the `events.operate` permission. Revoking the primary's membership while an event is published is refused until someone else is made primary (enforced server-side in `revokeStaff`).
4. **Money is integer minor units + ISO currency** (`amountMinor`, `currency: "INR"`). There are no floats anywhere in money paths.
5. **Customer identity protection.**
   - Bookings and tickets carry only `alias` and `customerUid`. They never carry a phone number or legal name.
   - `customerSafety` (birth date, gender) is private to the customer and the server. The server copies only derived facts onto the booking (`eligibility: {ageVerifiedOk, genderOk}`).
6. **Tenancy is by `orgId`.** It is on every organizer-owned document, and security rules and callables check membership against it. Franchise/territory tenancy is retired (ADR-0004).

### Status machines

| Entity | States |
| --- | --- |
| Organizer application | `draft → submitted → under-review → approved / changes-requested / rejected` |
| Organizer | `active ⇄ paused → blocked` |
| Membership | `invited → active → revoked` (owner memberships start `active` on code redemption) |
| Experience | `draft → submitted → approved / changes-requested / rejected → archived` |
| Event | `draft → submitted → approved → published → booking-closed → live → completed`, with `cancelled` reachable from any pre-`completed` state and `rejected` from `submitted`. `changes-requested` returns to `draft` |
| Booking | `held → confirmed → completed`; `held → expired`; `held/confirmed → cancelled` |
| Ticket | `valid → used`; `valid → cancelled / refunded / expired` |
| Payment | `created → captured / failed`; `captured → refunded (partial allowed)` |
| Refund | `requested → approved (auto within policy) / under-review → approved / rejected → processing → completed / failed` |
| Settlement | `accruing → pending-approval → approved → paid / held / failed` |
| Review | `published ⇄ hidden (moderation)` |

## Consequences

- `scheduledSessions` and the franchise collections are **retired** from the server model. The operations-web prototype that used them is archived (ADR-0006).
- The governance console keeps working: `events` documents now carry both governance display fields (`name`, `organizerName`, `location`) and the canonical fields.
- Every organizer-side read is a membership check. Revocation takes effect on the next request; custom claims are not used for organizer or staff authority, so there is no stale token.
