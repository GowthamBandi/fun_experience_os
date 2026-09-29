import type {
  City,
  Franchise,
  PlayingArea,
  Territory,
  Venue
} from "../entities";
import type { PrototypeState } from "../scenarios";
import { pushAudit, pushSignal } from "./helpers";
import type { CommandResult } from "./outcome";
import { validateCity, validateFranchise, validatePlayingArea, validateTerritory, validateVenue } from "./create";

export type FranchiseStatus = Franchise["status"];
export type TerritoryStatus = Territory["status"];
export type CityStatus = City["status"];
export type VenueStatus = Venue["status"];
export type PlayingAreaStatus = PlayingArea["status"];

type Result = CommandResult;

const NOT_FOUND = (what: string) => `This ${what} no longer exists. Refresh the page and try again.`;

/** Upcoming sessions (not cancelled, completed or archived) matching a predicate. */
const activeSessions = (state: PrototypeState, match: (s: PrototypeState["sessions"][number]) => boolean) =>
  state.sessions.filter((s) => match(s) && !["cancelled", "completed", "archived"].includes(s.status));

const withReason = (text: string, reason?: string) => (reason && reason.trim() ? `${text} Reason: ${reason.trim()}` : text);

/** Status changes that take something out of service must say why. */
function requireReason(reason: string | undefined, needed: boolean): string | undefined {
  if (!needed) return undefined;
  if (!reason || reason.trim().length < 5) return "Give a reason for this change (at least 5 characters). It is recorded in the audit log.";
  return undefined;
}

/* ------------------------------ franchise ------------------------------ */

export function updateFranchise(state: PrototypeState, id: string, patch: Partial<Franchise>, operatorId?: string): Result {
  const current = state.franchises.find((f) => f.id === id);
  if (!current) return { state, error: NOT_FOUND("franchise") };
  const next: Franchise = { ...current, ...patch, id, status: current.status, assignedTerritories: current.assignedTerritories };
  const error = validateFranchise(state, next, id);
  if (error) return { state, error };
  return {
    state: pushAudit(
      { ...state, franchises: state.franchises.map((f) => (f.id === id ? { ...next, name: next.name.trim() } : f)) },
      { action: "Franchise Updated", description: `Franchise "${next.name}" details updated (${Object.keys(patch).join(", ")}).`, operatorId }
    )
  };
}

export function changeFranchiseHead(state: PrototypeState, id: string, head: string, operatorId?: string): Result {
  const current = state.franchises.find((f) => f.id === id);
  if (!current) return { state, error: NOT_FOUND("franchise") };
  if (!head.trim()) return { state, error: "Name the new franchise head." };
  return {
    state: pushAudit(
      { ...state, franchises: state.franchises.map((f) => (f.id === id ? { ...f, franchiseHead: head.trim() } : f)) },
      { action: "Franchise Head Changed", description: `Franchise "${current.name}" head changed from ${current.franchiseHead} to ${head.trim()}.`, operatorId }
    )
  };
}

/**
 * Pause / suspend / resume a franchise. Taking a franchise out of service
 * pauses every active territory under it (nothing is deleted); resuming
 * restores the territories it paused.
 */
export function changeFranchiseStatus(state: PrototypeState, id: string, status: FranchiseStatus, operatorId?: string, reason?: string): Result {
  const current = state.franchises.find((f) => f.id === id);
  if (!current) return { state, error: NOT_FOUND("franchise") };
  if (current.status === status) return { state, error: `${current.name} is already ${status}.` };
  const reasonError = requireReason(reason, status !== "active");
  if (reasonError) return { state, error: reasonError };
  const territories = state.territories.filter((t) => t.franchiseId === id);
  const affected =
    status === "active"
      ? territories.filter((t) => t.status === "paused")
      : territories.filter((t) => t.status === "active");
  const nextStatus: Territory["status"] = status === "active" ? "active" : "paused";
  const next = {
    ...state,
    franchises: state.franchises.map((f) => (f.id === id ? { ...f, status } : f)),
    territories: state.territories.map((t) => (affected.some((a) => a.id === t.id) ? { ...t, status: nextStatus } : t))
  };
  const withSignal =
    status !== "active"
      ? pushSignal(next, { kind: "alert", message: `Franchise "${current.name}" is now ${status}. ${affected.length} territor${affected.length === 1 ? "y" : "ies"} paused; nothing was deleted.` })
      : pushSignal(next, { kind: "system", message: `Franchise "${current.name}" is active again. ${affected.length} territor${affected.length === 1 ? "y" : "ies"} restored.` });
  return {
    state: pushAudit(withSignal, {
      action: "Franchise Status Changed",
      description: withReason(`Franchise "${current.name}" status changed from ${current.status} to ${status}.`, reason),
      operatorId
    })
  };
}

