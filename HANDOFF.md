# PULSE backend + super admin console — handoff (read this first)

Last updated 18 Nov 2026. The Flutter app lives in
[GowthamBandi/exprerience_os](https://github.com/GowthamBandi/exprerience_os) — read its `HANDOFF.md`
first (product overview, how to run the app, legal pages). Work on `main` in both repos.

## What's here

| Path | What |
| --- | --- |
| `firebase/functions/` | Cloud Functions (TypeScript, Node 22). Callables in `asia-south1`; governance + `checkHealth` in `us-central1`. |
| `firebase/firestore/` | `firestore.rules`, `firestore.indexes.json`, rules tests. |
| `firebase/storage/` | Storage rules. |
| `firebase/scripts/` | `seed-emulator.ts` (full local data set), `check-indexes.mjs` (every query must be declared + indexed), `qa-emulator.mjs` helpers. |
| `apps/operations-web/` | Super admin console (Next.js 15, React, Tailwind). |
| `HUMAN_FINAL_ACTIVATION_CHECKLIST.md` | Owner's account/billing/legal steps per environment. |

Ignore the Flutter scaffold at this repo's root (`lib/ android/ ios/ …`): unused leftover.

## Run locally

```bash
cd firebase/functions && npm ci && npm run build && cd ../..
npx firebase emulators:start --project demo-experience-os --only auth,firestore,functions,storage
# another terminal:
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 npm run seed:emulator
# console (http://localhost:5290): copy the emulator env file once, then run
cd apps/operations-web && npm ci && cp .env.example .env.local && npx next dev -p 5290
```
Console logins (local emulator only): `admin@pulse.test` / `PulseAdmin#2026`, `ops@pulse.test` / `PulseOps#2026`.

## Tests

```bash
# backend (needs auth + functions emulators for the health/fuzz tests)
npx firebase emulators:exec --project demo-experience-os --only firestore,auth,functions "cd firebase/functions && npx jest"
# rules (needs storage emulator too)
npx firebase emulators:exec --project demo-experience-os --only firestore,storage "cd firebase/firestore && npx jest --runInBand"
# console
cd apps/operations-web && npx tsc --noEmit -p . && npx vitest run
# index inventory
node firebase/scripts/check-indexes.mjs
```
Current (24 Nov): backend 520/520 (`I1 occupancy` is a known random-sequence flake), rules 80/80, console 441/441.
If the default emulator ports are busy, run tests with a spare config (e.g. Firestore on 8181) via
`--config`.

## Staging

Project `experience-os-staging` (owner account frameingos@gmail.com). Deployed: all non-payment
functions, rules, indexes, storage rules. Not deployed: the 14 Razorpay-bound functions
(`createPaymentOrder`, `confirmPayment`, `razorpayWebhook`, `cancelBooking`, `decideRefund`, trip
payment functions, `releaseExpiredHolds`, `sweepTripBalances`, …) — they need `RAZORPAY_*` secrets.
Console is **not hosted** yet (needs Firebase App Hosting + GitHub connection + reCAPTCHA Enterprise
key: owner step).

Deploy rules of thumb:
- `scripts/deploy-backend.sh` refuses while Razorpay secrets are missing, so deploy selectively:
  `npx firebase deploy --project staging --only functions:<name>,firestore:rules,firestore:indexes`.
- Functions with a retry policy (Firestore triggers) need `--force` the first time (Firebase asks you
  to acknowledge retries). With `--only`, `--force` touches only the listed functions.
- Secret `PAYOUT_ENCRYPTION_KEY` (staging) encrypts organizer bank/UPI details: **never rotate it
  without re-encrypting `payoutSecrets`**.
- Never run the rules test suite against the emulators you're using for app QA (it wipes them).

## Key features to know (all built and on staging)

- Organizer Event Agreement required on `submitExperience` / `submitEvent` / `submitTrip`
  (`catalog/agreement.ts`, version `ORG-EVENT-1.0`; keep in step with the app).
- Support: `support/requests.ts` (auto 48-hour acknowledgement, `resolveBy` = 30 days, console
  flags overdue); blocks `support/blocks.ts` (`userBlocks/{uid}`).
- Event day `catalog/eventDay.ts` (+ `messageEventAttendees`, 5/day); follows `catalog/follows.ts`
  (+ trigger notifying followers on publish); public reviews `publicReviews/` projection.
- Payout accounts (encrypted) + KYC documents: `commerce/payoutAccounts.ts`, `identity/kycDocuments.ts`.
- App switches `platform/appConfig.ts` (min build, maintenance) and broadcasts
  `platform/broadcast.ts` (FCM topics `all` / `city_<key>`, 3/day) — both on the console System page.
- Service cities `platform/serviceCities.ts` (`appConfig/cities`, `setServiceCities`, console System
  page "Service cities" card): the app's city pickers list only active cities; `submitEvent`,
  live-edit `saveEvent` and `submitTrip` refuse other cities. No document → every city allowed.
- Notification center + account controls (24 Nov, spec `docs/NOTIFICATION_CENTER_CONTRACT.md`):
  announcements `platform/announcements.ts`, audiences `platform/audience.ts`, sends + templates
  `platform/adminNotifications.ts`, pause/block `platform/accountControls.ts` (enforcement in
  `platform/accountStatus.ts`, the `callable()` wrapper and `requireCustomerAction()`), jobs
  `platform/notificationJobs.ts` (`runNotificationJobs` 5 min, `expireAccountStatuses` daily).
  Console: Notifications area (`/notifications/*`), Account card on Customer 360, organizer status
  message in the pause/block sheet. Not deployed.
- Console pages: Command Center, Live, Approvals, Trips, Categories (cover images), Organizers
  (360 with money, team, trust stats), Experiences & Events (360 with Safety & messages tab),
  Customers, Risk, Support, Reviews, Revenue, Refunds, Settlements, Commercials, Audit, Policies,
  Legal holds, System health, Operator access.

## Open work

See `exprerience_os/docs/LAUNCH_GAP_REPORT.md`. Waiting on the owner: Razorpay, production project,
console hosting, a CA's answer on GST TCS / TDS (then build payout deductions, invoices, statements),
a lawyer's review of terms and the organizer agreement.
