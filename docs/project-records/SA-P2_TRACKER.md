# SA-P2 Tracker — Operations Workflows (Milestone 2)

> **Status:** Live project record (maintained).
> **Owner:** Engineering (prototype → demo-grade operations flows).
> **Scope:** `apps/operations-web` (Next.js + TypeScript frontend-only prototype).

---

## 1. Approval status

The SA-P2 tracker is **approved** with the following mandatory corrections.

1. **SA-P2B must include real sub-routes.** City and Playing Area must not remain embedded panels. They must be explicit routes (see §4-B).
2. **SA-P2D through SA-P2H must list the full flow.** The tracker explicitly lists every item in each milestone (see §4-D … §4-H).
3. **Every internal milestone needs a hard gate.** Each milestone SA-P2A → SA-P2I must pass all 12 gates (§3) before the next milestone begins.

**Do not remove any existing tracker item.** Items are only ever added or marked complete.

---

## 2. Milestone index

| ID | Milestone | Status |
| --- | --- | --- |
| SA-P2A | Foundation & central state | **Complete** |
| SA-P2B | Franchise, territory, city, venue & playing-area setup (real sub-routes) | **Complete** |
| SA-P2C | Catalog: categories, experience templates & pricing | **Complete** |
| SA-P2D | Session scheduling & detail workspace | Not started |
| SA-P2E | Booking, capacity, waitlist & money | Not started |
| SA-P2F | Temporary IDs, teams, reveal & check-in | Not started |
| SA-P2G | Live operations & session completion | Not started |
| SA-P2H | Tournaments, refunds & safety incidents | Not started |
| SA-P2I | Integration, audit & demo hardening | Not started |

---

## 3. Hard gate (Correction 3 — applies to every milestone)

For **every** milestone SA-P2A through SA-P2I, all of the following must pass before the next milestone begins:

1. TypeScript passes
2. Lint passes
3. Production build passes
4. Development server runs
5. All new routes return successfully
6. Chrome walkthrough completed
7. Screenshots captured
8. Prototype implementation state updated
9. Known limitations recorded
10. No disconnected mock data
11. No non-functional primary action
12. No claim of backend or production security

> Do not wait until SA-P2I to discover broken earlier workflows.

---

## 4. Milestone detail

### 4-A. SA-P2A — Foundation & central state

**State:** Complete (2026-08-05). Completion contract below; hard gate 1–12 all passed, including the SA-P2A part-2 evidence pass (27 in-browser assertions).

1. **Files created** (mandated folder layout under `lib/prototype/`)
   - `lib/prototype/entities.ts` — normalized entity layer (`Franchise` → `PromoCode`, 20 types)
   - `lib/prototype/seed.ts` — deterministic seed (16 slices; see counts below)
   - `lib/prototype/selectors/{status,lookups,views,index}.ts` — pure selectors: status sets + all `*Views`
   - `lib/prototype/services/{helpers,create,bookings,operations,money,catalog,index}.ts` — pure service commands (id/audit/signal generation via `helpers`)
   - `lib/prototype/validators/index.ts` — `validatePrototypeState` + `validationSummary`, 8 rule families
   - `lib/prototype/scenarios/{state,initial,definitions,index}.ts` — `PrototypeState`, `getInitialState`, `SCENARIOS` (10), `applyScenario`
   - `lib/prototype/persistence/index.ts` — `loadPrototypeState` (deep-merge), `savePrototypeState`, `clearPrototypeState`, `loadDemoStep`, `saveDemoStep`
   - `lib/prototype/repositories/index.ts` — facade re-exporting `selectors` + `services` (keeps `@/lib/prototype/repositories` import path stable)
   - `lib/prototype/index.ts` — public barrel
   - `components/dev/StateValidatorPanel.tsx` — live validator UI (dev-only, bottom-left in `AppShell`)
   - `docs/project-records/SA-P2_TRACKER.md`
   - `docs/prototype-evidence/sa-p2a/` (README + 21 screenshots)
