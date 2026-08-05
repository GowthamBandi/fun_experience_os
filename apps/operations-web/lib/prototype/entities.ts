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

export type ReservationStatus =
  | "none"
  | "active"
  | "offer-hold"
  | "converted"
  | "expired"
  | "released";

export type PaymentStatus =
  | "none"
  | "not-started"
  | "pending"
  | "initiated"
  | "confirmed"
  | "failed"
  | "refund-pending"
  | "refunded"
  | "reconciled";

export type BookingStatus =
  | "reserved"
  | "payment-pending"
  | "payment-confirmed"
  | "checked-in"
  | "confirmed"
  | "payment-failed"
  | "reservation-expired"
  | "waitlisted"
  | "waitlist-joined"
  | "waitlist-offered"
  | "waitlist-promoted"
  | "complimentary"
  | "cancelled"
  | "cancelled-user"
  | "cancelled-company"
  | "no-show"
  | "refund-pending"
  | "refunded"
  | "completed";

export type BookingSource =
  | "customer-app"
  | "admin"
  | "complimentary"
  | "waitlist-promotion"
  | "campaign";

export type BookingType =
  | "individual"
  | "group"
  | "complimentary"
  | "admin";

export interface Booking {
  id: BookingId;
  bookingCode?: string;
  sessionId: SessionId;
  participantId?: string;
  alias: string;
  phoneMask: string;
  tempId?: string;
  source?: BookingSource;
  bookingType?: BookingType;
  reservationStatus?: ReservationStatus;
  paymentStatus?: PaymentStatus;
  status: BookingStatus;
  amount: number;
  discount?: number;
  tax?: number;
  platformFee?: number;
  finalAmount?: number;
  method?: string;
  reservedAt?: string;
  reservationExpiresAt?: string;
  confirmedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  waitlistOrder?: number;
  waitlistPosition?: number;
  waitlistOfferExpiresAt?: string;
  checkedIn?: boolean;
  noShow?: boolean;
  createdAt: string;
  updatedAt?: string;
  createdBy?: string;
  team?: string;
}

export type PaymentRecordStatus =
  | "initiated"
  | "pending"
  | "confirmed"
  | "failed"
  | "cancelled"
  | "reconciled";

export interface Payment {
  id: string;
  bookingId: BookingId;
  sessionId: SessionId;
  provider?: string;
  providerReference?: string;
  amount: number;
  status: PaymentRecordStatus;
  paymentMethod?: string;
  initiatedAt: string;
  confirmedAt?: string;
  failedAt?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type RefundType =
  | "full"
  | "partial"
  | "company-cancellation"
  | "user-cancellation"
  | "duplicate-payment"
  | "manual-adjustment";

export type RefundStatus =
  | "requested"
  | "under-review"
  | "approved"
  | "processing"
  | "completed"
  | "failed"
  | "rejected";

export interface Refund {
  id: string;
  paymentId?: string;
  bookingId: BookingId;
  sessionId: SessionId;
  type: RefundType;
  amount: number;
  reason: string;
  status: RefundStatus;
  requestedAt: string;
  approvedAt?: string;
  completedAt?: string;
  failedAt?: string;
  failureReason?: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------
 * SA-P2F: Temporary Identity, Team Formation, Reveal & Check-In
 * ------------------------------------------------------------------ */

export type TemporaryIdentityStatus =
  | "not-generated"
  | "generated"
  | "locked"
  | "revealed"
  | "revoked";

export interface TemporaryIdentity {
  id: string;
  sessionId: SessionId;
  bookingId: BookingId;
  participantAlias: string;
  temporaryCode: string;
  patternId: string;
  generationVersion: number;
  status: TemporaryIdentityStatus;
  generatedAt: string;
  regeneratedAt?: string;
  lockedAt?: string;
  revealedAt?: string;
  revokedAt?: string;
  revocationReason?: string;
  createdBy?: string;
  updatedAt: string;
}

export interface IdentityPattern {
  id: string;
  name: string;
  prefix: string;
  separator: string;
  numberLength: number;
  aliasStyle: string;
  example: string;
  status: "active" | "draft" | "deprecated";
  createdAt: string;
  updatedAt: string;
}

export type TeamStatus = "draft" | "allocated" | "locked" | "revealed";

export interface Team {
  id: string;
  sessionId: SessionId;
  name: string;
  code: string;
  capacity: number;
  status: TeamStatus;
  lockedAt?: string;
  revealedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export type AssignmentMethod = "random" | "manual" | "balanced";
export type TeamAssignmentStatus = "active" | "moved" | "removed";

export interface TeamAssignment {
  id: string;
  sessionId: SessionId;
  teamId: string;
  bookingId: BookingId;
  temporaryIdentityId?: string;
  assignmentMethod: AssignmentMethod;
  assignedAt: string;
  movedAt?: string;
  movedBy?: string;
  reason?: string;
  status: TeamAssignmentStatus;
}

export type CheckInStatus =
  | "expected"
  | "checked-in"
  | "late"
  | "no-show"
  | "denied";

export type CheckInMethod =
  | "qr-simulation"
  | "temp-id-search"
  | "manual-override";

export interface CheckInRecord {
  id: string;
  sessionId: SessionId;
  bookingId: BookingId;
  temporaryIdentityId?: string;
  status: CheckInStatus;
  method?: CheckInMethod;
  checkedInAt?: string;
  markedLateAt?: string;
  markedNoShowAt?: string;
  deniedAt?: string;
  denialReason?: string;
  handledBy?: string;
  note?: string;
  updatedAt: string;
}

export interface EmergencyAccessLog {
  id: string;
  sessionId?: SessionId;
  bookingId?: BookingId;
  operatorId: string;
  reason: string;
  requestedAt: string;
  expiresAt: string;
  status: "active" | "expired" | "closed";
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
