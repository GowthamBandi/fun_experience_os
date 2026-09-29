"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectStaffDirectory } from "@/lib/prototype/selectors/staff";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffBackNavigation, StaffStatusBadge } from "@/components/staff";
import { Button } from "@/components/ui/primitives";
import { FilterRail } from "@/components/ui/fields";
import { Calendar as CalendarIcon, List, UserCheck, MapPin, Clock } from "lucide-react";

export default function StaffAvailabilityPage() {
  const { state, territory } = useStore();
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");

  const staffList = selectStaffDirectory(state);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <StaffBackNavigation label="Back to Staff Schedule" href="/staffing" />

      <PageHeader
        overline={`Staff Operations · ${territory.name}`}
        title="Availability"
        sub="See who is free, assigned, off, or unavailable. Who is free at this time?"
        right={
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-black/40 border border-white/10 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setViewMode("calendar")}
                className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors ${
                  viewMode === "calendar" ? "bg-brand text-slate-950" : "text-ink-sec hover:text-ink-lum"
                }`}
              >
                <CalendarIcon className="w-3.5 h-3.5" />
                Calendar
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors ${
                  viewMode === "list" ? "bg-brand text-slate-950" : "text-ink-sec hover:text-ink-lum"
                }`}
              >
                <List className="w-3.5 h-3.5" />
                List
              </button>
            </div>

            <Link href="/staffing/assign">
              <Button variant="primary" className="font-bold text-xs">
                <UserCheck className="w-3.5 h-3.5 mr-1" />
                Assign Available Staff
              </Button>
            </Link>
          </div>
        }
      />

      {/* Legend */}
      <div className="glass p-4 rounded-2xl border border-white/5 flex flex-wrap items-center justify-between gap-4 text-xs">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="font-medium text-emerald-400">Available</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="font-medium text-blue-400">Assigned</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-rose-500" />
            <span className="font-medium text-rose-400">Off Duty</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full bg-white/20" />
            <span className="font-medium text-ink-mut">Outside Shift</span>
          </span>
        </div>
      </div>

      {viewMode === "calendar" ? (
        <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 className="text-sm font-bold text-ink-lum">Today&apos;s Shift Availability Timeline</h3>

          <div className="space-y-3">
            {staffList.map((s) => (
              <div key={s.id} className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink-lum text-sm">{s.name}</span>
                    <span className="text-purple-300 font-semibold">{s.roleLabel}</span>
                  </div>
                  <StaffStatusBadge status={s.status} size="sm" />
                </div>

                <div className="grid grid-cols-6 gap-1.5 pt-1 text-center font-mono text-[11px]">
                  <div className="p-2 rounded bg-black/30 text-ink-mut">17:00</div>
                  <div className={`p-2 rounded font-bold ${s.status === "available" ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/40" : "bg-blue-950/60 text-blue-300 border border-blue-800/40"}`}>
                    18:00 (Shift Start)
                  </div>
                  <div className={`p-2 rounded font-bold ${s.status === "available" ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/40" : "bg-blue-950/60 text-blue-300 border border-blue-800/40"}`}>
                    19:00
                  </div>
                  <div className={`p-2 rounded font-bold ${s.status === "available" ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/40" : "bg-blue-950/60 text-blue-300 border border-blue-800/40"}`}>
                    20:00
                  </div>
                  <div className={`p-2 rounded font-bold ${s.status === "available" ? "bg-emerald-950/60 text-emerald-300 border border-emerald-800/40" : "bg-blue-950/60 text-blue-300 border border-blue-800/40"}`}>
                    21:00
                  </div>
                  <div className="p-2 rounded bg-black/30 text-ink-mut">22:00 (Shift End)</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="glass p-6 rounded-2xl border border-white/5 space-y-3">
          {staffList.map((s) => (
            <div key={s.id} className="p-4 rounded-xl bg-black/40 border border-white/5 flex items-center justify-between text-xs">
              <div>
                <span className="font-bold text-ink-lum block text-sm">{s.name}</span>
                <span className="text-purple-300">{s.roleLabel} · {s.venueName}</span>
              </div>
              <StaffStatusBadge status={s.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
