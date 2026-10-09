# Super Admin console upgrade — design

**Status:** approved by the owner on 2026-10-09 ("proceed and fully autonomously"). The look is direction **A, "Neon Bento"**, chosen from browser mockups.

## Goal

Rebuild the Operations Console (`apps/operations-web`) UI and UX from scratch. It should feel like the PULSE app: modern and "Gen‑Z", with the same palette and type. Add the screens a Super Admin needs to run the marketplace. All data is real: Firebase reads under the existing rules, and every write goes through the existing callables. The prototype is removed.

Success means:
- An owner signs in on the emulator or staging and every screen shows real data, or an honest empty state.
- Every decision works end to end through the server.
- Details are finished everywhere: loading, empty, error, confirm, toast, keyboard, responsive, reduced motion.
- Nothing in the console is fake.

## Constraints

- Keep Next.js 15 App Router, React 19, Tailwind 3, `firebase` 12, `lucide-react` and `framer-motion`. No chart library: charts are hand-made SVG.
- Keep the security model as it is:
  - the session gate (`lib/firebase/auth.tsx`) and `lib/console/capabilities.ts` role checks;
  - every write is a server callable through `lib/governance-api.ts`;
  - no client writes to Firestore.
- No new backend callables. New composite indexes are allowed (`firebase/firestore/firestore.indexes.json`), and `npm run check:indexes` must still pass.
- Metrics use Firestore aggregation queries (`getAggregateFromServer` with `count`/`sum`). Bounded document reads are allowed only where a breakdown needs them (≤ 250 docs).
- Money is in minor units (paise), formatted en‑IN: `₹1,84,320`, compact `₹1.84L` / `₹2.1Cr`.
- Accessibility: AA contrast, visible focus (violet ring), full keyboard use, `prefers-reduced-motion` respected.
- Layout: from 768 px wide upwards. On narrower screens it is read-mostly and still usable.

## Visual system (from PULSE `tokens.dart`)

| Token | Value | Use |
|---|---|---|
| ink | `#0B0A12` | page background |
| night | `#12101C` | inputs, deep panels |
| surface | `#1A1726` | cards (78% alpha over glow) |
| surfaceHigh / surfaceTop | `#242033` / `#2E2941` | raised controls, hover |
| line / lineSoft | `#332E47` / `rgba(255,255,255,.08)` | borders |
| text / text2 / text3 | `#F6F4FF` / `#BDB8D1` / `#9590AD` | text hierarchy |
| primary / primaryStrong | `#8E72FF` / `#6E4DFF` | brand, selection, focus |
| volt / onVolt | `#D9FF3F` / `#14160B` | **only** the single primary action on a screen, badges, highlight words |
| success / warning / error / info | `#3FDD9A` / `#FFB84D` / `#FF6178` / `#63BEFF` | status, always paired with an icon or label |

- **Type:** Space Grotesk (display and numbers, tracking −0.02 to −0.03em), Plus Jakarta Sans (UI). Both load through `next/font/google`.
- **Shapes:**
  - radius 24 for cards, 16 for controls and list rows, 99 for pills;
  - glass cards with a 14px blur;
  - a violet radial glow at top-left of the page and a faint volt glow at bottom-right.
- **Motion:** 150–250 ms, `cubic-bezier(.2,.8,.2,1)`. Cards fade up in sequence on first load and numbers count up. All motion is off under reduced motion.
- **Emoji** are used as category and queue-item glyphs inside tinted tiles. Lucide icons cover controls.

## Information architecture

**Left icon rail** (labels appear on hover and focus; it can be pinned open). Each group shows a live count badge in volt where action is needed:

- **Overview:** Command Center `/`, Live `/live`
- **Marketplace:** Approvals `/approvals`, Organizers `/partners` with `/partners/[orgId]`, Experiences & Events `/events` with `/events/[eventId]`, Arenas `/arenas`
- **Trust:** Customers `/customers` with `/customers/[uid]`, Risk `/risk`, Reviews `/reviews`
- **Money:** Revenue `/revenue`, Refunds `/refunds`, Settlements `/settlements`, Commercials `/commercials`
- **Control:** Audit `/audit`, Policies `/policies`, Legal holds `/legal-holds`, System health `/system`, Operator access `/operators`

