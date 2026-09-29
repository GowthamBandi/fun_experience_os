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
import type { CommandResult } from "./outcome";

export type FranchiseInput = Omit<Franchise, "id"> & { id?: string };
export type TerritoryInput = Omit<Territory, "id"> & { id?: string };
export type CityInput = Omit<City, "id"> & { id?: string };
export type VenueInput = Omit<Venue, "id"> & { id?: string };
export type PlayingAreaInput = Omit<PlayingArea, "id"> & { id?: string };
export type CategoryInput = Omit<ActivityCategory, "id"> & { id?: string };
export type TemplateInput = Omit<ExperienceTemplate, "id"> & { id?: string };
export type SessionInput = Omit<ScheduledSession, "id"> & { id?: string };

const has = (v: unknown): boolean => typeof v === "string" && v.trim().length > 0;
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const trimmed = <T extends { name: string }>(x: T): T => ({ ...x, name: x.name.trim() });

/** Operator-readable validation for a franchise record (create or update). */
export function validateFranchise(state: PrototypeState, f: Omit<Franchise, "id">, selfId?: string): string | undefined {
  if (!has(f.name) || f.name.trim().length < 3) return "Enter the franchise name (at least 3 characters).";
  if (state.franchises.some((x) => x.id !== selfId && sameName(x.name, f.name))) return `A franchise called "${f.name.trim()}" already exists.`;
  if (!has(f.legalEntity)) return "Enter the registered legal entity name.";
  if (!has(f.franchiseHead)) return "Name the franchise head.";
  if (!Number.isFinite(f.revenueShare) || f.revenueShare < 0 || f.revenueShare > 100) return "Revenue share must be between 0% and 100%.";
  if (!has(f.startDate)) return "Choose the franchise start date.";
  if (has(f.contactDetails) && !/@|\d{6,}/.test(f.contactDetails)) return "Contact details should include an email address or phone number.";
  return undefined;
}

export function validateTerritory(state: PrototypeState, t: Omit<Territory, "id">, selfId?: string): string | undefined {
  if (!has(t.name) || t.name.trim().length < 3) return "Enter the territory name (at least 3 characters).";
  const franchise = state.franchises.find((f) => f.id === t.franchiseId);
  if (!franchise) return "Choose the franchise this territory belongs to.";
  if (!selfId && franchise.status !== "active") return `${franchise.name} is ${franchise.status}; new territories can only be added to an active franchise.`;
  if (state.territories.some((x) => x.id !== selfId && x.franchiseId === t.franchiseId && sameName(x.name, t.name))) return `${franchise.name} already has a territory called "${t.name.trim()}".`;
  if (!has(t.state)) return "Enter the state this territory is in.";
  if (t.managerId && !state.operators.some((o) => o.id === t.managerId)) return "The selected manager is not an operator in this workspace.";
  if (!has(t.timezone)) return "Choose the territory's time zone.";
  if (!has(t.currency)) return "Choose the territory's currency.";
  return undefined;
}

export function validateCity(state: PrototypeState, c: Omit<City, "id">, selfId?: string): string | undefined {
  if (!has(c.name) || c.name.trim().length < 2) return "Enter the city name.";
  const territory = state.territories.find((t) => t.id === c.territoryId);
  if (!territory) return "Choose the territory this city belongs to.";
  if (!selfId && territory.status === "disabled") return `${territory.name} is disabled; cities cannot be added to it.`;
  if (state.cities.some((x) => x.id !== selfId && x.territoryId === c.territoryId && sameName(x.name, c.name))) return `${territory.name} already has a city called "${c.name.trim()}".`;
  if (c.managerId && !state.operators.some((o) => o.id === c.managerId)) return "The selected city manager is not an operator in this workspace.";
  const unknown = c.supportedCategories.filter((id) => !state.categories.some((k) => k.id === id));
  if (unknown.length) return "One of the selected activity categories no longer exists.";
  return undefined;
}

export function validateVenue(state: PrototypeState, v: Omit<Venue, "id">, selfId?: string): string | undefined {
  if (!has(v.name) || v.name.trim().length < 3) return "Enter the venue name (at least 3 characters).";
  const city = state.cities.find((c) => c.id === v.cityId);
  if (!city) return "Choose the city this venue is in.";
  if (city.territoryId !== v.territoryId) return `${city.name} is not in the selected territory.`;
  if (state.venues.some((x) => x.id !== selfId && x.cityId === v.cityId && sameName(x.name, v.name))) return `${city.name} already has a venue called "${v.name.trim()}".`;
  if (!has(v.address)) return "Enter the venue's street address.";
  if (!Number.isFinite(v.safetyCapacity) || v.safetyCapacity < 1) return "Safe capacity must be at least 1 person.";
  if (!Number.isFinite(v.staffCapacity) || v.staffCapacity < 0) return "Staff capacity cannot be negative.";
  if (v.spectatorAllowance < 0) return "Spectator allowance cannot be negative.";
  if (v.costPerSlot < 0) return "Cost per slot cannot be negative.";
  if (has(v.contactNumber) && !/^[+\d][\d\s-]{6,}$/.test(v.contactNumber.trim())) return "Enter a valid contact number, or leave it blank.";
  return undefined;
}

