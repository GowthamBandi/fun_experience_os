"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { MotionConfig } from "framer-motion";
import type { Operator, Role, RoleId, Territory, TerritoryId } from "@/lib/types";
import { OPERATORS, ROLES, territoryById } from "@/lib/data/mock";
import { canAccess } from "@/lib/nav";
import type {
  Incident,
  Signal,
  SessionStatus,
  Franchise as PrototypeFranchise,
  Territory as PrototypeTerritory,
  City as PrototypeCity,
  Venue as PrototypeVenue,
  PlayingArea as PrototypePlayingArea
} from "./prototype/entities";
import {
  getInitialState,
  applyScenario,
  type PrototypeState
} from "./prototype/scenarios";
import {
  loadPrototypeState,
  savePrototypeState,
  loadDemoStep,
  saveDemoStep
} from "./prototype/persistence";
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
  completeSession,
  cancelSession,
  updateSessionStatus,
  updateMatchScore,
  strikeBooking as strikeBookingCommand,
  toggleTemplate as toggleTemplateCommand,
  simulateRefund,
  retryPayment,
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

interface StoreValue {
  authed: boolean;
  hydrated: boolean;
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

  // Incident / signal / audit helpers
  addIncident: (i: Incident) => void;
  updateIncident: (id: string, updates: Partial<Incident>) => void;
  addSignal: (s: Signal) => void;
  addAudit: (sessionId: string | undefined, action: string, description: string) => void;

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

  // Prototype state
  const [state, setState] = useState<PrototypeState>(getInitialState);
  const [demoStep, setDemoStepState] = useState<number>(0);

  useEffect(() => {
    setAuth(readAuth());
    setConsolePrefs(readConsole());
    setState(loadPrototypeState());
    setDemoStepState(loadDemoStep());
    setHydrated(true);
  }, []);

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
  const commit = useCallback((fn: (prev: PrototypeState) => PrototypeState) => {
    setState((prev) => {
      const next = fn(prev);
      savePrototypeState(next);
      return next;
    });
  }, []);

  const operatorId = auth?.operatorId;

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
  const completeSessionCb = useCallback((sessionId: string) => commit((prev) => completeSession(prev, sessionId, operatorId)), [commit, operatorId]);
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
    const fresh = getInitialState();
    setState(fresh);
    savePrototypeState(fresh);
    setDemoStepState(0);
    saveDemoStep(0);
  }, []);

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
    const operator = auth ? (OPERATORS.find((o) => o.id === auth.operatorId) ?? null) : null;
    const role = ROLES.find((r) => r.id === (auth?.roleId ?? "coordinator")) ?? ROLES[6];
    // Resolve territory: prototype state is the source of truth for the id/name;
    // legacy meta (TERRITORIES) only supplies the shell's stats (time/venues/fill).
    const territoryData = state.territories.find((t) => t.id === consolePrefs.territoryId) ?? SEED_TERRITORIES[0];
    const legacy = territoryById(territoryData.id as never);
    const resolvedTerritoryObj = {
      ...legacy,
      id: territoryData.id as TerritoryId,
      name: territoryData.name,
      code: territoryData.name.slice(0, 3).toUpperCase(),
    };

    return {
      authed: !!auth && hydrated,
      hydrated,
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
      canAccess: (href: string) => (auth ? canAccess(href, auth.roleId) : false),
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
      addIncident,
      updateIncident,
      addSignal,
      addAudit,
      resetDemoData,
      loadScenario,
      setDemoStep
    };
  }, [
    auth,
    hydrated,
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
