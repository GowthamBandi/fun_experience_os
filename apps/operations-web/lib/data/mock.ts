import type {
  Booking,
  CatalogItem,
  CrewMember,
  DayPoint,
  Incident,
  Operator,
  PromoCode,
  Role,
  Session,
  Shift,
  Signal,
  Territory,
  TerritoryId,
  Transaction,
  Tournament,
  Venue,
} from "@/lib/types";

/* ------------------------------------------------------------------
   DETERMINISTIC MOCK REPOSITORIES
   Hand-authored seed data. No randomness — every build is identical.
   Replaced by real repositories in production (mock contract).
------------------------------------------------------------------- */

export const TERRITORIES: Territory[] = [
  { id: "hvd-central", name: "Hyderabad Central", code: "HYD", time: "19:42", venues: 9, tonight: 14, fill: 82 },
  { id: "blr-south", name: "Bengaluru South", code: "BLR", time: "19:42", venues: 7, tonight: 11, fill: 74 },
  { id: "mum-west", name: "Mumbai West", code: "BOM", time: "19:42", venues: 6, tonight: 9, fill: 68 },
];

export const ROLES: Role[] = [
  { id: "platform-owner", name: "Platform Owner", kind: "chain", scope: "Platform" },
  { id: "super-admin", name: "Super Admin", kind: "chain", scope: "Platform" },
  { id: "regional-partner", name: "Regional Franchise Partner", kind: "chain", scope: "Region" },
  { id: "city-manager", name: "City Manager", kind: "chain", scope: "City" },
  { id: "ops-manager", name: "Operations Manager", kind: "chain", scope: "City" },
  { id: "venue-manager", name: "Venue Manager", kind: "chain", scope: "Venue" },
  { id: "coordinator", name: "Event Coordinator", kind: "chain", scope: "Session" },
  { id: "staff", name: "Staff", kind: "chain", scope: "Task" },
  { id: "support", name: "Customer Support", kind: "functional", scope: "City", lane: "Support" },
  { id: "safety", name: "Safety & Moderation Officer", kind: "functional", scope: "City", lane: "Safety" },
  { id: "finance", name: "Finance Manager", kind: "functional", scope: "Franchise", lane: "Finance" },
  { id: "marketing", name: "Marketing Manager", kind: "functional", scope: "City", lane: "Marketing" },
  { id: "analyst", name: "Analyst", kind: "functional", scope: "Franchise", lane: "Analytics" },
];

export const OPERATORS: Operator[] = [
  { id: "op-1", name: "Aditya Rao", title: "Platform Owner", role: "platform-owner", territoryId: "hvd-central", initials: "AR" },
  { id: "op-2", name: "Meera Krishnan", title: "Super Admin", role: "super-admin", territoryId: "hvd-central", initials: "MK" },
  { id: "op-3", name: "Dev Patel", title: "Regional Franchise Partner", role: "regional-partner", territoryId: "hvd-central", initials: "DP" },
  { id: "op-4", name: "Noor Fatima", title: "City Manager — Hyderabad Central", role: "city-manager", territoryId: "hvd-central", initials: "NF" },
  { id: "op-5", name: "Ravi Teja", title: "Operations Manager", role: "ops-manager", territoryId: "hvd-central", initials: "RT" },
  { id: "op-6", name: "Sanjay Verma", title: "Venue Manager", role: "venue-manager", territoryId: "hvd-central", initials: "SV" },
  { id: "op-7", name: "Aisha Khan", title: "Event Coordinator", role: "coordinator", territoryId: "hvd-central", initials: "AK" },
  { id: "op-8", name: "Karan Shetty", title: "Customer Support", role: "support", territoryId: "hvd-central", initials: "KS" },
  { id: "op-9", name: "Priya Menon", title: "Safety & Moderation Officer", role: "safety", territoryId: "hvd-central", initials: "PM" },
  { id: "op-10", name: "Ishaan Gupta", title: "Finance Manager", role: "finance", territoryId: "hvd-central", initials: "IG" },
  { id: "op-11", name: "Kabir Rao", title: "Floor Staff", role: "staff", territoryId: "hvd-central", initials: "KR" },
  { id: "op-12", name: "Zara Ahmed", title: "Marketing Manager", role: "marketing", territoryId: "hvd-central", initials: "ZA" },
  { id: "op-13", name: "Vikram Joshi", title: "Analyst", role: "analyst", territoryId: "hvd-central", initials: "VJ" },
];

