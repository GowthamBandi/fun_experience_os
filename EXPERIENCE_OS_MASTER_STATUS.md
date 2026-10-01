# EXPERIENCE OS — MASTER STATUS

Date: 2026-10-01. Audit by a fresh session, from live evidence first (Firebase CLI as `frameingos@gmail.com`, adb), then the repositories, then the earlier reports. No secrets appear here.

State ladder: **CODE READY** (yes) ≠ **STAGING READY** (no, blocked on Blaze) ≠ **PRODUCTION ACTIVATED** (no; no production project exists, owner decision D2) ≠ **PRODUCTION LAUNCHED** (no).

## 1. VERIFIED COMPLETE

| Item | Evidence |
| --- | --- |
| 🟢 Repositories in sync, nothing lost | PULSE `D:/flutter works/experience_os` and backend `D:/flutter works/fun_experience_os` are both on `claude/zen-keller-hrjluw` and equal to `origin` (`git status -sb`, after `git fetch --all --prune`). Clean trees at the start. Local `main` untouched (PULSE `c64f7ce`, backend `0029c9e`) |
| 🟢 No newer work in another branch | The only other remote branch is `origin/claude/zen-brahmagupta-se2svs` (`e4ddce2`, 2026-09-29). It forks from `c116971`, the same root as the certified line, and predates it. The certified line (`0029c9e` → `e29f59f` → `2cbddcd`, 2026-09-30/10-01) is newer. Recorded here, not merged, nothing overwritten |
| 🟢 Six physical-device fixes present | `daf9aef`, `aaea718` and `d27b0e3` are in PULSE `HEAD` (`git log`) |
| 🟢 Staging project exists and is administered by this account | `firebase projects:list` → `Experience OS Staging │ experience-os-staging │ 248160728472` |
| 🟢 Firestore `(default)`, asia-south1 | `firebase firestore:databases:get "(default)"` → `FIRESTORE_NATIVE`, `STANDARD`, Location `asia-south1` |
| 🟢 Firestore rules deployed and current | `firebase deploy --only firestore:rules` → "latest version … already up to date, skipping upload" |
| 🟢 Firestore indexes deployed (24 of 24 at audit) | `firebase firestore:indexes` compared with `firebase/firestore/firestore.indexes.json`: identical apart from Firestore's implicit `__name__` suffix |
| 🟢 Android and console apps registered | `firebase apps:list` → `PULSE (staging)` `1:248160728472:android:b80c88961944ea451727ed`; `Operations Console (staging)` `1:248160728472:web:5b148ef6bac13c121727ed` |
| 🟢 PULSE staging configuration | `~/pulse-env/staging.android.json` has `PULSE_ENV=staging` and `FIREBASE_PROJECT_ID=experience-os-staging`. `android/app/google-services.json` (gitignored) has `project_id` `experience-os-staging` |
| 🟢 Console tests | `apps/operations-web`: `tsc --noEmit` clean; `vitest run` 14 files, **109/109** |
| 🟢 PULSE tests | `flutter analyze` → no issues; `flutter test` 170 pass. The only failures are the 13 Linux-canonical goldens, which fail identically on untouched `HEAD` (see §7) |
| 🟢 Backend functions suite (with the REF fix) | `npm run test:functions` → **313/313**, 24/24 suites (clean rerun; see §7 for one load-sensitive run) |
| 🟢 Firestore and Storage rules | `npm run test:rules` → **56/56** |
| 🟢 Index guard | `check:indexes` → 53 declared queries (23 need composites), all served by 25 indexes |
| 🟢 Real device attached | `adb devices` → `13862699800009T device` (vivo I2127, Android 14) |

## 2. VERIFIED PARTIALLY COMPLETE

| Item | Evidence |
| --- | --- |
| Authentication | Email/Password is on (activation report). **Phone is off**: `accounts:sendVerificationCode` with the staging web key → `OPERATION_NOT_ALLOWED` |
| App Check | The staging build uses the debug provider and issues a token on the phone (activation report). Registration and enforcement aren't done. Firebase CLI 15.20 can't read App Check config, so this wasn't re-verified live |
| PULSE on staging | A staging debug APK launched and initialized Firebase for `experience-os-staging` (activation report). No journey can run until Functions exist |

## 3. AUTOMATICALLY COMPLETABLE

| Item | Status |
| --- | --- |
| 🔵 Fix the door "Enter code" defect (§6) | **Done in this session** (backend plus PULSE, tests first) |
| 🔵 Deploy the new `tickets (eventId, reference)` index to staging | **Done in this session**, after commit |
| 🔵 Everything after Blaze: secrets (`CODE_PEPPER`, `TICKET_SIGNING_KEY`), `scripts/deploy-backend.sh staging`, Storage rules, scheduler, `bootstrap:platform-owner`, synthetic data, staging APK, device journeys, staging attack suite, refunds, settlements, notifications | Waiting on §4 |

## 4. HUMAN ACTION REQUIRED

Each item was checked live. None has a CLI or API path from this machine.

| # | Action | Proof it's still needed |
| --- | --- | --- |
| 1 | 🟡 **Upgrade `experience-os-staging` to Blaze** (set a budget alert): console.firebase.google.com/project/experience-os-staging/usage/details | `firebase functions:secrets:access` → "must be on the Blaze (pay-as-you-go) plan … secretmanager.googleapis.com can't be enabled" |
| 2 | 🟡 Storage → **Get Started** (asia-south1) | `firebase deploy --only storage --dry-run` → "Firebase Storage has not been set up" |
| 3 | 🟡 Authentication → enable **Phone**, add staging test numbers | `OPERATION_NOT_ALLOWED` (above) |
| 4 | 🟡 Install the Google Cloud SDK and run `gcloud auth login` (needed by `provision-environment.sh`, monitoring and backups) | `which gcloud` → not found |
| 5 | 🟡 Razorpay **TEST** key id, key secret and webhook secret, entered through the hidden prompt in `scripts/provision-environment.sh staging` (never live keys) | No Razorpay values on this machine; secrets can't be stored before #1 |
| 6 | 🟡 App Check → register the phone's debug token (logcat at launch) | No CLI command; not registered according to the activation report |
| 7 | 🟡 Later launch work: upload keystore and Play Console (G1–G4); monitoring channel (F12); App Hosting and GitHub (F13); iOS needs Apple Developer + Xcode | `android/key.properties` and `*.jks` are absent |

