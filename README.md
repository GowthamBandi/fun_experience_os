# Experience OS: backend and Operations Console

Experience OS is a **governed experience marketplace**:
- independent organizers apply, are approved, and run experiences and events;
- customers discover, book and attend them through the **PULSE** app;
- the platform Super Admin governs access, supply, risk, refunds, commercial terms and settlements.

| Surface | Where | Technology |
| --- | --- | --- |
| PULSE (customer, organizer and staff app) | separate repository `exprerience_os` | Flutter |
| Operations Console (Super Admin) | `apps/operations-web` | Next.js + TypeScript |
| Backend | `firebase/` (Cloud Functions, Firestore and Storage rules, indexes) | Firebase, TypeScript |

## Status

Engineering is complete and verified locally. Launch waits on owner-only activation steps: Firebase projects, secrets, store accounts, Razorpay, and so on.

- **Readiness report:** [`EXPERIENCE_OS_FINAL_PRODUCTION_READINESS.md`](EXPERIENCE_OS_FINAL_PRODUCTION_READINESS.md)
- **Owner steps:** [`HUMAN_FINAL_ACTIVATION_CHECKLIST.md`](HUMAN_FINAL_ACTIVATION_CHECKLIST.md)

## Layout

```
apps/operations-web/        Operations Console (Next.js)
firebase/functions/         Cloud Functions (TypeScript) + jest suites (unit, integration, E2E, attack)
firebase/firestore/         Firestore rules, indexes, rules test suite
firebase/storage/           Storage rules
firebase/scripts/           bootstrap-platform-owner, index coverage check, emulator helpers
scripts/                    release guardrails, guarded deploy, backup activation
docs/                       ADRs, API contract, architecture, runbooks
.github/workflows/ci.yml    CI: guardrails, functions, rules, console
```

## Everyday commands

```sh
npm run test:rules          # rules suites on the emulator
npm run test:functions      # functions suites on the emulator
npm run check:indexes       # every production query has its composite index
node scripts/check-release-guardrails.mjs
scripts/deploy-backend.sh staging|production    # guarded; see the runbook
```

## Documentation (current)

| Topic | Document |
| --- | --- |
| Architecture | [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) |
| API contract (every callable) | [`docs/API_CONTRACT.md`](docs/API_CONTRACT.md) |
| Decisions | [`docs/adr/`](docs/adr) (ADR-0003 data model, ADR-0004 identity/organizer/staff, ADR-0005 payments/tickets/ledger, ADR-0006 retiring the company-operated model) |
| Environments and deployment | [`docs/runbooks/ENVIRONMENTS_AND_DEPLOYMENT.md`](docs/runbooks/ENVIRONMENTS_AND_DEPLOYMENT.md) |
| Backup and recovery | [`docs/runbooks/BACKUP_AND_RECOVERY.md`](docs/runbooks/BACKUP_AND_RECOVERY.md) |
| Observability | [`docs/runbooks/OBSERVABILITY.md`](docs/runbooks/OBSERVABILITY.md) |
| Data retention | [`docs/runbooks/DATA_RETENTION.md`](docs/runbooks/DATA_RETENTION.md) |
| Console deployment | [`apps/operations-web/DEPLOYMENT.md`](apps/operations-web/DEPLOYMENT.md) |

Documents carrying an **OBSOLETE** banner (early product/admin planning for the retired company-operated model) are kept for history only. Don't implement from them.

## Unused files at the repository root

`lib/`, `test/`, `android/`, `ios/`, `web/`, `linux/`, `macos/`, `windows/`, `pubspec.yaml` and `analysis_options.yaml` are the default `flutter create` counter-app scaffold. Nothing uses, builds or deploys them; the customer app is PULSE in its own repository. They can be deleted whenever the owner chooses.
