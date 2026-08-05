import type { City, Franchise, PlayingArea, Territory, Venue } from "../entities";
import type { PrototypeState } from "../scenarios";
import { operatorName } from "@/lib/data/mock";
import { bookedCount } from "./status";
import { cityById, territoryById, venueById, playingAreaById } from "./lookups";
import { sessionViews, type SessionView } from "./views";

/* ------------------------------ local helpers ------------------------------ */

const isUpcoming = (s: { date: string; status: string }) =>
  (s.date === "Today" || s.date === "Tomorrow") && !["cancelled", "completed", "archived"].includes(s.status);

const avgFill = (state: PrototypeState, sessions: { id: string; maxParticipants: number }[]): number =>
  sessions.length
    ? Math.round(sessions.reduce((a, s) => a + Math.round((bookedCount(state, s.id) / Math.max(s.maxParticipants, 1)) * 100), 0) / sessions.length)
    : 0;

const scopedSessions = (state: PrototypeState, match: (s: { territoryId: string; cityId: string; venueId: string }) => boolean) =>
  state.sessions.filter(match);

const settledPayments = (state: PrototypeState, sessionIds: Set<string>) =>
  state.transactions
    .filter((t) => t.kind === "payment" && t.status === "settled" && sessionIds.has(t.sessionId))
    .reduce((a, t) => a + t.amount, 0);

const settledRefunds = (state: PrototypeState, sessionIds: Set<string>) =>
  state.transactions
    .filter((t) => t.kind === "refund" && t.status === "settled" && sessionIds.has(t.sessionId))
    .reduce((a, t) => a + Math.abs(t.amount), 0);

const refundRate = (state: PrototypeState, sessionIds: Set<string>): number => {
  const p = settledPayments(state, sessionIds);
  if (p <= 0) return 0;
  return Math.round((settledRefunds(state, sessionIds) / p) * 100);
};

const openIncidents = (state: PrototypeState, sessionIds: Set<string>) =>
  state.incidents.filter((i) => sessionIds.has(i.sessionId) && !["resolved", "closed"].includes(i.status)).length;

const staffingHealth = (state: PrototypeState, territoryIds: Set<string>, venueIds?: Set<string>): number => {
  const crew = state.crew.filter((c) => territoryIds.has(c.territoryId) && (!venueIds || venueIds.has(c.venueId)));
  if (!crew.length) return 100;
  return Math.round((crew.filter((c) => c.status === "available" || c.status === "checked-in").length / crew.length) * 100);
};

const lastActivity = (state: PrototypeState, scopedSessionIds: Set<string>, names: string[]): string => {
  const found = state.audits.find(
    (a) => (a.sessionId && scopedSessionIds.has(a.sessionId)) || names.some((n) => a.description.includes(n))
  );
  return found ? `${found.action} · ${found.timestamp}` : "No recorded activity";
};

const franchiseWarnings = (f: Franchise): string[] => {
  const out: string[] = [];
  if (f.status !== "active") out.push(`Franchise status is "${f.status}".`);
  return out;
};

/* --------------------------- franchise list rows --------------------------- */

export interface FranchiseListRow {
  id: string;
  name: string;
  type: string;
  isInternal: boolean;
  status: Franchise["status"];
  legalEntity: string;
  franchiseHead: string;
  territories: number;
  activeCities: number;
  activeVenues: number;
  upcomingSessions: number;
  revenue: number;
  fill: number;
  refundRate: number;
  incidentCount: number;
  staffingHealth: number;
  lastActivity: string;
  warnings: string[];
}

export function franchiseRows(state: PrototypeState): FranchiseListRow[] {
  return state.franchises.map((f) => {
    const territories = state.territories.filter((t) => t.franchiseId === f.id);
    const territoryIds = new Set(territories.map((t) => t.id));
    const cityIds = new Set(state.cities.filter((c) => territoryIds.has(c.territoryId)).map((c) => c.id));
    const venues = state.venues.filter((v) => territoryIds.has(v.territoryId));
    const venueIds = new Set(venues.map((v) => v.id));
    const sessions = state.sessions.filter((s) => territoryIds.has(s.territoryId));
    const sessionIds = new Set(sessions.map((s) => s.id));
    const upcoming = sessions.filter(isUpcoming);
    return {
      id: f.id,
      name: f.name,
      type: f.type,
      isInternal: f.isInternal,
      status: f.status,
      legalEntity: f.legalEntity,
      franchiseHead: f.franchiseHead,
      territories: territories.length,
      activeCities: state.cities.filter((c) => cityIds.has(c.id) && c.status === "active").length,
      activeVenues: venues.filter((v) => v.status === "ready").length,
      upcomingSessions: upcoming.length,
      revenue: settledPayments(state, sessionIds),
      fill: avgFill(state, upcoming),
      refundRate: refundRate(state, sessionIds),
      incidentCount: openIncidents(state, sessionIds),
      staffingHealth: staffingHealth(state, territoryIds),
      lastActivity: lastActivity(state, sessionIds, [f.name]),
      warnings: franchiseWarnings(f)
    };
  });
}

