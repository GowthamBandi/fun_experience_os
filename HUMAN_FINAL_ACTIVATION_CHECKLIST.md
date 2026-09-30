# Human final activation checklist

Everything in this list needs **your** accounts, identity, money, legal authority or physical devices. Engineering work is done and verified: code, rules, indexes, CI, scripts and runbooks.

Work top to bottom. **Staging first, then production.** Each item says what's already prepared and how to check it worked.

Your Firebase / Google Cloud account: **frameingos@gmail.com**. Repositories:
- `fun_experience_os`: backend and console (this repo)
- `exprerience_os`: the PULSE app

---

## 0. Decisions only you can make

| # | Decision | Default prepared | Where it's used |
| --- | --- | --- | --- |
| D1 | **App id / bundle id.** It can never change after the first store upload. | `app.pulse.experience` (Android and iOS) | `exprerience_os/android/app/build.gradle.kts`, `ios/Runner.xcodeproj`. To change it, see `exprerience_os/docs/RELEASE_CHECKLIST.md` §0 |
| D2 | **Firebase project ids** for staging and production. The staging id must contain `staging`, `dev` or `test`; the production id must not. | none (never guessed) | `.firebaserc`, build defines |
| D3 | **Console domain**, e.g. `ops.<your-domain>` | none | App Hosting, Auth authorized domains, reCAPTCHA key |
| D4 | **Brand art:** 1024×1024 app icon and a monochrome notification glyph. The launcher icons and splash are still Flutter defaults. | a placeholder ticket glyph for notifications | `exprerience_os/docs/RELEASE_CHECKLIST.md` H10 |
| D5 | **Unused Flutter scaffold** at the root of this repo: delete it or keep it. Deleting it was blocked by the permission system in the automated session. | kept, marked unused in `README.md` | `lib/ test/ android/ ios/ web/ linux/ macos/ windows/ pubspec.*` |

---

## 1. Firebase / Google Cloud (per environment)

