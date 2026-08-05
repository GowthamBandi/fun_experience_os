# 01 — Authentication Experience

> **Status:** Planning draft — SA-1A.
> **Document type:** Product design (experience OS sign-in).
> **This document is a planning draft.** It designs the complete authentication experience. **No implementation exists** — no backend, auth logic, Flutter, Next.js, Firebase or APIs.

---

## 1. Purpose and scope

Design the complete sign-in journey for **Experience OS** (the Super Admin console, working name — brand pending OQ-SA-006). The journey spans splash through permission validation to dashboard entry, serving every position in the franchise hierarchy (`docs/admin/15-franchise-operating-model.md`) on web (primary) and mobile-optimized surfaces for on-site staff (OQ-SA-033).

Design bar: premium operating system (Apple, Stripe, Linear, Notion, Airbnb), not a traditional admin panel.

**Out of scope:** the participant app's customer journey (a parallel but separate flow, to be designed in its own phase). This phase designs the console only.

## 2. The complete journey

### 2.1 Journey map

```
Cold start
   → Splash (≤2.2s, brand moment — no spinner)
   → Brand animation (mark → wordmark settle)
   → App initialization (config, feature flags, maintenance/health check — parallel)
   → Session check
        ├─ Valid session (trusted device) ───────────────→ Permission validation
        ├─ Session expired / invalid ─────────────────────→ Login
        ├─ New device / step-up required ─────────────────→ Verification (OTP)
        ├─ Account suspended / banned ────────────────────→ Unauthorized
        └─ Offline ───────────────────────────────────────→ Offline mode (read-only)
   → Login
        ├─ Success ───────────────────────────────────────→ Permission validation
        ├─ Forgot password ───────────────────────────────→ Forgot Password
        └─ Passwordless (OTP) ────────────────────────────→ OTP
   → Forgot Password
        → identifier → OTP → set new password → success → Login
   → OTP (6-digit code: login / recovery / new-device)
   → Verification (device trust confirm — merge point with session check)
   → Permission validation (RBAC + city scope + module access — progressive)
   → Dashboard entry (Experience OS shell transition — shell itself not designed here)
```

### 2.2 Surface rules

- Web-first (desktop workstations) with a fully responsive mobile surface for Venue Managers, Coordinators and Staff.
- The flow is identical across surfaces; only layout adapts (two-pane → single pane).
- Session, maintenance and platform-status checks run during initialization so auth is never blocked by a failed background call.

## 3. Splash experience (Part 3)

| Aspect | Design |
| --- | --- |
| Purpose | Brand moment + perceived performance. It hides initialization latency, sets tone, and confirms the product before any input. It is not a delay. |
| Timing | Total ≤ 2.2s. Mark reveal 400ms → settle 600ms → wordmark 320ms → hold → transition 400ms. Warm revisit (<60s since close) skips straight to initialization with a 400ms fade. |
| Animation | Logo mark assembles softly (elements resolve into place), scales 0.92 → 1.0 with a gentle spring, then the wordmark fades in with expanding letter-spacing. An ambient radial gradient drifts subtly in the background. No bounce, no loops, no spin. |
| Background | Deep neutral base (graphite, `#0C0E12`) with a slow brand gradient wash and fine grain for depth. On light theme: soft neutral with a muted brand wash. |
| Logo behavior | Mark first, then wordmark; settles at the upper third; stays calm and static after settle (never loops). |
| Loading state | Progress is communicated with a 3-segment hairline micro-progress (init config / session / permissions) — never a spinner. The logo itself carries no load state. |
| Micro-interactions | Subtle settle "breathe" at completion; a single haptic tick on mobile as the transition fires. |
| Transition | Crossfade with a 12px upward drift and increasing backdrop blur out of the splash into init/login. |
| Motion principles | 200–320ms, decelerating ease; one layer moves at a time; no parallax on splash; fully static under reduce-motion. |

## 4. Login experience (Part 4)

