import type {
  CategoryId,
  CityId,
  PlayingAreaId,
  SessionId,
  TemplateId,
  VenueId
} from "../entities";
import type { PrototypeState } from "../scenarios";

/* ------------------------------ lookups ------------------------------ */

export const venueById = (state: PrototypeState, id: VenueId) => state.venues.find((v) => v.id === id);
export const playingAreaById = (state: PrototypeState, id: PlayingAreaId) => state.playingAreas.find((p) => p.id === id);
export const categoryById = (state: PrototypeState, id: CategoryId) => state.categories.find((c) => c.id === id);
export const templateById = (state: PrototypeState, id: TemplateId) => state.templates.find((t) => t.id === id);
export const cityById = (state: PrototypeState, id: CityId) => state.cities.find((c) => c.id === id);
export const sessionById = (state: PrototypeState, id: SessionId) => state.sessions.find((s) => s.id === id);
export const franchiseById = (state: PrototypeState, id: string) => state.franchises.find((f) => f.id === id);
export const territoryById = (state: PrototypeState, id: string) => state.territories.find((t) => t.id === id);
export const crewById = (state: PrototypeState, id: string) => state.crew.find((c) => c.id === id);
export const shiftById = (state: PrototypeState, id: string) => state.shifts.find((sh) => sh.id === id);
export const tournamentById = (state: PrototypeState, id: string) => state.tournaments.find((t) => t.id === id);
export const incidentById = (state: PrototypeState, id: string) => state.incidents.find((i) => i.id === id);

export const sessionTitle = (state: PrototypeState, id: SessionId): string => {
  const s = sessionById(state, id);
  if (!s) return id;
  return templateById(state, s.templateId)?.name ?? s.templateId;
};

export const venueName = (state: PrototypeState, id: VenueId): string => venueById(state, id)?.name ?? id;

export const cityName = (state: PrototypeState, id: CityId): string => cityById(state, id)?.name ?? id;

export const categoryName = (state: PrototypeState, id: CategoryId): string =>
  categoryById(state, id)?.name ?? id;

export const territoryName = (state: PrototypeState, id: string): string =>
  territoryById(state, id)?.name ?? id;

export const franchiseName = (state: PrototypeState, id: string): string =>
  franchiseById(state, id)?.name ?? id;
