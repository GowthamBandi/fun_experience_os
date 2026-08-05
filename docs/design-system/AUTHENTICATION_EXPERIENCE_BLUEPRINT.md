# AUTHENTICATION EXPERIENCE BLUEPRINT

> **Master reference for the Experience OS authentication experience.**
> All future UI implementation — developer and designer — builds from this single document.
> Not a spec. A direction.

---

## 0. Director's note

Every real-world experience in this platform begins the same way: **a door opens.** A court under floodlights, a pitch at dusk, a room where a group of strangers becomes a team. The authentication experience is that same moment, rendered in software. It is not a login flow wrapped in a dashboard theme — it is **the door of the building itself.**

The whole journey is one continuous scene. There are no "pages." The camera moves, light moves, and the user is never asked to feel like they navigated between disconnected screens. The OS has one material — **light** — and one signature motion — **the door opening.** We use nothing else.

Screens: Splash → Brand Reveal → Initialization → Authentication → OTP → Permission Validation → Dashboard Entry.

---

## 1. The storyboard

Seven beats. One scene. The light engine never cuts.

### Beat 1 — Splash

**Purpose.** Power-on. Imprint the mark in the first 400 milliseconds before anything else exists.

**Primary emotion.** Anticipation. The quiet second before a door opens.

**Visual hierarchy.** The entire frame is darkness with one thing in it: the **aperture mark** — a narrow vertical slit of warm light, perfectly centered. Nothing else. The slit is a door seen edge-on.

**Layout structure.** Centered. Negative space is the design. The slit sits at optical center; its light falls on nothing — the darkness around it is the point.

**Motion sequence.** Cold start only. The slit breathes once (width 2px → 5px → 3px, 400ms, gentle ease) — a first heartbeat. This is the only idle motion in the entire OS: the mark is alive.

**Micro-interactions.** None — nothing to touch. The breathing is enough.

**Transition → Brand Reveal.** No cut, no fade, no scale. The slit simply begins to widen. The breathing motion becomes the opening motion. The door is opening before the user can perceive a boundary between "splash" and "reveal."

**Empty / Loading / Error behaviour.** Warm revisit (<60s): the slit appears already open and immediately proceeds to Authentication — the door is still open from a moment ago. Reduced motion: static slit, 200ms, straight to next beat. Init failure: the slit dims to a cool blue and the OS offers retry with one quiet line — the door did not open, but the building did not break.

**Accessibility.** Mark and scene are decorative; a single short screen-reader label announces the platform name. No loops. Nothing blinks faster than 3Hz. The breathing motion is on a 3s cycle — below photosensitive thresholds.

**What makes this screen memorable.** A door, edge-on, in a dark building — you feel a room behind it before you can see it.

---

### Beat 2 — Brand Reveal

**Purpose.** The door opens. The building announces itself. This is the only moment in the flow that is about the brand, and it is earned by the silence before it.

**Primary emotion.** Arrival. The light that was a slit becomes a room.

