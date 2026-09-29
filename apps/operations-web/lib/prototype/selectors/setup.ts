import type { PrototypeState } from "../scenarios/state";
import type { FranchiseId, TerritoryId, CityId, VenueId } from "../entities";

export type SetupHealthStatus = "complete" | "needs-attention" | "incomplete";

export interface SetupHealth {
  status: SetupHealthStatus;
  label: string;
  missingItems: string[];
  franchiseCount: number;
  territoryCount: number;
  cityCount: number;
  venueCount: number;
  playingAreaCount: number;
  venuesWithoutPlayingAreasCount: number;
  territoriesWithoutCitiesCount: number;
  citiesWithoutVenuesCount: number;
}

export type SetupStepKey = "franchise" | "territory" | "city" | "venue" | "playing-area" | "category" | "experience" | "session";

export interface SetupNextAction {
  actionKey: "create-franchise" | "add-territory" | "add-city" | "create-venue" | "add-playing-area" | "add-category" | "create-template" | "schedule-event" | "done";
  label: string;
  subtitle: string;
  href: string;
  /** 1-based position in the 8-step first-run journey. */
  stepNumber: number;
}

export interface SetupStepStatus {
  step: number;
  key: SetupStepKey;
  title: string;
  explanation: string;
  status: "not-started" | "in-progress" | "complete" | "needs-attention";
  count: number;
  actionLabel: string;
  actionHref: string;
  /** Where to see the existing records once some exist. */
  listHref: string;
}

/**
 * Derive overall Setup Health from PrototypeState
 */
export function selectSetupHealth(state: PrototypeState): SetupHealth {
  const franchises = state.franchises ?? [];
  const territories = state.territories ?? [];
  const cities = state.cities ?? [];
  const venues = state.venues ?? [];
  const playingAreas = state.playingAreas ?? [];

  const franchiseCount = franchises.length;
  const territoryCount = territories.length;
  const cityCount = cities.length;
  const venueCount = venues.length;
  const playingAreaCount = playingAreas.length;

  const territoriesWithoutCities = territories.filter(
    (t) => !cities.some((c) => c.territoryId === t.id)
  );
  const citiesWithoutVenues = cities.filter(
    (c) => !venues.some((v) => v.cityId === c.id)
  );
  const venuesWithoutPlayingAreas = venues.filter(
    (v) => !playingAreas.some((pa) => pa.venueId === v.id)
  );

  const missingItems: string[] = [];

  if (franchiseCount === 0) {
    missingItems.push("No franchise yet.");
  }
  if (territoryCount === 0) {
    missingItems.push("No territory yet.");
  }
  if (cityCount === 0) {
    missingItems.push("No city yet.");
  } else if (territoriesWithoutCities.length > 0) {
    missingItems.push(`${territoriesWithoutCities.length} ${territoriesWithoutCities.length === 1 ? "territory has" : "territories have"} no city.`);
  }
  if (venueCount === 0) {
    missingItems.push("No venue yet.");
  } else if (citiesWithoutVenues.length > 0) {
    missingItems.push(`${citiesWithoutVenues.length} ${citiesWithoutVenues.length === 1 ? "city has" : "cities have"} no venue.`);
  }
  if (playingAreaCount === 0) {
    missingItems.push("No playing area yet.");
  } else if (venuesWithoutPlayingAreas.length > 0) {
    missingItems.push(`${venuesWithoutPlayingAreas.length} ${venuesWithoutPlayingAreas.length === 1 ? "venue has" : "venues have"} no playing area.`);
  }

  let status: SetupHealthStatus = "complete";
  let label = "Ready to Schedule Events";

  if (franchiseCount === 0 || territoryCount === 0 || cityCount === 0 || venueCount === 0 || playingAreaCount === 0) {
    status = "incomplete";
    label = "Setup Incomplete";
  } else if (missingItems.length > 0) {
    status = "needs-attention";
    label = "Needs Attention";
  }

  return {
    status,
    label,
    missingItems,
    franchiseCount,
    territoryCount,
    cityCount,
    venueCount,
    playingAreaCount,
    venuesWithoutPlayingAreasCount: venuesWithoutPlayingAreas.length,
    territoriesWithoutCitiesCount: territoriesWithoutCities.length,
    citiesWithoutVenuesCount: citiesWithoutVenues.length,
  };
}