2. **Files modified**
   - `lib/store.tsx` — slimmed to coordination/persistence only: hydrates via `loadPrototypeState()`, every action is a service-backed commit, single `commit(fn)` primitive; no business logic in the store
   - `components/shell/DemoWalkthroughPanel.tsx` — full 17-step walkthrough (milestone, open route, mark reviewed, back/next, step list, scenario picker, reset demo)
   - `components/shell/CommandPalette.tsx` — migrated from `@/lib/data/mock` to `territoryViews(state)` + `switchTerritory(t.id)`
   - `lib/data/mock.ts` — pruned to reference/auth tables only
   - `lib/types.ts`, `components/ui/primitives.tsx` (status tone map), all 12 console pages, `TerritorySwitcher.tsx`
3. **Normalized entities created** — `Franchise`, `Territory`, `City`, `Venue` (+`status`), `PlayingArea`, `ActivityCategory`, `ExperienceTemplate`, `ScheduledSession` (+`SessionStatus` union, `Booking`+`team`), `Booking` (+`BookingStatus`, `waitlistOrder`, `waitlistOfferExpiresAt`), `CrewMember`, `Shift`, `Tournament`, `Match`, `Transaction`, `Incident`, `Signal`, `AuditEvent`, `DayPoint`, `PromoCode`
4. **Seed entities created (updated)** — 2 franchises (`f-1`, `f-2` Coastal Sports Collective), 3 territories, 3 cities, 6 venues, 7 playing areas, 5 categories (`+cat-5` Foosball), 6 templates (`+et-6` Foosball Fiesta, tempId `FS-##`), 19 sessions (`s-2`→almost-full, `+s-13` Board Games at blr-south), 78 bookings (incl. waitlists + `b-80` payment-failed on `s-8`), 8 crew, 7 shifts, 6 tournaments, 12 transactions, 4 incidents, 8 signals, 5 audits, 7 day-points, 4 promos
5. **Repository/service abstractions created** — lookups, `SessionView`, `BookingView`, `TerritoryView` (+`territoryViews`, `cityViews`, `venueViews`, `playingAreaViews`, `franchiseViews`), `CatalogView`, `TransactionView`, `IncidentView`, `CrewView`, `TournamentView`, `activePromos`, status sets (`SEAT_STATUSES`, `WAITLIST_STATUSES`, `LIVE_STATUSES`); service commands: `createFranchise/Territory/City/Venue/PlayingArea/Category/Template/Session/Booking`, `confirmBooking`, `promoteWaitlistUser`, `strikeBooking`, `cancelBooking` (+queued refund), `seatsForSession`, `waitlistForSession`, `waitlistPromotionEligible`, `generateTemporaryIds`, `allocateTeams`, `completeSession`, `cancelSession`, `updateSessionStatus`, `updateMatchScore`, `simulateRefund`, `retryPayment`, `toggleTemplate`
6. **Validator completed** — `validatePrototypeState` covers 8 rule families: duplicate IDs, missing references, city–territory, venue↔city, playing-area compatibility, capacity overflow/status, orphan transactions, invalid matches. Zero errors on seed and on every scenario (verified via `StateValidatorPanel`).
7. **Scenario engine completed (10 scenarios)** — `SCENARIOS` + `applyScenario(name, state)`: Normal Weekend, New City Launch (Chennai + `s-14`), High Demand, Waitlist Active, Staff Shortage, Venue Conflict, Payment Failure, Weather Cancellation, Safety Incident, Tournament Day. Each writes ids/audits/signals consistently; applied through the demo controller picker.
8. **Persistence behavior** — `xos.prototype.state` written on every mutation via `savePrototypeState`; `loadPrototypeState` deep-merges over `getInitialState()` per slice so missing keys rehydrate safely. Verified: Strike → reload keeps `checked-in`.
9. **Reset behavior** — `resetDemoData` restores fresh seed and resets walkthrough step + reviewed marks. Verified: scenario state fully reverted (`b-hd-1` gone, seed `b-80` restored).
10. **Demo walkthrough behavior** — 17 steps, `xos.prototype.walkthrough_step` + `xos.prototype.walkthrough_reviewed` persisted; `DemoWalkthroughPanel` reads them; every step opens a real route.
11. **Existing components migrated to central state** — all 12 console pages + `TerritorySwitcher` + `CommandPalette` read from `state` via repository selectors; no page touches `repos`
12. **Type-check result** — pass (`tsc --noEmit`)
13. **Lint result** — pass (`next lint`, no warnings)
14. **Build result** — pass (`next build`, 18 static routes)
15. **Browser result** — 12/12 console routes render content, authed, no `PermissionDenied`; 27/27 assertions pass: routes, demo controller (17 steps + scenario picker), Normal Weekend, High Demand, Waitlist Active (4 promoted), Safety Incident, cross-page central-state updates, reset behavior, refresh persistence (checked-in 15 → 15), login render
16. **Exact SA-P2B entry plan** (see §4-B)
    - Begin with the **franchise list route** `/franchises` (search/filter/status/scope, primary action, empty+error states) wired through `franchiseViews(state)`.
    - Then add explicit sub-routes: `/territories/[id]/cities/new`, `/cities/[id]`, `/locations/venues/[id]/playing-areas/new`, `/locations/playing-areas/[id]`.
    - New city must be immediately selectable in venue creation; new playing area must be immediately selectable in session scheduling.
    - Reuse existing store add-actions (`addFranchise`, `addCity`, `addVenue`, `addPlayingArea`) already wired to central state + persistence.
    - Run the 12-point hard gate again before SA-P2C begins.