**Top bar:**
- a greeting and date;
- ⌘K search (pages, organizers, events, bookings by reference, customers by phone or name, and IDs);
- an environment badge (EMULATOR / STAGING / PRODUCTION, colour-coded);
- a Live dot (Firestore listener health);
- a notifications drawer (the attention queue);
- an operator menu (role, sign out).

The existing route-to-role mapping in `lib/nav.ts` and `capabilities.ts` is extended for the new routes. `/live` and `/revenue` have the same audience as Command Center; the 360° pages inherit from their parent route.

## Screens

Each screen has skeleton, empty, error-with-retry and partial-data (truncated at the limit) states.

1. **Sign-in** (`/login`)
   - Split hero: "Run the city's *pulse*." with feature stickers, plus a glass sign-in card.
   - Verify-email and reset-password flows.
   - Clear states for a configuration problem, a disabled account and a role that isn't an operator.
2. **Command Center**
   - Greeting headline with a one-line summary (things needing you, events live, money moved).
   - Range chips (Today / 7 days / 30 days) and a city filter.
   - Bento KPIs, each compared with the previous equal period:
     - gross bookings, with a sparkline;
     - confirmed bookings;
     - check-in rate;
     - refund rate;
     - new customers;
     - active organizers.
   - "Needs you 🔥" (the existing `buildAttentionQueue`), Live now, Top cities, and the latest privileged audit actions.
3. **Live**
   - Events with `startsAt ≤ now ≤ endsAt` (and the next 12 h under "Starting soon").
   - Fill bar (occupancy versus capacity), phase, organizer and time left.
   - Open Event 360, or **Cancel event** with a reason (`adminCancelEvent`).
4. **Approvals**
   - Split view: the queue (organizer KYC and experience submissions, from `governanceCases`) and a detail pane.
   - KYC: every answer.
   - Experience: a phone-frame preview of the PULSE card and detail, all fields, and the version diff where it exists.
   - Actions: Approve (volt), Request changes, Reject, each with a note (`decideCase`, using `expectedVersion`).
   - Keyboard: J/K to move, A approve, C changes, R reject.
5. **Organizers → Organizer 360**
   - The list is a card grid with status filters.
   - The 360 shows:
     - profile and status;
     - KPIs (gross bookings, events, average rating, refunds);
     - experiences and events;
     - commercial terms and settlements;
     - team (memberships);
     - an audit timeline for the org.
   - Actions: pause or block (`setEntityStatus`), reissue organizer code, propose terms.
6. **Experiences & Events → Event 360**
   - A filterable table (status, city, category, date).
   - The 360 shows capacity and occupancy, bookings (list), check-ins, revenue and commission (from the ledger), refunds, reviews and the timeline. Cancel is available.
7. **Arenas:** list and detail with status actions.
8. **Customers → Customer 360**
   - Search by phone, name or uid.
   - The 360 shows bookings, payments, refunds, reviews, risk flags, safety and holds.
   - The phone number is masked (`+91 98•••••210`) until you click to reveal.
9. **Risk:** severity-sorted alerts and the case detail; decide.
10. **Reviews:** a card feed (stars, text, event, author alias); hide or publish with a reason (`moderateReview`).
11. **Revenue**
   - KPIs: gross, platform commission (ledger `platform_commission`), refunds, net.
   - A 30-day trend (daily aggregation).
   - City and category breakdowns, computed from events in the range (`occupancy × priceMinor`, labelled "by event date").
12. **Refunds / Settlements / Commercials:** restyled lists with detail drawers and the existing decisions, each with a reason.
13. **Audit:** a filterable timeline (actor, action, entity, date) with "load older". **Policies, Legal holds, System health** (job cards) and **Operator access** (role picker) are restyled with their current behaviour.

## Architecture

