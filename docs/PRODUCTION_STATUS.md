# Production Transformation — Master Control

> **This document reflects repository reality.** Every claim below is traceable
> to a file, a commit, or a test run recorded here. Where something is unproven
> it says so. Where something is broken it says so.

- **Campaign:** Prototype → Production-grade Next.js Super Admin on Firebase
- **Last updated:** 2026-09-29 (production pass — see `CHANGELOG.md`)
- **Branch:** `claude/zen-brahmagupta-se2svs`
- **Backend:** Firebase / Firestore ([ADR-0001](adr/ADR-0001-BACKEND-ARCHITECTURE.md))

---

## 0. Current position (2026-09-29)

**Classification:**
- Usable single-organisation console (local workspace).
- Shared multi-user operation is ready and verified on the Firebase emulator, pending a real Firebase project (BLOCKER-001).
- Login and payment-provider integration were out of scope for this pass by instruction.

### What an operator can do today

Run `npm install && npm run dev` in `apps/operations-web`, open `/login`, pick an operator profile and use every module. No backend is needed. See `docs/product/CONSOLE_USER_GUIDE.md`.

- **Records:**
  - Every record persists in IndexedDB across reloads.
  - Backups export and restore; open tabs stay in sync.
  - Every action is journalled to the activity record and shown in **Audit & records**, with CSV export.
- **Marketplace governance:** Approvals, and organizer/arena/event access, follow the same rules as the Cloud Functions:
  - versions;
  - transition table;
  - mandatory reasons;
  - a missing case target is refused;
  - settlement release is blocked while the organizer has an open fraud alert.
- **Operations:** setup → catalog → scheduling → bookings/waitlist → codes → teams → reveal → door check-in → live run → results → completion report, with rules enforced in the service layer.
- **Money:**
  - Payments and refund payouts are recorded manually with references.
  - Cumulative over-refund guard.
  - Finance-only approvals.
  - Reconciliation of mismatched records.
- **Trust & safety:** incidents, disputes and moderation under a typed permission matrix; tournaments with validated brackets and dual verification.
- **Control:** access management, analytics computed from records, notifications, workspace backup/scenarios/reset.

### Verified capabilities (evidence)

| Area | Evidence |
|---|---|
| Web business rules | `npm test` in `apps/operations-web`: 14 files, 162 tests passing |
| Cloud Functions: no-oversell, governance, operator access, hold sweeper, workspace sync, callable auth | `npm run test:functions`: 7 suites, 68 tests passing (Firestore + Auth + Functions emulators) |
| Firestore security rules | `npm run test:rules`: 16 tests passing |
| Every console route renders without runtime errors, error boundaries or horizontal overflow | `apps/operations-web/scripts/crawl.mjs` on the production build: Platform Owner at 1440 px and 390 px; Safety, Finance, Coordinator, Support and Analyst at 1280 px |
| Type safety, lint, production build | `tsc --noEmit` 0 errors · `next lint` 0 warnings · `next build` succeeds (89 routes) |
| End-to-end persistence | Approve a case → reload → decision, organizer status, activity record and governance audit all present |

### Blockers

| ID | Status |
|---|---|
| BLOCKER-001 No Firebase project | **Open, human action.** Create the project(s), deploy functions/rules/indexes, set `NEXT_PUBLIC_DATA_MODE=firebase-live`. |
| BLOCKER-002 Slices discarded on reload | **Resolved** |
| BLOCKER-003 Safety roles that don't exist | **Resolved** |
| BLOCKER-004 No hold sweeper | **Resolved** |
| BLOCKER-005 Forged privileged-access audit | **Resolved** |
| BLOCKER-006 Emergency mode denied for all | **Resolved** |
| BLOCKER-007 Payment provider unselected | **Open, human decision** (out of scope for this pass) |

### What is still not production

- **No live Firebase project.** Shared data, server-authoritative governance, App Check and managed backups activate only after a project is configured and deployed. Deployment is a human gate.
- **Payments.** There is no provider integration and no webhooks; money records are manual entries with references.
- **Local workspace sign-in.** Choosing an operator profile is appropriate for one trusted device. Teams should use Firebase mode (email/password with verified role claims).
- **Territory and franchise scoping in Firestore rules.** `setOperatorAccess` already sets the claims, but the rules allow admin-only reads.
- **Operations commands in Firebase mode.** Apart from `reserveSeat` and governance, which are server-authoritative, these run in the browser and are persisted through the versioned, audited `syncWorkspace` callable. They are not individually server-authoritative.