| Aspect | Design |
| --- | --- |
| Layout | Desktop: two panes — brand pane (ambient gradient, product value line, subtle graphic) + centered glass card. Mobile: full-bleed ambient background with the glass card rising from below. Card max-width 400px. |
| Branding | Wordmark on the card top; small, quiet. Brand pane carries the story; the card carries the task. |
| Typography | Display "Welcome back" (`display`), caption helper text (`body`), inputs at 16px (prevents mobile zoom). Numeric identifiers in tabular figures. |
| Glassmorphism | Card glass: translucent fill + 24px backdrop blur + 1px hairline + layered shadow (tokens in `docs/design-system/02`). Card sits on an ambient backdrop, never over dense content. |
| Card style | Radius 20px, elevation e3, glass fill; internal spacing 32px; hairline top accent (brand) as a subtle detail line. |
| Inputs | Glass field (blur 8, 0.5 fill), 52px tall, leading icon, floating label, 16px text, no all-caps placeholders. Password has show/hide. Identifier: work email or phone (both accepted; India ops is phone-friendly). Autofill hints on. |
| Buttons | Primary: full-width, 52px, radius 12px, brand fill; loading swaps label to "Signing in…" with an inline segmented shimmer (no spinner); disabled during submit. |
| Validation | Inline, debounced (300ms), real-time: identifier format, password presence. Server errors map to distinct messages: invalid credentials / rate-limited / network / platform state. Never enumerate which field was wrong ("Incorrect email or password"). |
| Animations | Fields stagger in (40ms apart, 240ms fade-up); card scales 0.98 → 1.0 on entry; focus raises field elevation + accent ring glow; failed submit triggers a single gentle micro-shake on the card; success morphs the button to a check. |
| Focus states | Visible 2px accent ring + soft glow; keyboard focus order: identifier → password → remember → submit → forgot. |
| Loading states | Button loading + fields disabled; no double submit; haptic "ack" on mobile. |
| Error states | Top-of-card banner for server errors (with retry), inline for field errors, distinct offline notice. Banner is calm, not alarming. |
| Success states | Button check → 200ms hold → transition to permission validation; haptic success tick. |
| Accessibility | Visible labels (never placeholder-only), contrast AA, 48px touch targets, complete keyboard operation, dynamic type to 200%, VoiceOver/TalkBack announces status changes, no auto-submit, reduced-motion respected. |
| Keyboard behavior | Enter submits; Tab order logical; "Go" return key on submit; Cmd/Ctrl+Enter submits; Esc clears error banner. |
| Remember session | "Keep me signed in on this device" — default **on** for trusted workstations, controls refresh-token persistence (device trust). See §7 session lifecycle. |

## 5. Role check (Part 5)

| Aspect | Design |
| --- | --- |
| Session validation | Token validated at init; silent refresh before expiry; on failure → login (or re-verification for new device). Never a bare redirect — always a reason. |
| Permission loading | After auth, permissions load progressively: role → permissions → city/franchise scope → visible modules. The shell renders module shells as permission groups resolve (skeleton shimmer, not blank or spinner). |
| Unauthorized screen | Dedicated 403: "You don't have access to this workspace" + what to do (contact your manager / support link) + Sign out. Calm, no sensitive detail, no retry loop. |
| Maintenance mode | Checked at init and at runtime. Full-screen brand + "We're making improvements" + ETA when known; scheduled-maintenance banner variant when the platform is open. No destructive actions during maintenance. |
| Platform disabled | Distinct from maintenance: account suspended / region disabled. Shows reason category, support channel, appeal path, and Sign out. No auto-retry. |
| Offline mode | Cached shell with read-only data; destructive actions disabled and explained; a persistent reconnect banner; queued non-destructive actions flush on reconnect. |

## 6. Verification (device trust)

- Triggered for new devices, step-up actions, or after token invalidation.
- Uses the same OTP component as recovery (single code path, fewer screens to maintain).
- After success, the device becomes trusted (subject to the remember-session choice) and the flow proceeds to permission validation.
- Failure is rate-limited; repeated failures fall back to manual review via Super Admin (staff accounts only).

## 7. Session lifecycle

| Concept | Rule |
| --- | --- |
| Device trust | "Keep me signed in" persists a refresh token on the device; cleared on Sign out. |
| Idle timeout | 15 minutes of inactivity → lock to a lightweight re-auth (password) that returns to where you were; full flow only after longer absence (8h) or explicit sign out. |
| Session expiry | Silent refresh keeps sessions alive; hard expiry → login with reason ("Your session expired"). |
| Multi-session | One active session per device; multiple devices allowed for the same staff account. |
| Revocation | Ban/suspension kills sessions at the next validation; the affected session returns to Unauthorized. |
| Offline | Trusted sessions degrade to read-only offline shell; no authentication bypass. |

