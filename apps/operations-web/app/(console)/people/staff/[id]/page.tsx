"use client";

import { use } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectStaffMemberById } from "@/lib/prototype/selectors/staff";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffBackNavigation, StaffStatusBadge } from "@/components/staff";
import { Button } from "@/components/ui/primitives";
import {
  User,
  MapPin,
  Calendar,
  Clock,
  ShieldCheck,
  CheckCircle2,
  Phone,
  Mail,
  ArrowRight,
  UserCheck,
} from "lucide-react";

export default function StaffProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: staffId } = use(params);
  const { state, checkInStaff } = useStore();

  const staff = selectStaffMemberById(state, staffId);

  if (!staff) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-12 text-center space-y-4">
        <h2 className="text-xl font-bold text-ink-lum">Staff Member Not Found</h2>
        <p className="text-xs text-ink-sec">The requested staff member does not exist in prototype state.</p>
        <Link href="/people/staff">
          <Button variant="primary">Return to Staff Directory</Button>
        </Link>
      </div>
    );
  }

  const isWorking = staff.status === "assigned" || staff.status === "checked-in";
  const isCheckedIn = staff.status === "checked-in";

  // Derive single primary action
  let primaryActionLabel = "Assign to Event";
  let primaryActionHref = `/staffing/assign`;

  if (isCheckedIn && staff.currentSessionId) {
    primaryActionLabel = "View Current Event";
    primaryActionHref = `/missions/${staff.currentSessionId}/overview`;
  } else if (staff.status === "assigned" && staff.currentSessionId) {
    primaryActionLabel = "Check In Staff";
    primaryActionHref = `/staffing/check-in`;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <StaffBackNavigation
        label="Back to Staff Directory"
        href="/people/staff"
        breadcrumbs={[
          { label: "Staff", href: "/people/staff" },
          { label: staff.name, href: `/people/staff/${staff.id}` },
        ]}
      />

      {/* Header */}
      <PageHeader
        overline={`Staff Profile · ${staff.cityName}`}
        title={staff.name}
        sub={`${staff.roleLabel} · ${staff.venueName}`}
        right={
          <div className="flex items-center gap-3">
            <StaffStatusBadge status={staff.status} />
            <Link href={primaryActionHref}>
              <Button variant="primary" className="font-bold text-xs">
                {primaryActionLabel}
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </Link>
          </div>
        }
      />

      {/* Section 1: Today's Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass p-5 rounded-2xl border border-slate-200 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Today&apos;s Assignment</span>
          <p className="text-base font-bold text-ink-lum">{staff.assignment}</p>
          <p className="text-xs text-ink-sec">{staff.venueName}</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-slate-200 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Shift Hours</span>
          <p className="text-base font-bold text-emerald-600 font-mono">{staff.shiftFrom} - {staff.shiftTo}</p>
          <p className="text-xs text-ink-sec">Territory: {staff.territoryName}</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-slate-200 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Check-In Status</span>
          <p className="text-base font-bold text-purple-700 capitalize">{staff.status}</p>
          <p className="text-xs text-ink-sec">{isCheckedIn ? "Checked in at venue floor" : "Pending check-in"}</p>
        </div>
      </div>

      {/* Sections 2-8 Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Section 2: Current Event */}
        <div className="glass p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
          <h3 className="font-bold text-ink-lum text-sm flex items-center gap-2">
            <Calendar className="w-4 h-4 text-brand" />
            <span>1. Today&apos;s Event Details</span>
          </h3>

          {staff.currentSessionTitle ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="font-bold text-ink-lum text-sm">{staff.currentSessionTitle}</div>
              <p className="text-ink-sec font-mono">Location: {staff.venueName}</p>
              <div className="pt-2 flex justify-between items-center border-t border-slate-200">
                <span className="text-ink-mut">Assigned Role: {staff.roleLabel}</span>
                <Link href={`/missions/${staff.currentSessionId}/overview`}>
                  <Button variant="secondary" className="h-7 text-xs px-2.5">
                    View Event <ArrowRight className="w-3 h-3 ml-1" />
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-ink-mut text-center">
              No live event assigned right now. Available for assignment.
            </div>
          )}
        </div>

        {/* Section 3: Skills & Qualifications */}
        <div className="glass p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
          <h3 className="font-bold text-ink-lum text-sm flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>2. Skills & Training</span>
          </h3>

          <div className="flex flex-wrap gap-2">
            {staff.skills.map((sk, i) => (
              <span key={i} className="px-3 py-1 rounded-lg bg-slate-50 border border-slate-200 font-semibold text-ink-lum">
                ✓ {sk}
              </span>
            ))}
          </div>
        </div>

        {/* Section 4: Attendance & History */}
        <div className="glass p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
          <h3 className="font-bold text-ink-lum text-sm flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-600" />
            <span>3. Recent Attendance</span>
          </h3>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex justify-between">
              <span className="text-ink-mut">Completed Shifts:</span>
              <span className="font-bold text-ink-lum">{staff.attendanceCount} events</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-mut">On-Time Arrival:</span>
              <span className="font-bold text-emerald-600">98%</span>
            </div>
          </div>
        </div>

        {/* Section 5: Contact Details */}
        <div className="glass p-5 rounded-2xl border border-slate-200 space-y-3 text-xs">
          <h3 className="font-bold text-ink-lum text-sm flex items-center gap-2">
            <User className="w-4 h-4 text-blue-600" />
            <span>4. Contact Details</span>
          </h3>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 font-mono">
            <div className="flex items-center gap-2 text-ink-sec">
              <Phone className="w-3.5 h-3.5 text-ink-mut" />
              <span>{staff.phone}</span>
            </div>
            <div className="flex items-center gap-2 text-ink-sec">
              <Mail className="w-3.5 h-3.5 text-ink-mut" />
              <span>{staff.email}</span>
            </div>
            <div className="text-[11px] text-ink-mut pt-1 border-t border-slate-200">
              Emergency: {staff.emergencyContact}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
