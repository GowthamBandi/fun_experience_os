# 02 — Screen Specifications (Authentication)

> **Status:** Planning draft — SA-1A.
> **Document type:** Screen specification.
> **This document is a planning draft.** Specifications describe intended behavior and design. **No implementation exists.**

Each screen specifies: Purpose · Components · User actions · Possible states · Animations · Accessibility · Future backend dependencies.

Surface: Experience OS (web primary, responsive mobile for field staff). Tokens referenced from `docs/design-system/02-experience-os-design-system.md`.

---

## 1. Splash

| Aspect | Specification |
| --- | --- |
| Purpose | Brand moment that masks initialization latency; establishes the Experience OS identity; guarantees a graceful cold start. |
| Components | Ambient background (gradient wash + grain) · logo mark · wordmark · hairline segmented micro-progress (3 segments) · (mobile) single haptic tick |
| User actions | None. No skip offered (admin console). Auto-advance on initialization completion. |
| Possible states | Cold start (full animation) · warm revisit (<60s: 400ms fade, no animation) · reduced-motion (static mark, faster timing) · init slow (hold state, segments advance, never a spinner) · init failed (fall through to offline or retry banner) |
| Animations | Mark assembly 400ms → settle spring → wordmark tracking expand 320ms → hold → crossfade + 12px upward drift + blur-out 400ms |
| Accessibility | No autoplaying loops; text alternative for wordmark; contrast AA; reduce-motion → static, shortened; VoiceOver skips splash content |
| Future backend dependencies | Health/config endpoint to parallelize init; feature-flag fetch; maintenance flag |

## 2. Login

| Aspect | Specification |
| --- | --- |
| Purpose | Authenticate a staff position (any franchise-hierarchy role) into Experience OS with a single primary path. |
| Components | Brand pane (desktop) · glass card (wordmark, heading, helper text) · identifier field (email or phone) · password field (show/hide) · primary button · "Forgot password?" link · "Keep me signed in on this device" toggle · server-error banner · passwordless-OTP entry link |
| User actions | Enter identifier → enter password → submit · toggle remember · navigate to forgot password · switch to passwordless OTP |
| Possible states | Idle · focused · valid · invalid (inline) · submitting (button shimmer, fields disabled) · server error (banner + retry) · rate-limited · offline notice · success (check morph) · session expired reason on return |
| Animations | Fields stagger in 40ms/240ms fade-up · card scale 0.98→1.0 · focus glow · failed-submit micro-shake · success check morph |
| Accessibility | Visible labels, AA contrast, 48px targets, complete keyboard path, autofill hints, dynamic type 200%, status announcements, reduce-motion |
| Future backend dependencies | Auth endpoint · token issue/refresh · rate-limit metadata · device-trust persistence · maintenance/status checks |

## 3. Forgot Password

| Aspect | Specification |
| --- | --- |
| Purpose | Recover a staff account via phone-OTP (primary) or email (secondary) with minimal steps and no dead ends. |
| Components | Glass card (heading "Reset your password", helper text) · identifier field · "Send code" primary button · back to login · (email channel variant) channel selector |
| User actions | Enter identifier → send code → advance to OTP → set new password → return to login |
| Possible states | Idle · sending (button shimmer) · unknown identifier (generic "If the account exists, a code was sent") · rate-limited · network error · success (confirmation + auto-return to login) |
| Animations | Standard field stagger; send button state morph; success check; gentle transitions between sub-steps |
| Accessibility | Same login baseline; clear focus; no timing-dependent errors (code input has no hard countdown that locks users out); AA contrast |
| Future backend dependencies | Password-reset flow (OTP issue/verify, password update) · rate limiting · channel delivery (SMS/email) |

## 4. OTP

| Aspect | Specification |
| --- | --- |
| Purpose | One shared 6-digit code surface for passwordless login, password recovery, and new-device verification — consistency over bespoke flows. |
| Components | Glass card (title varies by context: "Enter the code") · 6 code boxes · resend control with cooldown · "change identifier" link · error banner · pasted-code support |
| User actions | Enter digits (auto-advance) · paste full code · resend · back/change identifier |
| Possible states | Empty · partial · complete (auto-submit after 6th digit) · submitting · incorrect code (inline error, fields clear, focus first) · expired code (banner + resend) · rate-limited (progressive lockout with clear timing) · success (check → advance) |
| Animations | Digit entry pops subtly (scale 1.0→1.06→1.0) · auto-advance focus · incorrect-code micro-shake once · success check morph |
| Accessibility | Each box labelled ("digit 1 of 6"), group label announced, keyboard entry, no auto-submit trap on paste, AA contrast, reduce-motion |
| Future backend dependencies | OTP issue/verify/resend endpoints · expiry + rate-limit service · delivery channel (SMS/email) · step-up context metadata |

