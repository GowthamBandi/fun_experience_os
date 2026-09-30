# Experience OS — Production Certification

**Date:** 2026-09-30
**Scope:** PULSE mobile app (`exprerience_os`), Operations Console (`fun_experience_os/apps/operations-web`), Firebase backend (`fun_experience_os/firebase`).
**Branch:** `claude/zen-keller-hrjluw` in both repositories.

## Status

# PRODUCTION READY — EXTERNAL ACTIVATION REQUIRED

All the internal engineering this mandate asks for is built and verified locally: code, rules, tests and documentation. Launch still depends on steps only the business owner can take. These are the Firebase projects, Razorpay merchant activation, push and App Check registration, store signing and legal text (§4).

This status is conditional. Production must not be deployed until the full staging run in §5 passes on physical devices. Some paths can't be run in this build environment, and that run is the first time they are exercised against real services (§3).

---

## 1. What was verified, with evidence

All results below come from runs on 2026-09-30, on the final commits.

| Area | Command | Result |
| --- | --- | --- |
| Backend unit, integration, E2E and attack tests | `firebase emulators:exec -c firebase.verify.json --only firestore,auth "npm --prefix firebase/functions test"` | **222 / 223 pass.** The one failure is `checkHealth` (see §3.1). |
| Firestore and Storage security rules | `firebase emulators:exec … --only firestore,storage "npm --prefix firebase/firestore test"` | **54 / 54 pass** |
| Backend typecheck | `npx tsc -p tsconfig.test.json --noEmit` | clean |
| Console | `npm run typecheck`, `npm run lint`, `npx vitest run`, `npm run build`, `npm run smoke` | typecheck clean; lint has 0 errors (warnings only in the archived prototype); **51 / 51 tests**; build OK; smoke OK (fails closed when misconfigured) |
| PULSE | `flutter analyze`, `flutter test`, `flutter build web --release` | **0 issues; 133 / 133 tests; release build OK.** Golden images unchanged. |

### 1.1 End-to-end journeys (backend, emulator)

- **J1 Organizer:** apply → KYC approval (code shown once) → redeem → commercial terms → experience → events published.
- **J2 Customer:** profile → reserve → server-created order → signature-verified confirm → tickets, ledger and notification. A webhook replay is a no-op.
- **J3 Staff:** invite scoped to one event → code shown once → phone-bound redeem → scan → scope and money walls hold → revoke takes effect immediately.
- **J4 Completion and money:** live → completed → reviews → settlement reconciles with the ledger → dual-control payout.
- **J5 Cancellation:** cancelling an event refunds every confirmed booking exactly once, idempotently.

### 1.2 Attack suite (all pass)

| ID | Attack | Outcome |
| --- | --- | --- |
| ATK-01 | Customer calls organizer, staff or admin services | refused, no side effects |
| ATK-02 | Organizer A acts on organizer B's event, experience or staff | refused, no side effects |
| ATK-03 | Staff grant themselves or others more than they hold | refused |
| ATK-04 | Forged QR: edited id, edited signature, signature minted for another event | `invalid`; another event's ticket gives `wrong-event` |
| ATK-05 | Reused QR | `already-used`; the first check-in is never overwritten |
| ATK-06 | Duplicate booking via parallel requests | exactly one live booking |
| ATK-07 | Oversell: 25 parallel customers, 5 seats | never more than 5 admitted |
| ATK-08 | Forged payment signatures | refused; nothing captured |
| ATK-09 | Client-supplied amounts, or an under-paid signed capture | ignored; never confirms |
| ATK-10 | Organizer approves their own refund | impossible (request only) |
| ATK-11 | One admin double-approves a refund over ₹10,000 | refused; a second admin completes it once |
| ATK-12 | Invalid, stolen, expired, superseded or reused organizer/staff codes | refused |
| ATK-13 | Code brute force | 5 misses lock the uid for 1 h; 10 misses lock the invite |
| ATK-14 | Revoked staff replay an old requestId | `NOT_PERMITTED`, including catalog commands. This was fixed during the run: authorization now happens before the receipt is replayed. |
| ATK-15 | Publish without approvals, terms or an active organizer | refused; no commission snapshot |
| ATK-16 | Change price, time or venue after bookings exist | refused |
| ATK-17 | Review by a non-participant, no-show, or the organizer's own staff or owner | refused; the attendee may review |
| CTRL-18 | Settlement under ₹50,000 | one admin may approve and pay; organizers never |
| LEAK | Plaintext organizer or staff code in any stored document | none found |

