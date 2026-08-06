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

export interface SetupNextAction {
  actionKey: "create-franchise" | "add-territory" | "add-city" | "create-venue" | "add-playing-area" | "create-template" | "schedule-event";
  label: string;
  subtitle: string;
  href: string;
  stepNumber: 1 | 2 | 3 | 4 | 5 | 6;
}

export interface SetupStepStatus {
  step: 1 | 2 | 3 | 4 | 5;
  key: "franchise" | "territory" | "city" | "venue" | "playing-area";
  title: string;
  explanation: string;
  status: "not-started" | "in-progress" | "complete" | "needs-attention";
  count: number;
  actionLabel: string;
  actionHref: string;
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
    missingItems.push("No operating franchise created.");
  }
  if (territoryCount === 0) {
    missingItems.push("No territory created under any franchise.");
  }
  if (cityCount === 0) {
    missingItems.push("No city added to any territory.");
  } else if (territoriesWithoutCities.length > 0) {
    missingItems.push(`${territoriesWithoutCities.length} territory has no city.`);
  }
  if (venueCount === 0) {
    missingItems.push("No venue location created in any city.");
  } else if (citiesWithoutVenues.length > 0) {
    missingItems.push(`${citiesWithoutVenues.length} city has no venue.`);
  }
  if (playingAreaCount === 0) {
    missingItems.push("No playing area (court/field/room) created in any venue.");
  } else if (venuesWithoutPlayingAreas.length > 0) {
    missingItems.push(`${venuesWithoutPlayingAreas.length} venue has no playing area.`);
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
 * Next Action Engine — derives the single recommended next action based on state
 */
export function selectNextSetupAction(state: PrototypeState): SetupNextAction {
  const franchises = state.franchises ?? [];
  const territories = state.territories ?? [];
  const cities = state.cities ?? [];
  const venues = state.venues ?? [];
  const playingAreas = state.playingAreas ?? [];
  const templates = state.templates ?? [];

  if (franchises.length === 0) {
    return {
      actionKey: "create-franchise",
      label: "Create Franchise",
      subtitle: "First step: Create the regional organization responsible for this operating area.",
      href: "/franchises/new",
      stepNumber: 1,
    };
  }

  if (territories.length === 0) {
    return {
      actionKey: "add-territory",
      label: "Add Territory",
      subtitle: "Second step: Create a local operating territory under your franchise.",
      href: "/territories/new",
      stepNumber: 2,
    };
  }

  if (cities.length === 0) {
    return {
      actionKey: "add-city",
      label: "Add City",
      subtitle: "Third step: Add a city where your company will run events.",
      href: "/cities/new",
      stepNumber: 3,
    };
  }

  if (venues.length === 0) {
    return {
      actionKey: "create-venue",
      label: "Create Venue",
      subtitle: "Fourth step: Add a physical venue building or outdoor location.",
      href: "/locations/venues/new",
      stepNumber: 4,
    };
  }

  if (playingAreas.length === 0) {
    return {
      actionKey: "add-playing-area",
      label: "Add Playing Area",
      subtitle: "Fifth step: Add the exact court, field, room, or hall inside your venue.",
      href: "/locations/playing-areas/new",
      stepNumber: 5,
    };
  }

  if (templates.length === 0) {
    return {
      actionKey: "create-template",
      label: "Create Experience",
      subtitle: "Your operating structure is ready! Now define an experience template.",
      href: "/catalog/experiences/new",
      stepNumber: 6,
    };
  }

  return {
    actionKey: "schedule-event",
    label: "Schedule Event",
    subtitle: "Your operating area is completely set up! You can now schedule live events.",
    href: "/missions",
    stepNumber: 6,
  };
}

/**
 * 5-Step Journey Status derivation
 */
export function selectSetupJourney(state: PrototypeState): SetupStepStatus[] {
  const health = selectSetupHealth(state);
  const franchises = state.franchises ?? [];
  const territories = state.territories ?? [];
  const cities = state.cities ?? [];
  const venues = state.venues ?? [];
  const playingAreas = state.playingAreas ?? [];

  return [
    {
      step: 1,
      key: "franchise",
      title: "1. Franchise",
      explanation: "The organization or regional operating head responsible for this area.",
      status: franchises.length > 0 ? "complete" : "not-started",
      count: franchises.length,
      actionLabel: franchises.length > 0 ? "View Franchises" : "Create Franchise",
      actionHref: franchises.length > 0 ? "/franchises" : "/franchises/new",
    },
    {
      step: 2,
      key: "territory",
      title: "2. Territory",
      explanation: "A smaller operating area managed by a local operating team.",
      status:
        territories.length > 0
          ? "complete"
          : franchises.length > 0
          ? "needs-attention"
          : "not-started",
      count: territories.length,
      actionLabel: territories.length > 0 ? "View Territories" : "Add Territory",
      actionHref: territories.length > 0 ? "/territories" : "/territories/new",
    },
    {
      step: 3,
      key: "city",
      title: "3. City",
      explanation: "The city where events will be conducted.",
      status:
        cities.length > 0
          ? health.territoriesWithoutCitiesCount > 0
            ? "needs-attention"
            : "complete"
          : territories.length > 0
          ? "needs-attention"
          : "not-started",
      count: cities.length,
      actionLabel: cities.length > 0 ? "View Cities" : "Add City",
      actionHref: cities.length > 0 ? "/cities" : "/cities/new",
    },
    {
      step: 4,
      key: "venue",
      title: "4. Venue",
      explanation: "The building or outdoor location where customers arrive.",
      status:
        venues.length > 0
          ? health.citiesWithoutVenuesCount > 0
            ? "needs-attention"
            : "complete"
          : cities.length > 0
          ? "needs-attention"
          : "not-started",
      count: venues.length,
      actionLabel: venues.length > 0 ? "View Venues" : "Create Venue",
      actionHref: venues.length > 0 ? "/locations/venues" : "/locations/venues/new",
    },
    {
      step: 5,
      key: "playing-area",
      title: "5. Playing Area",
      explanation: "The exact court, field, room, hall, pool, track, or activity space.",
      status:
        playingAreas.length > 0
          ? health.venuesWithoutPlayingAreasCount > 0
            ? "needs-attention"
            : "complete"
          : venues.length > 0
          ? "needs-attention"
          : "not-started",
      count: playingAreas.length,
      actionLabel: playingAreas.length > 0 ? "View Playing Areas" : "Add Playing Area",
      actionHref: playingAreas.length > 0 ? "/locations/playing-areas" : "/locations/playing-areas/new",
    },
  ];
}
