# Visual Evidence — Milestone SA-P2A (Foundation & Central State)

This index catalogs the visual evidence screenshots captured during browser-level validation of the normalized central-state architecture for the Operations Command Center prototype.

Validation harness: Playwright (Chromium) at 1440×900, authenticated as Platform Owner (`op-1`), scoped to Hyderabad Central (`hvd-central`). Prototype state was reset to seed before capture (`xos.prototype.state` cleared; store rehydrates from `getInitialState()`).

## Screenshot Index

### 1. Command Overview (Dashboard)
- **File**: [`01-command-overview.png`](01-command-overview.png)
- **Route**: `/`
- **Scenario**: KPIs (`Tonight's take`, `Bookings tonight`, `Average fill`, `Live now`) and charts all derived from `state.analytics` / `sessionViews(state, territory.id)` / `state.signals`.
- **Notes**: "3 tonight · 85% fill" in the territory switcher now comes from `territoryViews(state)`.

### 2. Bookings / The door
- **File**: [`02-bookings-door.png`](02-bookings-door.png)
- **Route**: `/bookings`
- **Scenario**: `bookingViews(state, territory.id)` table with working **Strike** action.
- **Notes**: Strike calls `store.strikeBooking` → `strikeBooking` pure command → booking flips to `checked-in` + a `strike` signal is raised, all persisted to `xos.prototype.state`.

### 3. Missions
- **File**: [`03-missions.png`](03-missions.png)
- **Route**: `/missions`
- **Scenario**: `sessionViews(state, territory.id)` with fill/take/status columns and detail drawer using `bookingsForSession` + `venueName`.
- **Notes**: Status filter uses normalized `SessionStatus` values (`live`, `check-in-open`, `booking-open`, `full`, …).

### 4. Money / The take
- **File**: [`04-money-ledger.png`](04-money-ledger.png)
- **Route**: `/money`
- **Scenario**: `transactionViews(state, territory.id)` ledger + `state.promoCodes` promo rail.
- **Notes**: Promo rail shows `FIRSTNIGHT`, `MIDNIGHT50`, `DOUBLESUP` active; `MONSOON` expired — all from seed.

### 5. Locations / The map
- **File**: [`05-locations-map.png`](05-locations-map.png)
- **Route**: `/locations`
- **Scenario**: `territoryViews(state)` cards with `venueViews(state, t.id)` per territory.
- **Notes**: Venue status chips (`ready`/`maintenance`) and utilization come from normalized `Venue.status`.

### 6. Catalog / The shelf
- **File**: [`06-catalog-shelf.png`](06-catalog-shelf.png)
- **Route**: `/catalog`
- **Scenario**: `catalogViews(state)` with working pause/resume toggles.
- **Notes**: Toggle calls `store.toggleTemplate` → pure command; template status flips `active` ↔ `draft` and persists (verified in interaction check).

### 7. Staffing / The crew
- **File**: [`07-staffing-crew.png`](07-staffing-crew.png)
- **Route**: `/staffing`
- **Scenario**: `crewViews(state, territory.id)` with shift join and cover computed from live `sessionViews`.
- **Notes**: Cover % derives from `LIVE_STATUSES` over `sessionViews(state, m.territoryId)`.

### 8. People & safety
- **File**: [`08-people-safety.png`](08-people-safety.png)
- **Route**: `/people`
- **Scenario**: `incidentViews(state)` attention path + `bookingViews(state, territory.id)` participant list.

### 9. Analytics / The read
- **File**: [`09-analytics.png`](09-analytics.png)
- **Route**: `/analytics`
- **Scenario**: charts and KPIs driven directly from `state.analytics` (7 `DayPoint`s from seed).

### 10. Notifications / Signals
- **File**: [`10-notifications.png`](10-notifications.png)
- **Route**: `/notifications`
- **Scenario**: `state.signals` list, newest first; rows call `markAllRead`.

### 11. Access
- **File**: [`11-access.png`](11-access.png)
- **Route**: `/access`
- **Scenario**: `ROLES` permission matrix + live `state.audits` audit trail (seed `aud-1…aud-5`).

### 12. Tournaments / The knockout
- **File**: [`12-tournaments.png`](12-tournaments.png)
- **Route**: `/tournaments`
- **Scenario**: `tournamentViews(state, territory.id)` bracket cards with semi-final matches.
- **Notes**: Hyderabad Central shows "Sunday Cricket Knockout" (upcoming); Bengaluru South hosts "Badminton Masters Cup" (live).

## Interaction checks (validated in-browser)

