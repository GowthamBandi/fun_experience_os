# EXPERIENCE OS: MASTER STATUS

Date: 2026-10-10.

Evidence was gathered live in this session, using:
- the Firebase CLI 15.20.0 as `frameingos@gmail.com`;
- curl against the staging endpoints;
- `git`;
- the local test suites.

This report replaces the 2026-10-01 audit. No secrets appear here.

State ladder:
- **CODE READY:** yes, with one open environment-dependent test (§6).
- **STAGING DEPLOYED:** partly. 44 of 51 functions are live; the 7 payment functions wait on the Razorpay test keys.
- **STAGING CERTIFIED:** no. No device journeys have run on staging.
- **PRODUCTION ACTIVATED:** no. No production project exists (decision D2).
- **PUBLICLY LAUNCHED:** no.

## 1. Repositories (verified)

| Repo | Branch | HEAD | Remote |
| --- | --- | --- | --- |
| PULSE `D:/flutter works/experience_os` | `claude/zen-keller-hrjluw` | `6c1c482` | Pushed, equal to `origin` |
| Backend + console `D:/flutter works/fun_experience_os` | `claude/zen-keller-hrjluw` | this commit's parent `9bbd3c4` | Pushed, equal to `origin` |

- **No newer work exists elsewhere.** The only other remote branch is `origin/claude/zen-brahmagupta-se2svs` (2026-09-29), which predates this line. `main` is untouched in both repos and was not pushed.
- **PULSE `pubspec.lock` is modified locally.** This is a local Flutter 3.44.6 rewrite: `matcher`, `meta`, `test_api` and `vector_math` are downgraded. CI pins Flutter 3.47.5. Never commit it.
- **PULSE stash `stash@{0}`** ("local-sdk generated files before device verification 2026-10-01") is kept.

## 2. Verified test evidence (2026-10-10, current HEADs)

| Suite | Result |
| --- | --- |
| PULSE `flutter analyze` | No issues |
| PULSE `flutter test` | **250 pass**, 13 fail. All 13 are the Linux-canonical goldens, which fail on Windows by design (CI runs them on ubuntu) |
| Backend functions (`jest`, emulators) | **346 / 347** pass, 25 / 26 suites. 1 failure: `I1 occupancy` (§6) |
| Firestore + Storage rules | **56 / 56** |
| Index guard `check:indexes` | 112 declared queries, all served by 51 indexes |
| Release guardrails | Pass |
| Console `apps/operations-web` | Typecheck clean; vitest **346 / 346**; `.next-verify` production build passes; `next lint` reports 0 warnings |

## 3. Staging `experience-os-staging` (#248160728472): verified live

| Item | Evidence |
| --- | --- |
| Project and account | `firebase projects:list` lists it. `.firebaserc` maps `staging` to it |
| Functions | `functions:list` shows **44 live, nodejs22** (39 in asia-south1, 5 in us-central1). On 2026-10-10 all 44 were redeployed from `9bbd3c4` with "Successful update" |
| Functions not deployed (7) | `createPaymentOrder`, `confirmPayment`, `cancelBooking`, `decideRefund`, `razorpayWebhook`, `releaseExpiredHolds`, `onEventCancelled`. They need `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`, all three **missing** (`functions:secrets:get`) |
| Internal secrets | `CODE_PEPPER` and `TICKET_SIGNING_KEY` exist |
| Health | `POST us-central1/checkHealth` returns `ok:true`, `projectId: experience-os-staging` |
| Firestore rules, indexes and Storage rules | Deployed 2026-10-10. Rules were already current. Indexes now include the four `(status ASC, createdAt ASC)` open-work composites |
| Share links (PULSE hosting) | Redeployed 2026-10-10 (11 files). `/` returns 200. `/.well-known/assetlinks.json` returns 200 and is identical to the repo. `/e/<unknown>` returns 404 with the branded page from the `eventPage` function (`Function-Execution-Id` header) |
| App Check | **Enforced** on every callable (`runWith({ enforceAppCheck: !emulator })`). A signed-in user without an App Check token gets `UNAUTHENTICATED` |
| Anonymous access | Firestore REST list of `users`, `bookings`, `payments`, `auditEvents`, `refunds`, `ledgerEntries`, `organizerApplications` and `tickets` returns **403**. Privileged callables without auth return `UNAUTHENTICATED` |
| Signed-in non-staff user (synthetic, deleted afterwards) | Collection lists return 403. Every privileged callable is refused at the App Check gate |

