# SA-P2B Walkthrough Evidence — Franchise, Territory, City, Venue & Playing-Area Operations

21-step Playwright walkthrough of the SA-P2B cluster in `apps/operations-web`. Every step
asserts a state change and captures a screenshot. All 21 gates green on the run that
produced these images.

- Harness: `C:\Users\Gowtham\AppData\Local\Temp\opencode\pw\evidence-sa-p2b.js`
- Run: `node evidence-sa-p2b.js` with the dev server on `http://localhost:3100`
- Auth init: `op-1` / Platform Owner, territory `hvd-central`
- Seed: `xos.prototype.state` cleared once, then the flow runs against the pristine seed
- Created entities: franchise `f-3` Peak Sports Hub, territory `t-1` Kerala Coast, city `c-1` Kochi,
  venue `v-7` Kochi Courts, playing area `pa-8` Court Prime
  (ids derive from `nextId` — first numeric-suffixed id under each prefix)

## Image index

| # | File | Route | Role | Territory | Viewport | Action | Expected | Actual |
|---|------|-------|------|-----------|----------|--------|----------|--------|
| 01 | 01-seed-franchises.png | /franchises | Platform Owner | hvd-central | 1440x900 | Open franchises list on pristine seed | Apex Gaming & Sports Central + Coastal Sports Collective render | PASS — both seeded rows visible |
| 02 | 02-franchise-wizard.png | /franchises/new | Platform Owner | hvd-central | 1440x900 | Fill 6-step wizard through Review (name Peak Sports Hub) | Review lists assumptions incl. Peak Sports Hub | PASS — review step shows the new franchise |
| 03 | 03-franchise-created.png | /franchises/f-3 | Platform Owner | hvd-central | 1440x900 | Create franchise | Redirect to detail; title Peak Sports Hub; state contains f-3 | PASS — detail page renders created franchise |
| 04 | 04-franchise-in-list.png | /franchises | Platform Owner | hvd-central | 1440x900 | Search "Peak Sports Hub" | Row appears in filtered list | PASS — search finds the new franchise |
| 05 | 05-territory-franchise-linked.png | /territories/new | Platform Owner | hvd-central | 1440x900 | Open territory wizard; check franchise select | Peak Sports Hub selectable (connected workflow #1) | PASS — new franchise is an option and selected |
| 06 | 06-territory-created.png | /territories/t-1 | Platform Owner | hvd-central | 1440x900 | Complete territory wizard (franchise f-3) | Redirect to detail; title Kerala Coast; state links t-1→f-3 | PASS — territory created under the new franchise |
| 07 | 07-territory-in-list.png | /territories | Platform Owner | hvd-central | 1440x900 | Search "Kerala Coast" | Row appears in filtered list | PASS — search finds the new territory |
| 08 | 08-territory-switcher-resolves.png | /territories | Platform Owner | hvd-central→t-1 | 1440x900 | Open sidebar territory switcher, select Kerala Coast | New prototype territory resolves (store fix) and becomes active | PASS — switcher lists + selects t-1 |
| 09 | 09-city-wizard-under-territory.png | /territories/t-1/cities/new | Platform Owner | t-1 | 1440x900 | City wizard, name Kochi, pick Box Cricket + Badminton | Territory fixed to Kerala Coast; Next enables with ≥1 category | PASS — fixed territory visible, Next enabled |
| 10 | 10-city-created.png | /cities/c-1 | Platform Owner | t-1 | 1440x900 | Create city | Redirect to detail; title Kochi; state scopes c-1→t-1 | PASS — city detail renders |
| 11 | 11-city-under-territory.png | /territories/t-1 | Platform Owner | t-1 | 1440x900 | Open territory detail | Cities card lists Kochi | PASS — city visible under its territory |
| 12 | 12-venue-wizard-new-city.png | /locations/venues/new | Platform Owner | t-1 | 1440x900 | Venue wizard: territory t-1, city select | Kochi selectable (connected workflow #2) | PASS — new city is an option and selected |
| 13 | 13-venue-created.png | /locations/venues/v-7 | Platform Owner | t-1 | 1440x900 | Complete 7-step venue wizard | Redirect to detail; title Kochi Courts; state wires v-7→c-1/t-1 | PASS — venue detail renders |
| 14 | 14-venue-in-city-view.png | /cities/c-1 | Platform Owner | t-1 | 1440x900 | Open city detail | Venues card lists Kochi Courts | PASS — venue visible under its city |
| 15 | 15-venue-in-territory-view.png | /territories/t-1 | Platform Owner | t-1 | 1440x900 | Open territory detail | Venues card lists Kochi Courts | PASS — venue visible under its territory |
| 16 | 16-pa-created.png | /locations/playing-areas/pa-8 | Platform Owner | t-1 | 1440x900 | Complete 4-step playing-area wizard at v-7 | Redirect to detail; title Court Prime; cap 40 ≤ venue safety 120 | PASS — playing-area detail renders |
| 17 | 17-pa-in-venue-detail.png | /locations/venues/v-7 | Platform Owner | t-1 | 1440x900 | Open venue detail | Playing Areas card lists Court Prime | PASS — PA visible under its venue |
| 18 | 18-refresh-persistence.png | /franchises | Platform Owner | t-1 | 1440x900 | Hard reload the browser | All 5 created records survive reload | PASS — f-3/t-1/c-1/v-7/pa-8 persist |
| 19 | 19-role-switch-restricts.png | /franchises/f-3 → /franchises | Platform Owner → Regional Franchise Partner | t-1 | 1440x900 | Switch position to Regional Franchise Partner | Pause franchise 1→0; role-note shown; New franchise hidden | PASS — restricted actions change with role |
| 20 | 20-territory-scope-change.png | /money | Regional Franchise Partner | t-1→hvd-central | 1440x900 | Switch territory to Hyderabad Central in sidebar | /money overline follows scope | PASS — MONEY · HYDERABAD CENTRAL |
| 21 | 21-reset-removes-records.png | / | Platform Owner | hvd-central | 1440x900 | Demo controller → Reset demo | All created records removed; seed f-1 restored | PASS — reset drops f-3/t-1/c-1/v-7/pa-8 |

## What this proves

- All 14 SA-P2B routes render and navigate (list → wizard → detail chains).
- Connected workflow: new franchise → selectable in territory wizard; new territory →
  switcher + city wizard; new city → venue wizard; new venue → PA wizard.
- Territory resolution for prototype territories works in the switcher.
- Persistence across reload; demo reset restores seed.
- Role simulation gates restricted actions; territory scope follows the switcher.
- All mutations flow through prototype services (audit + persist inside services); no
  page mutates entities directly.
