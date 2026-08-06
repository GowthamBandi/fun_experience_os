# Founder's Usability Gaps Report

During our comprehensive walkthrough of the Super Admin Command Center, we identified the following usability gaps. These areas represent points of friction where a founder or operator might experience confusion or delay.

---

### Gap 1: Overwhelming Navigation List
- **Route**: Sidebar Navigation (All screens)
- **Problem**: The navigation panel has grown to 12+ top-level modules with similar terminology (e.g. *Locations* vs *Territories*, *Missions* vs *Catalog*).
- **Why it is confusing**: A new operator cannot easily map the sequence of steps needed to build their operating structure.
- **Recommended Improvement**: Group navigation into collapsible sections: "Operating Structure" (Franchises, Territories, Cities, Venues), "Catalog & Offers" (Categories, Templates, Pricing), and "Active Operations" (Missions, Bookings, Safety, Money).
- **Severity**: Medium
- **Belongs in SA-P2I**: Yes (High-priority grouping change)

---

### Gap 2: Hidden City & Playing Area Creation
- **Route**: `/locations`
- **Problem**: Creating a new City or Playing Area is not accessible from the global `/locations` page.
- **Why it is confusing**: An operator goes to "/locations", sees Venues, but must go to a specific Territory detail page to add a City, and a specific Venue detail page to add a Playing Area.
- **Recommended Improvement**: Add "Quick Create" actions directly on `/locations` or in the command palette (`Ctrl+K`) that let operators create Cities or Playing Areas by selecting their parent Territory/Venue inline.
- **Severity**: High
- **Belongs in SA-P2I**: Yes

---

### Gap 3: Missing Onboarding/Empty-State Assistance
- **Route**: `/tournaments` & `/safety`
- **Problem**: The pages render an empty box saying "No active brackets tonight" or "No safety records logged."
- **Why it is confusing**: The founder doesn't know how to populate these pages, or that they are driven by active session states.
- **Recommended Improvement**: Add explicit "Onboarding guidance" buttons and helper links (e.g. *"To list brackets here, create a tournament in Hyderabad Central or launch the 'Tournament Day' scenario."*)
- **Severity**: Low
- **Belongs in SA-P2I**: Yes

---

### Gap 4: Role Simulator Lane Distinction
- **Route**: `/login` & `/safety`
- **Problem**: The active role switcher operates immediately, but the rest of the workspace doesn't make it clear when an action is disabled due to role restrictions until you click it and see an error or alert.
- **Why it is confusing**: Operators might spend time attempting to fill fields only to find the action blocked by authority gates (e.g. Finance role needed for refund exceptions).
- **Recommended Improvement**: Disable restricted buttons and show a lock icon with a tooltip explaining which role is required (e.g., *"Requires Finance Manager"*).
- **Severity**: High
- **Belongs in SA-P2I**: Yes

---

### Gap 5: Confusion Between "Missions" and "Sessions"
- **Route**: `/missions` & Sidebar
- **Problem**: The sidebar says **"Missions"**, but the header and sub-menus reference **"Live Sessions"** and **"Scheduled Sessions"**.
- **Why it is confusing**: "Missions" is a high-concept thematic term; "Sessions" is an operational term. The mix creates semantic drift.
- **Recommended Improvement**: Standardize the vocabulary. Either rename the module to "Sessions" or consistently use "Mission Operations" across all headers.
- **Severity**: Medium
- **Belongs in SA-P2I**: Yes (Standardize terminology)

---

### Gap 6: "The Formation" Team Allocation Lack of Progress Easing
- **Route**: `/missions/[id]/teams`
- **Problem**: Clicking "The Formation" immediately structures teams. The random nature isn't visually communicated with progress indicators.
---

## RESOLVED IN BOOKING WORKSPACE USABILITY REBUILD

### Resolved: Booking Technical Terminology & Capacity Mental Model
- **Route**: `/bookings`, `/bookings/new`, `/bookings/[id]`, `/money`, `/money/payments`, `/money/refunds`, `/money/reconciliation`
- **Resolution**:
  - Replaced all technical jargon (*reservation hold*, *capacity ledger*, *reconciliation state*, *waitlist offer hold*, *booking source enum*) with human-readable labels (*Waiting for Payment*, *Spaces*, *Spaces Left*, *Space Offered*, *Payment Problem*).
  - Added reusable `BookingStatusBadge`, `PaymentStatusBadge`, `RefundStatusBadge`, `CapacitySummary`, and `OperatorHintPanel`.
  - Added 5-step wizard flow for Add Booking with automatic waiting-list prompts when events are full.
  - Added visual booking lifecycle timeline on Booking Details page.
  - Added task-card layout for Refunds and plain-English issue cards for Payment Check reconciliation.
- **Status**: RESOLVED (Commit `805a0c8` + Booking Usability Rebuild)

- **Recommended Improvement**: Add a 1.5-second shuffle micro-animation showing participant cards flying into team columns to build operational excitement.
- **Severity**: Low
- **Belongs in SA-P2I**: Yes (Visual polish)

---

---

## RESOLVED IN SETUP WORKSPACE USABILITY REBUILD

### Resolved: Navigation List & Hidden Geography Hierarchy (Gaps 1 & 2)
- **Route**: `/setup`, `/franchises`, `/territories`, `/cities`, `/locations/venues`, `/locations/playing-areas`
- **Resolution**:
  - Created central Setup landing workspace (`/setup`) with a 5-step setup journey: *Franchise → Territory → City → Venue → Playing Area*.
  - Added Next Action Engine card recommending the exact next step derived from prototype state.
  - Created top-level Cities portal (`/cities`) so cities are no longer hidden inside territory detail pages.
  - Standardized Setup components (`SetupBackNavigation`, `SetupStatusBadge`, `SetupNextStep`, `SetupHelpPanel`, `SetupRelationshipTree`, `SetupEmptyState`, `SetupPrimaryAction`).
  - Added Setup Health summary to Command Center dashboard (`/`).
- **Status**: RESOLVED (Commit `feat(ux): simplify franchise territory venue and playing area setup`)
