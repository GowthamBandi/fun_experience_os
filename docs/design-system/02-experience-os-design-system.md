# 02 — Experience OS Design System

> **Status:** Planning draft — SA-1A.
> **Document type:** Design system foundation (experience OS).
> **This document is a planning draft.** Tokens and components below are the working design system for Experience OS. **No design assets or UI code exist.**

Companion to the prior baseline in `docs/design-system/01-admin-design-direction.md` (left nav, city context, status color language, dense tables) — this document adds the premium Experience OS foundations and motion language. Brand-dependent tokens are **working values** pending OQ-SA-006.

---

## 1. Design principles

1. **Ops-speed.** Frequent tasks one click away; calm density over chrome.
2. **Premium restraint.** Few surfaces, real depth, no gratuitous decoration.
3. **Status clarity.** One status color language everywhere (inherits 01 §2.3).
4. **Anonymity-aware.** Identity-revealing surfaces are visually distinct and role-gated.
5. **Confident destructive actions.** Confirmations show consequences.
6. **Accessible by default.** AA contrast, 200% type, reduce-motion.

## 2. Foundations

### 2.1 Spacing (4px base)

| Token | Value | Use |
| --- | --- | --- |
| space-1 | 4 | inline gap, icon padding |
| space-2 | 8 | compact gaps, chip padding |
| space-3 | 12 | input internal, list gaps |
| space-4 | 16 | default inset, card padding-sm |
| space-5 | 24 | card padding, section gap |
| space-6 | 32 | card padding-lg, modal inset |
| space-7 | 48 | screen sections |
| space-8 | 64 | screen padding (desktop) |
| space-9 | 96 | hero/empty-state spacing |

### 2.2 Typography

Typeface: **Inter** (working; system stack fallback). Data/numbers use tabular figures.

| Token | Size/Leading | Weight | Use |
| --- | --- | --- | --- |
| display | 32/40 | 600 | Screen titles, welcome |
| title | 24/32 | 600 | Card/module titles |
| heading | 18/26 | 600 | Section headings |
| body | 15/22 | 400 | Default text |
| body-strong | 15/22 | 500 | Emphasis |
| caption | 13/18 | 400 | Metadata, helper text |
| overline | 11/16 | 600, +1.5pt caps | Labels, eyebrows |

Rules: max line length 70ch for prose; headlines never all-caps; numbers tabular.

### 2.3 Color

Working tokens (brand pending OQ-SA-006).

| Role | Token | Value |
| --- | --- | --- |
| Neutral 950 | bg-deep | `#0C0E12` |
| Neutral 900 | bg-base | `#12141A` |
| Neutral 800 | bg-raised | `#1A1D24` |
| Neutral 700 | border-strong | `#2A2E38` |
| Neutral 600 | border | `#3E4350` |
| Neutral 400 | text-secondary | `#82889A` |
| Neutral 300 | text-muted | `#A9AFC0` |
| Neutral 100 | text-inverse | `#E8EAF0` |
| Neutral 50 | text-base (light) | `#F6F7F9` |
| Brand primary | brand | `#5A67F5` (working indigo) |
| Brand hover | brand-hover | `#4A56E0` |
| Brand subtle | brand-subtle | `#EEF0FF` |
| Success | success | `#12B76A` |
| Warning | warning | `#F79009` |
| Danger | danger | `#F04438` |
| Info | info | `#0BA5EC` |

Status semantics (from 01 §2.3): green open/live · amber closing/warning · red cancelled/incident.

### 2.4 Elevation and blur

| Token | Shadow | Blur |
| --- | --- | --- |
| e0 | none | — |
| e1 | `0 1px 2px rgba(0,0,0,.06)` | — |
| e2 | `0 4px 12px -2px rgba(0,0,0,.12)` | — |
| e3 | `0 12px 32px -8px rgba(0,0,0,.20)` | 24px (glass) |
| e4 (modal) | `0 24px 64px -16px rgba(0,0,0,.32)` | 32px |

### 2.5 Glass tokens

| Token | Value |
| --- | --- |
| glass-card-light | fill `rgba(255,255,255,.66)` · blur 24 · hairline `rgba(16,18,24,.08)` |
| glass-card-dark | fill `rgba(255,255,255,.06)` · blur 24 · hairline `rgba(255,255,255,.14)` |
| glass-field | fill `.5` · blur 8 |
| glass-nav | fill `.72` · blur 20 · hairline 1px |

Glass is for surface/overlay moments (auth, nav, floating cards) — never under dense tables (readability).

### 2.6 Radius

| Token | Value |
| --- | --- |
| radius-sm | 8 |
| radius-md | 12 |
| radius-lg | 16 |
| radius-xl | 20 |
| radius-full | 999 |

### 2.7 Icons

- 24px grid · 1.5px stroke · rounded line caps.
- Filled glyphs reserved for semantic status (success/warning/danger/done).
- One stroke weight family across the OS; no mixed icon styles.

### 2.8 Breakpoints (responsive web)

| Token | Value | Behavior |
| --- | --- | --- |
| sm | <640 | Single pane; cards rise from below; bottom sheet feel |
| md | 640–1024 | Two-pane auth; compact nav |
| lg | >1024 | Full desktop; persistent left nav (from 01) |

