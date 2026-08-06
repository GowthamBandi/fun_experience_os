# Founder's Super Admin Walkthrough Guide

Welcome to the **Experience OS Super Admin Console**. This guide provides a step-by-step walkthrough of the complete operational journey, from setting up franchises and venues to scheduling sessions, managing participant anonymity, and running live operations on the floor.

---

## Part 1 — Starting Point & Navigation

### 1. Launching the App
- **Console URL**: `http://localhost:3100` (development server) or `http://localhost:3000` (production port).
- **Authentication Bypass / Direct Entrance**: On the login page (`/login`), click the avatar button titled **"Platform Owner"** at the bottom of the page, enter `password` in the password field, and click **Enter**.
- **OTP Verification**: Enter the demo code `123456` in the verification screen (`/otp`) to unlock full access.

### 2. Homepage & Command Center
Upon login, you land on the **Command Dashboard** (`/`). This homepage serves as the central operations room for the active territory:
- **Territory Switcher**: Located in the upper right. Click to toggle your operating region (e.g. *Hyderabad Central*, *Bengaluru South*, or *Mumbai West*). All dashboard metrics, active sessions, and queues will dynamically refresh based on the selected territory.
- **Real-Time Signals & Alerts**: Shows operational warnings such as overbookings, coordinator shortages, or safety incidents.

### 3. Primary Navigation Sections (Sidebar)
- **Missions** (`/missions`): The scheduling grid and active session manager.
- **Bookings** (`/bookings`): Reservation details, waitlists, and guest list checks.
- **Safety & Disputes** (`/safety`): Central log for safety incidents, player disputes, and moderation actions.
- **People** (`/people`): Active participant lists showing temporary random IDs and active restrictions.
- **Money** (`/money`): Ledgers, payment reconciliation, and refund authorizations.
- **Tournaments** (`/tournaments`): Knockout brackets, referee assignments, and score validations.
- **Locations** (`/locations`): Master configuration desk for franchises, territories, cities, venues, and playing areas.
- **Catalog** (`/catalog`): Price books, activity categories, and experience templates.

---

## Part 2 — Create Operating Structure Sequence

To open a new territory, follow this sequence:

### Step 1: Create Franchise
- **Route**: `/franchises`
- **Action Button**: Click **"Create Franchise"** in the top right.
- **Fields to Fill**:
  - *Name*: `Kerala South`
  - *Short Code*: `KER`
  - *Business Head*: `Dev Patel` (Select from dropdown)
- **Result & Next Step**: Clicking "Save" records the franchise, appends an audit log, and redirects you back to `/franchises` where the card appears. The next step is creating a territory.

### Step 2: Create Territory
- **Route**: `/territories`
- **Action Button**: Click **"Create Territory"** in the top right.
- **Fields to Fill**:
  - *Name*: `Kochi Central`
  - *Short Code*: `KOC`
  - *Parent Franchise*: `Kerala South` (Select from dropdown)
- **Result & Next Step**: The territory is registered, and is immediately available in the top-right switcher. The next step is adding cities.

### Step 3: Create City
- **Route**: `/territories/[id]` (Click Kochi Central in the territory list)
- **Action Button**: Click **"Add City"** under the Cities panel.
- **Fields to Fill**:
  - *Name*: `Kochi`
  - *State/Region*: `Kerala`
- **Result & Next Step**: Creates a city nested in Kochi Central. The next step is venue setup.

### Step 4: Create Venue
- **Route**: `/locations/venues`
- **Action Button**: Click **"Create Venue"** in the top right.
- **Fields to Fill**:
  - *Name*: `Arena Sports Hub`
  - *City*: `Kochi` (Select from dropdown)
  - *Safety Capacity Limit*: `150`
- **Result & Next Step**: The venue is recorded. Click it to view details and proceed to adding playing areas.

### Step 5: Add Playing Area
- **Route**: `/locations/venues/[id]` (Click Arena Sports Hub in the list)
- **Action Button**: Click **"Add Playing Area"** in the top right.
- **Fields to Fill**:
  - *Name*: `Court 1`
  - *Physical Capacity*: `30`
  - *Compatible Activities*: Check `Badminton`
- **Result**: Court 1 is registered under Arena Sports Hub, enabling sessions to be scheduled on it.

---

## Part 3 — Defining the Experience Catalog

Before scheduling events, you must define the activity categories and rules.

### 1. Create Activity Category
- **Route**: `/catalog/categories`
- **Action**: Click **"New Category"** in the top right.
- **Fields**: Name: `Badminton` | Type: `sports` | Icon: Select racket.
- **Result**: Saves as `draft`. Click the category and select **"Activate"** to make it available for templates.

