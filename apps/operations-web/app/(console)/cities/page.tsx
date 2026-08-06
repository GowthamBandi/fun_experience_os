"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button, StatusChip } from "@/components/ui/primitives";
import { SearchInput } from "@/components/ui/fields";
import { Stagger, Item } from "@/components/motion/Motion";
import {
  SetupBackNavigation,
  SetupPrimaryAction,
  SetupStatusBadge,
  SetupEmptyState,
} from "@/components/setup/shared";
import { Building2, MapPin, ArrowRight } from "lucide-react";

export default function CitiesPage() {
  const router = useRouter();
  const { state, territory, canAccess } = useStore();
  const [searchQuery, setSearchQuery] = useState("");

  const cities = state.cities ?? [];
  const territories = state.territories ?? [];
  const franchises = state.franchises ?? [];
  const venues = state.venues ?? [];
  const playingAreas = state.playingAreas ?? [];
  const sessions = state.sessions ?? [];

  const filteredCities = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return cities;
    return cities.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q) ||
        (territories.find((t) => t.id === c.territoryId)?.name ?? "").toLowerCase().includes(q)
    );
  }, [cities, territories, searchQuery]);

  if (!canAccess("/cities")) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <PermissionDenied module="Cities" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <SetupBackNavigation label="Back to Setup" href="/setup" />

      <PageHeader
        overline={`Setup · ${territory.name}`}
        title="Cities"
        sub="See every city where your company operates. Which cities are ready to conduct events?"
        right={
          <SetupPrimaryAction
            label="Add City"
            href="/cities/new"
            allowedRoles={["platform-owner", "super-admin", "regional-partner", "city-manager"]}
          />
        }
      />

      <div className="glass p-5 rounded-2xl border border-white/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-ink-lum">Operating Cities</h3>
            <p className="text-xs text-ink-mut">Cities divide local territories into event locations.</p>
          </div>
          <div className="w-full sm:w-72">
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search city, state, territory..." />
          </div>
        </div>

        {cities.length === 0 ? (
          <SetupEmptyState
            title="No operating cities created"
            message="Add a city under an active territory to start setting up venues and scheduling events."
            actionLabel="Add City"
            actionHref="/cities/new"
          />
        ) : filteredCities.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-mut">No cities match your search filter.</div>
        ) : (
          <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCities.map((c) => {
              const t = territories.find((tr) => tr.id === c.territoryId);
              const f = franchises.find((fr) => fr.id === t?.franchiseId);
              const cVenues = venues.filter((v) => v.cityId === c.id || v.territoryId === c.territoryId);
              const cAreas = playingAreas.filter((pa) => cVenues.some((v) => v.id === pa.venueId));
              const cSessions = sessions.filter((s) => cVenues.some((v) => v.id === s.venueId));

              let status: "complete" | "needs-attention" | "incomplete" = "complete";
              if (cVenues.length === 0) status = "incomplete";
              else if (cAreas.length === 0) status = "needs-attention";

              return (
                <Item key={c.id}>
                  <div className="glass p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <h4 className="font-bold text-base text-ink-lum flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                            <Link href={`/cities/${c.id}`} className="hover:text-brand transition-colors">
                              {c.name}
                            </Link>
                          </h4>
                          <p className="text-xs text-ink-mut">
                            {t?.name || "Territory"} · {f?.name || "Franchise"}
                          </p>
                        </div>
                        <SetupStatusBadge status={status} size="sm" />
                      </div>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-center text-xs">
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Venues</span>
                          <span className="font-bold text-ink-lum">{cVenues.length}</span>
                        </div>
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Areas</span>
                          <span className="font-bold text-ink-lum">{cAreas.length}</span>
                        </div>
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Events</span>
                          <span className="font-bold text-ink-lum">{cSessions.length}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                      <StatusChip value={c.status} />
                      <Link href={cVenues.length === 0 ? `/locations/venues/new?cityId=${c.id}` : `/cities/${c.id}`}>
                        <Button variant={cVenues.length === 0 ? "primary" : "secondary"} className="h-7 text-xs font-bold px-3">
                          {cVenues.length === 0 ? "Create Venue" : "Review City"}
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Item>
              );
            })}
          </Stagger>
        )}
      </div>
    </div>
  );
}
