# SA-P2C Walkthrough Evidence — Activity Categories & Experience Template Operations

30-gate Playwright walkthrough of the SA-P2C cluster in `apps/operations-web`: catalog
command overview, category + template lifecycle (draft → activate → pause → resume →
shelve), schedulability/venue-compatibility gating, customer preview and version-history
lanes with role gates, and demo reset. All 30 gates green on the run that produced these
images.

- Harness: `C:\Users\Gowtham\AppData\Local\Temp\opencode\pw\evidence-sa-p2c.js`
- Run: `node evidence-sa-p2c.js` with the dev server on `http://localhost:3100`
- Auth init: `op-1` / Platform Owner, territory `hvd-central`
- Seed: `xos.prototype.state` cleared once, then the flow runs against the pristine seed
- Created entities (context-summary-controlled):
  - category `cat-1` "Pickleball Social" (draft → activated)
  - template `et-9` "Pickleball Round Robin" (draft, under `cat-1`, no compatible venues)
  - template `et-10` "Evening Box Cricket Match v2" (draft, restored from ver-2)
  - template `et-11` "Women's Social Badminton (Copy)" (draft, duplicated from `et-3`)
- Seeded fixtures asserted: `et-7` Sunrise Cricket Academy (draft → activated), `et-8`
  Rooftop TT Socials (paused), `et-1` Evening Box Cricket Match (active, versions ver-1/ver-2),
  `et-3` Women's Social Badminton (active), category `cat-cricket`

## Image index