## 3. Components

### 3.1 Buttons

| Variant | Style |
| --- | --- |
| Primary | Brand fill, text-inverse, radius-md, min-h 44 (52 in auth) |
| Secondary | Glass/e0 surface, border, text-base |
| Ghost | No fill, text-secondary → brand on hover |
| Destructive | Danger fill for irreversible actions |
| Danger-ghost | Danger text/border, no fill |

Common: height 44/40/32 (lg/md/sm), radius-md, loading = inline shimmer + label swap (never spinner), disabled = 40% opacity + no pointer, success morph = check.

### 3.2 Inputs

- Height 44 (52 in auth), radius-md, glass-field or solid surface.
- Floating/visible label (never placeholder-only), leading icon, focus = 2px brand ring + soft glow, error = danger ring + inline message, success = trailing check (optional).
- States: idle · hover · focus · filled · disabled · error · loading · readonly.
- Numeric inputs (phone/OTP) use tabular figures and prevent non-numeric paste where required.

### 3.3 Cards

| Token | Use |
| --- | --- |
| surface-base | Default (e0, solid surface) |
| surface-raised | Hoverable/selectable (e2, hover e3) |
| card-glass | Auth, floating overlays (glass-card token) |
| card-modal | e4 + 32px blur, radius-xl |

### 3.4 Status system

Consistent chip language: dot + label + tint (success/warning/danger/info/neutral). Same tokens in tables, cards, filters, and the session timeline (from 01).

### 3.5 Banners and alerts

Inline (field-level) < inline banner (card top) < full-screen state (Unauthorized/Maintenance). Hierarchy of emphasis — never a dialog where a banner suffices.

## 4. Motion principles (deliverable 12)

### 4.1 Durations

| Token | Value | Use |
| --- | --- | --- |
| duration-fast | 120ms | Hover, press, small fades |
| duration-base | 200ms | Standard transitions, field focus |
| duration-slow | 280ms | Screen transitions, panel entrances |
| duration-xslow | 400ms | Splash exit, modal overlay, celebratory states |

### 4.2 Easing

| Token | Curve | Use |
| --- | --- | --- |
| standard | `cubic-bezier(.2,0,0,1)` | Defaults |
| emphasize | `cubic-bezier(.16,1,.3,1)` | Entrances, hero moments |
| decelerate | `cubic-bezier(0,0,.2,1)` | Elements settling into place |
| accelerate | `cubic-bezier(.4,0,1,1)` | Exits |
| spring | tension 200 · friction 20 | Logo settle (splash) |

### 4.3 Motion patterns

- **Entrance:** fade + translateY(8–12px), 240ms, emphasize; staggered children 40ms apart (max 5 steps).
- **Overlay:** opacity + backdrop-blur ramp, 280ms; scale 0.98 → 1.0 for cards.
- **Exit:** fade + blur ramp, 200ms, accelerate; never slide far.
- **State change:** 160–200ms crossfade; color/status changes fade, not snap.
- **Progress:** segmented hairline or skeleton shimmer (opacity 0.5 → 1.0, 1.2s loop) — no spinners.
- **Micro-interactions:** press = scale 0.98; focus = glow; error = single micro-shake (2px, 3 reps, 240ms).

### 4.4 Rules

1. One primary layer animates at a time (max two).
2. Motion communicates state or orientation — never decoration.
3. No looping motion except gentle shimmer (off by default under reduce-motion).
4. Haptics (mobile): success tick, error nudge, threshold reach — subtle, one per action.
5. **Reduced motion:** all animations become ≤120ms opacity/static; no translate, no springs, no parallax.

## 5. Accessibility baseline

- Contrast AA minimum (WCAG 2.1 AA) on all text and controls.
- 48px minimum touch targets (44 visual with padding).
- Full keyboard operation; visible focus 2px; no focus traps.
- Dynamic type to 200%; text never clipped by fixed heights.
- Labels always present; status conveyed beyond color (icon + text).
- Reduced motion respected at the token level (not per screen).

## 6. Decisions and open questions

### 6.1 Decisions (this workstream)

| Decision | Detail |
| --- | --- |
| Inter typeface (working) | Pending brand (OQ-SA-006) |
| Indigo brand accent (working) | Pending brand |
| Single icon family | 24px · 1.5px stroke |
| Token-level reduce-motion | Global motion kill-switch |
| Glass surface rule | Overlays/auth only; never under dense content |

### 6.2 Open questions

| ID | Question | Owner |
| --- | --- | --- |
| OQ-SA-006 | Brand name and identity (replaces working tokens) | Founder |
| OQ-SA-031 | Which component library / UI kit for the Next.js console (overrides tokens?) | Engineering |

## 7. Dependencies

- **Baseline IA/design:** `docs/design-system/01-admin-design-direction.md`.
- **Screens:** specs consume these tokens `docs/auth/02-screen-specifications.md`.
- **Hierarchy:** console serves all positions `docs/admin/15-franchise-operating-model.md`.

## 8. Related documents

- `docs/auth/01-authentication-experience.md`
- `docs/admin/03-admin-information-architecture.md`
- `docs/project-records/MASTER_PROJECT_STATE.md`
