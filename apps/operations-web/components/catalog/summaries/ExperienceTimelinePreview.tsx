"use client";

import { Clock } from "lucide-react";

export interface ExperienceTimelinePreviewProps {
  duration: number; // minutes
  arrivalBuffer?: number;
  checkInWindow?: number;
  revealHoursBefore?: number;
}

export function ExperienceTimelinePreview({
  duration = 90,
  arrivalBuffer = 15,
  checkInWindow = 30,
  revealHoursBefore = 2,
}: ExperienceTimelinePreviewProps) {
  return (
    <div className="glass p-4 rounded-xl border border-white/5 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold text-ink-lum flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-brand" />
          Event Time & Schedule Flow
        </span>
        <span className="font-mono text-ink-mut">{duration} min duration</span>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
        <div className="p-2 rounded-lg bg-black/40 border border-white/5 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Reveal Info</span>
          <span className="font-bold text-ink-lum">{revealHoursBefore}h before</span>
        </div>

        <div className="p-2 rounded-lg bg-black/40 border border-white/5 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Check-in Opens</span>
          <span className="font-bold text-ink-lum">{checkInWindow}m before</span>
        </div>

        <div className="p-2 rounded-lg bg-black/40 border border-white/5 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Arrival Buffer</span>
          <span className="font-bold text-ink-lum">{arrivalBuffer}m buffer</span>
        </div>

        <div className="p-2 rounded-lg bg-emerald-950/40 border border-emerald-800/40 space-y-0.5">
          <span className="text-[10px] text-emerald-400 uppercase block">Live Session</span>
          <span className="font-bold text-emerald-300">{duration}m main</span>
        </div>
      </div>
    </div>
  );
}
