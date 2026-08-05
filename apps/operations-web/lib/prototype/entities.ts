import type { RoleId } from "@/lib/types";

export type TerritoryId = string;
export type FranchiseId = string;
export type CityId = string;
export type VenueId = string;
export type PlayingAreaId = string;
export type CategoryId = string;
export type TemplateId = string;
export type SessionId = string;
export type BookingId = string;
export type CrewId = string;
export type TournamentId = string;
export type IncidentId = string;

export interface Franchise {
  id: FranchiseId;
  name: string;
  type: string; // "regional" | "master"
  isInternal: boolean;
  legalEntity: string;
  assignedTerritories: TerritoryId[];
  franchiseHead: string; // operator initials / name
  revenueShare: number; // percentage
  startDate: string;
  status: "active" | "inactive" | "suspended";
  contactDetails: string;
  notes: string;
}

export interface Territory {
  id: TerritoryId;
  franchiseId: FranchiseId;
  name: string;
  type: string; // "urban" | "suburban" | "regional"
  state: string;
  region: string;
  managerId: string; // Operator ID
  status: "draft" | "active" | "paused" | "disabled";
  timezone: string;
  currency: string;
  contactInfo: string;
  notes: string;
}

export interface City {
  id: CityId;
  territoryId: TerritoryId;
  name: string;
  state: string;
  launchDate: string;
  managerId: string; // Operator ID
  supportedCategories: CategoryId[];
  status: "draft" | "ready" | "active" | "paused";
  notes: string;
}

export interface Venue {
  id: VenueId;
  territoryId: TerritoryId;
  cityId: CityId;
  name: string;
  address: string;
  contactPerson: string;
  contactNumber: string;
  type: string; // "arena" | "club" | "turf"
  operatingHours: string;
  supportedActivities: CategoryId[];
  safetyCapacity: number;
  staffCapacity: number;
  spectatorAllowance: number;
  equipmentAvailable: string[];
  accessibility: boolean;
  parking: boolean;
  washrooms: boolean;
  lighting: boolean;
  isIndoor: boolean;
  weatherDependent: boolean;
  costPerSlot: number;
  revenueModel: string;
  cancellationTerms: string;
  emergencyExits: string;
  firstAid: boolean;
  safetyContact: string;
  incidentNotes: string;
  verificationStatus: "verified" | "pending" | "failed";
  status: "ready" | "maintenance" | "closed";
}

export interface PlayingArea {
  id: PlayingAreaId;
  venueId: VenueId;
  name: string;
  activityCompatibility: CategoryId[];
  maxCapacity: number;
  staffCapacity: number;
  spectatorCapacity: number;
  equipment: string[];
  operatingHours: string;
  status: "active" | "maintenance" | "unavailable" | "closed";
  restrictions: string;
}

export type CategoryStatus = "draft" | "active" | "paused" | "archived";
export type TemplateStatus = "draft" | "ready" | "active" | "paused" | "archived";

export interface CategoryVenueCompat {
  indoorOutdoor: "indoor" | "outdoor" | "hybrid";
  minAreaCapacity?: number;
  lightingRequired?: boolean;
  washroomRequired?: boolean;
  parkingPreference?: boolean;
  accessibilityRequired?: boolean;
  requiredCapabilities?: string[];
  requiredEquipment?: string[];
}

export interface ActivityCategory {
  id: CategoryId;
  name: string;
  description: string;
  icon: string;
  visualTreatment: string;
  riskLevel: "low" | "medium" | "high";
  isIndoor: boolean;
  equipmentRequirements: string[];
  defaultStaffing: string[];
  defaultDuration: number; // minutes
  defaultAgeMin: number;
  defaultAgeMax: number;
  defaultParticipantsMin: number;
  defaultParticipantsMax: number;
  // SA-P2C extended fields (optional — catalog selectors apply defaults)
  shortCode?: string;
  status?: CategoryStatus;
  traits?: string[];
  defaultTargetParticipants?: number;
  defaultTeamSize?: number;
  defaultCoordinatorRequired?: boolean;
  refereeRequirement?: "none" | "optional" | "required";
  activitySpecialistRequired?: boolean;
  safetyContactRequired?: boolean;
  participantRequirements?: string[];
  weatherDependency?: boolean;
  accessibilityNotes?: string;
  venueCompat?: CategoryVenueCompat;
  createdAt?: string;
  updatedAt?: string;
}

