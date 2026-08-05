# EXPERIENCE OS — DESIGN DNA

> **The highest design authority in the company.**
> Every future screen inherits this document. Nothing is random. Nothing is copied.
> This is the soul of the product, written once, honored forever.
> Status: planning authority. Supersedes the auth blueprint where they conflict.

---

## PART 1 — DESIGN PHILOSOPHY

### What someone should feel

Experience OS is the operating system for the moment the digital becomes real. Somewhere, at 7pm, on a floodlit court, a group of strangers stops being phones and becomes a team. This software is the machinery that keeps that promise. It runs in the hours between the booking and the floodlights.

So the emotional spectrum is the emotional spectrum of the person **running the night**:

| State | Feeling | When |
| --- | --- | --- |
| Rest | **Calm confidence** | The OS at rest. The building is lit, everything is in its place. No hurry, no noise. |
| Motion | **Momentum** | The night approaches. Fills rise, check-ins land, missions ignite. The OS breathes faster, never louder. |
| Pressure | **Composure** | A session underfilled. An incident. The lights stay on. Emergency is handled with *more* calm, not less. |
| Resolution | **Quiet celebration** | The last check-in. The champion. The wrap. Warm, earned, rare. |

**Why this spectrum.** The staff's job is to make real moments happen, reliably, in the dark hours. An OS that hurries them, alarms them, or entertains them is failing. We design the emotional state of someone who has run a hundred nights: **in control, unhurried, and occasionally proud.** The worst thing this product can do is make its user feel behind, alarmed, or rewarded for nothing.

**The exclusions.** Identity is defined as much by what we refuse to make people feel as by what we give them. Experience OS deliberately never makes the user feel:

| Refused feeling | Why it is refused |
| --- | --- |
| **Hurry** | The real court will not start earlier because the software pulses faster. Urgency in the tool manufactures stress the night does not need. |
| **Alarm** | Panic is the failure mode of the exhausted. A flashing red never made a session fill; a calm room did. |
| **Impatience** | The OS waits with the crew. Every "wait" is a breath, never a threat. |
| **Playfulness** | The tool is not a game. Fun is a consumer emotion; this is a building where adults run real nights. Delight is allowed in *one* place — the celebration — because it is earned. |
| **Amazement** | No fireworks, no wow-moments on demand. A tool that must be amazing every screen is a tool that cannot be trusted. The OS is remarkable once per session: at the door. |
| **Being watched** | The OS is the crew's building, not their supervisor. It notices them; it never surveils them. |

The spectrum is a contract: **the crew may feel calm, in control, and occasionally proud — never anything that makes the night harder to run.**

The one-line position:

> **The night runs on Experience OS.**
> We design the building, not the desk.

---

## PART 2 — VISUAL DNA

### Light philosophy
Light is the only material. Surfaces are **lit, not outlined**. Every scene has one radial light source — the dusk: warm amber rising from below, deep indigo above, a point of cooler light where the mark lives. Luminance is hierarchy: the brightest thing on screen is the most important thing. If two things compete for light, one of them is wrong. There is no flat lighting and no pure black — the building is never off.

### Dark philosophy
Darkness is **native, not a mode**. The OS works at night — evenings and weekends are peak operations. It never flips to "light mode." The base is a warm black (`#0C0E12`), never dead black; dark surfaces carry a faint lift at their lower edge, as if light falls across a floor. Darkness is atmosphere, not a theme toggle.

### Glass philosophy
Glass is how we show what's behind. Frost (blur 24–32, saturation pulled ~10%, fill ~6% white) with a **1px top-edge catch-light** on every glass edge — the whole OS is lit from the same dusk, so every glass plane catches the same light. Glass is for **planes**: panels, the nav, floating sheets. Never for content containers under dense data — under tables, surfaces are solid, because readability is a surface.

### Surface philosophy
Exactly **three planes**, never more:

| Plane | Material | Role |
| --- | --- | --- |
| Field | Light | The atmosphere. Dusk, drifting. |
| Glass | Frost | The buildings — nav, panels, sheets. |
| Control | Lit | The tool — fields, chips, the action. |

