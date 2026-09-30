#!/usr/bin/env bash
# Creates (or updates) the log-based metrics described in
# docs/runbooks/OBSERVABILITY.md. Idempotent: re-running updates filters.
#
#   usage: firebase/scripts/create-log-metrics.sh <gcp-project-id>
#
# Needs gcloud authenticated as someone with roles/logging.configWriter.
# Alert policies on these metrics are created afterwards (see the runbook);
# this script only defines the metrics.
set -euo pipefail

PROJECT="${1:?usage: $0 <gcp-project-id>}"
case "$PROJECT" in demo-*) echo "refusing demo project $PROJECT" >&2; exit 1 ;; esac

BASE='resource.type="cloud_function"'
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# metric <name> <description> <filter> [label=jsonPath ...]
metric() {
  local name="$1" desc="$2" filter="$3"; shift 3
  local file="$TMP/$name.yaml"
  {
    echo "name: $name"
    echo "description: \"$desc\""
    echo "filter: '$BASE AND $filter'"
    echo "metricDescriptor:"
    echo "  metricKind: DELTA"
    echo "  valueType: INT64"
    if [ "$#" -gt 0 ]; then
      echo "  labels:"
      for kv in "$@"; do echo "  - key: ${kv%%=*}"; echo "    valueType: STRING"; done
      echo "labelExtractors:"
      for kv in "$@"; do echo "  ${kv%%=*}: EXTRACT(${kv#*=})"; done
    fi
  } >"$file"
  if gcloud logging metrics describe "$name" --project="$PROJECT" >/dev/null 2>&1; then
    gcloud logging metrics update "$name" --project="$PROJECT" --config-from-file="$file" >/dev/null
    echo "updated  $name"
  else
    gcloud logging metrics create "$name" --project="$PROJECT" --config-from-file="$file" >/dev/null
    echo "created  $name"
  fi
}

metric job_failures "Background job step failed or a retried trigger gave up" \
  'jsonPayload.event="job.failed"' job=jsonPayload.job
metric job_completed "Background job finished cleanly (for absence alerts)" \
  'jsonPayload.event="job.completed"' job=jsonPayload.job
metric callable_internal_errors "Unexpected (non-domain) callable errors" \
  'jsonPayload.event="callable.internal-error"' fn=jsonPayload.fn
metric security_permission_denied "NOT_PERMITTED refusals" \
  'jsonPayload.event="security.permission-denied"' fn=jsonPayload.fn
metric security_rate_limited "RATE_LIMITED refusals" \
  'jsonPayload.event="security.rate-limited"' fn=jsonPayload.fn
metric security_code_failed "Failed organizer/staff code redemptions" \
  'jsonPayload.event="security.code-failed"' purpose=jsonPayload.purpose reason=jsonPayload.reason
metric security_webhook_signature_rejected "Razorpay webhook with a bad signature" \
  'jsonPayload.event="security.webhook-signature-rejected"'
metric security_payment_signature_rejected "confirmPayment with a bad checkout signature" \
  'jsonPayload.event="security.payment-signature-rejected"'
metric webhook_handler_failed "Signed webhook whose handler failed (Razorpay will retry)" \
  'jsonPayload.event="webhook.handler-failed"'
metric refund_provider_errors "Refund could not be sent to the provider" \
  'jsonPayload.event="refund.provider-error"'
metric refund_stuck "Approved refund that cannot be executed (no provider payment)" \
  'jsonPayload.event="refund.stuck"'
metric booking_capacity_exhausted "SOLD_OUT / VENUE_FULL refusals (oversell attempts)" \
  'jsonPayload.event="booking.capacity-exhausted"' fn=jsonPayload.fn
metric push_send_failed "FCM push failures" \
  'jsonPayload.event="push.send-failed"'

echo "done. Now create the alert policies listed in docs/runbooks/OBSERVABILITY.md §3."
