#!/usr/bin/env bash
# One-time provisioning of a Firebase/GCP project for Experience OS.
# Run by the project owner with their own login, AFTER creating the project
# (Blaze plan) and adding its alias to .firebaserc. Idempotent: every step
# checks before acting, and existing secrets are NEVER overwritten.
#
#   gcloud auth login && firebase login
#   scripts/provision-environment.sh staging
#   scripts/provision-environment.sh production
#
# What it does:
#   1. enables the Google APIs the backend, console and app use;
#   2. creates the (default) Firestore database in asia-south1 if missing;
#   3. generates CODE_PEPPER and TICKET_SIGNING_KEY (random, 48 bytes) if absent;
#   4. asks for the Razorpay key id / key secret / webhook secret if absent
#      (hidden input; press Enter to skip and set them later);
#   5. prints what is still owner-only (console clicks that have no API).
set -euo pipefail
ENV_NAME="${1:-}"
case "$ENV_NAME" in staging|production) ;; *) echo "usage: $0 staging|production" >&2; exit 2 ;; esac
cd "$(dirname "$0")/.."

node scripts/check-release-guardrails.mjs >/dev/null
PROJECT_ID="$(node -e 'const p=require("./.firebaserc").projects||{};process.stdout.write(p[process.argv[1]]||"")' "$ENV_NAME")"
[[ -n "$PROJECT_ID" ]] || { echo "ABORT: no \"$ENV_NAME\" alias in .firebaserc (firebase use --add)" >&2; exit 1; }
REGION="asia-south1"
echo "== Provisioning $ENV_NAME ($PROJECT_ID)"

echo "-- 1. APIs"
gcloud services enable --project "$PROJECT_ID" \
  firestore.googleapis.com firebasestorage.googleapis.com identitytoolkit.googleapis.com \
  cloudfunctions.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  run.googleapis.com eventarc.googleapis.com pubsub.googleapis.com cloudscheduler.googleapis.com \
  secretmanager.googleapis.com firebaseappcheck.googleapis.com fcm.googleapis.com \
  logging.googleapis.com monitoring.googleapis.com firebaseapphosting.googleapis.com \
  recaptchaenterprise.googleapis.com

echo "-- 2. Firestore (default) in $REGION"
if gcloud firestore databases describe --project "$PROJECT_ID" --database='(default)' >/dev/null 2>&1; then
  echo "exists: $(gcloud firestore databases describe --project "$PROJECT_ID" --database='(default)' --format='value(locationId,type)')"
else
  gcloud firestore databases create --project "$PROJECT_ID" --database='(default)' --location="$REGION" --type=firestore-native
fi

has_secret() { firebase functions:secrets:get "$1" --project "$ENV_NAME" >/dev/null 2>&1; }
set_secret_from_stdin() { firebase functions:secrets:set "$1" --project "$ENV_NAME" --data-file=- --force >/dev/null; }

echo "-- 3. Internal secrets"
for s in CODE_PEPPER TICKET_SIGNING_KEY; do
  if has_secret "$s"; then echo "exists: $s (left unchanged; rotating it invalidates codes/tickets)"; else
    openssl rand -base64 48 | tr -d '\n' | set_secret_from_stdin "$s"
    echo "generated: $s"
  fi
done

echo "-- 4. Razorpay secrets (from the Razorpay dashboard; $([[ $ENV_NAME == production ]] && echo LIVE || echo TEST) mode)"
for s in RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET; do
  if has_secret "$s"; then echo "exists: $s"; continue; fi
  read -r -s -p "  $s (Enter to skip): " value; echo
  if [[ -n "$value" ]]; then
    if [[ "$ENV_NAME" == "staging" && "$s" == "RAZORPAY_KEY_ID" && "$value" == rzp_live_* ]]; then
      echo "  ABORT: a LIVE Razorpay key must never be used in staging." >&2; exit 1
    fi
    if [[ "$ENV_NAME" == "production" && "$s" == "RAZORPAY_KEY_ID" && "$value" == rzp_test_* ]]; then
      echo "  ABORT: production needs the LIVE Razorpay key, not a test key." >&2; exit 1
    fi
    printf '%s' "$value" | set_secret_from_stdin "$s"; echo "  set: $s"
  else
    echo "  skipped: $s (deploy-backend.sh refuses to deploy until it is set)"
  fi
  unset value
done

cat <<EOF

== Done with what can be scripted for $PROJECT_ID.
Still owner-only, in the Firebase console (see HUMAN_FINAL_ACTIVATION_CHECKLIST.md):
  - Authentication: enable Phone and Email/Password providers; authorized domains.
  - App Check: register Android (Play Integrity), iOS (App Attest), web (reCAPTCHA Enterprise key).
  - Cloud Messaging: upload the APNs auth key.
  - Register the Android/iOS/web apps and copy their config values.
Next: scripts/enable-backups.sh $ENV_NAME, then scripts/deploy-backend.sh $ENV_NAME.
EOF
