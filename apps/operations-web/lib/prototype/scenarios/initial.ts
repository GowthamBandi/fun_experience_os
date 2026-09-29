import {
  SEED_FRANCHISES,
  SEED_TERRITORIES,
  SEED_CITIES,
  SEED_VENUES,
  SEED_PLAYING_AREAS,
  SEED_CATEGORIES,
  SEED_TEMPLATES,
  SEED_TEMPLATE_VERSIONS,
  SEED_SESSIONS,
  SEED_BOOKINGS,
  SEED_PAYMENTS,
  SEED_REFUNDS,
  SEED_IDENTITY_PATTERNS,
  SEED_TEMPORARY_IDENTITIES,
  SEED_TEAMS,
  SEED_TEAM_ASSIGNMENTS,
  SEED_CHECK_IN_RECORDS,
  SEED_EMERGENCY_ACCESS_LOGS,
  SEED_LIVE_SESSION_STATES,
  SEED_ACTIVITY_SEGMENTS,
  SEED_SEGMENT_RESULTS,
  SEED_LIVE_OPERATIONAL_NOTES,
  SEED_EQUIPMENT_CHECK_ITEMS,
  SEED_SESSION_COMPLETION_SNAPSHOTS,
  SEED_CREW,
  SEED_SHIFTS,
  SEED_TOURNAMENTS,
  SEED_TRANSACTIONS,
  SEED_INCIDENTS,
  SEED_SIGNALS,
  SEED_AUDITS,
  SEED_ANALYTICS,
  SEED_PROMOS,
  SEED_TOURNAMENT_MATCHES,
  SEED_EVIDENCE_ITEMS,
  SEED_DISPUTES,
  SEED_MODERATION_CASES,
  SEED_MODERATION_ACTIONS,
  SEED_REFUND_EXCEPTIONS
} from "../seed";
import { SEED_GOVERNANCE } from "../governance/seed";
import { OPERATORS } from "@/lib/data/mock";
import type { OperatorAccount } from "../entities";
import type { PrototypeState } from "./state";

export const SEED_OPERATORS: OperatorAccount[] = OPERATORS.map((o) => ({ ...o, status: "active" as const }));

/** Fresh deterministic seed. Every call returns an independent copy. */
export const getInitialState = (): PrototypeState => ({
  franchises: [...SEED_FRANCHISES],
  territories: [...SEED_TERRITORIES],
  cities: [...SEED_CITIES],
  venues: [...SEED_VENUES],
  playingAreas: [...SEED_PLAYING_AREAS],
  categories: [...SEED_CATEGORIES],
  templates: [...SEED_TEMPLATES],
  templateVersions: [...SEED_TEMPLATE_VERSIONS],
  sessions: [...SEED_SESSIONS],
  bookings: [...SEED_BOOKINGS],
  payments: [...SEED_PAYMENTS],
  refunds: [...SEED_REFUNDS],
  temporaryIdentities: [...SEED_TEMPORARY_IDENTITIES],
  identityPatterns: [...SEED_IDENTITY_PATTERNS],
  teams: [...SEED_TEAMS],
  teamAssignments: [...SEED_TEAM_ASSIGNMENTS],
  checkInRecords: [...SEED_CHECK_IN_RECORDS],
  emergencyAccessLogs: [...SEED_EMERGENCY_ACCESS_LOGS],
  liveSessionStates: [...SEED_LIVE_SESSION_STATES],
  activitySegments: [...SEED_ACTIVITY_SEGMENTS],
  segmentResults: [...SEED_SEGMENT_RESULTS],
  liveOperationalNotes: [...SEED_LIVE_OPERATIONAL_NOTES],
  equipmentCheckItems: [...SEED_EQUIPMENT_CHECK_ITEMS],
  sessionCompletionSnapshots: [...SEED_SESSION_COMPLETION_SNAPSHOTS],
  crew: [...SEED_CREW],
  shifts: [...SEED_SHIFTS],
  tournaments: [...SEED_TOURNAMENTS],
  tournamentMatches: [...SEED_TOURNAMENT_MATCHES],
  transactions: [...SEED_TRANSACTIONS],
  incidents: [...SEED_INCIDENTS],
  evidenceItems: [...SEED_EVIDENCE_ITEMS],
  disputes: [...SEED_DISPUTES],
  moderationCases: [...SEED_MODERATION_CASES],
  moderationActions: [...SEED_MODERATION_ACTIONS],
  refundExceptions: [...SEED_REFUND_EXCEPTIONS],
  signals: [...SEED_SIGNALS],
  audits: [...SEED_AUDITS],
  analytics: [...SEED_ANALYTICS],
  promoCodes: [...SEED_PROMOS],
  operators: SEED_OPERATORS.map((o) => ({ ...o })),
  governance: SEED_GOVERNANCE.map((d) => ({ ...d, data: { ...d.data } })),
  activityLog: []
});

/**
 * A clean workspace with no sample records. Operator accounts are kept so the
 * console can still be signed into; everything else starts empty.
 */
export const getEmptyState = (): PrototypeState => {
  const empty = Object.fromEntries(Object.keys(getInitialState()).map((k) => [k, []])) as unknown as PrototypeState;
  return { ...empty, operators: SEED_OPERATORS.map((o) => ({ ...o })) };
};
