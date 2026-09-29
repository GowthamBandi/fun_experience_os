# Canonical Firestore Data Model

> **Status:** Authoritative for the platform. Written for **three clients** —
> the Next.js Super Admin (now), the Flutter Organizer and Customer apps (later).
> Nothing here is Super-Admin-specific.
>
> Governed by [ADR-0001](adr/ADR-0001-BACKEND-ARCHITECTURE.md) and
> [ADR-0002](adr/ADR-0002-CAPACITY-AND-CONCURRENCY.md).
> Implemented in `firebase/functions/src/platform/firestore.ts`.

---

## 1. Principles

1. **The server owns every authoritative value.** Money, capacity, permissions,
   identity access and lifecycle transitions are written only by trusted code.
   No client writes them, and rules enforce that.
2. **Top-level collections, not deep nesting.** Every entity the Super Admin
   lists, filters or reports on lives at the root, because Firestore cannot
   query across parents of a subcollection. Subcollections are used only for
   data that is *always* read in the context of its parent.
3. **Denormalisation is deliberate and labelled.** Where a value is duplicated
   for query or performance reasons, this document names the source of truth and
   the reconciliation path. Nothing is duplicated by accident.
4. **Tenancy is carried on the document, not inferred.** Every operational
   document carries `franchiseId` and `territoryId` so a security rule can decide
   access without reading another document.
5. **Time is an instant.** Every timestamp is a Firestore `Timestamp` written
   from the server clock. Display strings (`"Just now"`, `"Today, 14:22"`) are a
   prototype defect and never enter the store.
6. **Money is integer minor units plus a currency code.** Never a float.
7. **Nothing is hard-deleted.** Operational records are archived with
   `archivedAt` / `archivedBy`; audit records are immutable.

---

## 2. Tenancy and the access spine

The business is a franchise hierarchy:

```
Franchise  →  Territory  →  City  →  Venue  →  PlayingArea
```

`territoryId` is the practical **isolation boundary** — it is the unit the
console scopes to and the unit a Regional Partner or City Manager is assigned.
`franchiseId` sits above it for franchise-level roles and settlement.

**Every operational document carries both.** They are written by the server on
creation and are immutable thereafter. A rule can therefore authorise a read or
write from the token alone, with no additional document reads.

### Identity claims

A user's role and scope live in **Firebase Auth custom claims**, set only by a
trusted Cloud Function, never by a client:

| Claim | Type | Meaning |
|---|---|---|
| `role` | string | One `RoleId` from the canonical role set |
| `scope` | string | `platform` \| `franchise` \| `territory` \| `city` \| `venue` |
| `franchiseId` | string \| null | Franchise the user belongs to |
| `territoryIds` | string[] | Territories the user may act in (empty for platform scope) |
| `disabled` | boolean | Set true to revoke access without deleting the account |

Claims are a **projection** of `users/{uid}`, which is the record. A claims-sync
function rewrites them whenever the user document changes. Claims are capped at
1000 bytes, so `territoryIds` is bounded; a user needing more territories is
given `franchise` or `platform` scope instead.

---

## 3. Collections

### 3.1 `users/{uid}`

The operator record. Document ID **is** the Firebase Auth uid.

| Field | Type | Notes |
|---|---|---|
| `uid` | string | Mirrors the document ID |
| `displayName` | string | |
| `email` | string | From Firebase Auth |
| `roleId` | string | Canonical role |
| `scope` | string | As above |
| `franchiseId` | string \| null | |
| `territoryIds` | string[] | |
| `status` | `active` \| `suspended` \| `disabled` | |
| `createdAt` / `updatedAt` | Timestamp | Server clock |
| `createdBy` / `updatedBy` | string (uid) | |

- **Owner:** Platform Owner / Super Admin.
- **Lifecycle:** created by invitation, suspended, disabled. Never deleted —
  audit references must remain resolvable.
- **Read:** self, plus anyone with permission to administer users in scope.
- **Write:** server only. A user may never change their own `roleId`, `scope`,
  `franchiseId` or `territoryIds` — that is privilege escalation.
- **Audit:** every role or scope change is audited.

### 3.2 Footprint — `franchises`, `territories`, `cities`, `venues`, `playingAreas`

Flat collections, parent id carried as a field.