export interface TemplateVenueCompat {
  indoorOutdoorNeed: "indoor" | "outdoor" | "hybrid" | "any";
  minAreaCapacity?: number;
  requiredEquipment?: string[];
  lighting?: boolean;
  accessibility?: boolean;
  spectatorNeeds?: number;
  requiredVenueVerification?: "verified" | "pending" | "any";
  playingAreaRestrictions?: string;
}

export interface ExperienceTemplate {
  id: TemplateId;
  categoryId: CategoryId;
  name: string;
  shortDesc: string;
  fullDesc: string;
  objective: string;
  promise: string;
  status: TemplateStatus;
  // Format
  format: "open" | "women" | "men" | "mixed";
  isTournament: boolean;
  ageMin: number;
  ageMax: number;
  verificationRequired: boolean;
  // Capacity
  minParticipants: number;
  targetParticipants: number;
  maxParticipants: number;
  teamSize: number;
  numTeams: number;
  spectatorAllowance: number;
  compSlots: number;
  blockedSlots: number;
  // Timing
  duration: number; // minutes
  checkInWindow: number; // minutes before
  bookingOpenDays: number;
  bookingCloseHours: number;
  revealHoursBefore: number;
  lateArrivalMins: number;
  completionBufferMins: number;
  // Pricing
  basePrice: number;
  taxAmount: number;
  platformFee: number;
  venueCost: number;
  equipmentCost: number;
  promoEligible: boolean;
  refundPolicyTemplate: string;
  // Operations
  requiredRoles: string[];
  coordinatorsCount: number;
  refereeRequired: boolean;
  safetyContactRequired: boolean;
  equipmentChecklist: string[];
  participantChecklist: string[];
  weatherDependency: boolean;
  cancellationThreshold: number;
  // Mystery
  anonymousJoinedCount: boolean;
  tempIdFormat: string;
  aliasStyle: string;
  teamAssignmentRule: string;
  revealTimeMinsBefore: number;
  infoRevealed: string[];
  infoNeverRevealed: string[];
  // SA-P2C extended fields (optional — catalog selectors apply defaults)
  entryType?: "individual" | "duo" | "preformed-team";
  competitiveLevel?: string;
  eligibilityNote?: string;
  internalNote?: string;
  coverMediaPlaceholder?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  substitutes?: number;
  waitlistDefault?: boolean;
  waitlistOfferExpiryMins?: number;
  minParticipantDecisionTime?: number;
  recurrenceSuitability?: string;
  staffingCost?: number;
  compBookingAllowance?: number;
  womenCoordinatorPreference?: boolean;
  checkInStaffRequired?: boolean;
  equipmentHandlerRequired?: boolean;
  activitySpecialistRequired?: boolean;
  leadCoordinatorRequired?: boolean;
  showJoinedCountBeforeReveal?: boolean;
  teamAssignmentMethod?: "random" | "balanced" | "preformed";
  preRevealPreview?: string;
  postRevealPreview?: string;
  mutualConnectionDeferred?: boolean;
  venueCompat?: TemplateVenueCompat;
  cancellationPolicyTemplate?: string;
  noShowTreatment?: string;
  lateArrivalTreatment?: string;
  behaviourRules?: string[];
  safetyLevel?: "low" | "medium" | "high";
  incidentEscalationRequired?: boolean;
  prizeVerificationRequired?: boolean;
  legalReviewStatus?: string;
  dataRetentionPlaceholder?: string;
}

export interface TemplateVersion {
  id: string;
  templateId: TemplateId;
  version: number;
  changedFields: string[];
  changedBy: string;
  timestamp: string;
  reason: string;
  previousStatus?: string;
  newStatus?: string;
  snapshot: Partial<ExperienceTemplate>;
}

export type SessionStatus =
  | "draft"
  | "scheduled"
  | "published"
  | "booking-open"
  | "almost-full"
  | "full"
  | "booking-closed"
  | "reveal-pending"
  | "revealed"
  | "check-in-open"
  | "live"
  | "completed"
  | "cancelled"
  | "archived";

