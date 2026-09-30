# Observability: logs, metrics, alerts

**Code:**

- `firebase/functions/src/platform/log.ts`: the structured logger.
- `platform/jobs.ts`: job bookkeeping.
- `platform/callable.ts`: logs every callable failure.

**Metric setup:** `firebase/scripts/create-log-metrics.sh <project>`.

## 1. Log format

Every entry is written through the firebase-functions logger as JSON, so Cloud Logging shows `severity` and puts every field under `jsonPayload`.

| Field | Meaning |
| --- | --- |
| `event` | A stable dot-name, also used as the log `message`. **Metrics filter on it; rename an event only together with its metric.** |
| `severity` | `INFO` / `WARNING` / `ERROR` |
| `fn` | Function name (`FUNCTION_TARGET`) |
| `uid` | Firebase uid of the caller or recipient. It is opaque, and it joins the log to `auditEvents.actorUid`. |
| `orgId` | Organizer, when one is known |
| `code` | DomainError code (`RATE_LIMITED`, `NOT_PERMITTED`, …). **Never an access code.** |
| `requestId` | The client idempotency key, when the call had one |
| `correlationId` | The Cloud Trace id of the HTTP request |
| `job` | The job name, on `job.*` events |

**Never logged:**

- phone numbers
- organizer or staff codes, or their hashes
- push tokens
- payment or webhook signatures
- secrets
- request and response bodies

`sanitize()` enforces this twice. It redacts by key name (`phone`, `token`, `secret`, `signature`, `codeHash`, `organizerCode`, `body`, `payload`, `data`, …) and by value shape (any 10–15-digit run, which covers Indian mobile numbers). It also truncates strings, arrays and nesting depth, which keeps log volume in check.

**Volume.** Routine user mistakes are logged at INFO, one line per failed call:

- `INVALID_INPUT`
- `NOT_FOUND`
- `CONFLICT`

WARNING is reserved for signals someone might act on. Successful callables are not logged; Cloud Functions' own request logs cover them.

## 2. Events

| Event | Severity | Emitted by | Meaning |
| --- | --- | --- | --- |
| `callable.internal-error` | ERROR | `callable()`, governance/operator callables | Unexpected exception. Includes `errorName`, `errorMessage` and `stack`; the user only saw "Something went wrong". **A bug.** |
| `callable.domain-error` | WARNING / INFO | same | Business refusal (`code`) |
| `security.permission-denied` | WARNING | same | `NOT_PERMITTED` (with `detail.action` where there is one) |
| `security.unauthenticated` | WARNING | same | `NOT_AUTHENTICATED` |
| `security.rate-limited` | WARNING | same | `RATE_LIMITED` (`detail.bucket` is the limiter bucket) |
| `booking.capacity-exhausted` | WARNING | same | `SOLD_OUT` / `VENUE_FULL`, meaning an oversell attempt was refused |
| `security.code-failed` | WARNING | identity `codeFailureAudit` | Wrong, expired, locked or rate-limited organizer/staff code (`purpose`, `reason`) |
| `security.payment-signature-rejected` | WARNING | `confirmPayment` | Checkout signature didn't verify |
| `security.webhook-signature-rejected` | WARNING | `razorpayWebhook` | Webhook HMAC didn't verify (`signaturePresent`, `bytes`) |
| `webhook.handler-failed` | ERROR | `razorpayWebhook` | A signed event failed. We answered 500, so Razorpay retries it. |
| `refund.provider-error` | ERROR | `executeRefund` | The provider call failed. The refund stays `approved`, and the 5-minute sweep retries it. |
| `refund.stuck` | WARNING | `executeRefund` | An approved refund has no provider payment id, so it cannot be sent. |
| `holds.release-failed` | WARNING | `releaseExpiredHolds` | Some holds couldn't be released this run; they are retried next run. |
| `push.send-failed` | WARNING | `deliverNotifications` | FCM refused or failed. The inbox entry still exists. |
| `job.completed` | INFO | `runJob()`, triggers | Summary counts per step |
| `job.failed` | ERROR | `runJob()`, triggers | A step failed, or a retried trigger dropped a stale event (`reason: "stale-event-dropped"`) |

Every scheduled run also writes `jobRuns/{job}_{YYYY-MM-DD}`. Its fields are `runs`, `failures`, `lastStatus`, `lastSteps`, `lastErrors` and `lastStartedAt`. Admins and auditors can read it in Firestore.

## 3. Metrics and alerts

Both steps are scripted and idempotent:

```sh
firebase/scripts/create-log-metrics.sh <project-id>
# Owner, once: Cloud Monitoring → Alerting → Edit notification channels → add the on-call email; copy its id.
firebase/scripts/create-alert-policies.sh <project-id> <notification-channel-id>
```

The second script creates one policy per row below, named `Experience OS: …`. That includes the three absence alerts for the scheduled jobs.

