# Experience OS — Final Production Readiness

**Date:** 2026-09-30

**Scope:**
- PULSE app (`exprerience_os`)
- Operations Console (`fun_experience_os/apps/operations-web`)
- Firebase backend (`fun_experience_os/firebase`)

**Branch:** `claude/zen-keller-hrjluw`, in both repositories.

**Supersedes:** `EXPERIENCE_OS_PRODUCTION_CERTIFICATION.md`

**Owner actions:** [`HUMAN_FINAL_ACTIVATION_CHECKLIST.md`](HUMAN_FINAL_ACTIVATION_CHECKLIST.md)

## Final status

# READY FOR HUMAN ACTIVATION

All engineering work that doesn't need the owner's accounts, credentials, money, legal authority or devices is complete and verified: code, rules, indexes, CI, release configuration, runbooks and scripts. What remains is in the activation checklist.

Launch is gated on the staging device run in checklist §7. That run is the first contact with real Google, Apple and Razorpay services.

---

## 1. Engineering

### Code status

Every known gap found in this pass was fixed and has a regression test:
- two rounds of adversarial review;
- an index audit;
- invariant and failure-mode suites;
- the first real CI runs.

Nothing Claude-owned is open. Genuine limitations are listed in §8.

### Tests

These are the results of the latest runs.

| Suite | Where | Result |
| --- | --- | --- |
| Functions: unit, integration, E2E journeys, attack suite, invariants, failure modes, retention, logging | local emulators | **308 / 309**. The one failure is `health.test.ts`: this sandbox's network proxy stops the Functions emulator from starting (environment-owned; it passes in CI). |
| Functions, same suite **with the Functions emulator running** (so Firestore triggers really fire) | GitHub Actions | **all pass**, including `checkHealth` and the live `onEventCancelled` / `onExperienceRevisionApproved` triggers |
| Firestore and Storage rules | local + GitHub Actions | **56 / 56** |
| Index coverage (`npm run check:indexes`) | local + GitHub Actions | **52 declared queries all served** (24 composite indexes) |
| Release guardrails (secrets, signing files, env files, aliases) + gitleaks | local + GitHub Actions | pass |
| Console: typecheck, lint, unit, build, smoke (headers, CSP, fail-closed login) | local + GitHub Actions | **109 / 109**, build OK, smoke OK |
| PULSE: format, analyze (`--fatal-infos`), tests incl. canonical Linux goldens | local + GitHub Actions | **174 / 174**, 0 issues |
| PULSE builds: web release, **Android debug APK** | GitHub Actions | pass |
| PULSE Android **release bundle** (R8, keep rules, release signing, merged manifest) with a throwaway CI key; a release build without signing must fail | GitHub Actions | **pass** (both) |
| Production dependency audit (high/critical fail CI) | local + GitHub Actions | console: 0 vulnerabilities. Functions: 0 high/critical; 9 moderate from one `uuid` advisory inside Google libraries, on a code path our code doesn't use. |

### 1.1 CI evidence (GitHub Actions)

