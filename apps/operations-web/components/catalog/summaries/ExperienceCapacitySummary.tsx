"use client";

import { Users } from "lucide-react";

export interface ExperienceCapacitySummaryProps {
  minParticipants: number;
  targetParticipants: number;
  maxParticipants: number;
}

export function ExperienceCapacitySummary({
  minParticipants = 8,
  targetParticipants = 16,
  maxParticipants = 20,
}: ExperienceCapacitySummaryProps) {
  return (
    <div className="glass p-4 rounded-xl border border-white/5 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold text-ink-lum flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-purple-400" />
          Default Group Size Policy
        </span>
        <span className="font-mono text-ink-mut">
          {minParticipants} - {maxParticipants} pax
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
        <div className="p-2 rounded-lg bg-black/40 border border-white/5 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Minimum Needed</span>
          <span className="font-bold text-ink-lum">{minParticipants} pax</span>
        </div>

        <div className="p-2 rounded-lg bg-black/40 border border-white/5 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Ideal Group Size</span>
          <span className="font-bold text-purple-300">{targetParticipants} pax</span>
        </div>

        <div className="p-2 rounded-lg bg-black/40 border border-white/5 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Maximum Group Size</span>
          <span className="font-bold text-ink-lum">{maxParticipants} pax</span>
        </div>
      </div>
    </div>
  );
}
