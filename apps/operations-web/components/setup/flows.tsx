"use client";

import { useState } from "react";
import { useStore } from "@/lib/store";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { useToast } from "@/components/ui/toast";
import { Crumbs, EmptyPanel, PageShell } from "@/components/setup/kit";
import { CreatedCard, SchemaWizard } from "@/components/setup/form";
import {
  cityFromValues,
  cityInitial,
  citySteps,
  playingAreaFields,
  playingAreaFromValues,
  playingAreaInitial,
  territoryFromValues,
  territoryInitial,
  territorySteps,
  venueFromValues,
  venueInitial,
  venueSteps,
} from "@/components/setup/schemas";
import { Building2, Globe2, LayoutGrid, MapPin } from "lucide-react";

/* ----------------------------------------------------------------------------
 * Create flows for the setup hierarchy. Each is used by its /new route and,
 * where a parent is known from the URL, by the nested route as well.
 * ------------------------------------------------------------------------- */

export function NewTerritoryFlow({ franchiseId }: { franchiseId?: string }) {
  const { state, canAccess, role, createTerritory } = useStore();
  const toast = useToast();
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  if (!canAccess("/territories")) return <PermissionDenied module="Territories" />;
  if (!geoCan(role.id, "create-territory")) return <PermissionDenied module="territory creation" />;
  const franchise = state.franchises.find((f) => f.id === franchiseId);
  const crumbs = [{ label: "Setup", href: "/setup" }, { label: "Territories", href: "/territories" }, { label: "New territory" }];

  if (!state.franchises.some((f) => f.status === "active") && !created) {
    return (
      <PageShell narrow>
        <Crumbs items={crumbs} />
        <EmptyPanel icon={<Globe2 className="h-5 w-5" />} title="No active franchise" line="Territories are added under an active franchise. Create one, or resume a paused franchise first." actionHref="/franchises/new" actionLabel="Create a franchise" />
      </PageShell>
    );
  }

  return (
    <PageShell narrow={!!created}>
      <Crumbs items={crumbs} />
      {created ? (
        <CreatedCard
          title={`${created.name} is ready`}
          line="Next, add the first city in this territory. Cities hold the venues where sessions run."
          primary={{ href: `/cities/new?territoryId=${created.id}`, label: "Add its first city" }}
          secondary={[{ href: `/territories/${created.id}`, label: "Open territory" }, { href: "/setup", label: "Back to setup" }]}
        />
      ) : (
        <>
          <PageHeader overline="Setup · Territories" title="New territory" sub={franchise ? `Under ${franchise.name}.` : "Choose the franchise, name the region and set who runs it."} />
          <SchemaWizard
            steps={territorySteps(state)}
            initial={territoryInitial(franchise && franchise.status === "active" ? franchise.id : state.franchises.length === 1 ? state.franchises[0].id : "")}
            submitLabel="Create territory"
            cancelHref={franchise ? `/franchises/${franchise.id}` : "/territories"}
            onSubmit={(v) => {
              const input = territoryFromValues(v, "active");
              const out = createTerritory(input);
              if (!out.error && out.id) {
                toast.success("Territory created", input.name);
                setCreated({ id: out.id, name: input.name });
              }
              return out;
            }}
          />
        </>
      )}
    </PageShell>
  );
}

