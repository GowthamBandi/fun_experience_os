# Organizer-set cancellation rules — contract

Owner's request (24 Nov 2026): "Whether cancellation is available or not, and
if yes the limits — like within 24 hours you can't cancel, or if you cancel
only 50% comes back — should be decided by the organizer."

Today an experience has one of three fixed presets (`cancellationPolicy`:
`flexible` | `moderate` | `strict`, see `catalog/experiences.ts`,
`commerce/refunds.ts`, app `CancellationPolicy` in
`lib/src/data/models/experience.dart`). This replaces that with rules the
organizer sets, keeping the presets as one-tap starting points.

## Shape (`cancellation`, on experiences, copied to events, frozen on bookings)

```
cancellation: {
  allowed: boolean,          // false = "No cancellations": the customer can't cancel at all
  cutoffHours: int,          // 0..720 — customers can cancel until this many hours before the start
                             // (0 = until the start). Inside the cut-off: no cancelling.
  tiers: [ { hoursBefore: int 0..720, refundPercent: int 0..100 } ],
                             // 1..4 tiers, hoursBefore strictly DESCENDING, refundPercent
                             // non-increasing (never more back closer to the start).
                             // Refund = the first tier whose hoursBefore <= hours left;
                             // none matches → 0%.
  preset: "flexible" | "moderate" | "strict" | "none" | "custom"   // what the organizer picked (display only)
}
```

Presets (what the three old values meant, so existing listings keep behaving exactly the same):
- flexible: allowed, cutoffHours 0, tiers [{24,100},{0,50}]
- moderate: allowed, cutoffHours 0, tiers [{72,100},{24,50}]
- strict:   allowed, cutoffHours 0, tiers [{168,100}]
- none:     allowed false, tiers []

Old data: a string `cancellationPolicy` without `cancellation` is read as the
matching preset everywhere (server and app). New writes store both
`cancellation` and, for compatibility, `cancellationPolicy` = the preset name
(or "custom").

## Rules that don't change
- If the ORGANIZER (or PULSE) cancels the event/date, customers always get a full refund.
- Free bookings: no money, but `allowed` and `cutoffHours` still decide whether they can cancel (freeing the spot).
- The policy a customer agreed to is frozen on their booking at reservation (`booking.cancellation`); later edits by the organizer apply to new bookings only.
- Trips keep their own refund tiers (day-based) — out of scope here unless trivial.