export const VENUES: Venue[] = [
  { id: "v-1", territoryId: "hvd-central", name: "Hitex Sports Arena", areas: ["Court 1", "Court 2", "Court 3"], utilization: 86, status: "ready" },
  { id: "v-2", territoryId: "hvd-central", name: "Gachibowli Indoor Club", areas: ["Hall A", "Hall B"], utilization: 78, status: "ready" },
  { id: "v-3", territoryId: "hvd-central", name: "Jubilee Grounds", areas: ["Pitch 1", "Pitch 2"], utilization: 92, status: "ready" },
  { id: "v-4", territoryId: "blr-south", name: "Koramangala Courts", areas: ["Court A", "Court B"], utilization: 71, status: "ready" },
  { id: "v-5", territoryId: "blr-south", name: "Indiranagar Pavilion", areas: ["Main Hall"], utilization: 64, status: "maintenance" },
  { id: "v-6", territoryId: "mum-west", name: "Andheri Sports Dome", areas: ["Turf 1", "Turf 2"], utilization: 69, status: "ready" },
];

export const SESSIONS: Session[] = [
  { id: "s-1", title: "Evening Box Cricket", activity: "Box Cricket", format: "mixed", territoryId: "hvd-central", venueId: "v-3", date: "Today", time: "19:00", capacity: 12, booked: 12, waitlist: 4, price: 499, minFill: 8, status: "live", coordinatorId: "op-7" },
  { id: "s-2", title: "Night Badminton League", activity: "Badminton", format: "men", territoryId: "hvd-central", venueId: "v-1", date: "Today", time: "20:00", capacity: 16, booked: 13, waitlist: 0, price: 349, minFill: 10, status: "live", coordinatorId: "op-7" },
  { id: "s-3", title: "Women's Social Badminton", activity: "Badminton", format: "women", territoryId: "hvd-central", venueId: "v-1", date: "Today", time: "21:00", capacity: 12, booked: 9, waitlist: 2, price: 299, minFill: 8, status: "open", coordinatorId: "op-7" },
  { id: "s-4", title: "Rooftop Table Tennis Social", activity: "Indoor Games", format: "mixed", territoryId: "hvd-central", venueId: "v-2", date: "Today", time: "22:00", capacity: 8, booked: 5, waitlist: 0, price: 249, minFill: 6, status: "closing", coordinatorId: "op-7" },
  { id: "s-5", title: "Turf Cricket Night", activity: "Box Cricket", format: "mixed", territoryId: "blr-south", venueId: "v-4", date: "Today", time: "19:30", capacity: 12, booked: 10, waitlist: 1, price: 549, minFill: 8, status: "live", coordinatorId: "op-7" },
  { id: "s-6", title: "Board Games Parlour", activity: "Indoor Games", format: "mixed", territoryId: "blr-south", venueId: "v-5", date: "Today", time: "20:00", capacity: 10, booked: 7, waitlist: 0, price: 199, minFill: 6, status: "scheduled", coordinatorId: "op-7" },
  { id: "s-7", title: "Mumbai Turf Cricket", activity: "Box Cricket", format: "mixed", territoryId: "mum-west", venueId: "v-6", date: "Today", time: "19:00", capacity: 14, booked: 11, waitlist: 3, price: 599, minFill: 10, status: "live", coordinatorId: "op-7" },
  { id: "s-8", title: "Saturday Badminton Mixer", activity: "Badminton", format: "mixed", territoryId: "hvd-central", venueId: "v-2", date: "Tomorrow", time: "17:00", capacity: 16, booked: 6, waitlist: 0, price: 349, minFill: 10, status: "scheduled", coordinatorId: "op-7" },
  { id: "s-9", title: "Sunday Cricket Knockout", activity: "Tournament", format: "mixed", territoryId: "hvd-central", venueId: "v-3", date: "Tomorrow", time: "07:00", capacity: 32, booked: 28, waitlist: 0, price: 899, minFill: 24, status: "scheduled", coordinatorId: "op-7" },
  { id: "s-10", title: "Badminton Beginner's Night", activity: "Badminton", format: "women", territoryId: "mum-west", venueId: "v-6", date: "Tomorrow", time: "18:00", capacity: 12, booked: 4, waitlist: 0, price: 299, minFill: 8, status: "draft", coordinatorId: "op-7" },
  { id: "s-11", title: "Weekday Cricket Clash", activity: "Box Cricket", format: "men", territoryId: "blr-south", venueId: "v-4", date: "Yesterday", time: "19:00", capacity: 12, booked: 12, waitlist: 0, price: 549, minFill: 8, status: "closed", coordinatorId: "op-7" },
  { id: "s-12", title: "Monsoon Indoor Social", activity: "Indoor Games", format: "mixed", territoryId: "hvd-central", venueId: "v-1", date: "Yesterday", time: "20:00", capacity: 10, booked: 4, waitlist: 0, price: 199, minFill: 6, status: "cancelled", coordinatorId: "op-7" },
];

