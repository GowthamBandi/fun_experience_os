export type TerritoryId = "hvd-central" | "blr-south" | "mum-west";

export type RoleId =
  | "platform-owner"
  | "super-admin"
  | "regional-partner"
  | "city-manager"
  | "ops-manager"
  | "venue-manager"
  | "coordinator"
  | "staff"
  | "support"
  | "safety"
  | "finance"
  | "marketing"
  | "analyst";

export interface Territory {
  id: TerritoryId;
  name: string;
  code: string;
  time: string;
  venues: number;
  tonight: number;
  fill: number;
}

export interface Role {
  id: RoleId;
  name: string;
  kind: "chain" | "functional";
  scope: string;
  lane?: string;
}

export interface Operator {
  id: string;
  name: string;
  title: string;
  role: RoleId;
  territoryId: TerritoryId;
  initials: string;
}

export type SessionStatus =
  | "draft"
  | "scheduled"
  | "open"
  | "closing"
  | "live"
  | "closed"
  | "cancelled";

export interface Session {
  id: string;
  title: string;
  activity: string;
  format: "mixed" | "men" | "women";
  territoryId: TerritoryId;
  venueId: string;
  date: string;
  time: string;
  capacity: number;
  booked: number;
  waitlist: number;
  price: number;
  minFill: number;
  status: SessionStatus;
  coordinatorId: string;
}

export type BookingStatus = "confirmed" | "checked-in" | "cancelled" | "no-show";

export interface Booking {
  id: string;
  sessionId: string;
  tempId: string;
  alias: string;
  phoneMask: string;
  amount: number;
  status: BookingStatus;
  method: string;
}

export type IncidentStatus = "open" | "reviewing" | "resolved";

export interface Incident {
  id: string;
  sessionId: string;
  kind: string;
  status: IncidentStatus;
  severity: "low" | "medium" | "high";
  reportedAt: string;
}

export interface CrewMember {
  id: string;
  name: string;
  role: RoleId;
  venueId: string;
  territoryId: TerritoryId;
  assignment: string;
  status: "available" | "assigned" | "checked-in" | "off";
}

export interface Venue {
  id: string;
  territoryId: TerritoryId;
  name: string;
  areas: string[];
  utilization: number;
  status: "ready" | "maintenance" | "closed";
}

export interface CatalogItem {
  id: string;
  activity: string;
  format: string;
  price: number;
  capacity: number;
  minFill: number;
  status: "live" | "paused" | "draft";
}

export interface Transaction {
  id: string;
  sessionId: string;
  territoryId: TerritoryId;
  kind: "payment" | "refund" | "promo" | "adjustment";
  amount: number;
  method: string;
  status: "settled" | "pending" | "failed";
  at: string;
}

export interface Tournament {
  id: string;
  title: string;
  territoryId: string;
  kind: string;
  format: string;
  teams: number;
  round: string;
  phase: string;
  prizePool: string;
  status: "upcoming" | "live" | "closed";
  pods: TournamentPod[];
}

export interface TournamentPod {
  id: string;
  label: string;
  standings: TournamentStanding[];
}

export interface TournamentStanding {
  id: string;
  name: string;
  wins: number;
  losses: number;
}

export interface Signal {
  id: string;
  kind: "join" | "strike" | "alert" | "close" | "system";
  message: string;
  sessionId?: string;
  at: string;
  read: boolean;
}

export interface DayPoint {
  label: string;
  revenue: number;
  bookings: number;
  fill: number;
}

export interface Shift {
  id: string;
  crewId: string;
  venue: string;
  zone: string;
  from: string;
  to: string;
}

export interface PromoCode {
  code: string;
  label: string;
  discount: string;
  status: "active" | "expired";
}
