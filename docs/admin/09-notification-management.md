# 09 — Notification Management

> **Status:** Planning draft.
> **Document type:** Feature planning (notifications).
> **This document is a planning draft.** Notification features are planned but not implemented.

---

## 1. Purpose

Define the notification types the platform will send to participants and staff, their triggers, channels, and the operational controls needed in the Super Admin (compose, schedule, history, opt-outs).

## 2. Notification principles

1. **Event-critical beats marketing.** Booking confirmations, reminders and session changes take priority over promotional messages.
2. **Channel by urgency.** Push + in-app for session-critical; email for receipts and policy; SMS reserved for last-minute critical (draft).
3. **Anonymous-safe.** Notifications to participants must never reveal other participants' identities or the roster.
4. **Audited.** Notifications that change operations (cancellations, reschedules) are recorded.
5. **Opt-out respected.** Promotional notifications are optional; transactional ones are required (subject to platform policy).

## 3. Notification catalog (draft)

| Notification | Recipient | Trigger | Channel | Type |
| --- | --- | --- | --- | --- |
| Booking confirmation | Participant | Successful payment | Push / in-app / email | Transactional |
| Temporary event ID issued | Participant | At booking | In-app / push | Transactional |
| Session reminder | Participant | Before session (T-24h / T-3h draft) | Push / in-app | Transactional |
| Team allocation ready | Participant | Allocation completed | Push / in-app | Transactional |
| Session reschedule | Participant | Operator change | Push / in-app / SMS | Transactional |
| Session cancelled | Participant | Company cancellation | Push / email / SMS | Transactional |
| Refund processed | Participant | Refund issued | Email / in-app | Transactional |
| Promotional offer | Participant | Marketing trigger | Push / email | Promotional |
| Low-fill alert | Staff | Session fill below threshold | In-app / email | Operational |
| Incident created | Staff | Incident logged | In-app | Operational |
| Verification needed | Staff | Verification task created | In-app | Operational |

## 4. Admin controls

| Capability | Draft behavior |
| --- | --- |
| Compose | Marketing Manager creates promotional notifications with targeting (city, activity, new users) |
| Schedule | Schedule send time; immediate for operational messages |
| Templates | Reusable templates for transactional notifications |
| History | Delivery history with status (sent, delivered, failed) |
| Opt-out management | Per-user promotional preference management |
| Approval | Promotional sends may require review (draft) |

## 5. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | Booking confirmations, reminders, reschedule/cancel and team-allocation notifications are in v1. |
| C2 | Notifications never expose participant rosters or identities. |
| C3 | Promotional notifications support opt-out. |
| C4 | Notification history is recorded for operational messages. |
| C5 | No notification implementation exists in this repository. |

## 6. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | Push notifications are the primary channel (Firebase Cloud Messaging or equivalent). | Provider capabilities |
| A2 | Email and SMS providers are third-party; SMS may be premium cost. | Budget, channel selection |
| A3 | Participants opt in to push at install. | Deliverability |
| A4 | Staff notifications can be in-app only. | Staff tools on phone/desktop |

## 7. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | Which exact reminder offsets (T-24h, T-3h, etc.) are best? | Reminder design |
| Q2 | Is SMS needed in v1, or push + email sufficient? | Cost, scope |
| Q3 | Can participants choose notification topics (reminders, offers) separately? | Preferences |
| Q4 | Are in-app notifications to participants needed, or push/email only? | App scope |
| Q5 | Who approves promotional sends, and does approval matter in v1? | Governance |

## 8. Dependencies

- **Channels:** channel providers depend on the backend choice in `docs/architecture/02-technology-decisions.md`.
- **Roles:** Marketing Manager ownership in `docs/admin/02-admin-users-and-roles.md`.
- **Safety/privacy:** message content must respect anonymity rules in `docs/admin/07-participant-and-safety-management.md`.

## 9. Related documents

- `docs/admin/04-admin-screen-inventory.md`
- `docs/architecture/02-technology-decisions.md`