---

# History (campaign log before 2026-09-29)

## 1. Current position

**Active mission:** Mission 5 — canonical Firestore data model.

**Just completed:** Mission 10 — concurrency and transaction safety. The
no-oversell invariant is **proven**, not asserted: 12/12 tests green against a
real Firestore emulator with genuinely concurrent clients.

**Headline state:** the backend now has its first authoritative write path and a
proof that it is safe under concurrency. Everything else in the platform is
still the prototype described in the forensic audit — the browser is still the
store for every module except seat reservation.

---

## 2. Honest progress measurement

Not a percentage. A count of capabilities with evidence behind them.

**Production capabilities verified: 6 of 63.**

| Verified | Evidence |
|---|---|
| Seats can never be oversold under concurrency | `concurrency.test.ts` PROOF 1, 2 |
| Seat-taking is idempotent under retry and double-tap | PROOF 5, 6 |
| Occupancy projection reconciles with the booking ledger | PROOF 3 |
| Blocked and complimentary allocation behave correctly | PROOF 4 |
| Session lifecycle is enforced server-side with operator-readable refusals | PROOF 7 |
| Privileged actions are audited to a server-resolved actor | PROOF 8 |

The remaining 57 span authentication, authorization, every other workflow,
persistence for every other module, payments, privacy, UX, accessibility,
performance, observability, deployment and recovery. None is claimed.

---

## 3. Mission status

| # | Mission | State | Note |
|---|---|---|---|
| 0 | Restart from truth | ✅ Complete | Repo, git, tooling and Firebase account all verified first-hand |
| 1 | Master control file | ✅ Complete | This file + 3 logs + 2 ADRs |
| 2 | Reconstruct the Super Admin | 🟡 Partial | Full inventory exists from the forensic audit; not yet restated as a per-feature GREEN/YELLOW/ORANGE/RED matrix in-repo |
| 3 | Understand the business domain | 🟡 Partial | Domain reconstructed and documented in the audit; canonical shared-platform map not yet written |
| 4 | Firebase foundation audit | ⛔ Blocked | **No Firebase project exists** — BLOCKER-001. Local config audited in full |
| 5 | Canonical Firestore data model | 🟢 Active | Collection paths and the session/booking/audit/receipt shapes are defined and under test; full model document pending |
| 6 | Firestore security rules | 🔴 Not started | Current rules are deny-all with 7 passing denial tests |
| 7 | Real authentication | 🔴 Not started | Prototype auth is unchanged: any password, OTP `123456`, `localStorage` session |
| 8 | Real authorization | 🔴 Not started | Three contradictory client tables still in place; one contains phantom roles (BLOCKER-003) |
| 9 | Move business logic to Firebase | 🟡 Partial | `reserveSeat` is the first authoritative command. Every other rule still runs only in the browser |
| 10 | Concurrency / transaction safety | ✅ **Proven** | 12/12 green. ADR-0002 |
| 11 | Real Super Admin workflows | 🔴 Not started | Seat reservation has a server path but no UI wired to it yet |
| 12 | Data survival | 🔴 Not started | BLOCKER-002 is live: 20 of 39 slices are discarded on reload |
| 13 | Financial correctness | 🔴 Not started | Provider unselected (BLOCKER-007). Groundwork only |
| 14 | Privacy / emergency identity access | 🔴 Not started | BLOCKER-005 is live and in untracked code |
| 15–24 | IA, UX, design system, dashboard, tables, forms, destructive actions, accessibility, responsive | 🔴 Not started | Audit findings stand |
| 25–28 | Performance, observability, testing, operator simulation | 🔴 Not started | Testing has begun in the backend only |
| 29–37 | Security, hardening, Flutter compatibility, docs, CI/CD, polish, regression, readiness, certification | 🔴 Not started | — |

---

## 4. What was built in this session

New, under `firebase/functions/`:

| File | Purpose |
|---|---|
| `src/domain/capacity.ts` | Capacity engine ported from the prototype. Pure, no I/O. The single definition of capacity truth for every client of the platform |
| `src/platform/firestore.ts` | Firestore access boundary. Canonical collection paths in one place |
| `src/platform/errors.ts` | `DomainError` with operator-facing message and next step; internal detail kept out of the UI |
| `src/bookings/reserveSeat.ts` | **The only way a seat may be taken.** Transactional, idempotent, audited |
| `test/concurrency.test.ts` | 12 proofs against a real emulator. This file *is* the no-oversell guarantee |
| `test/tune-retry.test.ts` | Retry-budget sweep against the real transaction |
| `test/measure-contention.mjs` | Contention instrument: counter vs. per-seat design |

Nothing in `apps/operations-web/` has been modified. The prototype is untouched
and still runs.

---

## 5. Test results

Run against the Firestore emulator (`demo-experience-os`) on 2026-08-22.

```
firebase/functions — test/concurrency.test.ts
  Test Suites: 1 passed, 1 total
  Tests:       12 passed, 12 total

  PROOF 1  capacity 1, two simultaneous bookers — exactly one wins        3,579 ms
  PROOF 2  capacity 10, 40 simultaneous bookers — exactly 10, never 11    8,118 ms
  PROOF 3  counter projection reconciles with the booking ledger             29 ms
  PROOF 4  blocked slots reduce sellable but not physical capacity       10,789 ms
  PROOF 5  same requestId twice creates exactly one booking                 158 ms
  PROOF 6  double-tap — same requestId concurrently — one booking         3,026 ms
  PROOF 7  cancelled / completed / booking-closed / draft refusals        ~90 ms each
  PROOF 8  audit names the acting user, caller cannot supply it              96 ms
  PROOF 9  a sellable seat is held, not confirmed, with a real expiry        133 ms

firebase/functions — tsc -p tsconfig.test.json --noEmit    exit 0
```

**Not yet run in this campaign:** the web app's own gates (`tsc`, `next lint`,
`next build`) — unchanged since the audit, where they were verified as
exit 0 / ~12 warnings / passing. The web app's single vitest file (7 tests) is
also unchanged.

**Not covered by any test:** authentication, authorization, security rules
beyond deny-all, every non-booking workflow, persistence for every other module,
payments, privacy, UI, accessibility, performance.

---

## 6. Decisions required from the human

### DECISION 1 — Create the Firebase project (BLOCKER-001)

**What is required:** authorization to create, or the identity of, the Firebase
project this platform runs on.

**Why it matters:** the campaign brief states "BACKEND: Existing Firebase
project." **No such project exists.** `.firebaserc` names `demo-experience-os`,
which the `demo-` prefix marks as emulator-only, and the authenticated account
(`frameingos@gmail.com`) holds 8 projects — `alphasystem-c6dac`,
`ehm-platform`, `flutter-ai-playground-c53e7`, `nearingo-877fe`,
`temple-seva-platform`, `trainersarena-website`, `trainershq-f5ded`,
`trainershq-staging` — none of which is this platform.

**Options:**

1. **Create two new projects** — `experience-os-staging` and `experience-os-prod`.
   Clean separation from day one, no shared blast radius with other products.
2. **Create one project now** (`experience-os`), add staging later. Cheaper to
   start, but environment separation retrofitted onto live data is painful and
   is a Mission 30 requirement.
3. **Reuse an existing project.** Not recommended — it would put this platform's
   data, rules and quotas inside a product that already has its own.
4. **Name a project I could not see.** If one exists under a different account,
   provide the project ID.

**Recommendation: Option 1.** Mission 30 requires environment separation and
Mission 32 requires a reproducible deployment; both are far cheaper to establish
before any data exists. Firebase projects on the Spark plan are free to create;
Blaze (pay-as-you-go) is required for Cloud Functions, which this architecture
needs — that is a billing decision and therefore yours.

**Evidence:** `firebase projects:list` output and the emulator's own startup
warning, both recorded in BLOCKER-001.

**Risk of proceeding without it:** none in the short term. All backend work is
being built and verified against the emulator, which is the correct development
path regardless. The gate binds only at deployment.

