"use client";

import { Info } from "lucide-react";

export function CatalogHelpPanel() {
  return (
    <div className="glass p-5 rounded-2xl border border-blue-300 bg-blue-100 text-xs space-y-3">
      <div className="flex items-center gap-2 text-blue-700 font-bold">
        <Info className="w-4 h-4 text-blue-600 shrink-0" />
        <span>Experience Template vs. Scheduled Event — What Belongs Where?</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-ink-sec">
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
          <span className="font-bold text-emerald-600 block border-b border-slate-200 pb-1">
            Set Once in Experience:
          </span>
          <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-ink-sec">
            <li>What customers join (Activity & Name)</li>
            <li>Default duration & group size</li>
            <li>Default price & fee policies</li>
            <li>Staffing requirements</li>
            <li>Location & playing area compatibility</li>
            <li>Reveal rules & participant ID format</li>
            <li>Result type & safety checklist</li>
          </ul>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
          <span className="font-bold text-purple-700 block border-b border-slate-200 pb-1">
            Choose for each scheduled Event:
          </span>
          <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-ink-sec">
            <li>Actual date & time</li>
            <li>Actual venue & playing area</li>
            <li>Final price & group size override</li>
            <li>Assigned staff members</li>
            <li>Booking open/close dates</li>
            <li>Live operational overrides</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