A separate test covers commercial terms. The proposer can't approve their own terms, pending terms don't unlock publishing, and approving new terms supersedes the old version without rewriting already-published events.

## 2. Mandate coverage

| Requirement | Where it is implemented |
| --- | --- |
| One PULSE app for customer, organizer and staff; phone + OTP | `AccessGate` after OTP routes by server-side memberships (`myAccess`) |
| Organizer activation: Super Admin approval + one-time Organizer Code | `decideCase` (organizer-kyc) issues an HMAC-stored code; `redeemOrganizerCode`; `reissueOrganizerCode`. ADR-0004 |
| Staff via Staff Access Code; WHAT×WHERE permissions; immediate revocation | `inviteStaff` / `redeemStaffCode` (phone-bound) / `updateStaff` / `revokeStaff`. Permissions are re-read on every command and in rules (`can`, `canOrgWide`). |
| Every event has a responsible organizer | Responsibility invariant is checked on save, publish and staff changes (`assertResponsibility`) |
| Experience ≠ event ≠ booking ≠ ticket | ADR-0003 canonical model |
| Reviews only by participants (server-enforced) | `submitReview` checks for a checked-in ticket on a completed event; ATK-17 |
| Signed QR tickets | `PX1.<ticketId>.<HMAC>`, key in Secret Manager; `scanTicket` and the audited `checkInManually` |
| No oversell; hold expiry | Transactional occupancy counters; `releaseExpiredHolds` every 5 min; ATK-06/07; concurrency suite |
| Razorpay with server verification, webhooks, idempotency | `createPaymentOrder` / `confirmPayment` (HMAC signature) / `razorpayWebhook` (signature + event dedupe) |
| Integer money; auditable balanced ledger; refunds; settlements; dual control | `ledgerEntries` append-only in paise. Refunds need dual control above ₹10k, settlements above ₹50k, and commercial terms always. ADR-0005 |
| Commercial terms before any money moves | `proposeCommercialAgreement` / `decideCommercialAgreement`; Console → Commercial terms |
| Organizer can publish from the app | PULSE host workspace Publish button (`events.publish`) calls `publishEvent` |
| Notifications | `userNotifications` inbox is the source of truth; FCM push best-effort with an honest `push.status` |
| Audit | `writeAudit` in the same transaction as every privileged change |
| Privacy | Attendee lists are built field by field (no uid, phone, age or gender); codes are stored only as HMACs; storage writes are write-once |
| Environment separation; fail closed | PULSE `PulseConfig` refuses demo projects in staging/prod, mismatched project names, and debug App Check in production. Console `verify-production-env.mjs`. Backend `isEmulator` can't be spoofed when deployed. |
| App Check | Enforced by every deployed callable. PULSE activates Play Integrity / App Attest; the console uses reCAPTCHA Enterprise. |
| Docs, ADRs, obsolete marking | ADR-0003…0006, `API_CONTRACT.md`, `ARCHITECTURE.md`, runbook; ~30 superseded docs carry an OBSOLETE banner |

## 3. What is not proven here

### 3.1 Limits of this environment

- **Firestore triggers were not run as triggers.** The Functions emulator can't register Firestore triggers in this sandbox: its call to the emulator hub is blocked by the network proxy (`"request bl…" is not valid JSON`).
  - Affected: `deliverNotifications`, `onEventCancelled`, `onExperienceRevisionApproved`, and the `checkHealth` callable test.
  - Their logic is tested by calling the services directly. The trigger wiring is only proven on staging.
