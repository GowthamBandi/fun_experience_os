"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectTodayStaffRoster } from "@/lib/prototype/selectors/staff";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffBackNavigation, StaffStatusBadge } from "@/components/staff";
import { Button } from "@/components/ui/primitives";
import { ArrowRight, MapPin, Clock, Calendar } from "lucide-react";

export default function TodaysWorkPage() {
  const { state, territory } = useStore();
  const roster = selectTodayStaffRoster(state);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <StaffBackNavigation label="Back to Staff Schedule" href="/staffing" />

      <PageHeader
        overline={`Staff Operations · ${territory.name}`}
        title="Today’s Work"
        sub="See where every staff member is working today. Where is everyone working today?"
      />

      <div className="glass p-6 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <h3 className="font-bold text-ink-lum text-sm">Operational Departures Board — Today&apos;s Roster</h3>
          <span className="text-xs text-ink-mut font-mono">{roster.length} Staff On Roster</span>
        </div>

        {/* Operational Roster Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-ink-mut uppercase text-[10px] tracking-wider">
                <th className="py-3 px-3">Staff Name</th>
                <th className="py-3 px-3">Role</th>
                <th className="py-3 px-3">Current Assignment</th>
                <th className="py-3 px-3">Venue Location</th>
                <th className="py-3 px-3">Shift Hours</th>
                <th className="py-3 px-3">Check-In Status</th>
                <th className="py-3 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roster.map((s) => {
                const isWorking = s.status === "assigned" || s.status === "checked-in";

                return (
                  <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3.5 px-3 font-bold text-ink-lum">{s.name}</td>
                    <td className="py-3.5 px-3 text-purple-700 font-semibold">{s.roleLabel}</td>
                    <td className="py-3.5 px-3 text-ink-sec">{s.assignment}</td>
                    <td className="py-3.5 px-3 text-ink-sec">{s.venueName}</td>
                    <td className="py-3.5 px-3 font-mono text-ink-mut">{s.shiftFrom} - {s.shiftTo}</td>
                    <td className="py-3.5 px-3">
                      <StaffStatusBadge status={s.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-3 text-right">
                      <Link href={isWorking && s.currentSessionId ? `/missions/${s.currentSessionId}/overview` : `/people/staff/${s.id}`}>
                        <Button variant="secondary" className="h-7 text-xs font-bold px-2.5">
                          {isWorking ? "View Event" : "View Profile"}
                          <ArrowRight className="w-3 h-3 ml-1" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
