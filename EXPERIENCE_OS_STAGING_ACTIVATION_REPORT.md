# Experience OS — staging activation report

Date: 2026-10-01. Account: the Firebase CLI login used for the activation checklist (`HUMAN_FINAL_ACTIVATION_CHECKLIST.md`). No secrets are recorded here.

## Final status

### STAGING ACTIVATION BLOCKED BY EXTERNAL REQUIREMENT

The staging project exists and its Firestore part is fully deployed. Everything after that needs the **Blaze plan**, which only the owner can enable: Secret Manager, Cloud Functions, Cloud Scheduler and Storage. No backend function runs on staging yet, so none of the customer, organizer or staff journeys can be exercised against staging. Nothing here is a product defect.

## Repositories

| Repo | Branch | Commit | `main` |
| --- | --- | --- | --- |
| PULSE (`exprerience_os`) | `claude/zen-keller-hrjluw` | `d27b0e3` (unchanged) | `c64f7ce`, untouched |
| Backend and console (`fun_experience_os`) | `claude/zen-keller-hrjluw` | `bd50a1a`, pushed | `0029c9e`, untouched |

Backend commits added during activation:
- `2a84006`: adds the `staging` alias (`experience-os-staging`) to `.firebaserc` and pins Firestore to `asia-south1` in `firebase.json`. Without the pin, `firebase deploy` creates the database in `nam5` (US) on any fresh project. That would also have hit production.
- `bd50a1a`: makes the index check compare paths with forward slashes, so it passes on Windows.

## Environment map

| Environment | Firebase project | Used by |
| --- | --- | --- |
| Local / emulator | `demo-experience-os` | `.firebaserc` `development`; PULSE `PULSE_ENV=emulator` |
| Staging | `experience-os-staging` (number 248160728472) | `.firebaserc` `staging`; PULSE `~/pulse-env/staging.android.json`; `android/app/google-services.json` (gitignored) |
| Production | not created (owner decision D2) | none |

`check-release-guardrails.mjs` passes, and the PULSE staging guard accepts the id because it contains `staging`. Nothing points at production.

## Firebase

| Item | Status |
| --- | --- |
| Project | `experience-os-staging`, display name "Experience OS Staging", created by CLI |
| Billing | **Spark (free). Blaze required. BLOCKER** |
| Firestore | `(default)`, native mode, **asia-south1**. A first auto-created `nam5` database was deleted while still empty and recreated in the correct region |
| Firestore rules | deployed and compile clean |
| Firestore indexes | deployed; `check:indexes` covers 52 declared queries (22 composite), 24 indexes |
| Storage | **BLOCKED**: needs "Get Started" in the console, and a new default bucket needs Blaze |
| Authentication | Email/Password **enabled** (via `deploy --only auth` with a temporary config file; the tracked `firebase.json` is unchanged). Phone: **not enabled**, because the CLI has no setting for it (console step) |
| Android app | `app.pulse.experience`, app id `1:248160728472:android:b80c88961944ea451727ed`; debug SHA-1 and SHA-256 registered (staging only, per G3) |
| Web app | "Operations Console (staging)", `1:248160728472:web:5b148ef6bac13c121727ed` |
| Secret Manager / internal secrets | **BLOCKED** (Blaze). `CODE_PEPPER` and `TICKET_SIGNING_KEY` not generated yet |
| Cloud Functions | **BLOCKED** (Blaze plus Razorpay test secrets) |
| Scheduled jobs | **BLOCKED** (Functions) |
| App Check | the app uses the debug provider in this staging build. Registering the debug token is a console step (Firebase CLI 15.20 has no command for it). Play Integrity needs Play Console (G4). Not enforced |
| FCM | not exercisable without Functions (the server sends the pushes) |
| Monitoring / backups | **BLOCKED**: `gcloud` is not installed here and the scripts need it; backups also need Blaze |

## PULSE on the physical device

| Item | Value |
| --- | --- |
| Device | vivo I2127, Android 14, USB |
| Build | `flutter build apk --debug --dart-define-from-file=~/pulse-env/staging.android.json --dart-define=APP_CHECK_DEBUG=true`. Debug because no release signing key exists (G1) |
| Launch | PASS: Firebase initialized; App Check debug provider active for `experience-os-staging`; sign-in screen shown with no previous emulator session carried over |

| Journey | Result |
| --- | --- |
| Customer | BLOCKED (Phone provider, Functions) |
| Organizer | BLOCKED (Functions) |
| Staff | BLOCKED (Functions) |
| QR | BLOCKED (Functions; `TICKET_SIGNING_KEY`) |
| Notifications | BLOCKED (Functions) |
| App Check | PARTIAL: token issued on the device; registration and enforcement not done |
| Offline | BLOCKED (no backend) |
| Razorpay TEST MODE | BLOCKED: no test keys on this machine, and none can be stored until Blaze |

The regression gates for the six defects fixed on device (`daf9aef`, `aaea718`, `d27b0e3`) are still verified on the emulator only. They have to be rerun on staging once Functions are deployed.

## Security

Firestore and Storage rules suite (`npm run test:rules`, emulator): **56/56 pass** on `bd50a1a`. The staging-side attack suite can't run until Functions are deployed.

## Remaining smaller issues (from the device run), classified

| Issue | Classification |
| --- | --- |
| Lists don't refresh after a server decision | P2, acceptable for V1; not a staging blocker |
| Organizer drafts lose location, date and time on restart | P2 follow-up |
| "Release spot" copy during a payment in flight | P2, copy only; the behaviour is already safe |
| Owner listed twice in Staff | P3 |
| Staff invite fails silently with no event selected | P3 |
| Manual "Enter code" expects the QR payload, not the printed `REF` | **P2, fix before production**: the door fallback doesn't work, but QR scanning does |
| Prefix and layout alignment items | P3 |

None of these blocks staging certification.

## External blockers

```text
BLOCKER: Blaze billing on experience-os-staging
WHY: Secret Manager, Cloud Functions, Cloud Scheduler and the Storage default bucket can't be enabled on the Spark plan.
WHAT HAS ALREADY BEEN COMPLETED: the project, the Firestore database (asia-south1), its rules and indexes, Email/Password auth, the Android and web apps, debug SHAs, the PULSE staging build installed on the phone, and the alias and guardrails.
EXACT HUMAN ACTION REQUIRED: console.firebase.google.com/project/experience-os-staging/usage/details → upgrade to Blaze (set a budget alert).
WHAT CAN RESUME IMMEDIATELY AFTER THAT ACTION: the secrets, the Functions deploy, Storage and the scheduler.
```

After Blaze, these owner actions remain. Each has no CLI or API path from this machine:
1. Storage → **Get Started** (asia-south1).
2. Authentication → enable **Phone**, and add test numbers (F4).
3. Razorpay **test** key id, key secret and webhook secret. Enter them through the hidden prompt in `scripts/provision-environment.sh staging` (it needs `gcloud`, so install the Google Cloud SDK and run `gcloud auth login`).
4. App Check → register the device's debug token (printed in logcat at launch) for the Android app.
5. Monitoring notification channel (F12); console App Hosting backend plus GitHub connection (F13). The console can run locally against staging until then.
6. Play Console, the upload keystore (G1–G4), Apple / Xcode (iOS: **BLOCKED — Xcode / Apple developer environment required**).

After those steps, run `scripts/deploy-backend.sh staging`, then `npm run bootstrap:platform-owner`, then the device journeys from checklist §7.
