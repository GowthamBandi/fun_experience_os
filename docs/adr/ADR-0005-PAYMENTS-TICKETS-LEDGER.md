# ADR-0005: Payments (Razorpay), signed tickets, and the money ledger

- **Status:** Accepted
- **Date:** 2026-09-30
- **Resolves:** BLOCKER-007 architecture (provider choice).
- **Still requires external activation:** merchant account, KYC, API keys, webhook secret.

## Payment provider
**Razorpay**, chosen for the Indian marketplace model:
- UPI, cards and netbanking;
- first-class order + webhook model;
- **Route** for marketplace split settlements to organizer linked accounts later.

No credentials exist in this repository or environment, and none are fabricated. The code integrates against a `PaymentProvider` interface:
- `RazorpayProvider` makes real REST calls (orders, refunds) with keys from Firebase secrets `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET`.
- `EmulatorProvider` is selected **only** when `FUNCTIONS_EMULATOR === "true"`. It fabricates provider ids locally so the full lifecycle is testable. In production the emulator provider cannot be selected.

## Booking → payment → ticket
1. `reserveSeat` (callable) runs a transaction:
   - eligibility (age and gender from `customerSafety`);
   - one live booking per customer per event;
   - capacity (ADR-0002);
   - it writes a `held` booking with `holdExpiresAt = now + 15 min`.
2. `createPaymentOrder(bookingId)` creates the provider order.
   - It is idempotent: one open order per booking.
   - `payments/{id}` is written as `created`, with `amountMinor` taken from the event price. **The client never supplies an amount.**
3. Payment is confirmed **only** by the server:
   - by `razorpayWebhook` (HTTP): verify the `X-Razorpay-Signature` HMAC over the raw body, dedupe by event id into `paymentEvents`, and handle `payment.captured`, `payment.failed` and `refund.processed`;
   - or by `confirmPayment`: the client hands over `razorpay_order_id`, `razorpay_payment_id` and `razorpay_signature`, and the server verifies the HMAC over `order_id|payment_id` with the key secret.

   Both paths call the same idempotent `settleCapturedPayment()`, which runs one transaction:
   - payment `captured`;
   - booking `confirmed` (the hold counter becomes a confirmed counter);
   - one ticket per spot;
   - ledger entries;
   - a notification.

   A capture that arrives after the hold expired and the spot was released:
   - re-admits the booking if capacity allows;
   - otherwise marks it `payment-orphaned` and auto-issues a full refund. A customer is never charged without a seat.
4. **Hold expiry.** The scheduled function `releaseExpiredHolds` runs every 5 minutes and expires `held` bookings past `holdExpiresAt` in transactions, releasing capacity. `reserveSeat` also lazily ignores expired holds when checking the one-booking rule.

## Tickets and QR
- Each ticket gets a random `ticketId` (a 20-character Firestore id).
- The QR payload is `PX1.<ticketId>.<sig>`, where `sig = base64url(HMAC-SHA256(TICKET_SIGNING_KEY, "PX1|ticketId|eventId|bookingId"))`, truncated to 22 characters (128 bits).
- The payload contains no personal data. A forged or altered ticket fails verification without any database read.
- `scanTicket(eventId, payload)` does the following:
  - verifies the signature;
  - checks that the ticket's event equals the scanned event;
  - requires the scanner to have `tickets.scan` scoped to that event;
  - then, in a transaction, changes `valid → used` (with `checkedInAt`, `checkedInBy` and `scanRequestId`).
- A second scan returns `already-used` with the first check-in time. It is not an error and never double-counts.
- An offline retry with the same `scanRequestId` is idempotent.
- Results returned: `checked-in`, `already-used`, `cancelled`, `refunded`, `expired`, `wrong-event`, `invalid`. A scanner without `tickets.scan` for the event gets a `NOT_PERMITTED` error rather than a result.
- `checkInManually(eventId, ticketId, reason)` is the fallback when a QR can't be scanned. It needs the same `tickets.scan` permission, shares the scanner's rate limit, requires a 10–300 character reason, returns the same results, and is audited as `ticket.checked-in-manually`.

## Ledger
- `ledgerEntries` is append-only. Each money movement writes balanced entries in integer minor units, all sharing a `txnId`.

| Event | Entries |
| --- | --- |
| Capture | `DR customer_payments` / `CR platform_commission` (commission) + `CR organizer_payable:{orgId}` (remainder) |
| Refund | Reverses proportionally: `DR organizer_payable` + `DR platform_commission` / `CR customer_refunds` |

- **Commission:**
  - comes from the organizer's approved `commercialAgreements` (`commissionBps`);
  - it is captured on the payment document at capture time, so later agreement changes never rewrite history;
  - **with no approved agreement, publishing is refused**, because no money should move without agreed terms;
  - agreements are versioned: one admin proposes (`proposeCommercialAgreement`) and a **different** admin approves (`decideCommercialAgreement`); approval supersedes the organizer's previous approved version in the same transaction, so there is only ever one approved version per organizer.
- **Rounding:** commission = `floor(amountMinor × bps / 10000)`, and the organizer receives the remainder, so every paisa is accounted for.
- **Settlements:** `buildSettlement(orgId, periodEnd)` (admin) aggregates unsettled `organizer_payable` entries of **completed** events into a settlement, marking those entries with `settlementId`. Approval and marking as paid need **two different admins** above ₹50,000 (dual control). Payout execution via Razorpay Route needs the Route activation, which is an external blocker.

## Refunds
- **Customer cancellation.** `cancelBooking` computes the refund from the event's cancellation policy (the same presets PULSE shows).
  - Within policy, the refund is `approved` automatically and processed immediately through the provider.
  - Outside the policy window the customer can still cancel, but the quote is 0% and no refund is issued (the booking records `outside-policy:<policy>`).
  - Exceptions go through the organizer's `requestRefund`, which creates an `under-review` refund for an admin to decide.
- **Organizer or admin cancelling an event:** 100% refunds for all confirmed bookings, as a batch.
- **Organizer-requested discretionary refunds** (`refunds.request`) create an `under-review` refund that needs an admin decision. Organizers can never approve refunds.
- The provider is called with an idempotency key equal to `refundId`. `refund.processed` webhooks complete it.