export const BOOKINGS: Booking[] = [
  { id: "b-1", sessionId: "s-1", tempId: "XK-4821", alias: "BlazerFox", phoneMask: "•••• 42", amount: 499, status: "checked-in", method: "card" },
  { id: "b-2", sessionId: "s-1", tempId: "XK-4822", alias: "MidnightDrive", phoneMask: "•••• 11", amount: 499, status: "checked-in", method: "upi" },
  { id: "b-3", sessionId: "s-1", tempId: "XK-4823", alias: "CourtPirate", phoneMask: "•••• 07", amount: 499, status: "checked-in", method: "card" },
  { id: "b-4", sessionId: "s-1", tempId: "XK-4824", alias: "SilentRally", phoneMask: "•••• 88", amount: 499, status: "confirmed", method: "upi" },
  { id: "b-5", sessionId: "s-2", tempId: "XK-4830", alias: "SmashOrder", phoneMask: "•••• 34", amount: 349, status: "confirmed", method: "card" },
  { id: "b-6", sessionId: "s-2", tempId: "XK-4831", alias: "NetRunner", phoneMask: "•••• 21", amount: 349, status: "confirmed", method: "upi" },
  { id: "b-7", sessionId: "s-3", tempId: "XK-4840", alias: "FeatherStorm", phoneMask: "•••• 56", amount: 299, status: "confirmed", method: "upi" },
  { id: "b-8", sessionId: "s-3", tempId: "XK-4841", alias: "LobItLow", phoneMask: "•••• 90", amount: 299, status: "confirmed", method: "card" },
  { id: "b-9", sessionId: "s-5", tempId: "XK-4900", alias: "CoverDrive", phoneMask: "•••• 05", amount: 549, status: "confirmed", method: "card" },
  { id: "b-10", sessionId: "s-7", tempId: "XK-4950", alias: "DuckHunt", phoneMask: "•••• 73", amount: 599, status: "confirmed", method: "upi" },
  { id: "b-11", sessionId: "s-11", tempId: "XK-4401", alias: "LateCut", phoneMask: "•••• 19", amount: 549, status: "checked-in", method: "card" },
  { id: "b-12", sessionId: "s-11", tempId: "XK-4402", alias: "SquareTurn", phoneMask: "•••• 62", amount: 549, status: "no-show", method: "upi" },
  { id: "b-13", sessionId: "s-4", tempId: "XK-4860", alias: "PaddlePace", phoneMask: "•••• 44", amount: 249, status: "confirmed", method: "upi" },
  { id: "b-14", sessionId: "s-4", tempId: "XK-4861", alias: "SpinDoctor", phoneMask: "•••• 27", amount: 249, status: "cancelled", method: "card" },
];

export const CREW: CrewMember[] = [
  { id: "c-1", name: "Aisha Khan", role: "coordinator", venueId: "v-1", territoryId: "hvd-central", assignment: "Lead — Night Badminton League", status: "checked-in" },
  { id: "c-2", name: "Rohit Nair", role: "staff", venueId: "v-3", territoryId: "hvd-central", assignment: "Referee — Evening Box Cricket", status: "checked-in" },
  { id: "c-3", name: "Tanvi Iyer", role: "staff", venueId: "v-3", territoryId: "hvd-central", assignment: "Check-in — Evening Box Cricket", status: "checked-in" },
  { id: "c-4", name: "Sahil Batra", role: "coordinator", venueId: "v-4", territoryId: "blr-south", assignment: "Lead — Turf Cricket Night", status: "assigned" },
  { id: "c-5", name: "Divya Reddy", role: "staff", venueId: "v-1", territoryId: "hvd-central", assignment: "Safety contact — Night League", status: "available" },
  { id: "c-6", name: "Arjun Mehta", role: "venue-manager", venueId: "v-2", territoryId: "hvd-central", assignment: "Venue Manager — Indoor Club", status: "checked-in" },
  { id: "c-7", name: "Sana Sheikh", role: "staff", venueId: "v-6", territoryId: "mum-west", assignment: "Equipment — Turf Cricket", status: "assigned" },
];