| Collection | Key fields | Parent |
|---|---|---|
| `franchises` | `name`, `status`, `headOperatorId`, `contactDetails` | — |
| `territories` | `franchiseId`, `name`, `status`, `managerId`, `timezone`, `currency` | franchise |
| `cities` | `franchiseId`, `territoryId`, `name`, `state`, `status`, `managerId` | territory |
| `venues` | `franchiseId`, `territoryId`, `cityId`, `name`, `address`, `status`, `capabilities`, `safetyContact` | city |
| `playingAreas` | `franchiseId`, `territoryId`, `venueId`, `name`, `maxCapacity`, `status`, `compatibility` | venue |

- **Lifecycle:** `draft → active → paused → archived`. Pausing a franchise
  pauses its territories; nothing is deleted.
- **Read:** any authenticated user within the owning territory or above.
- **Write:** server only, gated by the permission matrix (Mission 8).
- **Indexes:** `territoryId + status`, `cityId + status`, `venueId + status`.
- **Note:** `playingAreas.maxCapacity` is the physical ceiling that
  `scheduledSessions.capacity.maxPhysicalCapacity` is derived from at scheduling
  time. It is **copied**, not referenced, so that changing a venue's capacity
  later cannot retroactively oversell a session already sold. Source of truth for
  a *live session's* limit is the session document.

### 3.3 Catalog — `activityCategories`, `experienceTemplates`

| Collection | Key fields |
|---|---|
| `activityCategories` | `name`, `status`, `riskLevel`, `defaultStaffing`, `equipmentRequirements`, `venueCompat` |
| `experienceTemplates` | `categoryId`, `name`, `status`, `format`, `duration`, `pricing`, `capacityDefaults`, `revealPolicy`, `version` |

- **Lifecycle:** `draft → ready → active → paused → archived`. A template must be
  `active` to be schedulable.
- **Versioning:** template edits create a new version document under
  `experienceTemplates/{id}/versions/{versionId}`. A subcollection is correct
  here — versions are only ever read in the context of their template.
- **Read:** all authenticated operators (the catalog is platform-wide).
- **Write:** platform-scope roles only.

### 3.4 `scheduledSessions/{sessionId}` — the operational core

The most important document in the platform. Carries the capacity authority.

| Field | Type | Notes |
|---|---|---|
| `franchiseId`, `territoryId`, `cityId`, `venueId`, `playingAreaId` | string | Tenancy + footprint, immutable after creation |
| `templateId`, `categoryId` | string | Catalog linkage |
| `startsAt`, `endsAt` | Timestamp | Real instants |
| `status` | string | **Lifecycle only**: `draft` \| `scheduled` \| `booking-open` \| `booking-closed` \| `live` \| `completed` \| `cancelled` |
| `capacity` | map | `maxPhysicalCapacity`, `blockedSlots`, `compSlots`, `minParticipants`, `targetParticipants` — static configuration |
| `occupancy` | map | `activeReservationHolds`, `waitlistOfferHolds`, `confirmedPaidBookings`, `confirmedComplimentaryBookings`, `waitlistCount` |
| `remainingSellableCapacity`, `fillRate`, `occupancyStatus` | number / string | **Derived**, published for clients |
| `pricing` | map | `amountMinor`, `currency` — authoritative, copied from template at scheduling |
| `createdAt` / `updatedAt` / `createdBy` | | |

**`status` vs `occupancyStatus` is a hard rule.** `status` is the lifecycle and
is moved by a human or a schedule. `occupancyStatus` is derived from the counters
on every change. Collapsing them caused REG-001 — see ADR-0002 §3.

**`occupancy` is a transactional projection.** The booking documents are the
ledger of record. Counters are mutated *only* inside the transaction that mutates
the corresponding booking. `recomputeOccupancyFromBookings()` rebuilds them and
`occupancyDrift()` detects divergence; drift is a defect, not a tolerance.

- **Write:** server only, and only through `reserveSeat` and its sibling
  commands. **No client may write `occupancy`, `capacity` or `pricing` — ever.**
  This is the single most important rule in the security model.
- **Indexes:** `territoryId + startsAt`, `territoryId + status + startsAt`,
  `venueId + startsAt`, `playingAreaId + startsAt` (double-booking detection).

### 3.5 `bookings/{bookingId}`

Top-level, because the Super Admin lists and filters bookings across sessions.

