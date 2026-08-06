import type {
  Booking,
  CategoryId,
  CrewMember,
  PromoCode,
  SessionId,
  SessionStatus,
  Shift,
  TemplateId,
  TemplateStatus,
  TerritoryId,
  Transaction,
  VenueId,
  IncidentSeverity,
  IncidentStatus
} from "../entities";
import type { PrototypeState } from "../scenarios";
import {
  bookedCount,
  waitlistCount,
  type SeatStatus
} from "./status";
import {
  categoryById,
  cityById,
  playingAreaById,
  sessionById,
  sessionTitle,
  templateById,
  venueById,
  venueName
} from "./lookups";

/* ---------------------------- session views ---------------------------- */

export interface SessionView {
  id: SessionId;
  title: string;
  activity: string;
  format: string;
  templateId: TemplateId;
  categoryId: CategoryId;
  territoryId: TerritoryId;
  cityId: string;
  venueId: VenueId;
  venueName: string;
  playingAreaName: string;
  date: string;
  time: string;
  status: SessionStatus;
  capacity: number;
  booked: number;
  waitlist: number;
  price: number;
  minFill: number;
  maxParticipants: number;
  targetParticipants: number;
}

export function sessionViews(state: PrototypeState, territoryId?: TerritoryId): SessionView[] {
  const byTerritory = territoryId ? state.sessions.filter((s) => s.territoryId === territoryId) : state.sessions;
  return byTerritory.map((s) => {
    const template = templateById(state, s.templateId);
    const category = categoryById(state, s.categoryId);
    const venue = venueById(state, s.venueId);
    const area = playingAreaById(state, s.playingAreaId);
    return {
      id: s.id,
      title: template?.name ?? s.templateId,
      activity: category?.name ?? s.categoryId,
      format: template?.format ?? "mixed",
      templateId: s.templateId,
      categoryId: s.categoryId,
      territoryId: s.territoryId,
      cityId: s.cityId,
      venueId: s.venueId,
      venueName: venue?.name ?? s.venueId,
      playingAreaName: area?.name ?? s.playingAreaId,
      date: s.date,
      time: s.startTime,
      status: s.status,
      capacity: s.maxParticipants,
      booked: bookedCount(state, s.id),
      waitlist: waitlistCount(state, s.id),
      price: s.finalPrice,
      minFill: s.minParticipants,
      maxParticipants: s.maxParticipants,
      targetParticipants: s.targetParticipants
    };
  });
}

export function sessionView(state: PrototypeState, id: SessionId): SessionView | undefined {
  return sessionViews(state).find((s) => s.id === id);
}

/* ---------------------------- booking views ---------------------------- */

export interface BookingView extends Booking {
  sessionTitle: string;
}

export function bookingViews(state: PrototypeState, territoryId?: TerritoryId): BookingView[] {
  const byTerritory = territoryId
    ? state.bookings.filter((b) => sessionById(state, b.sessionId)?.territoryId === territoryId)
    : state.bookings;
  return byTerritory.map((b) => ({
    ...b,
    sessionTitle: sessionTitle(state, b.sessionId)
  }));
}

export function bookingsForSession(state: PrototypeState, sessionId: SessionId): Booking[] {
  return state.bookings.filter((b) => b.sessionId === sessionId);
}

export function bookingsForSessionOrdered(state: PrototypeState, sessionId: SessionId): Booking[] {
  return bookingsForSession(state, sessionId).sort((a, b) => {
    const oa = a.waitlistOrder ?? Number.MAX_SAFE_INTEGER;
    const ob = b.waitlistOrder ?? Number.MAX_SAFE_INTEGER;
    return oa - ob;
  });
}

/* ---------------------------- territory views ---------------------------- */

export interface TerritoryView {
  id: TerritoryId;
  name: string;
  code: string;
  time: string;
  state: string;
  venuesCount: number;
  tonight: number;
  fill: number;
}

export function territoryViews(state: PrototypeState): TerritoryView[] {
  return state.territories.map((t) => {
    const venuesCount = state.venues.filter((v) => v.territoryId === t.id).length;
    const tonight = sessionViews(state, t.id).filter((s) => s.date === "Today");
    const fill = tonight.length
      ? Math.round(tonight.reduce((a, s) => a + Math.round((s.booked / Math.max(s.capacity, 1)) * 100), 0) / tonight.length)
      : 0;
    return {
      id: t.id,
      name: t.name,
      code: t.name.slice(0, 3).toUpperCase(),
      time: "19:42",
      state: t.state,
      venuesCount,
      tonight: tonight.length,
      fill
    };
  });
}