export const CATALOG: CatalogItem[] = [
  { id: "ct-1", activity: "Box Cricket", format: "Mixed", price: 549, capacity: 12, minFill: 8, status: "live" },
  { id: "ct-2", activity: "Box Cricket", format: "Men", price: 549, capacity: 12, minFill: 8, status: "live" },
  { id: "ct-3", activity: "Badminton", format: "Mixed", price: 349, capacity: 16, minFill: 10, status: "live" },
  { id: "ct-4", activity: "Badminton", format: "Women", price: 299, capacity: 12, minFill: 8, status: "live" },
  { id: "ct-5", activity: "Indoor Games", format: "Mixed", price: 199, capacity: 10, minFill: 6, status: "live" },
  { id: "ct-6", activity: "Tournament", format: "Knockout", price: 899, capacity: 32, minFill: 24, status: "live" },
  { id: "ct-7", activity: "Adventure Social", format: "Mixed", price: 799, capacity: 20, minFill: 12, status: "draft" },
];

export const TRANSACTIONS: Transaction[] = [
  { id: "t-1", sessionId: "s-1", territoryId: "hvd-central", kind: "payment", amount: 499, method: "card", status: "settled", at: "18:12" },
  { id: "t-2", sessionId: "s-1", territoryId: "hvd-central", kind: "payment", amount: 499, method: "upi", status: "settled", at: "18:20" },
  { id: "t-3", sessionId: "s-2", territoryId: "hvd-central", kind: "payment", amount: 349, method: "upi", status: "settled", at: "18:41" },
  { id: "t-4", sessionId: "s-4", territoryId: "hvd-central", kind: "refund", amount: -249, method: "card", status: "settled", at: "17:05" },
  { id: "t-5", sessionId: "s-9", territoryId: "hvd-central", kind: "promo", amount: -90, method: "promo", status: "pending", at: "19:01" },
  { id: "t-6", sessionId: "s-7", territoryId: "mum-west", kind: "payment", amount: 599, method: "card", status: "settled", at: "18:55" },
  { id: "t-7", sessionId: "s-3", territoryId: "hvd-central", kind: "adjustment", amount: -25, method: "adjustment", status: "pending", at: "19:10" },
  { id: "t-8", sessionId: "s-11", territoryId: "blr-south", kind: "payment", amount: 549, method: "upi", status: "settled", at: "18:02" },
  { id: "t-9", sessionId: "s-6", territoryId: "blr-south", kind: "payment", amount: 199, method: "card", status: "pending", at: "18:47" },
];

