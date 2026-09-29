"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MotionConfig } from "framer-motion";
import type { Operator, Role, RoleId, Territory } from "@/lib/types";
import { ROLES } from "@/lib/data/mock";
import { buildActivityRecord } from "@/lib/activity";
import { canAccess } from "@/lib/nav";
import type {
  Incident,
  EvidenceStatus,
  Signal,
  SessionStatus,
  Franchise as PrototypeFranchise,
  Territory as PrototypeTerritory,
  City as PrototypeCity,
  Venue as PrototypeVenue,
  PlayingArea as PrototypePlayingArea,
  OperatorAccount
} from "./prototype/entities";
import {
  getInitialState,
  getEmptyState,
  applyScenario,
  type PrototypeState
} from "./prototype/scenarios";
import {
  loadWorkspace,
  saveWorkspace,
  clearWorkspace,
  parseWorkspaceBackup,
  downloadWorkspaceBackup,
  onWorkspaceSavedElsewhere,
  onWorkspaceConflict,
  loadDemoStep,
  saveDemoStep,
  type LoadSource
} from "./prototype/persistence";
import { migrateState } from "./prototype/migrations";
import { resolveDataMode } from "./firebase/mode";

/** Local workspace: the operator account is the source of truth for role. Firebase: the verified token claim is. */
const ROLE_FROM_ACCOUNT = resolveDataMode() === "prototype";
import {
  decideGovernanceCase as decideGovernanceCaseCommand,
  setGovernanceEntityStatus as setGovernanceEntityStatusCommand,
  submitGovernanceIntake as submitGovernanceIntakeCommand,
  type GovernanceOutcome,
  type GovernanceEntityType,
  type GovernanceEntityStatus,
  type IntakeInput
} from "./prototype/governance/commands";
import {
  createFranchise,
  createTerritory,
  createCity,
  createVenue,
  createPlayingArea,
  updateFranchise,
  changeFranchiseStatus,
  changeFranchiseHead,
  updateTerritory,
  changeTerritoryStatus,
  assignTerritoryManager,
  updateCity,
  changeCityStatus,
  assignCityManager,
  updateVenue,
  changeVenueStatus,
  addVenueSafetyNote,
  updatePlayingArea,
  changePlayingAreaStatus,
  addOperationalNote,
  createActivityCategory,
  updateActivityCategory,
  changeCategoryStatus,
  duplicateCategory,
  createExperienceTemplate,
  updateExperienceTemplate,
  changeTemplateStatus,
  duplicateExperienceTemplate,
  duplicateTemplateVersion,
  addCatalogNote,
  createSession,
  cancelBooking,
  generateTemporaryIds,
  allocateTeams,
  completeSession as completeSessionRepo,
  cancelSession,
  updateSessionStatus,
  strikeBooking as strikeBookingCommand,
  createBookingReservation,
  confirmBookingPayment,
  failBookingPayment,
  expireReservation,
  joinWaitlist,
  offerWaitlistSlot,
  acceptWaitlistOffer,
  expireWaitlistOffer,
  initiateRefund,
  approveRefund,
  rejectRefund,
  completeRefund,
  reconcilePayment,
  createIdentityPattern,
  setIdentityPatternStatus,
  generateTemporaryIdentities,
  lockTemporaryIdentities,
  revokeTemporaryIdentity,
  createTeams,
  allocateTeamsRandomly,
  moveTeamParticipant,
  swapTeamParticipants,
  lockTeams,
  unlockTeamsWithOverride,
  triggerReveal,
  delayReveal,
  cancelReveal,
  createCheckInRecords,
  updateCheckInStatus,
  checkInStaff,
  requestEmergencyIdentityAccess,
  closeEmergencyIdentityAccess,
  openSession,
  startLiveSession,
  pauseLiveSession,
  resumeLiveSession,
  enterEmergencyMode,
  exitEmergencyMode,
  endLiveSession,
  createActivitySegment,
  startActivitySegment,
  completeActivitySegment,
  skipActivitySegment,
  createDraftResult,
  confirmResult,
  correctResult,
  addLiveOperationalNote,
  updateEquipmentStatus,
  completeLiveSession,
  createTournament,
  assignTournamentTeams,
  generateSingleEliminationBracket,
  publishTournament,
  assignMatchReferee,
  updateMatchReadiness,
  startTournamentMatch,
  pauseTournamentMatch,
  resumeTournamentMatch,
  confirmTournamentMatchResult,
  verifyTournamentMatchResult,
  correctTournamentMatchResult,
  declareWalkover,
  disqualifyTeam,
  abandonMatch,
  completeTournament,
  reportIncident,
  acknowledgeIncident,
  triageIncident,
  assignInvestigator,
  escalateIncident,
  updateInvestigation,
  resolveIncident,
  closeIncident,
  addEvidenceRecord,
  updateEvidenceStatus,
  createFollowUp,
  submitDispute,
  assignDisputeReviewer,
  requestDisputeEvidence,
  decideDispute,
  closeDispute,
  createModerationCase,
  proposeModerationAction,
  approveModerationAction,
  rejectModerationAction,
  revokeModerationAction,
  closeModerationCase,
  type TournamentInput,
  type MatchResultInput,
  type MatchCorrectionInput,
  type IncidentReportInput,
  type IncidentTriageInput,
  type EvidenceInput,
  type DisputeInput,
  type DisputeDecisionInput,
  type ModerationCaseInput,
  type ModerationProposalInput,
  recommendRefundException,
  approveRefundException,
  rejectRefundException,
  releaseExpiredHolds,
  pushAudit,
  pushSignal,
  type FranchiseInput,
  type TerritoryInput,
  type CityInput,
  type VenueInput,
  type PlayingAreaInput,
  type CategoryInput,
  type TemplateInput,
  type SessionInput,
  createCrewMember as createCrewMemberCommand,
  updateCrewMember as updateCrewMemberCommand,
  assignCrewToSession as assignCrewToSessionCommand,
  unassignCrewFromSession as unassignCrewFromSessionCommand,
  recordStaffAttendance as recordStaffAttendanceCommand,
  type AttendanceAction,
  type CrewInput,
  type StaffSlot,
  type PaymentRecordInput,
  type PayoutInput
} from "./prototype/services";
import type {
  Booking,
  BookingSource,
  BookingType,
  Refund,
  RefundType,
  ActivityCategory,
  CategoryStatus,
  ExperienceTemplate,
  TemplateStatus
} from "./prototype/entities";
import type {
  IdentityPattern,
  CheckInStatus,
  CheckInMethod,
  EmergencyAccessLog,
  ActivitySegment,
  ResultType,
  TeamScore,
  LiveNoteType,
  LiveNoteSeverity,
  LiveOperationalNote,
  EquipmentItemStatus
} from "./prototype/entities";

const AUTH_KEY = "xos.auth";
const CONSOLE_KEY = "xos.console";

interface PersistedAuth {
  operatorId: string;
  roleId: RoleId;
}

interface PersistedConsole {
  territoryId: string;
  sidebarCollapsed: boolean;
}

export interface WorkspaceStatus {
  source: LoadSource | null;
  saveState: "idle" | "saving" | "saved" | "error";
  lastSavedAt: string | null;
}

export type CommandOutcome = { error?: string };
export type CreatedOutcome = CommandOutcome & { id?: string };

interface StoreValue {
  authed: boolean;
  hydrated: boolean;
  workspace: WorkspaceStatus;
  operators: OperatorAccount[];
  operator: Operator | null;
  role: Role;
  territory: Territory;
  sidebarCollapsed: boolean;
  paletteOpen: boolean;
  signalOpen: boolean;
  canAccess: (href: string) => boolean;

  // Normalized Prototype State
  state: PrototypeState;
  demoStep: number;

  // Auth / console
  signIn: (operatorId: string, roleId: RoleId) => void;
  signOut: () => void;
  switchRole: (roleId: RoleId) => void;
  switchTerritory: (id: string) => void;
  toggleSidebar: () => void;
  setPaletteOpen: (open: boolean) => void;
  setSignalOpen: (open: boolean) => void;
  markAllRead: () => void;
  markSignalRead: (id: string) => void;
  markSignalUnread: (id: string) => void;

  // Create commands (services)
  createFranchise: (input: FranchiseInput) => CreatedOutcome;
  createTerritory: (input: TerritoryInput) => CreatedOutcome;
  createCity: (input: CityInput) => CreatedOutcome;
  createVenue: (input: VenueInput) => CreatedOutcome;
  createPlayingArea: (input: PlayingAreaInput) => CreatedOutcome;
  createActivityCategory: (input: CategoryInput) => CreatedOutcome;
  updateActivityCategory: (id: string, patch: Partial<ActivityCategory>) => CommandOutcome;
  changeCategoryStatus: (id: string, status: CategoryStatus, reason?: string) => CommandOutcome;
  duplicateCategory: (id: string) => CreatedOutcome;
  createExperienceTemplate: (input: TemplateInput) => CreatedOutcome;
  updateExperienceTemplate: (id: string, patch: Partial<ExperienceTemplate>, reason?: string, changedFields?: string[]) => CommandOutcome;
  changeTemplateStatus: (id: string, status: TemplateStatus, reason?: string) => CommandOutcome;
  duplicateExperienceTemplate: (id: string) => CreatedOutcome;
  duplicateTemplateVersion: (versionId: string) => CreatedOutcome;
  addCatalogNote: (entity: string, name: string, note: string) => CommandOutcome;
  createSession: (input: SessionInput) => CommandOutcome & { id?: string };
  createCrewMember: (input: CrewInput) => CreatedOutcome;
  updateCrewMember: (id: string, patch: Partial<CrewInput>) => CommandOutcome;
  assignCrewToSession: (params: { sessionId: string; crewId: string; slot: StaffSlot }) => CommandOutcome;
  unassignCrewFromSession: (params: { sessionId: string; slot: StaffSlot; reason: string }) => CommandOutcome;
  recordStaffAttendance: (params: { crewId: string; action: AttendanceAction; reason?: string }) => CommandOutcome;