**Visual hierarchy.** Light bloom (background) → the aperture ring (foreground) → the wordmark (drawn in the ring's glow) → one tagline line, quietly. The hierarchy is *light, then type* — never type before light.

**Layout structure.** The aperture opens from the center slit into a full ring. The wordmark tracks in letter by letter beneath the ring's lower edge. A single editorial tagline sits below — small, overline-spaced, warm. Desktop and mobile: identical, centered, uncluttered. No layout branches.

**Motion sequence.** Slit widens to ring: 700ms, the light curve (fast start, long settle). Light blooms outward radially: 900ms, 1.5× frame width, fading. Wordmark letters enter in cascade (60ms apart, left→right), tracking easing from +14% to settled spacing — the name *locks in*. Tagline fades up 400ms after the last letter, 8px upward settle. Total ≈ 1.6s. Everything settles; nothing overshoots except the ring's opening, which gets one controlled spring (tension 170, friction 22).

**Micro-interactions.** None — cinematic. The user is an audience for 1.6 seconds and that is correct.

**Transition → Initialization.** The ring and wordmark remain on screen — nothing is wiped — they simply **retreat**: ring slides to a small mark at top center, wordmark dims to 35% opacity beside it, the light field cools from bloom to steady dusk, and a hairline tide-line appears beneath. The scene has now become the loading state without a single visual cut.

**Empty / Loading / Error behaviour.** Warm revisit skips this beat entirely. Reduced motion: ring opens 300ms, no bloom, no letters cascade (single fade). 

**Accessibility.** Wordmark is real text, not an image. The ring has no motion on reduce. Screen readers announce the brand name once.

**What makes this screen memorable.** Light moves through a door you just watched open — and the product's name is written in that light, not placed on top of it.

---

### Beat 3 — Initialization

**Purpose.** Let the OS boot — session check, flags, health — without ever showing a spinner, a progress bar, or a "Loading…" word.

**Primary emotion.** Calm trust. The building hums quietly while you wait in the lobby.

**Visual hierarchy.** Small aperture mark (top) → hairline **tide-line** (center) → one line of voice (lower third). The tide-line is the progress: a thin luminous horizontal that advances in segments. The voice line is the only "content."

**Layout structure.** A vertical composition of three quiet elements down the center. Generous. The light field drifts slowly — dusk indigo to warm amber, ~1% hue variance over a 30s cycle. The OS is breathing.

**Motion sequence.** Tide-line segments advance left→right, each a 320ms ease with a 1px settle at completion. The voice line swaps every ~1.2s with a 200ms crossfade. Mark breathes (3s cycle). Max duration 2.4s; if still booting, the tide just keeps breathing — no indeterminate state is ever drawn.

**Voice lines** (swap, never stack): *"Checking the courts."* → *"Counting tonight's sessions."* → *"Waiting for you."* One at a time. Human, present-tense, concrete. No "Loading your workspace."

**Micro-interactions.** None. This beat has no buttons — the only failure affordance is born when needed.

**Empty / Loading / Error behaviour.** Slow: tide breathes past 2.4s, nothing alarms. Stalled (>6s): tide dims, one soft retry pill fades in — *"The lights flickered. Try again."* Offline: the scene cools to a restrained blue and offers *"Continue offline"* — the OS never blocks you from the building that is already open. 

**Transition → Authentication.** The light field dims a stop. The glass panel rises from the lower edge with a 12px upward settle (480ms, light curve). The tide-line fades. The mark steps aside to the panel's upper-left. The room is now the login surface — the transition is the panel *arriving into* the existing light, not a navigation.

**Accessibility.** The voice line is announced via polite aria-live. Tide segments convey no information (progress is decorative; the voice carries meaning). Reduce-motion: tide segments fade instead of sweeping, drift stops.

**What makes this screen memorable.** Progress told in light and one human sentence — no spinner, no "Please wait," no anxiety.

---

### Beat 4 — Authentication

**Purpose.** Authenticate a staff position. Primary path: identifier + password. Secondary: passwordless code. One surface, zero dead ends.

**Primary emotion.** Composed confidence. You are on the operations floor; the room is calm and lit.

**Visual hierarchy.** Glass panel (the room) → the identifier field (the only thing lit) → the password field (materializes on demand) → the **illuminate-bar** (the action). Hierarchy by *luminance*: what is lit is what matters; the rest is frost.

**Layout structure.** Desktop: a two-act scene — left, the brand space (mark, wordmark, dusk field, the faint reflection of the mark under the panel); right, the glass panel. Mobile: the panel becomes the full frame; the brand space is a memory, not a second column. The panel is a single sheet — there is no card-in-card, no sidebars, no footer.

**Voice.** One editorial line above the fields, never a label-stack: *"Enter the operations floor."* Then the field. The password field is **not visible until the identifier is recognized** — it materializes with the panel extending downward, the field rising into existence (320ms). This choreography is the memorable moment of this beat.

**Field design.** One field, email OR phone, no placeholder-as-label (visible label above, quiet). Focus = a soft bloom of light along the field's bottom edge, 2px ring of brand light. The illuminate-bar spans the panel width, text left-aligned — *"Enter"* with an arrow glyph — and **ignites** (glow builds, brightness up) only when valid. It is dormant otherwise: present, but unlit. This is not a disabled state; it is a dark lamp.

**Motion sequence.** Panel arrives (Beat 3 transition, 480ms settle). Fields settle in sequence as needed. Password field materializes: 320ms light-curve, extends the panel downward by exactly its height (the panel is elastic, it grows with the content, no overlap). Bar ignite: 240ms brightness bloom. Submit: the bar shows a fine traveling shimmer (600ms loop, low amplitude) — the only loading the OS ever draws.

**Micro-interactions.** Focus: bottom-edge bloom + 1px field rise. Hover on bar: arrow nudges +3px. Typing: nothing moves — sound and light are the feedback. Error (wrong password): the panel gives **one** low shake — 3px, 240ms, then stillness — a door that didn't open. Success: a warm tick, the bar's glow blooms, panel begins to lift upward (this is the exit). Show/hide password: a quiet eye glyph; toggle blurs/refocuses the field, no animation.

**Empty / Loading / Error behaviour.** Empty: calm, bar unlit. Submitting: shimmer, fields locked. Server error: one line beneath the bar — *"The floor is busy. Wait a moment."* — with the bar re-ignitable immediately. Rate-limited: the panel dims progressively, the wait shown in a quiet overline (no numeric threat display). Offline: cool-blue note + *"Continue offline"* at the bar.

**Transition → OTP (passwordless path).** The identifier field's bottom edge **becomes** the OTP row: the panel morphs, and the six light slots grow out of the space where the field was (520ms, light curve, panel stays put — the room doesn't move, its contents reorganize). This is the flagship continuity moment: one surface, two contents, zero navigation.

