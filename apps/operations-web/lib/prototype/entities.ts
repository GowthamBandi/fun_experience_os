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
export type MatchId = string;
export type DisputeId = string;
export type ModerationCaseId = string;
export type ModerationActionId = string;
export type EvidenceItemId = string;
export type RefundExceptionId = string;

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
  /** Session status captured when the reveal was triggered, so a cancelled reveal can be undone. */
  statusBeforeReveal?: SessionStatus;
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
  /** ISO timestamp. A payment-pending hold is released by `releaseExpiredHolds` after this time. */
  reservationExpiresAt?: string;
  confirmedAt?: string;
  cancelledAt?: string;
  cancellationReason?: string;
  waitlistOrder?: number;
  waitlistPosition?: number;
  /** ISO timestamp. Set while a waitlist offer hold is active. */
  waitlistOfferExpiresAt?: string;
  /** ISO timestamp when the current waitlist offer was made. */
  waitlistOfferedAt?: string;
  /** Reference recorded when the payment was confirmed manually (receipt, UTR, POS slip). */
  paymentReference?: string;
  cancelledBy?: string;
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
  /** Operator who recorded the payment as received (payment provider not connected). */
  confirmedBy?: string;
  cancelledAt?: string;
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
  requestedBy?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  /** Manual payout record: how and with which reference the money was returned. */
  payoutMethod?: string;
  payoutReference?: string;
  completedBy?: string;
  /** Set when the refund was created by approving a refund exception. */
  refundExceptionId?: string;
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
  /** Role id of the requesting operator at the time of the request. */
  operatorRole?: string;
  closedAt?: string;
  closedBy?: string;
}

