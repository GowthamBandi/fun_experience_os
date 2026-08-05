# 01 — Domain Entity Draft

> **Status:** Planning draft.
> **Document type:** Data modeling notes.
> **This document is a planning draft.** Entities below are a working draft for discussion. No schema, migration or database code exists.

---

## 1. Purpose

Draft the core domain entities the platform will need so that data ownership, anonymity boundaries and analytics can be discussed before any backend work. This is a domain-level draft, not a database schema.

## 2. Entity map (high level)

```
City ── ServiceArea
City ── Venue ── VenueSlot (usable hour/court)
ActivityCategory ── Experience (template)
Experience ── EventRoom (scheduled session)
EventRoom ── Slot (participant position)
Participant ── Booking ── EventRoom
Booking ── TempEventID
Booking ── Payment / Refund
EventRoom ── TeamAllocation ── Booking
EventRoom ── CheckIn
Tournament ── Bracket ── Match ── Score
Participant ── Incident / Report / Ban
AdminUser ── Role ── Permission
AuditLog
```

## 3. Core entities (draft)

| Entity | Key attributes (draft) | Notes |
| --- | --- | --- |
| City | name, launch state, service area config | |
| ServiceArea | radius / boundaries, geocoding source | geocoder provider open |
| Venue | name, city, address, coordinates, venue slots, cost per slot | cost feeds margin |
| ActivityCategory | name, rules, default formats, age defaults | e.g., badminton, cricket, box cricket |
| Experience | category, title, description, format options, default price/capacity/booking window | template |
| EventRoom | experience, venue, start/end, capacity, price, booking window, status, min-fill | schedulable unit |
| Slot | event room, status (available/reserved/sold) | capacity model |
| Participant | profile fields, verification status, ban status | anonymity-aware |
| Booking | participant, event room, slot, payment status, promo code, temp event ID | |
| TempEventID | booking, token, issued/expires | per-event-room |
| TeamAllocation | event room, team, bookings, allocation time | random by default |
| CheckIn | booking, time, status | no-show recorded |
| Payment | booking, amount, status, provider ref | provider open |
| Refund | payment, amount, reason, approver | threshold approvals |
| PromoCode | code, type, value, limits, scope | |
| Tournament | experience/event room link, format, bracket type | |
| Match | tournament, participants/pairing, score, status | |
| Score | match, values per activity rules | |
| Incident | event room, severity, description, people, resolution | safety |
| Report | reporter, reported, reason, evidence, outcome | moderation |
| Ban | participant, level, reason, duration, appeal | |
| AdminUser | email, name, role, city scope | |
| Role / Permission | role, module, level (R/W/X) | RBAC draft |
| AuditLog | actor, action, entity, before/after, timestamp | immutable |
| Notification | recipient, type, channel, status, sent-at | history |

## 4. Anonymity boundaries in the data model

| Rule (draft) | Data implication |
| --- | --- |
| Customer app shows joined count only | Counts derived server-side; roster not exposed to app |
| Temp random IDs | Generated per booking, short-lived |
| Identifiable participant data | Admin-only, role-limited read |
| Teams reference anonymous handles | Team views use temp IDs, not profiles |
| Verification data | Separate, access-controlled subset |

These boundaries will be enforced in the backend layer, not the UI. See `docs/security/01-security-and-privacy-principles.md`.

## 5. Status enumerations (draft)

| Entity | Status values (draft) |
| --- | --- |
| EventRoom | draft, scheduled, live, closing, active, completed, archived, cancelled |
| Booking | confirmed, refunded, partially_refunded, cancelled, no_show |
| Payment | pending, captured, failed, refunded, partially_refunded, disputed |
| Match | scheduled, live, completed, cancelled, walkover |
| Incident | open, in_review, resolved |
| Ban | warning, suspended, permanent |
| City | planned, live, paused, archived |

## 6. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | Experience templates are distinct from scheduled event rooms. |
| C2 | Capacity is modeled as slots on an event room. |
| C3 | Anonymity boundaries are enforced in the data/backend layer. |
| C4 | Temp event IDs are per booking and event-room scoped. |
| C5 | Audit log is a first-class entity. |
| C6 | This is a domain draft; no schema exists. |

## 7. Assumptions

| # | Assumption |
| --- | --- |
| A1 | A booking maps to exactly one slot in one event room. |
| A2 | Team allocation is at the event-room level (not global). |
| A3 | Payments are per booking (one payment per slot), no cart. |
| A4 | Refunds attach to the original payment record. |
| A5 | Venue cost is per slot/rental record, entered by ops. |

## 8. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | Can one participant book multiple slots (e.g., for friends) in v1? | Booking model |
| Q2 | Are tournament bookings per individual or per team/pair? | Booking, tournament entities |
| Q3 | Is TeamAllocation a persisted entity or derived at runtime? | Data model |
| Q4 | How are "sold slot counts" aggregated for the app without leaking roster data? | Query design |
| Q5 | Are ratings/feedback an entity in v1? | Feedback model |
| Q6 | Where is the boundary between Firestore documents and sub-collections? | Schema design |

## 9. Dependencies

- **Tech decisions:** `docs/architecture/02-technology-decisions.md` (data store open).
- **Analytics:** metrics in `docs/admin/10-admin-analytics-and-reports.md` must be derivable from these entities.
- **Security:** `docs/security/01-security-and-privacy-principles.md`.

## 10. Related documents

- `docs/architecture/01-system-context.md`
- `docs/admin/04-admin-screen-inventory.md`