export const TOURNAMENTS: Tournament[] = [
  {
    id: "tr-1",
    title: "Sunday Cricket Knockout",
    territoryId: "hvd-central",
    kind: "Single elimination",
    format: "Box Cricket · Mixed",
    teams: 8,
    round: "Quarter-finals",
    phase: "Tomorrow morning",
    prizePool: "₹50,000 pool",
    status: "upcoming",
    pods: [
      { id: "p-1", label: "Pod A · Ravi's XI", standings: [
        { id: "t-1", name: "Ravi's XI", wins: 2, losses: 0 },
        { id: "t-2", name: "Blazer Battalion", wins: 1, losses: 1 },
        { id: "t-3", name: "Square Cut", wins: 1, losses: 1 },
        { id: "t-4", name: "Duck Hunters", wins: 0, losses: 2 },
      ] },
      { id: "p-2", label: "Pod B · Midnight Drive", standings: [
        { id: "t-5", name: "Midnight Drive", wins: 2, losses: 0 },
        { id: "t-6", name: "Court Pirates", wins: 1, losses: 1 },
        { id: "t-7", name: "Silent Rally", wins: 1, losses: 1 },
        { id: "t-8", name: "Late Cuts", wins: 0, losses: 2 },
      ] },
      { id: "p-3", label: "Pod C · Feather Storm", standings: [
        { id: "t-9", name: "Feather Storm", wins: 2, losses: 0 },
        { id: "t-10", name: "Net Runners", wins: 1, losses: 1 },
        { id: "t-11", name: "Lob It Low", wins: 1, losses: 1 },
        { id: "t-12", name: "Paddle Pace", wins: 0, losses: 2 },
      ] },
      { id: "p-4", label: "Pod D · Cover Drive", standings: [
        { id: "t-13", name: "Cover Drive", wins: 2, losses: 0 },
        { id: "t-14", name: "Smash Order", wins: 1, losses: 1 },
        { id: "t-15", name: "Spin Doctor", wins: 1, losses: 1 },
        { id: "t-16", name: "Feather Weights", wins: 0, losses: 2 },
      ] },
    ],
  },
  {
    id: "tr-2",
    title: "Badminton Masters Cup",
    territoryId: "blr-south",
    kind: "Single elimination",
    format: "Badminton · Mixed",
    teams: 16,
    round: "Semi-finals",
    phase: "Live now",
    prizePool: "₹40,000 pool",
    status: "live",
    pods: [
      { id: "p-5", label: "Bracket · Top half", standings: [
        { id: "t-17", name: "Smash Order", wins: 3, losses: 0 },
        { id: "t-18", name: "Featherstorm", wins: 2, losses: 1 },
        { id: "t-19", name: "Lob Authority", wins: 1, losses: 2 },
        { id: "t-20", name: "Shuttle Racketeers", wins: 0, losses: 3 },
      ] },
      { id: "p-6", label: "Bracket · Bottom half", standings: [
        { id: "t-21", name: "Net Kings", wins: 3, losses: 0 },
        { id: "t-22", name: "Backline", wins: 2, losses: 1 },
        { id: "t-23", name: "Court Movers", wins: 1, losses: 2 },
        { id: "t-24", name: "Half Smashers", wins: 0, losses: 3 },
      ] },
      { id: "p-7", label: "Bracket · Wildcards", standings: [
        { id: "t-25", name: "Deejay Duo", wins: 2, losses: 1 },
        { id: "t-26", name: "Feather Trappers", wins: 1, losses: 2 },
        { id: "t-27", name: "Cross-Court Crew", wins: 1, losses: 2 },
      ] },
      { id: "p-8", label: "Bracket · Contenders", standings: [
        { id: "t-28", name: "Overhead Only", wins: 2, losses: 1 },
        { id: "t-29", name: "Drop Shot Crew", wins: 1, losses: 2 },
        { id: "t-30", name: "The Baseline", wins: 1, losses: 2 },
      ] },
    ],
  },
  {
    id: "tr-3",
    title: "Monsoon Indoor Cup",
    territoryId: "hvd-central",
    kind: "Single elimination",
    format: "Indoor Games · Mixed",
    teams: 8,
    round: "Final",
    phase: "Closed",
    prizePool: "₹25,000 pool",
    status: "closed",
    pods: [
      { id: "p-9", label: "Champion", standings: [
        { id: "t-31", name: "Board Kings", wins: 4, losses: 0 },
      ] },
      { id: "p-10", label: "Runner-up", standings: [
        { id: "t-32", name: "Parlour Pros", wins: 3, losses: 1 },
      ] },
      { id: "p-11", label: "Semis", standings: [
        { id: "t-33", name: "Tile Runners", wins: 2, losses: 2 },
        { id: "t-34", name: "Dice Rollers", wins: 2, losses: 2 },
      ] },
      { id: "p-12", label: "Eliminated", standings: [
        { id: "t-35", name: "Card Sharks", wins: 1, losses: 3 },
        { id: "t-36", name: "Counters", wins: 1, losses: 3 },
        { id: "t-37", name: "Spade Society", wins: 0, losses: 4 },
        { id: "t-38", name: "Hearts Away", wins: 0, losses: 4 },
      ] },
    ],
  },
];

export const SHIFTS: Shift[] = [
  { id: "sh-1", crewId: "c-1", venue: "Hitex Sports Arena", zone: "Night League", from: "19:00", to: "23:00" },
  { id: "sh-2", crewId: "c-2", venue: "Jubilee Grounds", zone: "Box Cricket", from: "18:30", to: "22:30" },
  { id: "sh-3", crewId: "c-3", venue: "Jubilee Grounds", zone: "Check-in", from: "18:30", to: "22:30" },
  { id: "sh-4", crewId: "c-4", venue: "Koramangala Courts", zone: "Turf Cricket", from: "19:00", to: "23:00" },
  { id: "sh-5", crewId: "c-5", venue: "Hitex Sports Arena", zone: "Safety watch", from: "19:30", to: "23:30" },
  { id: "sh-6", crewId: "c-6", venue: "Gachibowli Indoor Club", zone: "Venue floor", from: "18:00", to: "23:00" },
  { id: "sh-7", crewId: "c-7", venue: "Andheri Sports Dome", zone: "Equipment", from: "18:00", to: "22:00" },
];

