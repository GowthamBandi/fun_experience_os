# Blocker Log

Active impediments. Each entry records what is blocked, the evidence, and who
must resolve it. Nothing here is aspirational — every entry was verified against
the repository or the live tooling on the date shown.

| ID | Severity | Owner | Status | Summary |
|---|---|---|---|---|
| BLOCKER-001 | P0 | **Human** | OPEN | No Firebase project exists for this platform |
| BLOCKER-002 | P0 | Engineering | RESOLVED 2026-09-29 | 20 of 39 prototype state slices are discarded on reload |
| BLOCKER-003 | P0 | Engineering | RESOLVED 2026-09-29 | Safety authorization keyed to roles that do not exist |
| BLOCKER-004 | P1 | Engineering | RESOLVED 2026-09-29 | No sweeper releases expired reservation holds |
| BLOCKER-005 | P0 | Engineering | RESOLVED 2026-09-29 | Participant page forges the privileged-access audit trail |
| BLOCKER-006 | P1 | Engineering | RESOLVED 2026-09-29 | Emergency mode on live sessions is denied for every role |
| BLOCKER-007 | P1 | **Human** | OPEN | Payment provider unselected (`DEC-SA-029`) |

---

## BLOCKER-001 — No Firebase project exists for this platform

**Severity:** P0 · **Owner:** Human (Engineering Authority) · **Opened:** 2026-08-22

**Blocks:** every deployment, live Auth, live Firestore, rules deployment,
Storage, App Check, backups, staging/production separation. Mission 4 cannot be
completed as written.

**Evidence:**

- `.firebaserc` names `demo-experience-os` under the `development` alias. The
  `demo-` prefix is the Firebase convention for an **emulator-only** project ID
  that never exists in the cloud; the emulator confirms this on startup:
  *"Detected demo project ID … attempts to access non-emulated services for this
  project will fail."*
- `firebase projects:list` (authenticated as `frameingos@gmail.com`) returns 8
  projects: `alphasystem-c6dac`, `ehm-platform`, `flutter-ai-playground-c53e7`,
  `nearingo-877fe`, `temple-seva-platform`, `trainersarena-website`,
  `trainershq-f5ded`, `trainershq-staging`. **None** corresponds to this
  platform.

**Therefore:** the campaign premise "BACKEND: Existing Firebase project" does not
hold. There is no existing project to audit, harden or deploy to.

**Impact on autonomous work: none, for now.** The entire backend is being built
and verified against the Firebase Emulator Suite, which is the correct
development path regardless. Work continues.

**Decision required from the human — see PRODUCTION_STATUS.md §Decisions Required.**

---

## BLOCKER-002 — 20 of 39 prototype state slices are discarded on reload

**Resolved 2026-09-29.** `lib/prototype/persistence/index.ts` now restores every slice of `PrototypeState` (42 incl. operators, governance, activityLog) from a versioned IndexedDB envelope and runs `lib/prototype/migrations.ts` on load. Test: `persistence.test.ts`.

**Severity:** P0 · **Owner:** Engineering · **Opened:** 2026-08-22

**Evidence:** `apps/operations-web/lib/prototype/persistence/index.ts` writes the
whole state object but its `SLICES` array lists only 19 of the 39 fields in
`PrototypeState` (`lib/prototype/scenarios/state.ts`). Verified programmatically.
Discarded on every refresh: `payments`, `refunds`, `temporaryIdentities`,
`identityPatterns`, `teams`, `teamAssignments`, `checkInRecords`,
`emergencyAccessLogs`, `liveSessionStates`, `activitySegments`, `segmentResults`,
`liveOperationalNotes`, `equipmentCheckItems`, `sessionCompletionSnapshots`,
`tournamentMatches`, `evidenceItems`, `disputes`, `moderationCases`,
`moderationActions`, `refundExceptions`.

**Consequences:** everything built in milestones P2E–P2H is single-session only;
state becomes internally inconsistent (a booking persists while its payment
record vanishes); and the cumulative over-refund guard in
`validateRefundEligibility` resets, so the same booking can be refunded
repeatedly across reloads.

**Resolution path:** superseded by the Firestore migration — the client stops
being the store. Until the migration reaches each module, the defect is live in
every demo. Interim fix is one line and should be taken.

---

## BLOCKER-003 — Safety authorization keyed to roles that do not exist

**Resolved 2026-09-29.** `lib/safety/access.ts` is a typed matrix over the real `RoleId` union, enforced again inside every safety/dispute/moderation service with territory scope; buttons explain refusals. Tests: `lib/safety/access.test.ts`, `services/safety.test.ts`.

