"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  selectStaffHealth,
  selectEventsMissingCoordinator,
  selectEventsMissingSafety,
  selectLateStaff,
} from "@/lib/prototype/selectors/staff";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffBackNavigation, StaffStatusBadge } from "@/components/staff";
import { Button } from "@/components/ui/primitives";
import { AlertTriangle, ShieldAlert, UserX, ArrowRight, CheckCircle2 } from "lucide-react";

export default function StaffHealthPage() {
  const { state, territory } = useStore();

  const health = selectStaffHealth(state);
  const missingCoordinators = selectEventsMissingCoordinator(state);
  const missingSafety = selectEventsMissingSafety(state);
  const lateStaff = selectLateStaff(state);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <StaffBackNavigation label="Back to Staff Schedule" href="/staffing" />

      <PageHeader
        overline={`Staff Operations · ${territory.name}`}
        title="Staff Readiness"
        sub="Fix staffing problems before events begin. Which staffing problems must be fixed now?"
      />

      <div className="space-y-4">
        {/* Card 1: Missing Lead Coordinator */}
        {missingCoordinators.length > 0 && (
          <div className="glass p-6 rounded-2xl border border-rose-300 bg-rose-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-600 font-bold">
                  <UserX className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-rose-700">
                    {missingCoordinators.length} Event(s) Missing Lead Coordinator
                  </h3>
                  <p className="text-xs text-ink-sec">Events cannot run without an assigned Lead Coordinator.</p>
                </div>
              </div>

              <Link href="/staffing/assign">
                <Button variant="primary" className="font-bold text-xs bg-rose-500 text-slate-950">
                  Fix Problems <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-xs font-mono">
              {missingCoordinators.map((s) => (
                <div key={s.id} className="text-rose-700">
                  • Event #{s.id} ({s.date} @ {s.startTime}) — Needs Lead Coordinator
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Card 2: Missing Safety Officer */}
        {missingSafety.length > 0 && (
          <div className="glass p-6 rounded-2xl border border-amber-300 bg-amber-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 font-bold">
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-amber-700">
                    {missingSafety.length} Event(s) Missing Safety Lead
                  </h3>
                  <p className="text-xs text-ink-sec">Events require a dedicated safety officer for emergency compliance.</p>
                </div>
              </div>

              <Link href="/staffing/assign">
                <Button variant="secondary" className="font-bold text-xs border-amber-300 text-amber-700">
                  Fix Problems <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-xs font-mono">
              {missingSafety.map((s) => (
                <div key={s.id} className="text-amber-700">
                  • Event #{s.id} ({s.date} @ {s.startTime}) — Needs Safety Lead
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Card 3: Late Staff */}
        {lateStaff.length > 0 && (
          <div className="glass p-6 rounded-2xl border border-amber-300 bg-amber-100 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center text-amber-600 font-bold">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-amber-700">
                    {lateStaff.length} Staff Member(s) Marked Late
                  </h3>
                  <p className="text-xs text-ink-sec">Staff members have passed expected shift start time without check-in.</p>
                </div>
              </div>

              <Link href="/staffing/check-in">
                <Button variant="secondary" className="font-bold text-xs">
                  Review Check-In <ArrowRight className="w-3.5 h-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          </div>
        )}

        {missingCoordinators.length === 0 && missingSafety.length === 0 && lateStaff.length === 0 && (
          <div className="glass p-8 rounded-2xl border border-emerald-300 bg-emerald-100 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
            <h3 className="text-lg font-bold text-ink-lum">All Staffing Issues Resolved</h3>
            <p className="text-xs text-ink-sec">Every event has the required staff roles assigned and on track.</p>
          </div>
        )}
      </div>
    </div>
  );
}