## Server
- Validate on submitExperience / experience live edit / submitEvent (and the
  wizard's draft paths): the shape and rules above, with a plain message on
  each problem ("Refund tiers must go from earliest to latest").
- Snapshot onto events and onto bookings at reservation.
- Refund quote + cancelBooking: use the booking's frozen policy:
  - `allowed=false` → refuse customer cancellation ("This booking can't be cancelled — the organizer doesn't allow cancellations."), code PRECONDITION, `facts.reason = "not-allowed"`.
  - inside the cut-off → refuse ("Cancelling closed N hours before the start."), `facts.reason = "cutoff"`, `facts.cutoffHours`.
  - else refund % from the tiers.
- Console: show the rules in plain words on experience/event review and in
  Event 360, and flag "No cancellations" and cut-offs over 48 h for the reviewer.
- Public event page (`web/eventPage.ts`) shows the plain-words summary.

### Server as built (24 Nov) — exact behaviour the app can rely on
Code: `firebase/functions/src/commerce/cancellation.ts` (pure rules, reading, plain words, flags).
- **Boundaries.** Refund tier applies when hours left `>= hoursBefore`. Cut-off refuses when hours
  left `< cutoffHours` — exactly at the cut-off, cancelling is still open.
- **Input normalisation** (no refusal): `allowed=false` → `cutoffHours` 0 and `tiers` [] are stored
  whatever was sent; missing `cutoffHours` = 0; unknown keys dropped; when both `cancellation` and
  `cancellationPolicy` are sent, `cancellation` wins. `preset` is display-only: a named preset whose
  rules differ from that preset is stored as `"custom"`; a missing `preset` is worked out from the
  rules (`"custom"` if none matches). `cancellationPolicy` is always stored = the stored `preset`.
- **Validation messages** (`INVALID_INPUT`, `facts.field = "cancellation"`, plus `facts.tier` = 1-based
  tier number for tier problems): "Set the cancellation rules." · "Choose whether customers can
  cancel." · "That cancellation preset isn't supported." · "The cancellation cut-off must be a whole
  number of hours from 0 to 720." · "Refund tiers must be a list." · "Add at least one refund tier." ·
  "Use at most 4 refund tiers." · "Refund tier N is incomplete." · "Refund tier N: the hours before the
  start must be a whole number from 0 to 720." · "Refund tier N: the refund must be a whole percent
  from 0 to 100." · "Two refund tiers can't start at the same time before the event." · "Refund tiers
  must go from earliest to latest." · "A later refund tier can't give back more than an earlier one."
  Old one-word input: `"custom"` alone → "Set the custom cancellation rules."; anything else unknown →
  "Cancellation policy is not supported."
- **Refusals** (quoteCancellation AND cancelBooking, `PRECONDITION`, nextStep "If something has gone
  wrong, contact PULSE support."): not allowed → the message above, `facts: { reason: "not-allowed" }`;
  cut-off → "Cancelling closed {N} before the start." with N as in plain words below (24 → "24 hours",
  168 → "7 days"), `facts: { reason: "cutoff", cutoffHours }`. An unpaid hold (`status: "held"`) is
  always released, whatever the rules. Free bookings: same refusals; allowed → quote
  `{ percent: 0, amountMinor: 0, reason: "free-booking" }`.
- **Quote reasons** unchanged in shape: `policy:<preset>` / `outside-policy:<preset>`. A booking from
  before rules were frozen (no `booking.cancellation`) reads the event's rules and keeps the old reason
  string (`policy:flexible`, …) — quotes for old data are byte-for-byte what they were.
- **Events.** `saveEvent` copies the experience's rules (`cancellation` + `cancellationPolicy`);
  `submitEvent` re-checks and copies them again (the experience may have changed since the draft).
  The event page shows the event's rules, else the experience's, else strict.
- **Extension (not in the original contract): approved revisions reach upcoming events.** When PULSE
  approves an experience revision whose rules differ, its events in draft / changes-requested /
  submitted / approved / published that haven't started take the new rules (so new bookings follow
  the organizer's edit, and the app's event-first display shows it). Before an event moves, its live
  bookings without frozen rules (made before this release) are given the event's current rules, so no
  existing booking's quote changes. Audit action `catalog.event-cancellation-synced`.
  (`catalog/cancellationSync.ts`, run by `onExperienceRevisionApproved`.)
- **Review cases** (`experience-approval`, `event-approval`) carry `cancellationSummary` (plain words)
  and `cancellationFlags` (`"no-cancellations"`, `"long-cutoff"` when `cutoffHours > 48`).
- **Plain words** (server, console and public page say the same; the app may match): one sentence
  per window, earliest first — "Full refund if you cancel 48+ hours before." · "{P}% back from 48 to
  24 hours." · "{P}% back in the last 24 hours." (window down to the start) · "No refund …" for 0% ·
  "No cancelling in the last 24 hours." (cut-off). Tiers inside the cut-off are clipped to it; equal
  neighbours merge. Hours of 72+ that are whole days read as days ("3 days", "7 days"; "3+ days"),
  the rest as hours. Not allowed: "No cancellations. Once booked, a spot can't be cancelled." Every
  window 0%: "You can cancel any time before the start, but there's no refund." (or "until 6 hours
  before the start"). Presets read: flexible "Full refund if you cancel 24+ hours before. 50% back in
  the last 24 hours." · moderate "Full refund if you cancel 3+ days before. 50% back from 3 days to 24
  hours. No refund in the last 24 hours." · strict "Full refund if you cancel 7+ days before. No
  refund in the last 7 days."

## App
- Wizard (Cancellation step) and live edit: presets as cards (Flexible,
  Moderate, Strict, No cancellations) + "Custom": a switch "Customers can
  cancel", a cut-off picker (Until the start / 2 h / 6 h / 12 h / 24 h / 48 h /
  72 h / 7 days before), and refund tiers editor (up to 4 rows: "If they
  cancel at least [X] before → [Y]% back"), live plain-words preview of what
  customers will read, inline validation matching the server.
- Everywhere the policy is shown (detail page, booking rules/review steps,
  pass, cancel sheet, Plans): one shared plain-words formatter, e.g.
  "Full refund if you cancel 48+ hours before. 50% back from 48 to 24 hours.
  No cancelling in the last 24 hours."
- Cancel sheet / Plans: if not allowed → no "Cancel booking" action, a calm
  line "The organizer doesn't allow cancellations for this experience." +
  Support; inside the cut-off → "Cancelling closed 24 hours before the start."
  + Support; otherwise the server's quote as today.