export function NewCityFlow({ territoryId }: { territoryId?: string }) {
  const { state, canAccess, role, createCity } = useStore();
  const toast = useToast();
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  if (!canAccess("/cities")) return <PermissionDenied module="Cities" />;
  if (!geoCan(role.id, "create-city")) return <PermissionDenied module="city creation" />;
  const territory = state.territories.find((t) => t.id === territoryId);
  const crumbs = territory
    ? [{ label: "Setup", href: "/setup" }, { label: territory.name, href: `/territories/${territory.id}` }, { label: "New city" }]
    : [{ label: "Setup", href: "/setup" }, { label: "Cities", href: "/cities" }, { label: "New city" }];

  if (state.territories.filter((t) => t.status !== "disabled").length === 0 && !created) {
    return (
      <PageShell narrow>
        <Crumbs items={crumbs} />
        <EmptyPanel icon={<MapPin className="h-5 w-5" />} title="Add a territory first" line="Every city belongs to a territory. Create the territory, then add its cities." actionHref="/territories/new" actionLabel="Add a territory" />
      </PageShell>
    );
  }

  return (
    <PageShell narrow={!!created}>
      <Crumbs items={crumbs} />
      {created ? (
        <CreatedCard
          title={`${created.name} is added`}
          line="Next, add a venue in this city: the building or ground customers will arrive at."
          primary={{ href: `/locations/venues/new?cityId=${created.id}`, label: "Add its first venue" }}
          secondary={[{ href: `/cities/${created.id}`, label: "Open city" }, { href: "/setup", label: "Back to setup" }]}
        />
      ) : (
        <>
          <PageHeader overline="Setup · Cities" title="New city" sub={territory ? `In ${territory.name}.` : "Choose the territory and name the city."} />
          <SchemaWizard
            steps={citySteps(state)}
            initial={cityInitial(territory?.id ?? (state.territories.length === 1 ? state.territories[0].id : ""), territory?.state ?? "")}
            submitLabel="Create city"
            cancelHref={territory ? `/territories/${territory.id}` : "/cities"}
            onSubmit={(v) => {
              const input = cityFromValues(v);
              const out = createCity(input);
              if (!out.error && out.id) {
                toast.success("City created", input.name);
                setCreated({ id: out.id, name: input.name });
              }
              return out;
            }}
          />
        </>
      )}
    </PageShell>
  );
}

export function NewVenueFlow({ cityId }: { cityId?: string }) {
  const { state, canAccess, role, createVenue } = useStore();
  const toast = useToast();
  const [created, setCreated] = useState<{ id: string; name: string } | null>(null);
  if (!canAccess("/locations")) return <PermissionDenied module="Venues" />;
  if (!geoCan(role.id, "create-venue")) return <PermissionDenied module="venue creation" />;
  const city = state.cities.find((c) => c.id === cityId);
  const crumbs = city
    ? [{ label: "Setup", href: "/setup" }, { label: city.name, href: `/cities/${city.id}` }, { label: "New venue" }]
    : [{ label: "Setup", href: "/setup" }, { label: "Venues", href: "/locations/venues" }, { label: "New venue" }];

  if (state.cities.length === 0 && !created) {
    return (
      <PageShell narrow>
        <Crumbs items={crumbs} />
        <EmptyPanel icon={<Building2 className="h-5 w-5" />} title="Add a city first" line="Every venue sits in a city. Add the city, then its venues." actionHref="/cities/new" actionLabel="Add a city" />
      </PageShell>
    );
  }

  return (
    <PageShell narrow={!!created}>
      <Crumbs items={crumbs} />
      {created ? (
        <CreatedCard
          title={`${created.name} is added`}
          line="It starts as open but unverified. Next, add the courts, pitches, tables or rooms inside it — sessions are booked onto playing areas."
          primary={{ href: `/locations/playing-areas/new?venueId=${created.id}`, label: "Add its first playing area" }}
          secondary={[{ href: `/locations/venues/${created.id}`, label: "Open venue" }, { href: "/setup", label: "Back to setup" }]}
        />
      ) : (
        <>
          <PageHeader overline="Setup · Venues" title="New venue" sub={city ? `In ${city.name}.` : "Where it is, how many people it can hold safely, and what it offers."} />
          <SchemaWizard
            steps={venueSteps(state)}
            initial={venueInitial(city?.id ?? (state.cities.length === 1 ? state.cities[0].id : ""))}
            submitLabel="Create venue"
            cancelHref={city ? `/cities/${city.id}` : "/locations/venues"}
            onSubmit={(v) => {
              const input = venueFromValues(state, v);
              const out = createVenue(input);
              if (!out.error && out.id) {
                toast.success("Venue created", input.name);
                setCreated({ id: out.id, name: input.name });
              }
              return out;
            }}
          />
        </>
      )}
    </PageShell>
  );
}

