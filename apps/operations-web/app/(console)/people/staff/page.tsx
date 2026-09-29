"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectStaffDirectory, selectStaffHealth } from "@/lib/prototype/selectors/staff";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Button } from "@/components/ui/primitives";
import { SearchInput, FilterRail } from "@/components/ui/fields";
import { Stagger, Item } from "@/components/motion/Motion";
import {
  StaffBackNavigation,
  StaffCard,
  StaffEmptyState,
} from "@/components/staff";
import { UserPlus, Filter, ChevronDown } from "lucide-react";

export default function StaffDirectoryPage() {
  const { state, territory, canAccess } = useStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const staffList = selectStaffDirectory(state);
  const health = selectStaffHealth(state);

  const filteredStaff = useMemo(() => {
    let list = staffList;

    if (roleFilter !== "all") {
      list = list.filter((s) => s.role === roleFilter);
    }

    if (availabilityFilter !== "all") {
      if (availabilityFilter === "working") {
        list = list.filter((s) => s.status === "assigned" || s.status === "checked-in");
      } else if (availabilityFilter === "available") {
        list = list.filter((s) => s.status === "available");
      } else if (availabilityFilter === "checked-in") {
        list = list.filter((s) => s.status === "checked-in");
      } else if (availabilityFilter === "off") {
        list = list.filter((s) => s.status === "off");
      }
    }

    const q = searchQuery.toLowerCase().trim();
    if (q) {
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.roleLabel.toLowerCase().includes(q) ||
          s.venueName.toLowerCase().includes(q) ||
          s.cityName.toLowerCase().includes(q)
      );
    }

    return list;
  }, [staffList, roleFilter, availabilityFilter, searchQuery]);

  if (!canAccess("/people")) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">
        <PermissionDenied module="Staff Directory" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <StaffBackNavigation label="Back to People" href="/people" />

      <PageHeader
        overline={`Staff Directory · ${territory.name}`}
        title="Staff"
        sub="See who is available, assigned, checked in, or needs attention. Who can work today?"
        right={
          <Link href="/people/staff/new">
            <Button variant="primary" className="font-bold">
              <UserPlus className="w-4 h-4 mr-1" />
              Add Staff Member
            </Button>
          </Link>
        }
      />

      {/* Top Operational Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center text-xs">
        <div className="glass p-3 rounded-xl border border-slate-200 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Total</span>
          <span className="font-bold text-ink-lum text-base">{health.totalStaff}</span>
        </div>
        <div className="glass p-3 rounded-xl border border-slate-200 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Working</span>
          <span className="font-bold text-blue-600 text-base">{health.workingToday}</span>
        </div>
        <div className="glass p-3 rounded-xl border border-slate-200 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Available</span>
          <span className="font-bold text-emerald-600 text-base">{health.availableCount}</span>
        </div>
        <div className="glass p-3 rounded-xl border border-slate-200 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Assigned</span>
          <span className="font-bold text-ink-lum text-base">{health.assignedCount}</span>
        </div>
        <div className="glass p-3 rounded-xl border border-slate-200 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Checked In</span>
          <span className="font-bold text-emerald-600 text-base">{health.checkedInCount}</span>
        </div>
        <div className="glass p-3 rounded-xl border border-slate-200 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Late</span>
          <span className="font-bold text-amber-600 text-base">{health.lateCount}</span>
        </div>
        <div className="glass p-3 rounded-xl border border-slate-200 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Safety Staff</span>
          <span className="font-bold text-purple-700 text-base">{health.safetyStaffCount}</span>
        </div>
        <div className="glass p-3 rounded-xl border border-slate-200 space-y-0.5">
          <span className="text-[10px] text-ink-mut uppercase block">Leads</span>
          <span className="font-bold text-brand text-base">{health.leadCoordinatorCount}</span>
        </div>
      </div>

      {/* Filter Rail */}
      <div className="glass p-5 rounded-2xl border border-slate-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="w-full sm:w-80">
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search staff name, role, venue..." />
          </div>

          <div className="flex items-center gap-2">
            <FilterRail
              options={["all", "working", "available", "checked-in", "off"] as const}
              value={availabilityFilter as any}
              onChange={setAvailabilityFilter as any}
            />

            <Button
              variant="ghost"
              className="h-8 text-xs text-ink-sec px-2"
              onClick={() => setShowMoreFilters(!showMoreFilters)}
            >
              <Filter className="w-3.5 h-3.5 mr-1" />
              More Filters
              <ChevronDown className="w-3.5 h-3.5 ml-1" />
            </Button>
          </div>
        </div>

        {showMoreFilters && (
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="space-y-1">
              <label className="text-[11px] text-ink-mut">Filter by Role</label>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value)}
                className="w-full h-8 px-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-ink-lum"
              >
                <option value="all">All Roles</option>
                <option value="coordinator">Lead Coordinator</option>
                <option value="safety">Safety Officer</option>
                <option value="venue-manager">Venue Manager</option>
                <option value="staff">Event Staff</option>
              </select>
            </div>
          </div>
        )}

        {/* Staff Grid */}
        {staffList.length === 0 ? (
          <StaffEmptyState
            title="No Staff Members Added"
            message="Add staff members to assign them to upcoming events and manage shifts."
            actionLabel="Add Staff Member"
            actionHref="/people/staff/new"
          />
        ) : filteredStaff.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-mut">No staff members match your filter criteria.</div>
        ) : (
          <Stagger className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStaff.map((s) => (
              <Item key={s.id}>
                <StaffCard staff={s} />
              </Item>
            ))}
          </Stagger>
        )}
      </div>
    </div>
  );
}