/**
 * Derive Setup Health for a specific Franchise
 */
export function selectFranchiseSetupHealth(state: PrototypeState, franchiseId: FranchiseId) {
  const territories = (state.territories ?? []).filter((t) => t.franchiseId === franchiseId);
  const territoryIds = new Set(territories.map((t) => t.id));
  const cities = (state.cities ?? []).filter((c) => territoryIds.has(c.territoryId));
  const cityIds = new Set(cities.map((c) => c.id));
  const venues = (state.venues ?? []).filter((v) => cityIds.has(v.cityId));
  const venueIds = new Set(venues.map((v) => v.id));
  const playingAreas = (state.playingAreas ?? []).filter((pa) => venueIds.has(pa.venueId));

  const missingItems: string[] = [];
  if (territories.length === 0) missingItems.push("Add at least one territory to this franchise.");
  if (cities.length === 0 && territories.length > 0) missingItems.push("Add a city to an existing territory.");
  if (venues.length === 0 && cities.length > 0) missingItems.push("Create a venue in an active city.");
  if (playingAreas.length === 0 && venues.length > 0) missingItems.push("Add a playing area (court/room/field) to a venue.");

  let status: SetupHealthStatus = "complete";
  if (territories.length === 0 || cities.length === 0 || venues.length === 0 || playingAreas.length === 0) {
    status = "incomplete";
  } else if (missingItems.length > 0) {
    status = "needs-attention";
  }

  return {
    status,
    missingItems,
    territoryCount: territories.length,
    cityCount: cities.length,
    venueCount: venues.length,
    playingAreaCount: playingAreas.length,
  };
}

/**
 * Derive Setup Health for a specific Territory
 */
export function selectTerritorySetupHealth(state: PrototypeState, territoryId: TerritoryId) {
  const cities = (state.cities ?? []).filter((c) => c.territoryId === territoryId);
  const cityIds = new Set(cities.map((c) => c.id));
  const venues = (state.venues ?? []).filter((v) => cityIds.has(v.cityId) || v.territoryId === territoryId);
  const venueIds = new Set(venues.map((v) => v.id));
  const playingAreas = (state.playingAreas ?? []).filter((pa) => venueIds.has(pa.venueId));

  const missingItems: string[] = [];
  if (cities.length === 0) missingItems.push("Add at least one city to this territory.");
  if (venues.length === 0 && cities.length > 0) missingItems.push("Create a venue in this territory's city.");
  if (playingAreas.length === 0 && venues.length > 0) missingItems.push("Add a court or playing area to a venue.");

  let status: SetupHealthStatus = "complete";
  if (cities.length === 0 || venues.length === 0 || playingAreas.length === 0) {
    status = "incomplete";
  } else if (missingItems.length > 0) {
    status = "needs-attention";
  }

  return {
    status,
    missingItems,
    cityCount: cities.length,
    venueCount: venues.length,
    playingAreaCount: playingAreas.length,
  };
}

/**
 * Derive Setup Health for a specific Venue
 */
export function selectVenueSetupHealth(state: PrototypeState, venueId: VenueId) {
  const playingAreas = (state.playingAreas ?? []).filter((pa) => pa.venueId === venueId);
  const missingItems: string[] = [];

  if (playingAreas.length === 0) {
    missingItems.push("Add at least one playing area (court, room, field, or hall) before scheduling an event.");
  }

  let status: SetupHealthStatus = "complete";
  if (playingAreas.length === 0) {
    status = "needs-attention";
  }

  return {
    status,
    missingItems,
    playingAreaCount: playingAreas.length,
  };
}

/**
 * The first-run journey: the eight things an operator creates, in order, to
 * go from an empty workspace to a bookable session.
 */
