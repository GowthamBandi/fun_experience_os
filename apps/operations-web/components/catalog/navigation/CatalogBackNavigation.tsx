"use client";

import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/primitives";

export interface BreadcrumbItem {
  label: string;
  href: string;
}

export interface CatalogBackNavigationProps {
  label?: string;
  href?: string;
  breadcrumbs?: BreadcrumbItem[];
}

export function CatalogBackNavigation({
  label = "Back to Experiences",
  href = "/catalog/experiences",
  breadcrumbs = [],
}: CatalogBackNavigationProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-ink-mut">
          <Link href="/catalog" className="hover:text-ink-sec transition-colors">
            Experiences
          </Link>
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1.5">
              <ChevronRight className="w-3 h-3 text-ink-mut/60" />
              <Link href={b.href} className="hover:text-ink-sec transition-colors">
                {b.label}
              </Link>
            </span>
          ))}
        </nav>
      )}

      <div>
        <Link href={href}>
          <Button variant="ghost" className="h-7 text-xs px-2 text-ink-sec hover:text-ink-lum font-medium">
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            {label}
          </Button>
        </Link>
      </div>
    </div>
  );
}