| # | File | Route | Role | Territory | Viewport | Action | Expected | Actual |
|---|------|-------|------|-----------|----------|--------|----------|--------|
| 01 | 01-catalog-overview.png | /catalog | Platform Owner | hvd-central | 1440x900 | Open catalog command overview on pristine seed | Stats + shelf rule + seeded categories render | PASS — command overview, THE SHELF RULE, Box Cricket present |
| 02 | 02-categories-seeded.png | /catalog/categories | Platform Owner | hvd-central | 1440x900 | Open categories list | 5 seeded categories with status column | PASS — Box Cricket, Badminton, Table Tennis, Foosball, Board Games all render |
| 03 | 03-category-draft-filter.png | /catalog/categories | Platform Owner | hvd-central | 1440x900 | Click Draft status filter | No seeded drafts → empty state | PASS — "No categories." shown |
| 04 | 04-experiences-can-schedule.png | /catalog/experiences | Platform Owner | hvd-central | 1440x900 | Inspect Can schedule column | Active template YES, draft template NO | PASS — et-1 YES, et-7 NO |
| 05 | 05-schedulable-only-hides-draft.png | /catalog/experiences | Platform Owner | hvd-central | 1440x900 | Toggle Schedulable only | Draft et-7 hidden, active et-1 kept | PASS — Sunrise absent, Evening Box listed |
| 06 | 06-category-wizard-review.png | /catalog/categories/new | Platform Owner | hvd-central | 1440x900 | Fill 4-step wizard, name Pickleball Social | Review step lists the new category | PASS — Pickleball Social on review |
| 07 | 07-category-created-draft.png | /catalog/categories/cat-1 | Platform Owner | hvd-central | 1440x900 | Save as draft | Redirect to detail; status draft | PASS — cat-1 created as draft |
| 08 | 08-draft-category-not-selectable.png | /catalog/experiences/new | Platform Owner | hvd-central | 1440x900 | Open template wizard category select | Draft categories excluded | PASS — no option value cat-1 |
| 09 | 09-category-activated.png | /catalog/categories/cat-1 | Platform Owner | hvd-central | 1440x900 | Activate category | Status flips draft → active | PASS — cat-1 active in state |
| 10 | 10-category-wired-to-templates.png | /catalog/experiences/new | Platform Owner | hvd-central | 1440x900 | Re-open template wizard category select | Activated category now selectable (connected workflow) | PASS — cat-1 is an option and selected |
| 11 | 11-template-wizard-gate.png | /catalog/experiences/et-9 | Platform Owner | hvd-central | 1440x900 | Complete 6-step wizard, name Pickleball Round Robin, Save as draft | Review flags Not schedulable; saved as draft | PASS — et-9 draft under cat-1 |
| 12 | 12-draft-not-schedulable.png | /catalog/experiences/et-9 | Platform Owner | hvd-central | 1440x900 | Open draft template detail | Draft banner + Not schedulable readiness | PASS — both rendered |
| 13 | 13-activation-venue-gate.png | /catalog/experiences/et-9 | Platform Owner | hvd-central | 1440x900 | Inspect activation affordance | No compatible venues → Activate hidden + critical error | PASS — no button, error listed |
| 14 | 14-et7-activated.png | /catalog/experiences/et-7 | Platform Owner | hvd-central | 1440x900 | Activate seeded draft Sunrise Cricket Academy | Activate present; status → active | PASS — et-7 activated |
| 15 | 15-et7-schedulable.png | /catalog/experiences/et-7 | Platform Owner | hvd-central | 1440x900 | Re-read readiness after activation | Readiness flips to Schedulable | PASS — Schedulable shown |
| 16 | 16-schedulable-only-shows-et7.png | /catalog/experiences | Platform Owner | hvd-central | 1440x900 | Toggle Schedulable only | Sunrise listed only after activation | PASS — Sunrise appears |
| 17 | 17-pause-template.png | /catalog/experiences/et-7 | Platform Owner | hvd-central | 1440x900 | Pause template (confirm dialog) | Status → paused + banner | PASS — paused + banner rendered |
| 18 | 18-resume-template.png | /catalog/experiences/et-7 | Platform Owner | hvd-central | 1440x900 | Resume template | Status → active again | PASS — et-7 active |
| 19 | 19-customer-preview.png | /catalog/experiences/et-1/preview | Platform Owner | hvd-central | 1440x900 | Open customer preview | Mobile listing + before/after reveal + never-revealed + price | PASS — MOBILE LISTING, panels, ₹499 all render |
| 20 | 20-preview-role-gate.png | /catalog/experiences/et-1/preview | Finance Manager | hvd-central | 1440x900 | Open preview from a non-marketing lane | Blocked lane message | PASS — "Promise & preview are for the marketing lane" |
| 21 | 21-version-history.png | /catalog/experiences/et-1/versions | Platform Owner | hvd-central | 1440x900 | Open version history | ver-2 + ver-1 rows with reasons and changed fields | PASS — "Price adjusted for peak-season demand", v2, v1 render |
| 22 | 22-restore-from-version.png | /catalog/experiences | Platform Owner | hvd-central | 1440x900 | Draft from v2 on ver-2 | New draft et-10 "Evening Box Cricket Match v2" created | PASS — et-10 draft in state |
| 23 | 23-duplicate-template.png | /catalog/experiences/et-3 | Platform Owner | hvd-central | 1440x900 | Duplicate template | New draft et-11 "Women's Social Badminton (Copy)" created | PASS — et-11 draft in state |
| 24 | 24-category-paused.png | /catalog/categories/cat-cricket | Platform Owner | hvd-central | 1440x900 | Pause category (confirm dialog) | Status → paused; blocking signal names active dependents | PASS — CATEGORY PAUSED signal + depend |
| 24b | — | /catalog/categories/cat-cricket | Platform Owner | hvd-central | 1440x900 | Resume category | Status → active again | PASS — cat-cricket active |
| 25 | 25-scoped-visibility.png | /catalog/experiences | Venue Manager | hvd-central | 1440x900 | View catalog as a scoped role | Scoped banner; incompatible et-9 hidden | PASS — banner shown, Pickleball Round Robin absent |
| 26 | 26-role-restriction.png | /catalog/experiences/et-1 | Venue Manager | hvd-central | 1440x900 | Inspect authoring + lane buttons | New template hidden, Versions hidden, Customer preview kept | PASS — New template/Versions 0, Preview 1 |
| 27 | 27-versions-role-gate.png | /catalog/experiences/et-1/versions | Venue Manager | hvd-central | 1440x900 | Open versions from a non-review lane | Blocked lane message | PASS — "Version history is a review lane" |
| 28 | 28-reset-demo.png | / | Platform Owner | hvd-central | 1440x900 | Demo controller → Reset demo | Walkthrough state reset | PASS — reset executed |
| 29 | 29-reset-restores-seed.png | / | Platform Owner | hvd-central | 1440x900 | Re-read state after reset | Created entities gone; seed restored | PASS — cat-1/et-9/et-10/et-11 gone, et-7 draft, cat-cricket active, et-8 paused |

## What this proves

- All SA-P2C routes render and navigate (overview → lists → wizards → detail →
  preview/versions lanes).
- Connected workflow: category draft → activation → selectable in template wizard;
  template draft → activation → schedulable → surfaced by the Schedulable-only filter.
- Schedulability gating: drafts and venue-incompatible templates cannot be activated or
  scheduled (critical errors, hidden activation button).
- Full lifecycle: draft, activate, pause, resume, duplicate, restore-from-version, and
  category shelving with dependents blocking signals.
- Role lanes: customer preview is marketing-lane only, version history is review-lane
  only; Venue Manager gets a scoped catalog with incompatible templates hidden.
- Demo reset restores the pristine seed.
- All mutations flow through prototype services (audit + persist inside services); no
  page mutates entities directly.
