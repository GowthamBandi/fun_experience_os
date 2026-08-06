"use client";

import Link from "next/link";
import { Building2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import type { VenueCompatResult } from "@/lib/prototype/selectors/catalog";

export interface ExperienceCompatibilitySummaryProps {
  compatVenues: VenueCompatResult[];
  playingAreaTypes?: string[];
}

export function ExperienceCompatibilitySummary({
  compatVenues = [],
  playingAreaTypes = ["Court", "Field"],
}: ExperienceCompatibilitySummaryProps) {
  const validVenues = compatVenues.filter((r) => r.compatible);

  return (
    <div className="glass p-4 rounded-xl border border-white/5 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold text-ink-lum flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-blue-400" />
          Where It Can Run
        </span>
        <span className="text-[10px] text-ink-sec font-mono">{validVenues.length} venue(s) matched</span>
      </div>

      <div className="text-[11px] text-ink-mut">
        Compatible Space Types:{" "}
        <span className="text-ink-lum font-medium">
          {playingAreaTypes.length > 0 ? playingAreaTypes.join(", ") : "General Indoor/Outdoor"}
        </span>
      </div>

      {validVenues.length === 0 ? (
        <div className="p-3 rounded-lg bg-amber-950/20 border border-amber-800/40 text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <span>No current playing area or venue matches this Experience.</span>
          <Link href="/locations/playing-areas">
            <Button variant="secondary" className="h-6 text-[10px] px-2 font-bold">
              Review Playing Areas
              <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {validVenues.slice(0, 4).map((v) => (
            <span key={v.venueId} className="px-2 py-0.5 rounded bg-black/40 border border-white/5 text-ink-sec text-[11px]">
              {v.venueName}
            </span>
          ))}
          {validVenues.length > 4 && (
            <span className="px-2 py-0.5 rounded bg-white/5 text-ink-mut text-[11px]">
              +{validVenues.length - 4} more
            </span>
          )}
        </div>
      )}
    </div>
  );
}