Separation comes from **light, frost, and shadow — never borders**. The control plane is where light concentrates. More light = more focus. More blur = more depth.

### Depth
Depth is expressed as **frost, never scale**. Things that are far are blurred, not small. Exactly three planes means exactly three blur grades in any scene. Focus is light; depth is blur; weight is shadow. These three never swap jobs.

### Contrast
Contrast is carried by **luminance and temperature**, never by hue jumps. Text is luminous — set in the light value of its field, never pure white, never grey-on-grey. Status is a change of light, not a change of paint.

### Space
Whitespace is **lit air**. It is not emptiness; it is the room around the lit thing. Every screen has a resting point — one element fully lit, everything else receding. Compositions are built by placing light in air, not by filling canvas.

### Rhythm
The OS has a heartbeat: a 3-second breath on the mark, a 30-second drift in the field. Structural rhythm is the 4px base with 8px structural steps. Density breathes: operational surfaces may be dense, but every dense surface is framed by generous lit margins. The cadence of the product is *steady — a little faster near the night — then still.*

### Grid
A 4px base, 8px rhythm, 12 columns on desktop. The grid is order, not a prison. The cinematic moments — the door, the bloom — deliberately compose on the center axis, outside the grid, and the product forgives them because they are rare. Tools obey the grid; moments break it.

### Corner radius
**The sheet and the atoms.** One large radius for panels (24–28), many small pill radii for atoms (6–10), full-pill for the OTP slots. Nothing in between. The building has big doors and small handles; that tension is the identity.

### Blur
Four grades, never improvised: **8** frost on glass controls · **16** glass surfaces · **24** panels · **32** modal atmosphere. Blur is depth. Nothing else blurs — no text-blur except the one sanctioned moment (identity resolution).

### Noise
A film grain over every scene: ~1% opacity, tileable, 6fps jitter. It kills gradient banding and gives light physicality. The grain is the difference between a gradient and an atmosphere. It freezes under reduced motion.

### Shadows
**Warm-black, soft, deep** — they exist only under glass planes, to give them weight above the light field. They are never used to fake depth in controls. Controls are separated by light. If a shadow has a job other than "this panel weighs something," it is not a shadow, it is decoration.

### Highlights
One highlight, everywhere: the **top-edge catch-light** — a 1px brighter line on the top edge of every glass surface, catching the same dusk source. It is the signature of the glass language. No other highlights exist.

### Color behavior
The palette is **states of light, not decoration.** Warm amber = active, live, progress. Cool blue = waiting, offline, denied. Green = live-and-safe, used sparingly. Red = attention, rare, **never flashing**. The brand indigo is reserved for the mark and identity only. Max three hues on a screen. Color is a temperature; luminance is the hierarchy; text is the information. These three never blur.

### Animation philosophy
Every motion is one of three verbs: **light enters, a surface settles, a door opens.** Nothing else animates. Duration is scaled by distance. The signature curve is `cubic-bezier(.19, 1, .22, 1)` — fast start, long settle: everything *arrives*. At most two layers move at once. Every motion ends in stillness.

### Typography philosophy
Two voices, never mixed: the **editorial voice** for moments (one luminous line in a tight grotesque, set in light) and the **data voice** for the tool (a quiet neutral sans, small, tabular numbers). One overline voice — 11px, wide tracking, caps — for context. Hierarchy is scale and light, never weight. Type is set in the light of its field; the field is never pure white, the type is never pure black.

### Illustration philosophy
No illustration. Where a "picture" is needed, the OS draws with **light alone** — the aperture, the door, dust motes. The OS does not illustrate people; people are what it serves. The moment a screen needs an illustration, the screen is missing its light.

### Photography philosophy
The only photography in the OS is the **real** — venues, courts, nights. Photos are treated as light sources: graded to dusk, dimmed, they sit in the field as atmosphere, never as content boxes. The camera grade is the brand grade: dark, warm, a little grain. If a photo cannot take the dusk grade, it does not belong on a screen.

### Icon philosophy
Icons are **cut glass**: 1.5px stroke, rounded caps, and each glyph carries the same 1px top-edge catch-light as every glass surface — icons are tiny pieces of the building. One family, one weight, no mixed styles. Filled only for live status (a lit chip, a lit bar). An icon that does not catch the light is from another company.