### 4-B. SA-P2B — Franchise, territory, city, venue & playing-area setup

> **Correction 1 (mandatory):** City and Playing Area must NOT remain embedded panels. They get explicit routes.

**State:** Complete (2026-08-05). Hard gate 1–12 all passed; 21-step in-browser walkthrough green (21/21 assertions, 21 screenshots in `docs/prototype-evidence/sa-p2b/`).

1. **Routes created (14)** — `/franchises`, `/franchises/new`, `/franchises/[id]`, `/territories`, `/territories/new`, `/territories/[id]`, `/territories/[id]/cities/new`, `/cities/[id]`, `/locations`, `/locations/venues`, `/locations/venues/new`, `/locations/venues/[id]`, `/locations/venues/[id]/playing-areas/new`, `/locations/playing-areas/[id]`. City and Playing Area are explicit routes (Correction 1 satisfied).
2. **Services added** (`lib/prototype/services/geo.ts`) — `createFranchise`, `createTerritory`, `createCity`, `createVenue`, `createPlayingArea`, `changeFranchiseStatus`, `changeTerritoryStatus`, `changeCityStatus`, `changeVenueStatus`, `changePlayingAreaStatus`, `assignTerritoryManager`, `changeFranchiseHead`, `addVenueSafetyNote`, `addOperationalNote` — every mutation persists + appends an audit entry inside the service; no page mutates entities directly.
3. **Selectors added** (`lib/prototype/selectors/geo.ts`) — `franchiseRows`, `franchiseDetail`, `territoryRows`, `territoryDetail`, `cityDetail`, `venueDetail`, `playingAreaDetail`, `territoryViews` (+ fixed `SessionView.playingAreaId` resolution); list rows power search/filter/table views.
4. **Validators added** (`lib/prototype/validators/index.ts`) — franchise→territory reference, territory↔city reference, venue↔city/territory reference, playing-area→venue reference, capacity ceiling (PA ≤ venue safety capacity), name-uniqueness scoped per parent.
5. **Flow results (browser-verified)** — franchise create → appears in list → selectable in territory wizard (connected workflow); territory create → appears in switcher + city wizard; city create → appears in venue wizard city select; venue create → appears in city + territory views; playing-area create → appears in venue detail. New PA `pa-8` at cap 40 within venue safety 120.
6. **Cross-module updates** — `lib/nav.ts` `/franchises` + `/territories` in `NAV`, `canAccess` rewritten for sub-routes; `Sidebar.tsx` icons + sub-route active state; `/locations` links venue rows to `/locations/venues/[id]` and "Manage venues" → `/locations/venues`.
7. **Store wiring** — 15 geo callbacks + `Prototype*` aliases via single `commit(fn)`; territory resolution fixed so new prototype territories resolve in the switcher (merged `{ id, name, code }` from the prototype territory, `TerritoryId` cast kept for the legacy union).
8. **Persistence result** — all 5 created records (f-3/t-1/c-1/v-7/pa-8) survive hard reload.
9. **Reset result** — demo reset removes all created records and restores seed (f-1 back, f-3 gone).
10. **Role scoping result** — switch to Regional Franchise Partner removes `Pause franchise` (1→0) and `New franchise`; role lane note shown. Gates via `lib/geo/access.ts` (`geoCan`) across all 14 pages.
11. **Territory scoping result** — sidebar switcher lists the new prototype territory and selection changes scope (e.g. `/money` overline follows the active territory).
12. **Gates** — 1 typecheck pass, 2 lint pass, 3 production build pass (24 static pages + 5 dynamic routes), 4 dev server on :3100, 5 all 14 routes return 200, 6 Chrome walkthrough 21/21, 7 screenshots captured, 8 prototype state doc updated, 9 limitations recorded (below), 10 no disconnected mock data, 11 all primary actions functional, 12 no backend/security claims.
13. **Shared geo UI** — `components/geo/layout.tsx` (`PageFrame`, `Breadcrumbs`, `PrototypeNote`, `PrototypeRoleNote`, `Proto`, `Row`, `KVGrid`, `CatChips`), `components/geo/WizardShell.tsx` (wizard shell + `useWizard`), `components/geo/ConfirmAction.tsx` (confirm dialog for pause/resume/close/reopen).
14. **Known limitations (SA-P2B)** — commercial fields are `<Proto />` placeholders (no legal contract/settlement/payout); venue map is a placeholder (no live map); no Firebase/Postgres/real auth; restricted actions show role-simulation disclosure, never production authorization; legacy `TerritoryId` union still typed in `lib/types.ts` (prototype territories resolve via the store merge); scenario `definitions.ts` reuses `v-7`/`pa-8` ids in a separate dataset (no collision in seed flow).
15. **Missing / deferred to SA-P2C/D** — category & template creation (SA-P2C); new PA selectable in session scheduling (SA-P2D `/missions/new`); franchise editing beyond head/status; city editing; cross-franchise territory transfer.
16. **SA-P2C entry plan** — begin with the category list route `/catalog/categories` (search/filter/status/scope, primary action, empty+error states) wired through `catalogViews(state)`; then `/catalog/categories/new` + `/catalog/categories/[id]`; then template list/create/detail with draft→active→archived lifecycle and pricing/break-even preview; reuse `createCategory`/`createTemplate` store actions; run the 12-point hard gate before SA-P2D begins.