/* --------------------------- territory list rows --------------------------- */

export interface TerritoryListRow {
  id: string;
  name: string;
  franchiseId: string;
  franchiseName: string;
  region: string;
  state: string;
  managerId: string;
  managerName: string;
  status: Territory["status"];
  cities: number;
  venues: number;
  upcomingSessions: number;
  fill: number;
  staffingRisk: string;
  safetySignals: number;
  revenue: number;
}

export function territoryRows(state: PrototypeState): TerritoryListRow[] {
  return state.territories.map((t) => {
    const venueIds = new Set(state.venues.filter((v) => v.territoryId === t.id).map((v) => v.id));
    const sessions = state.sessions.filter((s) => s.territoryId === t.id);
    const sessionIds = new Set(sessions.map((s) => s.id));
    const upcoming = sessions.filter(isUpcoming);
    const health = staffingHealth(state, new Set([t.id]));
    const signals = state.signals.filter((sg) => sg.sessionId && sessionIds.has(sg.sessionId));
    const incidents = openIncidents(state, sessionIds);
    return {
      id: t.id,
      name: t.name,
      franchiseId: t.franchiseId,
      franchiseName: state.franchises.find((f) => f.id === t.franchiseId)?.name ?? t.franchiseId,
      region: t.region,
      state: t.state,
      managerId: t.managerId,
      managerName: operatorName(t.managerId),
      status: t.status,
      cities: state.cities.filter((c) => c.territoryId === t.id).length,
      venues: venueIds.size,
      upcomingSessions: upcoming.length,
      fill: avgFill(state, upcoming),
      staffingRisk: health <= 50 ? "critical" : health <= 75 ? "watch" : "ok",
      safetySignals: signals.filter((s) => s.kind === "alert").length + incidents,
      revenue: settledPayments(state, sessionIds)
    };
  });
}

/* ------------------------------ city list rows ------------------------------ */

export interface CityListRow {
  id: string;
  territoryId: string;
  name: string;
  state: string;
  status: City["status"];
  managerId: string;
  managerName: string;
  launchDate: string;
  venues: number;
  playingAreas: number;
  upcomingSessions: number;
  fill: number;
  revenue: number;
}

export function cityRows(state: PrototypeState, territoryId?: string): CityListRow[] {
  const byTerritory = territoryId ? state.cities.filter((c) => c.territoryId === territoryId) : state.cities;
  return byTerritory.map((c) => {
    const venueIds = new Set(state.venues.filter((v) => v.cityId === c.id).map((v) => v.id));
    const sessions = state.sessions.filter((s) => s.cityId === c.id);
    const sessionIds = new Set(sessions.map((s) => s.id));
    const upcoming = sessions.filter(isUpcoming);
    return {
      id: c.id,
      territoryId: c.territoryId,
      name: c.name,
      state: c.state,
      status: c.status,
      managerId: c.managerId,
      managerName: operatorName(c.managerId),
      launchDate: c.launchDate,
      venues: venueIds.size,
      playingAreas: state.playingAreas.filter((p) => venueIds.has(p.venueId)).length,
      upcomingSessions: upcoming.length,
      fill: avgFill(state, upcoming),
      revenue: settledPayments(state, sessionIds)
    };
  });
}

/* ------------------------------ venue list rows ------------------------------ */

export interface VenueListRow {
  id: string;
  territoryId: string;
  territoryName: string;
  cityId: string;
  cityName: string;
  franchiseName: string;
  name: string;
  type: string;
  status: Venue["status"];
  verificationStatus: Venue["verificationStatus"];
  isIndoor: boolean;
  weatherDependent: boolean;
  safetyCapacity: number;
  staffCapacity: number;
  playingAreas: number;
  upcomingSessions: number;
  costPerSlot: number;
  openIncidents: number;
  warnings: string[];
}

