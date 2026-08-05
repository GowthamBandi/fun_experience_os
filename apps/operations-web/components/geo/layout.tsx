"use client";

import { Fragment, type ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/format";

/** Hierarchy orientation — a detail page must say where it sits at a glance. */
export function Breadcrumbs({ items, className }: { items: Array<{ label: string; href?: string }>; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn("flex flex-wrap items-center gap-1 text-[11px] text-ink-mut", className)}>
      {items.map((it, i) => (
        <Fragment key={i}>
          {i > 0 && <ChevronRight className="h-3 w-3 text-ink-mut/50" />}
          {it.href ? (
            <Link href={it.href} className="rounded px-1 py-0.5 transition-colors hover:text-ink-lum">
              {it.label}
            </Link>
          ) : (
            <span className="px-1 py-0.5 font-medium text-ink-sec">{it.label}</span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

/** The mandated prototype disclaimer — nothing here is a real contract. */
export function PrototypeNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-lg border border-warning/15 bg-warning/5 p-3 text-[11px] leading-relaxed text-ink-mut", className)}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
      <span>{children}</span>
    </div>
  );
}

/** Compact labeled row used inside detail panels. */
export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-white/4 py-2 last:border-0">
      <span className="overline shrink-0 pt-px">{label}</span>
      <span className="min-w-0 text-right text-sm text-ink-sec">{children}</span>
    </div>
  );
}

/** Two-column key-value grid for detail pages. */
export function KVGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid grid-cols-1 gap-x-8 gap-y-1 sm:grid-cols-2", className)}>{children}</div>;
}

/** Standard page container — the consistent outer frame across the console. */
export function PageFrame({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 py-8 md:px-8", className)}>{children}</div>;
}

/** The mandated restricted-action disclosure for the role simulator. */
export function PrototypeRoleNote({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border border-[#4c6fff]/20 bg-[#4c6fff]/8 px-3 py-2 text-[11px] text-[#9db4ff]", className)}>
      <ShieldAlert className="h-3.5 w-3.5 shrink-0" />
      <span>Prototype role simulation — not production authorization.</span>
    </div>
  );
}

/** Small inline "prototype placeholder" marker for commercial-only fields. */
export function Proto({ className }: { className?: string }) {
  return <span className={cn("rounded border border-white/10 bg-white/5 px-1 py-px text-[9px] uppercase tracking-wide text-ink-mut", className)}>prototype</span>;
}

/** Renders a list of category ids as readable chips. */
export function CatChips({ ids, names, className }: { ids: string[]; names: (id: string) => string; className?: string }) {
  if (!ids.length) return <span className="text-sm text-ink-mut">—</span>;
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {ids.map((id) => (
        <span key={id} className="rounded-md border border-white/8 bg-white/4 px-2 py-0.5 text-[11px] text-ink-sec">
          {names(id)}
        </span>
      ))}
    </div>
  );
}
