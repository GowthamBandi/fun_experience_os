# Experience OS: architecture (authoritative)

**Status:** current as of 2026-09-30.
**Sources of truth:** ADR-0001 to ADR-0006, `docs/API_CONTRACT.md`, `firebase/firestore/firestore.rules`, `firebase/storage/storage.rules`, `firebase/functions/src/**`.

Documents marked **OBSOLETE** describe earlier models; ignore them for current behaviour.

## 1. System

```
 PULSE (Flutter, one app)              Operations Console (Next.js)
 customers · organizers · staff        Super Admins · auditors
   phone + OTP (Firebase Auth)           email + password + custom claims
          │  callables (asia-south1)          │  callables (us-central1 legacy, asia-south1 new)
          ▼                                    ▼
 ┌──────────────────────── Firebase project (per environment) ─────────────────────────┐
 │ Cloud Functions: identity · catalog · commerce · governance · schedules · webhooks   │
 │ Firestore (rules: least privilege, no client writes of authority)                    │
 │ Storage (KYC private, org media, avatars)                                            │
 │ Auth (phone for PULSE, email for console)       App Check on every callable          │
 └──────────────────────────────────────────────────────────────────────────────────────┘
          │                                   ▲
          ▼ orders / refunds                   │ signed webhooks
                          Razorpay (payments, refunds; Route for payouts)
```

## 2. Who owns what

| Capability | Owner | Where |
| --- | --- | --- |
| Discover, book, pay, attend, review | Customer | PULSE |
| Create experiences, schedule events, publish (after approval), staff, event day (check-in, teams, safety), earnings | Organizer (owner + permitted staff) | PULSE → Organizer Command Center |
| Approve organizers, experiences, events; risk; refund exceptions; settlements; commercials; policy; audit; emergency cancellation | Super Admin | Operations Console |
| Capacity, money, tickets, permissions, reviews | **Server only** | Cloud Functions |

## 3. Identity and access (ADR-0004)

- **One identity per person.** Phone + OTP in PULSE.
- **Profile completion** is required before booking:
  - public online name and bio;
  - private birth date and gender, used for eligibility only and never shown.
- **Organizer:**
  1. apply;
  2. an `organizer-kyc` case is created;
  3. Super Admin approves;
  4. a one-time **Organizer Code** is issued (only its hash is stored);
  5. the organizer redeems it in PULSE, which creates an owner membership.
- **Staff:**
  1. an owner or manager invites a phone with permissions (WHAT) and event scope (WHERE);
  2. a one-time **Staff Access Code** is issued;
  3. the staff member signs in with that phone and redeems the code, which creates a staff membership.
  4. Without the code, the person stays a customer.
- **Authority is read live from `memberships` on every privileged request**, in both callables and rules. Revocation is immediate, and audit history is kept.
- **Console operators** use custom claims `roleId ∈ {platform-owner, super-admin, auditor}`, set only by `setOperatorAccess` (platform-owner). Email must be verified.

## 4. Data model (ADR-0003)

`organizer → experience → event (bookable) → booking → ticket`, with payments, refunds, the ledger and settlements hanging off bookings and organizers. Reviews are keyed by event and participant.

## 5. Lifecycles

### Organizer
`application: draft → submitted → under-review → approved | changes-requested | rejected`

- On approval, the Organizer Code is issued (14-day expiry, re-issuable).
- Redeeming it creates `organizers/{orgId}` (active), `publicOrganizers/{orgId}` and the owner membership.
- The organizer state machine is `active ⇄ paused → blocked`, via `setMarketplaceEntityStatus`.
- Pausing or blocking stops new publishing and booking. Existing events need an admin decision: cancel or allow completion.

### Staff
`invite (code, 7 days) → active → revoked`

- Invites can be re-issued (the old code dies).
- Revoking is refused while the member is the primary responsible person for a live or published event (the responsibility invariant).

### Experience
`draft → submitted → approved | changes-requested | rejected → archived`

Editing an approved experience creates a new revision draft. The approved version stays live until the revision is approved.

### Event (session)
`draft → submitted → approved → published → booking-closed → live → completed`, plus `cancelled`.