**Entry: franchise list route (`/franchises`)** — search/filter/status/scope, primary action, empty + error states, wired through `franchiseViews(state)`.

**Explicit sub-routes:**
- `/territories/[id]/cities/new` — create a city under a territory
- `/cities/[id]` — city detail/workspace
- `/locations/venues/[id]/playing-areas/new` — create a playing area under a venue
- `/locations/playing-areas/[id]` — playing-area detail/workspace

**Flow guarantees:**
- A newly created city must **immediately** be available to venue creation.
- A newly created playing area must **immediately** be available to session scheduling.

**Also covered (existing items, not removed):**
- Franchise creation / editing
- Territory creation / editing
- Venue creation / editing with safety constraints
- Franchise–territory assignment
- City manager assignment and supported categories
- Territory switcher reflects new territories
- Venue capability, hours, cost and verification status

### 4-C. SA-P2C — Catalog: categories, experience templates & pricing

**State:** Complete (2026-08-05). Hard gate 1–12 all passed; 30-gate in-browser walkthrough
green (30/30 assertions, 29 screenshots in `docs/prototype-evidence/sa-p2c/`).

1. **Routes created** — `/catalog` (command overview: stats + shelf rule + category cards,
   replaced the legacy list), `/catalog/categories`, `/catalog/categories/new`,
   `/catalog/categories/[id]`, `/catalog/experiences`, `/catalog/experiences/new`,
   `/catalog/experiences/[id]`, `/catalog/experiences/[id]/preview` (customer preview lane),
   `/catalog/experiences/[id]/versions` (version-history review lane).
