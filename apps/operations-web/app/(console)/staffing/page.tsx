"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  selectStaffHealth,
  selectEventsMissingCoordinator,
  selectEventsMissingSafety,
  selectTodayStaffRoster,
  selectAvailableStaff,
} from "@/lib/prototype/selectors/staff";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button } from "@/components/ui/primitives";
import { Stagger, Item } from "@/components/motion/Motion";
import {
  StaffBackNavigation,
  StaffStatusBadge,
  StaffHealthBanner,
  StaffHelpPanel,
} from "@/components/staff";
import { UserCheck, AlertTriangle, ArrowRight, Calendar, Plus, Clock, MapPin } from "lucide-react";

export default function StaffSchedulePage() {
  const { state, territory, canAccess } = useStore();

  if (!canAccess("/staffing")) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <PermissionDenied module="Staff Schedule" />
      </div>
    );
  }

  const health = selectStaffHealth(state);
  const missingCoordinators = selectEventsMissingCoordinator(state);
  const missingSafety = selectEventsMissingSafety(state);
  const roster = selectTodayStaffRoster(state);
  const availableStaff = selectAvailableStaff(state);
  const sessions = state.sessions ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <StaffBackNavigation label="Back to People Directory" href="/people" />

      <PageHeader
        overline={`Staff Operations · ${territory.name}`}
        title="Staff Schedule"
        sub="See whether today’s events have the people they need. Are today’s events fully staffed?"
        right={
          <div className="flex items-center gap-3">
            <StaffStatusBadge status={health.status} />
            <Link href="/staffing/assign">
              <Button variant="primary" className="font-bold">
                <UserCheck className="w-4 h-4 mr-1" />
                Assign Staff
              </Button>
            </Link>
          </div>
        }
      />

      {/* Staff Health Banner */}
      <StaffHealthBanner
        status={health.status}
        label={health.label}
        workingToday={health.workingToday}
        assignedCount={health.assignedCount}
        checkedInCount={health.checkedInCount}
        lateCount={health.lateCount}
        eventsMissingCoordinatorCount={health.eventsMissingCoordinatorCount}
        eventsMissingSafetyCount={health.eventsMissingSafetyCount}
        actionHref="/staffing/assign"
        actionLabel="Assign Staff to Events"
      />

      {/* Operational KPI Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center text-xs">
        <div className="glass p-4 rounded-xl border border-slate-200 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase block">Working Today</span>
          <span className="font-bold text-blue-600 text-lg">{health.workingToday}</span>
        </div>

        <div className="glass p-4 rounded-xl border border-slate-200 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase block">Assigned</span>
          <span className="font-bold text-ink-lum text-lg">{health.assignedCount}</span>
        </div>

        <div className="glass p-4 rounded-xl border border-slate-200 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase block">Need Assignment</span>
          <span className="font-bold text-amber-600 text-lg">{health.unassignedCount}</span>
        </div>

        <div className="glass p-4 rounded-xl border border-slate-200 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase block">Checked In</span>
          <span className="font-bold text-emerald-600 text-lg">{health.checkedInCount}</span>
        </div>

        <div className="glass p-4 rounded-xl border border-slate-200 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase block">Late Staff</span>
          <span className="font-bold text-rose-600 text-lg">{health.lateCount}</span>
        </div>

        <div className="glass p-4 rounded-xl border border-slate-200 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase block">Missing Coordinator</span>
          <span className="font-bold text-rose-600 text-lg">{health.eventsMissingCoordinatorCount}</span>
        </div>

        <div className="glass p-4 rounded-xl border border-slate-200 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase block">Missing Safety</span>
          <span className="font-bold text-amber-600 text-lg">{health.eventsMissingSafetyCount}</span>
        </div>
      </div>

      {/* Main Operational Sections */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section 1: Events Needing Staff */}
        <div className="glass p-5 rounded-2xl border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-bold text-ink-lum text-base flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>1. Events Needing Staff</span>
              </h3>
              <p className="text-xs text-ink-sec">Events with missing coordinators or safety staff.</p>
            </div>
            <Link href="/staffing/assign">
              <Button variant="secondary" className="h-7 text-xs font-bold px-2.5">
                Assign Staff <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>

          {missingCoordinators.length === 0 && missingSafety.length === 0 ? (
            <div className="p-6 text-center text-xs text-emerald-700 bg-emerald-100 rounded-xl border border-emerald-300">
              ✓ All scheduled events have required lead coordinators and safety leads.
            </div>
          ) : (
            <div className="space-y-3">
              {missingCoordinators.map((s) => (
                <div key={s.id} className="p-3 rounded-xl bg-rose-100 border border-rose-300 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-rose-700 block">{s.date} @ {s.startTime}</span>
                    <span className="text-ink-sec text-[11px]">Event #{s.id} · Missing Lead Coordinator</span>
                  </div>
                  <Link href={`/staffing/assign?sessionId=${s.id}`}>
                    <Button variant="secondary" className="h-6 text-[11px] font-bold px-2">
                      Assign Lead
                    </Button>
                  </Link>
                </div>
              ))}

              {missingSafety.map((s) => (
                <div key={s.id} className="p-3 rounded-xl bg-amber-100 border border-amber-300 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-amber-700 block">{s.date} @ {s.startTime}</span>
                    <span className="text-ink-sec text-[11px]">Event #{s.id} · Missing Safety Lead</span>
                  </div>
                  <Link href={`/staffing/assign?sessionId=${s.id}`}>
                    <Button variant="secondary" className="h-6 text-[11px] font-bold px-2">
                      Assign Safety
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section 2: Available Staff */}
        <div className="glass p-5 rounded-2xl border border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <div>
              <h3 className="font-bold text-ink-lum text-base flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-emerald-600" />
                <span>2. Available Staff ({availableStaff.length})</span>
              </h3>
              <p className="text-xs text-ink-sec">Staff members ready for immediate assignment.</p>
            </div>
            <Link href="/staffing/availability">
              <Button variant="secondary" className="h-7 text-xs font-bold px-2.5">
                View Availability <ArrowRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>

          {availableStaff.length === 0 ? (
            <div className="p-6 text-center text-xs text-ink-mut">No available staff members.</div>
          ) : (
            <div className="space-y-2">
              {availableStaff.slice(0, 4).map((staff) => (
                <div key={staff.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-ink-lum block">{staff.name}</span>
                    <span className="text-purple-700 text-[11px] font-semibold">{staff.roleLabel}</span>
                  </div>
                  <Link href={`/people/staff/${staff.id}`}>
                    <Button variant="ghost" className="h-6 text-[11px] px-2 font-bold text-brand">
                      View Profile <ArrowRight className="w-3 h-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
