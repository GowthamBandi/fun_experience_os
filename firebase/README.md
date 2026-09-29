# Firebase backend

Cloud Functions, Firestore security rules and indexes for Experience OS, plus
the emulator scripts and tests that prove them. Everything here runs against the
local emulators with the demo project **`demo-experience-os`**; nothing is
deployed from this repository.

## Layout

```
firebase/
├── functions/                      Cloud Functions (TypeScript, firebase-functions v1 API, Node 22)
│   ├── src/index.ts                every exported function
│   ├── src/platform/               auth (actor + token freshness), errors, callable error surface,
│   │                               audit + receipt helpers, Firestore access boundary
│   ├── src/bookings/               reserveSeat transaction + callable, releaseExpiredHolds sweeper
│   ├── src/domain/capacity.ts      pure capacity engine (no-oversell rules)
│   ├── src/governance/             marketplace governance model, service and callables
│   ├── src/auth/operatorAccess.ts  setOperatorAccess
│   ├── src/workspace/sync.ts       syncWorkspace (console workspace slices)
│   ├── scripts/seed-governance-emulator.mjs
│   └── test/                       Jest suites (run inside the emulators)
├── firestore/
│   ├── firestore.rules             security rules
│   ├── firestore.indexes.json      composite indexes + TTL field override
│   └── test/rules.test.ts          rules unit tests
└── scripts/                        reset-emulator.ts, seed-emulator.ts (safety-guarded)
```

## Functions

All callables resolve the actor from the verified Firebase Auth token (never
from the request body), return plain-language `DomainError`s (`details.code`,
`message`, `nextStep`) and enforce App Check outside the emulator. Every
state-changing callable also runs `requireCurrentActor`: one Auth Admin lookup
that refuses a disabled account, a token minted before `revokeRefreshTokens`
(`tokensValidAfterTime`), or a token whose role no longer matches the account's
current custom claims — the server-side equivalent of
`verifyIdToken(token, checkRevoked = true)`.

| Function | Type | Who | What |
|---|---|---|---|
| `checkHealth` | callable | anyone | Connectivity probe; returns `{ ok, environment, projectId }`. |
| `reserveSeat` | callable | platform-owner, super-admin, city-manager, ops-manager, coordinator, support | `{ requestId, sessionId, alias, kind }` → takes one seat in a single transaction (no oversell), 15-minute hold for sellable seats. Non-admin roles are limited to their `territoryIds` claim. Idempotent; a receipt replays only for the same actor and session. |
| `releaseExpiredHolds` | scheduled, every 5 min (Asia/Kolkata) | system | Releases bookings whose `reservationExpiresAt` has passed: booking → `reservation-expired`, session counters via `applyHoldReleased`, one transaction per session, audited as actor `system`, idempotent. |
| `decideCase` | callable | platform-owner, super-admin | `{ requestId, caseId, expectedVersion, outcome, note }` → decides a governance case and moves its linked record (`CASE_TARGET`). Fails with `CASE_NOT_FOUND` / `TARGET_NOT_FOUND` when the case or its linked record is missing; `settlement-release` approval fails with `SETTLEMENT_BLOCKED` while the settlement's organizer has a risk alert whose status is not `resolved`. |
| `setMarketplaceEntityStatus` | callable | platform-owner, super-admin | `{ requestId, entityType, entityId, expectedVersion, status, reason }` → status change allowed only by `ENTITY_TRANSITIONS` (`INVALID_TRANSITION` otherwise), `RECORD_NOT_FOUND` for a missing record. |
| `submitGovernanceIntake` | callable | platform-owner, super-admin | `{ requestId, kind, name, location?, organizerName?, contactEmail?, summary?, capacity?, projectedGmv (₹)?, commissionPercent?, effectiveFrom?, risk? }` → creates the organizer / arena / event / commercial agreement / policy record and (except policies) a `pending` governance case. |
| `setOperatorAccess` | callable | platform-owner | `{ requestId, uid, roleId, status, reason, scope?, franchiseId?, territoryIds? }` → sets custom claims (`roleId`, `scope`, `franchiseId`, `territoryIds`, `disabled`), the Auth `disabled` flag, `users/{uid}`, audit + receipt; revokes the operator's refresh tokens when access changed. Refuses self-suspension, demoting the last active platform-owner (`LAST_OWNER`) and unknown users (`USER_NOT_FOUND`). |
| `syncWorkspace` | callable | platform-owner, super-admin | Saves console workspace slices under `workspaces/{ws}` with per-slice optimistic versions. |

The governance behaviour is kept identical to the console's local workspace
implementation (`apps/operations-web/lib/prototype/governance/commands.ts`):
same `CASE_TARGET`, `ENTITY_TRANSITIONS`, intake mapping and messages.

### Audit events and command receipts

Every command writes, in the same transaction as its change:

- `auditEvents/{id}` — `{ action, subject, summary, entityType, entityId, before, after, actorUid, actorName, actorRoleId, requestId, at, schemaVersion: 1, …context }`.
- `commandReceipts/{requestId}` — `{ requestId, command, actorUid, result, createdAt, expiresAt }`.