2. **Category lifecycle** — 4-step wizard (identity → capacity → venue types → review) with
   Save as draft; detail page with status chip, edit-form validation, `Activate category`,
   `Pause category` (confirm dialog, blocking signal names active dependents), `Resume
   category`; shelving is pause/resume, never delete. Draft categories are excluded from the
   template wizard's category select until activated (connected workflow).
3. **Template lifecycle** — 6-step wizard (format/category → capacity → timing → pricing →
   operations & safety → review) gated by Part 12 validators; review step shows schedulability
   readiness; `Save as draft`; detail page with `Activate template` (hidden when no compatible
   venue), `Pause template` / `Resume template` (confirm dialog), `Duplicate template`,
   `Versions`, `Customer preview`.
4. **Schedulability engine** — `templateReadiness` / `templateIsSchedulable` /
   `unschedulableTemplates` / `templateVersions` / `templateEconomics` / `visibleTemplates` /
   `catalogWarnings` in `lib/prototype/selectors/catalog.ts`; draft or venue-incompatible
   templates are not schedulable, hidden from the Schedulable-only filter, and blocked from
   activation with critical errors listed.
5. **Versions** — `templateVersions` + `operatorName` render ver-1/ver-2 rows with change
   reasons and changed-field lists; `Draft from v{v}` restores a template snapshot as a new
   draft via `duplicateTemplateVersion` (returns to `/catalog/experiences`).
6. **Customer preview** — `customerPreview` selector renders a mobile listing card plus
   Before-reveal / After-reveal / Never-revealed panels with INR formatting; owned by the
   marketing lane (`catalog-preview` gate).
7. **Role lanes & scope** — `catalog-preview` and `catalog-versions` gates via
   `lib/geo/access.ts`; Finance Manager sees the blocked preview lane, Venue Manager sees the
   blocked versions lane plus a scoped catalog (only templates compatible with one of their
   venues; `New template` and `Versions` hidden, `Customer preview` kept). All restricted
   actions show "Prototype role simulation — not production authorization."
8. **Part 12 form validators** — `validateCategoryForm` + `validateTemplateForm` in
   `lib/prototype/validators/index.ts` (missing/duplicate names+codes, age/participant ranges,
   capacity equation min ≤ target ≤ max, break-even feasibility at min and max, staffing
   roles, reveal-privacy never-revealed overlap, data-retention placeholder, legal review
   pending — critical blocks activation, warnings permit draft); validators re-exported
   through the `lib/prototype/repositories` barrel.
9. **Walkthrough** — `DemoWalkthroughPanel` STEPS extended to 29 with 12 Catalog/Review
   insertions (`/catalog`, `/catalog/experiences`, `/catalog/experiences/et-7`,
   `/catalog/experiences/et-1/preview`, `/catalog/experiences/et-1/versions`,
   `/catalog/experiences/et-8`, `/catalog/experiences/et-3`, `/catalog/categories`,
   `/catalog/categories/cat-cricket`).
