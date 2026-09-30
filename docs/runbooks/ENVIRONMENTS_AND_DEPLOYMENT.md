# Environments, deployment, operations and recovery

## 1. Environment separation

| | demo | emulator | staging | production |
| --- | --- | --- | --- | --- |
| Firebase project | — | `demo-experience-os` (local only) | `<org>-experience-os-staging` | `<org>-experience-os-prod` |
| `.firebaserc` alias | — | `development` | `staging` (add) | `production` (add) |
| PULSE `PULSE_ENV` | `demo` | `emulator` | `staging` | `production` |
| Console `NEXT_PUBLIC_DATA_MODE` | — | `firebase-emulator` | `firebase-live` | `firebase-live` |
| Payments | simulated | EmulatorProvider (auto-selected only under the emulator) | Razorpay **test** keys | Razorpay **live** keys |

**Rules**
- Never point staging at production, or development at either. Project ids are never guessed; they come from the owner's console.
- `.firebaserc` must list staging and production as separate aliases, and every deploy command passes `--project <alias>`.

## 2. One-time external setup (human-controlled)

| # | Action | Who | Output needed |
| --- | --- | --- | --- |
| E1 | Create the Firebase projects (staging, production), with the Blaze plan and billing | Owner | project ids |
| E2 | Enable Phone Auth; add Android SHA-256 fingerprints and iOS APNs keys; enable Play Integrity and App Attest for App Check | Owner / mobile lead | `google-services.json`, `GoogleService-Info.plist`, App Check providers |
| E3 | Razorpay merchant account, KYC, and activation of live mode and Route | Owner (business) | key id, key secret, webhook secret |
| E4 | Razorpay webhook → `https://asia-south1-<project>.cloudfunctions.net/razorpayWebhook`, events `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed` | Owner | webhook secret |
| E5 | FCM / APNs for push | Mobile lead | APNs auth key |
| E6 | Android signing keystore, Play Console app; Apple developer account and App Store Connect app | Owner | signing credentials |
| E7 | reCAPTCHA Enterprise site key for the console App Check | Owner | site key |
| E8 | Legal: terms, privacy policy, refund policy text; DPDP Act 2023 notices | Owner / legal | published URLs |

## 3. Secrets (Secret Manager; never in the repo)

```sh
firebase functions:secrets:set CODE_PEPPER            --project production   # 32+ random bytes
firebase functions:secrets:set TICKET_SIGNING_KEY     --project production   # 32+ random bytes
firebase functions:secrets:set RAZORPAY_KEY_ID        --project production
firebase functions:secrets:set RAZORPAY_KEY_SECRET    --project production
firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET --project production
```

**Rotating `TICKET_SIGNING_KEY` invalidates every issued QR.** Rotate only with a planned re-issue. Rotating `CODE_PEPPER` invalidates unredeemed codes; re-issue them.

### First platform owner (once per project)

`setOperatorAccess` can only be called by an existing platform owner, so the first one is granted with a guarded one-off script. It uses the project owner's own login, asks you to type the project id again, and refuses to run once any platform owner exists:

```sh
gcloud auth application-default login
npm run bootstrap:platform-owner -- --project <exact project id> --uid <Firebase Auth uid> --reason "Initial platform owner"
```

The user must already exist in Firebase Auth with a verified email. Then grant a **second** admin from the console (Access page): refunds above ₹10,000, settlements above ₹50,000 and every commercial-terms change need two different admins.

## 4. Deploy (backend)

```sh
cd firebase/functions && npm ci && npm run typecheck && npm run build
cd ../.. && npm run test:rules && npm run test:functions          # must be green
firebase deploy --project staging --only firestore:rules,firestore:indexes,storage,functions
# smoke (staging): scripts in §6
firebase deploy --project production --only firestore:rules,firestore:indexes,storage,functions
```

## 5. Build (clients)