---

## PART 3 — MOTION DNA

The complete grammar of appearing, moving, and stilling.

| Moment | Motion | Duration / curve | Notes |
| --- | --- | --- | --- |
| **Things appear** | Fade + rise 8–12px | 240ms · light | Entrances arrive from their own light. Nothing scales in from nothing except the door. |
| **Things disappear** | Fade + blur ramp, accelerate | 200ms · accelerate-out | Departures are short and soft; never slide far, never fall. |
| **Cards move** | One layer, carried by light | 320ms · light | Cards settle where they belong; reordering is a lightweight drift, never a physics demo. |
| **Dialogs appear** | The room dims (light recedes), the panel settles in 0.98→1.0 | 280ms · light | The backdrop is a *dimming of light*, never a black scrim. The building turns its attention to you. |
| **Sheets slide** | Rise from below to meet the light source, carrying their own top-edge catch-light | 320ms · light | Sheets arrive like a door opening upward. |
| **Loading** | The tide-line (segments advancing), the shimmer (traveling light), or the breath | segment 320ms | **No spinner exists in this product.** |
| **Errors appear** | Light recedes; a quiet present-tense line; the room cools one stop | 300ms · decelerate | Errors arrive like a dimming, never like a slap. |
| **Success behaves** | A warm tick + a contained bloom | tick 120ms · bloom 400ms | Confirmation is light. Not confetti, not fireworks. |
| **Attention is requested** | A single brightening of the relevant element + one haptic | 240ms | Attention is a touch on the shoulder. Never a pulsing anything. |
| **Celebration** | The door opens wide; the frame floods warm | 650ms · light→decelerate | Reserved for earned moments. If it happens weekly, it is noise. |
| **Transitions** | Light morphs, surfaces arrive; the scene never cuts | — | There are no page transitions. There is one continuous scene. |
| **Scrolling** | Momentum with a light ease; content reveals as it enters the light | — | Scrollbars are thin luminous tracks, not chrome. |
| **Pages enter** | Settle down + the light blooms; never slide horizontally | 480ms · light | No carousel page-shuffling. Ever. |
| **Pages leave** | Fade + accelerate upward | 420ms · accelerate-out | Departure points up, toward the exit, never sideways. |

**Master rule:** one primary layer per moment. When light blooms, type is still. When a panel arrives, nothing behind it moves.

**The cooldown law.** Some motions may never happen together. If two signature moments would collide — a Bell while the Door is opening, a Strike during a Celebration — the heavier moment wins and the lighter one waits 600ms. Two audiences at once is chaos; the OS has one attention, and it spends it deliberately.

**The speed contract.** Motion DNA is incomplete without performance. Every motion above carries a budget: total motion overhead must never push a task past 100ms of perceived latency. The breath costs nothing (a CSS opacity sine). The tide-line never blocks a tap. If a luminous moment ever makes the tool feel slower, the moment is cut, not the tool. **The poetry is only allowed because it is free.**

**The law of the camera.** The scene never cuts and the camera never moves unless the light moves it. The user is never dragged — the building reorients itself around them, and the building moves only when light moves. If a transition would require a camera pan, it is the wrong transition.

---

## PART 4 — THE TEN ICONIC INTERACTIONS

These are the moments the product is remembered by. They are the OS's Face ID, its Dynamic Island, its Glyph — a small set, honored, never diluted.

### 1. The Door — Brand reveal
**Purpose.** Declare the OS. **Emotion.** Anticipation turning to arrival. **Motion.** A vertical slit of light breathes once, then widens into a full ring; the wordmark writes itself in its glow. **Timing.** Breath 400ms → open 700ms · mark spring (tension 170, friction 22). **Micro.** Nothing is touchable; this is the audience moment, and the silence is the point. **Why remembered.** A door opens and the product's name is written in that light — before the user was shown anything, they were let into a room.

