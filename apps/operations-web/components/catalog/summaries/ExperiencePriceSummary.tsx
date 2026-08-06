"use client";

import { IndianRupee } from "lucide-react";

export interface ExperiencePriceSummaryProps {
  basePrice: number;
  minParticipants: number;
  targetParticipants: number;
  venueCost?: number;
  equipmentCost?: number;
  staffingCost?: number;
}

export function ExperiencePriceSummary({
  basePrice = 499,
  minParticipants = 8,
  targetParticipants = 16,
  venueCost = 0,
  equipmentCost = 0,
  staffingCost = 0,
}: ExperiencePriceSummaryProps) {
  const fixedCosts = venueCost + equipmentCost + staffingCost;
  const breakEven = basePrice > 0 ? Math.ceil(fixedCosts / basePrice) : minParticipants;
  const targetRevenue = basePrice * targetParticipants;

  return (
    <div className="glass p-4 rounded-xl border border-white/5 space-y-3 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-bold text-ink-lum flex items-center gap-1.5">
          <IndianRupee className="w-3.5 h-3.5 text-emerald-400" />
          Default Pricing & Revenue
        </span>
        <span className="text-[10px] text-ink-mut font-medium">Reusable Defaults</span>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
        <div className="p-2 rounded-lg bg-black/40 border border-white/5 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Default Price</span>
          <span className="font-bold text-emerald-400 text-sm">₹{basePrice}</span>
        </div>

        <div className="p-2 rounded-lg bg-black/40 border border-white/5 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Est. Break-Even</span>
          <span className="font-bold text-ink-lum">{breakEven} pax</span>
        </div>

        <div className="p-2 rounded-lg bg-black/40 border border-white/5 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Est. Target Revenue</span>
          <span className="font-bold text-ink-lum">₹{targetRevenue}</span>
        </div>
      </div>

      <p className="text-[11px] text-ink-mut italic">
        * Default price and revenue estimates can be adjusted when scheduling a specific event.
      </p>
    </div>
  );
}
