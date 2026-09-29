# Changelog

All notable changes to Experience OS. Dates are IST.

## 2026-09-29 — Production pass: daylight redesign, durable records, every blocker fixed

Branch `claude/zen-brahmagupta-se2svs`, commits `1a8a390` … `68f8b5a`.
Scope: the Super Admin console (`apps/operations-web`) and the Firebase backend (`firebase/`).
Login and payment-provider integration were explicitly out of scope and remain as described under *Known limits*.

### Highlights

- **New white "Daylight" design system** — self-hosted Inter, Plus Jakarta Sans and JetBrains Mono; one violet brand colour; semantic colour for state only; rebuilt shell (grouped sidebar, mobile drawer, live IST clock, save indicator, account menu, ⌘K search across pages, sessions, bookings, organizers and staff, notifications). Every page (89 routes) was restyled and reviewed at 1440 px and 390 px. Canonical reference: `docs/design-system/03-daylight-design-system.md`.
- **Usable today without a backend** — the default *Local workspace* mode signs in by operator profile and stores every record in the browser's IndexedDB. All 42 data slices survive reloads, are versioned, and are migrated on load. Backups can be exported and restored from **Workspace & backups**; changes sync between open tabs.
- **A permanent record of everything** — every console command is written to an append-only **activity record** (who, role, what, target, reason, whether it took effect). Governance decisions, operations events and emergency identity access each have their own log. All four are shown in **Audit & records** with search, filters and CSV export, and all survive resets.
- **Shared multi-user storage when Firebase is connected** — new `syncWorkspace` callable with per-slice optimistic concurrency, append-only merge for record slices and chunked storage. Clients cannot write directly, and a conflict reloads the latest data and tells the operator.
- **All operations modules are reachable again** — one route→role policy (`lib/nav.ts`) drives the sidebar, search, page guards and the Access matrix.

### Fixed — blockers from `docs/BLOCKER_LOG.md`

| Blocker | Fix |
|---|---|
| BLOCKER-002 — 20 of 39 slices discarded on reload | Persistence rewritten: every slice restored, versioned envelope, migrations, IndexedDB (`lib/prototype/persistence`). |
| BLOCKER-003 — safety permissions keyed to non-existent roles | Typed permission matrix over real roles, enforced in services with territory scope (`lib/safety/access.ts`, `lib/tournaments/access.ts`). |
| BLOCKER-004 — no sweeper for expired holds | ISO expiry on holds and waitlist offers. `releaseExpiredHolds` runs every 30 s in the console (auto-offers the seat to the waitlist), plus a scheduled Cloud Function every 5 min. |
| BLOCKER-005 — forged emergency-access audit trail | The actor is always the signed-in operator (store boundary). A real reason and a time-boxed grant are required, and the record is visible only to the grant holder (`EmergencyIdentityPanel`). |
| BLOCKER-006 — emergency mode denied for every role | Role ids are resolved by the store. Emergency mode is allowed for Platform Owner, Super Admin, Safety, Ops Manager and the session's lead coordinator. |

### Fixed — other defects

- **Console access**
  - Operations pages always showed "This door isn't yours" because `canAccess` only knew 12 governance routes.
  - The default data mode could not open the console at all.
- **Store commands**: commands returned `undefined` because results were captured inside a React state updater; `commit` is now synchronous.
- **Bookings**
  - Split booking vocabulary: seeded confirmed bookings counted as 0 seats (the Overview showed 1/40 instead of 36/40).
  - Capacity double-counted bookings and ignored checked-in bookings.
  - Two money ledgers disagreed. Payments and refunds are now the source of truth; the ledger is derived.
  - `cancelSession` created no refunds.
- **Refunds**
  - Refund exceptions bypassed the over-refund guard and never completed.
  - Refunds auto-completed on approval. The flow is now requested → approved → paid out with a reference.
- **Session operations**
  - `allocateTeamsRandomly` lost its auto-created teams.
  - `endLiveSession` skipped the Ending state.
  - `openSession` ignored readiness.
  - `cancelReveal` only wrote an audit entry.
  - Unused identity and team validators are now enforced.
- **Staff**
  - Sessions referenced operator ids where readiness expected crew ids (now crew ids plus a migration).
  - Staff logic lived inline in the store with hard-coded defaults.
- **Tournaments**: validators were never called; the bracket could create an empty match with 5 teams; scenario matches used team names as ids.
- **Disputes and moderation**: disputes could not be partially upheld; expired moderation actions still blocked participants.
- **Session scheduling**: had no server-side validation (capacity, area double-booking, staff); the unguarded `createBooking` command is removed.
- **Catalog**
  - Readiness links pointed at missing routes.
  - Equipment matching marked 6 of 8 experiences unschedulable.
  - Archiving was allowed while in use.
- **UI**
  - The `.overline` class collided with Tailwind's `overline` text-decoration.
  - Dialogs were offset by parent `space-y` margins (now rendered through a portal).
  - Pages overflowed at phone width.
  - The Inter font was never loaded.
  - There were no error boundaries.
  - `alert()`, `confirm()` and `prompt()` were used throughout.
- **Seed data**: sessions exceeded their playing areas' capacity (+ repair migration), and s-1's status contradicted its live state.
- **Backend**
  - The Node 24 engine prevented the functions emulator from loading any function (now Node 22).
  - The governance "not found" error reused a booking error code.
  - Entity status could jump between any two states.
  - A missing case target was skipped silently.
  - `setOperatorAccess` was not idempotent and could demote the last owner.
  - Seed scripts had an operator-precedence bug.

### Added

- **Governance**: intake forms to record organizer applications, arena submissions, event proposals, commercial terms and policy versions (each opens a review case). Case drawer with verification checks, history and allowed transitions only. CSV export on every governance list.
- **Access**: operator management — add, edit role and territory, suspend and reactivate, with last-owner protection.
- **Analytics**: computed from real records; date range, territory scope, CSV export. Notifications inbox.
- **Setup**: guided first run from an empty workspace (franchise → … → session).
- **Backend**
  - Callables: `reserveSeat` (territory-scoped), `submitGovernanceIntake`, `syncWorkspace`.
  - Scheduled `releaseExpiredHolds`.
  - Revocation-checked actors for privileged commands.
  - Unified audit and receipt shapes with a 7-day TTL.
  - CI workflow (`.github/workflows/ci.yml`).

### Tests

- Web (vitest): 14 files, **162 tests** passing.
- Cloud Functions on emulators: 7 suites, **68 tests** passing.
- Firestore rules: **16 tests** passing.
- Browser crawl of every route as 6 roles and at phone width: no runtime errors, error boundaries or overflow.

### Known limits (not changed in this pass)

- **Login**: the local workspace uses operator-profile sign-in; real sign-in is Firebase email/password when a project is connected.
- **Payments**: the payment provider is not connected. Payments and refund payouts are recorded manually with a reference.
- **Live Firebase**: no Firebase project exists yet (BLOCKER-001). Shared multi-user storage and server-authoritative governance work on the emulator and activate as soon as a project is configured.
