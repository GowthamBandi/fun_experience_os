"use client";

import { use } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { SetupBackNavigation, SetupStatusBadge } from "@/components/setup/shared";
import { Button, StatusChip } from "@/components/ui/primitives";
import { Layers, Building2, MapPin, ShieldCheck, ArrowRight } from "lucide-react";

export default function PlayingAreaDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: areaId } = use(params);
  const { state } = useStore();

  const playingAreas = state.playingAreas ?? [];
  const venues = state.venues ?? [];
  const cities = state.cities ?? [];

  const area = playingAreas.find((pa) => pa.id === areaId);

  if (!area) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-lum">Playing Area Not Found</h2>
        <p className="text-xs text-ink-sec">The requested playing area does not exist in prototype state.</p>
        <Link href="/locations/playing-areas">
          <Button variant="primary">Return to Playing Areas</Button>
        </Link>
      </div>
    );
  }

  const venue = venues.find((v) => v.id === area.venueId);
  const city = cities.find((c) => c.id === venue?.cityId);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <SetupBackNavigation
        label="Back to Playing Areas"
        href="/locations/playing-areas"
        breadcrumbs={[
          { label: "Setup", href: "/setup" },
          { label: "Playing Areas", href: "/locations/playing-areas" },
          { label: area.name, href: `/locations/playing-areas/${area.id}` },
        ]}
      />

      <PageHeader
        overline={`Playing Area Details · ${venue?.name || "Venue"}`}
        title={area.name}
        sub={`Activity space inside ${venue?.name || "Venue"}, ${city?.name || "City"}.`}
        right={
          <div className="flex items-center gap-3">
            <SetupStatusBadge status="complete" />
            <Link href="/catalog/templates/new">
              <Button variant="primary" className="font-bold text-xs">
                Create Experience Template
              </Button>
            </Link>
          </div>
        }
      />

      {/* Parent Venue Card */}
      <div className="p-4 rounded-xl glass border border-white/5 text-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-ink-sec">
          <Building2 className="w-4 h-4 text-purple-400" />
          <span>Parent Venue:</span>
          {venue ? (
            <Link href={`/locations/venues/${venue.id}`} className="text-brand font-semibold hover:underline">
              {venue.name}
            </Link>
          ) : (
            <span className="text-ink-mut">Unknown</span>
          )}
          <span className="text-ink-mut">|</span>
          <span>City:</span>
          {city ? (
            <Link href={`/cities/${city.id}`} className="text-brand font-semibold hover:underline">
              {city.name}
            </Link>
          ) : (
            <span className="text-ink-mut">Unknown</span>
          )}
        </div>
        <StatusChip value={area.status} />
      </div>

      {/* Detail Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass p-5 rounded-2xl border border-white/5 space-y-2">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Max Player Capacity</span>
          <p className="text-3xl font-bold text-ink-lum">{area.maxCapacity} <span className="text-xs font-normal text-ink-sec">players</span></p>
          <p className="text-xs text-ink-sec">Spectator capacity: {area.spectatorCapacity || 10} pax</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-white/5 space-y-2">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Staff Required</span>
          <p className="text-3xl font-bold text-ink-lum">{area.staffCapacity || 1} <span className="text-xs font-normal text-ink-sec">staff</span></p>
          <p className="text-xs text-ink-sec">Operational crew size</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-white/5 space-y-2">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Operating Hours</span>
          <p className="text-base font-bold text-ink-lum mt-1">{area.operatingHours || "06:00 AM - 10:00 PM"}</p>
          <p className="text-xs text-ink-sec">Standard slot hours</p>
        </div>
      </div>

      {/* Activities & Equipment */}
      <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
        <h3 className="text-sm font-bold text-ink-lum flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Compatible Activities & Equipment</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-ink-sec">
          <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-1">
            <span className="text-ink-mut block font-semibold">Compatible Activities:</span>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(area.activityCompatibility ?? ["General Purpose"]).map((act, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 font-medium">
                  {act}
                </span>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-xl bg-black/30 border border-white/5 space-y-1">
            <span className="text-ink-mut block font-semibold">Available Equipment:</span>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {(area.equipment ?? ["Standard Gear"]).map((eq, i) => (
                <span key={i} className="px-2 py-0.5 rounded bg-white/5 text-ink-sec border border-white/10">
                  {eq}
                </span>
              ))}
            </div>
          </div>
        </div>

        {area.restrictions && (
          <div className="p-4 rounded-xl bg-amber-950/20 border border-amber-800/40 text-amber-200 text-xs">
            <strong>Operating Restrictions:</strong> {area.restrictions}
          </div>
        )}
      </div>
    </div>
  );
}