### 2. The Unlock — Authentication
**Purpose.** Let the crew in. **Emotion.** Recognition. **Motion.** The illuminate-bar is a lamp that stays dark until valid; on success the whole surface lifts and the light brightens. The identity line sharpens from blur, and capability bars ignite left→right like beams. **Timing.** Field 320ms · bars 90ms each · bloom 420ms. **Micro.** One tick per OTP digit; the bar blooms only when it may be used. **Why remembered.** The OS recognizes you *as light* — you are not validated, you are welcomed.

### 3. The Bell — Someone joins
**Purpose.** Announce that a slot became a person. **Emotion.** Quiet momentum. **Motion.** A chip of light strikes on the session card — the slot visibly fills, the fill meter nudges — and a soft chime-shaped light pulses once in the corner. **Timing.** 240ms strike · 400ms settle. **Micro.** One warm haptic tick; never an interruption. **Why remembered.** It is the product's heartbeat: every booking is a real person walking toward the door.

### 4. The Countdown — The night approaches
**Purpose.** Build toward ignition without anxiety. **Emotion.** Focused anticipation. **Motion.** As a session nears, the tide-line becomes a quiet cadence — the fill meter pulses gently, one beat per minute, like a clock made of light. **Timing.** 3s breath → 1s pulse near ignition. **Micro.** No alarm; the pulse is visible only to those who watch it. **Why remembered.** The product *feels* the night approaching and breathes with it — no deadline shouted, just the hour drawing close.

### 5. The Strike — Check-in at the door
**Purpose.** Convert the digital booking into a real person at the venue. **Emotion.** Satisfaction — the promise kept. **Motion.** The operator scans; a vertical light **strikes** through the list, the participant's row ignites (draft → checked-in), and a contained bloom lands on the session's fill. **Timing.** Strike 200ms · bloom 400ms · one tick haptic. **Micro.** The row's status is a temperature change, not a color swap. **Why remembered.** This is the product's thesis in one gesture: the abstraction becomes a person in the doorway, lit.

### 6. The Formation — Teams reveal
**Purpose.** Show the random allocation happening. **Emotion.** The excitement of the draw. **Motion.** Participant rows gather and **form** into team clusters — each cluster takes on a distinct light, the teams visibly "assemble" from the pool, then settle with a soft spring. **Timing.** 240ms per wave · 120ms between teams · settle 400ms. **Micro.** One soft tick per team formed. **Why remembered.** Strangers becoming teams is the reason the platform exists, and the OS renders it as a visible, physical assembly.

### 7. The Nod — Completion
**Purpose.** Acknowledge finished work without ceremony. **Emotion.** Quiet satisfaction. **Motion.** On completion, the item's light resolves to the "done" temperature with a single 1px settle — a nod, not a fanfare. A thin check strikes once through the row. **Timing.** 200ms. **Micro.** One short, low haptic. **Why remembered.** It respects the work: a hundred small nods a night, never a parade.

### 8. The Victory — Tournament champion
**Purpose.** Mark an earned apex. **Emotion.** Warm, justified celebration. **Motion.** The bracket collapses to a single point, the door opens wide, and light floods the champion's name — held, then recedes. **Timing.** Collapse 600ms · bloom 900ms · hold 1.2s. **Micro.** A rising haptic pulse — the only two-tone haptic in the product. **Why remembered.** It is rare, and it is the one moment the product is allowed to be loud, because the people on the court earned it.

### 9. The Calm — Emergency mode
**Purpose.** Keep the building calm when the night turns. **Emotion.** Composure under pressure. **Motion.** The scene does not go red. The light **cools** one degree, ambient motion slows to near-still, an incident beam holds steady on the affected session, and the crew's attention path is drawn in quiet light. **Timing.** Cooling 600ms · no flashing anywhere. **Micro.** One firm, steady haptic. **Why remembered.** The product is most itself in the crisis: quieter, not louder. That inversion is the identity.

### 10. The Exhale — The night's close
**Purpose.** End the shift with the dignity it deserves. **Emotion.** Relief, belonging. **Motion.** The last check-in lands; the day's sessions dim one by one toward the field; the mark breathes once, wider than usual, and the wrap view settles into the room. **Timing.** Dimming 800ms each · breath 1.2s. **Micro.** A single low, warm pulse. **Why remembered.** The software says goodnight. Few products ever do.

---

## PART 5 — THE TWENTY PRINCIPLES (non-negotiable)

