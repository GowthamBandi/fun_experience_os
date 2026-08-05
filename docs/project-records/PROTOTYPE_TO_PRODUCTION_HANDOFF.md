# Prototype to Production Handoff Specification

This specification governs the transition from the Operations Command Center prototype (Milestone 1) to production-ready implementation (Milestone 2).

## 0. SA-P2A Architecture (as of 2026-08-05)

The central state lives in `lib/prototype/` as a **domain package**; no business logic exists outside it.

```
lib/prototype/
  entities.ts        # 20 normalized domain types (Franchise → PromoCode)
  seed.ts            # deterministic seed (16 slices, 2 franchises → 7 day-points)
  selectors/         # pure reads: status sets, lookups, *Views
    status.ts  lookups.ts  views.ts  index.ts
  services/          # pure commands + factories (create*, strike, cancel, teams, money…)
    helpers.ts  create.ts  bookings.ts  operations.ts  money.ts  catalog.ts  index.ts
  validators/        # validatePrototypeState + validationSummary (8 rule families)
  scenarios/         # PrototypeState, getInitialState, SCENARIOS + applyScenario (10)
    state.ts  initial.ts  definitions.ts  index.ts
  persistence/       # load/save/clear state, demo step + reviewed keys
  repositories/      # facade: re-exports selectors + services (stable import path)
  index.ts           # public barrel
lib/store.tsx        # coordination + persistence ONLY (single commit(fn) primitive)
```

### Central-state contract
- **One store, one source of truth.** All console pages read through selectors (`sessionViews`, `bookingViews`, `territoryViews`, `venueViews`, `franchiseViews`, …); all mutations flow through service commands.
- **Persistence keys:** `xos.prototype.state` (deep-merged over `getInitialState()` per slice), `xos.prototype.walkthrough_step`, `xos.prototype.walkthrough_reviewed`. Auth/console prefs stay in `xos.auth`, `xos.console`, `xos.pending`.
- **Validation:** `validatePrototypeState` runs 8 rule families (duplicate IDs, missing references, city–territory, venue↔city, playing-area compatibility, capacity overflow/status, orphan transactions, invalid matches); surfaced live in dev via `StateValidatorPanel`.

### Migration status
- All 12 console pages + `TerritorySwitcher` + `CommandPalette` read central state via selectors.
- `lib/data/mock.ts` reduced to reference/auth tables only (`OPERATORS`, `ROLES`, `TERRITORIES`, `territoryById`); all other slices are prototypes.
- Gates: `tsc --noEmit`, `next lint`, `next build` (18 routes), dev server (3100), 27/27 browser assertions green. Evidence: `docs/prototype-evidence/sa-p2a/` (21 screenshots + README).

### Scenario list (10)
Normal Weekend · New City Launch · High Demand · Waitlist Active · Staff Shortage · Venue Conflict · Payment Failure · Weather Cancellation · Safety Incident · Tournament Day — applied via the demo controller picker, each writing consistent ids/audits/signals.

## 0b. SA-P2B Architecture (as of 2026-08-05)

The geo cluster extends the same domain package; all mutations still flow through services.

```
app/(console)/
  franchises/                  # list, /new (6-step wizard), /[id] detail
  territories/                 # list, /new (5-step wizard), /[id] detail, /[id]/cities/new
  cities/[id]                  # city detail/workspace (explicit route)
  locations/
    venues/                    # list, /new (7-step wizard), /[id] detail, /[id]/playing-areas/new
    playing-areas/[id]         # playing-area detail/workspace (explicit route)
lib/prototype/
  services/geo.ts              # create* + status + assign + annotate commands (audit+persist inside)
  selectors/geo.ts             # *Rows / *Detail selectors for lists + workspaces
lib/geo/access.ts              # single geoCan(role.id, action) role matrix (Part 15)
components/geo/                # PageFrame, Breadcrumbs, PrototypeNote/RoleNote, Proto, WizardShell, ConfirmAction
```

### Geo-cluster contract
- **Every mutation is a service command.** Pages never mutate entities directly; `lib/prototype/services/geo.ts` persists and appends an audit entry per call.
- **Role simulation matrix** in `lib/geo/access.ts` gates `create-*`/`manage-*`, `see-{commercial,safety,contacts}`, `annotate`, `reset-demo` for every geo page. Commercial fields are `<Proto />` placeholders; restricted actions show "Prototype role simulation — not production authorization."
- **Connected workflow:** new franchise → selectable in territory wizard; new territory → switcher + city wizard; new city → venue wizard; new venue → playing-area wizard. New PA becomes schedulable in SA-P2D.
- **Cross-cutting rules:** paused franchise pauses its territories (never deletes); maintenance/closed venue blocks new scheduling messaging; venue map is a placeholder (no live map).
- **Migration status:** 14 routes, wired through selectors; `lib/nav.ts` `canAccess` resolves sub-routes; Sidebar shows sub-route active state. Gates: `tsc --noEmit`, `next lint`, `next build` (24 static + 5 dynamic), dev server (3100), 21/21 browser assertions green. Evidence: `docs/prototype-evidence/sa-p2b/` (21 screenshots + README).

## 1. Prototype Limitations & Constraints
- **State Management**: Persisted in `localStorage` client-side via `lib/prototype/persistence`. Production must use a secure server-side session, HTTP-only cookies, and an API/DB-backed state sync; the persistence layer is the single adapter point.
- **Mock Data**: Located in `lib/prototype/seed.ts` (+ reference/auth tables in `lib/data/mock.ts`). In production, repository contracts must be replaced with real PostgreSQL queries/API endpoints; selectors/services keep their signatures so pages change minimally.
- **OTP Verification**: Simulated using a static code (`123456`). Production must integrate a real SMS gateway / transactional email service with expiring OTP tokens.
- **Sensitive Data Masking**: Currently masks telephone numbers (`•••• 42`) and currency dynamically in the mock layer. A production environment must ensure this masking happens at the API response boundary.

## 2. Accessibility & Design Compliance
- **Design Tokens**: Defined in `globals.css` must remain unchanged to preserve visual consistency.
- **Animations**: Transition curves must always use the custom `cubic-bezier(0.19, 1, 0.22, 1)` easing.
- **Screen Reader Navigation**: Landmarks (`main`, `nav`, headers) are clean; keyboard focus outline must never be completely hidden without a custom alternative.

## 3. Recommended SA-P2 (Milestone 2) Entry Criteria
1. Integrate real authentication backend with secure session state.
2. Replace simulated mock repositories (`lib/prototype/seed.ts`, `lib/data/mock.ts`) with production database services.
3. Migrate `next lint` to Next.js 16 ESLint CLI standard as noted in the deprecation warning.
4. Integrate real SMS/OTP notifications engine.

### SA-P2C entry condition (next milestone)
- SA-P2A hard gate 1–12 passed; SA-P2B hard gate 1–12 passed (see `SA-P2_TRACKER.md` §3/§4-B), 14 geo routes live, 21/21 browser assertions green.
- Next deliverable: category/template creation (SA-P2C) using the same wizard + `geoCan` + service-command pattern (`services/catalog.ts` analog to `services/geo.ts`), then new-PA scheduling in SA-P2D.
- Re-run the 12-point hard gate before SA-P2D begins.