- `app/globals.css` and `tailwind.config.ts`: the PULSE tokens (CSS variables), fonts and glow backgrounds.
- `components/pulse/`, the UI kit: Button (volt / violet / ghost / danger), Card, Stat (with count-up and delta), Chip, Badge, Pill, Avatar, Kbd, Skeleton, Empty, ErrorState, Sheet (confirm with required reason), Drawer, Table (sortable, keyboard rows), Tabs, Toast (provider), Tooltip, Search, PhoneFrame, Timeline, Sparkline, AreaChart, BarList, ProgressBar, Glyph (emoji tile).
- `components/shell/`: Rail, TopBar, CommandPalette (real search), NotificationsDrawer, EnvBadge.
- `lib/metrics.ts`: pure query builders, `rangeFor(range, now)` and `previousRange`, plus aggregation runners (`countWhere`, `sumWhere`). Hook: `useMetric`.
- `lib/format.ts`: `inr`, `inrCompact`, `relTime` and `maskPhone`, extended and unit-tested.
- `lib/search.ts`: prefix searches over organizers, events, bookings (by reference), users (by phone), and pages.
- **Deleted:** every archived route under `app/(console)/` that isn't listed above, `lib/prototype/`, `lib/store.tsx`, `lib/console/archived.ts` and its test, the prototype-only shell components (RoleSimulator, DemoWalkthroughPanel, TerritorySwitcher, SignalCenter), the old `components/ui/*` once nothing uses it, and the prototype branch in `lib/firebase/auth.tsx`.
- Kept: `governance-api.ts`, `use-governance.ts`, `lib/console/{attention,capabilities,records,…}` and `lib/firebase/*`. Their tests stay green.

## Data and metrics

| Metric | Query |
|---|---|
| Gross bookings | `sum(amountMinor)` on `bookings` where `status in [confirmed, completed]` and `createdAt` in range |
| Confirmed bookings | `count` on the same query |
| Refund rate | refunds `sum(amountMinor)` in range ÷ gross |
| Check-in rate | tickets `checkedIn == true` ÷ tickets for events that started in range (count / count) |
| New customers | `users` where `createdAt` in range and `scope` not platform (count) |
| Active organizers | `publicOrganizers` / `organizers` where `status == active` (count) |
| Commission | `ledgerEntries` where `account == platform_commission`, `kind == capture`, `createdAt` in range (sum) minus the refund kind |
| Daily trend | 30 × `sum` per day, run concurrently and cached for 60 s |

Field names are verified against the backend during implementation. A field that turns out to be missing is shown as "—" with a tooltip, never invented. Each new composite index gets an entry in `firestore.indexes.json` and in `check-indexes.mjs` so the check stays green.

## Seed data (local emulator)

Implement `firebase/scripts/seed-emulator.ts`, which is currently a scaffold, with the same safety guards (emulator only, `demo-*` only). Using the **real callables** as real users, it creates:
- the platform owner;
- organizers: three approved and the pending applications;
- experiences and events across Bengaluru, Pune and Hyderabad, including some live now;
- confirmed bookings, with payments confirmed through the dev HMAC path;
- check-ins;
- a refund request;
- reviews;
- a settlement build.

Commands:
- `npm run seed:emulator` from the root (also documented in the console README);
- a matching `reset`.

## Testing

- Vitest:
  - `metrics` (ranges, previous period, query shapes);
  - `format` (en-IN money, compact, relative time, masking);
  - `search` (query routing by input shape);
  - nav and capabilities for the new routes.
- The existing tests stay green; tests for deleted code are removed.
- `npm run verify` (typecheck, test, build) passes, and so does `npm run check:indexes`.
- Manual check: a browser walkthrough of every route on the seeded emulator, signed in as the platform owner, with a screenshot of each screen.

## Delivery phases

1. **Foundation:** tokens and fonts, `components/pulse` kit, shell (rail, top bar, ⌘K, environment badge, toasts), sign-in, prototype deletion.
2. **Command Center, metrics and Live.**
3. **Approvals, Organizer 360 and Event 360.**
4. **Customers / Customer 360, Risk, Reviews, Revenue, Refunds, Settlements, Commercials.**
5. **Control screens, the seed script, and a polish pass** (motion, empty states, responsive, accessibility), then the full walkthrough.

## Out of scope

New backend callables (broadcast push, promo codes, city management), a light theme, mobile-first admin and i18n.
