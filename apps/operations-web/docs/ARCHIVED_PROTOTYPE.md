# Archived operations prototype (ADR-0006)

## Summary

`apps/operations-web` contains two different products:

| Surface | Model | Data | Status |
| --- | --- | --- | --- |
| Governance console: the 13 routes in `lib/nav.ts` (`/`, `/approvals`, `/partners`, `/arenas`, `/events`, `/customers`, `/risk`, `/reviews`, `/refunds`, `/settlements`, `/commercials`, `/policies`, `/audit`) | Governed marketplace (ADR-0003/0004). Organizers operate; the platform governs | Firebase (Firestore reads under the rules; every write is a server callable) | **Production surface** |
| About 80 other pages under `app/(console)/` (missions, bookings, catalog, setup, franchises, territories, cities, locations, identity-patterns, people, staffing, money, tournaments, safety, access, analytics, notifications) | Company-operated events (the obsolete model) | `lib/store.tsx` + `lib/prototype/*`, browser `localStorage` only | **Archived** |

The prototype pages are **not deleted**. They record product thinking (category template fields, identity patterns, check-in states, the safety checklist) that was carried into PULSE organizer tools and the server model. They are **not connected to production data** and must not be presented as working features.

## Behavior

The route decision lives in one pure module: `lib/console/archived.ts`.

- `isGovernanceRoute(path)` is true for a route in `GOVERNANCE_ROUTES` or any sub-route of one. `/` matches only itself.
- `isArchivedRoute(path)` covers everything else inside the console. The auth routes are excluded.
- `archivedPrototypeEnabled()` is true only when `NEXT_PUBLIC_SHOW_ARCHIVED_PROTOTYPE === "true"`. Any other value fails closed.

`app/(console)/layout.tsx` runs **after** the Super Admin session gate, so archived pages still require a verified Platform Owner or Super Admin:

| `NEXT_PUBLIC_SHOW_ARCHIVED_PROTOTYPE` | Archived route renders |
| --- | --- |
| unset or anything other than `true` (the default, and required for production) | `ArchivedPrototypeNotice`: "Archived prototype (company-operated model, superseded by ADR-0003/0004) — not connected to production data", plus a link back to the Command Center. **No prototype page code runs.** |
| `true` (local reference only) | The prototype page, under a sticky `ArchivedPrototypeBanner` with the same text |

`lib/nav.ts` `canAccess()` returns `false` for archived routes unless the flag is on and the role is `platform-owner` or `super-admin`. This replaces the misleading "This door isn't yours" `PermissionDenied` screen that previously appeared on 31 prototype pages. Archived routes are never listed in the sidebar or the command palette.

## Why this approach

This is the least invasive change. It is one layout branch plus one `canAccess` rule, and no prototype files were edited. The obsolete model can't be mistaken for production, and the reference material stays available to engineers who opt in locally.

## Rules

- Do not add new features to archived pages. New governance capability goes into a NAV route, backed by server callables (see `docs/API_CONTRACT.md`).
- Do not set `NEXT_PUBLIC_SHOW_ARCHIVED_PROTOTYPE` in a deployed environment.
- Event-day operations are organizer functions in PULSE, not Super Admin functions (ADR-0006). This covers check-in, teams, reveal, live operation, completion and staffing.
- If a prototype concept is revived, re-implement it on the canonical model (`orgId` tenancy, callables, audit). Do not wire the prototype store to Firebase.

## Tests

`tests/unit/archived.test.ts` checks the following:

- every NAV route is a governance route;
- representative prototype routes are archived;
- prefix look-alikes such as `/refundsx` are archived;
- the flag only accepts `"true"`;
- `canAccess` refuses archived routes by default.
