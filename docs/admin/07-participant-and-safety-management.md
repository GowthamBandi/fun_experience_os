# 07 — Participant and Safety Management

> **Status:** Planning draft.
> **Document type:** People / safety operating model.
> **This document is a planning draft.** No moderation or safety features are implemented.

---

## 1. Purpose

Define how participants are managed (anonymity, temporary random IDs, verification) and how the platform keeps participants safe (incidents, reports, bans). This is the people-facing side of operations and is tightly coupled to privacy principles in `docs/security/01-security-and-privacy-principles.md`.

## 2. Participant model

| Concept | Meaning |
| --- | --- |
| Participant | A customer who has joined at least one session |
| Profile | Account-level identity the participant controls |
| Temporary random event ID | Random ID issued per booking, used for check-in and anonymity at the session |
| Verification | Optional/conditional identity verification (see §5) |
| Joined count | Number shown to others in the app; never the roster |

### Anonymity rules (draft)

| Rule | Detail |
| --- | --- |
| Public identity | Participants never see each other's full identity by default |
| Joined count | The customer app shows count of joined participants per session |
| Temp random IDs | Issued per booking; valid for that event room only |
| Roster visibility | The admin internally can see the roster; customers cannot |
| Team allocation | Teams are shown to participants shortly before the event; teams reference temp IDs / anonymous handles, not personal identity |

## 3. Temporary random event IDs

| Aspect | Draft behavior |
| --- | --- |
| Format | Random, unguessable, short-lived token (exact format open) |
| Issue time | At booking confirmation |
| Usage | Check-in validation at the venue |
| Expiry | After session completion (or a defined grace period) |
| Regeneration | If compromised, coordinator/support can issue a new one (audited) |

## 4. Check-in

1. Participant arrives at the venue and presents the temp ID (app screen).
2. Coordinator validates against the event room.
3. Check-in recorded; no-shows flagged.
4. Team allocation revealed per event room rules.

See `docs/admin/05-event-management-workflow.md` for session lifecycle placement.

## 5. Verification

Verification decides when the platform needs real identity (for safety, age restrictions, or women-only policy where legally required).

| Category | Draft stance |
| --- | --- |
| Basic (booking) | Anonymous; no ID needed |
| Age-gated | Verify minimum age per activity (default 18+, exact values open) |
| Women-only / men-only | Possibly verify declared gender (open — legal review required) |
| Adventure / high-risk | Identity + emergency contact likely required |
| Banned-user checks | Check ban status before allowing booking |

> **Note:** gender verification for men/women-only sessions is legally sensitive and needs explicit legal review before any decision.

## 6. Safety incidents

| Aspect | Draft behavior |
| --- | --- |
| Recorded by | Coordinator, referee, Safety and Moderation Officer |
| Content | Time, session, severity, people involved, description, follow-up |
| Severity | Low / Medium / High (definitions open) |
| Resolution | Actions taken, follow-up tasks, escalation path |
| Reporting | Counts and trends in analytics |

## 7. Reports and bans

| Aspect | Draft behavior |
| --- | --- |
| Reports | Participant → platform reports of misconduct (harassment, unsafe play, fraud) |
| Moderation | Safety Officer reviews; evidence attached; outcome recorded |
| Bans | Temporary or permanent; reason and duration recorded |
| Appeal | Banned user can appeal via support (draft — open) |
| Enforcement | Ban status checked at booking time and check-in |

### Draft ban severity ladder

| Level | Example | Draft action |
| --- | --- | --- |
| Warning | Minor conduct issue | Recorded, no booking block |
| Suspension | Repeated minor issues | Temporary booking block |
| Permanent ban | Harassment, violence, fraud | Permanent block; appeal available |

## 8. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | Participants are anonymous by default; customers see joined counts only. |
| C2 | Temporary random event IDs are issued per booking and expire after the session. |
| C3 | Check-in uses the temp ID at the venue. |
| C4 | Incidents, reports and bans are v1 features. |
| C5 | Verification is conditional per activity/format, not global. |
| C6 | No moderation/safety implementation exists in this repository. |

## 9. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | Temp random IDs are sufficient for venue check-in without IDs/QR scanning hardware. | May need QR or NFC later |
| A2 | Bans can be enforced pre-booking with the participant's account data. | Anonymous users can re-register; device/IP checks may be needed |
| A3 | Coordinators will be trained to record incidents consistently. | Data quality risk |
| A4 | Participants can report issues without revealing their identity to the reported person. | Anonymity of reports |

## 10. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | Do temp random IDs need QR codes for fast check-in? | Check-in UX |
| Q2 | Is gender verification legally permitted/required for single-gender sessions? | Verification scope |
| Q3 | What is the appeal process and who adjudicates? | Moderation workflow |
| Q4 | Should participants be able to see who is on their team before the session, or only at check-in? | Anonymity policy |
| Q5 | What data is retained about banned users and for how long? | Privacy |
| Q6 | Can a participant with an active ban still book a different city? | Ban enforcement |

## 11. Dependencies

- **Privacy:** `docs/security/01-security-and-privacy-principles.md`.
- **Roles:** Safety and Moderation Officer in `docs/admin/02-admin-users-and-roles.md`.
- **Screens:** `docs/admin/04-admin-screen-inventory.md` (Participants, Verification, Incidents, Reports & Bans).
- **Legal:** gender-segregation and verification need legal review.

## 12. Related documents

- `docs/admin/05-event-management-workflow.md`
- `docs/operations/01-event-operations-lifecycle.md`