**Not verifiable from this machine:**
- the SMS region policy (no CLI);
- App Check debug-token registration;
- scheduler jobs, backups and monitoring, because `gcloud` is not installed.

Last known state (2026-10-08): the Phone provider is on, and real OTP failed with `17006` until India is allowed in the SMS region policy.

## 4. Completed in this run (2026-10-10)

| Change | Commit | Tests |
| --- | --- | --- |
| Pushed the 4 + 44 local-only commits as backup (feature branch, fast-forward, secret-scanned) | n/a | n/a |
| Medium-safety events showed as "Low intensity" in PULSE: the mapper missed the server value `medium` | PULSE `2c54c71` | Contract test, red then green |
| Checkout's "Release spot" copy while a payment is in flight. Leaving a paid-but-unconfirmed checkout no longer calls `cancelBooking` (before, it could cancel a booking that had just been paid; the server's orphan path then refunded the payment in full) | PULSE `c6d6145` | Widget test |
| Owner listed twice in Staff; staff-invite errors shown off-screen ("silent failure") | PULSE `e62a36a` | Widget tests |
| Plans, the host workspace and Staff now refetch on app resume (lists stale after server decisions) | PULSE `6c1c482` | `refresh_on_resume_test.dart` |
| Console open-work reads (Approvals, badges, Needs-you) read the longest-waiting first, so above 250 open cases the most overdue are no longer dropped. Also: honest truncation copy, a decision sheet that no longer closes mid-submit, and no "Case not found" flash | `50e64b3` | Test with 300 open cases, plus 4 index changes |
| `useDialog` hook dependencies (lint) | `f5515c3` | Lint clean |
| Deleted unused legacy console UI, motion, types and `docs/prototype-evidence/` after an import scan and rebuild | `9bbd3c4` | Typecheck, tests and build re-run |
| No mock or prototype data path in production mode | Code read and grep, no change | n/a |
| Staging deploy: rules, indexes, storage, 44 functions, hosting | Deployed from `9bbd3c4` / PULSE `370c853` hosting | Live probes (§3) |

## 5. Human action required

| # | Action | How |
| --- | --- | --- |
| 1 | **Razorpay TEST keys** (never live) | From `fun_experience_os`, run `firebase functions:secrets:set RAZORPAY_KEY_ID --project staging`, then the same for `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` (hidden prompt), or `scripts/provision-environment.sh staging`. Webhook URL: `https://asia-south1-experience-os-staging.cloudfunctions.net/razorpayWebhook`, events `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed` |
| 2 | **Allow India in the SMS region policy** | Firebase console → Authentication → Settings → SMS region policy → Allow → IN |
| 3 | **Connect the vivo I2127** over USB, with debugging on and unlocked | Needed for every device journey |
| 4 | Install the Google Cloud SDK and run `gcloud auth login` | Needed for backups (`scripts/enable-backups.sh`), monitoring and scheduler checks |
| 5 | Production decisions and accounts | D2 production project, D3 domain, legal placeholders in `legal_documents.dart`, Play Console and upload keystore, Apple (see `HUMAN_FINAL_ACTIVATION_CHECKLIST.md`) |

After #1, deploy the 7 payment functions. Every other required secret is present now, so the guarded `scripts/deploy-backend.sh staging` will run.

## 6. Open defects and risks