export function venueRows(state: PrototypeState, territoryId?: string): VenueListRow[] {
  const byTerritory = territoryId ? state.venues.filter((v) => v.territoryId === territoryId) : state.venues;
  return byTerritory.map((v) => {
    const sessions = state.sessions.filter((s) => s.venueId === v.id);
    const sessionIds = new Set(sessions.map((s) => s.id));
    const city = cityById(state, v.cityId);
    const territory = territoryById(state, v.territoryId);
    const warnings: string[] = [];
    if (v.status !== "ready") warnings.push(`Venue status is "${v.status}".`);
    if (v.verificationStatus === "failed") warnings.push("Safety verification failed.");
    if (v.verificationStatus === "pending") warnings.push("Safety verification pending.");
    if (v.weatherDependent) warnings.push("Weather-dependent venue.");
    return {
      id: v.id,
      territoryId: v.territoryId,
      territoryName: territory?.name ?? v.territoryId,
      cityId: v.cityId,
      cityName: city?.name ?? v.cityId,
      franchiseName:
        state.franchises.find((f) => f.id === (territory?.franchiseId ?? ""))?.name ?? "—",
      name: v.name,
      type: v.type,
      status: v.status,
      verificationStatus: v.verificationStatus,
      isIndoor: v.isIndoor,
      weatherDependent: v.weatherDependent,
      safetyCapacity: v.safetyCapacity,
      staffCapacity: v.staffCapacity,
      playingAreas: state.playingAreas.filter((p) => p.venueId === v.id).length,
      upcomingSessions: sessions.filter(isUpcoming).length,
      costPerSlot: v.costPerSlot,
      openIncidents: openIncidents(state, sessionIds),
      warnings
    };
  });
}

/* ----------------------------- franchise detail ----------------------------- */

export interface FranchiseDetail extends Franchise {
  territories: TerritoryListRow[];
  cities: CityListRow[];
  venues: VenueListRow[];
  sessions: SessionView[];
  metrics: {
    territoryCount: number;
    cityCount: number;
    venueCount: number;
    activeSessions: number;
    fillRate: number;
    revenue: number;
    refundRate: number;
    incidentCount: number;
    staffingHealth: number;
  };
  warnings: string[];
  lastActivity: string;
}

export function franchiseDetail(state: PrototypeState, id: string): FranchiseDetail | undefined {
  const f = state.franchises.find((x) => x.id === id);
  if (!f) return undefined;
  const territoryIds = new Set(state.territories.filter((t) => t.franchiseId === id).map((t) => t.id));
  const sessions = state.sessions.filter((s) => territoryIds.has(s.territoryId));
  const sessionIds = new Set(sessions.map((s) => s.id));
  const upcoming = sessions.filter(isUpcoming);
  const territories = state.territories.filter((t) => territoryIds.has(t.id));
  const cityIds = new Set(state.cities.filter((c) => territoryIds.has(c.territoryId)).map((c) => c.id));
  return {
    ...f,
    territories: territoryRows(state).filter((t) => territoryIds.has(t.id)),
    cities: cityRows(state).filter((c) => cityIds.has(c.id)),
    venues: venueRows(state).filter((v) => territoryIds.has(v.territoryId)),
    sessions: sessionViews(state).filter((s) => territoryIds.has(s.territoryId)),
    metrics: {
      territoryCount: territories.length,
      cityCount: cityIds.size,
      venueCount: state.venues.filter((v) => territoryIds.has(v.territoryId)).length,
      activeSessions: upcoming.length,
      fillRate: avgFill(state, upcoming),
      revenue: settledPayments(state, sessionIds),
      refundRate: refundRate(state, sessionIds),
      incidentCount: openIncidents(state, sessionIds),
      staffingHealth: staffingHealth(state, territoryIds)
    },
    warnings: franchiseWarnings(f),
    lastActivity: lastActivity(state, sessionIds, [f.name])
  };
}

/* ----------------------------- territory detail ----------------------------- */