/* ----------------------------- venue views ----------------------------- */

export interface VenueView {
  id: VenueId;
  territoryId: TerritoryId;
  cityId: string;
  name: string;
  areas: string[];
  utilization: number;
  status: "ready" | "maintenance" | "closed";
  address: string;
}

export function venueViews(state: PrototypeState, territoryId?: TerritoryId): VenueView[] {
  const byTerritory = territoryId ? state.venues.filter((v) => v.territoryId === territoryId) : state.venues;
  return byTerritory.map((v) => {
    const areas = state.playingAreas.filter((p) => p.venueId === v.id).map((p) => p.name);
    const sessions = state.sessions.filter((s) => s.venueId === v.id);
    const utilization = sessions.length
      ? Math.round(sessions.reduce((a, s) => a + Math.round((bookedCount(state, s.id) / Math.max(s.maxParticipants, 1)) * 100), 0) / sessions.length)
      : 0;
    return {
      id: v.id,
      territoryId: v.territoryId,
      cityId: v.cityId,
      name: v.name,
      areas: areas.length ? areas : v.supportedActivities.map((c) => categoryById(state, c)?.name ?? c),
      utilization,
      status: v.status,
      address: v.address
    };
  });
}

/* ----------------------------- catalog views ----------------------------- */

export interface CatalogView {
  id: TemplateId;
  activity: string;
  format: string;
  price: number;
  capacity: number;
  minFill: number;
  status: TemplateStatus;
}

export function catalogViews(state: PrototypeState): CatalogView[] {
  return state.templates.map((t) => ({
    id: t.id,
    activity: categoryById(state, t.categoryId)?.name ?? t.categoryId,
    format: t.format,
    price: t.basePrice,
    capacity: t.maxParticipants,
    minFill: t.minParticipants,
    status: t.status
  }));
}

/* ------------------------- transaction views ------------------------- */

export interface TransactionView extends Transaction {
  sessionTitle: string;
}

export function transactionViews(state: PrototypeState, territoryId?: TerritoryId): TransactionView[] {
  const byTerritory = territoryId ? state.transactions.filter((t) => t.territoryId === territoryId) : state.transactions;
  return byTerritory.map((t) => ({
    ...t,
    sessionTitle: sessionTitle(state, t.sessionId)
  }));
}

/* ---------------------------- incident views ---------------------------- */

export interface IncidentView {
  id: string;
  sessionId?: SessionId;
  sessionTitle: string;
  kind: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  reportedAt: string;
}

export function incidentViews(state: PrototypeState): IncidentView[] {
  return state.incidents.map((i) => ({
    id: i.id,
    sessionId: i.sessionId,
    sessionTitle: i.sessionId ? sessionTitle(state, i.sessionId) : "No linked session",
    kind: i.category || i.type || "other",
    severity: i.severity || "medium",
    status: i.status || "reported",
    reportedAt: i.reportedAt || i.time || "—"
  }));
}

/* ------------------------------ crew views ------------------------------ */

export interface CrewView extends CrewMember {
  roleName: string;
  shift?: Shift;
}

export function crewViews(state: PrototypeState, territoryId?: TerritoryId): CrewView[] {
  const byTerritory = territoryId ? state.crew.filter((c) => c.territoryId === territoryId) : state.crew;
  return byTerritory.map((c) => ({
    ...c,
    roleName: c.role.replace("-", " "),
    shift: state.shifts.find((sh) => sh.crewId === c.id)
  }));
}

/* -------------------------- tournament views -------------------------- */

export interface TournamentView {
  id: string;
  title: string;
  code?: string;
  territoryId: TerritoryId;
  venueName: string;
  format: string;
  teams: number;
  round: string;
  phase: string;
  status: string;
  date: string;
  brackets: Array<{ id: string; roundLabel?: string; round?: string; teamAId?: string; teamBId?: string; teamA?: string; teamB?: string; scoreA?: number; scoreB?: number; winnerTeamId?: string; winner?: string; status: string }>;
}

