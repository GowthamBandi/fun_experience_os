"use client";

import { Info } from "lucide-react";

export function StaffHelpPanel() {
  return (
    <div className="glass p-5 rounded-2xl border border-purple-300 bg-purple-100 text-xs space-y-3">
      <div className="flex items-center gap-2 text-purple-700 font-bold">
        <Info className="w-4 h-4 text-purple-600 shrink-0" />
        <span>Staff vs. Participants — What is the Difference?</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-ink-sec">
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
          <span className="font-bold text-brand block border-b border-slate-200 pb-1">
            👥 Staff (Operations Team)
          </span>
          <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-ink-sec">
            <li>People who organize, host, referee, and run events</li>
            <li>Assigned roles: Lead Coordinator, Safety Officer, Referee</li>
            <li>Check in to work on specific event shifts</li>
            <li>Managed under Staff Schedule & Availability</li>
          </ul>
        </div>

        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
          <span className="font-bold text-emerald-600 block border-b border-slate-200 pb-1">
            🎟️ Participants (Customers)
          </span>
          <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-ink-sec">
            <li>People who joined booked experience sessions</li>
            <li>Assigned operational identities & team aliases</li>
            <li>Check in to play/participate in events</li>
            <li>Managed under Bookings & Identity Patterns</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