export function selectSetupJourney(state: PrototypeState): SetupStepStatus[] {
  const health = selectSetupHealth(state);
  const count = {
    franchise: (state.franchises ?? []).length,
    territory: (state.territories ?? []).length,
    city: (state.cities ?? []).length,
    venue: (state.venues ?? []).length,
    "playing-area": (state.playingAreas ?? []).length,
    category: (state.categories ?? []).filter((c) => (c.status ?? "active") !== "archived").length,
    experience: (state.templates ?? []).filter((t) => t.status !== "archived").length,
    session: (state.sessions ?? []).filter((s) => !["cancelled", "archived"].includes(s.status)).length,
  } as const;
  const gaps: Partial<Record<SetupStepKey, number>> = {
    city: health.territoriesWithoutCitiesCount,
    venue: health.citiesWithoutVenuesCount,
    "playing-area": health.venuesWithoutPlayingAreasCount,
    experience: (state.templates ?? []).length > 0 && !(state.templates ?? []).some((t) => t.status === "active") ? 1 : 0,
  };
  const defs: Array<Omit<SetupStepStatus, "status" | "count" | "step">> = [
    { key: "franchise", title: "Franchise", explanation: "The business that runs this operating area and signs its contracts.", actionLabel: "Create franchise", actionHref: "/franchises/new", listHref: "/franchises" },
    { key: "territory", title: "Territory", explanation: "A region the franchise runs, with its own manager, time zone and currency.", actionLabel: "Add territory", actionHref: "/territories/new", listHref: "/territories" },
    { key: "city", title: "City", explanation: "A city inside the territory where sessions will run.", actionLabel: "Add city", actionHref: "/cities/new", listHref: "/cities" },
    { key: "venue", title: "Venue", explanation: "The building or ground customers arrive at, with its safety capacity.", actionLabel: "Add venue", actionHref: "/locations/venues/new", listHref: "/locations/venues" },
    { key: "playing-area", title: "Playing area", explanation: "The exact court, pitch, table or room inside the venue.", actionLabel: "Add playing area", actionHref: "/locations/playing-areas/new", listHref: "/locations/playing-areas" },
    { key: "category", title: "Activity category", explanation: "The kind of activity (badminton, board games…) and its defaults.", actionLabel: "Add category", actionHref: "/catalog/categories/new", listHref: "/catalog/categories" },
    { key: "experience", title: "Experience", explanation: "A reusable plan: format, group size, price, staffing and reveal rules.", actionLabel: "Create experience", actionHref: "/catalog/experiences/new", listHref: "/catalog/experiences" },
    { key: "session", title: "Scheduled session", explanation: "A dated session of an experience at a playing area, open for booking.", actionLabel: "Schedule session", actionHref: "/missions/new", listHref: "/missions" },
  ];
  let blocked = false;
  return defs.map((d, i) => {
    const n = count[d.key];
    let status: SetupStepStatus["status"];
    if (n > 0) status = (gaps[d.key] ?? 0) > 0 ? "needs-attention" : "complete";
    else status = blocked ? "not-started" : "in-progress";
    if (n === 0) blocked = true;
    return { ...d, step: i + 1, status, count: n };
  });
}

/**
 * Next Action Engine — the single recommended next step: the first journey
 * step with nothing created yet, else the first step that needs attention.
 */
export function selectNextSetupAction(state: PrototypeState): SetupNextAction {
  const journey = selectSetupJourney(state);
  const keyFor: Record<SetupStepKey, SetupNextAction["actionKey"]> = {
    franchise: "create-franchise",
    territory: "add-territory",
    city: "add-city",
    venue: "create-venue",
    "playing-area": "add-playing-area",
    category: "add-category",
    experience: "create-template",
    session: "schedule-event",
  };
  const next = journey.find((s) => s.count === 0) ?? journey.find((s) => s.status === "needs-attention");
  if (!next) {
    return {
      actionKey: "done",
      label: "Schedule another session",
      subtitle: "Setup is complete. Every territory has a city, every city a venue and every venue a playing area.",
      href: "/missions/new",
      stepNumber: journey.length,
    };
  }
  const empty = next.count === 0;
  return {
    actionKey: keyFor[next.key],
    label: next.actionLabel,
    subtitle: empty ? `Step ${next.step} of ${journey.length}: ${next.explanation}` : `Some records need a ${next.title.toLowerCase()} before they can be used.`,
    href: next.actionHref,
    stepNumber: next.step,
  };
}
