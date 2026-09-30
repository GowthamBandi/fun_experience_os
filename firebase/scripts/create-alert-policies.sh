#!/usr/bin/env bash
# Creates the Cloud Monitoring alert policies described in
# docs/runbooks/OBSERVABILITY.md §3, on the log-based metrics made by
# create-log-metrics.sh. Idempotent: a policy whose display name already
# exists is left alone.
#
#   usage: firebase/scripts/create-alert-policies.sh <gcp-project-id> <notification-channel-id>
#
# The notification channel (on-call email / chat) is created once by the
# owner in Cloud Monitoring → Alerting → Edit notification channels; pass its
# numeric id (the last path segment of projects/<p>/notificationChannels/<id>).
# Needs gcloud authenticated with roles/monitoring.alertPolicyEditor.
set -euo pipefail

PROJECT="${1:?usage: $0 <gcp-project-id> <notification-channel-id>}"
CHANNEL="${2:?usage: $0 <gcp-project-id> <notification-channel-id>}"
case "$PROJECT" in demo-*) echo "refusing demo project $PROJECT" >&2; exit 1 ;; esac
CHANNEL_NAME="projects/$PROJECT/notificationChannels/$CHANNEL"

# `gcloud monitoring policies` is GA in current SDKs; older SDKs only have alpha.
if gcloud monitoring policies list --project "$PROJECT" --limit 1 >/dev/null 2>&1; then
  POLICIES=(gcloud monitoring policies)
else
  POLICIES=(gcloud alpha monitoring policies)
fi

EXISTING="$("${POLICIES[@]}" list --project "$PROJECT" --format='value(displayName)')"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

metric_filter() { # <metric> [extra filter]
  local f="resource.type=\\\"cloud_function\\\" AND metric.type=\\\"logging.googleapis.com/user/$1\\\""
  [ -n "${2:-}" ] && f="$f AND $2"
  printf '%s' "$f"
}

create() { # <display name> <json body>
  local name="$1" body="$2"
  if grep -Fxq "$name" <<<"$EXISTING"; then echo "exists: $name"; return; fi
  printf '%s' "$body" > "$TMP/policy.json"
  "${POLICIES[@]}" create --project "$PROJECT" --policy-from-file="$TMP/policy.json" >/dev/null
  echo "created: $name"
}

# threshold <display> <metric> <window seconds> <comparison> <value> <severity note> [extra filter]
threshold() {
  local display="Experience OS: $1" metric="$2" window="$3" cmp="$4" value="$5" doc="$6" extra="${7:-}"
  create "$display" "{
    \"displayName\": \"$display\",
    \"documentation\": {\"content\": \"$doc See docs/runbooks/OBSERVABILITY.md (metric $metric).\", \"mimeType\": \"text/markdown\"},
    \"combiner\": \"OR\",
    \"conditions\": [{
      \"displayName\": \"$metric\",
      \"conditionThreshold\": {
        \"filter\": \"$(metric_filter "$metric" "$extra")\",
        \"aggregations\": [{\"alignmentPeriod\": \"${window}s\", \"perSeriesAligner\": \"ALIGN_SUM\"}],
        \"comparison\": \"$cmp\",
        \"thresholdValue\": $value,
        \"duration\": \"0s\",
        \"trigger\": {\"count\": 1}
      }
    }],
    \"notificationChannels\": [\"$CHANNEL_NAME\"],
    \"alertStrategy\": {\"autoClose\": \"3600s\"}
  }"
}

# absent <display> <job label> <duration seconds>
absent() {
  local display="Experience OS: $1" job="$2" duration="$3"
  create "$display" "{
    \"displayName\": \"$display\",
    \"documentation\": {\"content\": \"Scheduled job $job has not completed. Check Cloud Scheduler and the function's deploy state. SEV-2. See docs/runbooks/OBSERVABILITY.md.\", \"mimeType\": \"text/markdown\"},
    \"combiner\": \"OR\",
    \"conditions\": [{
      \"displayName\": \"job_completed absent ($job)\",
      \"conditionAbsent\": {
        \"filter\": \"$(metric_filter job_completed "metric.label.job=\\\"$job\\\"")\",
        \"aggregations\": [{\"alignmentPeriod\": \"300s\", \"perSeriesAligner\": \"ALIGN_SUM\"}],
        \"duration\": \"${duration}s\",
        \"trigger\": {\"count\": 1}
      }
    }],
    \"notificationChannels\": [\"$CHANNEL_NAME\"],
    \"alertStrategy\": {\"autoClose\": \"3600s\"}
  }"
}

threshold "background job failed"            job_failures                          900  COMPARISON_GT 0   "A background job step failed. SEV-2."
absent    "holds sweeper not running"        releaseExpiredHolds                   1200
absent    "event reminders not running"      sendEventReminders                    2700
absent    "data retention not running"       dataRetention                         93600
threshold "callable internal errors"         callable_internal_errors              600  COMPARISON_GT 5   "Unexpected callable errors: a bug. Roll back if it started with a deploy."
threshold "permission denials spike"         security_permission_denied            600  COMPARISON_GT 100 "Probing or a broken client release."
threshold "rate limiting spike"              security_rate_limited                 600  COMPARISON_GT 50  "Automated abuse or a too-tight limit."
threshold "access code failures"             security_code_failed                  3600 COMPARISON_GT 20  "Possible code brute force."
threshold "webhook signature rejected"       security_webhook_signature_rejected   600  COMPARISON_GT 4   "Webhook secret out of sync, or forged webhooks."
threshold "payment signature rejected"       security_payment_signature_rejected   600  COMPARISON_GT 10  "Tampered checkout or key secret out of sync."
threshold "webhook handler failed"           webhook_handler_failed                600  COMPARISON_GT 0   "Payments may be stuck in created. SEV-2."
threshold "refund provider errors"           refund_provider_errors                1800 COMPARISON_GT 2   "Refunds owed; provider outage or credentials."
threshold "refund stuck"                     refund_stuck                          3600 COMPARISON_GT 0   "Approved refund with no provider payment id; refund manually."
threshold "sold-out hammering"               booking_capacity_exhausted            300  COMPARISON_GT 300 "Bot traffic on a sold-out event (informational for popular drops)."
threshold "push send failures"               push_send_failed                      3600 COMPARISON_GT 100 "FCM/APNs configuration; the inbox still works."

echo "Done. Verify: ${POLICIES[*]} list --project $PROJECT --format='value(displayName)' | grep 'Experience OS'"
