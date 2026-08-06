"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/ui/PageHeader";
import { SetupBackNavigation, SetupStatusBadge } from "@/components/setup/shared";
import { selectSetupHealth } from "@/lib/prototype/selectors/setup";
import { Building2, Layers, MapPin, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export default function LocationsHubPage() {
  const { state, territory } = useStore();

  const venues = state.venues ?? [];
  const playingAreas = state.playingAreas ?? [];
  const cities = state.cities ?? [];
  const health = selectSetupHealth(state);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <SetupBackNavigation label="Back to Setup" href="/setup" />

      <PageHeader
        overline={`Locations · ${territory.name}`}
        title="Locations Portal"
        sub="Manage physical spaces, from broad city regions down to exact courts used for events."
        right={<SetupStatusBadge status={health.status} />}
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass p-5 rounded-2xl border border-white/5 space-y-1">
          <p className="text-[10px] text-ink-mut uppercase font-semibold">Active Cities</p>
          <p className="text-3xl font-bold text-ink-lum">{cities.length}</p>
          <p className="text-xs text-ink-sec">Urban centers</p>
        </div>
        <div className="glass p-5 rounded-2xl border border-white/5 space-y-1">
          <p className="text-[10px] text-ink-mut uppercase font-semibold">Venues & Facilities</p>
          <p className="text-3xl font-bold text-ink-lum">{venues.length}</p>
          <p className="text-xs text-ink-sec">Physical locations</p>
        </div>
        <div className="glass p-5 rounded-2xl border border-white/5 space-y-1">
          <p className="text-[10px] text-ink-mut uppercase font-semibold">Playing Areas</p>
          <p className="text-3xl font-bold text-ink-lum">{playingAreas.length}</p>
          <p className="text-xs text-ink-sec">Courts, fields, or rooms</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link href="/locations/venues" className="group block">
          <div className="glass p-6 rounded-2xl border border-white/5 hover:border-white/10 transition-all h-full flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-purple-950/40 border border-purple-800/40 flex items-center justify-center text-purple-400">
                <Building2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-ink-lum group-hover:text-brand transition-colors">Venues</h3>
              <p className="text-xs text-ink-sec leading-relaxed">
                Manage physical facilities (arenas, clubs, turfs) where customers arrive for events.
              </p>
            </div>
            <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs text-brand font-bold">
              <span>View & Create Venues ({venues.length})</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </Link>

        <Link href="/locations/playing-areas" className="group block">
          <div className="glass p-6 rounded-2xl border border-white/5 hover:border-white/10 transition-all h-full flex flex-col justify-between space-y-4">
            <div className="space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
                <Layers className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-ink-lum group-hover:text-brand transition-colors">Playing Areas</h3>
              <p className="text-xs text-ink-sec leading-relaxed">
                Manage the exact courts, fields, rooms, halls, or pools used during sessions.
              </p>
            </div>
            <div className="pt-3 border-t border-white/5 flex items-center justify-between text-xs text-emerald-400 font-bold">
              <span>View & Add Playing Areas ({playingAreas.length})</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}
