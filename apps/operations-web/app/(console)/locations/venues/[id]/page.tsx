"use client";

import { use } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectVenueSetupHealth } from "@/lib/prototype/selectors/setup";
import { PageHeader } from "@/components/ui/PageHeader";
import { SetupBackNavigation, SetupStatusBadge, SetupEmptyState } from "@/components/setup/shared";
import { Button, StatusChip } from "@/components/ui/primitives";
import { Building2, MapPin, Plus, Clock, Users, ShieldCheck, ArrowRight } from "lucide-react";

export default function VenueDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: venueId } = use(params);
  const { state, territory } = useStore();

  const venues = state.venues ?? [];
  const cities = state.cities ?? [];
  const territories = state.territories ?? [];
  const playingAreas = state.playingAreas ?? [];
  const sessions = state.sessions ?? [];

  const venue = venues.find((v) => v.id === venueId);

  if (!venue) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-lum">Venue Not Found</h2>
        <p className="text-xs text-ink-sec">The requested venue location does not exist in the prototype state.</p>
        <Link href="/locations/venues">
          <Button variant="primary">Return to Venues</Button>
        </Link>
      </div>
    );
  }

  const city = cities.find((c) => c.id === venue.cityId);
  const t = territories.find((tr) => tr.id === venue.territoryId || tr.id === city?.territoryId);
  const vAreas = playingAreas.filter((pa) => pa.venueId === venue.id);
  const vSessions = sessions.filter((s) => s.venueId === venue.id);
  const health = selectVenueSetupHealth(state, venue.id);
  const combinedCapacity = vAreas.length > 0
    ? vAreas.reduce((sum, pa) => sum + (pa.maxCapacity || 0), 0)
    : venue.safetyCapacity || 0;

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <SetupBackNavigation
        label="Back to Venues"
        href="/locations/venues"
        breadcrumbs={[
          { label: "Setup", href: "/setup" },
          { label: "Venues", href: "/locations/venues" },
          { label: venue.name, href: `/locations/venues/${venue.id}` },
        ]}
      />

      <PageHeader
        overline={`Venue Details · ${city?.name || "City"}`}
        title={venue.name}
        sub={`Located in ${city?.name || "City"}, ${t?.name || "Territory"}. Physical location for events.`}
        right={
          <div className="flex items-center gap-3">
            <SetupStatusBadge status={health.status} />
            <Link href={`/locations/playing-areas/new?venueId=${venue.id}`}>
              <Button variant="primary" className="font-bold">
                <Plus className="w-4 h-4 mr-1" />
                Add Playing Area
              </Button>
            </Link>
          </div>
        }
      />

      {/* Parent Hierarchy Card */}
      <div className="p-4 rounded-xl glass border border-white/5 text-xs flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-ink-sec">
          <Building2 className="w-4 h-4 text-purple-400" />
          <span>Parent City:</span>
          {city ? (
            <Link href={`/cities/${city.id}`} className="text-brand font-semibold hover:underline">
              {city.name}
            </Link>
          ) : (
            <span className="text-ink-mut">Not assigned</span>
          )}
          <span className="text-ink-mut">|</span>
          <span>Territory:</span>
          {t ? (
            <Link href={`/territories/${t.id}`} className="text-brand font-semibold hover:underline">
              {t.name}
            </Link>
          ) : (
            <span className="text-ink-mut">Not assigned</span>
          )}
        </div>
        <StatusChip value={venue.status} />
      </div>

      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="glass p-4 rounded-xl border border-white/5 space-y-1">
          <p className="text-[10px] text-ink-mut uppercase font-semibold">Playing Areas</p>
          <p className="text-2xl font-bold text-ink-lum">{vAreas.length}</p>
          <p className="text-[11px] text-ink-sec">Courts, fields, or rooms</p>
        </div>

        <div className="glass p-4 rounded-xl border border-white/5 space-y-1">
          <p className="text-[10px] text-ink-mut uppercase font-semibold">Max Combined Capacity</p>
          <p className="text-2xl font-bold text-ink-lum">{combinedCapacity}</p>
          <p className="text-[11px] text-ink-sec">Maximum headcount</p>
        </div>

        <div className="glass p-4 rounded-xl border border-white/5 space-y-1">
          <p className="text-[10px] text-ink-mut uppercase font-semibold">Scheduled Events</p>
          <p className="text-2xl font-bold text-ink-lum">{vSessions.length}</p>
          <p className="text-[11px] text-ink-sec">Events assigned to venue</p>
        </div>

        <div className="glass p-4 rounded-xl border border-white/5 space-y-1">
          <p className="text-[10px] text-ink-mut uppercase font-semibold">Setup Readiness</p>
          <div className="mt-1">
            <SetupStatusBadge status={health.status} />
          </div>
          <p className="text-[11px] text-ink-sec mt-1">
            {health.playingAreaCount > 0 ? "Ready for scheduling" : "Needs playing area"}
          </p>
        </div>
      </div>

      {/* Playing Areas List Section */}
      <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
        <div className="flex items-center justify-between border-b border-white/5 pb-4">
          <div>
            <h3 className="text-base font-bold text-ink-lum">Playing Areas inside {venue.name}</h3>
            <p className="text-xs text-ink-sec">The exact courts, fields, rooms, or halls available for events.</p>
          </div>
          <Link href={`/locations/playing-areas/new?venueId=${venue.id}`}>
            <Button variant="primary" className="font-bold text-xs">
              <Plus className="w-3.5 h-3.5 mr-1" />
              Add Playing Area
            </Button>
          </Link>
        </div>

        {vAreas.length === 0 ? (
          <SetupEmptyState
            title="No Playing Areas Created"
            message="This venue currently has no court, room, field, or activity space registered. Events cannot be scheduled here until at least one playing area is added."
            actionLabel="Add Playing Area"
            actionHref={`/locations/playing-areas/new?venueId=${venue.id}`}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vAreas.map((pa) => (
              <div key={pa.id} className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-ink-lum">{pa.name}</h4>
                    <span className="text-[10px] text-emerald-400 font-medium uppercase tracking-wider">{pa.activityCompatibility.join(", ") || "General Purpose"}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-800/80">
                    {pa.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-ink-sec border-t border-white/5 pt-2">
                  <div>Capacity: <strong className="text-ink-lum">{pa.maxCapacity} pax</strong></div>
                  <div>Staff: <strong className="text-ink-lum">{pa.staffCapacity || 1} staff</strong></div>
                </div>

                <div className="flex justify-end pt-1">
                  <Link href={`/locations/playing-areas/${pa.id}`}>
                    <Button variant="secondary" className="h-7 text-xs px-2.5">
                      Manage Space <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Safety & Location Details */}
      <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
        <h3 className="text-sm font-semibold text-ink-lum flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Safety & Operating Details</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs text-ink-sec">
          <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1">
            <span className="text-ink-mut block">Address:</span>
            <span className="text-ink-lum font-medium">{venue.address || "Address not provided"}</span>
          </div>
          <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1">
            <span className="text-ink-mut block">Operating Hours:</span>
            <span className="text-ink-lum font-medium">{venue.operatingHours || "06:00 AM - 10:00 PM"}</span>
          </div>
          <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1">
            <span className="text-ink-mut block">Contact Person & Phone:</span>
            <span className="text-ink-lum font-medium">{venue.contactPerson} ({venue.contactNumber})</span>
          </div>
          <div className="p-3 rounded-xl bg-black/30 border border-white/5 space-y-1">
            <span className="text-ink-mut block">Emergency Exits & First Aid:</span>
            <span className="text-ink-lum font-medium">{venue.emergencyExits} · {venue.firstAid ? "First Aid Kit Verified" : "No kit logged"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