**Transition → Permission Validation (password path).** On success the whole panel lifts upward and the light field brightens — the room opens into the next beat. Panel fade+rise 420ms, accelerate-out. 

**Accessibility.** Complete keyboard path. Visible focus always. Autofill hints on both fields. Errors are announced (aria-live), not just colored. The shake is suppressed under reduce-motion (replaced by a static error line). Field text scales to 200% without clipping — the elastic panel guarantees it.

**What makes this screen memorable.** The second field is not there until you need it. The button is a lamp that lights only when you may pass. The form has become choreography.

---

### Beat 5 — OTP

**Purpose.** One shared 6-digit surface for passwordless entry, recovery, and device verification. The whole OS concentrates into six slots of light.

**Primary emotion.** Focused anticipation. The room darkens; the code is the only lit thing.

**Visual hierarchy.** The background light recedes to near-dark. The panel becomes a **pocket of light**. Six slots in a row — not boxes, but *slots of light* — and only the active one is lit. Voice line: *"Enter the code."* Context line, quiet: *"Sent to ••••••42"*.

**Layout structure.** A single centered row of six slots, generous spacing between them (12px), pill radii, no grid, no keyboard visible in design (system keyboard on mobile). Above the slots, the voice line. Below, the resend — not a button, a quiet sentence: *"Didn't arrive? Send it again in 23."*

**Motion sequence.** Entry: slot ignites (light pops up 2px, 160ms settle), focus hops to the next slot (instant, no traveling focus animation — the hop is what feels mechanical-and-precise, in a good way). Auto-submit on the 6th digit: all six slots lock lit, a confirmation pulse rings outward from the row (280ms), then the whole panel breathes upward into the exit. 

**Micro-interactions.** Each digit: a soft tick haptic. Paste a full code: all six slots ignite in a 24ms cascade, left→right — one of the few allowed delights. Incorrect code: the six lights **recede in a wave** — a low, left→right dimming sweep (300ms) — then clear, and the first slot relights. One error tone. No shake: light recedes instead of boxes rattling.

**Empty / Loading / Error behaviour.** Partial: unlit slots stay dark. Submitting: slots hold their light, a fine shimmer. Wrong code: wave-recede (above), counter resets. Expired: *"That code aged out."* and the resend sentence re-offers itself automatically. Rate-limited: the panel dims in steps; the wait appears as a quiet overline. Never a lockout wall — a dimming room.

**Transition → Permission Validation.** On success the six lights collapse into a single point that streaks upward through the frame — the light *leaves the panel and becomes you*. 600ms, accelerate-out, trailing bloom. This is the door opening a second time, now from the inside.

**Accessibility.** Each slot labeled ("Digit 1 of 6"); the group is a single field to screen readers (one edit, auto-advancing caret). Paste is reliable on assistive tech. No auto-submit trap: if a screen reader user is mid-entry, submission waits for the 6th digit only. Colors never carry the error — the wave is reinforced by the spoken error line.

**What makes this screen memorable.** Six slots of light in a dark room. Your attention is physically narrowed to a single row, and when you finish, the light gathers into you.