## 5. EXTERNAL BLOCKERS

```text
BLOCKER: Spark plan on experience-os-staging
BLOCKS: Secret Manager, Cloud Functions, Cloud Scheduler, Storage bucket, backups,
        therefore every customer/organizer/staff journey, payments, notifications,
        refunds, settlements and the staging attack suite.
CLEARED BY: §4 #1 (owner, Firebase console).
```

## 6. ACTUAL PRODUCT DEFECTS

| Defect | Status |
| --- | --- |
| ❌→🟢 **Door "Enter code" fallback rejected the REF printed on the pass.** Root cause: the pass showed a client-made `PLS-` + the first 5 characters of the booking id, uppercased. The server never stored it, and `scanTicket` accepts only signed `PX1.` payloads, so every typed REF was `invalid` | **Fixed** (this session). Server: `reserveSeat` creates a random `PLS-XXXXXX` reference (no 0/O/1/I/L) and copies it onto each ticket. `scanTicket` keeps the QR path unchanged; any other input is parsed as a reference, looked up among *this event's* tickets only, and admits the next valid spot. It uses the same permission check, rate limit, transaction and audit, plus `checkInMethod: "reference"`. PULSE: the pass already prefers the server `reference`. Each typed entry gets its own request id, so a party of two types it twice. Tests: 4 new backend tests, 2 new PULSE tests |
| P2/P3 items from the device run (list refresh, draft fields lost on restart, "Release spot" copy, owner listed twice, silent invite failure, alignment) | Unchanged; classified as non-blocking in `EXPERIENCE_OS_STAGING_ACTIVATION_REPORT.md` |

## 7. ENVIRONMENT / MACHINE ISSUES

| Issue | Evidence |
| --- | --- |
| ⚠️ 13 PULSE goldens fail on Windows | They fail identically with the working tree reset to `HEAD`. CI defines goldens as canonical on `ubuntu-latest` (`.github/workflows`). Not a product defect |
| ⚠️ `gcloud` not installed | `which gcloud` |
| ⚠️ The local Flutter SDK rewrites the plugin registrants | Restored before commit; never committed |
| ⚠️ `check:indexes` default `PULSE_DIR` is `../exprerience_os` (the GitHub repo name), not the local folder | Run with `PULSE_DIR="D:/flutter works/experience_os"` |
| ⚠️ `I1 occupancy` (randomized concurrency invariant) failed once | It failed once while `flutter test` and an unrelated project's emulator run (`demo-nearingo-test`) shared the machine, and passed in the clean full rerun (313/313). The test doesn't touch the changed fields. Rerun in isolation if it recurs |
| ⚠️ `checkHealth` certification failure (222/223 at certification) | Known Functions-emulator limitation, recorded in `EXPERIENCE_OS_PRODUCTION_CERTIFICATION.md`. Not reproduced in today's run |

## 8. SECURITY / PRODUCTION RISKS

| Risk | Note |
| --- | --- |
| The staging attack suite has never run against staging | Emulator only so far; needs Functions (Blaze) |
| App Check not enforced on staging | Enforce after the debug token is registered and journeys pass |
| Booking reference is a weaker door credential than the signed QR | It is bounded: 31⁶ ≈ 887M values, valid at its own event only, needs `tickets.scan` for that event (fresh membership read, so revocation applies at once), counts against the 120-per-window scan limit, and every miss is audited. `checkInManually` by ticket id already allows signature-less check-in for staff with `attendees.view` |
| Firestore delete protection is disabled on staging | `DELETE_PROTECTION_DISABLED`; enable it for production |
| Bookings created before this change have no `reference` | Only emulator data exists; no staging or production bookings |

## 9. DO NOT REDO

Do not redo: the staging project, Firestore (asia-south1), rules, the 24 original indexes, the Android and web apps, debug SHAs, Email/Password auth, `.firebaserc`/`firebase.json` pinning (`2a84006`), the six device fixes, the production certification work (`0029c9e`, `e29f59f`), the activation report and checklist, or the staging defines and `google-services.json`. Do not merge `zen-brahmagupta-se2svs` without a deliberate review; it predates the certified line.

## 10. NEXT AUTONOMOUS ACTIONS (after §4 #1–#3, #5)

1. `provision-environment.sh staging` → secrets (owner types the Razorpay test keys).
2. `scripts/deploy-backend.sh staging` → Functions, Storage rules, scheduler.
3. `npm run bootstrap:platform-owner`; synthetic organizer, staff and customer accounts.
4. Staging APK on the vivo I2127; customer, organizer and staff journeys (checklist §7), including the six device-fix regressions and the new REF entry at the door.
5. Staging attack suite; Razorpay test payments, refunds, settlements, notifications; monitoring and backups (need `gcloud`).
6. Staging certification report.

## 11. FINAL LAUNCH GATES

| Gate | State |
| --- | --- |
| Code ready | ✅ |
| Staging ready | ❌ Blaze, Storage, Phone auth, Razorpay test keys, then the journeys |
| Production activated | ❌ No production project (D2); keystore and Play Console (G1–G4) |
| Production launched | ❌ |