export interface TerritoryDetail extends Territory {
  franchise: { id: string; name: string };
  cities: CityListRow[];
  venues: VenueListRow[];
  sessions: SessionView[];
  managerName: string;
  metrics: {
    cityCount: number;
    venueCount: number;
    playingAreaCount: number;
    upcomingSessions: number;
    fillRate: number;
    staffingHealth: number;
    incidentCount: number;
    revenue: number;
    safetySignals: number;
  };
  warnings: string[];
  signals: Array<{ id: string; kind: string; message: string; at: string; read: boolean }>;
}

export function territoryDetail(state: PrototypeState, id: string): TerritoryDetail | undefined {
  const t = state.territories.find((x) => x.id === id);
  if (!t) return undefined;
  const franchise = state.franchises.find((f) => f.id === t.franchiseId);
  const sessions = state.sessions.filter((s) => s.territoryId === id);
  const sessionIds = new Set(sessions.map((s) => s.id));
  const upcoming = sessions.filter(isUpcoming);
  const venueIds = new Set(state.venues.filter((v) => v.territoryId === id).map((v) => v.id));
  const health = staffingHealth(state, new Set([id]));
  const signals = state.signals.filter((sg) => sg.sessionId && sessionIds.has(sg.sessionId));
  const incidents = openIncidents(state, sessionIds);
  const warnings: string[] = [];
  if (t.status !== "active") warnings.push(`Territory status is "${t.status}".`);
  if (t.status === "paused" && franchise?.status === "inactive") warnings.push("Paused because the parent franchise is paused.");
  if (health <= 50) warnings.push("Staffing health is critical.");
  return {
    ...t,
    franchise: { id: t.franchiseId, name: franchise?.name ?? t.franchiseId },
    cities: cityRows(state, id),
    venues: venueRows(state, id),
    sessions: sessionViews(state, id),
    managerName: operatorName(t.managerId),
    metrics: {
      cityCount: state.cities.filter((c) => c.territoryId === id).length,
      venueCount: venueIds.size,
      playingAreaCount: state.playingAreas.filter((p) => venueIds.has(p.venueId)).length,
      upcomingSessions: upcoming.length,
      fillRate: avgFill(state, upcoming),
      staffingHealth: health,
      incidentCount: incidents,
      revenue: settledPayments(state, sessionIds),
      safetySignals: signals.filter((s) => s.kind === "alert").length + incidents
    },
    warnings,
    signals: signals.map((s) => ({ id: s.id, kind: s.kind, message: s.message, at: s.at, read: s.read }))
  };
}

/* -------------------------------- city detail -------------------------------- */

export interface CityDetail extends City {
  territory: { id: string; name: string; franchiseId: string; franchiseName: string };
  venues: VenueListRow[];
  sessions: SessionView[];
  managerName: string;
  metrics: {
    venueCount: number;
    playingAreaCount: number;
    upcomingSessions: number;
    fillRate: number;
    revenue: number;
    incidentCount: number;
  };
  warnings: string[];
}

export function cityDetail(state: PrototypeState, id: string): CityDetail | undefined {
  const c = state.cities.find((x) => x.id === id);
  if (!c) return undefined;
  const territory = territoryById(state, c.territoryId);
  const franchise = territory ? state.franchises.find((f) => f.id === territory.franchiseId) : undefined;
  const sessions = state.sessions.filter((s) => s.cityId === id);
  const sessionIds = new Set(sessions.map((s) => s.id));
  const upcoming = sessions.filter(isUpcoming);
  const venueIds = new Set(state.venues.filter((v) => v.cityId === id).map((v) => v.id));
  const warnings: string[] = [];
  if (c.status !== "active") warnings.push(`City status is "${c.status}".`);
  if (c.supportedCategories.length === 0) warnings.push("No supported activity categories configured.");
  return {
    ...c,
    territory: {
      id: c.territoryId,
      name: territory?.name ?? c.territoryId,
      franchiseId: territory?.franchiseId ?? "",
      franchiseName: franchise?.name ?? "—"
    },
    venues: venueRows(state).filter((v) => v.cityId === id),
    sessions: sessionViews(state).filter((s) => s.cityId === id),
    managerName: operatorName(c.managerId),
    metrics: {
      venueCount: venueIds.size,
      playingAreaCount: state.playingAreas.filter((p) => venueIds.has(p.venueId)).length,
      upcomingSessions: upcoming.length,
      fillRate: avgFill(state, upcoming),
      revenue: settledPayments(state, sessionIds),
      incidentCount: openIncidents(state, sessionIds)
    },
    warnings
  };
}