export interface ScheduledSession {
  id: SessionId;
  templateId: TemplateId;
  categoryId: CategoryId;
  territoryId: TerritoryId;
  cityId: CityId;
  venueId: VenueId;
  playingAreaId: PlayingAreaId;
  status: SessionStatus;
  date: string;
  startTime: string;
  duration: number;
  timezone: string;
  recurrence: string;
  bookingOpensAt: string;
  bookingClosesAt: string;
  revealAt: string;
  checkInOpensAt: string;
  // Capacity
  minParticipants: number;
  targetParticipants: number;
  maxParticipants: number;
  compSlots: number;
  blockedSlots: number;
  waitlistEnabled: boolean;
  waitlistOfferExpiryMins: number;
  // Pricing
  basePrice: number;
  discountAmount: number;
  promoEligible: boolean;
  finalPrice: number;
  // Staffing
  leadCoordinatorId: string;
  supportingCoordinatorId: string;
  refereeId: string;
  safetyContactId: string;
  equipmentHandlerId: string;
  // Operations
  equipmentChecklist: string[];
  weatherRisk: "low" | "medium" | "high";
  cancellationThreshold: number;
}

export type BookingStatus =
  | "reserved"
  | "payment-pending"
  | "payment-confirmed"
  | "checked-in"
  | "payment-failed"
  | "reservation-expired"
  | "waitlist-joined"
  | "waitlist-promoted"
  | "complimentary"
  | "cancelled"
  | "no-show";

export interface Booking {
  id: BookingId;
  sessionId: SessionId;
  alias: string;
  phoneMask: string;
  tempId: string;
  amount: number;
  status: BookingStatus;
  method: string;
  createdAt: string;
  waitlistOrder?: number;
  waitlistOfferExpiresAt?: string;
  team?: string;
}

export interface CrewMember {
  id: CrewId;
  territoryId: TerritoryId;
  venueId: VenueId;
  name: string;
  role: RoleId;
  status: "available" | "assigned" | "checked-in" | "off";
  assignment: string;
}

export interface Shift {
  id: string;
  crewId: CrewId;
  venueId: VenueId;
  zone: string;
  from: string;
  to: string;
}

export interface Tournament {
  id: TournamentId;
  name: string;
  linkedSessionId: SessionId;
  territoryId: TerritoryId;
  venueId: VenueId;
  date: string;
  format: string; // "single-elimination" | "round-robin"
  teamCount: number;
  matchDuration: number;
  breakDuration: number;
  seedingMethod: string;
  status: "upcoming" | "live" | "completed";
  teams: string[]; // Team list
  brackets: Match[];
}

export interface Match {
  id: string;
  tournamentId: TournamentId;
  round: string; // "Quarter-finals" | "Semi-finals" | "Final"
  teamA: string;
  teamB: string;
  scoreA?: number;
  scoreB?: number;
  winner?: string;
  status: "scheduled" | "live" | "completed" | "walkover" | "abandoned";
  refereeId: string;
}

export interface Transaction {
  id: string;
  sessionId: SessionId;
  territoryId: TerritoryId;
  bookingId: BookingId;
  kind: "payment" | "refund" | "promo" | "adjustment";
  amount: number;
  method: string;
  status: "settled" | "pending" | "failed";
  at: string;
}

export interface Incident {
  id: IncidentId;
  sessionId: SessionId;
  reporterId: string;
  type: string;
  severity: "low" | "medium" | "high";
  time: string;
  peopleInvolved: string[];
  immediateAction: string;
  medicalAssistance: boolean;
  escalatedToVenue: boolean;
  status: "reported" | "triaged" | "active" | "escalated" | "monitoring" | "resolved" | "closed" | "open";
  notes: string;
  ownerId: string;
}

export interface Signal {
  id: string;
  kind: "join" | "strike" | "alert" | "close" | "system";
  message: string;
  sessionId?: SessionId;
  at: string;
  read: boolean;
}

export interface AuditEvent {
  id: string;
  sessionId?: SessionId;
  action: string;
  operatorId: string;
  timestamp: string;
  description: string;
}

export interface DayPoint {
  label: string;
  revenue: number;
  bookings: number;
  fill: number;
}

export interface PromoCode {
  code: string;
  label: string;
  discount: string;
  status: "active" | "expired";
}
