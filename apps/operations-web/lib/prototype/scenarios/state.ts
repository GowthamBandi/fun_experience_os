import type {
  Franchise,
  Territory,
  City,
  Venue,
  PlayingArea,
  ActivityCategory,
  ExperienceTemplate,
  TemplateVersion,
  ScheduledSession,
  Booking,
  CrewMember,
  Shift,
  Tournament,
  Transaction,
  Incident,
  Signal,
  AuditEvent,
  DayPoint,
  PromoCode,
  Payment,
  Refund,
  TemporaryIdentity,
  IdentityPattern,
  Team,
  TeamAssignment,
  CheckInRecord,
  EmergencyAccessLog,
  LiveSessionState,
  ActivitySegment,
  SegmentResult,
  LiveOperationalNote,
  EquipmentCheckItem,
  SessionCompletionSnapshot,
  EvidenceItem,
  Dispute,
  ModerationCase,
  ModerationAction,
  RefundException,
  TournamentMatch
} from "../entities";

export interface PrototypeState {
  franchises: Franchise[];
  territories: Territory[];
  cities: City[];
  venues: Venue[];
  playingAreas: PlayingArea[];
  categories: ActivityCategory[];
  templates: ExperienceTemplate[];
  templateVersions: TemplateVersion[];
  sessions: ScheduledSession[];
  bookings: Booking[];
  payments: Payment[];
  refunds: Refund[];
  temporaryIdentities: TemporaryIdentity[];
  identityPatterns: IdentityPattern[];
  teams: Team[];
  teamAssignments: TeamAssignment[];
  checkInRecords: CheckInRecord[];
  emergencyAccessLogs: EmergencyAccessLog[];
  liveSessionStates: LiveSessionState[];
  activitySegments: ActivitySegment[];
  segmentResults: SegmentResult[];
  liveOperationalNotes: LiveOperationalNote[];
  equipmentCheckItems: EquipmentCheckItem[];
  sessionCompletionSnapshots: SessionCompletionSnapshot[];
  crew: CrewMember[];
  shifts: Shift[];
  tournaments: Tournament[];
  tournamentMatches: TournamentMatch[];
  transactions: Transaction[];
  incidents: Incident[];
  evidenceItems: EvidenceItem[];
  disputes: Dispute[];
  moderationCases: ModerationCase[];
  moderationActions: ModerationAction[];
  refundExceptions: RefundException[];
  signals: Signal[];
  audits: AuditEvent[];
  analytics: DayPoint[];
  promoCodes: PromoCode[];
}