| # | Action | Where | Value / input | Already prepared | Verify | Expected |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Create the project and upgrade to **Blaze** (billing) | console.firebase.google.com → Add project | D2 id; billing account | nothing to prepare | `firebase projects:list` | the id is listed |
| F2 | Add the alias | terminal in `fun_experience_os` | `firebase use --add` → alias `staging` / `production` (see `.firebaserc.example`) | guardrails check alias naming | `node scripts/check-release-guardrails.mjs` | "passed" |
| F3 | Provision APIs, Firestore (asia-south1), internal secrets | terminal | `gcloud auth login && firebase login`, then `scripts/provision-environment.sh <env>` | the script (idempotent; generates `CODE_PEPPER` and `TICKET_SIGNING_KEY`, never overwrites them) | rerun the script | every step says "exists" |
| F4 | **Authentication:** enable **Phone** and **Email/Password**. Add test phone numbers (staging only). Authorized domains: the console domain (D3) and its `*.hosted.app` domain. | Firebase → Authentication → Sign-in method / Settings | numbers such as `+91 90000 00001` / `123456` | the app and console already use exactly these providers | sign in to PULSE with the test number | OTP accepted |
| F5 | **Register apps:** Android `app.pulse.experience`, iOS `app.pulse.experience`, Web "Operations Console" | Firebase → Project settings → Your apps | SHA-256 fingerprints (G3) | build defines and config file locations are documented | download `google-services.json` and `GoogleService-Info.plist` | files present locally (gitignored, never committed) |
| F6 | **App Check:** Android → Play Integrity; iOS → App Attest (+ DeviceCheck key); Web → reCAPTCHA Enterprise site key (created on the console domain) | Firebase → App Check | site key → `apps/operations-web/apphosting.<env>.yaml` `NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY` | the app activates App Check automatically in staging/production; every callable enforces it | App Check → Metrics | verified requests ≈ 100% before you press **Enforce** |
| F7 | **Cloud Messaging:** upload the APNs auth key (A3) | Firebase → Project settings → Cloud Messaging → Apple app | `.p8`, key id, team id | push registration, routing and token cleanup are built | send a test message from the Firebase console to a staging device | notification shown (also with the app closed) |
| F8 | **Backups:** PITR plus daily scheduled backups; Storage versioning | terminal | `scripts/enable-backups.sh <env>`, then `gcloud storage buckets update gs://<bucket> --versioning --soft-delete-duration=30d` | the script and `docs/runbooks/BACKUP_AND_RECOVERY.md` | the script's closing "Verify" output | `POINT_IN_TIME_RECOVERY_ENABLED` and one daily schedule |
| F9 | **Deploy the backend** (rules, indexes, storage, functions) | terminal | `scripts/deploy-backend.sh <env>` | guarded script: clean tree, secrets present, typed confirmation for production | `curl -s -X POST -H 'Content-Type: application/json' -d '{"data":{}}' https://us-central1-<id>.cloudfunctions.net/checkHealth` | `{"result":{"ok":true,"environment":"deployed","projectId":"<id>",…}}` |
| F10 | **First platform owner:** create your console user (Auth → Add user, email/password). Sign in to the console once and verify the email with the "Verify your email" button. | Firebase → Authentication, then the console | your email | `npm run bootstrap:platform-owner -- --project <id> --uid <uid> --reason "Initial platform owner"` (refuses if an owner already exists) | sign out and back in | the console opens with the **Platform Owner** badge |
| F11 | **Second admin** (dual control needs two people) | Console → **Operator access** (`/operators`) | the second person's uid (they sign in once and verify their email first) | the page, audit trail and self-demotion protection are built | Operator access list | two active admins |
| F12 | **Monitoring:** create one notification channel (on-call email), then run the scripts | Cloud Monitoring → Alerting → Edit notification channels | channel id | `firebase/scripts/create-log-metrics.sh <id>` and `firebase/scripts/create-alert-policies.sh <id> <channel-id>` | `gcloud monitoring policies list --project <id>` | 15 "Experience OS: …" policies |
| F13 | **Console hosting:** create the App Hosting backend `operations-console`, root `apps/operations-web`, env `staging` / `production`. Connect the custom domain (D3). | Firebase → App Hosting | fill `apps/operations-web/apphosting.<env>.yaml` with the web app config (F5) and the reCAPTCHA key (F6) | `apphosting*.yaml`, `DEPLOYMENT.md`; the pre-build check refuses mismatched or placeholder values | open the console URL | login page with the correct environment badge |

## 2. Google Play

| # | Action | Where | Already prepared | Verify |
| --- | --- | --- | --- | --- |
| G1 | Create the **upload keystore** and keep it in a password manager, with access for two people | terminal: `keytool -genkey -v -keystore ~/pulse-upload.jks -keyalg RSA -keysize 2048 -validity 10000 -alias upload` | `android/key.properties.example`. Release builds fail without a key; they never fall back to debug signing | `keytool -list -v -keystore ~/pulse-upload.jks` |
| G2 | Create the app `app.pulse.experience`, enrol in Play App Signing, complete Data safety, content rating, target audience and privacy URL (L1) | Play Console | release checklist H2 | app appears in the Play Console |
| G3 | Register **SHA-256** fingerprints (App signing key and upload key) in **both** Firebase Android apps; debug key in staging only | Play Console → App integrity; Firebase → Android app | release checklist H3 | Phone OTP works on a Play-installed build |
| G4 | Link the Play Integrity API to the Google Cloud project | Play Console → App integrity | App Check wiring | App Check metrics show Play Integrity verdicts |

## 3. Apple

| # | Action | Where | Already prepared | Verify |
| --- | --- | --- | --- | --- |
| A1 | Apple Developer Program membership; App ID `app.pulse.experience` with **Push Notifications** and **App Attest** | developer.apple.com | `ios/Runner/Runner.entitlements` | Xcode shows no capability errors |
| A2 | Set your **Team** in Xcode (Runner → Signing & Capabilities); create the App Store Connect record | Xcode, App Store Connect | iOS 15 minimum and `Podfile` | `flutter build ipa` succeeds |
| A3 | Create the **APNs auth key** (`.p8`) and upload it to Firebase (F7) | developer.apple.com → Keys | push code | test push arrives |
| A4 | Add the iOS **Encoded App ID** URL scheme (Phone Auth reCAPTCHA fallback) for staging and production | `ios/Runner/Info.plist` `CFBundleURLSchemes` | release checklist H8 | OTP works on a device without silent push |

