#!/usr/bin/env bash
# Turns on Firestore point-in-time recovery and a daily backup schedule for
# ONE environment. Run by the project owner (needs roles/datastore.owner),
# with their own gcloud login. Idempotent: re-running reports the existing
# schedule instead of creating a duplicate.
#
#   scripts/enable-backups.sh staging
#   scripts/enable-backups.sh production
set -euo pipefail
ENV_NAME="${1:-}"
case "$ENV_NAME" in staging|production) ;; *) echo "usage: $0 staging|production" >&2; exit 2 ;; esac
cd "$(dirname "$0")/.."
PROJECT_ID="$(node -e 'const p=require("./.firebaserc").projects||{};process.stdout.write(p[process.argv[1]]||"")' "$ENV_NAME")"
[[ -n "$PROJECT_ID" ]] || { echo "ABORT: no \"$ENV_NAME\" alias in .firebaserc" >&2; exit 1; }

# Production keeps 14 weeks of daily backups (the Firestore maximum); staging 2 weeks.
RETENTION="2w"; [[ "$ENV_NAME" == "production" ]] && RETENTION="14w"

echo "Enabling point-in-time recovery (7 days) on $PROJECT_ID…"
gcloud firestore databases update --project "$PROJECT_ID" --database='(default)' --enable-pitr

if gcloud firestore backups schedules list --project "$PROJECT_ID" --database='(default)' --format='value(name)' | grep -q .; then
  echo "A backup schedule already exists:"
  gcloud firestore backups schedules list --project "$PROJECT_ID" --database='(default)'
else
  echo "Creating a daily backup schedule (retention $RETENTION)…"
  gcloud firestore backups schedules create --project "$PROJECT_ID" --database='(default)' --recurrence=daily --retention="$RETENTION"
fi

echo "Verify:"
gcloud firestore databases describe --project "$PROJECT_ID" --database='(default)' --format='value(pointInTimeRecoveryEnablement)'
gcloud firestore backups schedules list --project "$PROJECT_ID" --database='(default)'