## 8. Authentication UX review (Part 8)

Deliberate challenges to the design — every item either stays, changes, or is cut.

| # | Challenge | Verdict |
| --- | --- | --- |
| 1 | Does a 2.2s splash add value for an ops console? | **Keep, bounded.** It exists to hide initialization and set tone. Warm revisit skips it; hard cap enforced; never a spinner. |
| 2 | Glassmorphism risks poor readability. | **Keep on surfaces only.** AA contrast enforced with scrim + elevation; glass never sits under dense content; light and dark tokens both specified. |
| 3 | Do we need password AND passwordless OTP? | **Yes.** Password for staff workstations; passwordless OTP for field staff and recovery. One OTP component serves login, recovery and device verification. |
| 4 | Is a separate Verification screen necessary? | **Merge with session check.** It is a real state (new device/step-up) but renders through the shared OTP component, not a bespoke flow. Kept as a distinct spec for states. |
| 5 | Forgot password: OTP vs email link? | **OTP-first.** Phone OTP is the staff baseline (DEC-SA-044 V1/V6-aligned) and avoids email dependency for Indian ops; email remains a secondary channel. |
| 6 | Is email verification needed for admin accounts? | **Cut.** Staff identity is verified through the staffing pipeline (V6), not email click-through. One less step. |
| 7 | Session expiry forces re-login too often. | **Fix.** Silent refresh for permission changes; lightweight re-auth after idle; full login only on token invalidation. |
| 8 | Can complexity be reduced further? | **Yes, cut:** no social login, no QR login, no tenant switcher inside auth, no marketing/email verification, no multi-step "security questions". Single primary path. |
| 9 | Unauthorized vs maintenance vs platform disabled all look alike? | **Separate them.** Three distinct screens with distinct affordances so users never mistake a suspension for maintenance. |
| 10 | Is offline mode scope creep for a web admin? | **Scoped.** Read-only cached shell only; no offline destructive actions; built to the minimum that keeps field staff functional. |
| 11 | Premium vs accessibility conflict. | **Balance.** Reduce-motion respected; motion is functional (orientation, state) not decorative; AA contrast; 200% type. |
| 12 | One journey for all 13 positions? | **Yes, one journey.** Role differences appear only in permission validation, not in sign-in. Keeps auth surface small and consistent. |

**Result:** the journey is one primary path (Splash → Init → Session check → Login → Permission validation → Dashboard entry) with three purpose-built exception surfaces (Unauthorized, Maintenance, Platform disabled) and one shared OTP flow.

## 9. Decisions and open questions

### 9.1 Design decisions (this workstream)

| Decision | Detail |
| --- | --- |
| Single shared OTP component | Serves login (passwordless), recovery, and new-device verification |
| Warm-revisit splash skip | <60s → fade directly to initialization |
| OTP-first recovery | Phone OTP primary; email secondary |
| Device trust default | "Keep me signed in" default on for workstations |
| Idle re-auth | 15 min idle → lightweight re-auth; 8h → full sign-in |
| Three distinct exception surfaces | Unauthorized / Maintenance / Platform disabled |
| Merge verification into session check | New-device and step-up use the shared OTP flow |

### 9.2 Open questions

| ID | Question | Owner |
| --- | --- | --- |
| OQ-SA-069 | Idle-timeout and re-auth thresholds (15 min / 8h proposed) — final values? | Founder + Security |

## 10. Dependencies

- **Hierarchy:** staff positions and permissions `docs/admin/15-franchise-operating-model.md`.
- **Design system:** tokens and motion `docs/design-system/02-experience-os-design-system.md`.
- **Verification policy:** phone OTP baseline `docs/security/04-verification-and-trust-model.md`.
- **Access matrix:** what each role may see `docs/security/02-anonymity-and-reveal-policy.md`.
- **Screen details:** per-screen specs `docs/auth/02-screen-specifications.md`.

## 11. Related documents

- `docs/auth/02-screen-specifications.md`
- `docs/design-system/01-admin-design-direction.md` (prior design baseline)
- `docs/project-records/MASTER_PROJECT_STATE.md`