10. **Evidence harness** — `evidence-sa-p2c.js` (Playwright, 1440x900, auth `op-1` /
    Platform Owner, territory `hvd-central`) — 30 gates green: seeded overview/categories,
    draft filter, can-schedule column, schedulable-only filter, category wizard/created/
    activated/wired-to-templates, template wizard gate, draft readiness, activation venue
    gate, et-7 activate/schedulable, pause/resume template, customer preview, preview lane
    gate (Finance), version history, restore-from-version, duplicate, category pause/resume,
    Venue-Manager scoped visibility + role restriction + versions lane gate, demo reset, seed
    restore. 29 screenshots captured.
11. **Gate evidence** — 1 typecheck pass, 2 lint pass, 3 production build pass (27 static
    pages + 7 dynamic routes incl. preview/versions), 4 dev server on :3100, 5 all new routes
    return successfully, 6 Chrome walkthrough 30/30, 7 screenshots captured, 8 prototype
    state doc updated, 9 limitations recorded (below), 10 no disconnected mock data, 11 all
    primary actions functional, 12 no backend/security claims.
12. **Known limitations (SA-P2C)** — pricing/break-even/tax/platform-fee remain `<Proto />`
    editorial placeholders until SA-P2E; no real commerce/legal settlement; category
    compatibility is static (declared venue types) until session scheduling (SA-P2D) uses it;
    version history is a read-only snapshot list (no audit-immutability enforcement beyond the
    prototype); no production authorization (role gates are prototype simulation).
13. **SA-P2D entry plan** — session scheduling reuses the now-schedulable template set:
    `/missions/new` must offer only `templateIsSchedulable` templates, seed `et-7` and the
    venue-compatible activated templates; pricing preview flows from `templateEconomics`;
    category–venue compatibility hints power venue/PA selection; run the 12-point hard gate
    before SA-P2D begins.

### 4-D. SA-P2D — Session scheduling & detail workspace

> **Correction 2 (mandatory):** Full flow must be explicit. Session sub-routes are `/missions/...`.

- Session creation wizard
- Experience selection
- Territory, city, venue and playing-area selection
- Date, time, duration and timezone
- Booking open and close times
- Reveal time
- Capacity settings
- Price and break-even preview
- Staffing requirements
- Mock conflict detection
- Operational checklist
- Draft save
- Publish action
- Reschedule action
- Cancellation flow
- Session lifecycle state machine

**Session sub-routes:**
- `/missions/[id]`
- `/missions/[id]/bookings`
- `/missions/[id]/waitlist`
- `/missions/[id]/teams`
- `/missions/[id]/reveal`
- `/missions/[id]/check-in`
- `/missions/[id]/live`
- `/missions/[id]/money`
- `/missions/[id]/safety`
- `/missions/[id]/audit`

### 4-E. SA-P2E — Booking, capacity, waitlist & money

- New booking simulation
- Admin-created booking
- Complimentary booking
- Reservation created
- Payment pending
- Payment confirmed
- Payment failed
- Reservation expiry
- User cancellation
- Company cancellation
- No-show
- Waitlist join
- Waitlist ordering
- Waitlist promotion
- Offer countdown
- Offer acceptance
- Offer expiry
- Capacity ledger
- Full refund
- Partial refund
- Failed refund
- Retry simulation
- Payment reconciliation
- Money and audit updates

### 4-F. SA-P2F — Temporary IDs, teams, reveal & check-in

- Temporary ID configuration
- ID preview
- Generate IDs
- Regenerate before lock
- Lock IDs
- Team count and size selection
- Animated random allocation
- Manual participant movement
- Re-run allocation
- Lock teams
- Reveal readiness checklist
- Reveal preview
- Trigger reveal
- Delay reveal
- Cancel reveal
- QR check-in simulation
- Temporary-ID search
- Checked in
- Late
- Missing
- No-show
- Denied
- Staff check-in
- Emergency identity access simulation