| # | Action | Result |
| --- | --- | --- |
| 1 | Strike a booking at the door | Booking flips `payment-confirmed → checked-in`; `strike` signal appended; state persisted to localStorage |
| 2 | Toggle a catalog template | Template status flips `active → draft`; persisted to localStorage |
| 3 | Territory switcher | Control present; venue counts (`N arenas`) come from `territoryViews(state)` |

## Scenario & walkthrough evidence (SA-P2A part 2)

All captures below ran against the live dev server (port 3100), Playwright Chromium at 1440×900, Platform Owner `op-1`, Hyderabad Central scope, seed state reset before each run. Assertions were evaluated in-browser against `xos.prototype.state` after each interaction — all 27 passed.

### 13. Demo controller
- **File**: [`13-demo-controller.png`](13-demo-controller.png)
- **Route**: `/`
- **Scenario**: `DemoWalkthroughPanel` open with the full 17-step operational walkthrough list, milestone grouping, reviewed checkmarks, and the scenario picker fed by `SCENARIOS` (10 definitions).

### 14. Scenario — Normal Weekend
- **File**: [`14-scenario-normal-weekend.png`](14-scenario-normal-weekend.png)
- **Route**: `/` after selecting *Normal Weekend*
- **Asserted**: `b-nw-1` present in `state.bookings`; Command KPIs/charts reflect the added `s-7` joins and settled transactions (`t-nw-1`, `t-nw-2`).

### 15. Scenario — High Demand
- **File**: [`15-scenario-high-demand.png`](15-scenario-high-demand.png)
- **Route**: `/missions` after selecting *High Demand*
- **Asserted**: `b-hd-1` present; `s-2` flipped `almost-full → full`, `s-8` flipped to `almost-full`, waitlists growing, `Sat` analytics lifted.

### 16. Scenario — Waitlist Active
- **File**: [`16-scenario-waitlist-active.png`](16-scenario-waitlist-active.png)
- **Route**: `/bookings` after selecting *Waitlist Active*
- **Asserted**: waitlist-promoted count = 4 (`b-w1`, `b-w2`, `b-w3`, `b-w8`), offers expiring 19:45.

### 17. Scenario — Safety Incident
- **File**: [`17-scenario-safety-incident.png`](17-scenario-safety-incident.png)
- **Route**: `/people` after selecting *Safety Incident*
- **Asserted**: `i-si-1` present (high severity, escalated), `s-1` weatherRisk `high`, safety signal raised.

### 18. Central-state updates (cross-page)
- **File**: [`18-central-state-updates.png`](18-central-state-updates.png)
- **Route**: `/notifications` after selecting *High Demand*
- **Scenario**: scenario mutations flow into every page — signals list shows the FULL / almost-full alerts raised by the scenario transform. Proves one store, one source of truth.

### 19. Reset behavior
- **File**: [`19-reset-behavior.png`](19-reset-behavior.png)
- **Route**: `/` after applying *High Demand* then clicking **Reset demo**
- **Asserted**: `b-hd-1` removed and seeded `b-80` restored — `resetDemoData` writes the pristine seed back to `xos.prototype.state`.

### 20. Refresh persistence
- **File**: [`20-refresh-persistence.png`](20-refresh-persistence.png)
- **Route**: `/bookings` after Strike + full browser reload
- **Asserted**: checked-in count stayed 15 → 15 after `page.reload()`; mutations survive reload through `xos.prototype.state`.

### 21. Login
- **File**: [`21-login.png`](21-login.png)
- **Route**: `/login`
- **Scenario**: unauthenticated entry; `xos.pending` → `/otp` (`123456`) → `/verifying` → console. Captured for the SA-P2B walkthrough flow.

## Gate notes

- Gate 1 (TypeScript): pass — `tsc --noEmit` clean
- Gate 2 (Lint): pass — `next lint` clean
- Gate 3 (Build): pass — `next build` 18 static routes
- Gate 4 (Dev server): pass — served on port 3100
- Gate 5 (Routes): pass — all 12 console routes returned 200 / rendered content
- Gate 6 (Chrome walkthrough): pass — this archive (routes 01–12)
- Gate 7 (Scenario walkthrough): pass — this archive (13–18: demo controller, 4 scenarios, cross-page updates)
- Gate 8 (Reset & persistence): pass — this archive (19–20)
- Gate 9 (Auth flow): pass — `/login` renders (21); OTP `123456` accepted in prior interaction checks
- Gate 10 (No disconnected mock data): pass — `lib/data/mock.ts` pruned to reference/auth tables only (`OPERATORS`, `ROLES`, `TERRITORIES`, `territoryById`)
- Gate 11 (State validator): pass — `StateValidatorPanel` renders in dev; 8 rule families report zero errors on seed and on every scenario
