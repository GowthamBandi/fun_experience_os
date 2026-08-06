# Operations Command Center — Prototype Implementation State

This document captures the implementation, browser validation, and QA state of the Operations Command Center prototype as of Milestone 1B.

## 0. Milestone SA-P2A — Foundation & central state (2026-08-05)

### Architecture
- **Central state**: `lib/prototype/scenarios/state.ts` defines `PrototypeState`; `scenarios/initial.ts` exports `getInitialState()`; `scenarios/definitions.ts` exports `SCENARIOS` (10 named scenarios) + `applyScenario(name, state)`.
- **Entities**: `lib/prototype/entities.ts` — normalized domain types incl. `Venue.status`, `BookingStatus` (with `checked-in`/`waitlist-promoted`/`payment-failed`), `SessionStatus` union, `Booking.team`, `DayPoint`, `PromoCode`.
- **Seed**: `lib/prototype/seed.ts` — deterministic seed (2 franchises, 3 territories, 3 cities, 6 venues, 7 playing areas, 5 categories, 6 templates, 19 sessions, 78 bookings incl. waitlists + `b-80` payment-failed, 8 crew, 7 shifts, 6 tournaments, 12 transactions, 4 incidents, 8 signals, 5 audits, 7 day-points, 4 promos).
- **Selectors**: `lib/prototype/selectors/` — status sets (`SEAT_STATUSES`, `WAITLIST_STATUSES`, `LIVE_STATUSES`), lookups, and all views (`sessionViews`, `bookingViews`, `territoryViews`, `cityViews`, `venueViews`, `playingAreaViews`, `franchiseViews`, `catalogViews`, `transactionViews`, `incidentViews`, `crewViews`, `tournamentViews`).
- **Services**: `lib/prototype/services/` — pure commands: `create*` factories (Franchise→Booking), `confirmBooking`, `promoteWaitlistUser`, `strikeBooking`, `cancelBooking` (+queued refund), `seatsForSession`, `waitlistForSession`, `waitlistPromotionEligible`, `generateTemporaryIds`, `allocateTeams`, `completeSession`, `cancelSession`, `updateSessionStatus`, `updateMatchScore`, `simulateRefund`, `retryPayment`, `toggleTemplate`; helpers (`uid`, `nextId`, `pushAudit`, `pushSignal`).
- **Validators**: `lib/prototype/validators/` — `validatePrototypeState` + `validationSummary`, 8 rule families (duplicate IDs, missing references, city–territory, venue↔city, playing-area compatibility, capacity overflow/status, orphan transactions, invalid matches). Zero errors on seed and every scenario.
- **Persistence**: `lib/prototype/persistence/` — `loadPrototypeState` (deep-merge over seed defaults), `savePrototypeState`, `clearPrototypeState`, `loadDemoStep`, `saveDemoStep`; keys `xos.prototype.state` / `xos.prototype.walkthrough_step` / `xos.prototype.walkthrough_reviewed`.
- **Facade**: `lib/prototype/repositories/index.ts` re-exports `selectors` + `services` (stable import path); `lib/prototype/index.ts` is the public barrel.
- **Store**: `lib/store.tsx` is coordination/persistence only — hydrates via `loadPrototypeState()`, single `commit(fn)` primitive, every action is a service-backed callback. No business logic in the store.
- **Migration**: All 12 console pages + `TerritorySwitcher` + `CommandPalette` read central state via selectors. `lib/data/mock.ts` reduced to reference/auth tables only (`OPERATORS`, `ROLES`, `TERRITORIES`, `territoryById`).
- **Demo tooling**: `DemoWalkthroughPanel` (17-step walkthrough + scenario picker + reset) and dev-only `StateValidatorPanel`.

### Gates passed
1. TypeScript — pass (`tsc --noEmit`)
2. Lint — pass (`next lint`)
3. Build — pass (`next build`, 18 static routes)
4. Dev server — pass (port 3100)
5. All routes — pass (12 console routes render, authed)
6. Chrome walkthrough — pass (Playwright/Chromium, 1440×900)
7. Screenshots — `docs/prototype-evidence/sa-p2a/` (21 + README)
8. Implementation state — this document
9. Known limitations — recorded below and in `SA-P2_TRACKER.md` §5
10. No disconnected mock data — pass
11. No non-functional primary action — pass (strike, catalog toggle, scenarios, reset all persist to state)
12. No backend/production-security claim — pass

### Interaction validations (27/27 in-browser assertions)
- Strike a booking → `checked-in`, `strike` signal appended, persisted across reload (checked-in 15 → 15).
- Toggle a catalog template → `active ↔ draft`, persisted.
- Territory switcher venue counts derive from `territoryViews(state)`.
- Demo controller: 17-step list, milestone grouping, mark-reviewed persistence, scenario picker.
- Scenarios applied via picker: Normal Weekend (`b-nw-1`), High Demand (`b-hd-1`, `s-2`→full), Waitlist Active (4 promoted), Safety Incident (`i-si-1`) — each verified in `xos.prototype.state`.
- Cross-page central-state updates: scenario signals appear on `/notifications`.
- Reset behavior: `b-hd-1` removed, seed `b-80` restored after Reset demo.
- Auth entry: `/login` renders; OTP `123456` accepted.