### 2. Create Experience Template
- **Route**: `/catalog/experiences`
- **Action**: Click **"Create Template"** in the top right.
- **Fields**:
  - *Title*: `Saturday Mystery Badminton`
  - *Category*: `Badminton`
  - *Capacity Details*: Min: `8` | Max: `20`
  - *Price*: `₹499`
  - *Duration*: `90 minutes`
  - *Gender Format*: `Mixed`
  - *Staffing Requirement*: `1 Lead Coordinator, 1 Floor Crew`
  - *Reveal Timing*: `60 minutes before start`
- **Result**: Saves as draft. Under compatibility, check **"Arena Sports Hub"** and click **"Publish"** to make it schedulable.

---

## Part 4 — Scheduling a Session

- **Route**: `/missions`
- **Action**: Click **"Schedule Session"** in the top right.
- **Wizard Sequence**:
  - *Template*: Select `Saturday Mystery Badminton`
  - *Location*: Select Territory: `Kochi Central` | Venue: `Arena Sports Hub` | Playing Area: `Court 1`
  - *Time Slot*: Saturday, `19:00` (7:00 PM)
  - *Settings*: Enforce Max Capacity `20` and Price `₹499`.
  - *Staffing*: Assign coordinator (e.g. `Aisha Khan`).
- **Review & Launch**: Save the draft, then click **"Open Bookings"** to publish the session to customers.

---

## Part 5 — Capacity, Slots & Joined Counts

Open any active session workspace (e.g. `/missions/[id]/bookings`). The page displays a **dynamic capacity engine dashboard**:
- **Maximum capacity**: The absolute limit allowed on the playing area (e.g. 20).
- **Sellable capacity**: Current slot target set by the operations manager.
- **Remaining slots**: Dynamically calculated as:
  $$\text{Remaining} = \text{Sellable Capacity} - (\text{Confirmed Bookings} + \text{Active Holds})$$
- **Waitlist count**: Number of customers queuing if the session is `FULL`.
- **Fill rate & Break-even**: Real-time business intelligence comparing current ticket revenue to staffing/venue overhead.

> [!IMPORTANT]
> **Participant Anonymity**: Real names, contact numbers, and emails are never exposed on this workspace. Operators only see randomized codes (e.g., `MX-74` or `B-902`) to maintain trust and protect participant privacy.

---

## Part 6 — Running the Operational Sequence

On game day, go to the session check-in desk at `/missions/[id]/check-in` and perform this exact sequence:

1. **Generate Temporary IDs**: Click **"Generate IDs"** to issue random participant codes.
2. **Allocate Teams**: Under the Teams tab, click **"The Formation"** to allocate players randomly.
3. **Lock Teams**: Review balance and click **"Lock Teams"** to prevent further changes.
4. **Trigger Reveal**: Click **"Trigger Reveal"** to push match info and team sheets to the participant apps.
5. **Open Check-In**: Turn on the simulated QR scanner. When players arrive, search by their temporary ID and click **"Mark Checked In"** (changes status to `checked-in` or `late`).
6. **Handover to Live**: Once all expected players check in, click **"Ready for Handover"**.
7. **Open Live Ops**: Go to the live terminal page (`/missions/[id]/live`).
8. **Start clock**: Click **"Start Live Session"** to start the runtime match timer.
9. **Log results**: Record score results or outcome confirmations under the Results tab.
10. **End session**: Click **"End Live Session"** once all brackets/matches finish.
11. **Close checklist**: Complete the venue exit audit and click **"Verify & Close"** to archive the session.

---

## Part 7 — Booking & Money Usability Workspace

Manage all reservations, waiting lists, payments, refunds, and financial checks through operator-friendly workspaces:

1. **Bookings Command Center (`/bookings`)**: Real-time view of who joined, who paid, who is waiting, and what needs attention.
2. **Add Booking (`/bookings/new`)**: 5-step wizard to add someone to an event or place them on the waiting list with automatic capacity checks.
3. **Booking Details (`/bookings/[id]`)**: Comprehensive view with visual timeline (`Created` → `Waiting for Payment` → `Payment Received` → `Confirmed` → `Checked In`), payment countdowns, space impact, and cancellation controls.
4. **Event Bookings (`/missions/[id]/bookings`)**: Session-scoped booking view grouped into *Confirmed*, *Waiting for Payment*, *Payment Problems*, *Free Passes*, and *Waiting List*.
5. **Waiting List (`/missions/[id]/waitlist`)**: Sequential queue for full events with one-click *Offer Space*, 10-minute hold countdowns, and *Accept Offer* actions.
6. **Money & Payments (`/money`, `/money/payments`)**: Financial dashboard tracking gross collected, pending revenue, refunds, net revenue, and payment settlement ledgers.
7. **Refunds (`/money/refunds`)**: Task-card workspace for reviewing refund requests with role-gated finance authorization.
8. **Payment Check (`/money/reconciliation`)**: Mismatch audit center flagging unconfirmed paid bookings or unpaid confirmed bookings with plain-English explanations and one-click resolutions.