1. **The door is the logo.** The aperture-opening is the single signature motion. Nothing else gets to be iconic.
2. **No spinners. Ever.** Progress is the tide-line, the shimmer, or the breath.
3. **Never shake the screen.** An error is a receding of light, not a rattling of boxes. *(Supersedes the auth blueprint's shake.)*
4. **Light is hierarchy.** The brightest thing is the most important thing. Two things competing for light = one is wrong.
5. **Never outline.** Separation is light, frost, and shadow. Borders are a confession of failure.
6. **At most two layers move at once.**
7. **Every motion ends in stillness.**
8. **Color is temperature, not decoration.** Max three hues. Status is a change of light, never a hue rainbow.
9. **Luminance is decoration, never information.** Every status carries text.
10. **The OS breathes.** A screen static for longer than 30s is a bug.
11. **Dark is native, not a mode.** There is no light mode.
12. **Glass is for planes, never for dense content.** Under tables, surfaces are solid.
13. **The only countdown is the night's.** The OS promises one countdown — the session approaching. Everything else is the tide advancing, never a timer against the user.
14. **Celebrate rarely.** If it happens weekly, it is noise, not a victory.
15. **Attention is a touch, not a shout.** One brightening, one haptic. No flashing, no pulsing red.
16. **Errors are calm.** The building's lights stay on. An error is one present-tense sentence and a way forward.
17. **Every interaction rewards.** No dead taps. Every tap leaves the surface more lit or more understood.
18. **Preserve orientation.** The crew always knows where they are in the building; orientation is a light trail, not a text stack. A screen that cannot answer "where am I?" in one glance is unfinished.
19. **Type is set in light.** Luminous, editorial, never pure-white-placard, never pure-black-on-grey.
20. **Nothing feels copied.** If a pattern smells like a generic SaaS — a toast in the corner, a blue button, a spinning wheel — it is redesigned or deleted. Identity over beauty.

---

## PART 6 — MICRO INTERACTION LIBRARY

The atoms, each one following the DNA. Emotion first; mechanics second.

| Interaction | Emotion | Behaviour |
| --- | --- | --- |
| **Hover** | The OS notices you | The element gains a top-edge catch-light and +1px luminance. No lift, no scale — light arrives, not the surface. |
| **Tap** | Decisive | 0.98 scale for 120ms; on release, the surface settles back with the light curve. A tap is a small door. |
| **Long press** | Weight, intent | A slow gather of light into the element over 450ms; release triggers a heavier action with a firm haptic. |
| **Selection** | Commitment | The selected item's light resolves warm; others cool one step. Selection is a temperature, not a checkmark (checkmarks only on completion). |
| **Toggle** | Simple truth | The knob slides 24px with the light curve; the rail ignites warm as it travels. One motion, one statement. |
| **Loading** | Patience | Tide-line segments, a traveling shimmer, or the breath. Never a spinner, never text ("Loading…" is banned). |
| **Success** | Warm confirmation | A tick + a contained bloom + one haptic. Understated; the OS is polite about good news. |
| **Failure** | Composure | The element cools one step; a quiet present-tense line appears; the room dims one stop. No shake, no red flash. |
| **Notification** | A gentle nudge | A chip of light appears at the room's edge, reads the room's temperature (never urgent red), and recedes on its own. |
| **Badge** | A count made visible | A small lit chip; it ignites on change with a 1px pulse, then holds steady. Badges breathe with the OS, they never bounce. |
| **Card expansion** | A door in miniature | The card's top-edge light ignites; it grows downward (elastic, never clipping) with the light curve; the field behind blurs +8. |
| **Search** | The room narrowing | As you type, the field's light tightens; results settle into place from a 6px rise; clearing restores the full field. |
| **Pull to refresh** | The breath made manual | The pull stretches the light curve; release re-settles the tide-line. No spinner — the OS re-inhales. |
| **Gesture** | Physicality | Gestures are damped, never bouncy: a swipe follows the finger with a light ease and settles decisively on release. |
| **Drag** | Weight | The dragged thing carries its light with it and grows a soft shadow — the one place weight and light combine. |
| **Swipe (dismiss)** | Decisive exit | The row cools as it leaves, accelerating out; the space closes with a 1px settle. Dismissed things exit upward. |
| **Empty state** | The room waits | One luminous line — *"No sessions tonight. The floor is quiet."* — and the mark breathing. An empty state is a lit room, not a grey void with an icon. |
| **Offline** | The building stays open | The field cools to a calm blue; one quiet line — *"The floor is offline. The night continues."* — and the essential surfaces remain lit. |

---

## PART 7 — SOUND & HAPTICS

No sound files. Emotional intent only. Sound is **diegetic and optional** — it is the building's hum, never a score. Default off; the crew opts in.

| Moment | Emotional intent | Shape |
| --- | --- | --- |
| **Arrival** | The door. Anticipation resolving | A soft tonal bloom, low and warm — like light, not a fanfare. |
| **Unlock** | Recognition | A single quiet resolve — a lock yielding, not a chime of triumph. |
| **Join** | The heartbeat | One short, round tick — a slot becoming a person. |
| **Success** | Politeness about good news | A brief, contained warm tone; over in 300ms. |
| **Error** | Calm, no blame | A low, soft settle — a dimming, not a buzz. |
| **Celebration** | Earned and rare | A slow two-tone bloom that rises then rests — the only moment sound may spread out. |
| **Countdown** | Focused patience | A faint, regular pulse — a clock made of breath, felt more than heard. |
| **Warning** | The shoulder-touch | A single firm, steady tone. No urgency, no repetition. |
| **Emergency** | Composure under pressure | One long, even, low note that holds — the building's lights staying on, audible. |

Haptics follow the same law: **one event, one touch.** Ticks for digits and joins, a firm pulse for commitment, a slow gather for long-press intent, one steady hold for emergency. If a moment needs more than one haptic, the design is wrong.

---

## PART 8 — BRAND LANGUAGE

The product is not an admin panel, a dashboard, a portal, or a backend. It is **the building that runs the night.** Vocabulary is identity; we speak as the building.

| Say | Instead of | Why |
| --- | --- | --- |
| The OS / the building | Admin / Portal / Backend | The crew enters a building, not a portal. |
| The floor | Dashboard / Home | The floor is where the work is visible. |
| Mission | Event / Session (in brand voice) | A session is data; a mission is the night's work. Canonical term stays for data. |
| The night | Operations / Shift | The OS runs the night — evening and weekend hours. |
| Territory | City / Region scope | Matches the franchise model; a territory is owned, not merely selected. |
| Arena | Venue | The place is where it happens; canonical term stays for data. |
| The crew | Users / Staff | Staff is a role; the crew is who runs the night together. |
| The door | Login / Sign in | You enter, you don't "log." |
| Check-in | Scanning / Verification | People arrive; they are checked in at the door. |
| Formation | Team allocation | Teams form. Allocation is data. |
| The countdown | Deadline / Cutoff | The night draws close; it does not threaten. |
| Making it right | Refund / Cancellation | The OS makes things right; it does not process refunds. |
| The take | Revenue / Payout | The night's take, counted at the close. |
| Wrap | End of shift / Logout | The crew wraps the night; they do not "log out." |
| The attention path | Incident workflow | The crew follows light to the moment; they do not process tickets. |

**Forbidden words** (in any user-facing surface): dashboard, portal, admin, backend, UI, login, logout, loading, error, warning, session-expired, 404, toast, modal, popup, sync, latency, "please wait," "something went wrong."

**Voice rules.** Present tense. One sentence at a time. Concrete nouns (*"Counting tonight's sessions"*, not *"Please wait while we load your workspace"*). Calm, no exclamation marks, no corporate cheer, no jokes. The building speaks like someone who has run a hundred nights: brief, certain, warm. When the OS is wrong, it says so in one line and points the way — it never blames.

**The voice checklist.** Every line of interface copy must pass all five, or it is rewritten:
1. Could a person say this out loud, on a floodlit court, at 10pm? *(No "workspace", no "please wait".)*
2. Is it one sentence? *(If it needs a second, it is an explanation, not a line.)*
3. Does it name something real? *(Courts, sessions, people, the night — never "data", "items", "content".)*
4. Is it calm? *(An exclamation mark is a design failure.)*
5. Does it match the night? *(Present tense. The OS never speaks about the future as if it were noise, and never speaks about the past as if it were blame.)*

**One language, one register.** Vocabulary is not a menu to pick from per screen — every surface, every role (from Platform Owner to Staff), every territory speaks the same language. A mission is a mission on the floor and in the arena. If a feature cannot be named in this language, the feature is misnamed, not the language.

---

## PART 9 — THE EXPERIENCE OS MANIFESTO

> **Somewhere, at 7pm, a court fills with strangers.**
>
> The booking was digital. The moment is real. Something has to carry people across that distance — from the phone to the floodlights, from "joined" to "standing on the court."
>
> That something is us. We are the building that runs the night.
>
> We believe software should be felt, not read. So we build with light, not chrome. Our surfaces are lit, never outlined; our progress is patience, never a spinner; our errors are calm, never a shout. We build in the dark because the night is when the real happens, and we keep our lights steady because panic is the failure mode of the exhausted.
>
> We believe the person behind the screen is running a night, not operating a panel. So we give them composure, not clutter. Momentum, not noise. Recognition, not logins. And rarely — very rarely — celebration, because a victory on the court is the only loud thing this building makes.
>
> We believe every booking is a person walking toward a door. Our job is to keep that door open, and to light the way through it — until the last check-in lands, the lights dim, and the night closes like a held breath.
>
> **The night runs on Experience OS.**

---

## PART 10 — FINAL REVIEW

### The test
For every decision above, one question: *Could another SaaS have this?* If yes — delete. The objective is not beauty. The objective is identity.

### Culled in review (generic — deleted)
- **Toast notifications** in a corner. → *Deleted.* Notification is a chip of light at the room's edge, reading the room's temperature. No other product does that.
- **Card hover-lift with shadow.** → *Deleted.* Hover is a catch-light, not a levitation. Shadows belong only under glass planes.
- **Confetti celebration.** → *Deleted.* Victory is the door opening and light flooding a name. Confetti is what a SaaS does.
- **The loading spinner** (all of them). → *Deleted.* Tide, shimmer, breath. Non-negotiable.
- **Red alert banners / flashing errors.** → *Deleted.* Emergency is a cooling, not a conflagration.
- **Light mode.** → *Deleted.* The building is never open in daylight.
- **Stock illustrations.** → *Deleted.* The OS draws with light or not at all.
- **A "dashboard" with widgets.** → *Deleted from vocabulary.* The floor is a lit room, not a widget grid.
- **"Something went wrong"** and every generic error sentence. → *Deleted.* One present-tense line, one way forward.
- **Carousel-style page slides.** → *Deleted.* Pages enter by settling; they leave upward. Orientation never breaks.

### Kept under challenge (identity — retained)
- **The Door.** Not a logo animation — the product's founding metaphor, repeated exactly twice per session (in and out).
- **The dusk field and the breath.** The atmosphere that makes every screen a room.
- **The top-edge catch-light.** One light source, one highlight, across every surface.
- **The tide-line.** A loading language that is also a philosophy.
- **The Calm.** Emergency as composure — the inversion that most defines the brand.
- **The Strike.** Check-in rendered as the thesis: digital becomes real, in a single gesture of light.
- **The Countdown.** Patience with a pulse; the night drawing close without a threat.
- **The exclusions.** Refusing hurry, alarm, impatience, playfulness, amazement, surveillance — a contract no competitor would think to sign.
- **The cooldown law.** One attention, spent deliberately; no two icons at once.
- **The speed contract.** The poetry is only allowed because it is free.
- **Luminance = hierarchy, temperature = status, text = information.** The three never blur; they are the operating law.

### The residual risk (honest)
The poetry of the DNA is only defensible if the tool stays fast. Every luminous moment must ship at tool-grade performance: the breath must cost nothing, the tide must never stall real work, and the composure must hold when a real session is at risk. **Identity without performance is theater.** Performance without identity is a panel. We chose both.

---

*This document is the design authority. Where it conflicts with earlier drafts — the auth blueprint, the design-system drafts — it wins. All future screens inherit from here.*
