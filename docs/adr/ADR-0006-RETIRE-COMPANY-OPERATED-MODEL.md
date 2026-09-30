# ADR-0006: Retire the company-operated model and archive the operations prototype

- **Status:** Accepted
- **Date:** 2026-09-30

## Context

Before 2026-09-29, the product was documented as "Experience OS operates every event". That model covered franchises, territories, city managers, staff scheduling, and Super Admin-run check-in, teams and scoring. About 80 pages of the Operations Console (`apps/operations-web`, the localStorage prototype) and many docs encode it.

The canonical business model is now a **governed marketplace**:
- organizers create and operate experiences;
- Experience OS governs.

## Decision

1. **Franchise/territory tenancy is retired.** The tenant is the organizer (`orgId`), per ADR-0003.
2. **Event-day operations belong to organizers and their staff, in PULSE.** This covers check-in, temporary identities, teams, live operation and completion. They are not Super Admin functions.
3. **The operations prototype is archived, not deleted.**
   - Its pages render an "Archived prototype" notice unless explicitly enabled for reference.
   - Its localStorage state never touches production data.
   - Concepts worth keeping were carried into PULSE's organizer tools and the server model. These are the category template fields, identity patterns, check-in states and the safety checklist.
4. **Documents that encode the old model carry an OBSOLETE banner.** They point to the ADRs and `docs/ARCHITECTURE.md`, and they are kept for history.

## Consequences

- There is one authority for every capability: see the ownership table in `docs/ARCHITECTURE.md`.
- The following prototype concepts are archived without a production equivalent:
  - franchise P&L;
  - staff shift scheduling by the platform;
  - tournaments with brackets (a future organizer-side feature).

  They are recorded here so nobody ships them by accident.