/* -------------------------------- venue detail -------------------------------- */

export interface VenueDetail extends Venue {
  territoryName: string;
  cityName: string;
  franchiseName: string;
  playingAreas: Array<{
    id: string;
    name: string;
    capacity: number;
    status: string;
    activities: string[];
    sessionsToday: number;
  }>;
  sessions: SessionView[];
  crew: Array<{ id: string; name: string; role: string; status: string; assignment: string }>;
  metrics: {
    upcomingSessions: number;
    fillRate: number;
    revenue: number;
    incidentCount: number;
    playingAreaCount: number;
  };
  warnings: string[];
}

export function venueDetail(state: PrototypeState, id: string): VenueDetail | undefined {
  const v = state.venues.find((x) => x.id === id);
  if (!v) return undefined;
  const territory = territoryById(state, v.territoryId);
  const city = cityById(state, v.cityId);
  const franchise = state.franchises.find((f) => f.id === (territory?.franchiseId ?? ""));
  const sessions = state.sessions.filter((s) => s.venueId === id);
  const sessionIds = new Set(sessions.map((s) => s.id));
  const upcoming = sessions.filter(isUpcoming);
  const warnings: string[] = [];
  if (v.status !== "ready") warnings.push(`Venue is "${v.status}" — not available for new scheduling.`);
  if (v.verificationStatus !== "verified") warnings.push(`Safety verification is "${v.verificationStatus}".`);
  if (v.weatherDependent) warnings.push("Outdoor weather-dependent venue.");
  return {
    ...v,
    territoryName: territory?.name ?? v.territoryId,
    cityName: city?.name ?? v.cityId,
    franchiseName: franchise?.name ?? "—",
    playingAreas: state.playingAreas.filter((p) => p.venueId === id).map((p) => ({
      id: p.id,
      name: p.name,
      capacity: p.maxCapacity,
      status: p.status,
      activities: p.activityCompatibility,
      sessionsToday: state.sessions.filter((s) => s.playingAreaId === p.id && isUpcoming(s)).length
    })),
    sessions: sessionViews(state).filter((s) => s.venueId === id),
    crew: state.crew.filter((c) => c.venueId === id).map((c) => ({ id: c.id, name: c.name, role: c.role, status: c.status, assignment: c.assignment })),
    metrics: {
      upcomingSessions: upcoming.length,
      fillRate: avgFill(state, upcoming),
      revenue: settledPayments(state, sessionIds),
      incidentCount: openIncidents(state, sessionIds),
      playingAreaCount: state.playingAreas.filter((p) => p.venueId === id).length
    },
    warnings
  };
}

/* ----------------------------- playing area detail ----------------------------- */

export interface PlayingAreaDetail extends PlayingArea {
  venue: { id: string; name: string; status: string; cityId: string; territoryId: string };
  cityName: string;
  territoryName: string;
  franchiseName: string;
  sessions: SessionView[];
  warnings: string[];
}

export function playingAreaDetail(state: PrototypeState, id: string): PlayingAreaDetail | undefined {
  const p = state.playingAreas.find((x) => x.id === id);
  if (!p) return undefined;
  const venue = venueById(state, p.venueId);
  const city = venue ? cityById(state, venue.cityId) : undefined;
  const territory = venue ? territoryById(state, venue.territoryId) : undefined;
  const franchise = state.franchises.find((f) => f.id === (territory?.franchiseId ?? ""));
  const warnings: string[] = [];
  if (p.status !== "active") warnings.push(`Playing area status is "${p.status}".`);
  if (venue?.status !== "ready") warnings.push(`Parent venue is "${venue?.status ?? "missing"}".`);
  return {
    ...p,
    venue: venue ? { id: venue.id, name: venue.name, status: venue.status, cityId: venue.cityId, territoryId: venue.territoryId } : { id: p.venueId, name: p.venueId, status: "missing", cityId: "", territoryId: "" },
    cityName: city?.name ?? "—",
    territoryName: territory?.name ?? "—",
    franchiseName: franchise?.name ?? "—",
    sessions: sessionViews(state).filter((s) => {
      const raw = state.sessions.find((x) => x.id === s.id);
      return raw?.playingAreaId === id;
    }),
    warnings
  };
}

export { playingAreaById };
