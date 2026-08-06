"use client";

import { use } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { SetupBackNavigation, SetupStatusBadge, SetupEmptyState } from "@/components/setup/shared";
import { Button, StatusChip } from "@/components/ui/primitives";
import { MapPin, Building2, Plus, ArrowRight } from "lucide-react";

export default function CityDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: cityId } = use(params);
  const { state } = useStore();

  const cities = state.cities ?? [];
  const territories = state.territories ?? [];
  const franchises = state.franchises ?? [];
  const venues = state.venues ?? [];
  const playingAreas = state.playingAreas ?? [];

  const city = cities.find((c) => c.id === cityId);

  if (!city) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-lum">City Not Found</h2>
        <p className="text-xs text-ink-sec">The requested city does not exist in prototype state.</p>
        <Link href="/cities">
          <Button variant="primary">Return to Cities</Button>
        </Link>
      </div>
    );
  }

  const t = territories.find((tr) => tr.id === city.territoryId);
  const f = franchises.find((fr) => fr.id === t?.franchiseId);
  const cVenues = venues.filter((v) => v.cityId === city.id || v.territoryId === city.territoryId);
  const cAreas = playingAreas.filter((pa) => cVenues.some((v) => v.id === pa.venueId));

  let status: "complete" | "needs-attention" | "incomplete" = "complete";
  if (cVenues.length === 0) status = "incomplete";
  else if (cAreas.length === 0) status = "needs-attention";

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <SetupBackNavigation
        label="Back to Cities"
        href="/cities"
        breadcrumbs={[
          { label: "Setup", href: "/setup" },
          { label: "Cities", href: "/cities" },
          { label: city.name, href: `/cities/${city.id}` },
        ]}
      />

      <PageHeader
        overline={`City Details · ${t?.name || "Territory"}`}
        title={city.name}
        sub={`City located in ${city.state}. Managed under ${t?.name || "Territory"} (${f?.name || "Franchise"}).`}
        right={
          <div className="flex items-center gap-3">
            <SetupStatusBadge status={status} />
            <Link href={`/locations/venues/new?cityId=${city.id}`}>
              <Button variant="primary" className="font-bold">
                <Plus className="w-4 h-4 mr-1" />
                Create Venue
              </Button>
            </Link>
          </div>
        }
      />

      {/* Parent Territory & Franchise Link */}
      <div className="p-4 rounded-xl glass border border-white/5 text-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-ink-sec">
          <MapPin className="w-4 h-4 text-emerald-400" />
          <span>Parent Territory:</span>
          {t ? (
            <Link href={`/territories/${t.id}`} className="text-brand font-semibold hover:underline">
              {t.name}
            </Link>
          ) : (
            <span className="text-ink-mut">Not assigned</span>
          )}
          <span className="text-ink-mut">|</span>
          <span>Franchise:</span>
          {f ? (
            <Link href={`/franchises/${f.id}`} className="text-brand font-semibold hover:underline">
              {f.name}
            </Link>
          ) : (
            <span className="text-ink-mut">Not assigned</span>
          )}
        </div>
        <StatusChip value={city.status} />
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass p-4 rounded-xl border border-white/5 space-y-1">
          <p className="text-[10px] text-ink-mut uppercase font-semibold">Venues in City</p>
          <p className="text-2xl font-bold text-ink-lum">{cVenues.length}</p>
          <p className="text-[11px] text-ink-sec">Physical locations</p>
        </div>

        <div className="glass p-4 rounded-xl border border-white/5 space-y-1">
          <p className="text-[10px] text-ink-mut uppercase font-semibold">Playing Areas</p>
          <p className="text-2xl font-bold text-ink-lum">{cAreas.length}</p>
          <p className="text-[11px] text-ink-sec">Courts, fields, or rooms</p>
        </div>

        <div className="glass p-4 rounded-xl border border-white/5 space-y-1">
          <p className="text-[10px] text-ink-mut uppercase font-semibold">Setup Readiness</p>
          <div className="mt-1">
            <SetupStatusBadge status={status} />
          </div>
          <p className="text-[11px] text-ink-sec mt-1">
            {cVenues.length === 0 ? "Create venue first" : "Ready to schedule"}
          </p>
        </div>
      </div>

      {/* Venues in City */}
      <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h3 className="text-base font-bold text-ink-lum">Venues in {city.name}</h3>
            <p className="text-xs text-ink-sec">Physical locations registered in this city.</p>
          </div>
          <Link href={`/locations/venues/new?cityId=${city.id}`}>
            <Button variant="primary" className="font-bold text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Create Venue
            </Button>
          </Link>
        </div>

        {cVenues.length === 0 ? (
          <SetupEmptyState
            title="No Venues Created"
            message="No venue has been added to this city yet. Click below to add a venue location."
            actionLabel="Create Venue"
            actionHref={`/locations/venues/new?cityId=${city.id}`}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {cVenues.map((v) => {
              const vAreas = playingAreas.filter((pa) => pa.venueId === v.id);
              return (
                <div key={v.id} className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-ink-lum">{v.name}</h4>
                      <p className="text-xs text-ink-mut">{v.address || "Main address"}</p>
                    </div>
                    <StatusChip value={v.status} />
                  </div>

                  <div className="flex items-center justify-between text-xs border-t border-white/5 pt-2">
                    <span className="text-ink-sec font-medium">{vAreas.length} playing areas</span>
                    <Link href={`/locations/venues/${v.id}`}>
                      <Button variant="secondary" className="h-7 text-xs px-2.5">
                        Manage Venue <ArrowRight className="w-3 h-3 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