export function validatePlayingArea(state: PrototypeState, p: Omit<PlayingArea, "id">, selfId?: string): string | undefined {
  if (!has(p.name)) return "Enter the playing area name (for example \"Court 1\").";
  const venue = state.venues.find((v) => v.id === p.venueId);
  if (!venue) return "Choose the venue this playing area belongs to.";
  if (!selfId && venue.status === "closed") return `${venue.name} is closed; reopen it before adding playing areas.`;
  if (state.playingAreas.some((x) => x.id !== selfId && x.venueId === p.venueId && sameName(x.name, p.name))) return `${venue.name} already has a playing area called "${p.name.trim()}".`;
  if (!Number.isFinite(p.maxCapacity) || p.maxCapacity < 1) return "Maximum capacity must be at least 1 participant.";
  if (p.maxCapacity > venue.safetyCapacity) return `Maximum capacity (${p.maxCapacity}) cannot exceed the venue's safe capacity (${venue.safetyCapacity}).`;
  if (p.staffCapacity < 0 || p.spectatorCapacity < 0) return "Staff and spectator capacity cannot be negative.";
  if (p.activityCompatibility.length === 0) return "Choose at least one activity this area supports.";
  return undefined;
}

export function createFranchise(state: PrototypeState, input: FranchiseInput, operatorId?: string): CommandResult<{ id: string }> {
  const error = validateFranchise(state, input);
  if (error) return { state, error };
  const id = input.id ?? nextId("f", state.franchises.map((f) => f.id));
  const franchise: Franchise = trimmed({ ...input, id, assignedTerritories: [] });
  const next = pushAudit(
    { ...state, franchises: [...state.franchises, franchise] },
    { action: "Franchise Created", description: `Franchise "${franchise.name}" created (${id}).`, operatorId }
  );
  return { state: next, id };
}

export function createTerritory(state: PrototypeState, input: TerritoryInput, operatorId?: string): CommandResult<{ id: string }> {
  const error = validateTerritory(state, input);
  if (error) return { state, error };
  const id = input.id ?? nextId("t", state.territories.map((x) => x.id));
  if (state.territories.some((t) => t.id === id)) return { state, error: `Territory id ${id} is already in use.` };
  const territory: Territory = trimmed({ ...input, id });
  const next = {
    ...state,
    territories: [...state.territories, territory],
    franchises: state.franchises.map((f) =>
      f.id === territory.franchiseId && !f.assignedTerritories.includes(id)
        ? { ...f, assignedTerritories: [...f.assignedTerritories, id] }
        : f
    )
  };
  const franchise = state.franchises.find((f) => f.id === territory.franchiseId);
  return {
    state: pushAudit(next, { action: "Territory Created", description: `Territory "${territory.name}" created under ${franchise?.name ?? territory.franchiseId}.`, operatorId }),
    id
  };
}

export function createCity(state: PrototypeState, input: CityInput, operatorId?: string): CommandResult<{ id: string }> {
  const error = validateCity(state, input);
  if (error) return { state, error };
  const id = input.id ?? nextId("c", state.cities.map((c) => c.id));
  const city: City = trimmed({ ...input, id });
  const territory = state.territories.find((t) => t.id === city.territoryId);
  return {
    state: pushAudit(
      { ...state, cities: [...state.cities, city] },
      { action: "City Created", description: `City "${city.name}" created in ${territory?.name ?? city.territoryId}.`, operatorId }
    ),
    id
  };
}

export function createVenue(state: PrototypeState, input: VenueInput, operatorId?: string): CommandResult<{ id: string }> {
  const error = validateVenue(state, input);
  if (error) return { state, error };
  const id = input.id ?? nextId("v", state.venues.map((v) => v.id));
  const venue: Venue = trimmed({ ...input, id });
  const city = state.cities.find((c) => c.id === venue.cityId);
  return {
    state: pushAudit(
      { ...state, venues: [...state.venues, venue] },
      { action: "Venue Created", description: `Venue "${venue.name}" created (${id}) in ${city?.name ?? venue.cityId}.`, operatorId }
    ),
    id
  };
}

