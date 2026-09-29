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
import type { Operator, Role, RoleId, Territory, TerritoryId } from "@/lib/types";
import { ROLES, territoryById } from "@/lib/data/mock";
import { buildActivityRecord } from "@/lib/activity";
import { canAccess } from "@/lib/nav";
import type {
  Incident,
  Signal,
  SessionStatus,
  Franchise as PrototypeFranchise,
  Territory as PrototypeTerritory,
  City as PrototypeCity,
  Venue as PrototypeVenue,
  PlayingArea as PrototypePlayingArea,
  CrewMember,
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
  createCategory,
  createTemplate,
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
  createBooking,
  confirmBooking,
  cancelBooking,
  promoteWaitlistUser,
  generateTemporaryIds,
  allocateTeams,
  completeSession as completeSessionRepo,
  cancelSession,
  updateSessionStatus,
  updateMatchScore,
  strikeBooking as strikeBookingCommand,
  toggleTemplate as toggleTemplateCommand,
  simulateRefund,
  retryPayment,
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
  advanceVerifiedWinner,
  completeTournament,
  reportIncident,
  acknowledgeIncident,
  triageIncident,
  assignInvestigator,
  escalateIncident,
  updateInvestigation,
  resolveIncident,
  closeIncident,
  addEvidencePlaceholder,
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
  type BookingInput
} from "./prototype/services";
import type {
  Booking,
  ActivityCategory,
  CategoryStatus,
  ExperienceTemplate,
  TemplateStatus
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

  // Create commands (services)
  createFranchise: (input: FranchiseInput) => void;
  createTerritory: (input: TerritoryInput) => void;
  createCity: (input: CityInput) => void;
  createVenue: (input: VenueInput) => void;
  createPlayingArea: (input: PlayingAreaInput) => void;
  createCategory: (input: CategoryInput) => void;
  createTemplate: (input: TemplateInput) => void;
  createActivityCategory: (input: CategoryInput) => void;
  updateActivityCategory: (id: string, patch: Partial<ActivityCategory>) => void;
  changeCategoryStatus: (id: string, status: CategoryStatus) => void;
  duplicateCategory: (id: string) => void;
  createExperienceTemplate: (input: TemplateInput) => void;
  updateExperienceTemplate: (id: string, patch: Partial<ExperienceTemplate>, reason?: string, changedFields?: string[]) => void;
  changeTemplateStatus: (id: string, status: TemplateStatus, reason?: string) => void;
  duplicateExperienceTemplate: (id: string) => void;
  duplicateTemplateVersion: (versionId: string) => void;
  addCatalogNote: (entity: string, name: string, note: string) => void;
  createSession: (input: SessionInput) => void;
  createBooking: (input: BookingInput) => void;
  createCrewMember: (input: Partial<CrewMember> & { name: string; role: RoleId; territoryId: string; venueId: string }) => void;
  updateCrewMember: (id: string, patch: Partial<CrewMember>) => void;
  assignCrewToSession: (params: { sessionId: string; crewId: string; role?: string; assignmentTitle?: string }) => void;

  // Geography update/status commands (services)
  updateFranchise: (id: string, patch: Partial<PrototypeFranchise>) => void;
  changeFranchiseStatus: (id: string, status: PrototypeFranchise["status"]) => void;
  changeFranchiseHead: (id: string, head: string) => void;
  updateTerritory: (id: string, patch: Partial<PrototypeTerritory>) => void;
  changeTerritoryStatus: (id: string, status: PrototypeTerritory["status"]) => void;
  assignTerritoryManager: (id: string, managerId: string) => void;
  updateCity: (id: string, patch: Partial<PrototypeCity>) => void;
  changeCityStatus: (id: string, status: PrototypeCity["status"]) => void;
  assignCityManager: (id: string, managerId: string) => void;
  updateVenue: (id: string, patch: Partial<PrototypeVenue>) => void;
  changeVenueStatus: (id: string, status: PrototypeVenue["status"]) => void;
  addVenueSafetyNote: (id: string, note: string) => void;
  updatePlayingArea: (id: string, patch: Partial<PrototypePlayingArea>) => void;
  changePlayingAreaStatus: (id: string, status: PrototypePlayingArea["status"]) => void;
  addOperationalNote: (entity: string, name: string, note: string) => void;

  // Operational commands (services)
  updateBooking: (id: string, updates: Partial<Booking>) => void;
  confirmBooking: (id: string, method?: string) => void;
  cancelBooking: (id: string, reason?: string) => void;
  promoteWaitlistUser: (sessionId: string) => void;
  generateTemporaryIds: (sessionId: string) => void;
  allocateTeams: (sessionId: string) => void;
  completeSession: (sessionId: string) => void;
  cancelSession: (sessionId: string, reason: string) => void;
  updateSessionStatus: (id: string, status: SessionStatus) => void;
  updateMatchScore: (tournamentId: string, matchId: string, scoreA: number, scoreB: number, winner: string, status: "scheduled" | "live" | "completed" | "walkover" | "abandoned") => void;
  strikeBooking: (id: string) => void;
  toggleTemplate: (id: string) => void;
  simulateRefund: (transactionId: string) => void;
  retryPayment: (transactionId: string) => void;

  // SA-P2E Operations Commands
  createBookingReservation: (params: { sessionId: string; alias: string; phoneMask?: string; bookingType?: any; source?: any; amount?: number; operatorId?: string }) => { state: PrototypeState; booking?: Booking; error?: string };
  confirmBookingPayment: (id: string, method?: string) => void;
  failBookingPayment: (id: string, reason?: string) => void;
  expireReservation: (id: string) => void;
  joinWaitlist: (params: { sessionId: string; alias: string; phoneMask?: string; operatorId?: string }) => void;
  offerWaitlistSlot: (sessionId: string, operatorId?: string) => void;
  acceptWaitlistOffer: (bookingId: string, operatorId?: string) => void;
  expireWaitlistOffer: (bookingId: string, operatorId?: string) => void;
  initiateRefund: (params: { bookingId: string; amount: number; reason: string; type?: any; operatorId?: string }) => { state: PrototypeState; refund?: any; error?: string };
  approveRefund: (refundId: string, operatorId?: string) => void;
  rejectRefund: (refundId: string, reason?: string, operatorId?: string) => void;
  completeRefund: (refundId: string, operatorId?: string) => void;
  reconcilePayment: (paymentId: string, operatorId?: string) => void;

  // SA-P2F Operations Commands
  createIdentityPattern: (input: { name: string; prefix: string; separator?: string; numberLength?: number; aliasStyle?: string }, operatorId?: string) => { state: PrototypeState; pattern?: any; error?: string };
  generateTemporaryIdentities: (sessionId: string, patternId?: string, operatorId?: string) => void;
  lockTemporaryIdentities: (sessionId: string, operatorId?: string) => void;
  revokeTemporaryIdentity: (identityId: string, reason: string, operatorId?: string) => void;
  createTeams: (sessionId: string, numTeams?: number, teamCapacity?: number, operatorId?: string) => void;
  allocateTeamsRandomly: (sessionId: string, operatorId?: string) => void;
  moveTeamParticipant: (params: { sessionId: string; bookingId: string; targetTeamId: string; reason: string; operatorId?: string }) => { state: PrototypeState; error?: string };
  swapTeamParticipants: (params: { sessionId: string; bookingIdA: string; bookingIdB: string; reason: string; operatorId?: string }) => { state: PrototypeState; error?: string };
  lockTeams: (sessionId: string, operatorId?: string) => void;
  unlockTeamsWithOverride: (sessionId: string, reason: string, operatorId?: string) => void;
  triggerReveal: (sessionId: string, overrideReason?: string, operatorId?: string) => { state: PrototypeState; error?: string };
  delayReveal: (sessionId: string, newRevealTime: string, reason: string, operatorId?: string) => void;
  cancelReveal: (sessionId: string, reason: string, operatorId?: string) => void;
  createCheckInRecords: (sessionId: string, operatorId?: string) => void;
  updateCheckInStatus: (params: { sessionId: string; bookingId: string; targetStatus: any; method?: any; denialReason?: string; auditOverrideReason?: string; operatorId?: string }) => { state: PrototypeState; error?: string };
  checkInStaff: (sessionId: string, crewId: string, operatorId?: string) => void;
  requestEmergencyIdentityAccess: (params: { sessionId?: string; bookingId?: string; operatorId: string; operatorRole: string; reason: string }) => { state: PrototypeState; accessLog?: any; error?: string };
  closeEmergencyIdentityAccess: (logId: string, operatorId?: string) => void;

  // SA-P2G Live Operations Commands
  openSession: (sessionId: string, operatorId?: string) => { state: PrototypeState; error?: string };
  startLiveSession: (sessionId: string, operatorId?: string) => { state: PrototypeState; error?: string };
  pauseLiveSession: (sessionId: string, reason: string, operatorId?: string) => { state: PrototypeState; error?: string };
  resumeLiveSession: (sessionId: string, operatorId?: string) => { state: PrototypeState; error?: string };
  enterEmergencyMode: (params: { sessionId: string; reason: string; immediateAction: string; safetyContactConfirmed: boolean; operatorId?: string; operatorRole?: string }) => { state: PrototypeState; error?: string };
  exitEmergencyMode: (params: { sessionId: string; exitReason: string; operatorId?: string; operatorRole?: string }) => { state: PrototypeState; error?: string };
  endLiveSession: (sessionId: string, operatorId?: string) => { state: PrototypeState; error?: string };
  createActivitySegment: (input: { sessionId: string; name: string; type: any; teamIds?: string[]; notes?: string }, operatorId?: string) => { state: PrototypeState; segment?: any; error?: string };
  startActivitySegment: (sessionId: string, segmentId: string, operatorId?: string) => { state: PrototypeState; error?: string };
  completeActivitySegment: (sessionId: string, segmentId: string, operatorId?: string) => { state: PrototypeState; error?: string };
  skipActivitySegment: (sessionId: string, segmentId: string, reason: string, operatorId?: string) => { state: PrototypeState; error?: string };
  createDraftResult: (params: { sessionId: string; segmentId: string; resultType: any; teamScores?: any[]; winnerTeamId?: string; outcome?: string; operatorId?: string }) => { state: PrototypeState; error?: string };
  confirmResult: (sessionId: string, segmentId: string, operatorId?: string) => { state: PrototypeState; error?: string };
  correctResult: (params: { sessionId: string; segmentId: string; resultType: any; teamScores?: any[]; winnerTeamId?: string; outcome?: string; reason: string; operatorId?: string }) => { state: PrototypeState; error?: string };
  addLiveOperationalNote: (input: { sessionId: string; type: any; severity: any; note: string; relatedSegmentId?: string; followUpRequired?: boolean }, operatorId?: string) => { state: PrototypeState; note?: any; error?: string };
  updateEquipmentStatus: (params: { sessionId: string; equipmentId: string; status?: any; issuedCount?: number; missingCount?: number; damagedCount?: number; returnedCount?: number; note?: string; operatorId?: string }) => { state: PrototypeState; error?: string };
  completeLiveSession: (sessionId: string, overrideReason?: string, operatorId?: string) => { state: PrototypeState; error?: string };

  // Tournament
  createTournament: (params: any) => void;
  assignTournamentTeams: (tournamentId: string, teamIds: string[]) => void;
  generateSingleEliminationBracket: (tournamentId: string) => void;
  publishTournament: (tournamentId: string) => void;
  assignMatchReferee: (tournamentId: string, matchId: string, refereeId: string) => void;
  updateMatchReadiness: (tournamentId: string, matchId: string, status: "scheduled" | "ready") => void;
  startTournamentMatch: (tournamentId: string, matchId: string) => void;
  pauseTournamentMatch: (tournamentId: string, matchId: string) => void;
  resumeTournamentMatch: (tournamentId: string, matchId: string) => void;
  confirmTournamentMatchResult: (params: any) => void;
  verifyTournamentMatchResult: (tournamentId: string, matchId: string) => void;
  correctTournamentMatchResult: (params: any) => void;
  declareWalkover: (tournamentId: string, matchId: string, winnerTeamId: string, reason: string) => void;
  disqualifyTeam: (tournamentId: string, teamId: string, reason: string) => void;
  abandonMatch: (tournamentId: string, matchId: string, reason: string) => void;
  advanceVerifiedWinner: (tournamentId: string, matchId: string) => void;
  completeTournament: (tournamentId: string, winnerTeamId: string) => void;

  // Safety
  reportIncident: (params: any) => void;
  acknowledgeIncident: (incidentId: string) => void;
  triageIncident: (params: any) => void;
  assignInvestigator: (incidentId: string, investigatorId: string) => void;
  escalateIncident: (incidentId: string, reason: string) => void;
  updateInvestigation: (incidentId: string, summary: string) => void;
  resolveIncident: (incidentId: string, resolution: string) => void;
  closeIncident: (incidentId: string, notes: string) => void;
  addEvidencePlaceholder: (params: any) => void;
  createFollowUp: (incidentId: string, followUpOwnerId: string, dueAt: string) => void;

  // Disputes
  submitDispute: (params: any) => void;
  assignDisputeReviewer: (disputeId: string, reviewerId: string) => void;
  requestDisputeEvidence: (disputeId: string) => void;
  decideDispute: (params: any) => void;
  closeDispute: (disputeId: string) => void;

  // Moderation
  createModerationCase: (params: any) => void;
  proposeModerationAction: (params: any) => void;
  approveModerationAction: (actionId: string) => void;
  rejectModerationAction: (actionId: string, reason: string) => void;
  revokeModerationAction: (actionId: string, reason: string) => void;

  // Refund Exceptions
  recommendRefundException: (params: any) => void;
  approveRefundException: (exceptionId: string) => void;
  rejectRefundException: (exceptionId: string, reason: string) => void;

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
    const onHide = () => {
      if (document.visibilityState === "hidden") void flushSave();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      cancelled = true;
      offOther();
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

  const markSignalRead = useCallback((id: string) => {
    commit((prev) => ({ ...prev, signals: prev.signals.map((s) => (s.id === id ? { ...s, read: true } : s)) }));
  }, [commit]);

  /* ---------------------- create commands (services) ---------------------- */

  const createFranchiseCb = useCallback((input: FranchiseInput) => commit((prev) => createFranchise(prev, input, operatorId)), [commit, operatorId]);
  const createTerritoryCb = useCallback((input: TerritoryInput) => commit((prev) => createTerritory(prev, input, operatorId)), [commit, operatorId]);
  const createCityCb = useCallback((input: CityInput) => commit((prev) => createCity(prev, input, operatorId)), [commit, operatorId]);
  const createVenueCb = useCallback((input: VenueInput) => commit((prev) => createVenue(prev, input, operatorId)), [commit, operatorId]);
  const createPlayingAreaCb = useCallback((input: PlayingAreaInput) => commit((prev) => createPlayingArea(prev, input, operatorId)), [commit, operatorId]);
  const createCategoryCb = useCallback((input: CategoryInput) => commit((prev) => createCategory(prev, input, operatorId)), [commit, operatorId]);
  const createTemplateCb = useCallback((input: TemplateInput) => commit((prev) => createTemplate(prev, input, operatorId)), [commit, operatorId]);
  const createActivityCategoryCb = useCallback((input: CategoryInput) => commit((prev) => createActivityCategory(prev, input, operatorId)), [commit, operatorId]);
  const updateActivityCategoryCb = useCallback((id: string, patch: Partial<ActivityCategory>) => commit((prev) => updateActivityCategory(prev, id, patch, operatorId)), [commit, operatorId]);
  const changeCategoryStatusCb = useCallback((id: string, status: CategoryStatus) => commit((prev) => changeCategoryStatus(prev, id, status, operatorId)), [commit, operatorId]);
  const duplicateCategoryCb = useCallback((id: string) => commit((prev) => duplicateCategory(prev, id, operatorId)), [commit, operatorId]);
  const createExperienceTemplateCb = useCallback((input: TemplateInput) => commit((prev) => createExperienceTemplate(prev, input, operatorId)), [commit, operatorId]);
  const updateExperienceTemplateCb = useCallback((id: string, patch: Partial<ExperienceTemplate>, reason?: string, changedFields?: string[]) => commit((prev) => updateExperienceTemplate(prev, id, patch, operatorId, reason, changedFields)), [commit, operatorId]);
  const changeTemplateStatusCb = useCallback((id: string, status: TemplateStatus, reason?: string) => commit((prev) => changeTemplateStatus(prev, id, status, operatorId, reason)), [commit, operatorId]);
  const duplicateExperienceTemplateCb = useCallback((id: string) => commit((prev) => duplicateExperienceTemplate(prev, id, operatorId)), [commit, operatorId]);
  const duplicateTemplateVersionCb = useCallback((versionId: string) => commit((prev) => duplicateTemplateVersion(prev, versionId, operatorId)), [commit, operatorId]);
  const addCatalogNoteCb = useCallback((entity: string, name: string, note: string) => commit((prev) => addCatalogNote(prev, entity, name, note, operatorId)), [commit, operatorId]);
  const createSessionCb = useCallback((input: SessionInput) => commit((prev) => createSession(prev, input, operatorId)), [commit, operatorId]);
  const createBookingCb = useCallback((input: BookingInput) => commit((prev) => createBooking(prev, input, operatorId)), [commit, operatorId]);

  /* ------------------- geography update/status commands ------------------- */

  const updateFranchiseCb = useCallback((id: string, patch: Partial<PrototypeFranchise>) => commit((prev) => updateFranchise(prev, id, patch, operatorId)), [commit, operatorId]);
  const changeFranchiseStatusCb = useCallback((id: string, status: PrototypeFranchise["status"]) => commit((prev) => changeFranchiseStatus(prev, id, status, operatorId)), [commit, operatorId]);
  const changeFranchiseHeadCb = useCallback((id: string, head: string) => commit((prev) => changeFranchiseHead(prev, id, head, operatorId)), [commit, operatorId]);
  const updateTerritoryCb = useCallback((id: string, patch: Partial<PrototypeTerritory>) => commit((prev) => updateTerritory(prev, id, patch, operatorId)), [commit, operatorId]);
  const changeTerritoryStatusCb = useCallback((id: string, status: PrototypeTerritory["status"]) => commit((prev) => changeTerritoryStatus(prev, id, status, operatorId)), [commit, operatorId]);
  const assignTerritoryManagerCb = useCallback((id: string, managerId: string) => commit((prev) => assignTerritoryManager(prev, id, managerId, operatorId)), [commit, operatorId]);
  const updateCityCb = useCallback((id: string, patch: Partial<PrototypeCity>) => commit((prev) => updateCity(prev, id, patch, operatorId)), [commit, operatorId]);
  const changeCityStatusCb = useCallback((id: string, status: PrototypeCity["status"]) => commit((prev) => changeCityStatus(prev, id, status, operatorId)), [commit, operatorId]);
  const assignCityManagerCb = useCallback((id: string, managerId: string) => commit((prev) => assignCityManager(prev, id, managerId, operatorId)), [commit, operatorId]);
  const updateVenueCb = useCallback((id: string, patch: Partial<PrototypeVenue>) => commit((prev) => updateVenue(prev, id, patch, operatorId)), [commit, operatorId]);
  const changeVenueStatusCb = useCallback((id: string, status: PrototypeVenue["status"]) => commit((prev) => changeVenueStatus(prev, id, status, operatorId)), [commit, operatorId]);
  const addVenueSafetyNoteCb = useCallback((id: string, note: string) => commit((prev) => addVenueSafetyNote(prev, id, note, operatorId)), [commit, operatorId]);
  const updatePlayingAreaCb = useCallback((id: string, patch: Partial<PrototypePlayingArea>) => commit((prev) => updatePlayingArea(prev, id, patch, operatorId)), [commit, operatorId]);
  const changePlayingAreaStatusCb = useCallback((id: string, status: PrototypePlayingArea["status"]) => commit((prev) => changePlayingAreaStatus(prev, id, status, operatorId)), [commit, operatorId]);
  const addOperationalNoteCb = useCallback((entity: string, name: string, note: string) => commit((prev) => addOperationalNote(prev, entity, name, note, operatorId)), [commit, operatorId]);

  /* ------------------- operational commands (services) ------------------- */

  const updateBooking = useCallback(
    (id: string, updates: Partial<Booking>) =>
      commit((prev) => ({
        ...prev,
        bookings: prev.bookings.map((b) => (b.id === id ? { ...b, ...updates } : b))
      })),
    [commit]
  );

  const confirmBookingCb = useCallback((id: string, method = "card") => commit((prev) => confirmBooking(prev, id, method, operatorId)), [commit, operatorId]);
  const cancelBookingCb = useCallback((id: string, reason = "cancelled") => commit((prev) => cancelBooking(prev, id, operatorId, reason)), [commit, operatorId]);
  const promoteWaitlistUserCb = useCallback((sessionId: string) => commit((prev) => promoteWaitlistUser(prev, sessionId, operatorId)), [commit, operatorId]);
  const generateTemporaryIdsCb = useCallback((sessionId: string) => commit((prev) => generateTemporaryIds(prev, sessionId, operatorId)), [commit, operatorId]);
  const allocateTeamsCb = useCallback((sessionId: string) => commit((prev) => allocateTeams(prev, sessionId, operatorId)), [commit, operatorId]);
  const completeSessionCb = useCallback((sessionId: string) => commit((prev) => completeSessionRepo(prev, sessionId, operatorId)), [commit, operatorId]);
  const cancelSessionCb = useCallback((sessionId: string, reason: string) => commit((prev) => cancelSession(prev, sessionId, reason, operatorId)), [commit, operatorId]);
  const updateSessionStatusCb = useCallback((id: string, status: SessionStatus) => commit((prev) => updateSessionStatus(prev, id, status, operatorId)), [commit, operatorId]);
  const updateMatchScoreCb = useCallback(
    (tournamentId: string, matchId: string, scoreA: number, scoreB: number, winner: string, status: "scheduled" | "live" | "completed" | "walkover" | "abandoned") =>
      commit((prev) => updateMatchScore(prev, tournamentId, matchId, scoreA, scoreB, winner, status, operatorId)),
    [commit, operatorId]
  );
  const strikeBookingCb = useCallback((id: string) => commit((prev) => strikeBookingCommand(prev, id, operatorId)), [commit, operatorId]);
  const toggleTemplateCb = useCallback((id: string) => commit((prev) => toggleTemplateCommand(prev, id, operatorId)), [commit, operatorId]);
  const simulateRefundCb = useCallback((transactionId: string) => commit((prev) => simulateRefund(prev, transactionId, operatorId)), [commit, operatorId]);
  const retryPaymentCb = useCallback((transactionId: string) => commit((prev) => retryPayment(prev, transactionId, operatorId)), [commit, operatorId]);

  const createBookingReservationCb = useCallback(
    (params: any) => {
      let res: any;
      commit((prev) => {
        const out = createBookingReservation(prev, { ...params, operatorId });
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const confirmBookingPaymentCb = useCallback((id: string, method = "card") => commit((prev) => confirmBookingPayment(prev, id, method, operatorId)), [commit, operatorId]);
  const failBookingPaymentCb = useCallback((id: string, reason?: string) => commit((prev) => failBookingPayment(prev, id, reason, operatorId)), [commit, operatorId]);
  const expireReservationCb = useCallback((id: string) => commit((prev) => expireReservation(prev, id, operatorId)), [commit, operatorId]);
  const joinWaitlistCb = useCallback((params: any) => commit((prev) => joinWaitlist(prev, { ...params, operatorId })), [commit, operatorId]);
  const offerWaitlistSlotCb = useCallback((sessionId: string) => commit((prev) => offerWaitlistSlot(prev, sessionId, operatorId)), [commit, operatorId]);
  const acceptWaitlistOfferCb = useCallback((bookingId: string) => commit((prev) => acceptWaitlistOffer(prev, bookingId, operatorId)), [commit, operatorId]);
  const expireWaitlistOfferCb = useCallback((bookingId: string) => commit((prev) => expireWaitlistOffer(prev, bookingId, operatorId)), [commit, operatorId]);

  const initiateRefundCb = useCallback(
    (params: any) => {
      let res: any;
      commit((prev) => {
        const out = initiateRefund(prev, { ...params, operatorId });
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const approveRefundCb = useCallback((refundId: string) => commit((prev) => approveRefund(prev, refundId, operatorId)), [commit, operatorId]);
  const rejectRefundCb = useCallback((refundId: string, reason?: string) => commit((prev) => rejectRefund(prev, refundId, reason, operatorId)), [commit, operatorId]);
  const completeRefundCb = useCallback((refundId: string) => commit((prev) => completeRefund(prev, refundId, operatorId)), [commit, operatorId]);
  const reconcilePaymentCb = useCallback((paymentId: string) => commit((prev) => reconcilePayment(prev, paymentId, operatorId)), [commit, operatorId]);

  /* ------------------- SA-P2F Operations Commands ------------------- */

  const createIdentityPatternCb = useCallback(
    (input: any) => {
      let res: any;
      commit((prev) => {
        const out = createIdentityPattern(prev, input, operatorId);
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const generateTemporaryIdentitiesCb = useCallback(
    (sessionId: string, patternId?: string) => commit((prev) => generateTemporaryIdentities(prev, sessionId, patternId, operatorId)),
    [commit, operatorId]
  );

  const lockTemporaryIdentitiesCb = useCallback(
    (sessionId: string) => commit((prev) => lockTemporaryIdentities(prev, sessionId, operatorId)),
    [commit, operatorId]
  );

  const revokeTemporaryIdentityCb = useCallback(
    (identityId: string, reason: string) => commit((prev) => revokeTemporaryIdentity(prev, identityId, reason, operatorId)),
    [commit, operatorId]
  );

  const createTeamsCb = useCallback(
    (sessionId: string, numTeams?: number, teamCapacity?: number) => commit((prev) => createTeams(prev, sessionId, numTeams, teamCapacity, operatorId)),
    [commit, operatorId]
  );

  const allocateTeamsRandomlyCb = useCallback(
    (sessionId: string) => commit((prev) => allocateTeamsRandomly(prev, sessionId, operatorId)),
    [commit, operatorId]
  );

  const moveTeamParticipantCb = useCallback(
    (params: any) => {
      let res: any;
      commit((prev) => {
        const out = moveTeamParticipant(prev, { ...params, operatorId });
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const swapTeamParticipantsCb = useCallback(
    (params: any) => {
      let res: any;
      commit((prev) => {
        const out = swapTeamParticipants(prev, { ...params, operatorId });
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const lockTeamsCb = useCallback(
    (sessionId: string) => commit((prev) => lockTeams(prev, sessionId, operatorId)),
    [commit, operatorId]
  );

  const unlockTeamsWithOverrideCb = useCallback(
    (sessionId: string, reason: string) => commit((prev) => unlockTeamsWithOverride(prev, sessionId, reason, operatorId)),
    [commit, operatorId]
  );

  const triggerRevealCb = useCallback(
    (sessionId: string, overrideReason?: string) => {
      let res: any;
      commit((prev) => {
        const out = triggerReveal(prev, sessionId, overrideReason, operatorId);
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const delayRevealCb = useCallback(
    (sessionId: string, newRevealTime: string, reason: string) => commit((prev) => delayReveal(prev, sessionId, newRevealTime, reason, operatorId)),
    [commit, operatorId]
  );

  const cancelRevealCb = useCallback(
    (sessionId: string, reason: string) => commit((prev) => cancelReveal(prev, sessionId, reason, operatorId)),
    [commit, operatorId]
  );

  const createCheckInRecordsCb = useCallback(
    (sessionId: string) => commit((prev) => createCheckInRecords(prev, sessionId, operatorId)),
    [commit, operatorId]
  );

  const updateCheckInStatusCb = useCallback(
    (params: any) => {
      let res: any;
      commit((prev) => {
        const out = updateCheckInStatus(prev, { ...params, operatorId });
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const checkInStaffCb = useCallback(
    (sessionId: string, crewId: string) => commit((prev) => checkInStaff(prev, sessionId, crewId, operatorId)),
    [commit, operatorId]
  );

  const createCrewMemberCb = useCallback(
    (input: any) =>
      commit((prev) => {
        const id = input.id || `c-${Date.now()}`;
        const newCrew: CrewMember = {
          id,
          territoryId: input.territoryId || "hvd-central",
          venueId: input.venueId || "v-1",
          name: input.name || "New Staff Member",
          role: input.role || "staff",
          status: input.status || "available",
          assignment: input.assignment || "General Floor Support",
        };
        return { ...prev, crew: [...(prev.crew || []), newCrew] };
      }),
    [commit]
  );

  const updateCrewMemberCb = useCallback(
    (id: string, patch: Partial<CrewMember>) =>
      commit((prev) => ({
        ...prev,
        crew: (prev.crew || []).map((c) => (c.id === id ? { ...c, ...patch } : c)),
      })),
    [commit]
  );

  const assignCrewToSessionCb = useCallback(
    (params: { sessionId: string; crewId: string; role?: string; assignmentTitle?: string }) =>
      commit((prev) => {
        const session = (prev.sessions || []).find((s) => s.id === params.sessionId);
        const crewMember = (prev.crew || []).find((c) => c.id === params.crewId);
        if (!session || !crewMember) return prev;

        const isLead = params.role === "coordinator" || params.role === "Lead Coordinator";
        const isSafety = params.role === "safety" || params.role === "Safety Officer";

        const updatedSessions = (prev.sessions || []).map((s) => {
          if (s.id !== params.sessionId) return s;
          return {
            ...s,
            ...(isLead ? { leadCoordinatorId: params.crewId } : {}),
            ...(isSafety ? { safetyContactId: params.crewId } : {}),
          };
        });

        const updatedCrew = (prev.crew || []).map((c) => {
          if (c.id !== params.crewId) return c;
          return {
            ...c,
            status: "assigned" as const,
            assignment: params.assignmentTitle || `Assigned to Event ${params.sessionId}`,
          };
        });

        return { ...prev, sessions: updatedSessions, crew: updatedCrew };
      }),
    [commit]
  );

  const requestEmergencyIdentityAccessCb = useCallback(
    (params: any) => {
      let res: any;
      commit((prev) => {
        const out = requestEmergencyIdentityAccess(prev, { ...params, operatorId, operatorRole: roleId ?? "" });
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId, roleId]
  );

  const closeEmergencyIdentityAccessCb = useCallback(
    (logId: string) => commit((prev) => closeEmergencyIdentityAccess(prev, logId, operatorId)),
    [commit, operatorId]
  );

  /* ------------------- SA-P2G Live Operations Commands ------------------- */

  const openSessionCb = useCallback(
    (sessionId: string) => {
      let res: any;
      commit((prev) => {
        const out = openSession(prev, sessionId, operatorId);
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const startLiveSessionCb = useCallback(
    (sessionId: string) => {
      let res: any;
      commit((prev) => {
        const out = startLiveSession(prev, sessionId, operatorId);
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const pauseLiveSessionCb = useCallback(
    (sessionId: string, reason: string) => {
      let res: any;
      commit((prev) => {
        const out = pauseLiveSession(prev, sessionId, reason, operatorId);
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const resumeLiveSessionCb = useCallback(
    (sessionId: string) => {
      let res: any;
      commit((prev) => {
        const out = resumeLiveSession(prev, sessionId, operatorId);
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const enterEmergencyModeCb = useCallback(
    (params: any) => {
      let res: any;
      commit((prev) => {
        const out = enterEmergencyMode(prev, { ...params, operatorId, operatorRole: roleId ?? "" });
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId, roleId]
  );

  const exitEmergencyModeCb = useCallback(
    (params: any) => {
      let res: any;
      commit((prev) => {
        const out = exitEmergencyMode(prev, { ...params, operatorId, operatorRole: roleId ?? "" });
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId, roleId]
  );

  const endLiveSessionCb = useCallback(
    (sessionId: string) => {
      let res: any;
      commit((prev) => {
        const out = endLiveSession(prev, sessionId, operatorId);
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const createActivitySegmentCb = useCallback(
    (input: any) => {
      let res: any;
      commit((prev) => {
        const out = createActivitySegment(prev, input, operatorId);
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const startActivitySegmentCb = useCallback(
    (sessionId: string, segmentId: string) => {
      let res: any;
      commit((prev) => {
        const out = startActivitySegment(prev, sessionId, segmentId, operatorId);
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const completeActivitySegmentCb = useCallback(
    (sessionId: string, segmentId: string) => {
      let res: any;
      commit((prev) => {
        const out = completeActivitySegment(prev, sessionId, segmentId, operatorId);
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const skipActivitySegmentCb = useCallback(
    (sessionId: string, segmentId: string, reason: string) => {
      let res: any;
      commit((prev) => {
        const out = skipActivitySegment(prev, sessionId, segmentId, reason, operatorId);
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const createDraftResultCb = useCallback(
    (params: any) => {
      let res: any;
      commit((prev) => {
        const out = createDraftResult(prev, { ...params, operatorId });
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const confirmResultCb = useCallback(
    (sessionId: string, segmentId: string) => {
      let res: any;
      commit((prev) => {
        const out = confirmResult(prev, sessionId, segmentId, operatorId);
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const correctResultCb = useCallback(
    (params: any) => {
      let res: any;
      commit((prev) => {
        const out = correctResult(prev, { ...params, operatorId });
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const addLiveOperationalNoteCb = useCallback(
    (input: any) => {
      let res: any;
      commit((prev) => {
        const out = addLiveOperationalNote(prev, input, operatorId);
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const updateEquipmentStatusCb = useCallback(
    (params: any) => {
      let res: any;
      commit((prev) => {
        const out = updateEquipmentStatus(prev, { ...params, operatorId });
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  const completeLiveSessionCb = useCallback(
    (sessionId: string, overrideReason?: string) => {
      let res: any;
      commit((prev) => {
        const out = completeLiveSession(prev, sessionId, overrideReason, operatorId);
        res = out;
        return out.state;
      });
      return res;
    },
    [commit, operatorId]
  );

  // Tournament Callbacks
  const createTournamentCb = useCallback((params: any) => commit((prev) => createTournament(prev, params, operatorId)), [commit, operatorId]);
  const assignTournamentTeamsCb = useCallback((tournamentId: string, teamIds: string[]) => commit((prev) => assignTournamentTeams(prev, tournamentId, teamIds, operatorId)), [commit, operatorId]);
  const generateSingleEliminationBracketCb = useCallback((tournamentId: string) => commit((prev) => generateSingleEliminationBracket(prev, tournamentId, operatorId)), [commit, operatorId]);
  const publishTournamentCb = useCallback((tournamentId: string) => commit((prev) => publishTournament(prev, tournamentId, operatorId)), [commit, operatorId]);
  const assignMatchRefereeCb = useCallback((tournamentId: string, matchId: string, refereeId: string) => commit((prev) => assignMatchReferee(prev, tournamentId, matchId, refereeId, operatorId)), [commit, operatorId]);
  const updateMatchReadinessCb = useCallback((tournamentId: string, matchId: string, status: "scheduled" | "ready") => commit((prev) => updateMatchReadiness(prev, tournamentId, matchId, status, operatorId)), [commit, operatorId]);
  const startTournamentMatchCb = useCallback((tournamentId: string, matchId: string) => commit((prev) => startTournamentMatch(prev, tournamentId, matchId, operatorId)), [commit, operatorId]);
  const pauseTournamentMatchCb = useCallback((tournamentId: string, matchId: string) => commit((prev) => pauseTournamentMatch(prev, tournamentId, matchId, operatorId)), [commit, operatorId]);
  const resumeTournamentMatchCb = useCallback((tournamentId: string, matchId: string) => commit((prev) => resumeTournamentMatch(prev, tournamentId, matchId, operatorId)), [commit, operatorId]);
  const confirmTournamentMatchResultCb = useCallback((params: any) => commit((prev) => confirmTournamentMatchResult(prev, params, operatorId)), [commit, operatorId]);
  const verifyTournamentMatchResultCb = useCallback((tournamentId: string, matchId: string) => commit((prev) => verifyTournamentMatchResult(prev, tournamentId, matchId, operatorId)), [commit, operatorId]);
  const correctTournamentMatchResultCb = useCallback((params: any) => commit((prev) => correctTournamentMatchResult(prev, params, operatorId)), [commit, operatorId]);
  const declareWalkoverCb = useCallback((tournamentId: string, matchId: string, winnerTeamId: string, reason: string) => commit((prev) => declareWalkover(prev, tournamentId, matchId, winnerTeamId, reason, operatorId)), [commit, operatorId]);
  const disqualifyTeamCb = useCallback((tournamentId: string, teamId: string, reason: string) => commit((prev) => disqualifyTeam(prev, tournamentId, teamId, reason, operatorId)), [commit, operatorId]);
  const abandonMatchCb = useCallback((tournamentId: string, matchId: string, reason: string) => commit((prev) => abandonMatch(prev, tournamentId, matchId, reason, operatorId)), [commit, operatorId]);
  const advanceVerifiedWinnerCb = useCallback((tournamentId: string, matchId: string) => commit((prev) => advanceVerifiedWinner(prev, tournamentId, matchId, operatorId)), [commit, operatorId]);
  const completeTournamentCb = useCallback((tournamentId: string, winnerTeamId: string) => commit((prev) => completeTournament(prev, tournamentId, winnerTeamId, operatorId)), [commit, operatorId]);

  // Safety Callbacks
  const reportIncidentCb = useCallback((params: any) => commit((prev) => reportIncident(prev, params, operatorId)), [commit, operatorId]);
  const acknowledgeIncidentCb = useCallback((incidentId: string) => commit((prev) => acknowledgeIncident(prev, incidentId, operatorId)), [commit, operatorId]);
  const triageIncidentCb = useCallback((params: any) => commit((prev) => triageIncident(prev, params, operatorId)), [commit, operatorId]);
  const assignInvestigatorCb = useCallback((incidentId: string, investigatorId: string) => commit((prev) => assignInvestigator(prev, incidentId, investigatorId, operatorId)), [commit, operatorId]);
  const escalateIncidentCb = useCallback((incidentId: string, reason: string) => commit((prev) => escalateIncident(prev, incidentId, reason, operatorId)), [commit, operatorId]);
  const updateInvestigationCb = useCallback((incidentId: string, summary: string) => commit((prev) => updateInvestigation(prev, incidentId, summary, operatorId)), [commit, operatorId]);
  const resolveIncidentCb = useCallback((incidentId: string, resolution: string) => commit((prev) => resolveIncident(prev, incidentId, resolution, operatorId)), [commit, operatorId]);
  const closeIncidentCb = useCallback((incidentId: string, notes: string) => commit((prev) => closeIncident(prev, incidentId, notes, operatorId)), [commit, operatorId]);
  const addEvidencePlaceholderCb = useCallback((params: any) => commit((prev) => addEvidencePlaceholder(prev, params, operatorId)), [commit, operatorId]);
  const createFollowUpCb = useCallback((incidentId: string, followUpOwnerId: string, dueAt: string) => commit((prev) => createFollowUp(prev, incidentId, followUpOwnerId, dueAt, operatorId)), [commit, operatorId]);

  // Disputes Callbacks
  const submitDisputeCb = useCallback((params: any) => commit((prev) => submitDispute(prev, params, operatorId)), [commit, operatorId]);
  const assignDisputeReviewerCb = useCallback((disputeId: string, reviewerId: string) => commit((prev) => assignDisputeReviewer(prev, disputeId, reviewerId, operatorId)), [commit, operatorId]);
  const requestDisputeEvidenceCb = useCallback((disputeId: string) => commit((prev) => requestDisputeEvidence(prev, disputeId, operatorId)), [commit, operatorId]);
  const decideDisputeCb = useCallback((params: any) => commit((prev) => decideDispute(prev, params, operatorId)), [commit, operatorId]);
  const closeDisputeCb = useCallback((disputeId: string) => commit((prev) => closeDispute(prev, disputeId, operatorId)), [commit, operatorId]);

  // Moderation Callbacks
  const createModerationCaseCb = useCallback((params: any) => commit((prev) => createModerationCase(prev, params, operatorId)), [commit, operatorId]);
  const proposeModerationActionCb = useCallback((params: any) => commit((prev) => proposeModerationAction(prev, params, operatorId)), [commit, operatorId]);
  const approveModerationActionCb = useCallback((actionId: string) => commit((prev) => approveModerationAction(prev, actionId, operatorId)), [commit, operatorId]);
  const rejectModerationActionCb = useCallback((actionId: string, reason: string) => commit((prev) => rejectModerationAction(prev, actionId, reason, operatorId)), [commit, operatorId]);
  const revokeModerationActionCb = useCallback((actionId: string, reason: string) => commit((prev) => revokeModerationAction(prev, actionId, reason, operatorId)), [commit, operatorId]);

  // Refund Exceptions Callbacks
  const recommendRefundExceptionCb = useCallback((params: any) => commit((prev) => recommendRefundException(prev, params, operatorId)), [commit, operatorId]);
  const approveRefundExceptionCb = useCallback((exceptionId: string) => commit((prev) => approveRefundException(prev, exceptionId, operatorId)), [commit, operatorId]);
  const rejectRefundExceptionCb = useCallback((exceptionId: string, reason: string) => commit((prev) => rejectRefundException(prev, exceptionId, reason, operatorId)), [commit, operatorId]);

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
    // Resolve territory: prototype state is the source of truth for the id/name;
    // legacy meta (TERRITORIES) only supplies the shell's stats (time/venues/fill).
    const territoryData = state.territories.find((t) => t.id === consolePrefs.territoryId) ?? state.territories[0] ?? SEED_TERRITORIES[0];
    const legacy = territoryById(territoryData.id as never);
    const resolvedTerritoryObj = {
      ...legacy,
      id: territoryData.id as TerritoryId,
      name: territoryData.name,
      code: territoryData.name.slice(0, 3).toUpperCase(),
    };

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
      canAccess: (href: string) => (auth && roleId && operator ? canAccess(href, roleId) : false),
      createFranchise: createFranchiseCb,
      createTerritory: createTerritoryCb,
      createCity: createCityCb,
      createVenue: createVenueCb,
      createPlayingArea: createPlayingAreaCb,
      createCategory: createCategoryCb,
      createTemplate: createTemplateCb,
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
      createBooking: createBookingCb,
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
      updateBooking,
      confirmBooking: confirmBookingCb,
      cancelBooking: cancelBookingCb,
      promoteWaitlistUser: promoteWaitlistUserCb,
      generateTemporaryIds: generateTemporaryIdsCb,
      allocateTeams: allocateTeamsCb,
      completeSession: completeSessionCb,
      cancelSession: cancelSessionCb,
      updateSessionStatus: updateSessionStatusCb,
      updateMatchScore: updateMatchScoreCb,
      strikeBooking: strikeBookingCb,
      toggleTemplate: toggleTemplateCb,
      simulateRefund: simulateRefundCb,
      retryPayment: retryPaymentCb,
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
      advanceVerifiedWinner: advanceVerifiedWinnerCb,
      completeTournament: completeTournamentCb,
      reportIncident: reportIncidentCb,
      acknowledgeIncident: acknowledgeIncidentCb,
      triageIncident: triageIncidentCb,
      assignInvestigator: assignInvestigatorCb,
      escalateIncident: escalateIncidentCb,
      updateInvestigation: updateInvestigationCb,
      resolveIncident: resolveIncidentCb,
      closeIncident: closeIncidentCb,
      addEvidencePlaceholder: addEvidencePlaceholderCb,
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
    roleId,
    commit,
    createCrewMemberCb,
    updateCrewMemberCb,
    assignCrewToSessionCb,
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
    createFranchiseCb,
    createTerritoryCb,
    createCityCb,
    createVenueCb,
    createPlayingAreaCb,
    createCategoryCb,
    createTemplateCb,
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
    createBookingCb,
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
    updateBooking,
    confirmBookingCb,
    cancelBookingCb,
    promoteWaitlistUserCb,
    generateTemporaryIdsCb,
    allocateTeamsCb,
    completeSessionCb,
    cancelSessionCb,
    updateSessionStatusCb,
    updateMatchScoreCb,
    strikeBookingCb,
    toggleTemplateCb,
    simulateRefundCb,
    retryPaymentCb,
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
    advanceVerifiedWinnerCb,
    completeTournamentCb,
    reportIncidentCb,
    acknowledgeIncidentCb,
    triageIncidentCb,
    assignInvestigatorCb,
    escalateIncidentCb,
    updateInvestigationCb,
    resolveIncidentCb,
    closeIncidentCb,
    addEvidencePlaceholderCb,
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

const SEED_TERRITORIES = [
  { id: "hvd-central", name: "Hyderabad Central" },
  { id: "blr-south", name: "Bengaluru South" },
  { id: "mum-west", name: "Mumbai West" }
];

export function useStore(): StoreValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