| Severity | Item | Evidence and next step |
| --- | --- | --- |
| P2 (verify) | `I1 occupancy` randomized concurrency invariant fails in its concurrent burst phase: `reserveSeat` sees `3 INVALID_ARGUMENT: Transaction is invalid or closed` from the Firestore emulator during the transactional lapsed-hold query (`reserveSeat.ts:348`) | Reproduced 3/3 today, with a deterministic seed. The test and `reserveSeat.ts` are unchanged since 2026-10-01, when it passed in a clean run. That audit recorded the same failure under machine load, and today another session's Android emulator (~3.7 GB) and three other Java emulators were running. The error is an emulator transaction expiry, not an invariant violation. **Next:** rerun on CI or a quiet machine. If it still fails, treat it as a real contention defect and add a bounded retry on `INVALID_ARGUMENT` closed-transaction in `runCommand` |
| P1 (staging) | `releaseExpiredHolds` (the 5-minute sweeper) is not deployed, because it is grouped with the Razorpay-dependent functions | Holds lapse logically, but the occupancy counters aren't swept until it is deployed. Deploy it with #1 |
| P3 | Five unused composite indexes (`check:indexes` "kept, harmless") | Leave as is |
| P3 | Historical docs (`design-qa.md`, ADR-0004, project records) mention the deleted `docs/prototype-evidence` paths | Cosmetic |
| Follow-up | Event "pause sales" needs a backend sales-pause flag. `setMarketplaceEntityStatus` would overwrite the event lifecycle | Product decision |
| Risk | Booking reference is a weaker door credential than the signed QR | It is bounded: valid for its own event only, needs scan permission, rate-limited and audited |
| Risk | Firestore delete protection is disabled on staging | Enable it on production |

## 7. Staging certification

Not yet verified: none of these journeys has run on staging.

| Journey | Blocked by |
| --- | --- |
| Customer: OTP, profile, city, explore, hold, checkout, pass, notifications, share link, cancel/refund, review, offline | #2 SMS region (OTP), #1 Razorpay (checkout and refunds), #3 device |
| Organizer: apply, approve, code, terms, create, submit, publish, event day, attendees, staff, earnings | #3 device. The console also has to be hosted or run locally against staging (needs a reCAPTCHA Enterprise key, F6) |
| Staff: invite, redeem, scope, scan QR/REF, rejection cases, revocation | #3 device and an organizer journey |
| Concurrency and money (holds, webhooks, refunds, settlements) | #1. Covered locally by the emulator suites (§2) |
| Security on staging | Partly verified (§3: anonymous and non-staff denial, App Check enforced). Role-isolation probes beyond the App Check gate need a registered debug token (device run) |

## 8. Production readiness

| Gate | State |
| --- | --- |
| Code ready | ✅ (one environment-dependent test to re-verify, §6) |
| Staging deployed | ⚠️ 44/51 functions, rules, indexes and hosting live; payments wait on #1 |
| Staging certified | ❌ No device journeys yet |
| Production activated | ❌ No production project (D2); signing and stores not set up |
| Publicly launched | ❌ |

## 9. Do not redo

Do not redo any of the following:
- the staging project, Firestore, rules, indexes or hosting deploy (2026-10-10);
- the 44-function deploy from `9bbd3c4`;
- the console redesign (plan `docs/superpowers/plans/2026-10-09-super-admin-console-upgrade.md`, all 20 tasks plus the final review);
- the PULSE defect fixes listed in §4;
- the pushes.

Don't merge `zen-brahmagupta-se2svs` without a deliberate review.

## 10. Next action

Once the owner has set the Razorpay test keys (#1) and allowed India for SMS (#2):
1. `scripts/deploy-backend.sh staging` (deploys the 7 payment functions and the sweeper).
2. Build the staging APK (`--dart-define-from-file=$HOME/pulse-env/staging.android.json --dart-define=APP_CHECK_DEBUG=true`) and install it on the vivo.
3. Register its debug token.
4. Run the customer → organizer → staff journeys and the staging attack probes.
5. Write the staging certification report.