export function NewPlayingAreaFlow({ venueId, lockVenue = false }: { venueId?: string; lockVenue?: boolean }) {
  const { state, canAccess, role, createPlayingArea } = useStore();
  const toast = useToast();
  const [created, setCreated] = useState<{ id: string; name: string; venueId: string } | null>(null);
  const [initialVenue] = useState(venueId ?? (state.venues.length === 1 ? state.venues[0].id : ""));
  if (!canAccess("/locations")) return <PermissionDenied module="Playing areas" />;
  if (!geoCan(role.id, "create-playing-area")) return <PermissionDenied module="playing area creation" />;
  const venue = state.venues.find((v) => v.id === venueId);
  const crumbs = venue
    ? [{ label: "Setup", href: "/setup" }, { label: venue.name, href: `/locations/venues/${venue.id}` }, { label: "New playing area" }]
    : [{ label: "Setup", href: "/setup" }, { label: "Playing areas", href: "/locations/playing-areas" }, { label: "New playing area" }];

  if ((state.venues.filter((v) => v.status !== "closed").length === 0 || (lockVenue && !venue)) && !created) {
    return (
      <PageShell narrow>
        <Crumbs items={crumbs} />
        <EmptyPanel icon={<LayoutGrid className="h-5 w-5" />} title={lockVenue && !venue ? "Venue not found" : "Add a venue first"} line="Playing areas are the courts, pitches, tables or rooms inside a venue." actionHref={lockVenue && !venue ? "/locations/venues" : "/locations/venues/new"} actionLabel={lockVenue && !venue ? "All venues" : "Add a venue"} />
      </PageShell>
    );
  }

  return (
    <PageShell narrow={!!created}>
      <Crumbs items={crumbs} />
      {created ? (
        <CreatedCard
          title={`${created.name} is ready`}
          line={state.templates.length ? "It can now be used when scheduling sessions of compatible experiences." : "Next, add an activity category and an experience in Catalog so you can schedule sessions here."}
          primary={state.templates.length ? { href: "/missions/new", label: "Schedule a session" } : { href: state.categories.length ? "/catalog/experiences/new" : "/catalog/categories/new", label: state.categories.length ? "Create an experience" : "Add an activity category" }}
          secondary={[{ href: `/locations/playing-areas/new?venueId=${created.venueId}`, label: "Add another area" }, { href: `/locations/venues/${created.venueId}`, label: "Open venue" }, { href: "/setup", label: "Back to setup" }]}
        />
      ) : (
        <>
          <PageHeader overline="Setup · Playing areas" title="New playing area" sub={venue ? `Inside ${venue.name} (safe capacity ${venue.safetyCapacity}).` : "A court, pitch, table or room inside a venue."} />
          <SchemaWizard
            steps={[{ label: "Playing area", sub: "Name, capacity, activities", intro: "Sessions are booked onto a playing area, so its capacity limits how many people can join.", fields: playingAreaFields(state, venueId, lockVenue && !!venue) }]}
            initial={playingAreaInitial(initialVenue)}
            submitLabel="Create playing area"
            cancelHref={venue ? `/locations/venues/${venue.id}` : "/locations/playing-areas"}
            onSubmit={(v) => {
              const input = playingAreaFromValues(v, lockVenue && venue ? venue.id : undefined);
              const out = createPlayingArea(input);
              if (!out.error && out.id) {
                toast.success("Playing area created", input.name);
                setCreated({ id: out.id, name: input.name, venueId: input.venueId });
              }
              return out;
            }}
          />
        </>
      )}
    </PageShell>
  );
}