- **Backend and console** (`fun_experience_os`), run [36751007334](https://github.com/GowthamBandi/fun_experience_os/actions/runs/36751007334) on `f7538da`:
  - guardrails + gitleaks + index coverage ✔
  - functions (typecheck, build, audit, full suite on emulators incl. triggers) ✔
  - rules ✔
  - console (typecheck, lint, tests, audit, build, Playwright smoke) ✔
- **PULSE** (`exprerience_os`), run [36749519799](https://github.com/GowthamBandi/exprerience_os/actions/runs/36749519799) on `9aaf444`:
  - guardrails + gitleaks ✔
  - format, analyze, tests incl. Linux goldens ✔
  - web release + Android debug APK ✔
  - Android release AAB (R8) + unsigned-release refusal ✔

The first real CI runs found problems that the sandbox couldn't show:
- three tests that raced the live Firestore triggers;
- a missing Playwright browser on the runner;
- a gitleaks permission for pull-request runs.

All are fixed. The trigger races were in the tests, not the product: each confirmed that the direct call and the trigger split the work exactly once.

### Security

Enforced server-side and tested:
- phone+OTP identity;
- organizer activation by Super Admin approval plus a one-time Organizer Code (stored only as an HMAC);
- staff by phone-bound Staff Access Code with WHAT×WHERE permissions and immediate revocation;
- authorization before idempotent replay;
- tenant isolation;
- signed QR tickets;
- no oversell under parallel load;
- server-computed amounts and signature-verified payments;
- an append-only balanced ledger;
- dual control on refunds above ₹10,000, on settlements above ₹50,000, and on every commercial-terms change;
- participant-only reviews;
- rate limits on every abusable callable;
- App Check enforced on every deployed callable;
- security headers and CSP on the console.

**Privacy:**
- Commission terms moved off the public event document.
- Reviews (which carry the author's uid) are private.
- Attendee lists never expose uid, phone, age or gender.
- Logs redact phone numbers and secrets.

### Architecture

The architecture is unchanged. See `docs/ARCHITECTURE.md`, the ADRs `docs/adr/ADR-0003…0006` and `docs/API_CONTRACT.md`.

### Deployment

| Tool | What it does |
| --- | --- |
| `scripts/provision-environment.sh` | APIs, Firestore, internal secrets, and Razorpay key entry with live/test guards |
| `scripts/deploy-backend.sh` | refuses a dirty tree, missing secrets, wrong aliases; typed confirmation for production |
| `scripts/enable-backups.sh` | PITR + daily backups |
| `firebase/scripts/create-log-metrics.sh`, `create-alert-policies.sh` | 13 log metrics, 15 alert policies |
| `npm run bootstrap:platform-owner` | first owner; refuses once one exists |
| App Hosting config for the console | `apps/operations-web/apphosting*.yaml`, `DEPLOYMENT.md` |

## 2. PULSE

- **Production readiness:**
  - One app for customers, organizers and staff.
  - Firebase repositories for every feature. The demo is reachable only with `PULSE_ENV=demo`; a release mobile build without `PULSE_ENV` refuses to start.
  - App Check activates in staging and production.
  - Push: registration, tap routing by link, foreground notices, token removal on sign-out.
  - The session follows Firebase auth.
  - Razorpay checkout times out with the seat hold.
  - The host workspace runs on the real backend, including Publish.
- **Release readiness:**
  - Android: app id `app.pulse.experience` (owner to confirm) and release signing from `key.properties`, with no debug fallback.
  - Android: R8, minimal permissions, notification channel and icon, and the google-services plugin applied when the environment's file is present.
  - iOS: minimum 15.0 with Podfile, entitlements (APNs, App Attest), camera and background-notification keys.
  - Exact build commands: `exprerience_os/docs/RELEASE_CHECKLIST.md`.

## 3. Operations Console

- **Production readiness:**
  - Firebase config is compiled into the build correctly (fixed a blocker that left every deployed build unconfigured).
  - The role→capability map mirrors the backend, with parity tests.
  - Auditors are read-only.
  - Email-verification flow for new operators.
- **Screens:**
  - approvals with a one-time code;
  - refunds, settlements, emergency cancel, reviews;
  - commercial terms (dual control);
  - Operator access;
  - Legal holds;
  - System health (job runs);
  - audit with filters and paging.
- **Environment:** a badge shows the environment, and the pre-build check refuses mismatched or placeholder configuration.

## 4. Backend

- **Callables:** all documented in `API_CONTRACT.md`.
- **Scheduled jobs:**
  - holds sweep and refund retries, every 5 min, time-boxed;
  - event reminders, every 15 min, bounded;
  - data retention, daily, bounded, resumable, legal-hold aware.
- **Triggers:** event cancellation (per-booking isolation, retry, risk alerts), approved revisions and push delivery.
- **Observability:** structured logs, `jobRuns` summaries, and alert definitions.

## 5. Firebase: prepared vs activated

| Item | Prepared | Activated |
| --- | --- | --- |
| Projects, billing, aliases | template, guardrails | ✗ owner (F1–F2) |
| Firestore rules, indexes, Storage rules, Functions | complete, tested | ✗ owner runs `deploy-backend.sh` (F9) |
| Auth providers and domains | code uses Phone + Email/Password | ✗ owner (F4) |
| App Check | code activates / enforces | ✗ owner registers providers (F6) |
| FCM / APNs | full token lifecycle and routing | ✗ owner uploads APNs key (F7) |
| Backups | script + runbook | ✗ owner runs the script (F8) |
| Monitoring | metric and policy scripts | ✗ owner creates one channel, runs the scripts (F12) |
| Console hosting | App Hosting config | ✗ owner creates the backend and domain (F13) |

## 6. Payments

Live payment activation is explicitly out of scope. Everything around it is built and tested against the test-mode provider:
- the order lifecycle;
- signature verification;
- the idempotent webhook;
- the refund state machine;
- the ledger;
- settlements with dual control;
- commercial terms;
- reconciliation rules;
- failure and retry handling.

What remains is owner-only, in checklist §4:
- Razorpay KYC and live mode;
- Route;
- entering keys;
- registering the webhook;
- performing payouts.

## 7. External dependencies

| Dependency | Status |
| --- | --- |
| FCM | code complete; APNs key and a device test pending (owner) |
| Play Integrity | code complete; provider registration and SHA-256 pending (owner) |
| App Attest | entitlement and code complete; Apple capability pending (owner) |
| Razorpay | integration complete; merchant activation pending (owner) |
| Domains | console domain choice and DNS (owner) |
| Signing | Android upload keystore; Apple team and certificates (owner) |
| Store publishing | Play Console and App Store Connect records, listings, review (owner) |

## 8. Known limitations (genuine, documented)

**Not buildable or runnable in the engineering sandbox:**
- iOS builds (no Xcode). Android builds are proven in CI.
- Push, App Check and Razorpay against real services. These are covered by the staging device gate.

**Product scope, all communicated in the UI:**
- Hosts can't withdraw a submitted listing; they contact support.
- Event-day teams and the safety checklist are on-device only.
- A check-in can't be undone from the app.

**Launch scale:**
- Reminders cover up to 200 events starting within 24 hours per 15-minute run.
- KYC purge covers only rejected applicants; offboarding approved organizers isn't built yet.

**Other:**
- The launcher icons and splash are Flutter defaults until brand art is supplied (owner, D4).
- An unused `flutter create` scaffold sits at the backend repo root. Deleting it was blocked by the permission system in this session; that decision is left to the owner (D5).

## 9. Human actions

Only the actions in [`HUMAN_FINAL_ACTIVATION_CHECKLIST.md`](HUMAN_FINAL_ACTIVATION_CHECKLIST.md): decisions D1–D5, Firebase F1–F13, Google Play G1–G4, Apple A1–A4, Razorpay R1–R4, domains, legal, the device gate and launch.

## 10. CI runs referenced

See §1.1.