  // Geography update/status commands (services)
  updateFranchise: (id: string, patch: Partial<PrototypeFranchise>) => CommandOutcome;
  changeFranchiseStatus: (id: string, status: PrototypeFranchise["status"], reason?: string) => CommandOutcome;
  changeFranchiseHead: (id: string, head: string) => CommandOutcome;
  updateTerritory: (id: string, patch: Partial<PrototypeTerritory>) => CommandOutcome;
  changeTerritoryStatus: (id: string, status: PrototypeTerritory["status"], reason?: string) => CommandOutcome;
  assignTerritoryManager: (id: string, managerId: string) => CommandOutcome;
  updateCity: (id: string, patch: Partial<PrototypeCity>) => CommandOutcome;
  changeCityStatus: (id: string, status: PrototypeCity["status"], reason?: string) => CommandOutcome;
  assignCityManager: (id: string, managerId: string) => CommandOutcome;
  updateVenue: (id: string, patch: Partial<PrototypeVenue>) => CommandOutcome;
  changeVenueStatus: (id: string, status: PrototypeVenue["status"], reason?: string) => CommandOutcome;
  addVenueSafetyNote: (id: string, note: string) => CommandOutcome;
  updatePlayingArea: (id: string, patch: Partial<PrototypePlayingArea>) => CommandOutcome;
  changePlayingAreaStatus: (id: string, status: PrototypePlayingArea["status"], reason?: string) => CommandOutcome;
  addOperationalNote: (entity: string, name: string, note: string) => CommandOutcome;

  // Operational commands (services)
  /** Cancel a booking or waitlist entry; a paid booking gets a refund request. */
  cancelBooking: (id: string, reason: string, byCompany?: boolean) => CommandOutcome & { refundId?: string };
  generateTemporaryIds: (sessionId: string) => void;
  allocateTeams: (sessionId: string) => void;
  completeSession: (sessionId: string) => CommandOutcome;
  /** Cancels every booking and creates a refund request for every paid booking. */
  cancelSession: (sessionId: string, reason: string) => CommandOutcome & { refundCount?: number };
  updateSessionStatus: (id: string, status: SessionStatus) => void;
  strikeBooking: (id: string) => CommandOutcome;

  // Bookings, holds, waitlist and money. Every command returns its outcome.
  createBookingReservation: (params: { sessionId: string; alias: string; phoneMask?: string; bookingType?: BookingType; source?: BookingSource; amount?: number }) => { booking?: Booking; error?: string };
  /** Record a payment received outside the console (payment provider not connected). */
  confirmBookingPayment: (id: string, payment: PaymentRecordInput) => CommandOutcome;
  failBookingPayment: (id: string, reason: string) => CommandOutcome;
  expireReservation: (id: string) => CommandOutcome;
  joinWaitlist: (params: { sessionId: string; alias: string; phoneMask?: string }) => { booking?: Booking; error?: string };
  offerWaitlistSlot: (sessionId: string) => { booking?: Booking; error?: string };
  acceptWaitlistOffer: (bookingId: string) => CommandOutcome;
  expireWaitlistOffer: (bookingId: string) => CommandOutcome;
  initiateRefund: (params: { bookingId: string; amount: number; reason: string; type?: RefundType }) => { refund?: Refund; error?: string };
  approveRefund: (refundId: string) => CommandOutcome;
  rejectRefund: (refundId: string, reason: string) => CommandOutcome;
  /** Record that an approved refund was paid out, with method and reference. */
  completeRefund: (refundId: string, payout: PayoutInput) => CommandOutcome;
  reconcilePayment: (paymentId: string) => CommandOutcome;

  // Session operations (identity, teams, reveal, check-in, emergency access). Every command returns its outcome.
  createIdentityPattern: (input: { name: string; prefix: string; separator?: string; numberLength?: number; aliasStyle?: string }) => { pattern?: IdentityPattern; error?: string };
  setIdentityPatternStatus: (patternId: string, status: "active" | "deprecated") => CommandOutcome;
  generateTemporaryIdentities: (sessionId: string, patternId?: string) => CommandOutcome;
  lockTemporaryIdentities: (sessionId: string) => CommandOutcome;
  revokeTemporaryIdentity: (identityId: string, reason: string) => CommandOutcome;
  createTeams: (sessionId: string, numTeams?: number, teamCapacity?: number) => CommandOutcome;
  allocateTeamsRandomly: (sessionId: string) => CommandOutcome;
  moveTeamParticipant: (params: { sessionId: string; bookingId: string; targetTeamId: string; reason: string }) => CommandOutcome;
  swapTeamParticipants: (params: { sessionId: string; bookingIdA: string; bookingIdB: string; reason: string }) => CommandOutcome;
  lockTeams: (sessionId: string) => CommandOutcome;
  unlockTeamsWithOverride: (sessionId: string, reason: string) => CommandOutcome;
  triggerReveal: (sessionId: string, overrideReason?: string) => CommandOutcome;
  delayReveal: (sessionId: string, newRevealTime: string, reason: string) => CommandOutcome;
  cancelReveal: (sessionId: string, reason: string) => CommandOutcome;
  createCheckInRecords: (sessionId: string) => CommandOutcome;
  updateCheckInStatus: (params: { sessionId: string; bookingId: string; targetStatus: CheckInStatus; method?: CheckInMethod; denialReason?: string; auditOverrideReason?: string }) => CommandOutcome;
  /** Accepts a crew id or a legacy operator id. */
  checkInStaff: (sessionId: string, personRef: string) => CommandOutcome;
  /** The acting operator and role are always the signed-in operator. */
  requestEmergencyIdentityAccess: (params: { sessionId?: string; bookingId: string; reason: string }) => { accessLog?: EmergencyAccessLog; error?: string };
  closeEmergencyIdentityAccess: (logId: string) => CommandOutcome;

  // Live operations. Emergency commands use the signed-in operator's id and role id.
  openSession: (sessionId: string, overrideReason?: string) => CommandOutcome;
  startLiveSession: (sessionId: string, overrideReason?: string) => CommandOutcome;
  pauseLiveSession: (sessionId: string, reason: string) => CommandOutcome;
  resumeLiveSession: (sessionId: string) => CommandOutcome;
  enterEmergencyMode: (params: { sessionId: string; reason: string; immediateAction: string; safetyContactConfirmed: boolean }) => CommandOutcome;
  exitEmergencyMode: (params: { sessionId: string; exitReason: string }) => CommandOutcome;
  endLiveSession: (sessionId: string) => CommandOutcome;
  createActivitySegment: (input: { sessionId: string; name: string; type: ActivitySegment["type"]; teamIds?: string[]; notes?: string }) => { segment?: ActivitySegment; error?: string };
  startActivitySegment: (sessionId: string, segmentId: string) => CommandOutcome;
  completeActivitySegment: (sessionId: string, segmentId: string) => CommandOutcome;
  skipActivitySegment: (sessionId: string, segmentId: string, reason: string) => CommandOutcome;
  createDraftResult: (params: { sessionId: string; segmentId: string; resultType: ResultType; teamScores?: TeamScore[]; winnerTeamId?: string; outcome?: string }) => CommandOutcome;
  confirmResult: (sessionId: string, segmentId: string) => CommandOutcome;
  correctResult: (params: { sessionId: string; segmentId: string; resultType: ResultType; teamScores?: TeamScore[]; winnerTeamId?: string; outcome?: string; reason: string }) => CommandOutcome;
  addLiveOperationalNote: (input: { sessionId: string; type: LiveNoteType; severity: LiveNoteSeverity; note: string; relatedSegmentId?: string; followUpRequired?: boolean }) => { note?: LiveOperationalNote; error?: string };
  updateEquipmentStatus: (params: { sessionId: string; equipmentId: string; status?: EquipmentItemStatus; issuedCount?: number; missingCount?: number; damagedCount?: number; returnedCount?: number; note?: string }) => CommandOutcome;
  completeLiveSession: (sessionId: string, overrideReason?: string, closingNote?: string) => CommandOutcome;

  // Tournament (every command returns { error } when refused)
  createTournament: (params: TournamentInput) => CreatedOutcome;
  assignTournamentTeams: (tournamentId: string, teams: Array<{ id?: string; name: string }>) => CommandOutcome;
  generateSingleEliminationBracket: (tournamentId: string) => CommandOutcome;
  publishTournament: (tournamentId: string) => CommandOutcome;
  assignMatchReferee: (tournamentId: string, matchId: string, refereeId: string) => CommandOutcome;
  updateMatchReadiness: (tournamentId: string, matchId: string, status: "scheduled" | "ready") => CommandOutcome;
  startTournamentMatch: (tournamentId: string, matchId: string) => CommandOutcome;
  pauseTournamentMatch: (tournamentId: string, matchId: string) => CommandOutcome;
  resumeTournamentMatch: (tournamentId: string, matchId: string) => CommandOutcome;
  confirmTournamentMatchResult: (params: MatchResultInput) => CommandOutcome;
  verifyTournamentMatchResult: (tournamentId: string, matchId: string) => CommandOutcome;
  correctTournamentMatchResult: (params: MatchCorrectionInput) => CommandOutcome;
  declareWalkover: (tournamentId: string, matchId: string, winnerTeamId: string, reason: string) => CommandOutcome;
  disqualifyTeam: (tournamentId: string, teamId: string, reason: string) => CommandOutcome;
  abandonMatch: (tournamentId: string, matchId: string, reason: string) => CommandOutcome;
  completeTournament: (tournamentId: string) => CommandOutcome & { championId?: string };

  // Safety incidents
  reportIncident: (params: IncidentReportInput) => CreatedOutcome;
  acknowledgeIncident: (incidentId: string) => CommandOutcome;
  triageIncident: (params: IncidentTriageInput) => CommandOutcome;
  assignInvestigator: (incidentId: string, investigatorId: string) => CommandOutcome;
  escalateIncident: (incidentId: string, reason: string) => CommandOutcome;
  updateInvestigation: (incidentId: string, summary: string) => CommandOutcome;
  resolveIncident: (incidentId: string, resolution: string) => CommandOutcome;
  closeIncident: (incidentId: string, notes: string) => CommandOutcome;
  addEvidenceRecord: (params: EvidenceInput) => CreatedOutcome;
  updateEvidenceStatus: (evidenceId: string, status: EvidenceStatus) => CommandOutcome;
  createFollowUp: (incidentId: string, followUpOwnerId: string, dueAt: string) => CommandOutcome;

