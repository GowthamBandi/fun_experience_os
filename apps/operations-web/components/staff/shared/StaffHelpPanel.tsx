"use client";

import { Ticket, UserCog } from "lucide-react";

/** Explains the difference between staff and participants. */
export function StaffHelpPanel() {
  const cols = [
    { icon: UserCog, title: "Staff", tone: "bg-brand-subtle text-brand", lines: ["Run sessions: lead, safety, referee, equipment", "Assigned to sessions in Staffing", "Checked in when they arrive for a shift"] },
    { icon: Ticket, title: "Participants", tone: "bg-emerald-50 text-emerald-600", lines: ["Customers who booked a session", "Shown by temporary identity until reveal", "Checked in by staff on arrival"] },
  ];
  return (
    <section className="grid gap-4 rounded-panel border border-edge bg-white p-5 shadow-panel md:grid-cols-2">
      {cols.map((c) => (
        <div key={c.title} className="flex gap-3">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${c.tone}`}>
            <c.icon className="h-4 w-4" />
          </span>
          <div>
            <p className="text-sm font-semibold text-ink-lum">{c.title}</p>
            <ul className="mt-1 space-y-0.5 text-[13px] leading-5 text-ink-mut">
              {c.lines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </section>
  );
}