## 5. Verification

| Aspect | Specification |
| --- | --- |
| Purpose | Establish device trust or satisfy a step-up requirement using the shared OTP flow; bridges session check and permission validation. |
| Components | Glass card ("Verify it's you") · trust explanation · OTP group (reused component) · device/context line (e.g., "Chrome · this device") · support link · sign-out |
| User actions | Enter code · request resend · continue on success · sign out from this device |
| Possible states | Required (new device/step-up) · submitting · incorrect · expired · too many attempts (fall to manual review note) · success (proceed to permission validation) |
| Animations | Shared OTP motion; card context fades in after success; no dramatic transitions |
| Accessibility | OTP group accessibility; context line announced; AA; reduce-motion |
| Future backend dependencies | Device-trust registration · step-up authorization (permission-gated actions) · manual-review fallback (Super Admin) |

## 6. Unauthorized

| Aspect | Specification |
| --- | --- |
| Purpose | Tell a signed-in-but-denied staff user they lack access without implying system failure; give a clear path forward. |
| Components | Brand mark · heading "You don't have access to this workspace" · short explanation (scope/role) · "Contact your manager" + support link · Sign out · (no auto-retry) |
| User actions | Contact support · sign out · (no retry loop) |
| Possible states | Role lacks module access · suspended/banned (account-level) · revoked session · scope removed (franchise/city changed) · too many permission attempts (cool-down) |
| Animations | Calm 240ms fade-up; no shake, no alarms |
| Accessibility | Simple reading order; links are real links; AA; reduce-motion |
| Future backend dependencies | Access-decision endpoint (why-denied reason) · support ticket deep link · session revocation |

## 7. Loading

| Aspect | Specification |
| --- | --- |
| Purpose | A progressive, branded loading surface during initialization and permission loading — never a blank page or generic spinner. |
| Components | Ambient background · brand mark (motion) · hairline segmented progress · context label ("Loading your workspace…") · skeleton module shells (post-auth) |
| User actions | None during init; keyboard/assistive tech announced progress |
| Possible states | Init (config/flags/health) · session check · permission load (skeleton shells appear per permission group) · slow (hold, segments advance) · stuck (timeout → retry with reason) · offline (switches to offline mode) |
| Animations | Segmented progress advance; skeletons shimmer softly (opacity 0.5–1.0); no spinner, no loops beyond subtle shimmer |
| Accessibility | Progress announced (aria-live); skeleton content hidden from screen readers; AA; reduce-motion (static skeletons) |
| Future backend dependencies | Boot/config endpoint · session introspection · permission bundle · feature flags · health/status endpoint |

## 8. Session Expired

| Aspect | Specification |
| --- | --- |
| Purpose | Resume work with the least friction when a session lapses; never a dead end or a bare redirect. |
| Components | Brand mark · "Your session expired" · short reason (idle / token invalid / signed out elsewhere) · "Sign in again" primary · optional "Return to where you were" context · support link |
| User actions | Sign in again → returns to prior context (where supported) · contact support |
| Possible states | Idle timeout (lightweight re-auth path) · hard expiry (full sign-in) · revoked elsewhere (reason shown) · session invalidated by ban (routes to Unauthorized instead) |
| Animations | 240ms fade-up; no alarming states |
| Accessibility | AA; logical order; reduced-motion |
| Future backend dependencies | Token lifecycle · idle-timeout configuration · deep-link restore of prior context |

## 9. Maintenance

| Aspect | Specification |
| --- | --- |
| Purpose | Communicate planned or unplanned platform unavailability with clarity and a calm premium tone; distinct from Unauthorized and Platform disabled. |
| Components | Brand mark · "We're making improvements" heading · expected return time (when known) · short explanation · status link · auto-return on re-open (optional) |
| User actions | Read status · optional notify-me/return · (no destructive actions) |
| Possible states | Full maintenance (all users blocked) · scheduled banner (platform open, banner only) · maintenance nearing end (countdown optional) · extended (updated ETA) |
| Animations | Single 400ms settle; no loops; ETA updates fade in |
| Accessibility | AA; no auto-refresh traps; reduced-motion |
| Future backend dependencies | Maintenance flag + ETA from status service · scheduled-window API · runtime status feed |

---

## Cross-screen notes

- **Shared components:** OTP group, primary button (loading/success morph), glass card, error banner, segment progress — all from the design system (`docs/design-system/02`).
- **State hygiene:** Unauthorized ≠ Maintenance ≠ Platform disabled ≠ Offline. Each has its own screen and affordances.
- **Reduced motion:** every screen defines a static, shortened variant.