---

### Beat 6 — Permission Validation

**Purpose.** Confirm who is operating and what they carry into the console — rendered as recognition, not as checkboxes.

**Primary emotion.** Recognition. Being welcomed. Authority granted gently.

**Visual hierarchy.** The light sweep from Beat 5 settles. A single **identity line** resolves in editorial type — your position, then your scope, one line each: *"Operations Manager"* then *"Hyderabad · Central"*. Beneath it, a row of three thin **capability bars** ignite in sequence — light beams, not checklists — each with a faint overline: *City · Sessions · People*. The bars are the permission domains made visible as light.

**Layout structure.** A centered vertical: identity line above, capability bars below, the mark small at top. Restrained — this beat lasts under two seconds and should feel like a held breath.

**Motion sequence.** Identity line resolves: text renders blurred and sharpens into focus (420ms, the only text blur in the flow — one signal for "this is being established"). Capability bars ignite left→right, 90ms each, 120ms apart, each with a soft tick. Bars hold, then the mark brightens — the door.

**Micro-interactions.** None. This beat is observation, not interaction. That asymmetry is deliberate: the OS recognizes you; you do nothing.

**Empty / Loading / Error behaviour.** Validation pending: bars ignite as domains resolve (they can appear one, two, three — this doubles as the loading state). Denied: the light cools to restrained blue, the identity line softens, and the scene becomes the Unauthorized state — the mark's light dims, the message is quiet and clear (*"This door isn't yours."*), with the way out (contact manager, sign out) drawn as quiet text. Revoked/suspended: identical cooling, a softer line. No alarms anywhere.

**Transition → Dashboard Entry.** The identity line lifts, the aperture mark returns and **opens wide** — the door, full frame, from the inside — and the frame floods with warm light (white-bloom, 650ms) before settling into the OS base state. The door is not behind you; you are walking through it.

**Accessibility.** The identity line is real text, announced. The capability bars are decorative; the aria-live announces the validated position and scope in one sentence. Reduce-motion: no sweep, no sharpen — bars fade in, bloom becomes a 300ms fade.

**What makes this screen memorable.** Being *recognized* instead of *validated*. The OS answers who you are in light before it shows you anything.

---

### Beat 7 — Dashboard Entry

**Purpose.** End the cinema and begin the product — gracefully, so the change is felt as an arrival, not a cut.

**Primary emotion.** Arrival. Readiness. You are home.

**Visual hierarchy.** The bloom settles into the OS base: deep dusk field, the glass left-nav, the mark in the nav. One **greeting** in display type over the main surface — *"Good evening."* then your name — sharp for a moment, then the surface recedes into the working environment.

**Layout structure.** The OS base state: dusk light field (back), glass nav (left, frosted, hairline top-edge light), main surface rising (front). The greeting is a foreground moment that politely steps aside.

**Motion sequence.** Bloom settle: 500ms decelerate to base. Nav and surface rise together: 12px settle, 480ms, light curve — the room *lands*. Greeting renders, holds 1.2s, then fades to 100%→70% and the working surface completes its density fade-in (content reveals in three soft waves, 160ms apart, low amplitude). Total from bloom to product: ≈2s. No spring, no bounce — the building is done opening.

**Micro-interactions.** The first hover states of the OS introduce themselves: nav items gain a top-edge light, not a background fill.

**Empty / Loading / Error behaviour.** If the greeting context is unavailable, it omits gracefully (no placeholder name). If the surface data is slow, skeletons breathe at 1.2s (soft opacity shimmer), never a spinner — the same tide-line language.

**Transition → (the product).** None. This is the end of the journey; the camera rests.

**Accessibility.** Greeting is polite-announced. No motion loops. Reduce-motion: fade only.

**What makes this screen memorable.** The product you were about to use *greets you by name* — and the door that opened at the start of the journey is the door you just walked through.

---

## 2. The transitions (the seams)

The flow is continuous — these are the only seams, and each is described so precisely that no two implementations can disagree.

