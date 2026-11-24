# Notification center, announcements and account controls — contract

Owner's request (24 Nov 2026): "In the super admin, build the complete
notification center like a big professional company, with different kinds of
notification formats. In the super admin I also need complete powers to block,
pause, and show announcements on screen — like in the middle when every user
opens the app — for a single particular user, specific users, organizations,
etc. Best, fully flexible features covering all kinds of cases."

The backend + console build and the app build both follow this file. Field and
callable names here are fixed; if one side needs a change, it is made here
first.

## 1. Announcements (in-app messages shown when people open the app)

### `announcements/{id}` — written only by the server; never listed by clients

| Field | Type | Notes |
|---|---|---|
| `title` | string 3..80 | |
| `body` | string 0..600 | plain text, line breaks allowed |
| `format` | `"modal" \| "fullscreen" \| "sheet" \| "banner" \| "inbox"` | `modal` = centred card over the app; `fullscreen` = takeover; `sheet` = bottom sheet; `banner` = strip at the top of Explore / host Today; `inbox` = only an item in the notifications list |
| `tone` | `"info" \| "success" \| "warning" \| "critical" \| "promo"` | colours and icon |
| `imageUrl` | string \| null | https only (or emulator storage URL) |
| `primaryCta` | `{ label, link?: {type,id}, url?: string }` \| null | `link` uses the app's existing notification link types (event, trip-departure, organizer, booking, support-request…); `url` = https web page |
| `secondaryCta` | same \| null | |
| `dismissible` | bool | `false` = no close button (only the CTA / acknowledge) |
| `requireAck` | bool | shows "I understand"; counts as acknowledged |
| `frequency` | `"once" \| "daily" \| "every-open"` | once = until dismissed/acked/clicked; daily = at most once per IST day; every-open = each app open while live |
| `priority` | int 0..100 | higher first; one popup at a time; banners stack max 2 |
| `audience` | see below | |
| `startsAt` / `endsAt` | Timestamp / Timestamp \| null | live window |
| `status` | `"draft" \| "scheduled" \| "live" \| "paused" \| "ended" \| "archived"` | `scheduled` becomes effective at `startsAt` (no job needed: delivery checks the window) |
| `sendPush` | bool | when published, also send a push to the same audience |
| `createdAt/By`, `updatedAt/By`, `publishedAt/By` | | |
| `stats` | `{ targeted, shown, clicked, dismissed, acked }` | server-maintained counters (`targeted` = estimated reach at publish) |

### Audience (`audience` object, used by announcements AND notifications)

```
{ type: "all" | "customers" | "organizers" | "cities" | "users" | "orgs",
  cities?: string[]        // city names; matched by cityKey; for type "cities"
  uids?: string[]          // for type "users" (max 500)
  orgIds?: string[]        // for type "orgs": every active member of these organizations (max 100)
  platforms?: ("android" | "ios")[]   // optional filter; empty/absent = both
  minBuild?: int, maxBuild?: int      // optional app-build filter (pulseBuild)
  excludeUids?: string[]   // optional
}
```
"customers" = signed-in people who are not active members of any organization.
"organizers" = active members of any organization. City targeting for
announcements uses the city the app sends with the request (the phone keeps
the city; PULSE does not store where people are).

### Callables

