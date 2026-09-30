# Data retention and legal holds

**Owner:** platform engineering. **Legal sign-off:** pending (`OQ-SA-005`). The periods below are engineering defaults chosen to be conservative. Legal can change any of them by editing `RETENTION` in `firebase/functions/src/platform/retention.ts` and this page together.

**Implementation:** `runDataRetention` (daily, 03:17 IST, asia-south1) calls `runRetention()` in `platform/retention.ts`. Holds live in `platform/legalHolds.ts`.

## 1. Policy

| Data | Where | Kept for | What happens after | Why |
| --- | --- | --- | --- | --- |
| **Audit trail** | `auditEvents` | **At least 8 years. Never deleted by any job.** | Nothing. Deleting them needs a separate, legal-approved export-then-purge procedure; none exists today. | Companies Act 2013 s.128 (books and supporting records: 8 years), GST (72 months), and dispute evidence. DPDP Act 2023 s.8(7) allows retention "as required by law". Rules deny every client write; no code path updates or deletes them. |
| Ledger, payments, refunds, settlements, `paymentEvents` | Firestore | At least 8 years. Not touched. | — | Financial records. `paymentEvents` is also the webhook dedupe store, so money idempotency never depends on data this job deletes. |
| Bookings, tickets, events, experiences, memberships | Firestore | Not touched by this job | — | Operational and financial records. Anonymising closed bookings is a future DPDP task, see §5. |
| Unredeemed **staff invite codes** | `staffInvites` (status `pending`) | Expiry (7 days) **+ 7-day grace** | Status becomes `expired` and `codeHash` is deleted. **The document is kept.** Audited `staff.invite-expired`. | During the grace period `listStaff` still shows the invite as "expired" and `reissueStaffCode` can revive it. After that the manager sends a new invite. |
| Unredeemed **organizer codes** | `organizerActivations` (status `issued`) | Expiry (14 days), no grace | Status becomes `expired` and `codeHash` is deleted. The document is kept. Audited `organizer.code-expired`. | `reissueOrganizerCode` works from any non-redeemed state, so a grace period gains nothing. Redeeming an expired code returns "This code has expired". |
| Rate-limit buckets | `rateLimits` | Until 1 h after the window ends | Deleted | Pure counters. A deleted bucket is only deleted after its window has closed, so no limit is weakened. |
| Idempotency receipts | `commandReceipts` | **30 days** | Deleted | Receipts only have to outlive the client retry horizon (seconds to minutes). Nothing else reads them. Payment and refund idempotency uses deterministic ids that are never deleted: `paymentId` is also the Razorpay `receipt`; refund ids are `cxl_{booking}`, `evc_{booking}`, `dup_{providerPayment}`, `orph_{payment}` and `req_{uid}_{requestId}` (so an organizer's refund request stays idempotent forever through the refund document itself); the refund id is the provider idempotency key; webhooks dedupe on `paymentEvents`. So the money-related receipts (`cancelBooking_…`, `decideRefund_…`, `decideSettlement_…`) don't need a longer period. A client that replays a requestId older than 30 days is treated as a new request. Every such command re-checks state (a cancelled booking can't be cancelled twice; a decided refund can't be decided twice), so a replay still can't double-apply. |
| **Read** notifications | `userNotifications` (`read == true`) | 180 days from creation | Deleted | Inbox hygiene. The underlying facts (booking, refund, decision) remain in their own records and in the audit trail. |
| **Unread** notifications | `userNotifications` | 365 days from creation | Deleted | A notice nobody opened in a year has no remaining value. We keep them twice as long as read ones so nobody loses a notice they haven't seen. |
| **KYC documents** of **rejected** organizer applicants | Storage `kyc/{uid}/…` | 180 days after the rejection decision (`decidedAt`) | Every object under the prefix is deleted. The application gets `kycPurgedAt` and `kycFilesDeleted`, and the purge is audited `retention.kyc-purged`. **Skipped while a legal hold on the user is active.** | DPDP s.8(7): erase once the purpose is served. The 180 days cover an appeal or complaint window. The application document (without files) and the governance decision stay as the record of the decision. |
| KYC documents of **approved** organizers | Storage | For the whole relationship | Not deleted by this job | Needed while the organizer trades. They must be purged on offboarding plus the statutory period, which needs an offboarding flow (§5). |
| Job summaries | `jobRuns` | Not deleted yet | — | One small doc per job per day. Add a 90-day TTL policy when volume warrants. |
| Legal holds | `legalHolds` | Not deleted | — | Evidence of why data was preserved. |

Storage rules keep `kyc/**` write-once with **no client delete**. Only the Admin SDK (this job) can delete files.

## 2. How the job behaves

Tasks run in this order, and each one is isolated, so one failing never stops the others:

1. `expireStaffInvites`
2. `expireOrganizerCodes`
3. `rateLimits`
4. `commandReceipts`
5. `notifications`
6. `kycDocuments`

Each task is:

- **Bounded.** It reads pages of 300 and handles at most 3,000 documents per task per run. The KYC purge examines at most 2,000 rejected applications per run. A larger backlog carries over to the next day, and the summary then shows `more: true`.
- **Idempotent.** It selects only rows that are still eligible. Code expiry re-checks each document inside its own transaction, so a concurrent redeem or re-issue always wins. A purged application is marked and skipped from then on. Running twice, or two runs overlapping, does nothing twice.
- **Summarised.** Each run writes `jobRuns/dataRetention_{YYYY-MM-DD}`: `runs` and `failures` counters, plus `lastStatus`, `lastSteps` (the counts per task), `lastErrors`, `lastStartedAt` and `lastDurationMs`. Admins and auditors can read it (rules).
- **Visible when it fails.** The job logs `job.failed` at ERROR, which feeds the `job_failures` metric in `OBSERVABILITY.md`. The function execution itself also fails. It is not retried automatically, because the next run is a day away and a retry would only repeat the same failure.

### Manual run

The job has no callable, on purpose. Run it from a trusted shell with Application Default Credentials for the project:

```sh
cd firebase/functions && npm run build
GCLOUD_PROJECT=<project> node -e "require('./lib/platform/retention').runRetention().then(s => console.log(JSON.stringify(s, null, 2)))"
```

You can also trigger it from Cloud Scheduler: find `firebase-schedule-runDataRetention-asia-south1` and click *Force run*.

## 3. Legal holds

A **legal hold** stops retention deletion for one subject while a dispute, chargeback, regulator or law-enforcement request, or litigation is open.

There was no hold concept anywhere before this: not in `docs/database`, `FIRESTORE_DATA_MODEL.md` or the rules. It now lives in `legalHolds/{subjectType}_{subjectId}`:

| Field | Meaning |
| --- | --- |
| `subjectType` | `"user"`. This is the only type today, because the only evidence-grade data retention deletes (KYC files) is per user. Add a type only together with the retention task that honours it. |
| `subjectId` | The Firebase uid |
| `status` | `active` or `released` |
| `reason` | 10–1000 characters, required |
| `reference` | Optional: a ticket, notice or case number |
| `placedBy`, `placedAt` | Who placed the hold, and when |
| `releasedBy`, `releasedAt`, `releaseReason` | Who released the hold, when, and why |
| `version` | Increments on every change |

- **Place or release** with the `setLegalHold` callable (asia-south1, platform-owner / super-admin): `{ requestId, subjectType: "user", subjectId, action: "place"|"release", reason, reference? }`.
  - It is idempotent per requestId.
  - Placing a hold that is already active is `CONFLICT`. Releasing one that isn't active is `PRECONDITION`.
  - Every change is audited (`legal-hold.placed` / `legal-hold.released`), and that audit trail is the full history.
- **Effect:** while the hold is active, `kycDocuments` skips the user and counts them in `held`. The purge happens on the first run after release.
- **Holds never block** code expiry, rate-limit clean-up, receipt clean-up or notification clean-up. None of that is evidence: the facts live in the audit trail and the financial records, which are never deleted.
- **Console:** there is no screen yet. Until one exists, an operator calls the callable from the console's authenticated context, or an engineer runs it from a shell with admin claims.

## 4. Firestore indexes this job needs

The emulator doesn't enforce indexes, so these must be deployed before the first production run. A missing index makes that task fail visibly, and the other tasks still run.

- `staffInvites` (`status` ASC, `expiresAt` ASC)
- `organizerActivations` (`status` ASC, `expiresAt` ASC)
- `organizerApplications` (`status` ASC, `decidedAt` ASC)
- `userNotifications` (`read` ASC, `createdAt` ASC)

These queries use automatic single-field indexes and need no composite index:

- `rateLimits.expiresAt`
- `commandReceipts.createdAt` and `commandReceipts.at`
- `userNotifications.createdAt`

**Optional:** configure Firestore TTL policies on `rateLimits.expiresAt` as a second line of defence. The job stays authoritative, because TTL deletion can lag by up to 72 h.

## 5. Not covered yet (tracked)

- **DPDP erasure on request:** account deletion that anonymises bookings and reviews, and deletes the profile, safety and avatar data. It needs a product flow and a legal decision on what financial records must keep.
- **Offboarding purge** of approved organizers' KYC documents.
- **Abandoned applications** (`changes-requested` and never resubmitted): KYC documents are kept until legal sets a period.
- **Evidence attachments** for disputes and incidents: no Storage layout exists yet (`FIRESTORE_DATA_MODEL.md` §6, "Mission 22"). When one is added, add a hold `subjectType` that covers it.
- **Avatars** of deleted accounts: these depend on account deletion.