  // Disputes
  submitDispute: (params: DisputeInput) => CreatedOutcome;
  assignDisputeReviewer: (disputeId: string, reviewerId: string) => CommandOutcome;
  requestDisputeEvidence: (disputeId: string, request: string) => CommandOutcome;
  decideDispute: (params: DisputeDecisionInput) => CommandOutcome;
  closeDispute: (disputeId: string) => CommandOutcome;

  // Moderation
  createModerationCase: (params: ModerationCaseInput) => CreatedOutcome;
  proposeModerationAction: (params: ModerationProposalInput) => CreatedOutcome;
  approveModerationAction: (actionId: string) => CommandOutcome;
  rejectModerationAction: (actionId: string, reason: string) => CommandOutcome;
  revokeModerationAction: (actionId: string, reason: string) => CommandOutcome;
  closeModerationCase: (caseId: string, note: string) => CommandOutcome;

  // Refund Exceptions
  recommendRefundException: (params: Parameters<typeof recommendRefundException>[1]) => CommandOutcome;
  /** Approve an exception; exceptions raised without a booking must name one. */
  approveRefundException: (exceptionId: string, bookingId?: string) => CommandOutcome & { refundId?: string };
  rejectRefundException: (exceptionId: string, reason: string) => CommandOutcome;

  // Incident / signal / audit helpers
  addIncident: (i: Incident) => void;
  updateIncident: (id: string, updates: Partial<Incident>) => void;
  addSignal: (s: Signal) => void;
  addAudit: (sessionId: string | undefined, action: string, description: string) => void;

  // Marketplace governance (local workspace mode)
  decideGovernanceCase: (caseId: string, expectedVersion: number, outcome: GovernanceOutcome, note: string) => CommandOutcome;
  setGovernanceEntityStatus: (entityType: GovernanceEntityType, entityId: string, expectedVersion: number, status: GovernanceEntityStatus, reason: string) => CommandOutcome;
  submitGovernanceIntake: (input: IntakeInput) => CommandOutcome & { id?: string };

  // Operator accounts
  createOperator: (input: { name: string; title: string; role: RoleId; territoryId: string; email?: string }) => CommandOutcome & { id?: string };
  updateOperator: (id: string, patch: Partial<Pick<OperatorAccount, "name" | "title" | "role" | "territoryId" | "email" | "status">>) => CommandOutcome;

  // Workspace records
  exportWorkspace: () => void;
  importWorkspace: (text: string) => CommandOutcome;
  startFreshWorkspace: () => void;

  // Demo controls
  resetDemoData: () => void;
  loadScenario: (name: string) => void;
  setDemoStep: (step: number) => void;
}

const StoreContext = createContext<StoreValue | null>(null);

function readAuth(): PersistedAuth | null {
  try {
    const raw = window.localStorage.getItem(AUTH_KEY);
    return raw ? (JSON.parse(raw) as PersistedAuth) : null;
  } catch {
    return null;
  }
}