| Metric | Filter (all also include `resource.type="cloud_function"`) | Alert when | Action |
| --- | --- | --- | --- |
| `job_failures` (label `job`) | `jsonPayload.event="job.failed"` | > 0 in 15 min | Open `jobRuns/{job}_{today}` and read `lastErrors`. For `releaseExpiredHolds`, check the Firestore status page and contention; holds heal on the next run. For `dataRetention`, see `DATA_RETENTION.md`; a missing index shows as `FAILED_PRECONDITION`. For `onEventCancelled` with a stale event, customers were **not** all refunded: rerun `refundCancelledEvent(eventId)` from a shell. **SEV-2.** |
| `job_completed` (label `job`) | `jsonPayload.event="job.completed"` | **Absent** for 20 min where `job="releaseExpiredHolds"`, 45 min where `job="sendEventReminders"`, or 26 h where `job="dataRetention"` | The scheduler isn't firing, or the function can't start. Check Cloud Scheduler, then the function's deploy state. Holds pile up and seats stay blocked. **SEV-2.** |
| `callable_internal_errors` (label `fn`) | `jsonPayload.event="callable.internal-error"` | > 5 in 10 min for any `fn` | Read the stack in Logs Explorer, filtered on `jsonPayload.fn`. It's a bug; roll back if it started with a deploy. |
| `security_permission_denied` (label `fn`) | `jsonPayload.event="security.permission-denied"` | > 100 in 10 min | Probing or a broken client release. Group by `jsonPayload.uid`. For one uid, consider disabling the account (`setOperatorAccess` / Auth). For many uids, suspect the app version. |
| `security_rate_limited` (label `fn`) | `jsonPayload.event="security.rate-limited"` | > 50 in 10 min | Automated abuse, or a limit that's too tight for a real launch. Check `detail.bucket` for the uid and endpoint before raising any limit. |
| `security_code_failed` (labels `purpose`, `reason`) | `jsonPayload.event="security.code-failed"` | > 20 in 1 h | Code brute force. The 5-per-hour limit per uid and the 10-per-code lock are holding, but many uids means a coordinated attempt. Check `auditEvents` `access.code-failed`. |
| `security_webhook_signature_rejected` | `jsonPayload.event="security.webhook-signature-rejected"` | ≥ 5 in 10 min | Either the webhook secret is out of sync (after a rotation) or someone is forging webhooks. Compare `RAZORPAY_WEBHOOK_SECRET` with the Razorpay dashboard. |
| `security_payment_signature_rejected` | `jsonPayload.event="security.payment-signature-rejected"` | > 10 in 10 min | Tampered checkout, or the key secret is out of sync. The payment still confirms through the webhook if it was real. |
| `webhook_handler_failed` | `jsonPayload.event="webhook.handler-failed"` | ≥ 1 in 10 min | Razorpay retries, and handlers are idempotent. Persisting failures mean payments stuck in `created`: follow SEV-2 in `ENVIRONMENTS_AND_DEPLOYMENT.md` §9. |
| `refund_provider_errors` | `jsonPayload.event="refund.provider-error"` | ≥ 3 in 30 min | Provider outage or credentials. Refunds retry every 5 min. Money is owed, so check the Razorpay status page. |
| `refund_stuck` | `jsonPayload.event="refund.stuck"` | > 0 in 1 h | An approved refund has no provider payment id. It needs a manual refund in the Razorpay dashboard and an admin note. |
| `booking_capacity_exhausted` (label `fn`) | `jsonPayload.event="booking.capacity-exhausted"` | > 300 in 5 min | A bot is hammering a sold-out event. Per-uid reserve limits apply. For a popular drop this is informational. |
| `push_send_failed` | `jsonPayload.event="push.send-failed"` | > 100 in 1 h | FCM or APNs configuration. The in-app inbox still works. |

Also keep the platform metrics from `ENVIRONMENTS_AND_DEPLOYMENT.md` §7: error rate and p95 latency on `reserveSeat`, `confirmPayment`, `razorpayWebhook` and `scanTicket`.

### Equivalent one-off commands

The script is preferred. For a label-free metric, the equivalent one-off command is:

```sh
gcloud logging metrics create job_failures --project=<project> \
  --description="Background job step failed" \
  --log-filter='resource.type="cloud_function" AND jsonPayload.event="job.failed"'
```

## 4. Background job inventory

Retries are only enabled where the handler is idempotent and a retry is the only way to finish the work.

| Function | Kind | Bounded | Idempotent | Retry | Failure visibility |
| --- | --- | --- | --- | --- | --- |
| `releaseExpiredHolds` | every 5 min | 500 holds and 50 refund retries per run (candidates are the 200 oldest-touched) | Yes: per-booking transaction re-checks the state; refunds use a lease and the provider idempotency key | None (next run in 5 min) | `jobRuns`, `job.failed`, `holds.release-failed`, `refund.provider-error` |
| `sendEventReminders` | every 15 min | 200 events and 2,000 sends per run; resumes next run | Yes: notification id is the dedupe key, re-checked in a transaction | None (next run in 15 min) | `jobRuns`, `job.failed` |
| `runDataRetention` | daily 03:17 IST | 3,000 docs per task; KYC scan capped at 2,000 | Yes (`DATA_RETENTION.md` §2) | None (daily) | `jobRuns`, `job.failed` |
| `onEventCancelled` | Firestore onUpdate | Per-booking transactions; 540 s timeout; a retry resumes | Yes: deterministic `evc_` refund ids, and cancelled bookings are skipped | **failurePolicy**, with events older than 24 h dropped | `job.completed` / `job.failed` (`willRetry`) |
| `onExperienceRevisionApproved` | Firestore onUpdate | One transaction | Yes: a merged revision is `archived`, so a replay is a no-op | **failurePolicy**, with events older than 24 h dropped | `job.completed` / `job.failed` |
| `deliverNotifications` | Firestore onCreate | One multicast to at most 10 tokens | No: a retry after a partial send pushes twice | None, **on purpose** (the inbox is the truth) | `push.status` on the doc; `push.send-failed` |
| `razorpayWebhook` | HTTP | HMAC check first, then one dedupe read; one handler | Yes (`paymentEvents`) | Razorpay retries on a 500 | `security.webhook-signature-rejected`, `webhook.handler-failed` |