## 4. Razorpay / payments (the only payments work left)

| # | Action | Where | Already prepared | Verify |
| --- | --- | --- | --- | --- |
| R1 | Merchant account, KYC, **live mode**, and **Route** (for organizer payouts) | dashboard.razorpay.com | the provider abstraction, orders, signature verification, webhook, refunds, ledger, settlements and dual control are all built and tested (test-mode provider) | the dashboard shows live mode is active |
| R2 | Staging: enter **test** keys; production: **live** keys | `scripts/provision-environment.sh <env>` (hidden prompt; it refuses live keys in staging and test keys in production) | the secret names are wired into the functions | `firebase functions:secrets:get RAZORPAY_KEY_ID --project <env>` |
| R3 | Webhook URL `https://asia-south1-<project>.cloudfunctions.net/razorpayWebhook` with events `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`; secret → `RAZORPAY_WEBHOOK_SECRET` | Razorpay → Settings → Webhooks | idempotent, signature-checked handler | send a test webhook from the dashboard; `paymentEvents` gets one doc, and a replay adds none |
| R4 | Settlement payouts: the console records payouts and their bank reference. Moving the money (a bank transfer, or Route once activated) is done by you. | bank / Razorpay Route | dual control above ₹50,000; ledger reconciliation | the settlement shows `paid` with a UTR |

## 5. Domains

| # | Action | Verify |
| --- | --- | --- |
| DN1 | Point D3 at App Hosting (DNS records shown by Firebase) | HTTPS padlock on the console domain |
| DN2 | Add the domain to Auth authorized domains and to the reCAPTCHA Enterprise key | console login works on the custom domain |

## 6. Legal

| # | Action | Where it goes |
| --- | --- | --- |
| L1 | Terms, privacy policy, refund policy and DPDP Act 2023 notices, published at public URLs | Play/App Store listings; the privacy-policy field in the stores |
| L2 | Approve the retention periods in `docs/runbooks/DATA_RETENTION.md` (audit ≥ 8 years, KYC of rejected applicants 180 days, notifications 180/365 days) | legal sign-off |

## 7. Physical devices: the launch gate (staging, then production)

Run the smoke list in `docs/runbooks/ENVIRONMENTS_AND_DEPLOYMENT.md` §6 on **release builds** on a real Android phone and a real iPhone.

Build commands are in `exprerience_os/docs/RELEASE_CHECKLIST.md` §3. Copy the environment's `google-services.json` / `GoogleService-Info.plist` in first.

Verify all of the following:
- OTP;
- organizer apply → approve → code → redeem;
- commercial terms: proposed by admin A, approved by admin B;
- create → approve → **Publish**;
- book and pay (Razorpay test mode);
- ticket QR; staff scan gives `checked-in`, then `already-used`;
- push received with the app **closed**;
- cancellation refund;
- completion → review;
- settlement reconciles;
- in Cloud Logging, `job.completed` appears for `releaseExpiredHolds` every 5 minutes.

The first real Android build also confirms the three things that couldn't be built in the engineering environment (no Android SDK or Xcode):
- the Gradle build with the google-services plugin (4.4.2);
- R8 with the keep rules;
- the merged manifest.

Run `exprerience_os/docs/RELEASE_CHECKLIST.md` §3 "artifact checks".

## 8. Final launch

1. Everything in §1–§7 is done for **production**.
2. Enforce App Check (F6) once its metrics are clean.
3. Upload the AAB to Play (internal testing → production) and the IPA to TestFlight → App Store review.
4. Watch the Monitoring alerts for the first 48 hours. The rollback steps are in the release checklist and in `DEPLOYMENT.md` §7.