export interface CrewMember {
  id: CrewId;
  territoryId: TerritoryId;
  venueId: VenueId;
  name: string;
  role: RoleId;
  status: "available" | "assigned" | "checked-in" | "off";
  assignment: string;
  /** Contact details recorded by the operator who added the member (optional). */
  phone?: string;
  email?: string;
  emergencyContact?: string;
  skills?: string[];
  notes?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Shift {
  id: string;
  crewId: CrewId;
  venueId: VenueId;
  zone: string;
  from: string;
  to: string;
}

/* ------------------------------------------------------------------
 * SA-P2H: Tournament Operations
 * ------------------------------------------------------------------ */

export type TournamentStatus =
  | 'draft'
  | 'registration-open'
  | 'registration-closed'
  | 'teams-ready'
  | 'bracket-ready'
  | 'published'
  | 'live'
  | 'paused'
  | 'awaiting-verification'
  | 'completed'
  | 'cancelled'
  | 'archived';

/** A team entered into one tournament. Match slots and winners reference `id`, never the name. */
export interface TournamentEntrant {
  id: string;
  name: string;
  /** 1 = top seed. Used when the seeding method is "seeded". */
  seed?: number;
  status?: 'active' | 'disqualified' | 'withdrawn';
  disqualifiedReason?: string;
}

export interface Tournament {
  id: TournamentId;
  name: string;
  code: string;
  experienceTemplateId?: TemplateId;
  territoryId: TerritoryId;
  cityId?: CityId;
  venueId: VenueId;
  playingAreaIds?: PlayingAreaId[];
  sessionIds?: SessionId[];
  format: string;
  status: TournamentStatus;
  /** Entrant ids in seed order (see `entrants`). */
  teamIds: string[];
  /** Entrant records (id → display name). */
  entrants?: TournamentEntrant[];
  minimumTeams?: number;
  maximumTeams?: number;
  matchDuration: number;
  breakDuration: number;
  seedingMethod: string;
  verificationRequirement?: string;
  prizePlaceholder?: string;
  registrationClosesAt?: string;
  scheduledStart?: string;
  actualStart?: string;
  endedAt?: string;
  winnerTeamId?: string;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  /** @deprecated Use tournamentMatches in PrototypeState. Kept for scenario compatibility. */
  brackets?: TournamentMatch[];
  /** @deprecated Use teamIds. Kept for backward compat reading. */
  teams?: string[];
  /** @deprecated Use teamIds.length. */
  teamCount?: number;
  /** @deprecated Use sessionIds[0]. */
  linkedSessionId?: SessionId;
  /** @deprecated Replaced by scheduledStart. */
  date?: string;
}

export type TournamentMatchStatus =
  | 'scheduled'
  | 'ready'
  | 'live'
  | 'paused'
  | 'completed'
  | 'awaiting-verification'
  | 'verified'
  | 'walkover'
  | 'disqualified'
  | 'abandoned'
  | 'cancelled';

export type TournamentMatchResultType =
  | 'score'
  | 'walkover'
  | 'disqualification'
  | 'abandonment'
  | 'bye';

export interface TournamentMatchResultRevision {
  revisionNumber: number;
  scoreA?: number;
  scoreB?: number;
  winnerTeamId?: string;
  resultType: TournamentMatchResultType;
  reason?: string;
  recordedBy: string;
  recordedAt: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

export interface TournamentMatch {
  id: MatchId;
  tournamentId: TournamentId;
  roundNumber: number;
  matchNumber: number;
  roundLabel?: string;
  teamAId?: string;
  teamBId?: string;
  scheduledAt?: string;
  playingAreaId?: PlayingAreaId;
  refereeId?: string;
  status: TournamentMatchStatus;
  scoreA?: number;
  scoreB?: number;
  winnerTeamId?: string;
  resultType?: TournamentMatchResultType;
  resultRevisions?: TournamentMatchResultRevision[];
  startedAt?: string;
  endedAt?: string;
  verifiedAt?: string;
  verifiedBy?: string;
  isBye?: boolean;
  walkoverReason?: string;
  disqualificationReason?: string;
  disqualifiedTeamId?: string;
  abandonReason?: string;
  notes?: string;
  nextMatchId?: MatchId;
  createdAt?: string;
  updatedAt?: string;
  /** @deprecated Use teamAId */
  teamA?: string;
  /** @deprecated Use teamBId */
  teamB?: string;
  /** @deprecated Use winnerTeamId */
  winner?: string;
  /** @deprecated Use roundLabel or roundNumber */
  round?: string;
}

/** @deprecated Use TournamentMatch */
export type Match = TournamentMatch;

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
  /** Present on ledger rows derived from a Payment / Refund record. */
  paymentId?: string;
  refundId?: string;
  reference?: string;
}

/* ------------------------------------------------------------------
 * SA-P2H: Safety Incidents
 * ------------------------------------------------------------------ */

export type IncidentCategory =
  | 'injury'
  | 'medical'
  | 'misconduct'
  | 'harassment'
  | 'equipment'
  | 'venue'
  | 'weather'
  | 'crowd'
  | 'staff'
  | 'participant'
  | 'safeguarding'
  | 'other';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';

export type IncidentStatus =
  | 'reported'
  | 'acknowledged'
  | 'triaged'
  | 'active'
  | 'investigating'
  | 'escalated'
  | 'monitoring'
  | 'resolved'
  | 'closed';

export interface Incident {
  id: IncidentId;
  incidentCode?: string;
  sessionId?: SessionId;
  tournamentId?: TournamentId;
  matchId?: MatchId;
  territoryId?: TerritoryId;
  cityId?: CityId;
  venueId?: VenueId;
  category?: IncidentCategory;
  severity?: IncidentSeverity;
  status?: IncidentStatus;
  reportedBy?: string;
  reportedAt?: string;
  occurredAt?: string;
  participantTemporaryIds?: string[];
  staffIds?: string[];
  immediateAction?: string;
  medicalAssistance?: boolean;
  emergencyServicesPlaceholder?: string;
  venueEscalated?: boolean;
  investigatorId?: string;
  investigationSummary?: string;
  resolution?: string;
  followUpOwnerId?: string;
  followUpDueAt?: string;
  closedAt?: string;
  closedBy?: string;
  privateDataAccessLogIds?: string[];
  evidenceItemIds?: EvidenceItemId[];
  notes?: string;
  triageSeverityReview?: string;
  triageImmediateRisk?: string;
  triageVenueImpact?: string;
  triageSessionImpact?: string;
  triageProtectionActions?: string;
  triageFollowUp?: string;
  triageRecommendation?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  triagedAt?: string;
  triagedBy?: string;
  escalatedAt?: string;
  escalationReason?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt?: string;
  updatedAt?: string;
  /** @deprecated Use reportedBy */
  reporterId?: string;
  /** @deprecated Use category */
  type?: string;
  /** @deprecated Use occurredAt */
  time?: string;
  /** @deprecated Use participantTemporaryIds */
  peopleInvolved?: string[];
  /** @deprecated Use venueEscalated */
  escalatedToVenue?: boolean;
  /** @deprecated Use followUpOwnerId */
  ownerId?: string;
}

/* ------------------------------------------------------------------
 * SA-P2H: Evidence Placeholders
 * ------------------------------------------------------------------ */

export type EvidenceType =
  | 'image-placeholder'
  | 'video-placeholder'
  | 'document-placeholder'
  | 'witness-statement'
  | 'staff-note'
  | 'venue-report'
  | 'medical-placeholder';

export type EvidenceSensitivity = 'low' | 'medium' | 'high' | 'restricted';
export type EvidenceStatus = 'pending' | 'collected' | 'reviewed' | 'archived';

export interface EvidenceItem {
  id: EvidenceItemId;
  incidentId: IncidentId;
  type: EvidenceType;
  label: string;
  description?: string;
  placeholderFileName?: string;
  capturedBy?: string;
  capturedAt?: string;
  sensitivity: EvidenceSensitivity;
  status: EvidenceStatus;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------
 * SA-P2H: Disputes
 * ------------------------------------------------------------------ */

export type DisputeType =
  | 'match-result'
  | 'participant-conduct'
  | 'eligibility'
  | 'booking-refund'
  | 'team-allocation'
  | 'staff-decision'
  | 'venue-issue'
  | 'other';

export type DisputeStatus =
  | 'submitted'
  | 'under-review'
  | 'evidence-requested'
  | 'decision-pending'
  | 'upheld'
  | 'rejected'
  | 'partially-upheld'
  | 'closed';

export interface Dispute {
  id: DisputeId;
  type: DisputeType;
  status: DisputeStatus;
  reason: string;
  relatedEntityType: string;
  relatedEntityId: string;
  tournamentId?: TournamentId;
  matchId?: MatchId;
  sessionId?: SessionId;
  bookingId?: BookingId;
  /** Who raised the dispute (team captain, customer, staff member) as recorded. */
  submittedBy: string;
  submittedAt: string;
  /** Operator who logged the dispute in the console. */
  recordedBy?: string;
  reviewerId?: string;
  assignedAt?: string;
  evidenceRequested?: boolean;
  evidenceRequestedAt?: string;
  decision?: string;
  decisionReason?: string;
  decidedBy?: string;
  decidedAt?: string;
  correctionCreated?: boolean;
  correctionId?: string;
  closedAt?: string;
  closedBy?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------
 * SA-P2H: Moderation Cases & Actions
 * ------------------------------------------------------------------ */

export type ModerationCaseCategory =
  | 'misconduct'
  | 'harassment'
  | 'repeated-misconduct'
  | 'safety-violation'
  | 'fraud'
  | 'eligibility-violation'
  | 'other';

export type ModerationCaseSeverity = 'low' | 'medium' | 'high' | 'critical';

export type ModerationCaseStatus =
  | 'open'
  | 'reviewing'
  | 'action-proposed'
  | 'approved'
  | 'rejected'
  | 'monitoring'
  | 'closed';

export interface ModerationCase {
  id: ModerationCaseId;
  subjectTemporaryId?: string;
  subjectPersonId?: string;
  relatedIncidentIds?: IncidentId[];
  relatedSessionIds?: SessionId[];
  relatedTournamentIds?: TournamentId[];
  relatedDisputeIds?: DisputeId[];
  category: ModerationCaseCategory;
  severity: ModerationCaseSeverity;
  status: ModerationCaseStatus;
  assignedReviewerId?: string;
  evidencePlaceholderIds?: EvidenceItemId[];
  previousActionIds?: ModerationActionId[];
  recommendedAction?: string;
  decision?: string;
  decisionReason?: string;
  decidedBy?: string;
  decidedAt?: string;
  originType: string;
  originId: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type ModerationActionType =
  | 'informal-note'
  | 'formal-warning'
  | 'activity-restriction'
  | 'venue-restriction'
  | 'temporary-suspension'
  | 'permanent-ban';

export type ModerationActionStatus =
  | 'proposed'
  | 'approved'
  | 'active'
  | 'rejected'
  | 'expired'
  | 'revoked';

export type ModerationScope =
  | 'platform'
  | 'franchise'
  | 'territory'
  | 'city'
  | 'venue'
  | 'activity-category'
  | 'tournament';

export interface ModerationAction {
  id: ModerationActionId;
  caseId: ModerationCaseId;
  type: ModerationActionType;
  subjectTemporaryId?: string;
  subjectPersonId?: string;
  reason: string;
  evidenceIds?: string[];
  scope: ModerationScope;
  scopeEntityId?: string;
  effectiveDate: string;
  expiryDate?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  revokedBy?: string;
  revokedAt?: string;
  revocationReason?: string;
  status: ModerationActionStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------
 * SA-P2H: Refund Exceptions
 * ------------------------------------------------------------------ */

export type RefundExceptionStatus =
  | 'recommended'
  | 'under-review'
  | 'approved'
  | 'rejected'
  | 'completed';

export type RefundExceptionReason =
  | 'safety-incident'
  | 'tournament-cancellation'
  | 'match-abandonment'
  | 'venue-failure'
  | 'medical-incident'
  | 'misconduct-decision'
  | 'dispute-outcome';

export interface RefundException {
  id: RefundExceptionId;
  incidentId?: IncidentId;
  disputeId?: DisputeId;
  tournamentId?: TournamentId;
  matchId?: MatchId;
  sessionId?: SessionId;
  bookingId?: BookingId;
  reason: RefundExceptionReason;
  amount: number;
  currency?: string;
  status: RefundExceptionStatus;
  recommendedBy: string;
  recommendedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  linkedRefundId?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Signal {
  id: string;
  kind: "join" | "strike" | "alert" | "close" | "system";
  message: string;
  sessionId?: SessionId;
  at: string;
  /** ISO-8601 time the signal was raised. */
  atIso?: string;
  read: boolean;
}

export interface AuditEvent {
  id: string;
  sessionId?: SessionId;
  action: string;
  operatorId: string;
  /** Display label kept for older records, e.g. "Today, 18:42". */
  timestamp: string;
  /** ISO-8601 time the event was recorded. Present on every record written since the production pass. */
  at?: string;
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

/* ------------------------------------------------------------------
 * SA-P2G: Live Session Operations, Scoring & Completion
 * ------------------------------------------------------------------ */

export type LiveSessionStatus =
  | "Ready"
  | "Opening"
  | "Live"
  | "Paused"
  | "Emergency"
  | "Ending"
  | "Ended"
  | "Completed";

export interface LiveSessionState {
  id: string;
  sessionId: SessionId;
  status: LiveSessionStatus;
  accumulatedActiveSeconds: number;
  activeStartedAt?: string;
  pausedAt?: string;
  resumedAt?: string;
  endedAt?: string;
  completedAt?: string;
  pauseReason?: string;
  emergencyMode: boolean;
  emergencyReason?: string;
  emergencyAction?: string;
  safetyContactConfirmed?: boolean;
  currentStage?: string;
  currentMatchId?: string;
  activeTeamIds?: string[];
  operationalOwnerId?: string;
  updatedAt: string;
}

export type ActivitySegmentType =
  | "Briefing"
  | "Warm-up"
  | "Match"
  | "Round"
  | "Activity"
  | "Break"
  | "Cooldown"
  | "Wrap-up";

export type ActivitySegmentStatus =
  | "Planned"
  | "Ready"
  | "Active"
  | "Paused"
  | "Completed"
  | "Skipped"
  | "Cancelled";

export interface ActivitySegment {
  id: string;
  sessionId: SessionId;
  name: string;
  type: ActivitySegmentType;
  sequence: number;
  status: ActivitySegmentStatus;
  plannedStart?: string;
  actualStart?: string;
  actualEnd?: string;
  teamIds?: string[];
  notes?: string;
  resultId?: string;
  skipReason?: string;
  createdAt: string;
  updatedAt: string;
}

export type ResultStatus = "Draft" | "Confirmed" | "Corrected" | "Disputed";
export type ResultType = "score" | "outcome" | "draw" | "abandoned" | "walkover" | "no-contest";

export interface TeamScore {
  teamId: string;
  score: number;
}

export interface ResultRevision {
  revisionNumber: number;
  resultType: ResultType;
  teamScores?: TeamScore[];
  winnerTeamId?: string;
  outcome?: string;
  status: ResultStatus;
  recordedBy: string;
  recordedAt: string;
  reason?: string;
}

export interface SegmentResult {
  id: string;
  sessionId: SessionId;
  segmentId: string;
  resultType: ResultType;
  teamScores?: TeamScore[];
  winnerTeamId?: string;
  outcome?: string;
  status: ResultStatus;
  recordedBy: string;
  recordedAt: string;
  correctedAt?: string;
  correctionReason?: string;
  approvedBy?: string;
  revisions: ResultRevision[];
  createdAt: string;
  updatedAt: string;
}

export type LiveNoteType =
  | "general"
  | "staff"
  | "equipment"
  | "venue"
  | "participant"
  | "safety"
  | "timing"
  | "rule"
  | "other";

export type LiveNoteSeverity = "info" | "warning" | "critical";

export interface LiveOperationalNote {
  id: string;
  sessionId: SessionId;
  type: LiveNoteType;
  severity: LiveNoteSeverity;
  time: string;
  operatorId: string;
  relatedSegmentId?: string;
  note: string;
  resolutionState: "open" | "resolved" | "carried-forward";
  followUpRequired: boolean;
  createdAt: string;
}

export type EquipmentItemStatus = "required" | "available" | "in-use" | "missing" | "damaged" | "returned";

export interface EquipmentCheckItem {
  id: string;
  sessionId: SessionId;
  equipmentName: string;
  isCritical: boolean;
  requiredCount: number;
  availableCount: number;
  issuedCount: number;
  missingCount: number;
  damagedCount: number;
  returnedCount: number;
  status: EquipmentItemStatus;
  note?: string;
  updatedAt: string;
}

export interface SessionCompletionSnapshot {
  sessionId: SessionId;
  completedAt: string;
  completedBy: string;
  attendanceTotals: {
    expected: number;
    checkedIn: number;
    late: number;
    missing: number;
    noShow: number;
    denied: number;
    fillRate: number;
  };
  durationSeconds: number;
  finalResults: SegmentResult[];
  financialSummary: {
    grossRevenue: number;
    refundsTotal: number;
    netTake: number;
  };
  staffSummary: {
    leadCoordinator: string;
    safetyContact: string;
    staffCheckedIn: number;
  };
  equipmentExceptions: EquipmentCheckItem[];
  safetySignals: string[];
  followUpItems: string[];
  label: string;
  /** Free-text closing note written by the operator who completed the session. */
  closingNote?: string;
  /** Present when the session was completed with unresolved checklist items. */
  overrideReason?: string;
}

/* ------------------------------------------------------------------
   PLATFORM RECORDS (workspace-level, added in the production pass)
------------------------------------------------------------------- */

/** One immutable entry in the activity record: every console command is journalled. */
export interface ActivityRecord {
  id: string;
  /** ISO-8601 timestamp. */
  at: string;
  actorId: string;
  actorName: string;
  roleId: string;
  /** Store command name, e.g. "confirmBookingPayment". */
  command: string;
  /** Human-readable module, e.g. "Bookings". */
  module: string;
  summary: string;
  /** Primary entity id the command acted on, when known. */
  target?: string;
  outcome: "ok" | "rejected";
  detail?: string;
}

/** Operator account for the console (the people who sign in). */
export interface OperatorAccount {
  id: string;
  name: string;
  title: string;
  role: RoleId;
  territoryId: TerritoryId;
  initials: string;
  email?: string;
  status: "active" | "suspended";
  createdAt?: string;
  updatedAt?: string;
}

export type GovernanceCollectionName =
  | "governanceCases"
  | "organizers"
  | "arenas"
  | "events"
  | "commercialAgreements"
  | "riskAlerts"
  | "refundCases"
  | "settlementControls"
  | "policyVersions"
  | "auditEvents"
  | "customers"
  | "users";

/** A marketplace-governance document. Mirrors the Firestore document shape. */
export interface GovernanceDoc {
  collection: GovernanceCollectionName;
  id: string;
  version: number;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
