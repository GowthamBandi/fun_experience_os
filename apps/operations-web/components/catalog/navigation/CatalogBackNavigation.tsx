"use client";

import { BackLink, Crumbs } from "@/components/setup/kit";

export interface BreadcrumbItem {
  label: string;
  href: string;
}

export interface CatalogBackNavigationProps {
  label?: string;
  href?: string;
  breadcrumbs?: BreadcrumbItem[];
}

/** Back link with an optional Catalog breadcrumb trail. */
export function CatalogBackNavigation({ label = "Back to experiences", href = "/catalog/experiences", breadcrumbs = [] }: CatalogBackNavigationProps) {
  return (
    <div className="flex flex-col gap-1">
      {breadcrumbs.length > 0 && <Crumbs items={[{ label: "Catalog", href: "/catalog" }, ...breadcrumbs]} />}
      <div>
        <BackLink href={href} label={label} />
      </div>
    </div>
  );
}