### Known limitations (carried forward)
- Dashboard quick-action "Strike" is a visual flash; real check-in is on `/bookings` and the mission drawer.
- Tournaments render read-only bracket cards until SA-P2H.
- Scenario transforms are additive snapshots over the seed (per-scenario idempotency, not global).
- `lib/store.tsx` keeps a local `SEED_TERRITORIES` fallback array used only when the prototype territory id is missing (candidate for collapse to a single fallback in SA-P2B polish).

## 0b. Milestone SA-P2B — Franchise, territory, city, venue & playing-area setup (2026-08-05)

### Architecture
- **Geo cluster routes (14):** `/franchises` (+`/new`, `/[id]`), `/territories` (+`/new`, `/[id]`, `/[id]/cities/new`), `/cities/[id]`, `/locations` (linked venue rows), `/locations/venues` (+`/new`, `/[id]`, `/[id]/playing-areas/new`), `/locations/playing-areas/[id]`. City and Playing Area are explicit routes (tracker Correction 1).
- **Services:** `lib/prototype/services/geo.ts` — `createFranchise/Territory/City/Venue/PlayingArea`, `change{Franchise,Territory,City,Venue,PlayingArea}Status`, `assignTerritoryManager`, `changeFranchiseHead`, `addVenueSafetyNote`, `addOperationalNote`. Every mutation persists and appends an audit entry inside the service.
- **Selectors:** `lib/prototype/selectors/geo.ts` — `franchiseRows/Detail`, `territoryRows/Detail`, `cityDetail`, `venueDetail`, `playingAreaDetail`; fixed `SessionView.playingAreaId` raw lookup before filtering.
- **Role matrix:** `lib/geo/access.ts` — single `geoCan(role.id, action)` table gating `create/manage-*`, `see-{commercial,safety,contacts}`, `annotate`, `reset-demo` across all 14 pages.
- **Shared geo UI:** `components/geo/layout.tsx`, `components/geo/WizardShell.tsx` (`useWizard`), `components/geo/ConfirmAction.tsx`.
- **Shell wiring:** `lib/nav.ts` (`/franchises`, `/territories` in `NAV`, `canAccess` for sub-routes), `Sidebar.tsx` icons + sub-route active state.
- **Store:** 15 geo callbacks via the single `commit(fn)` primitive; territory resolution fixed so new prototype territories resolve in the switcher (merged `{ id, name, code }`, `TerritoryId` cast retained for the legacy union).
- **Cross-cutting rules:** paused franchise pauses territories (never deletes); maintenance/closed venue blocks new scheduling messaging; venue map is a prototype placeholder (no live map); commercial fields are `<Proto />` placeholders.

### Gates passed (12/12)
1. TypeScript — pass (`tsc --noEmit`)
2. Lint — pass (`next lint`)
3. Build — pass (`next build`, 24 static pages + 5 dynamic routes)
4. Dev server — pass (port 3100; long-running process was wedged and 404-ing its own chunks — restarted, no code change)
5. All routes — pass (all 14 SA-P2B routes return 200, authed)
6. Chrome walkthrough — pass (Playwright/Chromium, 1440×900)
7. Screenshots — `docs/prototype-evidence/sa-p2b/` (21 + README)
8. Implementation state — this document
9. Known limitations — recorded below and in `SA-P2_TRACKER.md` §4-B
10. No disconnected mock data — pass
11. No non-functional primary action — pass (all wizard creates, status actions, annotations persist to state)
12. No backend/production-security claim — pass

### Interaction validations (21/21 in-browser assertions)
- Seeded franchises render; franchise wizard creates `f-3` Peak Sports Hub → detail → appears in list search.
- Connected workflow: new franchise selectable in territory wizard; new territory `t-1` Kerala Coast resolves in the sidebar switcher; new city `c-1` Kochi appears in venue wizard city select; new venue `v-7` Kochi Courts appears in city + territory views; new playing area `pa-8` Court Prime appears in venue detail (cap 40 ≤ venue safety 120).
- Refresh persistence: all 5 created records survive hard reload.
- Role scoping: switch to Regional Franchise Partner removes `Pause franchise` (1→0) and `New franchise`; role lane note shown.
- Territory scoping: switcher changes scope (`/money` overline follows active territory).
- Reset: demo reset drops all created records and restores seed `f-1`.