/* ------------------------------ territory ------------------------------ */

export function updateTerritory(state: PrototypeState, id: string, patch: Partial<Territory>, operatorId?: string): Result {
  const current = state.territories.find((t) => t.id === id);
  if (!current) return { state, error: NOT_FOUND("territory") };
  const next: Territory = { ...current, ...patch, id, status: current.status, franchiseId: current.franchiseId };
  const error = validateTerritory(state, next, id);
  if (error) return { state, error };
  return {
    state: pushAudit(
      { ...state, territories: state.territories.map((t) => (t.id === id ? { ...next, name: next.name.trim() } : t)) },
      { action: "Territory Updated", description: `Territory "${next.name}" details updated (${Object.keys(patch).join(", ")}).`, operatorId }
    )
  };
}

export function changeTerritoryStatus(state: PrototypeState, id: string, status: TerritoryStatus, operatorId?: string, reason?: string): Result {
  const current = state.territories.find((t) => t.id === id);
  if (!current) return { state, error: NOT_FOUND("territory") };
  if (current.status === status) return { state, error: `${current.name} is already ${status}.` };
  if (status === "active") {
    const franchise = state.franchises.find((f) => f.id === current.franchiseId);
    if (franchise && franchise.status !== "active") return { state, error: `The franchise ${franchise.name} is ${franchise.status}. Resume the franchise first.` };
  }
  const reasonError = requireReason(reason, status === "paused" || status === "disabled");
  if (reasonError) return { state, error: reasonError };
  if (status === "disabled") {
    const upcoming = activeSessions(state, (s) => s.territoryId === id);
    if (upcoming.length) return { state, error: `${current.name} has ${upcoming.length} upcoming session${upcoming.length === 1 ? "" : "s"}. Cancel or move them before disabling the territory.` };
  }
  const next = { ...state, territories: state.territories.map((t) => (t.id === id ? { ...t, status } : t)) };
  const withSignal =
    status === "paused" || status === "disabled"
      ? pushSignal(next, { kind: "alert", message: `Territory "${current.name}" is now ${status}. Cities and venues are kept.` })
      : pushSignal(next, { kind: "system", message: `Territory "${current.name}" status set to ${status}.` });
  return {
    state: pushAudit(withSignal, {
      action: "Territory Status Changed",
      description: withReason(`Territory "${current.name}" status changed from ${current.status} to ${status}.`, reason),
      operatorId
    })
  };
}

export function assignTerritoryManager(state: PrototypeState, id: string, managerId: string, operatorId?: string): Result {
  const current = state.territories.find((t) => t.id === id);
  if (!current) return { state, error: NOT_FOUND("territory") };
  const manager = state.operators.find((o) => o.id === managerId);
  if (!manager) return { state, error: "Choose an operator to manage this territory." };
  if (manager.status !== "active") return { state, error: `${manager.name}'s account is suspended.` };
  return {
    state: pushAudit(
      { ...state, territories: state.territories.map((t) => (t.id === id ? { ...t, managerId } : t)) },
      { action: "Territory Manager Assigned", description: `Territory "${current.name}" manager set to ${manager.name}.`, operatorId }
    )
  };
}

/* -------------------------------- city -------------------------------- */

