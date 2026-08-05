# 01 — System Context

> **Status:** Planning draft.
> **Document type:** Architecture / context diagram.
> **This document is a planning draft.** It describes the intended system landscape. No system components exist yet.

---

## 1. Purpose

Describe the overall system context for the experience booking and activity operations platform: which systems exist, who interacts with them, and the key boundaries. This is the starting point for `docs/architecture/02-technology-decisions.md`.

## 2. Systems in scope

| System | Purpose | Users |
| --- | --- | --- |
| Customer mobile app | Discover, book, pay, check in, view sessions | Participants |
| Super Admin | Operate catalog, sessions, money, safety, analytics | Company staff roles |
| Backend (Firebase initially) | Auth, data, notifications, functions for booking flows | Both systems |

## 3. External actors

| Actor | Interaction |
| --- | --- |
| Participant | Books/pays via mobile app; checks in at venue |
| Admin staff (10 draft roles) | Operates via Super Admin |
| Payment provider | Processes capture, refunds, disputes (provider TBD) |
| Venue partners | Supply venue slots (managed manually in admin in v1) |
| Notification channels | Push (FCM or equivalent), email, SMS providers |
| Company finance | Reconciles via Super Admin finance views |

## 4. Context diagram (text form)

```
        ┌─────────────────────────────┐
        │         Participant         │
        └──────────────┬──────────────┘
                       │ uses
                       ▼
              ┌─────────────────┐        ┌──────────────────┐
              │  Customer App   │◄──────►│   Backend        │
              │   (Flutter)     │  data  │  (Firebase)      │
              └─────────────────┘        └───────┬──────────┘
                                                 │ data
                       ┌─────────────────────────┤
                       ▼                         ▼
              ┌─────────────────┐        ┌──────────────────┐
              │  Super Admin    │◄──────►│  Payment provider│
              │  (Next.js)      │        └──────────────────┘
              └─────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │ Notification     │
              │ channels         │
              └─────────────────┘
```

## 5. Data flow notes

- The customer app and Super Admin both talk to the backend. The app never reads the roster; the admin does (role-limited).
- Payments go through a provider; the backend records payment/refund status. The provider is **not yet selected**.
- Notifications originate from the backend/admin and are delivered via push/email/SMS providers.

## 6. Boundaries and non-goals

- No production backend logic is written during planning.
- No third-party marketplace integration is in scope for v1.
- No public developer API in v1.
- No on-site hardware integration (turnstiles, QR scanners) in v1.

## 7. Confirmed decisions

| # | Decision |
| --- | --- |
| C1 | Customer app: Flutter (Android + iOS). |
| C2 | Super Admin: Next.js with TypeScript. |
| C3 | Initial backend: Firebase. |
| C4 | Both apps share one backend. |
| C5 | Payments are handled via an external provider (not selected). |
| C6 | No production code exists in this repository. |

## 8. Assumptions

| # | Assumption | Impact if wrong |
| --- | --- | --- |
| A1 | A single backend serves both apps at v1 scale. | Could split services later |
| A2 | Firebase supports required v1 features (auth, data, notifications). | Backend re-evaluation |
| A3 | Venue booking is manual (admin-managed), not integrated with venue systems. | If venue APIs exist later, integration added |
| A4 | Coordinators/referees use the Super Admin (or a web-optimized view), not a separate app. | Staff tooling decision |

## 9. Open questions

| # | Question | Affects |
| --- | --- | --- |
| Q1 | Does the Super Admin need a dedicated mobile surface for coordinators, or is responsive web enough? | Staff devices |
| Q2 | Where does the anonymous identity boundary live in the backend (data model + query layer)? | Backend design |
| Q3 | Which payment provider, and how are webhooks/refunds handled? | Integration scope |
| Q4 | Are notifications push-only or multi-channel in v1? | Provider needs |

## 10. Dependencies

- **Tech decisions:** `docs/architecture/02-technology-decisions.md`.
- **Entities:** `docs/database/01-domain-entity-draft.md`.
- **Security/privacy:** `docs/security/01-security-and-privacy-principles.md`.

## 11. Related documents

- `docs/product/01-product-vision.md`
- `docs/admin/01-admin-purpose.md`