export const PROMO_CODES: PromoCode[] = [
  { code: "FIRSTNIGHT", label: "First timer · 20% off", discount: "20%", status: "active" },
  { code: "MIDNIGHT50", label: "Late join · ₹50 off", discount: "₹50", status: "active" },
  { code: "DOUBLESUP", label: "Bring a friend · 15% off", discount: "15%", status: "active" },
  { code: "MONSOON", label: "Rainy night · 25% off", discount: "25%", status: "expired" },
];

export const INCIDENTS: Incident[] = [
  { id: "i-1", sessionId: "s-1", kind: "Equipment issue", status: "open", severity: "medium", reportedAt: "19:24" },
  { id: "i-2", sessionId: "s-7", kind: "Crowd concern", status: "reviewing", severity: "low", reportedAt: "18:50" },
  { id: "i-3", sessionId: "s-12", kind: "Weather — cancelled", status: "resolved", severity: "high", reportedAt: "Yesterday" },
];

export const SIGNALS: Signal[] = [
  { id: "sg-1", kind: "join", message: "FeatherStorm joined Women's Social Badminton", sessionId: "s-3", at: "19:38", read: false },
  { id: "sg-2", kind: "strike", message: "CourtPirate checked in — Evening Box Cricket", sessionId: "s-1", at: "19:29", read: false },
  { id: "sg-3", kind: "alert", message: "Evening Box Cricket is sold out. Waitlist has 4.", sessionId: "s-1", at: "19:20", read: false },
  { id: "sg-4", kind: "join", message: "DuckHunt joined Mumbai Turf Cricket", sessionId: "s-7", at: "19:12", read: true },
  { id: "sg-5", kind: "strike", message: "SilentRally checked in — Evening Box Cricket", sessionId: "s-1", at: "18:58", read: true },
  { id: "sg-6", kind: "close", message: "Weekday Cricket Clash wrapped — 11 of 12 checked in", sessionId: "s-11", at: "Yesterday", read: true },
  { id: "sg-7", kind: "system", message: "Monsoon Indoor Social cancelled — weather", sessionId: "s-12", at: "Yesterday", read: true },
];

export const ANALYTICS: DayPoint[] = [
  { label: "Mon", revenue: 12800, bookings: 41, fill: 68 },
  { label: "Tue", revenue: 15100, bookings: 48, fill: 72 },
  { label: "Wed", revenue: 14400, bookings: 44, fill: 70 },
  { label: "Thu", revenue: 18200, bookings: 57, fill: 78 },
  { label: "Fri", revenue: 24100, bookings: 74, fill: 86 },
  { label: "Sat", revenue: 28900, bookings: 88, fill: 91 },
  { label: "Sun", revenue: 26400, bookings: 81, fill: 88 },
];

/* ------------------------- repository contract ------------------------- */

export interface Repos {
  territories(): Territory[];
  venues(): Venue[];
  sessions(): Session[];
  bookings(): Booking[];
  crew(): CrewMember[];
  catalog(): CatalogItem[];
  transactions(): Transaction[];
  tournaments(): Tournament[];
  incidents(): Incident[];
  signals(): Signal[];
  analytics(): DayPoint[];
  operators(): Operator[];
  roles(): Role[];
  shifts(): Shift[];
  promoCodes(): PromoCode[];
}

export const repos: Repos = {
  territories: () => TERRITORIES,
  venues: () => VENUES,
  sessions: () => SESSIONS,
  bookings: () => BOOKINGS,
  crew: () => CREW,
  catalog: () => CATALOG,
  transactions: () => TRANSACTIONS,
  tournaments: () => TOURNAMENTS,
  incidents: () => INCIDENTS,
  signals: () => SIGNALS,
  analytics: () => ANALYTICS,
  operators: () => OPERATORS,
  roles: () => ROLES,
  shifts: () => SHIFTS,
  promoCodes: () => PROMO_CODES,
};

export const territoryById = (id: TerritoryId): Territory =>
  TERRITORIES.find((t) => t.id === id) ?? TERRITORIES[0];
