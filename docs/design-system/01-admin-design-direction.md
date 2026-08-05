# 01 — Admin Design Direction

> **Status:** Planning draft.
> **Document type:** Design direction / principles.
> **This document is a planning draft.** It sets the design direction for the Super Admin UI. No designs or UI code exist.

---

## 1. Purpose

Set the initial visual and interaction direction for the Super Admin so future design work is consistent. This is a direction document, not a design system.

## 2. Design principles

1. **Ops-speed.** Frequent tasks (today's sessions, check-in, fill monitoring) are one click from the dashboard.
2. **Calm density.** Information-dense but scannable; tables and status chips over prose.
3. **Status clarity.** Every session/booking has a clear status color language, consistent across screens.
4. **Anonymity-aware.** Screens that reveal participant identity are visually distinct (locked/verified zones) and role-gated.
5. **Confidence in destructive actions.** Refunds, bans, cancellations require explicit confirmation and show consequences.

## 3. Proposed visual direction (draft)

| Aspect | Draft direction |
| --- | --- |
| Layout | Left navigation (see IA), top bar with city context + search |
| Typography | System/sans stack; small, high-contrast; data-forward |
| Color | Neutral base with an accent for brand; status colors: green (open/live), amber (closing/warning), red (cancelled/incident) |
| Components | Tables, status chips, filters, calendar grid, detail drawers |
| Density | Compact tables with inline filters; bulk actions for lists |

> Brand name/colors unresolved (see Open Questions).

## 4. Key interaction patterns (draft)

| Pattern | Intent |
| --- | --- |
| City context selector | Scope all modules to a city |
| Today's sessions queue | Coordinator entry point to sessions needing attention |
| Session timeline | Visual stage of each event room (draft → … → archived) |
| Fill meter | Sold vs. capacity at a glance |
| Confirmation dialogs | Required for refunds, cancellations, bans |
| Audit drawer | See change history inline on any record |

## 5. Cross-product design

The Super Admin is the operations tool; the customer app is the participant product. Shared brand tokens may exist, but admin prioritizes efficiency over consumer polish. Exact relationship is open.

## 6. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | Left navigation with city context selector (per IA). |
| C2 | Status color language consistent across screens. |
| C3 | Destructive actions require confirmation and show consequences. |
| C4 | Dense, table-first layouts for operational screens. |
| C5 | No design assets or UI code exist yet. |

## 7. Assumptions

| # | Assumption |
| --- | --- |
| A1 | Admin is used on desktop (web) primarily; responsive secondary. |
| A2 | A design system/token set will be introduced during design phase. |
| A3 | Dark mode is not a v1 admin requirement. |
| A4 | Accessibility (WCAG) applies to all admin surfaces. |

## 8. Open questions

| # | Question |
| --- | --- |
| Q1 | Brand name and colors? (blocks visual identity) |
| Q2 | Which component library / UI kit for Next.js admin? |
| Q3 | Do coordinators/referees need a mobile-optimized admin view? |
| Q4 | Should the admin include a lightweight marketing-content editor, or link out to tools? |

## 9. Dependencies

- **IA:** `docs/admin/03-admin-information-architecture.md`.
- **Screens:** `docs/admin/04-admin-screen-inventory.md`.
- **Brand:** unresolved (blocks identity work).

## 10. Related documents

- `docs/admin/01-admin-purpose.md`
- `docs/admin/02-admin-users-and-roles.md`