`expiresAt` is `createdAt + 7 days` and is declared as a **TTL field** in
`firestore.indexes.json` (`fieldOverrides`, `"ttl": true`), so Firestore deletes
old receipts automatically once the indexes file is deployed (equivalently:
`gcloud firestore fields ttls update expiresAt --collection-group=commandReceipts --enable-ttl`).

## Firestore rules posture

- **No client writes, anywhere.** All writes go through the functions above.
- Reads require a verified email, `disabled` claim not `true`, and a `roleId` claim.
- **Admins** (platform-owner, super-admin): governance collections, operations
  collections (footprint, catalog, `scheduledSessions`, `bookings`), `customers`,
  `payments`, `refunds`, `auditEvents`, `users` (list), and the console workspace
  (`workspaces/{ws}`, `/slices/*`, `/chunks/*`).
- **Auditors** (read-only compliance role): governance + operations collections
  and `auditEvents` — not money, customer cohorts, operator profiles or the workspace.
- **Payments / refunds**: admin-read only (decision: finance roles get access once
  territory-scoped rules exist).
- Every user can read their own `users/{uid}` profile.
- `commandReceipts` and every unlisted collection: denied.
- **Territory / franchise scoping** is not yet in the rules. `setOperatorAccess`
  already sets the `scope`, `franchiseId` and `territoryIds` claims it needs, and
  `reserveSeat` already enforces `territoryIds` server-side.

## Indexes

| Collection | Fields | Used by |
|---|---|---|
| `bookings` | `reservationStatus` ↑, `reservationExpiresAt` ↑ | `releaseExpiredHolds` sweep query |
| `commandReceipts.expiresAt` | TTL, single-field indexing disabled | receipt expiry |

Other queries in use (`riskAlerts.organizerName ==`, `users.roleId == && status ==`,
`bookings.sessionId ==`) are served by automatic single-field indexes. The other
indexes planned in `docs/FIRESTORE_DATA_MODEL.md` are added with the first query
that needs them.

## Emulator ports

| Emulator | Host | Port |
|---|---|---|
| Auth | 127.0.0.1 | 9099 |
| Firestore | 127.0.0.1 | 8080 |
| Functions | 127.0.0.1 | 5001 |
| UI | 127.0.0.1 | 4000 |

Requirements: Node 22 (22.18+ for the seed/reset scripts, which load `.ts`
natively), Java 21, `firebase-tools` 13.

## Scripts (run from the repository root)

| Command | What it does |
|---|---|
| `npm run firebase:emulators` | Start every emulator (`demo-experience-os`). |
| `npm run firebase:seed` | Seed Auth + Firestore with the governance dataset from `apps/operations-web/lib/prototype/governance/seed.ts` (the same data as the console's local workspace) and two accounts: `admin@experience.local` (platform-owner) and `auditor@experience.local` (auditor), password `Local-Admin-Only-2026!`. To seed a running emulator instead: `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 npm --prefix firebase/functions run seed:emulator`. |
| `npm run firebase:reset` | Clear all Firestore and Auth emulator data. |
| `npm run test:functions` | Build the functions, then run every functions test inside `emulators:exec --only firestore,functions,auth`. |
| `npm run test:rules` | Firestore rules tests inside the Firestore emulator. |
| `npm run test:tune` | The slow retry-budget sweep (`test/tune-retry.test.ts`, several minutes; excluded from the default run). |
| `npm --prefix firebase/functions run typecheck` | Type-check sources and tests. |

The seed and reset scripts refuse to run without emulator hosts and refuse any
project other than `demo-experience-os`.

## Tests

| Suite | Covers |
|---|---|
| `functions/test/concurrency.test.ts` | No oversell under real concurrency, idempotency, lifecycle refusals, audited actor, hold expiry instant, receipt ownership. |
| `functions/test/releaseExpiredHolds.test.ts` | Sweeper releases only expired holds, counters reconcile, idempotent and race-safe, audited as `system`. |
| `functions/test/governance.test.ts` | Decisions, idempotency, replay by another actor, stale versions, not-found / missing-target errors, settlement fraud block, full transition table, intake. |
| `functions/test/callables.test.ts` | HTTPS boundary with real Auth-emulator tokens: `reserveSeat` roles and territories, token revocation / disabled / role-changed checks, governance callables end to end. |
| `functions/test/operatorAccess.test.ts` | `setOperatorAccess`: owner-only, claims + user record + audit, idempotency, Auth disable, unknown user, last-owner rule, scope validation. |
| `functions/test/workspace.test.ts` | `syncWorkspace` slices. |
| `functions/test/health.test.ts` | `checkHealth`. |
| `firestore/test/rules.test.ts` | Rules posture above. |

CI (`.github/workflows/ci.yml`) runs the web checks plus functions typecheck,
`test:functions` and `test:rules` on every push and pull request.

## Safety rules

1. **Never run `firebase deploy`** until production approval is granted.
2. **Never select a real Firebase project** — always use `demo-experience-os`.
3. **Never commit `.env.local`** — it is git-ignored.
4. Seed and reset scripts refuse to run unless the emulator hosts are present.