| # | Seam | Moves | Fades | Scales | Blurs | Stays fixed | Duration | Curve | Haptic |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Splash → Reveal | Slit widens | — | Slit 2px → ring diameter | — | Center point | 700ms | light (fast start, long settle) | — |
| 2 | Reveal → Init | Ring retreats to top-center mark; wordmark recedes beside it | Bloom cools 100%→35% | Ring 100% → 28% | Field +4px atmosphere | Vertical center axis | 500ms | light | — |
| 3 | Init → Auth | Glass panel rises from lower edge | Tide-line fades 100%→0 | Panel 0.99 → 1.0 | Field +6px depth | Mark (top-left of panel) | 480ms | light | — |
| 4 | Auth → OTP (passwordless) | Six slots grow out of the identifier field's space | Fields crossfade out | Slots 0 → 1.0 (staggered) | Panel frost +2px | Panel frame | 520ms | light | one soft tick |
| 5 | Auth → Permission (password) | Panel lifts upward | Panel fades 100%→0 | Panel 1.0 → 1.02 | Light bloom +8px | Mark | 420ms | accelerate-out | confirmation pulse |
| 6 | OTP → Permission | Six lights collapse to a point and streak upward | Slot light concentrates | Point 1.0 → 0.6 → trail | Trailing bloom | Center axis | 600ms | accelerate-out | — |
| 7 | Permission → Dashboard | Mark opens wide; frame floods warm | Identity line fades 100%→0 | Door 0 → full frame | — (pure light) | — | 650ms | light, then decelerate | warm pulse |
| 8 | Bloom → Product | Nav + surface settle down 12px | Bloom 100% → base | Surface 1.02 → 1.0 | — | Nav frame | 480ms | decelerate | — |

