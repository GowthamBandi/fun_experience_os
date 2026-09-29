"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectStaffHealth, selectParticipantDirectory } from "@/lib/prototype/selectors/staff";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button } from "@/components/ui/primitives";
import { StaffHelpPanel } from "@/components/staff";
import { Users, UserCheck, Ticket, ArrowRight, ShieldCheck, UserPlus } from "lucide-react";

export default function PeopleLandingPage() {
  const { state, territory, canAccess } = useStore();

  if (!canAccess("/people")) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <PermissionDenied module="People" />
      </div>
    );
  }

  const staffHealth = selectStaffHealth(state);
  const participants = selectParticipantDirectory(state);
  const checkedInParticipants = participants.filter((p) => p.isCheckedIn);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-8">
      <PageHeader
        overline={`People Directory · ${territory.name}`}
        title="People"
        sub="Manage the staff who run events and view participants who joined. Who is connected to our operations?"
        right={
          <Link href="/people/staff/new">
            <Button variant="primary" className="font-bold">
              <UserPlus className="w-4 h-4 mr-1" />
              Add Staff Member
            </Button>
          </Link>
        }
      />

      <StaffHelpPanel />

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="glass p-5 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Total Staff</span>
          <p className="text-3xl font-bold text-ink-lum">{staffHealth.totalStaff}</p>
          <p className="text-xs text-ink-sec">{staffHealth.workingToday} working today</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Checked In Today</span>
          <p className="text-3xl font-bold text-emerald-400">{staffHealth.checkedInCount}</p>
          <p className="text-xs text-ink-sec">Staff members on floor</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Active Participants</span>
          <p className="text-3xl font-bold text-purple-300">{participants.length}</p>
          <p className="text-xs text-ink-sec">{checkedInParticipants.length} checked-in customers</p>
        </div>

        <div className="glass p-5 rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] text-ink-mut uppercase font-semibold">Needing Attention</span>
          <p className="text-3xl font-bold text-amber-400">
            {staffHealth.eventsMissingCoordinatorCount + staffHealth.eventsMissingSafetyCount}
          </p>
          <p className="text-xs text-ink-sec">Missing role assignments</p>
        </div>
      </div>

      {/* Two Large Operational Cards: Staff vs Participants */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Card 1: Staff */}
        <div className="glass p-6 rounded-2xl border border-white/5 hover:border-brand/40 transition-all flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
              <UserCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink-lum">Staff Roster</h2>
              <p className="text-xs text-ink-sec mt-1">
                People who organize, coordinate, support, referee, and keep events safe.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-mut">Working Today:</span>
                <span className="font-bold text-ink-lum">{staffHealth.workingToday} staff</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-mut">Available:</span>
                <span className="font-bold text-emerald-400">{staffHealth.availableCount} staff</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-mut">Safety Staff:</span>
                <span className="font-bold text-purple-300">{staffHealth.safetyStaffCount} staff</span>
              </div>
            </div>
          </div>

          <Link href="/people/staff">
            <Button variant="primary" className="w-full font-bold">
              View Staff Directory
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>

        {/* Card 2: Participants */}
        <div className="glass p-6 rounded-2xl border border-white/5 hover:border-purple-500/40 transition-all flex flex-col justify-between space-y-6">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <Ticket className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-ink-lum">Participants Directory</h2>
              <p className="text-xs text-ink-sec mt-1">
                People who joined booked events using privacy-safe operational identities.
              </p>
            </div>
            <div className="p-4 rounded-xl bg-black/40 border border-white/5 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-ink-mut">Total Booked:</span>
                <span className="font-bold text-ink-lum">{participants.length} participants</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-mut">Checked In:</span>
                <span className="font-bold text-emerald-400">{checkedInParticipants.length} checked-in</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-mut">Privacy Mode:</span>
                <span className="font-bold text-blue-400">Masked Phone & Alias</span>
              </div>
            </div>
          </div>

          <Link href="/people/participants">
            <Button variant="secondary" className="w-full font-bold">
              View Participants Directory
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
