# experience_platform

**Governed event marketplace** — organizers and event managers register, submit arenas and propose real-world events; customers discover and pay; the platform Super Admin verifies access, approves supply, controls risk, refunds and settlements, and enforces marketplace policy.

> **Project phase: production pass complete for the Super Admin console (2026-09-29).**
> - **The console** (`apps/operations-web`) is usable today as a local workspace: white "Daylight" design, durable storage, an activity record of every action, and every known blocker fixed.
> - **The Firebase backend** (`firebase/`) is hardened and tested on the emulator. It goes live once a Firebase project is created.
> - **Out of scope for this pass:** payment-provider integration and production login.
> - **The Flutter customer app** is still an unbuilt scaffold.
>
> Read **[CHANGELOG.md](CHANGELOG.md)** for what changed, **[docs/PRODUCTION_STATUS.md](docs/PRODUCTION_STATUS.md)** for verified status, and **[docs/product/CONSOLE_USER_GUIDE.md](docs/product/CONSOLE_USER_GUIDE.md)** to start using it.

## Quick start

```bash
cd apps/operations-web && npm install && npm run dev   # http://localhost:3000 → choose an operator
npm test                                               # web business-rule tests
cd ../.. && npm run test:functions && npm run test:rules  # Firebase emulator tests (Java 21 + firebase-tools)
```

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
- Independent organizers create and conduct events; the **Super Admin governs marketplace access, approvals, commercial terms, customer protection and money movement**.

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
| Console | [User guide](docs/product/CONSOLE_USER_GUIDE.md) · [Daylight design system](docs/design-system/03-daylight-design-system.md) · [Changelog](CHANGELOG.md) |
| Project records | [**MASTER PROJECT STATE**](docs/project-records/MASTER_PROJECT_STATE.md) · [Status](docs/project-records/00-project-status.md) · [Decisions log](docs/project-records/01-decisions-log.md) · [Open questions](docs/project-records/02-open-questions.md) |

Start with the **[Super Admin marketplace governance model](docs/product/06-super-admin-marketplace-governance.md)** for the corrected operating model, then [Production Status](docs/PRODUCTION_STATUS.md) for implementation reality. Older planning records still contain the superseded company-operated-event assumption.

## Notes

- The Flutter files at the repository root are still the default scaffold (customer app not started).
- Planning docs under `docs/` are drafts; implemented behaviour is recorded in `CHANGELOG.md` and `docs/PRODUCTION_STATUS.md`.
# fun_experience_os