function readConsole(): PersistedConsole {
  try {
    const raw = window.localStorage.getItem(CONSOLE_KEY);
    return raw ? (JSON.parse(raw) as PersistedConsole) : { territoryId: "hvd-central", sidebarCollapsed: false };
  } catch {
    return { territoryId: "hvd-central", sidebarCollapsed: false };
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<PersistedAuth | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [consolePrefs, setConsolePrefs] = useState<PersistedConsole>({
    territoryId: "hvd-central",
    sidebarCollapsed: false,
  });
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [signalOpen, setSignalOpen] = useState(false);

  // Workspace state. `stateRef` is the synchronous source of truth for commands;
  // React state mirrors it for rendering.
  const [state, setState] = useState<PrototypeState>(getInitialState);
  const stateRef = useRef<PrototypeState>(state);
  const [demoStep, setDemoStepState] = useState<number>(0);
  const [workspace, setWorkspace] = useState<WorkspaceStatus>({ source: null, saveState: "idle", lastSavedAt: null });
  const saveTimer = useRef<number | null>(null);
  const dirty = useRef(false);

  const flushSave = useCallback(async () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (!dirty.current) return;
    dirty.current = false;
    setWorkspace((w) => ({ ...w, saveState: "saving" }));
    const ok = await saveWorkspace(stateRef.current);
    setWorkspace((w) => ({ ...w, saveState: ok ? "saved" : "error", lastSavedAt: ok ? new Date().toISOString() : w.lastSavedAt }));
  }, []);

  const scheduleSave = useCallback(() => {
    dirty.current = true;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushSave(), 250);
  }, [flushSave]);

  const replaceState = useCallback((next: PrototypeState, save = true) => {
    stateRef.current = next;
    setState(next);
    if (save) scheduleSave();
  }, [scheduleSave]);

  useEffect(() => {
    let cancelled = false;
    setAuth(readAuth());
    setConsolePrefs(readConsole());
    setDemoStepState(loadDemoStep());
    void loadWorkspace().then(({ state: loaded, source, savedAt }) => {
      if (cancelled) return;
      stateRef.current = loaded;
      setState(loaded);
      setWorkspace({ source, saveState: "saved", lastSavedAt: savedAt ?? null });
      setHydrated(true);
    });
    const offOther = onWorkspaceSavedElsewhere(() => {
      void loadWorkspace().then(({ state: loaded, savedAt }) => {
        stateRef.current = loaded;
        setState(loaded);
        setWorkspace((w) => ({ ...w, saveState: "saved", lastSavedAt: savedAt ?? w.lastSavedAt }));
      });
    });
    const offConflict = onWorkspaceConflict((message) => {
      setWorkspace((w) => ({ ...w, saveState: "error" }));
      console.warn("[workspace] save conflict:", message);
      void loadWorkspace().then(({ state: loaded }) => {
        stateRef.current = loaded;
        setState(loaded);
        setWorkspace((w) => ({ ...w, saveState: "saved", lastSavedAt: new Date().toISOString() }));
        window.dispatchEvent(new CustomEvent("xos:workspace-conflict", { detail: message }));
      });
    });
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushSave();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      cancelled = true;
      offOther();
      offConflict();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [flushSave]);

  const persist = useCallback((key: string, value: unknown) => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }, []);

  /**
   * Single coordination primitive: apply a pure service transform to the
   * current state and persist the result. No business logic lives here.
   */
  const commit = useCallback((fn: (prev: PrototypeState) => PrototypeState): PrototypeState => {
    const prev = stateRef.current;
    const next = fn(prev);
    if (next !== prev) replaceState(next);
    return next;
  }, [replaceState]);

  // The acting operator is always the signed-in operator. Callers can never
  // supply or override it (DEC-PT-007).
  const operatorId = auth?.operatorId ?? "system";
  const accountRole = auth ? state.operators.find((o) => o.id === auth.operatorId)?.role : undefined;
  const roleId: RoleId | undefined = (ROLE_FROM_ACCOUNT ? accountRole : undefined) ?? auth?.roleId;

  /* ------------------------------ auth ------------------------------ */

  const signIn = useCallback(
    (operatorId: string, roleId: RoleId) => {
      const next = { operatorId, roleId };
      setAuth(next);
      persist(AUTH_KEY, next);
    },
    [persist],
  );

  const signOut = useCallback(() => {
    setAuth(null);
    try {
      window.localStorage.removeItem(AUTH_KEY);
    } catch {
      /* noop */
    }
  }, []);

  const switchRole = useCallback(
    (roleId: RoleId) => {
      setAuth((prev) => {
        if (!prev) return prev;
        const next = { ...prev, roleId };
        persist(AUTH_KEY, next);
        return next;
      });
    },
    [persist],
  );

  const switchTerritory = useCallback(
    (id: string) => {
      setConsolePrefs((prev) => {
        const next = { ...prev, territoryId: id };
        persist(CONSOLE_KEY, next);
        return next;
      });
    },
    [persist],
  );

  const toggleSidebar = useCallback(() => {
    setConsolePrefs((prev) => {
      const next = { ...prev, sidebarCollapsed: !prev.sidebarCollapsed };
      persist(CONSOLE_KEY, next);
      return next;
    });
  }, [persist]);

  const markAllRead = useCallback(() => {
    commit((prev) => ({ ...prev, signals: prev.signals.map((s) => ({ ...s, read: true })) }));
  }, [commit]);

  const markSignalUnread = useCallback((id: string) => {
    commit((prev) => ({ ...prev, signals: prev.signals.map((s) => (s.id === id ? { ...s, read: false } : s)) }));
  }, [commit]);

  const markSignalRead = useCallback((id: string) => {
    commit((prev) => ({ ...prev, signals: prev.signals.map((s) => (s.id === id ? { ...s, read: true } : s)) }));
  }, [commit]);

  /* ---------------------- create commands (services) ---------------------- */

  /**
   * Run a service that returns `{ state, error }`: the new state is applied only
   * when the command succeeded, and the outcome (minus state) is handed back.
   */
  const runResult = useCallback(
    <R extends { state: PrototypeState; error?: string }>(fn: (prev: PrototypeState) => R): Omit<R, "state"> => {
      let out: R | undefined;
      commit((prev) => {
        out = fn(prev);
        return out.error ? prev : out.state;
      });
      const { state: _ignored, ...rest } = out as R;
      void _ignored;
      return rest;
    },
    [commit]
  );

  const createFranchiseCb = useCallback((input: FranchiseInput) => runResult((prev) => createFranchise(prev, input, operatorId)), [runResult, operatorId]);
  const createTerritoryCb = useCallback((input: TerritoryInput) => runResult((prev) => createTerritory(prev, input, operatorId)), [runResult, operatorId]);
  const createCityCb = useCallback((input: CityInput) => runResult((prev) => createCity(prev, input, operatorId)), [runResult, operatorId]);
  const createVenueCb = useCallback((input: VenueInput) => runResult((prev) => createVenue(prev, input, operatorId)), [runResult, operatorId]);
  const createPlayingAreaCb = useCallback((input: PlayingAreaInput) => runResult((prev) => createPlayingArea(prev, input, operatorId)), [runResult, operatorId]);
  const createActivityCategoryCb = useCallback((input: CategoryInput) => runResult((prev) => createActivityCategory(prev, input, operatorId)), [runResult, operatorId]);
  const updateActivityCategoryCb = useCallback((id: string, patch: Partial<ActivityCategory>) => runResult((prev) => updateActivityCategory(prev, id, patch, operatorId)), [runResult, operatorId]);
  const changeCategoryStatusCb = useCallback((id: string, status: CategoryStatus, reason?: string) => runResult((prev) => changeCategoryStatus(prev, id, status, operatorId, reason)), [runResult, operatorId]);
  const duplicateCategoryCb = useCallback((id: string) => runResult((prev) => duplicateCategory(prev, id, operatorId)), [runResult, operatorId]);
  const createExperienceTemplateCb = useCallback((input: TemplateInput) => runResult((prev) => createExperienceTemplate(prev, input, operatorId)), [runResult, operatorId]);
  const updateExperienceTemplateCb = useCallback((id: string, patch: Partial<ExperienceTemplate>, reason?: string, changedFields?: string[]) => runResult((prev) => updateExperienceTemplate(prev, id, patch, operatorId, reason, changedFields)), [runResult, operatorId]);
  const changeTemplateStatusCb = useCallback((id: string, status: TemplateStatus, reason?: string) => runResult((prev) => changeTemplateStatus(prev, id, status, operatorId, reason)), [runResult, operatorId]);
  const duplicateExperienceTemplateCb = useCallback((id: string) => runResult((prev) => duplicateExperienceTemplate(prev, id, operatorId)), [runResult, operatorId]);
  const duplicateTemplateVersionCb = useCallback((versionId: string) => runResult((prev) => duplicateTemplateVersion(prev, versionId, operatorId)), [runResult, operatorId]);
  const addCatalogNoteCb = useCallback((entity: string, name: string, note: string) => runResult((prev) => addCatalogNote(prev, entity, name, note, operatorId)), [runResult, operatorId]);
  const createSessionCb = useCallback((input: SessionInput) => runResult((prev) => createSession(prev, input, operatorId)), [runResult, operatorId]);

  /* ------------------- geography update/status commands ------------------- */

  const updateFranchiseCb = useCallback((id: string, patch: Partial<PrototypeFranchise>) => runResult((prev) => updateFranchise(prev, id, patch, operatorId)), [runResult, operatorId]);
  const changeFranchiseStatusCb = useCallback((id: string, status: PrototypeFranchise["status"], reason?: string) => runResult((prev) => changeFranchiseStatus(prev, id, status, operatorId, reason)), [runResult, operatorId]);
  const changeFranchiseHeadCb = useCallback((id: string, head: string) => runResult((prev) => changeFranchiseHead(prev, id, head, operatorId)), [runResult, operatorId]);
  const updateTerritoryCb = useCallback((id: string, patch: Partial<PrototypeTerritory>) => runResult((prev) => updateTerritory(prev, id, patch, operatorId)), [runResult, operatorId]);
  const changeTerritoryStatusCb = useCallback((id: string, status: PrototypeTerritory["status"], reason?: string) => runResult((prev) => changeTerritoryStatus(prev, id, status, operatorId, reason)), [runResult, operatorId]);
  const assignTerritoryManagerCb = useCallback((id: string, managerId: string) => runResult((prev) => assignTerritoryManager(prev, id, managerId, operatorId)), [runResult, operatorId]);
  const updateCityCb = useCallback((id: string, patch: Partial<PrototypeCity>) => runResult((prev) => updateCity(prev, id, patch, operatorId)), [runResult, operatorId]);
  const changeCityStatusCb = useCallback((id: string, status: PrototypeCity["status"], reason?: string) => runResult((prev) => changeCityStatus(prev, id, status, operatorId, reason)), [runResult, operatorId]);
  const assignCityManagerCb = useCallback((id: string, managerId: string) => runResult((prev) => assignCityManager(prev, id, managerId, operatorId)), [runResult, operatorId]);
  const updateVenueCb = useCallback((id: string, patch: Partial<PrototypeVenue>) => runResult((prev) => updateVenue(prev, id, patch, operatorId)), [runResult, operatorId]);
  const changeVenueStatusCb = useCallback((id: string, status: PrototypeVenue["status"], reason?: string) => runResult((prev) => changeVenueStatus(prev, id, status, operatorId, reason)), [runResult, operatorId]);
  const addVenueSafetyNoteCb = useCallback((id: string, note: string) => runResult((prev) => addVenueSafetyNote(prev, id, note, operatorId)), [runResult, operatorId]);
  const updatePlayingAreaCb = useCallback((id: string, patch: Partial<PrototypePlayingArea>) => runResult((prev) => updatePlayingArea(prev, id, patch, operatorId)), [runResult, operatorId]);
  const changePlayingAreaStatusCb = useCallback((id: string, status: PrototypePlayingArea["status"], reason?: string) => runResult((prev) => changePlayingAreaStatus(prev, id, status, operatorId, reason)), [runResult, operatorId]);
  const addOperationalNoteCb = useCallback((entity: string, name: string, note: string) => runResult((prev) => addOperationalNote(prev, entity, name, note, operatorId)), [runResult, operatorId]);

  /* ------------------- operational commands (services) ------------------- */

  const cancelBookingCb = useCallback(
    (id: string, reason: string, byCompany?: boolean) => runResult((prev) => cancelBooking(prev, id, { reason, byCompany }, operatorId)),
    [runResult, operatorId]
  );
  const generateTemporaryIdsCb = useCallback((sessionId: string) => commit((prev) => generateTemporaryIds(prev, sessionId, operatorId)), [commit, operatorId]);
  const allocateTeamsCb = useCallback((sessionId: string) => commit((prev) => allocateTeams(prev, sessionId, operatorId)), [commit, operatorId]);
  const completeSessionCb = useCallback((sessionId: string) => runResult((prev) => completeSessionRepo(prev, sessionId, operatorId)), [runResult, operatorId]);
  const cancelSessionCb = useCallback((sessionId: string, reason: string) => runResult((prev) => cancelSession(prev, sessionId, reason, operatorId)), [runResult, operatorId]);
  const updateSessionStatusCb = useCallback((id: string, status: SessionStatus) => commit((prev) => updateSessionStatus(prev, id, status, operatorId)), [commit, operatorId]);
  const strikeBookingCb = useCallback((id: string) => runResult((prev) => strikeBookingCommand(prev, id, operatorId)), [runResult, operatorId]);

  /* ------------------- bookings, holds, waitlist and money ------------------- */

  const createBookingReservationCb = useCallback(
    (params: { sessionId: string; alias: string; phoneMask?: string; bookingType?: BookingType; source?: BookingSource; amount?: number }) =>
      runResult((prev) => createBookingReservation(prev, { ...params, operatorId })),
    [runResult, operatorId]
  );
  const confirmBookingPaymentCb = useCallback((id: string, payment: PaymentRecordInput) => runResult((prev) => confirmBookingPayment(prev, id, payment, operatorId)), [runResult, operatorId]);
  const failBookingPaymentCb = useCallback((id: string, reason: string) => runResult((prev) => failBookingPayment(prev, id, reason, operatorId)), [runResult, operatorId]);
  const expireReservationCb = useCallback((id: string) => runResult((prev) => expireReservation(prev, id, operatorId)), [runResult, operatorId]);
  const joinWaitlistCb = useCallback(
    (params: { sessionId: string; alias: string; phoneMask?: string }) => runResult((prev) => joinWaitlist(prev, { ...params, operatorId })),
    [runResult, operatorId]
  );
  const offerWaitlistSlotCb = useCallback((sessionId: string) => runResult((prev) => offerWaitlistSlot(prev, sessionId, operatorId)), [runResult, operatorId]);
  const acceptWaitlistOfferCb = useCallback((bookingId: string) => runResult((prev) => acceptWaitlistOffer(prev, bookingId, operatorId)), [runResult, operatorId]);
  const expireWaitlistOfferCb = useCallback((bookingId: string) => runResult((prev) => expireWaitlistOffer(prev, bookingId, operatorId)), [runResult, operatorId]);
  const initiateRefundCb = useCallback(
    (params: { bookingId: string; amount: number; reason: string; type?: RefundType }) => runResult((prev) => initiateRefund(prev, { ...params, operatorId })),
    [runResult, operatorId]
  );
  const approveRefundCb = useCallback((refundId: string) => runResult((prev) => approveRefund(prev, refundId, operatorId, roleId)), [runResult, operatorId, roleId]);
  const rejectRefundCb = useCallback((refundId: string, reason: string) => runResult((prev) => rejectRefund(prev, refundId, reason, operatorId, roleId)), [runResult, operatorId, roleId]);
  const completeRefundCb = useCallback((refundId: string, payout: PayoutInput) => runResult((prev) => completeRefund(prev, refundId, payout, operatorId, roleId)), [runResult, operatorId, roleId]);
  const reconcilePaymentCb = useCallback((paymentId: string) => runResult((prev) => reconcilePayment(prev, paymentId, operatorId)), [runResult, operatorId]);

  /* ------------------- Session operations (identity, teams, reveal, check-in) ------------------- */

  const createIdentityPatternCb = useCallback(
    (input: { name: string; prefix: string; separator?: string; numberLength?: number; aliasStyle?: string }) => runResult((prev) => createIdentityPattern(prev, input, operatorId)),
    [runResult, operatorId]
  );
  const setIdentityPatternStatusCb = useCallback(
    (patternId: string, status: "active" | "deprecated") => runResult((prev) => setIdentityPatternStatus(prev, patternId, status, operatorId)),
    [runResult, operatorId]
  );
  const generateTemporaryIdentitiesCb = useCallback(
    (sessionId: string, patternId?: string) => runResult((prev) => generateTemporaryIdentities(prev, sessionId, patternId, operatorId)),
    [runResult, operatorId]
  );
  const lockTemporaryIdentitiesCb = useCallback((sessionId: string) => runResult((prev) => lockTemporaryIdentities(prev, sessionId, operatorId)), [runResult, operatorId]);
  const revokeTemporaryIdentityCb = useCallback(
    (identityId: string, reason: string) => runResult((prev) => revokeTemporaryIdentity(prev, identityId, reason, operatorId)),
    [runResult, operatorId]
  );
  const createTeamsCb = useCallback(
    (sessionId: string, numTeams?: number, teamCapacity?: number) => runResult((prev) => createTeams(prev, sessionId, numTeams, teamCapacity, operatorId)),
    [runResult, operatorId]
  );
  const allocateTeamsRandomlyCb = useCallback((sessionId: string) => runResult((prev) => allocateTeamsRandomly(prev, sessionId, operatorId)), [runResult, operatorId]);
  const moveTeamParticipantCb = useCallback(
    (params: { sessionId: string; bookingId: string; targetTeamId: string; reason: string }) => runResult((prev) => moveTeamParticipant(prev, { ...params, operatorId })),
    [runResult, operatorId]
  );
  const swapTeamParticipantsCb = useCallback(
    (params: { sessionId: string; bookingIdA: string; bookingIdB: string; reason: string }) => runResult((prev) => swapTeamParticipants(prev, { ...params, operatorId })),
    [runResult, operatorId]
  );
  const lockTeamsCb = useCallback((sessionId: string) => runResult((prev) => lockTeams(prev, sessionId, operatorId)), [runResult, operatorId]);
  const unlockTeamsWithOverrideCb = useCallback(
    (sessionId: string, reason: string) => runResult((prev) => unlockTeamsWithOverride(prev, sessionId, reason, operatorId)),
    [runResult, operatorId]
  );
  const triggerRevealCb = useCallback(
    (sessionId: string, overrideReason?: string) => runResult((prev) => triggerReveal(prev, sessionId, overrideReason, operatorId)),
    [runResult, operatorId]
  );
  const delayRevealCb = useCallback(
    (sessionId: string, newRevealTime: string, reason: string) => runResult((prev) => delayReveal(prev, sessionId, newRevealTime, reason, operatorId)),
    [runResult, operatorId]
  );
  const cancelRevealCb = useCallback((sessionId: string, reason: string) => runResult((prev) => cancelReveal(prev, sessionId, reason, operatorId)), [runResult, operatorId]);
  const createCheckInRecordsCb = useCallback((sessionId: string) => runResult((prev) => createCheckInRecords(prev, sessionId, operatorId)), [runResult, operatorId]);
  const updateCheckInStatusCb = useCallback(
    (params: { sessionId: string; bookingId: string; targetStatus: CheckInStatus; method?: CheckInMethod; denialReason?: string; auditOverrideReason?: string }) =>
      runResult((prev) => updateCheckInStatus(prev, { ...params, operatorId })),
    [runResult, operatorId]
  );
  const checkInStaffCb = useCallback((sessionId: string, personRef: string) => runResult((prev) => checkInStaff(prev, sessionId, personRef, operatorId)), [runResult, operatorId]);

  const createCrewMemberCb = useCallback((input: CrewInput) => runResult((prev) => createCrewMemberCommand(prev, input, operatorId)), [runResult, operatorId]);
  const updateCrewMemberCb = useCallback((id: string, patch: Partial<CrewInput>) => runResult((prev) => updateCrewMemberCommand(prev, id, patch, operatorId)), [runResult, operatorId]);
  const assignCrewToSessionCb = useCallback(
    (params: { sessionId: string; crewId: string; slot: StaffSlot }) => runResult((prev) => assignCrewToSessionCommand(prev, params, operatorId)),
    [runResult, operatorId]
  );
  const unassignCrewFromSessionCb = useCallback(
    (params: { sessionId: string; slot: StaffSlot; reason: string }) => runResult((prev) => unassignCrewFromSessionCommand(prev, params, operatorId)),
    [runResult, operatorId]
  );
  const recordStaffAttendanceCb = useCallback(
    (params: { crewId: string; action: AttendanceAction; reason?: string }) => runResult((prev) => recordStaffAttendanceCommand(prev, params, operatorId)),
    [runResult, operatorId]
  );

  const requestEmergencyIdentityAccessCb = useCallback(
    (params: { sessionId?: string; bookingId: string; reason: string }) =>
      runResult((prev) => requestEmergencyIdentityAccess(prev, { ...params, operatorId, operatorRole: roleId ?? "" })),
    [runResult, operatorId, roleId]
  );
  const closeEmergencyIdentityAccessCb = useCallback(
    (logId: string) => runResult((prev) => closeEmergencyIdentityAccess(prev, logId, operatorId, roleId ?? "")),
    [runResult, operatorId, roleId]
  );

  /* ------------------------------ live operations ------------------------------ */

  const openSessionCb = useCallback((sessionId: string, overrideReason?: string) => runResult((prev) => openSession(prev, sessionId, overrideReason, operatorId)), [runResult, operatorId]);
  const startLiveSessionCb = useCallback(
    (sessionId: string, overrideReason?: string) => runResult((prev) => startLiveSession(prev, sessionId, overrideReason, operatorId)),
    [runResult, operatorId]
  );
  const pauseLiveSessionCb = useCallback((sessionId: string, reason: string) => runResult((prev) => pauseLiveSession(prev, sessionId, reason, operatorId)), [runResult, operatorId]);
  const resumeLiveSessionCb = useCallback((sessionId: string) => runResult((prev) => resumeLiveSession(prev, sessionId, operatorId)), [runResult, operatorId]);
  const enterEmergencyModeCb = useCallback(
    (params: { sessionId: string; reason: string; immediateAction: string; safetyContactConfirmed: boolean }) =>
      runResult((prev) => enterEmergencyMode(prev, { ...params, operatorId, operatorRole: roleId ?? "" })),
    [runResult, operatorId, roleId]
  );
  const exitEmergencyModeCb = useCallback(
    (params: { sessionId: string; exitReason: string }) => runResult((prev) => exitEmergencyMode(prev, { ...params, operatorId, operatorRole: roleId ?? "" })),
    [runResult, operatorId, roleId]
  );
  const endLiveSessionCb = useCallback((sessionId: string) => runResult((prev) => endLiveSession(prev, sessionId, operatorId)), [runResult, operatorId]);
  const createActivitySegmentCb = useCallback(
    (input: { sessionId: string; name: string; type: ActivitySegment["type"]; teamIds?: string[]; notes?: string }) =>
      runResult((prev) => createActivitySegment(prev, input, operatorId)),
    [runResult, operatorId]
  );
  const startActivitySegmentCb = useCallback(
    (sessionId: string, segmentId: string) => runResult((prev) => startActivitySegment(prev, sessionId, segmentId, operatorId)),
    [runResult, operatorId]
  );
  const completeActivitySegmentCb = useCallback(
    (sessionId: string, segmentId: string) => runResult((prev) => completeActivitySegment(prev, sessionId, segmentId, operatorId)),
    [runResult, operatorId]
  );
  const skipActivitySegmentCb = useCallback(
    (sessionId: string, segmentId: string, reason: string) => runResult((prev) => skipActivitySegment(prev, sessionId, segmentId, reason, operatorId)),
    [runResult, operatorId]
  );
  const createDraftResultCb = useCallback(
    (params: { sessionId: string; segmentId: string; resultType: ResultType; teamScores?: TeamScore[]; winnerTeamId?: string; outcome?: string }) =>
      runResult((prev) => createDraftResult(prev, { ...params, operatorId })),
    [runResult, operatorId]
  );
  const confirmResultCb = useCallback((sessionId: string, segmentId: string) => runResult((prev) => confirmResult(prev, sessionId, segmentId, operatorId)), [runResult, operatorId]);
  const correctResultCb = useCallback(
    (params: { sessionId: string; segmentId: string; resultType: ResultType; teamScores?: TeamScore[]; winnerTeamId?: string; outcome?: string; reason: string }) =>
      runResult((prev) => correctResult(prev, { ...params, operatorId })),
    [runResult, operatorId]
  );
  const addLiveOperationalNoteCb = useCallback(
    (input: { sessionId: string; type: LiveNoteType; severity: LiveNoteSeverity; note: string; relatedSegmentId?: string; followUpRequired?: boolean }) =>
      runResult((prev) => addLiveOperationalNote(prev, input, operatorId)),
    [runResult, operatorId]
  );
  const updateEquipmentStatusCb = useCallback(
    (params: { sessionId: string; equipmentId: string; status?: EquipmentItemStatus; issuedCount?: number; missingCount?: number; damagedCount?: number; returnedCount?: number; note?: string }) =>
      runResult((prev) => updateEquipmentStatus(prev, { ...params, operatorId })),
    [runResult, operatorId]
  );
  const completeLiveSessionCb = useCallback(
    (sessionId: string, overrideReason?: string, closingNote?: string) => runResult((prev) => completeLiveSession(prev, sessionId, overrideReason, operatorId, closingNote)),
    [runResult, operatorId]
  );

  // Tournament callbacks — services authorise, validate and return { state, error }.
  const createTournamentCb = useCallback((params: TournamentInput) => runResult((prev) => createTournament(prev, params, operatorId)), [runResult, operatorId]);
  const assignTournamentTeamsCb = useCallback((tournamentId: string, teams: Array<{ id?: string; name: string }>) => runResult((prev) => assignTournamentTeams(prev, tournamentId, teams, operatorId)), [runResult, operatorId]);
  const generateSingleEliminationBracketCb = useCallback((tournamentId: string) => runResult((prev) => generateSingleEliminationBracket(prev, tournamentId, operatorId)), [runResult, operatorId]);
  const publishTournamentCb = useCallback((tournamentId: string) => runResult((prev) => publishTournament(prev, tournamentId, operatorId)), [runResult, operatorId]);
  const assignMatchRefereeCb = useCallback((tournamentId: string, matchId: string, refereeId: string) => runResult((prev) => assignMatchReferee(prev, tournamentId, matchId, refereeId, operatorId)), [runResult, operatorId]);
  const updateMatchReadinessCb = useCallback((tournamentId: string, matchId: string, status: "scheduled" | "ready") => runResult((prev) => updateMatchReadiness(prev, tournamentId, matchId, status, operatorId)), [runResult, operatorId]);
  const startTournamentMatchCb = useCallback((tournamentId: string, matchId: string) => runResult((prev) => startTournamentMatch(prev, tournamentId, matchId, operatorId)), [runResult, operatorId]);
  const pauseTournamentMatchCb = useCallback((tournamentId: string, matchId: string) => runResult((prev) => pauseTournamentMatch(prev, tournamentId, matchId, operatorId)), [runResult, operatorId]);
  const resumeTournamentMatchCb = useCallback((tournamentId: string, matchId: string) => runResult((prev) => resumeTournamentMatch(prev, tournamentId, matchId, operatorId)), [runResult, operatorId]);
  const confirmTournamentMatchResultCb = useCallback((params: MatchResultInput) => runResult((prev) => confirmTournamentMatchResult(prev, params, operatorId)), [runResult, operatorId]);
  const verifyTournamentMatchResultCb = useCallback((tournamentId: string, matchId: string) => runResult((prev) => verifyTournamentMatchResult(prev, tournamentId, matchId, operatorId)), [runResult, operatorId]);
  const correctTournamentMatchResultCb = useCallback((params: MatchCorrectionInput) => runResult((prev) => correctTournamentMatchResult(prev, params, operatorId)), [runResult, operatorId]);
  const declareWalkoverCb = useCallback((tournamentId: string, matchId: string, winnerTeamId: string, reason: string) => runResult((prev) => declareWalkover(prev, tournamentId, matchId, winnerTeamId, reason, operatorId)), [runResult, operatorId]);
  const disqualifyTeamCb = useCallback((tournamentId: string, teamId: string, reason: string) => runResult((prev) => disqualifyTeam(prev, tournamentId, teamId, reason, operatorId)), [runResult, operatorId]);
  const abandonMatchCb = useCallback((tournamentId: string, matchId: string, reason: string) => runResult((prev) => abandonMatch(prev, tournamentId, matchId, reason, operatorId)), [runResult, operatorId]);
  const completeTournamentCb = useCallback((tournamentId: string) => runResult((prev) => completeTournament(prev, tournamentId, operatorId)), [runResult, operatorId]);

  // Safety incident callbacks
  const reportIncidentCb = useCallback((params: IncidentReportInput) => runResult((prev) => reportIncident(prev, params, operatorId)), [runResult, operatorId]);
  const acknowledgeIncidentCb = useCallback((incidentId: string) => runResult((prev) => acknowledgeIncident(prev, incidentId, operatorId)), [runResult, operatorId]);
  const triageIncidentCb = useCallback((params: IncidentTriageInput) => runResult((prev) => triageIncident(prev, params, operatorId)), [runResult, operatorId]);
  const assignInvestigatorCb = useCallback((incidentId: string, investigatorId: string) => runResult((prev) => assignInvestigator(prev, incidentId, investigatorId, operatorId)), [runResult, operatorId]);
  const escalateIncidentCb = useCallback((incidentId: string, reason: string) => runResult((prev) => escalateIncident(prev, incidentId, reason, operatorId)), [runResult, operatorId]);
  const updateInvestigationCb = useCallback((incidentId: string, summary: string) => runResult((prev) => updateInvestigation(prev, incidentId, summary, operatorId)), [runResult, operatorId]);
  const resolveIncidentCb = useCallback((incidentId: string, resolution: string) => runResult((prev) => resolveIncident(prev, incidentId, resolution, operatorId)), [runResult, operatorId]);
  const closeIncidentCb = useCallback((incidentId: string, notes: string) => runResult((prev) => closeIncident(prev, incidentId, notes, operatorId)), [runResult, operatorId]);
  const addEvidenceRecordCb = useCallback((params: EvidenceInput) => runResult((prev) => addEvidenceRecord(prev, params, operatorId)), [runResult, operatorId]);
  const updateEvidenceStatusCb = useCallback((evidenceId: string, status: EvidenceStatus) => runResult((prev) => updateEvidenceStatus(prev, evidenceId, status, operatorId)), [runResult, operatorId]);
  const createFollowUpCb = useCallback((incidentId: string, followUpOwnerId: string, dueAt: string) => runResult((prev) => createFollowUp(prev, incidentId, followUpOwnerId, dueAt, operatorId)), [runResult, operatorId]);

  // Dispute callbacks
  const submitDisputeCb = useCallback((params: DisputeInput) => runResult((prev) => submitDispute(prev, params, operatorId)), [runResult, operatorId]);
  const assignDisputeReviewerCb = useCallback((disputeId: string, reviewerId: string) => runResult((prev) => assignDisputeReviewer(prev, disputeId, reviewerId, operatorId)), [runResult, operatorId]);
  const requestDisputeEvidenceCb = useCallback((disputeId: string, request: string) => runResult((prev) => requestDisputeEvidence(prev, disputeId, request, operatorId)), [runResult, operatorId]);
  const decideDisputeCb = useCallback((params: DisputeDecisionInput) => runResult((prev) => decideDispute(prev, params, operatorId)), [runResult, operatorId]);
  const closeDisputeCb = useCallback((disputeId: string) => runResult((prev) => closeDispute(prev, disputeId, operatorId)), [runResult, operatorId]);

  // Moderation callbacks
  const createModerationCaseCb = useCallback((params: ModerationCaseInput) => runResult((prev) => createModerationCase(prev, params, operatorId)), [runResult, operatorId]);
  const proposeModerationActionCb = useCallback((params: ModerationProposalInput) => runResult((prev) => proposeModerationAction(prev, params, operatorId)), [runResult, operatorId]);
  const approveModerationActionCb = useCallback((actionId: string) => runResult((prev) => approveModerationAction(prev, actionId, operatorId)), [runResult, operatorId]);
  const rejectModerationActionCb = useCallback((actionId: string, reason: string) => runResult((prev) => rejectModerationAction(prev, actionId, reason, operatorId)), [runResult, operatorId]);
  const revokeModerationActionCb = useCallback((actionId: string, reason: string) => runResult((prev) => revokeModerationAction(prev, actionId, reason, operatorId)), [runResult, operatorId]);
  const closeModerationCaseCb = useCallback((caseId: string, note: string) => runResult((prev) => closeModerationCase(prev, caseId, note, operatorId)), [runResult, operatorId]);

  // Refund Exceptions Callbacks
  const recommendRefundExceptionCb = useCallback(
    (params: Parameters<typeof recommendRefundException>[1]) => runResult((prev) => recommendRefundException(prev, params, operatorId)),
    [runResult, operatorId]
  );
  const approveRefundExceptionCb = useCallback(
    (exceptionId: string, bookingId?: string) => runResult((prev) => approveRefundException(prev, exceptionId, operatorId, { bookingId, actorRole: roleId })),
    [runResult, operatorId, roleId]
  );
  const rejectRefundExceptionCb = useCallback(
    (exceptionId: string, reason: string) => runResult((prev) => rejectRefundException(prev, exceptionId, reason, operatorId, { actorRole: roleId })),
    [runResult, operatorId, roleId]
  );

  /* ------------------------ incident / signal helpers ------------------------ */

  const addIncident = useCallback((i: Incident) => {
    commit((prev) => ({ ...prev, incidents: [...prev.incidents, i] }));
  }, [commit]);

  const updateIncident = useCallback((id: string, updates: Partial<Incident>) => {
    commit((prev) => ({
      ...prev,
      incidents: prev.incidents.map((x) => (x.id === id ? { ...x, ...updates } : x))
    }));
  }, [commit]);

  const addSignal = useCallback((s: Signal) => {
    commit((prev) => pushSignal(prev, { kind: s.kind, message: s.message, sessionId: s.sessionId, at: s.at }));
  }, [commit]);

  const addAudit = useCallback((sessionId: string | undefined, action: string, description: string) => {
    commit((prev) => pushAudit(prev, { sessionId, action, description, operatorId }));
  }, [commit, operatorId]);

  /* ------------------------------ demo controls ------------------------------ */

  const resetDemoData = useCallback(() => {
    const prev = stateRef.current;
    // The activity record survives a reset: it is the history of the workspace.
    replaceState({ ...migrateState(getInitialState()), activityLog: prev.activityLog, operators: prev.operators });
    setDemoStepState(0);
    saveDemoStep(0);
  }, [replaceState]);

  const startFreshWorkspace = useCallback(() => {
    const prev = stateRef.current;
    replaceState({ ...getEmptyState(), activityLog: prev.activityLog, operators: prev.operators });
  }, [replaceState]);

  const exportWorkspace = useCallback(() => {
    void flushSave();
    downloadWorkspaceBackup(stateRef.current);
  }, [flushSave]);

  const importWorkspace = useCallback((text: string): CommandOutcome => {
    try {
      const restored = parseWorkspaceBackup(text);
      replaceState({ ...restored, activityLog: [...restored.activityLog] });
      return {};
    } catch (cause) {
      return { error: cause instanceof Error ? cause.message : "The backup could not be restored." };
    }
  }, [replaceState]);

  /* --------------------------- governance (local) --------------------------- */

  const actorRef = useRef({ id: "system", name: "System", roleId: "system" });
  const latestCommands = useRef<Record<string, unknown>>({});
  const journalWrappers = useRef<Record<string, (...args: unknown[]) => unknown>>({});

  const decideGovernanceCaseCb = useCallback(
    (caseId: string, expectedVersion: number, outcome: GovernanceOutcome, note: string): CommandOutcome => {
      const out = decideGovernanceCaseCommand(stateRef.current, { caseId, expectedVersion, outcome, note }, actorRef.current);
      if (!out.error) replaceState(out.state);
      return { error: out.error };
    },
    [replaceState]
  );

  const setGovernanceEntityStatusCb = useCallback(
    (entityType: GovernanceEntityType, entityId: string, expectedVersion: number, status: GovernanceEntityStatus, reason: string): CommandOutcome => {
      const out = setGovernanceEntityStatusCommand(stateRef.current, { entityType, entityId, expectedVersion, status, reason }, actorRef.current);
      if (!out.error) replaceState(out.state);
      return { error: out.error };
    },
    [replaceState]
  );

  const submitGovernanceIntakeCb = useCallback(
    (input: IntakeInput) => {
      const out = submitGovernanceIntakeCommand(stateRef.current, input, actorRef.current);
      if (!out.error) replaceState(out.state);
      return { error: out.error, id: out.id };
    },
    [replaceState]
  );

  /* ---------------------------- operator accounts ---------------------------- */

  const isOwner = roleId === "platform-owner" || roleId === "super-admin";

  const createOperatorCb = useCallback(
    (input: { name: string; title: string; role: RoleId; territoryId: string; email?: string }) => {
      if (!isOwner) return { error: "Only a Platform Owner or Super Admin can add operators." };
      const name = input.name.trim();
      if (name.length < 2) return { error: "Enter the operator's full name." };
      if (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) return { error: "Enter a valid email address." };
      if (!ROLES.some((r) => r.id === input.role)) return { error: "Choose a role." };
      if (input.role === "platform-owner" && roleId !== "platform-owner") return { error: "Only a Platform Owner can create another Platform Owner." };
      const prev = stateRef.current;
      const nums = prev.operators.map((o) => parseInt(o.id.replace(/^op-/, ""), 10)).filter(Number.isFinite);
      const id = `op-${Math.max(0, ...nums) + 1}`;
      const initials = name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
      const at = new Date().toISOString();
      const account: OperatorAccount = { id, name, title: input.title.trim() || (ROLES.find((r) => r.id === input.role)?.name ?? ""), role: input.role, territoryId: input.territoryId, initials, email: input.email?.trim(), status: "active", createdAt: at, updatedAt: at };
      replaceState({ ...prev, operators: [...prev.operators, account] });
      return { id };
    },
    [isOwner, roleId, replaceState]
  );

  const updateOperatorCb = useCallback(
    (id: string, patch: Partial<Pick<OperatorAccount, "name" | "title" | "role" | "territoryId" | "email" | "status">>) => {
      if (!isOwner) return { error: "Only a Platform Owner or Super Admin can change operators." };
      const prev = stateRef.current;
      const target = prev.operators.find((o) => o.id === id);
      if (!target) return { error: "This operator no longer exists." };
      if (id === operatorId && (patch.status === "suspended" || (patch.role && patch.role !== target.role))) {
        return { error: "You cannot suspend yourself or change your own role." };
      }
      if ((target.role === "platform-owner" || patch.role === "platform-owner") && roleId !== "platform-owner") {
        return { error: "Only a Platform Owner can change a Platform Owner account." };
      }
      const owners = prev.operators.filter((o) => o.role === "platform-owner" && o.status === "active");
      if (target.role === "platform-owner" && owners.length <= 1 && (patch.status === "suspended" || (patch.role && patch.role !== "platform-owner"))) {
        return { error: "At least one active Platform Owner must remain." };
      }
      replaceState({ ...prev, operators: prev.operators.map((o) => (o.id === id ? { ...o, ...patch, updatedAt: new Date().toISOString() } : o)) });
      return {};
    },
    [isOwner, operatorId, roleId, replaceState]
  );

  /* --------------------------- hold-expiry sweeper --------------------------- */

  useEffect(() => {
    if (!hydrated) return;
    const sweep = () => commit((prev) => releaseExpiredHolds(prev, new Date().toISOString(), "system"));
    sweep();
    const t = window.setInterval(sweep, 30_000);
    return () => window.clearInterval(t);
  }, [hydrated, commit]);

  const loadScenario = useCallback(
    (name: string) => {
      commit((prev) => applyScenario(name, prev));
    },
    [commit]
  );

  const setDemoStep = useCallback((step: number) => {
    setDemoStepState(step);
    saveDemoStep(step);
  }, []);

  const value = useMemo<StoreValue>(() => {
    const account = auth ? (state.operators.find((o) => o.id === auth.operatorId) ?? null) : null;
    const operator = account && account.status === "active" ? account : null;
    const role = ROLES.find((r) => r.id === (roleId ?? "coordinator")) ?? ROLES[6];
    actorRef.current = { id: operator?.id ?? "system", name: operator?.name ?? "System", roleId: roleId ?? "system" };
    // The console scope is a territory from workspace state; an empty workspace has none.
    const territoryData = state.territories.find((t) => t.id === consolePrefs.territoryId) ?? state.territories[0];
    const resolvedTerritoryObj: Territory = territoryData
      ? { id: territoryData.id, name: territoryData.name, code: territoryData.name.slice(0, 3).toUpperCase() }
      : { id: "", name: "No territory yet", code: "—" };

    const commands = {
      authed: !!auth && hydrated && !!operator,
      hydrated,
      workspace,
      operators: state.operators,
      operator,
      role,
      territory: resolvedTerritoryObj,
      sidebarCollapsed: consolePrefs.sidebarCollapsed,
      paletteOpen,
      signalOpen,
      state,
      demoStep,
      signIn,
      signOut,
      switchRole,
      switchTerritory,
      toggleSidebar,
      setPaletteOpen,
      setSignalOpen,
      markAllRead,
      markSignalRead,
      markSignalUnread,
      canAccess: (href: string) => (auth && roleId && operator ? canAccess(href, roleId) : false),
      createFranchise: createFranchiseCb,
      createTerritory: createTerritoryCb,
      createCity: createCityCb,
      createVenue: createVenueCb,
      createPlayingArea: createPlayingAreaCb,
      createActivityCategory: createActivityCategoryCb,
      updateActivityCategory: updateActivityCategoryCb,
      changeCategoryStatus: changeCategoryStatusCb,
      duplicateCategory: duplicateCategoryCb,
      createExperienceTemplate: createExperienceTemplateCb,
      updateExperienceTemplate: updateExperienceTemplateCb,
      changeTemplateStatus: changeTemplateStatusCb,
      duplicateExperienceTemplate: duplicateExperienceTemplateCb,
      duplicateTemplateVersion: duplicateTemplateVersionCb,
      addCatalogNote: addCatalogNoteCb,
      createSession: createSessionCb,
      updateFranchise: updateFranchiseCb,
      changeFranchiseStatus: changeFranchiseStatusCb,
      changeFranchiseHead: changeFranchiseHeadCb,
      updateTerritory: updateTerritoryCb,
      changeTerritoryStatus: changeTerritoryStatusCb,
      assignTerritoryManager: assignTerritoryManagerCb,
      updateCity: updateCityCb,
      changeCityStatus: changeCityStatusCb,
      assignCityManager: assignCityManagerCb,
      updateVenue: updateVenueCb,
      changeVenueStatus: changeVenueStatusCb,
      addVenueSafetyNote: addVenueSafetyNoteCb,
      updatePlayingArea: updatePlayingAreaCb,
      changePlayingAreaStatus: changePlayingAreaStatusCb,
      addOperationalNote: addOperationalNoteCb,
      cancelBooking: cancelBookingCb,
      generateTemporaryIds: generateTemporaryIdsCb,
      allocateTeams: allocateTeamsCb,
      completeSession: completeSessionCb,
      cancelSession: cancelSessionCb,
      updateSessionStatus: updateSessionStatusCb,
      strikeBooking: strikeBookingCb,
      createBookingReservation: createBookingReservationCb,
      confirmBookingPayment: confirmBookingPaymentCb,
      failBookingPayment: failBookingPaymentCb,
      expireReservation: expireReservationCb,
      joinWaitlist: joinWaitlistCb,
      offerWaitlistSlot: offerWaitlistSlotCb,
      acceptWaitlistOffer: acceptWaitlistOfferCb,
      expireWaitlistOffer: expireWaitlistOfferCb,
      initiateRefund: initiateRefundCb,
      approveRefund: approveRefundCb,
      rejectRefund: rejectRefundCb,
      completeRefund: completeRefundCb,
      reconcilePayment: reconcilePaymentCb,
      createIdentityPattern: createIdentityPatternCb,
      setIdentityPatternStatus: setIdentityPatternStatusCb,
      generateTemporaryIdentities: generateTemporaryIdentitiesCb,
      lockTemporaryIdentities: lockTemporaryIdentitiesCb,
      revokeTemporaryIdentity: revokeTemporaryIdentityCb,
      createTeams: createTeamsCb,
      allocateTeamsRandomly: allocateTeamsRandomlyCb,
      moveTeamParticipant: moveTeamParticipantCb,
      swapTeamParticipants: swapTeamParticipantsCb,
      lockTeams: lockTeamsCb,
      unlockTeamsWithOverride: unlockTeamsWithOverrideCb,
      triggerReveal: triggerRevealCb,
      delayReveal: delayRevealCb,
      cancelReveal: cancelRevealCb,
      createCheckInRecords: createCheckInRecordsCb,
      updateCheckInStatus: updateCheckInStatusCb,
      checkInStaff: checkInStaffCb,
      createCrewMember: createCrewMemberCb,
      updateCrewMember: updateCrewMemberCb,
      assignCrewToSession: assignCrewToSessionCb,
      unassignCrewFromSession: unassignCrewFromSessionCb,
      recordStaffAttendance: recordStaffAttendanceCb,
      requestEmergencyIdentityAccess: requestEmergencyIdentityAccessCb,
      closeEmergencyIdentityAccess: closeEmergencyIdentityAccessCb,
      openSession: openSessionCb,
      startLiveSession: startLiveSessionCb,
      pauseLiveSession: pauseLiveSessionCb,
      resumeLiveSession: resumeLiveSessionCb,
      enterEmergencyMode: enterEmergencyModeCb,
      exitEmergencyMode: exitEmergencyModeCb,
      endLiveSession: endLiveSessionCb,
      createActivitySegment: createActivitySegmentCb,
      startActivitySegment: startActivitySegmentCb,
      completeActivitySegment: completeActivitySegmentCb,
      skipActivitySegment: skipActivitySegmentCb,
      createDraftResult: createDraftResultCb,
      confirmResult: confirmResultCb,
      correctResult: correctResultCb,
      addLiveOperationalNote: addLiveOperationalNoteCb,
      updateEquipmentStatus: updateEquipmentStatusCb,
      completeLiveSession: completeLiveSessionCb,
      createTournament: createTournamentCb,
      assignTournamentTeams: assignTournamentTeamsCb,
      generateSingleEliminationBracket: generateSingleEliminationBracketCb,
      publishTournament: publishTournamentCb,
      assignMatchReferee: assignMatchRefereeCb,
      updateMatchReadiness: updateMatchReadinessCb,
      startTournamentMatch: startTournamentMatchCb,
      pauseTournamentMatch: pauseTournamentMatchCb,
      resumeTournamentMatch: resumeTournamentMatchCb,
      confirmTournamentMatchResult: confirmTournamentMatchResultCb,
      verifyTournamentMatchResult: verifyTournamentMatchResultCb,
      correctTournamentMatchResult: correctTournamentMatchResultCb,
      declareWalkover: declareWalkoverCb,
      disqualifyTeam: disqualifyTeamCb,
      abandonMatch: abandonMatchCb,
      completeTournament: completeTournamentCb,
      reportIncident: reportIncidentCb,
      acknowledgeIncident: acknowledgeIncidentCb,
      triageIncident: triageIncidentCb,
      assignInvestigator: assignInvestigatorCb,
      escalateIncident: escalateIncidentCb,
      updateInvestigation: updateInvestigationCb,
      resolveIncident: resolveIncidentCb,
      closeIncident: closeIncidentCb,
      addEvidenceRecord: addEvidenceRecordCb,
      updateEvidenceStatus: updateEvidenceStatusCb,
      createFollowUp: createFollowUpCb,
      submitDispute: submitDisputeCb,
      assignDisputeReviewer: assignDisputeReviewerCb,
      requestDisputeEvidence: requestDisputeEvidenceCb,
      decideDispute: decideDisputeCb,
      closeDispute: closeDisputeCb,
      createModerationCase: createModerationCaseCb,
      proposeModerationAction: proposeModerationActionCb,
      approveModerationAction: approveModerationActionCb,
      rejectModerationAction: rejectModerationActionCb,
      revokeModerationAction: revokeModerationActionCb,
      closeModerationCase: closeModerationCaseCb,
      recommendRefundException: recommendRefundExceptionCb,
      approveRefundException: approveRefundExceptionCb,
      rejectRefundException: rejectRefundExceptionCb,
      addIncident,
      updateIncident,
      addSignal,
      addAudit,
      decideGovernanceCase: decideGovernanceCaseCb,
      setGovernanceEntityStatus: setGovernanceEntityStatusCb,
      submitGovernanceIntake: submitGovernanceIntakeCb,
      createOperator: createOperatorCb,
      updateOperator: updateOperatorCb,
      exportWorkspace,
      importWorkspace,
      startFreshWorkspace,
      resetDemoData,
      loadScenario,
      setDemoStep
    };
    latestCommands.current = commands as unknown as Record<string, unknown>;
    return journalled(commands as StoreValue, latestCommands, journalWrappers, actorRef, (rec) =>
      commit((prev) => ({ ...prev, activityLog: [rec, ...prev.activityLog] }))
    );
  }, [
    auth,
    hydrated,
    workspace,
    setIdentityPatternStatusCb,
    roleId,
    commit,
    createCrewMemberCb,
    updateCrewMemberCb,
    assignCrewToSessionCb,
    unassignCrewFromSessionCb,
    recordStaffAttendanceCb,
    decideGovernanceCaseCb,
    setGovernanceEntityStatusCb,
    submitGovernanceIntakeCb,
    createOperatorCb,
    updateOperatorCb,
    exportWorkspace,
    importWorkspace,
    startFreshWorkspace,
    consolePrefs,
    paletteOpen,
    signalOpen,
    state,
    demoStep,
    signIn,
    signOut,
    switchRole,
    switchTerritory,
    toggleSidebar,
    markAllRead,
    markSignalRead,
    markSignalUnread,
    createFranchiseCb,
    createTerritoryCb,
    createCityCb,
    createVenueCb,
    createPlayingAreaCb,
    createActivityCategoryCb,
    updateActivityCategoryCb,
    changeCategoryStatusCb,
    duplicateCategoryCb,
    createExperienceTemplateCb,
    updateExperienceTemplateCb,
    changeTemplateStatusCb,
    duplicateExperienceTemplateCb,
    duplicateTemplateVersionCb,
    addCatalogNoteCb,
    createSessionCb,
    updateFranchiseCb,
    changeFranchiseStatusCb,
    changeFranchiseHeadCb,
    updateTerritoryCb,
    changeTerritoryStatusCb,
    assignTerritoryManagerCb,
    updateCityCb,
    changeCityStatusCb,
    assignCityManagerCb,
    updateVenueCb,
    changeVenueStatusCb,
    addVenueSafetyNoteCb,
    updatePlayingAreaCb,
    changePlayingAreaStatusCb,
    addOperationalNoteCb,
    cancelBookingCb,
    generateTemporaryIdsCb,
    allocateTeamsCb,
    completeSessionCb,
    cancelSessionCb,
    updateSessionStatusCb,
    strikeBookingCb,
    createBookingReservationCb,
    confirmBookingPaymentCb,
    failBookingPaymentCb,
    expireReservationCb,
    joinWaitlistCb,
    offerWaitlistSlotCb,
    acceptWaitlistOfferCb,
    expireWaitlistOfferCb,
    initiateRefundCb,
    approveRefundCb,
    rejectRefundCb,
    completeRefundCb,
    reconcilePaymentCb,
    createIdentityPatternCb,
    generateTemporaryIdentitiesCb,
    lockTemporaryIdentitiesCb,
    revokeTemporaryIdentityCb,
    createTeamsCb,
    allocateTeamsRandomlyCb,
    moveTeamParticipantCb,
    swapTeamParticipantsCb,
    lockTeamsCb,
    unlockTeamsWithOverrideCb,
    triggerRevealCb,
    delayRevealCb,
    cancelRevealCb,
    createCheckInRecordsCb,
    updateCheckInStatusCb,
    checkInStaffCb,
    requestEmergencyIdentityAccessCb,
    closeEmergencyIdentityAccessCb,
    openSessionCb,
    startLiveSessionCb,
    pauseLiveSessionCb,
    resumeLiveSessionCb,
    enterEmergencyModeCb,
    exitEmergencyModeCb,
    endLiveSessionCb,
    createActivitySegmentCb,
    startActivitySegmentCb,
    completeActivitySegmentCb,
    skipActivitySegmentCb,
    createDraftResultCb,
    confirmResultCb,
    correctResultCb,
    addLiveOperationalNoteCb,
    updateEquipmentStatusCb,
    completeLiveSessionCb,
    createTournamentCb,
    assignTournamentTeamsCb,
    generateSingleEliminationBracketCb,
    publishTournamentCb,
    assignMatchRefereeCb,
    updateMatchReadinessCb,
    startTournamentMatchCb,
    pauseTournamentMatchCb,
    resumeTournamentMatchCb,
    confirmTournamentMatchResultCb,
    verifyTournamentMatchResultCb,
    correctTournamentMatchResultCb,
    declareWalkoverCb,
    disqualifyTeamCb,
    abandonMatchCb,
    completeTournamentCb,
    reportIncidentCb,
    acknowledgeIncidentCb,
    triageIncidentCb,
    assignInvestigatorCb,
    escalateIncidentCb,
    updateInvestigationCb,
    resolveIncidentCb,
    closeIncidentCb,
    addEvidenceRecordCb,
    updateEvidenceStatusCb,
    createFollowUpCb,
    submitDisputeCb,
    assignDisputeReviewerCb,
    requestDisputeEvidenceCb,
    decideDisputeCb,
    closeDisputeCb,
    createModerationCaseCb,
    proposeModerationActionCb,
    approveModerationActionCb,
    rejectModerationActionCb,
    revokeModerationActionCb,
    closeModerationCaseCb,
    recommendRefundExceptionCb,
    approveRefundExceptionCb,
    rejectRefundExceptionCb,
    addIncident,
    updateIncident,
    addSignal,
    addAudit,
    resetDemoData,
    loadScenario,
    setDemoStep
  ]);

  return (
    <MotionConfig reducedMotion="user">
      <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
    </MotionConfig>
  );
}

