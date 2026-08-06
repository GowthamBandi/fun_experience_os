"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { selectVenueSetupHealth } from "@/lib/prototype/selectors/setup";
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
import { Building2, MapPin, Layers, ArrowRight, Plus } from "lucide-react";
import type { Venue } from "@/lib/prototype/entities";

export default function VenuesListPage() {
  const router = useRouter();
  const { state, territory, canAccess } = useStore();
  const [searchQuery, setSearchQuery] = useState("");

  const venues = state.venues ?? [];
  const cities = state.cities ?? [];
  const territories = state.territories ?? [];
  const playingAreas = state.playingAreas ?? [];
  const sessions = state.sessions ?? [];

  const filteredVenues = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return venues;
    return venues.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.address.toLowerCase().includes(q) ||
        (cities.find((c) => c.id === v.cityId)?.name ?? "").toLowerCase().includes(q)
    );
  }, [venues, cities, searchQuery]);

  if (!canAccess("/locations")) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <PermissionDenied module="Venues" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <SetupBackNavigation label="Back to Setup" href="/setup" />

      <PageHeader
        overline={`Setup · ${territory.name}`}
        title="Venues"
        sub="Manage the places where customers arrive for events."
        right={
          <SetupPrimaryAction
            label="Create Venue"
            href="/locations/venues/new"
            allowedRoles={["platform-owner", "super-admin", "regional-partner", "city-manager", "venue-manager"]}
          />
        }
      />

      <div className="glass p-5 rounded-2xl border border-white/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-ink-lum">Where will this event happen?</h3>
            <p className="text-xs text-ink-mut">Filter and manage physical venue locations.</p>
          </div>
          <div className="w-full sm:w-72">
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search venue, city, address..." />
          </div>
        </div>

        {venues.length === 0 ? (
          <SetupEmptyState
            title="No event locations added"
            message="No venues have been created in your operating area yet."
            actionLabel="Create Venue"
            actionHref="/locations/venues/new"
          />
        ) : filteredVenues.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-mut">No venues match your search query.</div>
        ) : (
          <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredVenues.map((v) => {
              const city = cities.find((c) => c.id === v.cityId);
              const t = territories.find((tr) => tr.id === v.territoryId || tr.id === city?.territoryId);
              const vAreas = playingAreas.filter((pa) => pa.venueId === v.id);
              const vEventsToday = sessions.filter((s) => s.venueId === v.id && s.date === "Today").length;
              const health = selectVenueSetupHealth(state, v.id);
              const combinedCapacity = vAreas.length > 0
                ? vAreas.reduce((sum, pa) => sum + (pa.maxCapacity || 0), 0)
                : v.safetyCapacity || 0;

              return (
                <Item key={v.id}>
                  <div className="glass p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <h4 className="font-bold text-base text-ink-lum flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-purple-400 shrink-0" />
                            <Link href={`/locations/venues/${v.id}`} className="hover:text-brand transition-colors">
                              {v.name}
                            </Link>
                          </h4>
                          <p className="text-xs text-ink-mut flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-emerald-400 shrink-0" />
                            <span>{city?.name || "City"} · {t?.name || "Territory"}</span>
                          </p>
                        </div>
                        <SetupStatusBadge status={health.status} size="sm" />
                      </div>

                      <p className="text-xs text-ink-sec truncate">{v.address || "Address not specified"}</p>

                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-center text-xs">
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Areas</span>
                          <span className="font-bold text-ink-lum">{vAreas.length}</span>
                        </div>
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Capacity</span>
                          <span className="font-bold text-ink-lum">{combinedCapacity}</span>
                        </div>
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Today</span>
                          <span className="font-bold text-ink-lum">{vEventsToday}</span>
                        </div>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                      <StatusChip value={v.status} />
                      <Link href={vAreas.length === 0 ? `/locations/playing-areas/new?venueId=${v.id}` : `/locations/venues/${v.id}`}>
                        <Button variant={vAreas.length === 0 ? "primary" : "secondary"} className="h-7 text-xs font-bold px-3">
                          {vAreas.length === 0 ? "Add Playing Area" : "Review Venue"}
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
