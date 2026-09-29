"use client";

import Link from "next/link";
import { StaffStatusBadge } from "../status/StaffStatusBadge";
import { Button } from "@/components/ui/primitives";
import { ArrowRight, UserCheck, AlertTriangle, ShieldCheck } from "lucide-react";

export interface StaffHealthBannerProps {
  status: "ready" | "needs-attention" | "blocked";
  label: string;
  workingToday: number;
  assignedCount: number;
  checkedInCount: number;
  lateCount: number;
  eventsMissingCoordinatorCount: number;
  eventsMissingSafetyCount: number;
  actionHref?: string;
  actionLabel?: string;
}

export function StaffHealthBanner({
  status,
  label,
  workingToday,
  assignedCount,
  checkedInCount,
  lateCount,
  eventsMissingCoordinatorCount,
  eventsMissingSafetyCount,
  actionHref = "/staffing/assign",
  actionLabel = "Assign Staff",
}: StaffHealthBannerProps) {
  return (
    <div className="glass p-5 rounded-2xl border border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <StaffStatusBadge status={status} />
        <div>
          <h3 className="text-sm font-bold text-ink-lum flex items-center gap-2">
            {status === "ready" ? (
              <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>Staffing Readiness: {label}</span>
          </h3>
          <p className="text-xs text-ink-sec mt-0.5 font-mono">
            {workingToday} Working Today · {checkedInCount} Checked In
            {lateCount > 0 && ` · ${lateCount} Late`}
            {eventsMissingCoordinatorCount > 0 && ` · ${eventsMissingCoordinatorCount} Missing Coordinator`}
            {eventsMissingSafetyCount > 0 && ` · ${eventsMissingSafetyCount} Missing Safety Lead`}
          </p>
        </div>
      </div>

      <Link href={actionHref}>
        <Button variant="primary" className="font-bold text-xs shrink-0">
          {actionLabel}
          <ArrowRight className="w-3.5 h-3.5 ml-1" />
        </Button>
      </Link>
    </div>
  );
}