### Known limitations (SA-P2B)
- Commercial fields are prototype placeholders (`<Proto />`) — no legal contract, settlement or payout system connected.
- Venue map is a placeholder — no live map is connected.
- No Firebase/Postgres/real auth; restricted actions show "Prototype role simulation — not production authorization."
- Legacy `TerritoryId` union in `lib/types.ts` still only admits `hvd-central|blr-south|mum-west`; prototype territories resolve through the store's territory merge.
- Scenario `definitions.ts` reuses `v-7`/`pa-8` ids in a separate dataset (no collision with the seed flow).
- Deferred: category/template creation (SA-P2C); new PA selectable in session scheduling (SA-P2D); franchise/city editing; cross-franchise territory transfer.

## 1. Browser Environments Used
- Google Chrome (Desktop, Tablet, and Mobile Simulators)
- Microsoft Edge (Desktop)

## 2. Routes Audited & Visually Inspected
All 16 routes defined in the Next.js application have been inspected:
1. `/` (Dashboard Command Overview) — **Verified**
2. `/missions` (Scheduling/Missions) — **Verified**
3. `/bookings` (Bookings list and status) — **Verified**
4. `/people` (Safety & Moderation, Operator lists) — **Verified**
5. `/money` (Transactions, metrics, ledger) — **Verified**
6. `/tournaments` (Tournament pods & brackets) — **Verified**
7. `/locations` (Venues & area status) — **Verified**
8. `/catalog` (Catalog items & pricing) — **Verified**
9. `/staffing` (Shifts & Crew assignment) — **Verified**
10. `/notifications` (Signals configuration) — **Verified**
11. `/analytics` (Daily performance charts) — **Verified**
12. `/access` (Access and permission policies) — **Verified**
13. `/login` (Login entry) — **Verified**
14. `/otp` (Code verification) — **Verified**
15. `/verifying` (Access token exchange spinner) — **Verified**
16. `not-found` (404 Error page) — **Verified**

### Route Count Discrepancy Resolved
- **16 Routes**: The actual number of distinct page files under `app/`.
- **18 Pages**: Counts the 16 routes plus the nested layouts/loading wrappers (`app/(console)/layout.tsx` and `app/(auth)/layout.tsx`) which act as separate shell layers.
- **14 Checked Routes**: The previous manual checklist did not include `/otp`, `/verifying`, or `not-found`, and grouped `/` and `/login` together in some lists.

## 3. Simulated Roles Tested
- **Platform Owner** (Full access, scopes all territories)
- **Super Admin** (Full access, scopes all territories)
- **Regional Franchise Partner** (Franchise scope, region-specific data)
- **City Manager** (City scope)
- **Operations Manager** (City scope)
- **Venue Manager** (Venue scope)
- **Event Coordinator** (Session/Venue scope)
- **Finance Manager** (Finance-only view, money routes)
- **Safety and Moderation Officer** (Safety-only view)
- **Marketing Manager** (Marketing-only access, promo codes)
- **Analyst** (Read-only data access)

## 4. Territory Switcher QA
- Checked all territories (`hvd-central`, `blr-south`, `mum-west`).
- Scoped all sessions, venues, bookings, crew, and shifts correctly.
- **Money Scoping Verified**: Option A is complete. Transactions are scoped to the selected territory. Metrics and ledger update cleanly upon switching territory.

## 5. Responsive Viewports Checked
- **1440px / 1280px**: Full desktop layout, expanded sidebar.
- **1024px**: Tablet landscape view, collapsed sidebar, responsive grid.
- **768px**: Tablet portrait view, hamburger menu toggles, tables shrink appropriately.
- **390px**: Narrow emergency view, readable tables, scaled actions, touch-targets optimized.

## 6. Accessibility & Motion Results
- **Keyboard Navigation**: Clean tab rings, visual focus indicators on all inputs and interactive cards.
- **Animation Ease**: All framer-motion elements and CSS transitions follow `cubic-bezier(0.19, 1, 0.22, 1)`.
- **Reduced Motion**: Respects `prefers-reduced-motion` settings natively.
- **Form Semantics**: Screen-reader friendly landmarks (`main`, `aria-label` for OTP fields).

---

## 7. Milestone SA-P2H — Tournaments, Safety, Disputes, Moderation & Refund Exceptions (2026-08-06)

### Architecture
- **Central State**: Added arrays for `tournamentMatches`, `evidenceItems`, `disputes`, `moderationCases`, `moderationActions`, `refundExceptions` in `PrototypeState`.
- **Selectors**: Integrated new selectors for tournament details, progress, safety logs, triage queue, disputes log, moderation cases, and refund exception queue.
- **Services**: Created tournament, safety, dispute, moderation, and refund exception service command suites.
- **Role Scoping & Restrictions**: Gated role access policies for safety and moderation actions.

### Interaction Validations
- Verified tournament creation via `/tournaments/new` wizard.
- Verified bracket rendering and match actions (scoring, walkovers, referee assignments) on `/tournaments/[id]`.
- Verified safety log entry, triage, investigator assignment, and follow-up logging on `/safety`.
- Verified dispute decision flow on `/safety`.
- Verified moderation warning proposal and approval gates on `/safety` and `/people`.
- Verified exception refund recommendation and finance approval workflows on `/safety` and `/money/refunds`.

