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
| `redeemStaffCode` | phone user | `{ code }` | Must match the caller's **verified phone** and an unexpired invite. Rate limited to 5 per hour. Returns `{ orgId }`. The real code of a lapsed invite (including one the retention sweep marked `expired`) is refused `PRECONDITION` "This code has expired." and charges no pending invite an attempt |
| `updateStaff` | `staff.manage` | `{ requestId, orgId, uid, permissions?, eventScope?, title? }` | Updated membership. You can't edit owners or grant beyond your own permissions |
| `revokeStaff` | `staff.manage` | `{ requestId, orgId, uid? , inviteId?, reason }` | Membership becomes `revoked` (or the invite is cancelled). **Refused** if the member is the primary responsible person for a published event |
| `reissueStaffCode` | `staff.manage` | `{ requestId, orgId, inviteId }` | `{ code, expiresAt }`; the old code dies. Works for `pending` (incl. lapsed, for 7 days) and `locked` invites; after the retention sweep marks an invite `expired`, send a new invite |
| `registerPushToken` | phone user | `{ token (20–4096 chars), platform: "android"\|"ios" }` | Adds the FCM token to `users/{uid}.pushTokens`, most-recent last, **capped at 10** (oldest dropped; re-registering moves a token to the end). In the same transaction the token is removed from every OTHER user's `pushTokens`, so a shared device stops receiving the previous account's pushes. Push payloads carry FCM data `{ notificationId, kind, linkType?, linkId? }` (all strings; the link fields mirror the inbox entry's `link` and are omitted when it has none). Returns `{ ok: true, tokens }` |
| `unregisterPushToken` | any signed-in user | `{ token }` | Removes the token (call on sign-out / notification opt-out). Idempotent. Returns `{ ok: true }` |

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
| `proposeCommercialAgreement` | admin | `{ requestId, orgId, commissionBps (0–5000), payoutCadence: "weekly"\|"fortnightly"\|"monthly", note }` | Creates a `pending-approval` version |
| `decideCommercialAgreement` | admin | `{ requestId, agreementId, action: "approve"\|"reject", note }` | Always dual control (proposer can't decide); approving supersedes the previous approved version |

**Scheduled jobs** (asia-south1, Asia/Kolkata; each run summarised in `jobRuns/{job}_{YYYY-MM-DD}`, see `docs/runbooks/OBSERVABILITY.md`)
- `releaseExpiredHolds` runs every 5 minutes: expires up to 500 lapsed holds, then retries up to 50 `approved` refunds whose provider call failed.
- `sendEventReminders` runs every 15 minutes. It sends a 24-hour reminder and a 2-hour reminder, deduplicated; bounded to 200 events / 2,000 reminders per run, the rest go out next run.
- `runDataRetention` runs daily at 03:17 IST (`docs/runbooks/DATA_RETENTION.md`).

**Triggers**
- `onEventCancelled` fans out refunds. Retried on failure (idempotent); events older than 24 h are dropped with an ERROR log.
- `onExperienceRevisionApproved` merges an approved revision. Retried on failure (idempotent).
- `deliverNotifications` runs on `userNotifications` create and sends a push when an FCM token exists. Otherwise the notification stays in-app. Not retried (a retry could push twice); tokens FCM reports dead are removed.

**Notifications.** Every `userNotifications` document carries `kind`, `title`, `body`, `read`, `createdAt` and a deep link `link: { type: "event"|"booking"|"ticket"|"organizer"|"application"|"experience", id }`. The recipient may flip only `read` (rules).

## Platform (`src/platform`)

| Callable | Caller | Input | Output / effect |
| --- | --- | --- | --- |
| `setLegalHold` (asia-south1) | admin claims (platform-owner / super-admin) | `{ requestId, subjectType: "user", subjectId, action: "place"\|"release", reason: 10..1000 chars, reference?: ≤200 chars }` | `{ holdId, status: "active"\|"released", version }`. Writes `legalHolds/{subjectType}_{subjectId}`; audited `legal-hold.placed` / `legal-hold.released`. Placing an active hold is `CONFLICT`; releasing a non-active one is `PRECONDITION`. While active, retention never deletes that user's KYC documents |

## Rate limits (per uid, fixed window, `rateLimits/{bucket}`; refusal is `RATE_LIMITED`)

| Endpoint(s) | Limit |
| --- | --- |
| `reserveSeat` / `createPaymentOrder` / `cancelBooking` | 20 per 10 min each |
| `confirmPayment` | 30 per 10 min |
| `scanTicket` + `checkInManually` (shared) | 120 per minute |
| `quoteCancellation` | 120 per 10 min |
| `requestRefund` | 20 per hour |
| `redeemOrganizerCode`, `redeemStaffCode` | 5 per hour each (reset on success) |
| `submitOrganizerApplication` | 5 per day |
| `inviteStaff` | 30 per hour |
| `reissueStaffCode` | 30 per hour |
| `updateStaff` + `revokeStaff` (shared) | 60 per hour |
| `submitReview` | 10 per hour |
| `saveExperience` + `saveEvent` (shared) | 600 per 10 min (sized for PULSE autosave, ~700 ms after each edit) |
| `submitExperience` + `submitEvent` (shared) | 30 per hour |
| `publishEvent` + `setEventPhase` + `setEventResponsibility` (shared) | 60 per 10 min |
| `cancelEvent` | 10 per hour |
| `updateMyProfile` | 20 per hour |
| `registerPushToken` + `unregisterPushToken` (shared) | 30 per hour |

`listEventAttendees` is not rate limited: it is a read gated by `attendees.view` and bounded to one event, and the PULSE host workspace calls it once per event on every refresh (a per-uid budget locked hosts out and serialised the parallel calls on one bucket document). Admin-only callables are not rate limited (few, audited, behind verified-email claims). `razorpayWebhook` verifies the HMAC signature first (cheap, constant-time) and does no other work for an unsigned request.

---

## Read models used directly by clients (Firestore, under the rules)

| Who | Reads |
| --- | --- |
| Customer | `events` where `status == "published"` (commission terms are never on the event; they live in `eventCommercials`, readable only by admins, auditors and org-wide `earnings.view`); `experiences` where `status == "approved"`; `publicOrganizers`; `publicProfiles`; their own `bookings`, `tickets` and `ticketSecrets/{ticketId}` (QR payload, for offline display), `payments`, `refunds` and `userNotifications`; their own `reviews` (reviews carry the author uid, so others see only the rating aggregates on `experiences` and `publicOrganizers`) |
| Organizer / staff | Their org's `experiences`, `events`, `bookings`, `tickets`, `refunds`, `ledgerEntries` and `settlements`, filtered by `orgId` (and `eventId`) per permission |
