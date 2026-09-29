"use client";

import { BackLink, Crumbs } from "@/components/setup/kit";

export interface BreadcrumbItem {
  label: string;
  href: string;
}

export interface StaffBackNavigationProps {
  label?: string;
  href?: string;
  breadcrumbs?: BreadcrumbItem[];
}

/** Back link with an optional People breadcrumb trail. */
export function StaffBackNavigation({ label = "Back to staff", href = "/people/staff", breadcrumbs = [] }: StaffBackNavigationProps) {
  return (
    <div className="flex flex-col gap-1">
      {breadcrumbs.length > 0 && <Crumbs items={[{ label: "People", href: "/people" }, ...breadcrumbs]} />}
      <div>
        <BackLink href={href} label={label} />
      </div>
    </div>
  );
}
