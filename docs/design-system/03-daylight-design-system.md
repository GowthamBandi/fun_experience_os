# 03 — Daylight Design System (light theme)

> **Status:** Canonical as of 2026-09-29. Supersedes the dark "dusk" visual layer of
> `02-experience-os-design-system.md` and `EXPERIENCE_OS_DESIGN_DNA.md` for the Super Admin console.
> Tokens live in `apps/operations-web/app/globals.css` and `tailwind.config.ts`.

## Principles

1. **White surfaces, one brand colour.** Content sits on white cards over a soft grey-lilac canvas.
   Violet (`brand`) marks the primary action and the current location. Nothing else is violet.
2. **Colour means state.** Emerald = done/healthy, amber = waiting/at risk, red = blocked/failed,
   sky = in progress/info, violet = brand/primary, pink = attention badges. Never decorate with
   semantic colours.
3. **Readable density.** 14px body, 13px secondary, 11px uppercase overlines. Tables use 12–14px.
   Monospace is only for identifiers (`font-mono text-xs`), never for whole screens.
4. **Every action answers.** Success, refusal and failure produce a toast or inline message in plain
   business language, with the next step where one exists. No `alert()`, `confirm()` or `prompt()`.
5. **Destructive actions confirm.** Use `Dialog` with the consequence spelled out; irreversible
   bulk actions require typing CONFIRM.

## Type

| Role | Family | Usage |
| --- | --- | --- |
| Display | Plus Jakarta Sans (variable) | Page titles (`font-display text-[28px] font-bold`), KPI numbers, dialog titles |
| UI | Inter (variable) | Everything else |
| Mono | JetBrains Mono (variable) | IDs, codes, temporary identities |

Fonts are self-hosted via `@fontsource-variable/*` (no network dependency at build or runtime).

## Tokens

| Token | Value | Tailwind |
| --- | --- | --- |
| Canvas | `#f4f5fa` | `bg-bg-deep` |
| Surface | `#ffffff` | `bg-white`, `.glass`, `.solid` |
| Sunken / wells | `#f8f9fc` | `bg-bg-sunken` |
| Border | `#e4e7ef` / strong `#d3d8e4` | `border-edge`, `border-edge-strong` |
| Brand | `#5b4cf5`, hover `#4a3ae0`, ink `#3b2cc0`, subtle `#efedff` | `bg-brand`, `text-brand-ink`, `bg-brand-subtle` |
| Ink | `#101327` / `#464c63` / `#737a92` | `text-ink-lum` / `text-ink-sec` / `text-ink-mut` |
| Radius | cards 20px, sheets 16px, controls 12px | `rounded-panel`, `rounded-sheet`, `rounded-xl` |
| Shadows | `shadow-lift` (controls), `shadow-panel` (cards), `shadow-glass` (overlays), `shadow-brand` (primary) | |

## Components (use these, don't restyle ad hoc)

- `components/ui/primitives.tsx` — `Button` (`primary | secondary | ghost | danger | success | warning | lamp`, sizes `sm | md | lg`), `IconButton`, `StatusChip` (automatic tone from status), `Toggle`, `Avatar`, `FillMeter`, `Skeleton`.
- `components/ui/panels.tsx` — `Card`, `PanelHeader`, `Stat`, `MetricTile` (KPI with coloured icon chip), `EmptyState`, `PermissionDenied`.
- `components/ui/PageHeader.tsx` — every page starts with it (overline, title, sub, right-side actions).
- `components/ui/fields.tsx` — `Field`, `Input`, `Select`, `SearchInput`, `FilterRail`.
- `components/ui/table.tsx` — `DataTable`.
- `components/ui/overlays.tsx` — `Dialog`, `Drawer`.
- `components/ui/toast.tsx` — `useToast()`, `useCommandFeedback()`.

## Layout

- Page container: `mx-auto w-full max-w-[1440px] px-5 py-7 lg:px-8`, sections spaced `space-y-6`.
- KPI rows: `grid gap-4 sm:grid-cols-2 xl:grid-cols-4` of `MetricTile`.
- Tables scroll inside their card (`overflow-x-auto`); the page never scrolls horizontally.
- Mobile (≤1023px): the sidebar becomes a drawer opened from the top bar.

## Motion

`framer-motion` with the house easing `[0.19, 1, 0.22, 1]`; 150–320ms. `prefers-reduced-motion` disables animation globally.