Admin (console; audited; new capability `announcements.manage`, granted to
platform-owner and super-admin like the existing admin capabilities):
- `saveAnnouncement { requestId, id?, ...fields above except status/stats/meta }` → `{ id, status }` — creates (status `draft`) or edits a draft/scheduled/paused one. Editing a `live` one is allowed for text/CTA/window and recorded in the audit with before/after.
- `setAnnouncementStatus { requestId, id, action: "publish" | "pause" | "resume" | "end" | "archive" | "duplicate", reason }` → `{ id, status }` (`duplicate` returns the new draft's id). Publish validates the whole announcement, computes `stats.targeted`, sets `scheduled` or `live`, and sends the push if `sendPush`.
- `previewAudience { audience }` → `{ estimate, breakdown: { customers, organizers }, sample: [{uid, displayName}] (max 10) }`.
- `getAnnouncementStats { id }` → stats + per-day series (last 30 days) of shown/clicked/dismissed/acked.
- `searchAccounts { query }` → up to 20 `{ uid, displayName, phoneMasked, role: "customer"|"organizer", orgs: [{orgId,name}], accountStatus }` (search by phone digits, display name, uid; used by the audience picker and account controls).

App (any signed-in user; rate-limited):
- `getMyAnnouncements { platform: "android"|"ios", build: int, city?: string }` → `{ items: [ { id, title, body, format, tone, imageUrl, primaryCta, secondaryCta, dismissible, requireAck, frequency, priority, endsAt } ] }` — only live, in-window, audience-matching, not already finished for this user by `frequency` (server checks receipts). Sorted by priority desc, then newest.
- `recordAnnouncementEvent { announcementId, event: "shown" | "clicked" | "dismissed" | "acked" }` → `{ ok: true }` — idempotent per (announcement, user, event, IST day for "shown"); updates `announcementReceipts/{announcementId}__{uid}` and the counters.

## 2. Notifications (pushes + inbox items from PULSE to chosen people)

Admin callable `sendNotification { requestId, audience, title 3..65, body 5..240, imageUrl?, link?: {type,id}, url?, style: "standard" | "rich", scheduleAt?: ISO, reason }` → `{ id, status: "sent" | "scheduled", recipients }`.
- Writes an inbox item (`userNotifications`, kind `"admin-message"`, with `imageUrl`, `style`, `link`/`url`) for every recipient (uids/orgs/customers/organizers/all — paged writes, cap 50 000 per send) and sends push (FCM topic `all` / `city_<key>` for all/cities; per-user tokens otherwise; skipped in the emulator as `broadcast.ts` does).
- `scheduleAt` → stored in `adminNotifications/{id}` with status `scheduled`; a scheduled job (every 5 min, like existing jobs) sends due ones. `cancelScheduledNotification { requestId, id, reason }`.
- History: `adminNotifications/{id}` = `{ audience, title, body, imageUrl, link, url, style, status, recipients, createdAt/By, sentAt, reason }`, listed in the console.
- Keep the existing `sendBroadcast` working (console card can move into the notification center).
- Daily limit for audience `all`/`customers`/`cities`: keep 3/day (shared with sendBroadcast); targeted sends to `users`/`orgs` are not limited by that but are rate-limited (60/hour per admin).

## 3. Account controls (block / pause people)

Admin callable `setAccountStatus { requestId, uid, status: "active" | "paused" | "blocked", reason 10..2000, messageToUser?: string 0..500, until?: ISO }` (capability `accounts.moderate`).
- `paused`: the person can sign in and look around, but every customer action (reserve/book event or trip, join waitlist, review, follow, support messages stay ALLOWED) is refused (`permission-denied`, `details.code` `ACCOUNT_PAUSED`; was written `NOT_PERMITTED` before 24 Nov) "Your account is paused{until …}. {messageToUser}". Organizer actions for orgs they own are NOT affected (orgs are paused separately).
- `blocked`: Firebase Auth user disabled + refresh tokens revoked; every callable refuses (existing `token.disabled` check plus the status doc); holds are released; confirmed bookings are kept (ops decide refunds separately).
- `until`: automatic return to `active` after that time (checked on read + a daily job).
- Stored in `accountStatus/{uid}` = `{ status, reason (admin-only, NOT readable by the user), messageToUser, until, updatedAt, updatedBy }` — the user can read their own doc EXCEPT `reason`: store `reason` in `accountStatusPrivate/{uid}` (admin-only) and keep `accountStatus/{uid}` user-readable.
- Custom claim `acct` = `"paused" | "blocked"` (absent when active) so the server can check cheaply.
- Machine-readable refusals: a callable refused because the caller's account is paused or blocked fails with HTTPS status `permission-denied` and `details.code` = `"ACCOUNT_PAUSED"` or `"ACCOUNT_BLOCKED"` (plus the human `message`, `nextStep` and `details.facts.accountStatus`), so the app can react without reading `accountStatus/{uid}`.
- Audited; the person gets an inbox item (kind `"account-status"`) when paused/resumed (not when blocked).
- Organizations: keep `setMarketplaceEntityStatus` (organizer → active/paused/blocked) — make sure the org owner + members get an inbox item (kind `"organization-status"`, link `organizer`) with the reason text meant for them, and that `publicOrganizers/{orgId}.status` reflects it so the app can show it.

## 4. App behaviour

- On sign-in, app start and every return to the foreground (at most every 60 s): call `getMyAnnouncements`; show popups (`modal` / `fullscreen` / `sheet`) one at a time by priority, after the splash/onboarding and never over checkout/payment or event-day scanning; `banner` items at the top of Explore (customer) and Today (host); `inbox` items in the notifications list. Record `shown` when displayed, `clicked` on CTA, `dismissed` on close, `acked` on "I understand".
- CTA: `link` → existing deep-link routing; `url` → external browser.
- `admin-message` inbox items show the image and open the link/url.
- Account status: listen to `accountStatus/{uid}`; `paused` → a calm banner on Explore/You ("Your account is paused until 2 Dec. You can look around, but you can't book right now." + messageToUser + "Contact support"), booking/review/waitlist buttons show the reason instead of failing late; `blocked` → full-screen "Account suspended" (messageToUser if readable, support contact) and sign-out; Firebase `user-disabled` errors at sign-in show the same screen.
- Organizer status (`publicOrganizers/{orgId}.status` for the workspace org): `paused` → host-mode banner "Your organization is paused by PULSE: …" (new listings/dates can't be submitted), `blocked` → host mode shows a blocked screen with support contact.

## 5. Server + console details (as built, 24 Nov 2026)

Additive to sections 1–3 (no field or callable above was renamed). All
callables run in `asia-south1` (the console's `regionalFunctions`).

### Capabilities
`announcements.manage` and `accounts.moderate` are granted to `platform-owner`
and `super-admin` (`firebase/functions/src/platform/auth.ts` `ADMIN_CAPABILITIES`,
console `lib/console/capabilities.ts`). `announcements.manage`: saveAnnouncement,
setAnnouncementStatus, previewAudience, getAnnouncementStats, sendNotification,
cancelScheduledNotification, saveTemplate, deleteTemplate. `accounts.moderate`:
setAccountStatus. `searchAccounts` needs either.

### Announcements (§1) — extra fields and behaviour
- Extra server fields on `announcements/{id}`: `statusReason`, `pushStatus`
  (`null | "sent" | "skipped-emulator" | "skipped-daily-limit" | "failed:<code>" | "pending"`),
  `pushSentAt`, `stats.viewers` (distinct people who saw it at least once).
  Per-day counters live in `announcements/{id}/daily/{YYYY-MM-DD}` (IST day;
  `{ day, shown, clicked, dismissed, acked }`), server-only.
- Draft `startsAt` may be null = "start when published". Publish sets
  `startsAt = max(startsAt, now)`; `scheduled` if in the future, else `live`.
  Publish refuses: `endsAt` not after start/now, empty `cities`/`uids`/`orgIds`,
  a popup that can't be closed (`dismissible:false` + `requireAck:false` + no CTA),
  and (with `sendPush`) a city push with platform/build filters or exclusions.
- Live edits may change only `title, body, imageUrl, primaryCta, secondaryCta,
  startsAt, endsAt`; anything else → `PRECONDITION` ("Pause it first").
  `ended` / `archived` can't be edited (duplicate instead).
- Status actions: publish (draft) · pause (live/scheduled) · resume (paused →
  live/scheduled by window; refused once `endsAt` has passed) · end
  (live/scheduled/paused → ended, `endsAt = now`) · archive (any but archived) ·
  duplicate (any → new draft, stats reset, window cleared). `reason` 3..500.
- A 5-minute job (`runNotificationJobs`) flips `scheduled → live` at `startsAt`
  (sending the push then, if `sendPush`), and `live/scheduled → ended` after
  `endsAt`. Delivery never waits for it: it checks the window itself.
- `getMyAnnouncements` also records `users/{uid}.appClient = { platform, build, at }`
  (at most every 6 h) — this is how push targeting knows platform/build.
  CTA objects carry only the keys that are set (`label` + `link` or `url`).
  `endsAt` is an ISO string or null. Rate limit 240/hour per person.
- `recordAnnouncementEvent` rate limit 600/hour per person; unknown or draft
  announcements → `NOT_FOUND`. Counters: `shown` +1 per person per IST day,
  `viewers` +1 on a person's first `shown`, `clicked/dismissed/acked` +1 once per person.
- Frequency (server): `once` = hidden after the person clicked, dismissed or
  acked; `daily` = hidden for the rest of the IST day once shown; `every-open`
  = never hidden while live.

### previewAudience / getAnnouncementStats / searchAccounts outputs
- `previewAudience { audience }` → `{ estimate, exact, breakdown: { customers, organizers }, sample, note }`.
  `exact:false` with a `note` when it's an estimate: `cities` (the phone keeps
  the city, so the estimate is everyone = an upper bound) and platform/build
  filters (only people whose app reported platform/build are counted). Blocked
  accounts and console operators are never counted.
- `getAnnouncementStats { id }` → `{ id, status, stats, ctr, series }`;
  `ctr` = clicked / viewers (0..1, null when no viewers); `series` = 30 entries,
  oldest first, zero-filled `{ day, shown, clicked, dismissed, acked }`.
- `searchAccounts { query }` (2..80 chars): digits (4+) → phone prefix;
  a single token of 20+ id characters → uid; otherwise display-name prefix
  (as typed, Capitalised, lower case). Console operators are excluded.
  Each row also has `accountStatusUntil` (ISO | null). The rows come wrapped:
  `{ accounts: [...] }`.
- CTA `label` is 1..40 characters; `link.id` follows the usual id rule
  (4..128 of `A-Z a-z 0-9 _ -`); a CTA with neither `link` nor `url` just closes
  the popup (and counts as `clicked`).

### Notifications (§2) — extra details
- Inbox item (`userNotifications`, kind `admin-message`): `{ recipientUid, kind,
  title, body, link: {type,id} | null, url: string | null, imageUrl: string | null,
  style, notificationId, read:false, push:{status}, createdAt }`, id
  `admin-message:{notificationId}:{uid}`.
- Recipients: `users` = the uids (minus exclusions); `orgs` = active members;
  `organizers` = every active member of any org; `customers` = everyone else;
  `all` = both. Console operators and blocked accounts are skipped.
  `cities` has no inbox items (PULSE doesn't know who is where): push to the
  city topics only, `recipients: null`. Platform/build filters and exclusions
  can't be combined with `cities` (`INVALID_INPUT`).
- Push: `all` without filters/exclusions → topic `all` (inbox items are
  written with `push.status:"topic"` so the per-item push trigger skips them);
  otherwise per-user tokens via the existing `deliverNotifications` trigger
  (`push.status:"pending"`). Emulator: topic sends recorded as `skipped-emulator`.
- `adminNotifications/{id}` extra fields: `limited` (counts toward the shared
  3/day), `scheduleAt`, `pushMode: "topic" | "per-user"`, `pushStatus`,
  `failure` (`null | "daily-limit" | "<message>"`), `cancelledAt/By`,
  `cancelReason`, `sentAt`. Statuses: `scheduled → sending → sent | failed`,
  or `cancelled`. `scheduleAt` 2 min..60 days ahead. `reason` 3..500.
  Limited sends also write a `broadcasts` doc (`source: "notification"`) so
  `sendBroadcast` and the notification center share one 3/day quota.
- Push for an announcement (`sendPush`) follows the same routing (topic for
  all/cities, per-user tokens otherwise, no inbox item), counts toward the
  quota for `all/customers/cities`, and is refused at publish when the quota
  is used up (scheduled ones record `pushStatus: "skipped-daily-limit"`).
- Admin push respects no channel opt-outs (PULSE operational messages).

### Templates
`notificationTemplates/{id}` = `{ name 3..60, kind: "announcement" | "notification",
payload: object (the composer's fields, max 20 KB), createdAt/By, updatedAt/By }`.
Admin-only callables: `saveTemplate { requestId, id?, name, kind, payload }` →
`{ id }`; `deleteTemplate { requestId, id, reason }` → `{ id, deleted: true }`.
Admins read the collection directly (rules); no client writes.

### Account controls (§3) — extra details
- `setAccountStatus` → `{ uid, status, until, authSynced, replayed }`
  (`authSynced:false` = the Auth lock/claim couldn't be written; the status doc
  still applies and repeating the call re-syncs). Refuses console
  operator accounts (use Operator access) and your own account. `until` must
  be in the future (≤ 2 years) and only with paused/blocked.
- `accountStatusPrivate/{uid}` = `{ reason, history: [{ status, reason,
  messageToUser, until, at, by }] (newest first, max 50), updatedAt }`.
- Paused error: `permission-denied`, `details.code: "ACCOUNT_PAUSED"`, message
  "Your account is paused until 2 Dec 2026, 6:00 pm IST. {messageToUser}",
  `details.facts = { accountStatus: "paused", until? }`. Blocked:
  `permission-denied`, `details.code: "ACCOUNT_BLOCKED"`, "This account is
  suspended.", `details.facts.accountStatus = "blocked"`. (A Firebase-level
  `disabled` claim still answers `NOT_PERMITTED` as before.)
- Refused while paused (one shared gate: `requireCustomerAction()` in
  `platform/actors.ts`, which calls `assertCustomerActionAllowed()` in
  `platform/accountStatus.ts`): reserveSeat, createPaymentOrder,
  joinEventWaitlist, reserveTripSeats, createTripPaymentOrder, joinTripWaitlist,
  submitReview, submitTripReview, setFollow (follow only), submitOrganizerApplication.
  Still allowed while paused: sign-in, reading, getMyAnnouncements /
  recordAnnouncementEvent, support (submitSupportRequest, addSupportMessage),
  confirmPayment / confirmTripPayment / payTripBalance (finishing money already
  in flight), cancelBooking / cancelTripBooking / leave waitlists / unfollow,
  setOrganizerBlock, profile, push tokens, deleteMyAccount, and every organizer
  action for orgs they belong to.
- Blocked: the shared `callable()` wrapper refuses every callable for a token
  with `acct:"blocked"` or a `blocked` status doc; Firestore rules treat
  `acct == "blocked"` like `disabled`. The person can still read their own
  `accountStatus/{uid}` doc. Held (unpaid) event and trip bookings are expired
  immediately; confirmed bookings stay.
- `until` expiry: read paths treat a passed `until` as active; the daily job
  (`expireAccountStatuses`, 03:00 IST) writes the return to `active` (and
  re-enables a blocked Auth user).
- Inbox items (kind `account-status`) link `{ type: "account", id: uid }`
  (new link type: open the account-status / You screen).
- Organizations: `setMarketplaceEntityStatus` accepts an optional
  `messageToOrganizer` (0..500). For `entityType: "organizer"` and status
  `active | paused | blocked` it sets `organizers/{orgId}.statusMessage`,
  `publicOrganizers/{orgId}.status` + `.statusMessage`, and writes an
  `organization-status` inbox item (link `organizer`) to every active member.
