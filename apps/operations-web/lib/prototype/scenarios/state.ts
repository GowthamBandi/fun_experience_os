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
  PromoCode
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
  crew: CrewMember[];
  shifts: Shift[];
  tournaments: Tournament[];
  transactions: Transaction[];
  incidents: Incident[];
  signals: Signal[];
  audits: AuditEvent[];
  analytics: DayPoint[];
  promoCodes: PromoCode[];
}