**Severity:** P0 · **Owner:** Engineering · **Opened:** 2026-08-22

**Evidence:** `apps/operations-web/lib/safety/access.ts` gates thirteen actions
against `hq-operations`, `territory-manager` and `lead-coordinator` — none of
which are members of the `RoleId` union in `lib/types.ts`. `super-admin` and
`safety` (the Safety & Moderation Officer) appear in **no** allow-list.

**Consequence:** the Safety Officer cannot triage, assign, escalate or close an
incident. The failure is silent — handlers `return` with no message, so the
button stays enabled and the click does nothing. Three handlers (reject
moderation action, reject refund exception, attach evidence) have no check at all.

**Not caught by `tsc`** because the helper is typed `(action: any)` and
`string[].includes()` accepts any string.

**Resolution path:** the canonical permission model (Mission 8) replaces all
three client tables with one server-enforced policy.

---

## BLOCKER-004 — No sweeper releases expired reservation holds

**Resolved 2026-09-29.** Console: `releaseExpiredHolds` (`services/bookings.ts`) runs every 30 s and auto-offers freed seats to the waitlist. Backend: scheduled `releaseExpiredHolds` Cloud Function every 5 min with its composite index. Tests: `bookings.test.ts`, `releaseExpiredHolds.test.ts`.

**Severity:** P1 · **Owner:** Engineering · **Opened:** 2026-08-22

**Evidence:** `reserveSeat` now writes a real `reservationExpiresAt` Timestamp
(ADR-0002, PROOF 9), but nothing consumes it. In the prototype,
`expireReservation` was reachable only from a button on `/bookings/[id]`.

**Consequence:** an abandoned checkout holds a seat forever. On a limited-slot
product this silently destroys sellable capacity.

**Resolution path:** a scheduled Cloud Function releasing holds past expiry,
mutating booking and counters in one transaction (per ADR-0002 §Consequences).

---

## BLOCKER-005 — Participant page forges the privileged-access audit trail

**Resolved 2026-09-29.** The store always supplies the signed-in operator and role (callers cannot); the participant page uses `EmergencyIdentityPanel` with a mandatory reason (15+ characters), a 5-minute grant, holder-only visibility and close. Test: `sessionOperations.test.ts`.

**Severity:** P0 · **Owner:** Engineering · **Opened:** 2026-08-22

**Evidence:** `apps/operations-web/app/(console)/people/participants/[id]/page.tsx`
calls `requestEmergencyIdentityAccess` with `operatorId: "op-1"` and
`operatorRole: "super-admin"` hardcoded, plus a canned justification string.

**Consequences:** the role gate is bypassed (any role reaching `/people` passes,
including Support and Finance); the audit entry names the wrong person
regardless of who acted, so the privileged-access log is false by construction;
and the mandatory reason requirement is defeated. Then `alert()` reports success.

**Aggravating:** this file is **untracked** — one `git clean` from loss, and it
carries a P0. Review before committing.

**Resolution path:** Mission 14 — actor resolved server-side from the verified
auth token; never client-supplied. The pattern is already established in
`reserveSeat` (PROOF 8).

---

## BLOCKER-006 — Emergency mode on live sessions is denied for every role

**Resolved 2026-09-29.** Role ids come from the store; emergency mode is allowed for platform-owner, super-admin, safety, ops-manager and the session lead coordinator (crew or operator id). Test: `liveSession.test.ts`.

**Severity:** P1 · **Owner:** Engineering · **Opened:** 2026-08-22

**Evidence:** `app/(console)/missions/[id]/live/page.tsx:189,204` passes
`operatorRole: role.name` (the display string, e.g. `"Super Admin"`);
`lib/prototype/validators/liveSessionValidation.ts:58` compares against role
**identifiers** (`"super-admin"`). The comparison can never succeed.

**Regression with a precise origin:** commit `f45d2c5` passed `role.id`
correctly; commit `805a0c8` ("mission workspace usability rebuild") changed it to
`role.name`. The safety-pause control on a running event has been dead since.

---

## BLOCKER-007 — Payment provider unselected

**Severity:** P1 · **Owner:** Human · **Opened:** 2026-08-04 (`DEC-SA-029`)

**Evidence:** `docs/project-records/00-project-status.md` §4 records the payment
provider decision as **Blocked** pending a verified comparison.

**Blocks:** Mission 13 (financial correctness) beyond the authoritative-amount
and idempotency groundwork, which proceeds without a provider.

**Constraint:** live payment activation requires explicit human approval and is
out of scope for this campaign regardless.