export function tournamentViews(state: PrototypeState, territoryId?: TerritoryId): TournamentView[] {
  const byTerritory = territoryId ? state.tournaments.filter((t) => t.territoryId === territoryId) : state.tournaments;
  return byTerritory.map((t) => {
    const matches = state.tournamentMatches.filter((m) => m.tournamentId === t.id);
    const rounds = [...new Set(matches.map((m) => m.roundLabel || m.round || `Round ${m.roundNumber}`))];
    return {
      id: t.id,
      title: t.name,
      code: t.code,
      territoryId: t.territoryId,
      venueName: venueName(state, t.venueId),
      format: t.format.replace("-", " "),
      teams: t.teamIds?.length ?? (t as any).teamCount ?? 0,
      round: rounds[0] ?? "—",
      phase: t.scheduledStart || (t as any).date || "—",
      status: t.status,
      date: t.scheduledStart || (t as any).date || "—",
      brackets: matches.map((m) => ({
        id: m.id,
        roundLabel: m.roundLabel,
        round: m.round || m.roundLabel,
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        teamA: m.teamA || m.teamAId,
        teamB: m.teamB || m.teamBId,
        scoreA: m.scoreA,
        scoreB: m.scoreB,
        winnerTeamId: m.winnerTeamId,
        winner: m.winner || m.winnerTeamId,
        status: m.status
      }))
    };
  });
}

/* ---------------------------- promo views ---------------------------- */

export function activePromos(state: PrototypeState): PromoCode[] {
  return state.promoCodes.filter((p) => p.status === "active");
}

/* ----------------------------- franchise views ----------------------------- */

export interface FranchiseView {
  id: string;
  name: string;
  type: string;
  status: string;
  legalEntity: string;
  territories: number;
  venues: number;
  sessionsTonight: number;
  revenueShare: number;
}

export function franchiseViews(state: PrototypeState): FranchiseView[] {
  return state.franchises.map((f) => {
    const territories = state.territories.filter((t) => t.franchiseId === f.id);
    const territoryIds = territories.map((t) => t.id);
    const venues = state.venues.filter((v) => territoryIds.includes(v.territoryId)).length;
    const sessionsTonight = state.sessions.filter(
      (s) => territoryIds.includes(s.territoryId) && s.date === "Today"
    ).length;
    return {
      id: f.id,
      name: f.name,
      type: f.type,
      status: f.status,
      legalEntity: f.legalEntity,
      territories: territories.length,
      venues,
      sessionsTonight,
      revenueShare: f.revenueShare
    };
  });
}

export function franchiseView(state: PrototypeState, id: string): FranchiseView | undefined {
  return franchiseViews(state).find((f) => f.id === id);
}

/* ------------------------------ city views ------------------------------ */

export interface CityView {
  id: string;
  territoryId: TerritoryId;
  name: string;
  state: string;
  status: string;
  venues: number;
  sessionsToday: number;
  categories: string[];
}

export function cityViews(state: PrototypeState, territoryId?: TerritoryId): CityView[] {
  const byTerritory = territoryId ? state.cities.filter((c) => c.territoryId === territoryId) : state.cities;
  return byTerritory.map((c) => {
    const venues = state.venues.filter((v) => v.cityId === c.id).length;
    const sessionsToday = state.sessions.filter((s) => s.cityId === c.id && s.date === "Today").length;
    return {
      id: c.id,
      territoryId: c.territoryId,
      name: c.name,
      state: c.state,
      status: c.status,
      venues,
      sessionsToday,
      categories: c.supportedCategories.map((cat) => categoryById(state, cat)?.name ?? cat)
    };
  });
}

/* --------------------------- playing area views --------------------------- */

export interface PlayingAreaView {
  id: string;
  venueId: VenueId;
  name: string;
  capacity: number;
  status: string;
  activities: string[];
  sessionsToday: number;
}

export function playingAreaViews(state: PrototypeState, venueId?: VenueId): PlayingAreaView[] {
  const byVenue = venueId ? state.playingAreas.filter((p) => p.venueId === venueId) : state.playingAreas;
  return byVenue.map((p) => {
    const sessionsToday = state.sessions.filter(
      (s) => s.playingAreaId === p.id && s.date === "Today" && s.status !== "cancelled"
    ).length;
    return {
      id: p.id,
      venueId: p.venueId,
      name: p.name,
      capacity: p.maxCapacity,
      status: p.status,
      activities: p.activityCompatibility.map((cat) => categoryById(state, cat)?.name ?? cat),
      sessionsToday
    };
  });
}