| Field | Type | Notes |
|---|---|---|
| `sessionId`, `franchiseId`, `territoryId` | string | Immutable |
| `alias` | string | **Pseudonymous handle. Never a legal name.** |
| `participantId` | string | Stable participant reference. *Not* derived from the alias — see §5 |
| `bookingType` | `individual` \| `group` \| `complimentary` | |
| `reservationStatus` | `active` \| `offer-hold` \| `expired` \| `released` \| `not-required` | |
| `paymentStatus` | `pending` \| `confirmed` \| `failed` \| `refunded` \| `not-started` | |
| `status` | booking lifecycle | |
| `amountMinor`, `taxMinor`, `platformFeeMinor`, `totalMinor`, `currency` | integer / string | Authoritative, server-computed |
| `reservedAt`, `reservationExpiresAt` | Timestamp | Real instants; the sweeper consumes the expiry |
| `createdAt` / `updatedAt` / `createdBy` | | |

- **Write:** server only.
- **Read:** operators within the territory. A future Customer app reads only its
  own bookings, matched on `participantId`.
- **Indexes:** `sessionId + status`, `territoryId + createdAt`,
  `participantId + createdAt`, `reservationStatus + reservationExpiresAt` (the
  sweeper's query).
- **Privacy:** contains no legal identity and no contact details by design. See §5.

### 3.6 `payments` and `refunds`

Separate collections; a payment is not a booking field because it has its own
lifecycle, its own provider references and its own audit needs.

Key fields: `bookingId`, `sessionId`, `territoryId`, `amountMinor`, `currency`,
`status`, `provider`, `providerReference`, `idempotencyKey`, timestamps.

- **Write:** server only, and only from a verified provider webhook or a trusted
  command. **A browser-reported payment status is never trusted.**
- **Read:** finance-scoped roles and above.
- **Indexes:** `bookingId`, `territoryId + createdAt`, `status + createdAt`.
- **Money:** integer minor units and an explicit currency, always. The prototype
  used floats and computed a tax and platform fee that it then discarded from the
  total — that defect must not survive the migration.

### 3.7 `auditEvents/{eventId}` — append-only

| Field | Type |
|---|---|
| `action` | string, e.g. `booking.seat-reserved` |
| `actorUid`, `actorRoleId` | **resolved server-side from the verified token** |
| `resourceType`, `resourceId` | string |
| `franchiseId`, `territoryId`, `sessionId` | string \| null |
| `before`, `after` | map \| null — for state changes |
| `reason` | string \| null — required for privileged actions |
| `requestId` | string — correlates with the command receipt |
| `at` | Timestamp, server clock |

- **Rules: `allow read` for permitted roles; `create`, `update`, `delete` are
  denied to every client, including platform owners.** Only server code writes
  audit events. An audit trail a user can edit is not an audit trail.
- **The actor is never client-supplied.** This is the direct fix for BLOCKER-005,
  and the pattern is proven by PROOF 8.

### 3.8 `commandReceipts/{requestId}` — idempotency ledger

`requestId` (client-generated), `command`, `actorUid`, `result`, `at`.

Written inside the same transaction as the command it guards, so a retry, a
double-tap or a replayed network request returns the original outcome and creates
nothing. Proven by PROOF 5 and PROOF 6.

- **Rules:** server-only, read and write.
- **Lifecycle:** TTL cleanup after a retention window; the receipt only needs to
  outlive the retry horizon.

---

## 4. Reconciliation

Two projections require a reconciliation job, because Firestore enforces no
cross-document integrity:

| Projection | Source of truth | Detector |
|---|---|---|
| `scheduledSessions.occupancy` | `bookings` for that session | `occupancyDrift()` |
| Auth custom claims | `users/{uid}` | claims-sync function |

Drift is a defect. Both jobs must report, not silently repair, so the cause is
found.

---

## 5. Privacy

Participant anonymity is a product principle, and the data model must carry it
rather than rely on UI masking.

- Bookings store an **alias** and a **temporary event code**, never a legal name.
- Contact details live outside the operational documents and are reachable only
  through the audited emergency-access path.
- `participantId` must be a stable opaque identifier. The prototype derived it as
  `usr-${alias.toLowerCase()}`, which collapses two people who choose the same
  alias into one person and leaks the alias into the key. **Do not carry that
  forward.**
- Emergency identity access requires authorization, a typed reason, a
  confirmation, and an immutable audit event naming the server-resolved actor.

---

## 6. What is not yet decided

| Open | Blocked on |
|---|---|
| Retention periods per collection | Legal review (`OQ-SA-005`) |
| Storage bucket layout for evidence attachments | Mission 22 |
| Payment provider fields on `payments` | BLOCKER-007 |
| Tournament, safety, dispute and moderation collections | Missions 11 and 14 — modelled in the prototype, not yet migrated |