export function updateCity(state: PrototypeState, id: string, patch: Partial<City>, operatorId?: string): Result {
  const current = state.cities.find((c) => c.id === id);
  if (!current) return { state, error: NOT_FOUND("city") };
  const next: City = { ...current, ...patch, id, status: current.status, territoryId: current.territoryId };
  const error = validateCity(state, next, id);
  if (error) return { state, error };
  return {
    state: pushAudit(
      { ...state, cities: state.cities.map((c) => (c.id === id ? { ...next, name: next.name.trim() } : c)) },
      { action: "City Updated", description: `City "${next.name}" details updated (${Object.keys(patch).join(", ")}).`, operatorId }
    )
  };
}

export function changeCityStatus(state: PrototypeState, id: string, status: CityStatus, operatorId?: string, reason?: string): Result {
  const current = state.cities.find((c) => c.id === id);
  if (!current) return { state, error: NOT_FOUND("city") };
  if (current.status === status) return { state, error: `${current.name} is already ${status}.` };
  if (status === "active") {
    const territory = state.territories.find((t) => t.id === current.territoryId);
    if (territory && territory.status !== "active") return { state, error: `The territory ${territory.name} is ${territory.status}. Activate the territory first.` };
  }
  const reasonError = requireReason(reason, status === "paused" || status === "draft");
  if (reasonError) return { state, error: reasonError };
  const next = { ...state, cities: state.cities.map((c) => (c.id === id ? { ...c, status } : c)) };
  const withSignal =
    status === "paused" || status === "draft"
      ? pushSignal(next, { kind: "alert", message: `City "${current.name}" is now ${status}; new bookings are on hold. Venues are kept.` })
      : pushSignal(next, { kind: "system", message: `City "${current.name}" status set to ${status}.` });
  return {
    state: pushAudit(withSignal, {
      action: "City Status Changed",
      description: withReason(`City "${current.name}" status changed from ${current.status} to ${status}.`, reason),
      operatorId
    })
  };
}

export function assignCityManager(state: PrototypeState, id: string, managerId: string, operatorId?: string): Result {
  const current = state.cities.find((c) => c.id === id);
  if (!current) return { state, error: NOT_FOUND("city") };
  const manager = state.operators.find((o) => o.id === managerId);
  if (!manager) return { state, error: "Choose an operator to manage this city." };
  if (manager.status !== "active") return { state, error: `${manager.name}'s account is suspended.` };
  return {
    state: pushAudit(
      { ...state, cities: state.cities.map((c) => (c.id === id ? { ...c, managerId } : c)) },
      { action: "City Manager Assigned", description: `City "${current.name}" manager set to ${manager.name}.`, operatorId }
    )
  };
}

/* -------------------------------- venue -------------------------------- */

export function updateVenue(state: PrototypeState, id: string, patch: Partial<Venue>, operatorId?: string): Result {
  const current = state.venues.find((v) => v.id === id);
  if (!current) return { state, error: NOT_FOUND("venue") };
  const next: Venue = { ...current, ...patch, id, status: current.status, cityId: current.cityId, territoryId: current.territoryId };
  const error = validateVenue(state, next, id);
  if (error) return { state, error };
  const tooBig = state.playingAreas.find((p) => p.venueId === id && p.maxCapacity > next.safetyCapacity);
  if (tooBig) return { state, error: `${tooBig.name} holds ${tooBig.maxCapacity}; the venue's safe capacity cannot be lower than that.` };
  return {
    state: pushAudit(
      { ...state, venues: state.venues.map((v) => (v.id === id ? { ...next, name: next.name.trim() } : v)) },
      { action: "Venue Updated", description: `Venue "${next.name}" details updated (${Object.keys(patch).join(", ")}).`, operatorId }
    )
  };
}

export function changeVenueStatus(state: PrototypeState, id: string, status: VenueStatus, operatorId?: string, reason?: string): Result {
  const current = state.venues.find((v) => v.id === id);
  if (!current) return { state, error: NOT_FOUND("venue") };
  if (current.status === status) return { state, error: `${current.name} is already ${status}.` };
  const reasonError = requireReason(reason, status !== "ready");
  if (reasonError) return { state, error: reasonError };
  if (status === "closed") {
    const upcoming = activeSessions(state, (s) => s.venueId === id);
    if (upcoming.length) return { state, error: `${current.name} has ${upcoming.length} upcoming session${upcoming.length === 1 ? "" : "s"}. Cancel or move them before closing the venue.` };
  }
  const next = { ...state, venues: state.venues.map((v) => (v.id === id ? { ...v, status } : v)) };
  const withSignal =
    status === "maintenance" || status === "closed"
      ? pushSignal(next, { kind: "alert", message: `Venue "${current.name}" is now ${status} and cannot take new sessions. Playing areas are kept.` })
      : pushSignal(next, { kind: "system", message: `Venue "${current.name}" is open for scheduling again.` });
  return {
    state: pushAudit(withSignal, {
      action: "Venue Status Changed",
      description: withReason(`Venue "${current.name}" status changed from ${current.status} to ${status}.`, reason),
      operatorId
    })
  };
}

