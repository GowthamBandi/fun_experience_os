"use client";

import Link from "next/link";
import { UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export interface StaffEmptyStateProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  actionHref?: string;
}

export function StaffEmptyState({
  title = "No Staff Members Found",
  message = "No staff members match the selected role or venue filter.",
  actionLabel = "Add Staff Member",
  actionHref = "/people/staff/new",
}: StaffEmptyStateProps) {
  return (
    <div className="glass p-8 rounded-2xl border border-slate-200 text-center space-y-4 my-4 max-w-md mx-auto">
      <div className="w-12 h-12 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center mx-auto text-brand">
        <Users className="w-6 h-6" />
      </div>

      <div className="space-y-1">
        <h3 className="text-base font-bold text-ink-lum">{title}</h3>
        <p className="text-xs text-ink-mut leading-relaxed max-w-xs mx-auto">{message}</p>
      </div>

      {actionLabel && actionHref && (
        <div className="pt-2">
          <Link href={actionHref}>
            <Button variant="primary" className="font-bold text-xs">
              <UserPlus className="w-4 h-4 mr-1" />
              {actionLabel}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
