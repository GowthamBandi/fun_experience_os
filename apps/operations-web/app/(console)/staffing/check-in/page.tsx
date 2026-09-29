"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { selectTodayStaffRoster } from "@/lib/prototype/selectors/staff";
import { PageHeader } from "@/components/ui/PageHeader";
import { StaffBackNavigation, StaffStatusBadge } from "@/components/staff";
import { Button } from "@/components/ui/primitives";
import { SearchInput } from "@/components/ui/fields";
import { CheckCircle2, QrCode, Clock, XCircle, ArrowRight } from "lucide-react";

export default function StaffCheckInPage() {
  const { state, territory, updateCrewMember } = useStore();
  const [searchQuery, setSearchQuery] = useState("");

  const roster = selectTodayStaffRoster(state);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return roster;
    return roster.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.roleLabel.toLowerCase().includes(q) ||
        s.venueName.toLowerCase().includes(q)
    );
  }, [roster, searchQuery]);

  const handleCheckIn = (id: string) => {
    updateCrewMember(id, { status: "checked-in" });
  };

  const handleMarkLate = (id: string) => {
    updateCrewMember(id, { status: "assigned", assignment: "Marked Late for Shift" });
  };

  const handleMarkAbsent = (id: string) => {
    updateCrewMember(id, { status: "off", assignment: "Absent for Shift" });
  };

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8 space-y-6">
      <StaffBackNavigation label="Back to Staff Schedule" href="/staffing" />

      <PageHeader
        overline={`Staff Operations · ${territory.name}`}
        title="Staff Check-In"
        sub="Mark staff as arrived, late, or absent. Who has arrived at venue floor?"
      />

      <div className="glass p-6 rounded-2xl border border-white/5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="w-full sm:w-80">
            <SearchInput value={searchQuery} onChange={setSearchQuery} placeholder="Search staff name or role..." />
          </div>

          <Button variant="secondary" className="font-bold text-xs shrink-0" onClick={() => alert("QR Scanner active in prototype mode.")}>
            <QrCode className="w-4 h-4 mr-1 text-brand" />
            Simulate QR Code Check-In
          </Button>
        </div>

        {/* Staff Check-In Rows */}
        <div className="space-y-3">
          {filtered.map((s) => {
            const isCheckedIn = s.status === "checked-in";

            return (
              <div
                key={s.id}
                className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs ${
                  isCheckedIn
                    ? "bg-emerald-950/20 border-emerald-800/40"
                    : s.status === "late"
                    ? "bg-amber-950/20 border-amber-800/40"
                    : "bg-black/40 border-white/5"
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-ink-lum text-sm">{s.name}</span>
                    <StaffStatusBadge status={s.status} size="sm" />
                  </div>
                  <p className="text-purple-300 font-semibold">{s.roleLabel} · {s.venueName}</p>
                  <p className="text-ink-mut text-[11px] font-mono">Expected: {s.shiftFrom} - {s.shiftTo} | Assignment: {s.assignment}</p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!isCheckedIn ? (
                    <>
                      <Button
                        variant="primary"
                        className="h-8 text-xs font-bold bg-emerald-500 text-slate-950 px-3"
                        onClick={() => handleCheckIn(s.id)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                        Check In
                      </Button>
                      <Button
                        variant="secondary"
                        className="h-8 text-xs text-amber-300 border-amber-800/40 px-2.5"
                        onClick={() => handleMarkLate(s.id)}
                      >
                        Mark Late
                      </Button>
                      <Button
                        variant="ghost"
                        className="h-8 text-xs text-rose-400 hover:text-rose-300 px-2"
                        onClick={() => handleMarkAbsent(s.id)}
                      >
                        Mark Absent
                      </Button>
                    </>
                  ) : (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      Arrived & On Floor
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