### 4-G. SA-P2G — Live operations & session completion

- Session clock
- Staff attendance
- Current match
- Score recording
- Operational notes
- Equipment issue
- Safety signal
- Pause session
- Resume session
- Emergency mode
- End session
- Completion checklist
- Attendance finalization
- Score finalization
- Incident review
- Equipment return
- Staff notes
- Refund exception review
- Session summary
- Revenue summary
- Attendance report
- Analytics update

### 4-H. SA-P2H — Tournaments, refunds & safety incidents

- Tournament creation
- Team assignment
- Bracket generation
- Match scheduling
- Referee assignment
- Score submission
- Score correction
- Walkover
- Disqualification
- Abandoned match
- Winner advancement
- Winner declaration
- Tournament completion
- Refund workspace
- Payment reconciliation workspace
- Incident list
- Incident creation
- Incident detail
- Incident lifecycle:
  - Reported
  - Triaged
  - Active
  - Escalated
  - Monitoring
  - Resolved
  - Closed
- Masked sensitive information
- Audited-access simulation

### 4-I. SA-P2I — Integration, audit & demo hardening

- Full walkthrough from franchise creation to session completion
- Cross-module data consistency checks
- Audit trail completeness
- Reset / demo hygiene
- Evidence archive (screenshots per milestone)
- Known-limitation register consolidated
- Production handoff notes updated

---

## 5. Working notes

- All state is frontend-only, persisted to `localStorage`. No backend or production security claims are made anywhere in this tracker or the code.
- Existing tracker items are never deleted; corrections only add or refine items.
- **SA-P2A (2026-08-05):** Central state lives in `lib/prototype/{entities,seed,selectors,services,validators,scenarios,persistence,repositories}`; all console pages read through repository selectors. `lib/store.tsx` is coordination/persistence only (single `commit(fn)` primitive). `lib/data/mock.ts` holds only reference/auth tables (`OPERATORS`, `ROLES`, `TERRITORIES`, `territoryById`). Evidence: `docs/prototype-evidence/sa-p2a/` (README + 21 screenshots, 27/27 assertions green).
- **Known limitations (SA-P2A):** Dashboard quick-action "Strike" is a visual flash (real check-in is on `/bookings` and the mission drawer); tournaments render bracket cards read-only until SA-P2H; scenario transforms are additive snapshots over the seed (idempotency handled per scenario, not globally); `lib/store.tsx` keeps a local `SEED_TERRITORIES` fallback array used only when the prototype territory id is missing (could be collapsed to a single fallback during SA-P2B polish).
- **SA-P2B (2026-08-05):** 14 route pages (franchise/territory/city/venue/playing-area clusters) with wizard creation, detail workspaces, status actions and role gates via `lib/geo/access.ts` (`geoCan`). Mutations flow through `lib/prototype/services/geo.ts` (audit + persist inside services). Evidence: `docs/prototype-evidence/sa-p2b/` (README + 21 screenshots, 21/21 assertions green). The dev server was restarted mid-run (the long-running Next process had wedged and was 404-ing its own chunks); restart cleared it, no code change required.
- **SA-P2C (2026-08-05):** Catalog cluster complete — category + template wizards and detail pages with draft→activate→pause/resume lifecycle, schedulability + venue-compatibility gating, customer-preview and version-history lanes with role gates, Part 12 form validators, 29-step walkthrough, and the `evidence-sa-p2c.js` harness (30/30 gates green, 29 screenshots). Evidence: `docs/prototype-evidence/sa-p2c/` (README + 29 screenshots). Harness selector notes: `.overline` uppercases (assert `innerText` as uppercase); `switchRole` returns to Platform Owner while `switchRoleSticky` stays on the chosen role (use `backToPlatform` to restore); wizard "Next" needs 5 clicks to reach the review step.
