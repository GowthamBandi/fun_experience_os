import type {
  ActivityCategory,
  Booking,
  City,
  ExperienceTemplate,
  Franchise,
  PlayingArea,
  ScheduledSession,
  Territory,
  Venue
} from "../entities";
import type { PrototypeState } from "../scenarios";
import { nextId, nowLabel, pushAudit } from "./helpers";

export type FranchiseInput = Omit<Franchise, "id"> & { id?: string };
export type TerritoryInput = Omit<Territory, "id"> & { id?: string };
export type CityInput = Omit<City, "id"> & { id?: string };
export type VenueInput = Omit<Venue, "id"> & { id?: string };
export type PlayingAreaInput = Omit<PlayingArea, "id"> & { id?: string };
export type CategoryInput = Omit<ActivityCategory, "id"> & { id?: string };
export type TemplateInput = Omit<ExperienceTemplate, "id"> & { id?: string };
export type SessionInput = Omit<ScheduledSession, "id"> & { id?: string };
export type BookingInput = Omit<Booking, "id"> & { id?: string };

export function createFranchise(state: PrototypeState, input: FranchiseInput, operatorId?: string): PrototypeState {
  const id = input.id ?? nextId("f", state.franchises.map((f) => f.id));
  const franchise: Franchise = { ...input, id };
  return pushAudit(
    { ...state, franchises: [...state.franchises, franchise] },
    { action: "Franchise Created", description: `Franchise "${franchise.name}" created (${id}).`, operatorId }
  );
}

export function createTerritory(state: PrototypeState, input: TerritoryInput, operatorId?: string): PrototypeState {
  const id = input.id ?? nextId("t", state.territories.map((x) => x.id));
  const territory: Territory = { ...input, id };
  const next = {
    ...state,
    territories: [...state.territories, territory],
    franchises: state.franchises.map((f) =>
      f.id === territory.franchiseId && !f.assignedTerritories.includes(id)
        ? { ...f, assignedTerritories: [...f.assignedTerritories, id] }
        : f
    )
  };
  return pushAudit(next, { action: "Territory Created", description: `Territory "${territory.name}" created under franchise ${territory.franchiseId}.`, operatorId });
}

export function createCity(state: PrototypeState, input: CityInput, operatorId?: string): PrototypeState {
  const id = input.id ?? nextId("c", state.cities.map((c) => c.id));
  const city: City = { ...input, id };
  return pushAudit(
    { ...state, cities: [...state.cities, city] },
    { action: "City Created", description: `City "${city.name}" created under territory ${city.territoryId}.`, operatorId }
  );
}

export function createVenue(state: PrototypeState, input: VenueInput, operatorId?: string): PrototypeState {
  const id = input.id ?? nextId("v", state.venues.map((v) => v.id));
  const venue: Venue = { ...input, id };
  return pushAudit(
    { ...state, venues: [...state.venues, venue] },
    { action: "Venue Created", description: `Venue "${venue.name}" created (${id}) in city ${venue.cityId}.`, operatorId }
  );
}

export function createPlayingArea(state: PrototypeState, input: PlayingAreaInput, operatorId?: string): PrototypeState {
  const id = input.id ?? nextId("pa", state.playingAreas.map((p) => p.id));
  const area: PlayingArea = { ...input, id };
  return pushAudit(
    { ...state, playingAreas: [...state.playingAreas, area] },
    { action: "Playing Area Created", description: `Playing area "${area.name}" created (${id}) at venue ${area.venueId}.`, operatorId }
  );
}

export function createCategory(state: PrototypeState, input: CategoryInput, operatorId?: string): PrototypeState {
  const id = input.id ?? nextId("cat", state.categories.map((c) => c.id));
  const category: ActivityCategory = { ...input, id };
  return pushAudit(
    { ...state, categories: [...state.categories, category] },
    { action: "Category Created", description: `Category "${category.name}" created (${id}).`, operatorId }
  );
}

export function createTemplate(state: PrototypeState, input: TemplateInput, operatorId?: string): PrototypeState {
  const id = input.id ?? nextId("et", state.templates.map((t) => t.id));
  const template: ExperienceTemplate = { ...input, id };
  return pushAudit(
    { ...state, templates: [...state.templates, template] },
    { action: "Template Created", description: `Experience template "${template.name}" created (${id}).`, operatorId }
  );
}

export function createSession(state: PrototypeState, input: SessionInput, operatorId?: string): PrototypeState {
  const id = input.id ?? nextId("s", state.sessions.map((x) => x.id));
  const session: ScheduledSession = { ...input, id };
  return pushAudit(
    { ...state, sessions: [...state.sessions, session] },
    { action: "Session Created", description: `Session ${id} scheduled (${session.date}, ${session.startTime}).`, sessionId: id, operatorId }
  );
}

export function createBooking(state: PrototypeState, input: BookingInput, operatorId?: string): PrototypeState {
  const id = input.id ?? nextId("b", state.bookings.map((b) => b.id));
  const booking: Booking = { ...input, id, createdAt: input.createdAt ?? nowLabel() };
  const next = { ...state, bookings: [...state.bookings, booking] };
  if (booking.status === "payment-confirmed") {
    return pushAudit(next, {
      action: "Booking Created",
      description: `Booking ${id} (${booking.alias}) confirmed on session ${booking.sessionId}.`,
      sessionId: booking.sessionId,
      operatorId
    });
  }
  return pushAudit(next, {
    action: "Booking Created",
    description: `Booking ${id} (${booking.alias}) created on session ${booking.sessionId} (${booking.status}).`,
    sessionId: booking.sessionId,
    operatorId
  });
}