- **PULSE (Android):**
  ```sh
  flutter build appbundle --release \
    --dart-define=PULSE_ENV=production \
    --dart-define=FIREBASE_API_KEY=… --dart-define=FIREBASE_APP_ID=… \
    --dart-define=FIREBASE_PROJECT_ID=… --dart-define=FIREBASE_MESSAGING_SENDER_ID=… \
    --dart-define=FIREBASE_STORAGE_BUCKET=…
  ```
  App Check activates automatically for `staging` and `production` (Play Integrity / App Attest; every callable rejects un-attested calls). For staging testers only, add `--dart-define=APP_CHECK_DEBUG=true` and register each device's debug token in the Firebase console; production builds refuse this flag.
- **Console:**
  ```sh
  NEXT_PUBLIC_DATA_MODE=firebase-live … npm run build:production
  ```
  `verify-production-env.mjs` refuses `demo-*` projects.

## 6. Post-deploy smoke tests (staging, then production)

The full list below must pass on staging, on physical Android and iOS devices with release builds, before production is deployed. It is the only place Firestore triggers, FCM delivery, App Check attestation and Razorpay are exercised for real; the local emulator suites can't cover them.

1. `checkHealth` returns ok.
2. A console admin signs in and the Command Center loads.
3. PULSE test phone (a Firebase Auth test number):
   - OTP → profile → Explore loads published events.
4. **Organizer path:**
   - test organizer applies → admin approves → code shown once → redeemed → Command Center.
5. **Event path:**
   - admin A proposes commercial terms for the organizer → admin B approves them (Console → Commercial terms);
   - create experience → submit → approve → create event → submit → approve → Publish (PULSE host workspace).
6. **Booking path (Razorpay test mode):**
   - book → pay with a test UPI/card → webhook `payment.captured` → ticket QR.
7. **Door:**
   - staff invite → code → staff scan: `checked-in`, then `already-used`.
8. **Money and aftercare:**
   - cancel within policy: a refund is created (test mode);
   - after the event completes: review accepted;
   - `buildSettlement` totals match the ledger.

## 7. Operations

- **Monitoring:**
  - Cloud Functions error rate and p95 latency on `reserveSeat`, `confirmPayment`, `razorpayWebhook` and `scanTicket`;
  - webhook 4xx rate (signature failures mean misconfiguration or an attack);
  - `releaseExpiredHolds` must run every 5 minutes;
  - `riskAlerts` created by amount mismatches.
- **Alert on:**
  - any `payment-orphaned` booking;
  - any ledger imbalance (a scheduled reconciliation should compare payments against ledger sums per day);
  - repeated `access.code-failed` for one uid;
  - a spike in scan `invalid` results for an event.

## 8. Disaster recovery

- **Backups:** enable Firestore PITR (7 days) and scheduled exports to a separate GCS bucket (daily, 30-day retention) in production.
- **Restore:** use PITR for accidental writes. Export/import into a new database for corruption, then re-point functions.
- **Payments:**
  - Razorpay is the system of record for money movement.
  - Reconciliation compares Razorpay settlements/payments reports with `payments` and `ledgerEntries`.
  - Discrepancies raise `riskAlerts` and require an admin decision; never auto-correct history.
- **Secrets:** Secret Manager versions are retained. Rollback means pinning the previous version.

## 9. Incident handling

| Severity | Examples | Response |
| --- | --- | --- |
| SEV-1 | Oversell, money moved without a booking, private data exposure, forged tickets admitted | Page the owner. Freeze affected events (admin cancel / organizer pause). Disable the callable via an App Check or IAM change if needed. Preserve audit. Postmortem within 48 h |
| SEV-2 | Webhook failures, payments stuck in `created`, refunds stuck in `processing` | Replay from the Razorpay dashboard (idempotent), then reconcile |
| SEV-3 | Notifications delayed, UI defects | Normal fix cycle |

Audit events are append-only and are never edited during incidents.
