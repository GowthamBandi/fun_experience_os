# Experience OS: client ↔ backend contract (v1)

This is the canonical callable API used by PULSE (Flutter) and the Operations Console.

**Implementation location:** `firebase/functions/src/{identity,catalog,commerce}`.

**Common conventions**
- **Region:** `asia-south1`. The legacy governance callables (`decideCase`, `setMarketplaceEntityStatus`, `setOperatorAccess`, `checkHealth`) stay in `us-central1` for the console.
- **App Check:** enforced outside the emulator.
- **Errors:** an `HttpsError` whose `details` is `{ code, message, nextStep }`. `message` is always safe to show to users.
- **`requestId`:** every mutating call takes a client-generated key of 8–128 characters `[A-Za-z0-9_-]`. The same key always produces the same outcome, exactly once, so network retries are safe.
- **Money:** integer paise (`amountMinor`) plus `currency: "INR"`.
- **Timestamps in responses:** ISO-8601 strings.

---

## Identity (`src/identity`)

| Callable | Caller | Input | Output / effect |
| --- | --- | --- | --- |
| `updateMyProfile` | phone user | `{ displayName, bio?, birthDate: "YYYY-MM-DD", gender: "woman"\|"man"\|"non-binary"\|"prefer-not" }` | Upserts `publicProfiles/{uid}` (displayName, bio) and `customerSafety/{uid}` (birthDate, gender), plus `users/{uid}` with phone and createdAt. Age must be 13+. Returns `{ ok: true }` |
| `myAccess` | phone user | `{}` | `{ profileComplete, organizer: { applicationStatus, activationPending, orgId? }, memberships: [{ orgId, orgName, role, permissions, eventScope }], pendingStaffInvites: [{ inviteId, orgName, expiresAt }] }`. Tells the app which code prompts to show. It never reveals codes |
| `submitOrganizerApplication` | phone user | `{ requestId, kind: "individual"\|"business", displayName, legalName, city, categories: string[], about, contactEmail? }` | `organizerApplications/{uid}` status `submitted`, plus a `governanceCases` document of kind `organizer-kyc` with `targetCollection: "organizerApplications"`. Resubmitting after `changes-requested` is allowed |
| `redeemOrganizerCode` | phone user | `{ code }` | Rate limited to 5 per hour. On success: `memberships/{orgId}__{uid}` (owner), `publicOrganizers/{orgId}`, and the activation is burned. Returns `{ orgId }` |
| `inviteStaff` | member with `staff.manage` | `{ requestId, orgId, phone, title, permissions: string[], eventScope: "all"\|string[] }` | `{ inviteId, code, expiresAt }`. **The code is returned only here, only once.** Grants are capped by the caller's own grants |
| `listStaff` | `staff.manage` | `{ orgId }` | `{ members: [{ uid, displayName, title, role, status, permissions, eventScope }], invites: [{ inviteId, phoneMasked, title, permissions, eventScope, expiresAt, status }] }` |
| `redeemStaffCode` | phone user | `{ code }` | Must match the caller's **verified phone** and an unexpired invite. Rate limited to 5 per hour. Returns `{ orgId }` |
| `updateStaff` | `staff.manage` | `{ requestId, orgId, uid, permissions?, eventScope?, title? }` | Updated membership. You can't edit owners or grant beyond your own permissions |
| `revokeStaff` | `staff.manage` | `{ requestId, orgId, uid? , inviteId?, reason }` | Membership becomes `revoked` (or the invite is cancelled). **Refused** if the member is the primary responsible person for a published event |
| `reissueStaffCode` | `staff.manage` | `{ requestId, orgId, inviteId }` | `{ code, expiresAt }`; the old code dies |

**Console (admin claims):**
- `decideCase` is extended. For an `organizer-kyc` case with outcome `approved`, the response includes `{ organizerCode, orgId, codeExpiresAt }`, returned **once**.
- `reissueOrganizerCode({ requestId, applicantUid, reason })` (reason ≥ 10 chars, audited) returns a new code and invalidates the old one.

## Catalog (`src/catalog`)

| Callable | Permission | Input | Output / effect |
| --- | --- | --- | --- |
| `saveExperience` | `experiences.edit` | `{ requestId, orgId, experienceId?, title, tagline, category, activity, description, highlights[], format, genderRule, ageMin, ageMax?, idRequired, rules[], bring[], safety: { level, measures[] }, cancellationPolicy: "flexible"\|"moderate"\|"strict", config?: {…category fields} , coverStyle?: { seed:int } , mediaPaths?: string[] }` | `{ experienceId, status: "draft" }`. Only `draft` and `changes-requested` experiences are editable; edits after approval create a new draft version |
| `submitExperience` | `experiences.submit` | `{ requestId, orgId, experienceId }` | `submitted` + `governanceCase` of kind `experience-approval` |
| `saveEvent` | `events.edit` (scope) | `{ requestId, orgId, eventId?, experienceId, arenaId?, venue: { name, area, city, address, lat?, lng? }, startsAt, durationMinutes, capacity: { max, min, blocked?:0 }, priceMinor, currency:"INR", primaryUid, staffUids?: string[] }` | `{ eventId, status: "draft" }`. The experience must belong to the organizer; `primaryUid` must hold active `events.operate` for this event |
| `submitEvent` | `events.submit` (scope) | `{ requestId, orgId, eventId }` | `submitted` + `event-approval` case |
| `publishEvent` | `events.publish` (scope) | `{ requestId, orgId, eventId }` | Allowed only when the event and experience are `approved`, the organizer is `active`, an approved commercial agreement exists, the responsibility holds, and the start is in the future. Result: `published` |
| `setEventResponsibility` | `events.edit` (scope) | `{ requestId, orgId, eventId, primaryUid, staffUids? }` | Keeps the invariant |
| `setEventPhase` | `events.operate` (scope) | `{ requestId, orgId, eventId, phase: "booking-closed"\|"live"\|"completed" }` | Moves the lifecycle forward only |
| `cancelEvent` | `events.cancel` (scope) or admin | `{ requestId, orgId, eventId, reason }` | `cancelled`; queues full refunds for every confirmed booking (commerce) and notifies attendees |
| `submitReview` | ticket holder | `{ requestId, eventId, rating: 1..5, comment? }` | Only if the caller holds a **used** ticket (checked in) for the event, the event is `completed` or has ended, and within 30 days. One review per person per event (`reviews/{eventId}__{uid}`); editing within the window replaces it. Rate limited |
| `adminCancelEvent` (admin) | admin claims | `{ requestId, eventId, reason }` | Emergency intervention: `cancelled` + full refunds (commerce trigger), audited |
| `moderateReview` (admin) | admin claims | `{ requestId, reviewId, status: "published"\|"hidden", reason }` | Audited |

