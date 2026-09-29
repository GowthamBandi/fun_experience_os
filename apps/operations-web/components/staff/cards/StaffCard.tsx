"use client";

import Link from "next/link";
import { StaffStatusBadge } from "../status/StaffStatusBadge";
import { Button } from "@/components/ui/primitives";
import { User, MapPin, Calendar, ArrowRight } from "lucide-react";
import type { StaffViewItem } from "@/lib/prototype/selectors/staff";

export interface StaffCardProps {
  staff: StaffViewItem;
}

export function StaffCard({ staff }: StaffCardProps) {
  const isWorking = staff.status === "assigned" || staff.status === "checked-in";

  return (
    <div className="glass p-5 rounded-2xl border border-slate-200 hover:border-slate-200 transition-all flex flex-col justify-between space-y-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center font-bold text-brand text-sm shrink-0">
              {staff.name
                .split(" ")
                .map((n) => n[0])
                .join("")}
            </div>
            <div>
              <h4 className="font-bold text-base text-ink-lum flex items-center gap-1.5">
                <Link href={`/people/staff/${staff.id}`} className="hover:text-brand transition-colors">
                  {staff.name}
                </Link>
              </h4>
              <p className="text-xs text-purple-700 font-semibold">{staff.roleLabel}</p>
            </div>
          </div>

          <StaffStatusBadge status={staff.status} size="sm" />
        </div>

        <div className="text-xs text-ink-sec space-y-1">
          <p className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-ink-mut shrink-0" />
            <span>{staff.cityName} · {staff.venueName}</span>
          </p>

          <p className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-ink-mut shrink-0" />
            <span>{staff.assignment}</span>
          </p>
        </div>

        {staff.currentSessionTitle && (
          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] space-y-0.5">
            <span className="text-ink-mut uppercase text-[10px] block">Current Event:</span>
            <span className="font-bold text-ink-lum">{staff.currentSessionTitle}</span>
          </div>
        )}
      </div>

      <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
        <span className="text-[11px] font-mono text-ink-mut">{staff.shiftFrom} - {staff.shiftTo}</span>

        <Link href={isWorking && staff.currentSessionId ? `/missions/${staff.currentSessionId}/overview` : `/people/staff/${staff.id}`}>
          <Button variant="secondary" className="h-7 text-xs font-bold px-3">
            {isWorking ? "View Event" : "View Profile"}
            <ArrowRight className="w-3 h-3 ml-1" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