/** Commands that are UI-only or read-only and are not journalled. */
const NOT_JOURNALLED = new Set([
  "canAccess",
  "setPaletteOpen",
  "setSignalOpen",
  "toggleSidebar",
  "switchTerritory",
  "markSignalRead",
  "markSignalUnread",
  "markAllRead",
  "setDemoStep",
  "exportWorkspace",
  "addAudit",
  "addSignal",
]);

/**
 * Wrap every command so each invocation writes one ActivityRecord with the
 * signed-in actor, the arguments' target/reason and whether it took effect.
 */
function journalled(
  value: StoreValue,
  latest: { current: Record<string, unknown> },
  wrappers: { current: Record<string, (...args: unknown[]) => unknown> },
  actorRef: { current: { id: string; name: string; roleId: string } },
  record: (rec: ReturnType<typeof buildActivityRecord>) => void,
): StoreValue {
  const out = { ...value } as unknown as Record<string, unknown>;
  for (const [key, fn] of Object.entries(value as unknown as Record<string, unknown>)) {
    if (typeof fn !== "function" || NOT_JOURNALLED.has(key)) continue;
    // Wrappers are created once per command so their identity is stable across renders.
    out[key] = wrappers.current[key] ??= (...args: unknown[]) => {
      const actor = actorRef.current;
      const current = latest.current[key] as (...a: unknown[]) => unknown;
      const result = current(...args);
      const error =
        result && typeof result === "object" && "error" in (result as Record<string, unknown>) && (result as { error?: unknown }).error
          ? String((result as { error?: unknown }).error)
          : undefined;
      record(
        buildActivityRecord({
          command: key,
          args: key === "importWorkspace" ? ["backup file"] : args,
          actorId: actor.id,
          actorName: actor.name,
          roleId: actor.roleId,
          outcome: error ? "rejected" : "ok",
          error,
        }),
      );
      return result;
    };
  }
  return out as unknown as StoreValue;
}

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
