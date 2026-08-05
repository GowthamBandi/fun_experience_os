import type {
  City,
  Franchise,
  PlayingArea,
  Territory,
  Venue
} from "../entities";
import type { PrototypeState } from "../scenarios";
import { pushAudit, pushSignal } from "./helpers";

export type FranchiseStatus = Franchise["status"];
export type TerritoryStatus = Territory["status"];
export type CityStatus = City["status"];
export type VenueStatus = Venue["status"];
export type PlayingAreaStatus = PlayingArea["status"];

const describe = (entity: string, name: string) => `"${name}" (${entity})`;

/* ------------------------------ franchise ------------------------------ */

export function updateFranchise(state: PrototypeState, id: string, patch: Partial<Franchise>, operatorId?: string): PrototypeState {
  const current = state.franchises.find((f) => f.id === id);
  if (!current) return state;
  const next: Franchise = { ...current, ...patch };
  return pushAudit(
    { ...state, franchises: state.franchises.map((f) => (f.id === id ? next : f)) },
    { action: "Franchise Updated", description: `Franchise ${describe("franchise", next.name)} details updated.`, operatorId }
  );
}

export function changeFranchiseHead(state: PrototypeState, id: string, head: string, operatorId?: string): PrototypeState {
  const current = state.franchises.find((f) => f.id === id);
  if (!current) return state;
  return pushAudit(
    { ...state, franchises: state.franchises.map((f) => (f.id === id ? { ...f, franchiseHead: head } : f)) },
    { action: "Franchise Head Changed", description: `Franchise "${current.name}" head changed to ${head}.`, operatorId }
  );
}

/**
 * Pause / resume a franchise. Pausing freezes every active territory under it
 * (they are never deleted — only paused); resuming restores them to active.
 */
export function changeFranchiseStatus(state: PrototypeState, id: string, status: FranchiseStatus, operatorId?: string): PrototypeState {
  const current = state.franchises.find((f) => f.id === id);
  if (!current) return state;
  const territories = state.territories.filter((t) => t.franchiseId === id);
  const nextTerritories =
    status === "inactive"
      ? territories.map((t) => (t.status === "active" ? { ...t, status: "paused" as const } : t))
      : territories.map((t) => (t.status === "paused" ? { ...t, status: "active" as const } : t));
  const next = {
    ...state,
    franchises: state.franchises.map((f) => (f.id === id ? { ...f, status } : f)),
    territories: state.territories.map((t) => nextTerritories.find((x) => x.id === t.id) ?? t)
  };
  const withSignal =
    status === "inactive"
      ? pushSignal(next, {
          kind: "alert",
          message: `FRANCHISE PAUSED: "${current.name}" frozen. ${nextTerritories.length} territories paused, none deleted.`
        })
      : pushSignal(next, {
          kind: "system",
          message: `FRANCHISE RESUMED: "${current.name}" operational again. ${nextTerritories.length} territories restored.`
        });
  return pushAudit(withSignal, {
    action: "Franchise Status Changed",
    description: `Franchise "${current.name}" status set to ${status}.`
  });
}

/* ------------------------------ territory ------------------------------ */

export function updateTerritory(state: PrototypeState, id: string, patch: Partial<Territory>, operatorId?: string): PrototypeState {
  const current = state.territories.find((t) => t.id === id);
  if (!current) return state;
  const next: Territory = { ...current, ...patch };
  return pushAudit(
    { ...state, territories: state.territories.map((t) => (t.id === id ? next : t)) },
    { action: "Territory Updated", description: `Territory ${describe("territory", next.name)} details updated.`, operatorId }
  );
}

export function changeTerritoryStatus(state: PrototypeState, id: string, status: TerritoryStatus, operatorId?: string): PrototypeState {
  const current = state.territories.find((t) => t.id === id);
  if (!current) return state;
  const next = {
    ...state,
    territories: state.territories.map((t) => (t.id === id ? { ...t, status } : t))
  };
  const withSignal =
    status === "paused" || status === "disabled"
      ? pushSignal(next, {
          kind: "alert",
          message: `TERRITORY ${status.toUpperCase()}: "${current.name}" scope frozen. Cities and venues retained.`
        })
      : pushSignal(next, {
          kind: "system",
          message: `Territory "${current.name}" status set to ${status}.`
        });
  return pushAudit(withSignal, {
    action: "Territory Status Changed",
    description: `Territory "${current.name}" status set to ${status}.`
  });
}

export function assignTerritoryManager(state: PrototypeState, id: string, managerId: string, operatorId?: string): PrototypeState {
  const current = state.territories.find((t) => t.id === id);
  if (!current) return state;
  return pushAudit(
    { ...state, territories: state.territories.map((t) => (t.id === id ? { ...t, managerId } : t)) },
    { action: "Territory Manager Assigned", description: `Territory "${current.name}" manager set to ${managerId}.`, operatorId }
  );
}

/* -------------------------------- city -------------------------------- */

