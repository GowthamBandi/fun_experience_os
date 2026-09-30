#!/usr/bin/env bash
# Deploys rules, indexes, storage rules and functions to ONE named environment.
#
#   scripts/deploy-backend.sh staging
#   scripts/deploy-backend.sh production
#
# Refuses to run unless:
#   - the alias exists in .firebaserc and passes the release guardrails
#     (staging and production are distinct, non-demo, correctly named);
#   - the working tree is clean (what is deployed is what is committed);
#   - every required secret exists in that project's Secret Manager;
#   - for production, the operator types the project id back.
# It never creates projects, secrets or keys; those are owner actions.
set -euo pipefail

ENV_NAME="${1:-}"
case "$ENV_NAME" in
  staging|production) ;;
  *) echo "usage: $0 staging|production" >&2; exit 2 ;;
esac

cd "$(dirname "$0")/.."

node scripts/check-release-guardrails.mjs
npm run -s check:indexes

PROJECT_ID="$(node -e 'const p=require("./.firebaserc").projects||{};process.stdout.write(p[process.argv[1]]||"")' "$ENV_NAME")"
if [[ -z "$PROJECT_ID" ]]; then
  echo "ABORT: .firebaserc has no \"$ENV_NAME\" alias. Add it with: firebase use --add (see docs/runbooks/ENVIRONMENTS_AND_DEPLOYMENT.md)" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "ABORT: working tree has uncommitted changes; deploy only committed code." >&2
  exit 1
fi

REQUIRED_SECRETS=(CODE_PEPPER TICKET_SIGNING_KEY RAZORPAY_KEY_ID RAZORPAY_KEY_SECRET RAZORPAY_WEBHOOK_SECRET)
missing=()
for s in "${REQUIRED_SECRETS[@]}"; do
  if ! firebase functions:secrets:get "$s" --project "$ENV_NAME" >/dev/null 2>&1; then missing+=("$s"); fi
done
if (( ${#missing[@]} )); then
  echo "ABORT: missing secrets in $PROJECT_ID: ${missing[*]}" >&2
  echo "Set each with: firebase functions:secrets:set <NAME> --project $ENV_NAME" >&2
  exit 1
fi

if [[ "$ENV_NAME" == "production" ]]; then
  read -r -p "Type the production project id ($PROJECT_ID) to deploy: " typed
  [[ "$typed" == "$PROJECT_ID" ]] || { echo "ABORT: confirmation did not match." >&2; exit 1; }
fi

echo "Deploying commit $(git rev-parse --short HEAD) to $ENV_NAME ($PROJECT_ID)…"
firebase deploy --project "$ENV_NAME" --only firestore:rules,firestore:indexes,storage,functions
echo "Deployed. Next: run the post-deploy smoke list (runbook §6) against $ENV_NAME."
