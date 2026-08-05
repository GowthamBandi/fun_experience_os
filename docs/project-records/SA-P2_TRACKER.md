# SA-P2 Operations Brain Tracker

## Phase SA-P2E — Bookings, Capacity, Waitlist & Money

- **Status**: Complete ✅
- **Baseline Commit**: `7107d09`
- **Data Mode**: `NEXT_PUBLIC_DATA_MODE=prototype` (Firebase inactive)

### Architecture Highlights
1. **Authoritative Capacity Engine** (`lib/prototype/selectors/capacity.ts`):
   - Computes `maxPhysicalCapacity`, `sellableCapacity`, `occupiedSellableCapacity`, `physicalOccupancy`, `remainingSellableCapacity`, `minViableAttendance`, `targetAttendance`, `breakEvenAttendance`, `fillRate`, `occupancyStatus`.
   - Strictly derived from state, zero stale persisted fields.
   - Enforces capacity invariants (\(\text{remaining} \ge 0\), \(\text{physicalOccupancy} \le \text{maxPhysical}\)).

2. **Operations Intelligence** (`lib/prototype/selectors/intelligence.ts`):
   - Generates real-time actionable alerts for overbooking, heavy waitlist, break-even risk, payment failure spikes, refund approvals, and staffing shortages.

3. **Session Progress Timeline** (`SessionTimeline.tsx`):
   - Visual operational lifecycle rendered across session views (`Draft` \(\rightarrow\) `Bookings Open` \(\rightarrow\) `Fill %` \(\rightarrow\) `FULL` \(\rightarrow\) `Waitlist Active` \(\rightarrow\) `Check-in` \(\rightarrow\) `Live` \(\rightarrow\) `Completed`).

4. **Workspaces & Command Centers**:
   - **Reservation Operations**: `/bookings`, `/bookings/new`, `/bookings/[id]`, `/missions/[id]/bookings`
   - **Queue Operations**: `/missions/[id]/waitlist`
   - **Financial & Revenue Operations**: `/money`, `/money/payments`, `/money/refunds`, `/money/reconciliation`, `/missions/[id]/money`

5. **AI-Ready Intelligence Panels** (`AIIntelligencePlaceholder.tsx`):
   - Non-functional UI scaffolds with explicit notice: *"Future intelligence preview — no prediction model connected."*
