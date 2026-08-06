# Booking Workspace Operator Guide

Welcome to the **Booking Workspace** in Experience OS! This guide explains how to manage bookings, payments, waitlists, refunds, and financial checks using simple, non-technical terminology.

---

## 1. Bookings Overview (`/bookings`)
**Primary Question:** *"Who needs my attention?"*

The main **Bookings** page provides a real-time command center for all participant reservations.

### Top Summary Cards
- **Total Joined**: Total participants with an active booking (confirmed or waiting for payment).
- **Confirmed**: Participants who have completed payment and secured their spot.
- **Waiting for Payment**: Participants who started booking but haven't completed payment yet.
- **Payment Problems**: Reservations where payment failed or couldn't be processed.
- **Waiting List**: People waiting for an available space in a full event.
- **Free Passes**: Complimentary entries issued by operators or managers.
- **Spaces Left**: Total open capacity available across active events.
- **Collected**: Total revenue collected from confirmed bookings today.

### Quick Actions
- **Add Booking**: Click **+ Add Booking** to reserve a space or add a participant to the waiting list.
- **Mark as Paid**: Manually confirm payment received from a participant.
- **Retry Payment**: Re-attempt or fix a failed payment record.
- **Offer Next Space**: Offer an open space to the next person on the waiting list.

---

## 2. Adding a Booking (`/bookings/new`)
**Primary Question:** *"How do I add someone to an event?"*

Use the 5-step **Add Booking** wizard:

1. **Choose Event**: Select an active event from the list. View event date, time, venue, price, spaces left, and fill rate.
2. **Check Spaces**: Review available spaces vs. confirmed bookings. If the event is full, the system automatically prompts to add the participant to the **Waiting List**.
3. **Add Participant**: Enter the participant's name/alias and select the booking type (*Customer Booking*, *Staff Added Booking*, or *Free Pass*).
4. **Choose Payment**: Select payment method (*Mark as Paid*, *Waiting for Payment*, or *Free Pass*).
5. **Confirm**: Review the summary and click **Confirm Booking**.

---

## 3. Booking Details (`/bookings/[id]`)
**Primary Question:** *"What is happening with this booking?"*

The **Booking Details** page gives full visibility into an individual reservation:

### Visual Timeline
Shows the lifecycle of the booking:
`Booking Created` → `Waiting for Payment` → `Payment Received` → `Booking Confirmed` → `Checked In` → `Completed`

### Key Highlights
- **Space Impact**: Clearly states whether the booking currently occupies an event space.
- **Payment Countdown**: Displays time remaining for pending holds before the space is released back to the event.
- **Advanced Actions**: Collapse/expand panel for manual actions (*Mark Payment Problem*, *Expire Now*, *Cancel Booking*, *Request Refund*).
- **Cancel Booking Modal**: Safely cancel a booking with clear explanations of space release, refund creation, and waitlist effects.

---

## 4. Event Bookings (`/missions/[id]/bookings`)
**Primary Question:** *"How full is this event?"*

Scope your view to a single event's bookings:
- **Visual Capacity Bar**: Shows total spaces, confirmed seats, holds, and open spots.
- **Revenue Breakdown**: View collected revenue alongside pending and failed amounts.
- **Status Groups**: Grouped clearly by *Confirmed*, *Waiting for Payment*, *Payment Problems*, *Free Passes*, and *Waiting List*.

---

## 5. Waiting List (`/missions/[id]/waitlist`)
**Primary Question:** *"Who gets the next available space?"*

Manage the queue of participants waiting for full events:
- **Sequential Queue**: Displays participants in exact order of joining.
- **Offer Space**: Holds an available space for 10 minutes and sends an offer notification.
- **Accept Offer**: Confirms the participant's spot once accepted.
- **Expire Offer**: Releases the held space to the next person if time expires.

---

## 6. Money Overview (`/money`)
**Primary Question:** *"How much was collected, refunded, and still needs attention?"*

The financial dashboard tracks top-level financial health:
- **Collected & Net Revenue**: Total money received minus completed refunds.
- **Pending Revenue**: Funds currently in transit or waiting for settlement.
- **Operator Priority Hints**: Highlights active priorities (e.g. pending refund requests or payment mismatches).
- **Quick Links**: Direct access to **Payments**, **Refunds**, and **Payment Check**.

---

## 7. Payments (`/money/payments`)
**Primary Question:** *"Who has not paid or has a payment problem?"*

Track payment settlement records:
- **Settlement States**: *Waiting*, *Paid*, *Problem*, or *Verified*.
- **Actions**: Mark pending payments as paid or record payment problems.

---

## 8. Refunds (`/money/refunds`)
**Primary Question:** *"Which refunds need review?"*

Process returns and exceptions safely:
- **Task Cards**: View requested amount, event name, request timestamp, and reason.
- **Finance Role Gate**: Restricts approval/rejection actions to authorized finance personnel with clear visual tooltips.

---

## 9. Payment Check / Reconciliation (`/money/reconciliation`)
**Primary Question:** *"Which bookings and payments do not match?"*

Automatic audit detection for financial discrepancies:
- **Issue Cards**: Plain-language explanations of mismatches (e.g., *"Payment received but booking not confirmed"* or *"Booking confirmed but payment missing"*).
- **One-Click Resolutions**: Directly resolve discrepancies or jump to the affected booking record.