**The light curve (signature):** `cubic-bezier(.19, 1, .22, 1)` — fast start, long settle. Everything that enters the scene *arrives*; nothing snaps, nothing bounces (except the mark's opening spring: tension 170, friction 22).

**Master rule:** at most two layers animate at once. When the panel rises, nothing behind it moves. When light blooms, type is still. One primary layer per moment.

---

## 3. The visual language

One material, one source of light, one door.

### Lighting
Every screen is lit by **one** radial light source — dusk. Its character: warm amber rising from the lower field, deep indigo above, a point of cooler light where the mark lives. There is no flat lighting, no pure black. Surfaces are **lit, not outlined** — separation comes from light falling on edges, not from borders.

### Depth (three planes, never more)
1. **The light field** — background. It drifts slowly (30s, ~1% hue variance). It is the atmosphere.
2. **The glass plane** — panels, the nav. Frost, backdrop blur, and a **hairline top-edge highlight** (a 1px brighter line along the top) that catches the light source. Glass is how the OS hints at what's behind it.
3. **The control plane** — fields, the slots, the illuminate-bar. This is where light concentrates. **More light = more focus. More blur = more depth.**

### Glass
Frost 24–32px backdrop blur, saturation pulled ~10%, fill around 6% white in dark / 66% white in light. Every glass edge carries the top-edge highlight. Beneath the auth panel, a faint **reflection** of the aperture mark — a soft, vertically-reversed gradient at low opacity — anchors the panel to the room.

### Reflections
Used exactly once, the panel reflection. Reflections are not a general-purpose decoration.

### Contrast
Contrast is carried by **light intensity**, not color jumps. Text is luminous, not white-on-grey. Status is a *temperature change*: warm amber = active/progress, green = live, red = attention, cool blue = calm/cold states (offline, denied, waiting).

### Motion
The signature curve `cubic-bezier(.19, 1, .22, 1)` everywhere. Durations: micro 120ms (ticks, focus blooms), surface 240–320ms (field materialize, slot ignite), scene 480–700ms (panel arrival, door open), atmosphere 900ms+ (blooms, drifts). Nothing moves without a reason, and every motion ends in stillness.

### Typography
Editorial, not functional. Display: a tight grotesque, tracked for hero moments (*"Enter the operations floor."*), rendered in luminous text — never pure white, always the light value of the field. UI: a neutral sans, small, quiet. **Numbers are tabular.** One overline voice (11px, wide tracking, caps) for context lines and capability overlines. Hierarchy is achieved with scale and light, not weight.

### Breathing space
Whitespace is luminous — it reads as lit air, not empty canvas. Each beat is composed around negative space: Splash is *almost all* space, OTP narrows to a single row, then the space returns at Dashboard Entry. The journey is a breathing cycle.

### Particle effects
Reserved for two moments: cold-start Splash (a few slow dust motes, density 0.3%, 6fps, faint) and success blooms (Brief, on the confirmation pulse). Never during content, never dense, never required. They are the room's dust catching the light.

### Noise texture
A film grain over everything, ~1% opacity, tileable, animated very slowly (6fps, 1px jitter). It kills gradient banding and gives the light field physicality — the difference between a gradient and an atmosphere.

### Gradient behaviour
All gradients are radial, from the single source. They drift, they never animate in duration-bearing ways during dense moments. The drift is the OS breathing.

### Shadow philosophy
Shadows are **warm-black and soft** — they give glass panels weight *above* the light field. They are deep (24–64px, low opacity) and exist only under glass planes. They are never used to fake depth in the control plane — controls are separated by light, not shadow.

### Corner radius philosophy
One large panel radius (24–28) and many small pill radii (6–10 for fields, full-pill for the OTP slots). Two radii, used consistently: the sheet, and the atoms. Nothing in between.

### Icon style
1.5px stroke, rounded caps, drawn to read like **cut glass** — each icon carries its own 1px top-edge light, matching the panels. One family, one weight, no mixed styles. Glyphs are filled only for live status (the capability bars, the tick).

---

## 4. Voice

The OS speaks rarely and in the present tense. It says *"Waiting for you"*, not *"Please wait."* It says *"Sent to ••••••42"*, not *"We have sent a verification code to your registered mobile number."* It says *"Enter the operations floor."*, not *"Welcome back! Please sign in to continue."* One sentence at a time, concrete nouns, no exclamation marks, no corporate cheer. The building is calm.

---

## 5. Haptics & sound

**Haptics (mobile).** One soft tick per OTP digit. A confirmation pulse on submit success. A low nudge on error — never more than one. The OS haptics like a lock, not a game.

**Sound (optional, diegetic — never musical).** A soft tonal bloom when the door opens (Splash → Reveal, and the final bloom). A low hum at Initialization (barely audible, the building's power). A tick at each OTP digit. No sounds after Authentication except the confirmation. Default off; the user opts in. Nothing loops.

---

## 6. Accessibility, as a system

- **Reduce-motion:** every beat has a static variant (defined per beat). At the token level, not screen by screen: reduce = no translate, no sweep, no spring; durations cap at 300ms; blooms become fades; drift stops; grain freezes.
- **Contrast:** WCAG 2.1 AA. Text is luminous by design but tuned to stay above 4.5:1 on the dusk field; the mark and glyphs above 3:1.
- **No motion > 3Hz, no loops** (the 3s mark-breath and 30s field-drift are below photosensitive thresholds).
- **Luminance is decoration, never information.** Every status is carried by text, announced by aria-live, and reinforced by haptic. The capability bars, the wave-recede error, the bloom — all are redundant channels.
- **The elastic panel** (grows with content) guarantees 200% type never clips.
- **Focus** is always visible — the 2px brand-light ring — and the keyboard path through every beat is complete and trap-free.

---

## 7. Implementation reference

Anchors for the build, not a token dump. The palette exists as light references.

| Role | Light reference (dark) | Purpose |
| --- | --- | --- |
| Field base | `#0C0E12` warm-black | the room |
| Field depth | `#12141A` | dusk lower field |
| Glass fill | `rgba(255,255,255,.06)` · blur 24 | the panel |
| Top-edge highlight | `rgba(255,255,255,.14)` · 1px | light catch |
| Mark light | `#5A67F5` (working) | the aperture / brand |
| Active warm | `#F7B955` | progress, ignite, live |
| Cold calm | `#4C6FFF` cooled | offline, denied, waiting |
| Text (luminous) | `#E8EAF0` | display type |
| Text (quiet) | `#82889A` | overlines, context |

Signature curve: `cubic-bezier(.19, 1, .22, 1)`. Mark spring: tension 170, friction 22. Brand values are working, pending OQ-SA-006.

---

## 8. Non-negotiables

1. No spinners. Ever. The tide-line and the shimmer are the only loading languages.
2. No page transitions. Surfaces morph; light moves; nothing navigates.
3. The door opens at the start and again at the end. It is the story.
4. Luminance is decoration, never information.
5. At most two layers animate at once.
6. The panel is elastic. It grows; it never clips.
7. Every error is calm, present-tense, and offers the way forward.
8. The OS breathes. Any screen that is static for longer than 30s is a bug.