## Commerce (`src/commerce`)

| Callable | Caller | Input | Output / effect |
| --- | --- | --- | --- |
| `reserveSeat` | phone user, profile complete | `{ requestId, eventId, spots: 1..4, alias }` | `{ bookingId, status: "held"\|"confirmed", holdExpiresAt, amountMinor, currency }`. Checks: eligibility (age from birth date vs the experience's age rule; gender rule), organizer active, event `published`, one live booking per person per event, capacity (ADR-0002). A free event is confirmed at once and tickets are issued |
| `createPaymentOrder` | booking owner | `{ requestId, bookingId }` | `{ paymentId, provider: "razorpay", providerOrderId, keyId, amountMinor, currency }`. Idempotent per booking; refused if the hold has expired |
| `confirmPayment` | booking owner | `{ paymentId, providerPaymentId, providerSignature }` | The server verifies the signature, then runs the same settlement as the webhook. Returns `{ bookingId, status: "confirmed", ticketIds }` |
| `razorpayWebhook` (HTTP POST) | Razorpay | raw body + `X-Razorpay-Signature` | Verifies the signature over the raw body; deduplicates by `x-razorpay-event-id` |
| `cancelBooking` | booking owner | `{ requestId, bookingId }` | `{ refund: { refundId, amountMinor, status } \| null }`. Uses the policy quote; a hold is simply released |
| `quoteCancellation` | booking owner | `{ bookingId }` | `{ percent, amountMinor, reason }` |
| `requestRefund` | member with `refunds.request` (scope) | `{ requestId, orgId, bookingId, amountMinor, reason }` | `under-review` refund. Organizers never approve |
| `decideRefund` | admin | `{ requestId, refundId, decision: "approve"\|"reject", note }` | Above ₹10,000 it needs two different admins |
| `scanTicket` | member with `tickets.scan` (scope) | `{ requestId, eventId, payload }` | `{ result: "checked-in"\|"already-used"\|"cancelled"\|"refunded"\|"expired"\|"wrong-event"\|"invalid", ticket?: { ticketId, alias, spotsLabel, checkedInAt } }` |
| `checkInManually` | member with `tickets.scan` (scope) | `{ requestId, eventId, ticketId, reason: 10..300 chars }` | Same result set and `ticket` shape as `scanTicket` (never `invalid`: an unknown ticket or a ticket of another event is `wrong-event`). Moves `valid → used` once, records `checkInMethod: "manual"` + `checkInReason` on the ticket, audits `ticket.checked-in-manually` with the reason. Idempotent per (caller, requestId) via `commandReceipts`; shares the scanner's rate limit with `scanTicket`. There is no undo |
| `listEventAttendees` | member with `attendees.view` (scope) | `{ orgId, eventId }` | `{ attendees: [{ bookingId, ticketId, alias, status: "valid"\|"used"\|"cancelled"\|"refunded"\|"expired", checkedInAt, spotsLabel, bookedAt }] }` for confirmed/completed/cancelled bookings. Aliases and ids only — never the customer uid, phone, age or gender. An event of another organizer is `NOT_FOUND` |
| `buildSettlement` | admin | `{ requestId, orgId, periodEnd }` | Builds a settlement from unsettled ledger entries of completed events |
| `decideSettlement` | admin | `{ requestId, settlementId, action: "approve"\|"hold"\|"mark-paid"\|"release-hold", note, payoutReference? }` | Dual control above ₹50,000 |

**Scheduled jobs**
- `releaseExpiredHolds` runs every 5 minutes.
- `sendEventReminders` runs every 15 minutes. It sends a 24-hour reminder and a 2-hour reminder, deduplicated.

**Triggers**
- `onEventCancelled` fans out refunds.
- `deliverNotifications` runs on `userNotifications` create and sends a push when an FCM token exists. Otherwise the notification stays in-app.

---

## Read models used directly by clients (Firestore, under the rules)

| Who | Reads |
| --- | --- |
| Customer | `events` where `status == "published"`; `experiences` where `status == "approved"`; `publicOrganizers`; `publicProfiles`; their own `bookings`, `tickets` and `ticketSecrets/{ticketId}` (QR payload, for offline display), `payments`, `refunds` and `userNotifications`; `reviews` where `status == "published"` |
| Organizer / staff | Their org's `experiences`, `events`, `bookings`, `tickets`, `refunds`, `ledgerEntries` and `settlements`, filtered by `orgId` (and `eventId`) per permission |