export function addVenueSafetyNote(state: PrototypeState, id: string, note: string, operatorId?: string): Result {
  const current = state.venues.find((v) => v.id === id);
  if (!current) return { state, error: NOT_FOUND("venue") };
  if (note.trim().length < 5) return { state, error: "Write the safety note (at least 5 characters)." };
  return {
    state: pushAudit(
      { ...state, venues: state.venues.map((v) => (v.id === id ? { ...v, incidentNotes: note.trim() } : v)) },
      { action: "Venue Safety Note", description: `Safety note on venue "${current.name}": ${note.trim()}`, operatorId }
    )
  };
}

/* ----------------------------- playing area ----------------------------- */

export function updatePlayingArea(state: PrototypeState, id: string, patch: Partial<PlayingArea>, operatorId?: string): Result {
  const current = state.playingAreas.find((p) => p.id === id);
  if (!current) return { state, error: NOT_FOUND("playing area") };
  const next: PlayingArea = { ...current, ...patch, id, status: current.status, venueId: current.venueId };
  const error = validatePlayingArea(state, next, id);
  if (error) return { state, error };
  return {
    state: pushAudit(
      { ...state, playingAreas: state.playingAreas.map((p) => (p.id === id ? { ...next, name: next.name.trim() } : p)) },
      { action: "Playing Area Updated", description: `Playing area "${next.name}" details updated (${Object.keys(patch).join(", ")}).`, operatorId }
    )
  };
}

export function changePlayingAreaStatus(state: PrototypeState, id: string, status: PlayingAreaStatus, operatorId?: string, reason?: string): Result {
  const current = state.playingAreas.find((p) => p.id === id);
  if (!current) return { state, error: NOT_FOUND("playing area") };
  if (current.status === status) return { state, error: `${current.name} is already ${status}.` };
  if (status === "active") {
    const venue = state.venues.find((v) => v.id === current.venueId);
    if (venue && venue.status === "closed") return { state, error: `${venue.name} is closed. Reopen the venue first.` };
  }
  const reasonError = requireReason(reason, status !== "active");
  if (reasonError) return { state, error: reasonError };
  if (status === "closed" || status === "unavailable") {
    const upcoming = activeSessions(state, (s) => s.playingAreaId === id);
    if (upcoming.length) return { state, error: `${current.name} has ${upcoming.length} upcoming session${upcoming.length === 1 ? "" : "s"}. Move or cancel them first.` };
  }
  const next = { ...state, playingAreas: state.playingAreas.map((p) => (p.id === id ? { ...p, status } : p)) };
  const withSignal =
    status !== "active"
      ? pushSignal(next, { kind: "alert", message: `Playing area "${current.name}" is now ${status} and withdrawn from scheduling.` })
      : pushSignal(next, { kind: "system", message: `Playing area "${current.name}" is open again.` });
  return {
    state: pushAudit(withSignal, {
      action: "Playing Area Status Changed",
      description: withReason(`Playing area "${current.name}" status changed from ${current.status} to ${status}.`, reason),
      operatorId
    })
  };
}

/* ---------------------------- operational note ---------------------------- */

export function addOperationalNote(state: PrototypeState, entity: string, name: string, note: string, operatorId?: string): Result {
  if (note.trim().length < 3) return { state, error: "Write the note before saving." };
  return {
    state: pushAudit(state, {
      action: "Operational Note",
      description: `Note on "${name}" (${entity}): ${note.trim()}`,
      operatorId
    })
  };
}