**Publishing requires all of:**
- event approved;
- experience approved;
- organizer active;
- an approved commercial agreement (its commission is snapshotted onto the event);
- a valid primary responsible person (active, with `events.operate`);
- a future start.

Changing time, venue or price after bookings exist is refused; cancel and recreate instead.

### Booking (ADR-0002, ADR-0005)
`held (15 min) → confirmed → completed`, or `held → expired`, or `held/confirmed → cancelled`.

- `reserveSeat` checks eligibility, one live booking per person per event, and capacity, all in one transaction.
- Expired holds are released by `releaseExpiredHolds` (every 5 minutes).

### Payment
1. `createPaymentOrder` takes the amount from the booking.
2. Razorpay Checkout runs.
3. The payment is confirmed only by server signature verification (`confirmPayment`) or the signed webhook. Both paths are idempotent and deduplicated by provider event id.
4. **A late capture after the hold expired:** the booking is re-admitted if capacity remains. Otherwise it becomes `payment-orphaned` and is fully refunded automatically.

### Ticket
One ticket per spot. The QR payload is `PX1.<ticketId>.<HMAC>`.
- The scan verifies the signature, then the event, then the scanner's permission and scope, then atomically moves `valid → used`.
- Scan outcomes: `checked-in`, `already-used`, `cancelled`, `refunded`, `expired`, `wrong-event`, `invalid`.

### Refund
1. **Customer cancellation.** The policy quote is computed server-side. Within policy it is auto-approved and sent to the provider as `processing`; the webhook moves it to `completed`.
2. **Event cancellation.** 100% refunds for every attendee.
3. **Discretionary refunds** are requested by an organizer and decided by an admin, with dual control above ₹10,000.

### Ledger and settlement
- **The ledger is append-only and every transaction balances.**
  - A capture credits commission and organizer-payable.
  - A refund reverses the capture proportionally.
- **Settlements** aggregate the unsettled organizer-payable of completed events:
  `pending-approval → approved → paid | held`, with dual control above ₹50,000.
- **Payout execution** (Razorpay Route) is recorded through `mark-paid` with a payout reference.

### Review
- **Who may review:** only a holder of a *used* ticket, after the event ends, within 30 days.
- **Limits:** one review per person per event; editable within the window.
- **Content rules:** no links or phone numbers.
- **Integrity:** organizer members can't review their own events. Aggregates are maintained transactionally.
- **Moderation:** by admins (hide or publish), audited.

### Notifications
- The server writes `userNotifications/{kind:entity:recipient}`. The id is the dedupe key, so replays never notify twice.
- PULSE shows the in-app inbox live.
- Push goes through FCM once device tokens and APNs/FCM credentials are configured. This is an external activation step.

## 6. Security model
- **Clients never write authority.** Rules deny every write except profile whitelist fields and the notification `read` flag.
- **Every mutating callable** carries a `requestId` (idempotency via `commandReceipts`, bound to action and actor), runs in a transaction, writes an audit event and returns a business-language error.
- **Secrets** (`CODE_PEPPER`, `TICKET_SIGNING_KEY`, `RAZORPAY_*`) live in Secret Manager. A missing secret **fails closed** outside the emulator.
- **Rate limits (Firestore-backed):** code redemption (5 per hour per uid, with every failure audited), booking attempts, reviews and scans.
- **App Check** is enforced on callables outside the emulator.
- **Privacy:**
  - bookings and tickets carry only an alias and uid;
  - organizers never read `customerSafety`;
  - QR payloads live in `ticketSecrets` and only the holder can read them;
  - phones are masked in staff lists.

## 7. Environments
See `docs/runbooks/ENVIRONMENTS_AND_DEPLOYMENT.md`.

| Environment | Firebase project | PULSE build |
| --- | --- | --- |
| demo | none | `PULSE_ENV=demo` |
| emulator | `demo-experience-os` (emulators only) | `PULSE_ENV=emulator` |
| staging | a project whose id contains `staging`, `dev` or `test` | `PULSE_ENV=staging` + dart-defines |
| production | the production project (not yet created) | `PULSE_ENV=production` + dart-defines |

PULSE refuses a production build that points at a demo or staging-looking project, and vice versa. The console refuses `demo-*` projects in production builds.
