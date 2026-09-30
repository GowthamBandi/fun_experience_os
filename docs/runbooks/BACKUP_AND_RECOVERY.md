# Backup and recovery

**Status:** prepared, **not active**. Nothing is backed up until the owner runs `scripts/enable-backups.sh` against a real project (see `HUMAN_FINAL_ACTIVATION_CHECKLIST.md`).

## What is protected, and how

| Data | Mechanism | Retention | Recovery point |
| --- | --- | --- | --- |
| Firestore (all collections) | Point-in-time recovery (PITR) | 7 days, 1-minute granularity | ≤ 1 minute |
| Firestore (all collections) | Scheduled daily backups | production 14 weeks, staging 2 weeks | ≤ 24 hours |
| Cloud Storage (KYC documents, evidence) | Object versioning + soft delete (bucket settings) | 30 days of non-current versions | last write |
| Money movement | Razorpay is the system of record; `payments`, `refunds` and `ledgerEntries` are reconciled against its reports | Razorpay retention | — |
| Secrets | Secret Manager keeps prior versions | until destroyed | pin a previous version |
| Code, rules, indexes | Git; deploys only from committed trees (`scripts/deploy-backend.sh`) | forever | any commit |

`auditEvents` and `ledgerEntries` are append-only by design (rules deny client writes; no service updates or deletes them). A restore never needs to "fix" them. Replay the gap from Razorpay instead (below).

## Activation (owner, once per environment)

```sh
gcloud auth login                         # the project owner's account
scripts/enable-backups.sh staging
scripts/enable-backups.sh production
# Storage bucket safety net:
gcloud storage buckets update gs://<bucket> --versioning --soft-delete-duration=30d
```

The script is idempotent. It enables PITR, creates exactly one daily schedule, and prints the resulting state.

## Restore procedures

Always restore **into a new database first**. Inspect the result, then decide. Never overwrite production in place.

### A. Accidental writes or deletes in the last 7 days (PITR)

```sh
# 1. Freeze writes to the affected area if the cause is still active
#    (pause the organizer / admin-cancel the event from the console, or disable a callable).
# 2. Export the database as it was a minute before the incident (PITR export),
#    then import it into a new, empty database:
gcloud firestore export gs://<backup-bucket>/pitr-<yyyymmdd-hhmm> --project <project> \
  --database='(default)' --snapshot-time='<RFC3339, whole minute>'
gcloud firestore databases create --project <project> --database='restore-<yyyymmdd-hhmm>' --location=<firestore location>
gcloud firestore import gs://<backup-bucket>/pitr-<yyyymmdd-hhmm> --project <project> \
  --database='restore-<yyyymmdd-hhmm>'
# 3. Compare the affected documents and copy back only what was damaged
#    (small admin-SDK script, reviewed by a second engineer). Write an auditEvent
#    for each restored document with action "data.restored" and the incident id.
```

### B. Older damage or full loss (daily backup)

```sh
gcloud firestore backups list --project <project> --location=<firestore location>
gcloud firestore databases restore --project <project> \
  --source-backup=projects/<project>/locations/<loc>/backups/<backup-id> \
  --destination-database='restore-<yyyymmdd>'
```

Then either copy the needed documents back as in A, or, for total loss, re-point the functions at the restored database. That means a code change to `db()` naming the database id, deployed through the normal path.

### C. Money reconciliation after any restore

1. List Razorpay payments and refunds since the restore point (dashboard export or API).
2. For every captured payment with no `payments` doc in `captured` state, re-deliver the Razorpay webhook from the dashboard. `razorpayWebhook` is idempotent per event id, so re-delivery is safe.
3. Run the ledger balance check: every `txnId` must be balanced, and the per-org `organizer_payable` sum must equal the open settlements plus unsettled entries. Any difference becomes a `riskAlert` for an admin decision. Never edit ledger history; post a correcting entry through an admin decision.

## Drills

- **Quarterly:** restore the latest production backup into a scratch database (procedure B), run read checks against it, then delete it.
- **After every restore:** hold a postmortem within 48 hours, per the incident process in `ENVIRONMENTS_AND_DEPLOYMENT.md` §9.

## Assumptions

- Firestore lives in one region (`asia-south1` recommended, chosen when the owner creates the database; it can't be changed later). There is no multi-region failover. A regional outage means waiting for Google's recovery, which is acceptable for v1.
- Cloud Functions are stateless and redeployable from git in minutes.