- **Native builds were not compiled.** There is no Android SDK or Xcode here, so `appbundle` / `ipa` builds, Play Integrity, App Attest and FCM on device are unverified. The web release build compiles.
- **The PULSE Firebase repositories were not run against a live backend.** They are verified by contract tests: every payload is checked against the server's own parsers and mapping formulas. They were not run against a running emulator from a device.
- **Razorpay and FCM were not exercised live.** Payments ran through the `EmulatorProvider`, which only activates under the emulator. Push records `skipped-emulator` / `no-device` rather than claiming delivery.

### 3.2 Known product limits (documented, deliberate)

- A host can't withdraw a submitted listing; they contact support. There is no backend delete for server-side drafts.
- In Firebase mode, event-day teams, the safety checklist and wrap-up are kept on the device only and labelled so. Check-ins can't be undone from the app.
- The name of the responsible person shows as "Team member" or "You" to staff without `staff.manage`.
- Outside the policy window, a customer cancellation refunds 0%. Exceptions go through an organizer `requestRefund` and an admin decision.
- Console lint warnings exist only in the archived company-operated prototype (ADR-0006), which isn't routed in production.

## 4. External activation required (owner actions)

These can't be done or faked by engineering. Detail is in `docs/runbooks/ENVIRONMENTS_AND_DEPLOYMENT.md` §2–3.

| # | Action |
| --- | --- |
| E1 | Create the staging and production Firebase projects (Blaze plan); add the `.firebaserc` aliases |
| E2 | Phone Auth; Android SHA-256 fingerprints; iOS APNs; register Play Integrity and App Attest for App Check |
| E3 | Razorpay merchant KYC; live mode; Route (for settlement payouts) |
| E4 | Razorpay webhook pointed at `razorpayWebhook`, with its secret |
| E5 | FCM / APNs keys for push |
| E6 | Play Console and App Store Connect apps; signing keystore and certificates |
| E7 | reCAPTCHA Enterprise site key for the console |
| E8 | Legal: terms, privacy policy, refund policy, DPDP Act 2023 notices |
| S1 | Set the secrets `CODE_PEPPER`, `TICKET_SIGNING_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`. The backend fails closed without them. |
| S2 | Create the first platform owner with `npm run bootstrap:platform-owner` (guarded, runs once; tested on the emulator), then a second admin from the console. Two are needed, because dual control needs two people. |

No credential, project id, key or approval was invented for this certification. None of them are in either repository.

## 5. Launch gate (mandatory before production deploy)

1. Complete E1–E8, S1 and S2 for **staging**.
2. Deploy to staging (runbook §4). Build PULSE release builds for Android and iOS with `PULSE_ENV=staging`.
3. Run every smoke step in runbook §6 on physical devices, with Razorpay test mode:
   - OTP;
   - organizer approval and code;
   - commercial terms by two admins;
   - create → approve → publish;
   - book and pay;
   - webhook;
   - push received;
   - staff scan (`checked-in`, then `already-used`);
   - cancellation refund;
   - completion and review;
   - settlement reconciliation.
4. Confirm the Firestore triggers fire:
   - a notification gets `push.status = sent`;
   - an event cancellation refunds automatically.
5. Only then repeat for production with live keys.

If any step fails, the status drops to **NOT PRODUCTION READY** until it is fixed and re-verified.

## 6. Commits in this closure pass

- `fun_experience_os`:
  - `2510cd5`: catalog authorizes before replay; manual check-in; attendee list; E2E and attack suites.
  - `31cbc57`: commercial terms with dual control, and the console workspace.
  - Plus: the guarded first-platform-owner bootstrap script, corrected `test:rules` / `test:functions` emulator lists, the runbook update and this certification.
- `exprerience_os`:
  - `8ee0786`: real Firebase host workspace.
  - `10cd625`: Publish.
  - `e746cf1`: App Check activation.