**Exact next action if approved:** I create nothing myself. You create the
project(s); I then update `.firebaserc` with `staging` and `production` aliases,
wire environment configuration, and prepare — but do not run — the deployment.

### DECISION 2 — Payment provider (BLOCKER-007, inherited `DEC-SA-029`)

Not yet blocking. Mission 13 groundwork (authoritative amounts, integer minor
units, idempotency, state machine) proceeds provider-agnostically. I will stop
before any provider integration or credential use.

---

## 7. Active blockers

Full detail in [BLOCKER_LOG.md](BLOCKER_LOG.md).

| ID | Sev | Owner | Summary |
|---|---|---|---|
| BLOCKER-001 | P0 | **Human** | No Firebase project exists for this platform |
| BLOCKER-002 | P0 | Engineering | 20 of 39 prototype state slices discarded on reload |
| BLOCKER-003 | P0 | Engineering | Safety authorization keyed to non-existent roles, failing silently |
| BLOCKER-005 | P0 | Engineering | Participant page forges the privileged-access audit trail (untracked code) |
| BLOCKER-004 | P1 | Engineering | No sweeper releases expired reservation holds |
| BLOCKER-006 | P1 | Engineering | Emergency mode on live sessions denied for every role |
| BLOCKER-007 | P1 | **Human** | Payment provider unselected |

---

## 8. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Firestore has no declarative constraint, so no-oversell rests entirely on tested code | High | `concurrency.test.ts` must run in CI and must never be skipped. Recorded in ADR-0001 |
| The occupancy projection can drift from the booking ledger | High | Every seat-affecting operation must mutate both in one transaction. `occupancyDrift()` detects divergence; PROOF 3 asserts zero |
| Two type surfaces for the same domain (`lib/types.ts` vs `lib/prototype/entities.ts`) | Medium | Collapse before the client migration; this is how BLOCKER-003 evaded `tsc` |
| A day of untracked work carrying a P0 (BLOCKER-005) | Medium | Review and commit early |
| Emulator evidence is not production evidence | Medium | Stated explicitly wherever claimed; no readiness claim rests on it |
| 40-client burst takes ~8 s wall | Low | Acceptable for admin-console use; must be re-measured before a public customer app opens sales |

---

## 9. Security status

**Not assessed in this campaign yet.** The audit findings stand unchanged:
authentication is decorative, 47 of 79 console routes have no permission check,
three authorization tables contradict each other and one is keyed to phantom
roles, and the privileged-access audit trail can be forged.

One thing improved: the pattern for privileged actions is now established and
proven — the actor is resolved server-side from the verified token and cannot be
supplied by the caller (DEC-PT-007, PROOF 8). Missions 6, 7, 8 and 29 will apply
it across the platform.

Firestore rules remain **deny-all**, with 7 passing denial tests. That is the
correct posture until the model is designed.

## 10. UX status

**Not started.** The audit findings stand: strong design system with real
tokens and a coherent information architecture, undermined by drift (83 files
off-token, `warning` undefined in 12 places, Inter never loaded), no error
boundaries, keyboard-inaccessible tables, no mobile navigation, and 46 orphaned
store commands leaving the console create-only.

One standard is now set and enforced by test: operator-facing errors carry
business language and a next step, and are asserted to contain no technical
vocabulary (DEC-PT-008, PROOF 7).

## 11. Production readiness

**Not production ready.** No category has passed. The full certification matrix
(Mission 36) has not been opened, because opening it before Missions 5–14 exist
would produce a document of `NOT VERIFIED` rows with no information in it.

Current classification is unchanged from the forensic audit: **Prototype** — with
one authoritative, proven server-side capability now built underneath it.

---

## 12. Next action

**Mission 5 — canonical Firestore data model.**

Write `docs/FIRESTORE_DATA_MODEL.md` covering every collection already named in
`platform/firestore.ts`, and for each: purpose, document identity, fields,
relationships, ownership, indexes, lifecycle, validation, permissions, audit
requirements, and deletion/archival behaviour — with multi-tenant isolation
(territory and franchise ownership) as a first-class concern, since it is the
precondition for Mission 6's security rules.

The model must be written for **three clients, not one**: the Next.js Super
Admin now, the Flutter Organizer and Customer apps later (Mission 31).
