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
import { Layers, Building2, MapPin, ArrowRight } from "lucide-react";

export default function PlayingAreasPage() {
  const router = useRouter();
  const { state, territory, canAccess } = useStore();
  const [searchQuery, setSearchQuery] = useState("");

  const playingAreas = state.playingAreas ?? [];
  const venues = state.venues ?? [];
  const cities = state.cities ?? [];
  const templates = state.templates ?? [];

  const filteredAreas = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return playingAreas;
    return playingAreas.filter(
      (pa) =>
        pa.name.toLowerCase().includes(q) ||
        (venues.find((v) => v.id === pa.venueId)?.name ?? "").toLowerCase().includes(q)
    );
  }, [playingAreas, venues, searchQuery]);

  if (!canAccess("/locations")) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <PermissionDenied module="Playing Areas" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <SetupBackNavigation label="Back to Setup" href="/setup" />

      <PageHeader
        overline={`Setup · ${territory.name}`}
        title="Playing Areas"
        sub="Manage the exact courts, fields, rooms, halls, or activity spaces used by events. Which exact space will customers use?"
        right={
          <SetupPrimaryAction
            label="Add Playing Area"
            href="/locations/playing-areas/new"
            allowedRoles={["platform-owner", "super-admin", "regional-partner", "city-manager", "venue-manager"]}
          />
        }
      />

      <div className="glass p-5 rounded-2xl border border-white/5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-semibold text-ink-lum">Activity Spaces</h3>
            <p className="text-xs text-ink-mut">Exact court, field, or room resources inside venues.</p>
          </div>
          <div className="w-full sm:w-72">
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search court, venue, activity..." />
          </div>
        </div>

        {playingAreas.length === 0 ? (
          <SetupEmptyState
            title="No Playing Areas Registered"
            message="Add your first court, field, room, or hall inside a venue to complete your operating setup."
            actionLabel="Add Playing Area"
            actionHref="/locations/playing-areas/new"
          />
        ) : filteredAreas.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-mut">No playing areas match your search filter.</div>
        ) : (
          <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredAreas.map((pa) => {
              const venue = venues.find((v) => v.id === pa.venueId);
              const city = cities.find((c) => c.id === venue?.cityId);
              const nextAction = templates.length === 0
                ? { label: "Create Template", href: "/catalog/templates/new" }
                : { label: "Schedule Event", href: "/missions" };

              return (
                <Item key={pa.id}>
                  <div className="glass p-5 rounded-2xl border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-1">
                          <h4 className="font-bold text-base text-ink-lum flex items-center gap-2">
                            <Layers className="w-4 h-4 text-emerald-400 shrink-0" />
                            <Link href={`/locations/playing-areas/${pa.id}`} className="hover:text-brand transition-colors">
                              {pa.name}
                            </Link>
                          </h4>
                          <p className="text-xs text-ink-mut">
                            {venue?.name || "Venue"} · {city?.name || "City"}
                          </p>
                        </div>
                        <SetupStatusBadge status="complete" size="sm" />
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs border-t border-white/5 pt-2">
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Max Capacity</span>
                          <span className="font-bold text-ink-lum">{pa.maxCapacity} pax</span>
                        </div>
                        <div className="bg-black/30 p-2 rounded-lg border border-white/5">
                          <span className="text-[10px] text-ink-mut block uppercase">Staff Capacity</span>
                          <span className="font-bold text-ink-lum">{pa.staffCapacity || 1} staff</span>
                        </div>
                      </div>

                      <div className="text-[11px] text-ink-sec truncate">
                        Activities: <span className="text-emerald-300 font-medium">{pa.activityCompatibility.join(", ") || "General"}</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                      <StatusChip value={pa.status} />
                      <Link href={nextAction.href}>
                        <Button variant="secondary" className="h-7 text-xs font-bold px-3">
                          {nextAction.label}
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