export function updateCity(state: PrototypeState, id: string, patch: Partial<City>, operatorId?: string): PrototypeState {
  const current = state.cities.find((c) => c.id === id);
  if (!current) return state;
  const next: City = { ...current, ...patch };
  return pushAudit(
    { ...state, cities: state.cities.map((c) => (c.id === id ? next : c)) },
    { action: "City Updated", description: `City ${describe("city", next.name)} details updated.`, operatorId }
  );
}

export function changeCityStatus(state: PrototypeState, id: string, status: CityStatus, operatorId?: string): PrototypeState {
  const current = state.cities.find((c) => c.id === id);
  if (!current) return state;
  const next = {
    ...state,
    cities: state.cities.map((c) => (c.id === id ? { ...c, status } : c))
  };
  const withSignal =
    status === "paused" || status === "draft"
      ? pushSignal(next, {
          kind: "alert",
          message: `CITY ${status.toUpperCase()}: "${current.name}" booking intake frozen. Venues retained.`
        })
      : pushSignal(next, {
          kind: "system",
          message: `City "${current.name}" status set to ${status}.`
        });
  return pushAudit(withSignal, {
    action: "City Status Changed",
    description: `City "${current.name}" status set to ${status}.`
  });
}

export function assignCityManager(state: PrototypeState, id: string, managerId: string, operatorId?: string): PrototypeState {
  const current = state.cities.find((c) => c.id === id);
  if (!current) return state;
  return pushAudit(
    { ...state, cities: state.cities.map((c) => (c.id === id ? { ...c, managerId } : c)) },
    { action: "City Manager Assigned", description: `City "${current.name}" manager set to ${managerId}.`, operatorId }
  );
}

/* -------------------------------- venue -------------------------------- */

export function updateVenue(state: PrototypeState, id: string, patch: Partial<Venue>, operatorId?: string): PrototypeState {
  const current = state.venues.find((v) => v.id === id);
  if (!current) return state;
  const next: Venue = { ...current, ...patch };
  return pushAudit(
    { ...state, venues: state.venues.map((v) => (v.id === id ? next : v)) },
    { action: "Venue Updated", description: `Venue ${describe("venue", next.name)} details updated.`, operatorId }
  );
}

export function changeVenueStatus(state: PrototypeState, id: string, status: VenueStatus, operatorId?: string): PrototypeState {
  const current = state.venues.find((v) => v.id === id);
  if (!current) return state;
  const next = {
    ...state,
    venues: state.venues.map((v) => (v.id === id ? { ...v, status } : v))
  };
  const withSignal =
    status === "maintenance" || status === "closed"
      ? pushSignal(next, {
          kind: "alert",
          message: `VENUE ${status.toUpperCase()}: "${current.name}" not available for new scheduling. Playing areas retained.`
        })
      : pushSignal(next, {
          kind: "system",
          message: `Venue "${current.name}" reopened for scheduling.`
        });
  return pushAudit(withSignal, {
    action: "Venue Status Changed",
    description: `Venue "${current.name}" status set to ${status}.`
  });
}

export function addVenueSafetyNote(state: PrototypeState, id: string, note: string, operatorId?: string): PrototypeState {
  const current = state.venues.find((v) => v.id === id);
  if (!current) return state;
  return pushAudit(
    { ...state, venues: state.venues.map((v) => (v.id === id ? { ...v, incidentNotes: note } : v)) },
    { action: "Venue Safety Note", description: `Safety note added on venue "${current.name}": ${note}`, operatorId }
  );
}

/* ----------------------------- playing area ----------------------------- */

export function updatePlayingArea(state: PrototypeState, id: string, patch: Partial<PlayingArea>, operatorId?: string): PrototypeState {
  const current = state.playingAreas.find((p) => p.id === id);
  if (!current) return state;
  const next: PlayingArea = { ...current, ...patch };
  return pushAudit(
    { ...state, playingAreas: state.playingAreas.map((p) => (p.id === id ? next : p)) },
    { action: "Playing Area Updated", description: `Playing area ${describe("playing area", next.name)} details updated.`, operatorId }
  );
}

export function changePlayingAreaStatus(state: PrototypeState, id: string, status: PlayingAreaStatus, operatorId?: string): PrototypeState {
  const current = state.playingAreas.find((p) => p.id === id);
  if (!current) return state;
  const next = {
    ...state,
    playingAreas: state.playingAreas.map((p) => (p.id === id ? { ...p, status } : p))
  };
  const withSignal =
    status === "maintenance" || status === "unavailable" || status === "closed"
      ? pushSignal(next, {
          kind: "alert",
          message: `PLAYING AREA ${status.toUpperCase()}: "${current.name}" withdrawn from scheduling.`
        })
      : pushSignal(next, {
          kind: "system",
          message: `Playing area "${current.name}" reopened.`
        });
  return pushAudit(withSignal, {
    action: "Playing Area Status Changed",
    description: `Playing area "${current.name}" status set to ${status}.`
  });
}

/* ---------------------------- operational note ---------------------------- */

export function addOperationalNote(state: PrototypeState, entity: string, name: string, note: string, operatorId?: string): PrototypeState {
  return pushAudit(state, {
    action: "Operational Note",
    description: `Note on ${describe(entity, name)}: ${note}`
  });
}
