# Experience OS Console — User Guide

This guide covers how to start the Super Admin console, sign in, and use each part of it. It applies from 2026-09-29.

## 1. Start it

```bash
cd apps/operations-web
npm install
npm run dev            # http://localhost:3000
```

For a faster, production-like build use `npm run build && npm start`.

With no configuration the console runs as a **local workspace**:

- All data is saved in this browser automatically after every change.
- Nothing needs a server.

To run with Firebase instead, see `apps/operations-web/.env.example` and `firebase/README.md`.

## 2. Sign in

Open `/login` and choose your operator profile. Your role decides which modules you see, and every action you take is recorded under your name.

To add colleagues, change their role or suspend them, a Platform Owner or Super Admin uses **Control → Access**.

## 3. First run

You can work in either of two ways:

- **Try it with sample data.** The console starts with realistic sample data for Hyderabad, Bengaluru and Mumbai.
- **Start for real.** Go to **Control → Workspace & backups → Start fresh (empty)** and type CONFIRM. Then follow **Operations → Setup**, which walks you through eight steps:
  1. Franchise
  2. Territory
  3. City
  4. Venue
  5. Playing area
  6. Category
  7. Experience
  8. Session

## 4. Daily work by module

| Module | What you do there |
|---|---|
| **Overview** | See today's decisions, sessions, alerts, money and recent activity for the selected territory (switch territory in the sidebar). |
| **Approvals** | Decide organizer KYC, arena and event reviews, commission proposals, fraud alerts, refund exceptions and settlement releases. Reject and "request information" need a reason. |
| **Organizers / Arenas / Events** | Record new applications and submissions (each opens a review case). Pause, block or reactivate them, with a reason. |
| **Sessions** | Each session has one workspace with tabs, in this order: Overview → Bookings → Waitlist → Money → Codes → Teams → Reveal → Check-in → Run → Results → Finish → Report. The Overview tab always shows the next step. |
| **Bookings** | Reserve seats. Unpaid holds release automatically after 15 minutes. Record a payment with its method and reference. Manage the waitlist; a freed seat is offered to the next person automatically. |
| **Money** | Refunds go through three stages: requested → approved (Finance) → paid out (with a reference). Reconciliation lists records that don't match and says what to do next. |
| **Staffing / People** | Add staff and assign them to sessions (overlapping sessions are refused). Check staff in, and mark someone absent with a reason. |
| **Safety & disputes** | Report and triage incidents against response deadlines, decide disputes (upheld, partially upheld or rejected), propose and approve moderation actions, and handle refund exceptions. |
| **Tournaments** | Build single-elimination brackets, assign referees, record results. Results need a second person to verify them before the winner advances. |
| **Analytics** | Revenue, bookings, fill rate, no-shows and incidents by date range, with CSV export. |
| **Audit & records** | The permanent history. It has four tabs: activity record, governance decisions, operations log and privileged access. Everything can be searched, filtered and exported to CSV. |

**Search:** press ⌘K (or Ctrl K) anywhere to jump to a page, session, booking, organizer or staff member.

## 5. Keep your data safe

- The top bar shows **Saved on this device** after each change.
- Export a backup regularly from **Workspace & backups → Export backup**. Keep the file somewhere safe; it contains every record, including the activity record.
- To move to another computer, export a backup there and restore it on the new one with **Restore from backup**.
- Clearing the browser's site data deletes the local workspace. Export a backup first.

## 6. What is not connected yet

- **Payment provider.** Payments and payouts are recorded manually with the reference from your bank, UPI or POS statement.
- **SMS, camera scanning and the participant app.** At the door, type the participant's code or booking reference. The customer mobile app is not built yet, so share codes with participants yourself.
- **Shared team use.** A Firebase project must be created. Until then, each browser has its own workspace.
