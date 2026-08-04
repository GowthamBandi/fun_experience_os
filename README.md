# experience_platform

**Experience booking and activity operations platform** — a place to pay for and join limited-slot, real-world experiences (badminton, cricket, box cricket, tournaments, games, adventures, social activities), operated end-to-end by the company.

> **Project phase: documentation and planning.** This repository contains a Flutter scaffold plus a planning-documentation foundation. **No production application code, backend logic, Firebase rules, Cloud Functions or payment code exists yet.**

## Tech direction

| Surface | Technology |
| --- | --- |
| Customer mobile app | Flutter (Android + iOS) |
| Super Admin (operations console) | Next.js with TypeScript |
| Initial backend | Firebase |
| Production development | Later, using Claude Code |

## Key product principles

- Participants are **anonymous**; they see joined-participant counts, not rosters.
- Temporary **random event IDs** are issued per booking for check-in.
- **Teams may be randomly allocated** shortly before the event.
- Supports **men-only, women-only and mixed** formats, with age restrictions.
- The **company creates, prices, schedules and operates** activities itself.

## Documentation

All planning documents are under [`docs/`](docs/).

| Area | Documents |
| --- | --- |
| Product | [Vision](docs/product/01-product-vision.md) · [Problem & opportunity](docs/product/02-problem-and-opportunity.md) · [Business model](docs/product/03-business-model.md) · [v1 scope](docs/product/04-v1-scope.md) |
| Super Admin | [Purpose](docs/admin/01-admin-purpose.md) · [Users & roles](docs/admin/02-admin-users-and-roles.md) · [Information architecture](docs/admin/03-admin-information-architecture.md) · [Screen inventory](docs/admin/04-admin-screen-inventory.md) · [Event management workflow](docs/admin/05-event-management-workflow.md) · [Booking & payments](docs/admin/06-booking-and-payment-operations.md) · [Participants & safety](docs/admin/07-participant-and-safety-management.md) · [Tournaments](docs/admin/08-tournament-management.md) · [Notifications](docs/admin/09-notification-management.md) · [Analytics & reports](docs/admin/10-admin-analytics-and-reports.md) |
| Architecture | [System context](docs/architecture/01-system-context.md) · [Technology decisions](docs/architecture/02-technology-decisions.md) |
| Data | [Domain entity draft](docs/database/01-domain-entity-draft.md) |
| Security & privacy | [Principles](docs/security/01-security-and-privacy-principles.md) |
| Operations | [Event operations lifecycle](docs/operations/01-event-operations-lifecycle.md) |
| Experience OS | [Franchise operating model](docs/admin/15-franchise-operating-model.md) · [Authentication experience](docs/auth/01-authentication-experience.md) · [Screen specifications](docs/auth/02-screen-specifications.md) · [Experience OS design system](docs/design-system/02-experience-os-design-system.md) · [Admin design direction](docs/design-system/01-admin-design-direction.md) |
| Project records | [**MASTER PROJECT STATE**](docs/project-records/MASTER_PROJECT_STATE.md) · [Status](docs/project-records/00-project-status.md) · [Decisions log](docs/project-records/01-decisions-log.md) · [Open questions](docs/project-records/02-open-questions.md) |

Start with the **[MASTER PROJECT STATE](docs/project-records/MASTER_PROJECT_STATE.md)** for a single consolidated view of vision, decisions, risks and next steps, then the **[project status](docs/project-records/00-project-status.md)** for phase state and blocking items.

## Notes

- The existing files in this repository are the default Flutter scaffold. See `pubspec.yaml` for the generated project configuration.
- Docs are planning drafts and must not be read as implemented features.
- No packages were added and nothing outside this repository was modified during documentation.
# fun_experience_os