export function createPlayingArea(state: PrototypeState, input: PlayingAreaInput, operatorId?: string): CommandResult<{ id: string }> {
  const error = validatePlayingArea(state, input);
  if (error) return { state, error };
  const id = input.id ?? nextId("pa", state.playingAreas.map((p) => p.id));
  const area: PlayingArea = trimmed({ ...input, id });
  const venue = state.venues.find((v) => v.id === area.venueId);
  return {
    state: pushAudit(
      { ...state, playingAreas: [...state.playingAreas, area] },
      { action: "Playing Area Created", description: `Playing area "${area.name}" created (${id}) at ${venue?.name ?? area.venueId}.`, operatorId }
    ),
    id
  };
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

const CLOSED_SESSION = new Set(["cancelled", "completed", "archived"]);

function minutesOf(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Operator-readable validation for scheduling a session. Mirrors the checks on the Schedule page. */
export function validateSessionInput(state: PrototypeState, input: SessionInput): string | undefined {
  if (input.id && state.sessions.some((x) => x.id === input.id)) return `A session with the id ${input.id} already exists.`;
  const template = state.templates.find((t) => t.id === input.templateId);
  if (!template) return "Choose the experience to schedule.";
  if (template.status !== "active") return `“${template.name}” is not active. Activate it in Catalog before scheduling.`;
  if (input.categoryId !== template.categoryId) return "The session's category does not match the experience.";
  const venue = state.venues.find((v) => v.id === input.venueId);
  if (!venue) return "Choose a venue.";
  if (venue.status !== "ready") return `${venue.name} is ${venue.status} and cannot take new sessions.`;
  if (venue.territoryId !== input.territoryId) return "The venue is not in this session's territory.";
  const area = state.playingAreas.find((p) => p.id === input.playingAreaId);
  if (!area || area.venueId !== venue.id) return "Choose a playing area inside the selected venue.";
  if (area.status !== "active") return `${area.name} is ${area.status} and cannot be booked.`;
  if (!has(input.date)) return "Choose the session date.";
  const start = minutesOf(input.startTime ?? "");
  if (start === null) return "Enter a start time as HH:MM (24-hour).";
  if (!Number.isFinite(input.duration) || input.duration < 15 || input.duration > 12 * 60) return "Duration must be between 15 minutes and 12 hours.";
  if (!Number.isInteger(input.maxParticipants) || input.maxParticipants < 1) return "Capacity must be at least 1 participant.";
  if (input.maxParticipants > area.maxCapacity) return `${area.name} holds at most ${area.maxCapacity} participants.`;
  if (input.minParticipants < 0 || input.minParticipants > input.maxParticipants) return "The minimum cannot be more than the capacity.";
  if (input.targetParticipants < input.minParticipants || input.targetParticipants > input.maxParticipants) return "The target must sit between the minimum and the capacity.";
  if ((input.blockedSlots ?? 0) + (input.compSlots ?? 0) > input.maxParticipants) return "Blocked and free-pass seats cannot exceed the capacity.";
  if (!Number.isFinite(input.finalPrice) || input.finalPrice < 0) return "Enter a price of ₹0 or more.";
  const crewIds = new Set(state.crew.map((c) => c.id));
  for (const [label, id] of [["lead coordinator", input.leadCoordinatorId], ["safety contact", input.safetyContactId]] as const) {
    if (has(id) && !crewIds.has(id as string)) return `The ${label} is not on the staff list.`;
  }
  if (has(input.leadCoordinatorId) && input.leadCoordinatorId === input.safetyContactId) return "The lead coordinator and safety contact must be different people.";
  const end = start + input.duration;
  const clash = state.sessions.find((x) => {
    if (x.playingAreaId !== input.playingAreaId || x.date !== input.date || CLOSED_SESSION.has(x.status)) return false;
    const xs = minutesOf(x.startTime);
    return xs !== null && xs < end && start < xs + x.duration;
  });
  if (clash) return `${area.name} is already booked at that time (session ${clash.id} at ${clash.startTime}).`;
  return undefined;
}

export function createSession(state: PrototypeState, input: SessionInput, operatorId?: string): { state: PrototypeState; error?: string; id?: string } {
  const error = validateSessionInput(state, input);
  if (error) return { state, error };
  const id = input.id ?? nextId("s", state.sessions.map((x) => x.id));
  const session: ScheduledSession = { ...input, id };
  return {
    id,
    state: pushAudit(
      { ...state, sessions: [...state.sessions, session] },
      { action: "Session Created", description: `Session ${id} scheduled (${session.date}, ${session.startTime}).`, sessionId: id, operatorId }
    ),
  };
}
