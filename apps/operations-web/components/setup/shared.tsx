"use client";

import React from "react";
import Link from "next/link";
import { ChevronRight, ArrowLeft, CheckCircle2, AlertTriangle, Clock, Plus, Building2, MapPin, Globe, Landmark, Layers, HelpCircle } from "lucide-react";
import { cn } from "@/lib/format";
import { Badge, Button } from "@/components/ui/primitives";
import type { SetupHealthStatus, SetupNextAction, SetupStepStatus } from "@/lib/prototype/selectors/setup";
import type { PrototypeState } from "@/lib/prototype/scenarios/state";
import { useStore } from "@/lib/store";

/* =================================================================
  1. SETUP BREADCRUMBS
================================================================= */
export interface BreadcrumbItem {
  label: string;
  href: string;
}

export function SetupBreadcrumbs({ breadcrumbs }: { breadcrumbs: BreadcrumbItem[] }) {
  return (
    <nav className="flex items-center gap-1 text-xs text-ink-mut flex-wrap">
      <Link href="/setup" className="hover:text-ink-lum transition-colors flex items-center gap-1 font-medium">
        <Layers className="w-3.5 h-3.5" />
        <span>Setup</span>
      </Link>
      {breadcrumbs.map((b, i) => (
        <React.Fragment key={i}>
          <ChevronRight className="w-3.5 h-3.5 opacity-40" />
          {i === breadcrumbs.length - 1 ? (
            <span className="text-ink-lum font-semibold truncate max-w-[200px]">{b.label}</span>
          ) : (
            <Link href={b.href} className="hover:text-ink-lum transition-colors truncate max-w-[150px]">
              {b.label}
            </Link>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

/* =================================================================
  2. SETUP BACK NAVIGATION
================================================================= */
export function SetupBackNavigation({
  label = "Back to Setup",
  href = "/setup",
  breadcrumbs,
}: {
  label?: string;
  href?: string;
  breadcrumbs?: BreadcrumbItem[];
}) {
  return (
    <div className="flex flex-col gap-2">
      {breadcrumbs && breadcrumbs.length > 0 && <SetupBreadcrumbs breadcrumbs={breadcrumbs} />}
      <div>
        <Link
          href={href}
          className="inline-flex items-center gap-1.5 text-xs text-ink-sec hover:text-ink-lum transition-colors py-1 px-2.5 rounded-lg bg-white/4 hover:bg-white/8 border border-white/5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>{label}</span>
        </Link>
      </div>
    </div>
  );
}

/* =================================================================
  3. SETUP STATUS BADGE
================================================================= */
export function SetupStatusBadge({
  status,
  size = "md",
}: {
  status: SetupHealthStatus | "not-started" | "in-progress" | "complete" | "needs-attention" | "ready";
  size?: "sm" | "md";
}) {
  let label = "Unknown";
  let classes = "bg-white/5 text-ink-sec border-white/10";
  let icon = <Clock className="w-3 h-3" />;

  switch (status) {
    case "complete":
    case "ready":
      label = "Complete";
      classes = "bg-emerald-950/60 text-emerald-300 border-emerald-800/80";
      icon = <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
      break;
    case "needs-attention":
      label = "Needs Attention";
      classes = "bg-amber-950/60 text-amber-300 border-amber-800/80";
      icon = <AlertTriangle className="w-3 h-3 text-amber-400" />;
      break;
    case "in-progress":
      label = "In Progress";
      classes = "bg-blue-950/60 text-blue-300 border-blue-800/80";
      icon = <Clock className="w-3 h-3 text-blue-400" />;
      break;
    case "not-started":
    case "incomplete":
      label = "Incomplete";
      classes = "bg-red-950/60 text-red-300 border-red-800/80";
      icon = <Clock className="w-3 h-3 text-red-400" />;
      break;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium tracking-tight",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-xs",
        classes
      )}
    >
      {icon}
      <span>{label}</span>
    </span>
  );
}

/* =================================================================
  4. SETUP PROGRESS (5-STEP HIERARCHY BAR)
================================================================= */
export function SetupProgress({ steps }: { steps: SetupStepStatus[] }) {
  return (
    <div className="glass p-5 rounded-2xl border border-white/10 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-lum flex items-center gap-2">
          <Layers className="w-4 h-4 text-brand" />
          <span>Operating Area Setup Journey</span>
        </h3>
        <span className="text-xs text-ink-mut">5-Step Setup Hierarchy</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 relative">
        {steps.map((s, idx) => {
          const isDone = s.status === "complete";
          const isNeedsAttention = s.status === "needs-attention";
          return (
            <div
              key={s.key}
              className={cn(
                "p-3 rounded-xl border flex flex-col justify-between transition-all",
                isDone
                  ? "bg-emerald-950/20 border-emerald-800/40 text-emerald-200"
                  : isNeedsAttention
                  ? "bg-amber-950/20 border-amber-800/40 text-amber-200"
                  : "bg-white/3 border-white/5 text-ink-sec"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-ink-lum">Step {s.step}</span>
                {isDone ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : isNeedsAttention ? (
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-white/20" />
                )}
              </div>
              <div>
                <p className="font-semibold text-xs text-ink-lum truncate">{s.key.toUpperCase()}</p>
                <p className="text-[10px] text-ink-mut mt-0.5">{s.count} registered</p>
              </div>
              <Link href={s.actionHref} className="mt-3">
                <Button
                  variant={isDone ? "ghost" : "primary"}
                  className="w-full h-7 text-[11px] px-2 justify-center"
                >
                  {s.actionLabel}
                </Button>
              </Link>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* =================================================================
  5. SETUP NEXT STEP CARD (NEXT ACTION ENGINE)
================================================================= */
export function SetupNextStep({ nextAction }: { nextAction: SetupNextAction }) {
  return (
    <div className="glass p-5 rounded-2xl border border-brand/30 bg-gradient-to-r from-brand/10 via-brand/5 to-transparent flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-brand text-slate-950 uppercase tracking-wider">
            Next Action Engine
          </span>
          <span className="text-xs text-ink-mut">Step {nextAction.stepNumber} of 5</span>
        </div>
        <h3 className="text-lg font-bold text-ink-lum">{nextAction.label}</h3>
        <p className="text-xs text-ink-sec">{nextAction.subtitle}</p>
      </div>

      <Link href={nextAction.href} className="shrink-0 w-full md:w-auto">
        <Button variant="primary" className="w-full md:w-auto font-bold px-5">
          <Plus className="w-4 h-4 mr-1" />
          {nextAction.label}
        </Button>
      </Link>
    </div>
  );
}

/* =================================================================
  6. SETUP RELATIONSHIP TREE (VISUAL HIERARCHY)
================================================================= */
export function SetupRelationshipTree({ state }: { state: PrototypeState }) {
  const franchises = state.franchises ?? [];
  const territories = state.territories ?? [];
  const cities = state.cities ?? [];
  const venues = state.venues ?? [];
  const playingAreas = state.playingAreas ?? [];

  return (
    <div className="glass p-5 rounded-2xl border border-white/5 space-y-4">
      <div className="flex items-center justify-between border-b border-white/5 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-ink-lum flex items-center gap-2">
            <Globe className="w-4 h-4 text-brand" />
            <span>Operating Structure Tree</span>
          </h3>
          <p className="text-xs text-ink-mut">Platform → Franchise → Territory → City → Venue → Playing Area</p>
        </div>
      </div>

      <div className="font-mono text-xs space-y-4 overflow-x-auto p-3 bg-slate-950/40 rounded-xl border border-white/5">
        {franchises.length === 0 ? (
          <div className="text-ink-mut py-4 text-center">
            No franchises created yet. Click <strong>&quot;Create Franchise&quot;</strong> to begin.
          </div>
        ) : (
          franchises.map((f) => {
            const fTerritories = territories.filter((t) => t.franchiseId === f.id);
            return (
              <div key={f.id} className="space-y-2">
                <div className="flex items-center gap-2 text-ink-lum font-bold">
                  <Landmark className="w-4 h-4 text-amber-400" />
                  <Link href={`/franchises/${f.id}`} className="hover:text-brand transition-colors">
                    {f.name}
                  </Link>
                  <span className="text-[10px] text-ink-mut font-normal">({f.id})</span>
                </div>

                {fTerritories.length === 0 ? (
                  <div className="pl-6 text-ink-mut text-[11px]">
                    └── <span className="italic text-amber-400/80">No territory added yet.</span>{" "}
                    <Link href={`/territories/new?franchiseId=${f.id}`} className="underline text-brand hover:text-brand-light">
                      + Add Territory
                    </Link>
                  </div>
                ) : (
                  fTerritories.map((t, tIdx) => {
                    const isLastT = tIdx === fTerritories.length - 1;
                    const tPrefix = isLastT ? "└── " : "├── ";
                    const tIndent = isLastT ? "    " : "│   ";
                    const tCities = cities.filter((c) => c.territoryId === t.id);

                    return (
                      <div key={t.id} className="pl-6 space-y-1.5">
                        <div className="flex items-center gap-2 text-ink-sec">
                          <span>{tPrefix}</span>
                          <Globe className="w-3.5 h-3.5 text-blue-400" />
                          <Link href={`/territories/${t.id}`} className="hover:text-ink-lum transition-colors font-medium">
                            {t.name}
                          </Link>
                          <span className="text-[10px] text-ink-mut">({t.id})</span>
                        </div>

                        {tCities.length === 0 ? (
                          <div className="pl-12 text-ink-mut text-[11px]">
                            {tIndent}└── <span className="italic text-amber-400/80">No city added yet.</span>{" "}
                            <Link href={`/cities/new?territoryId=${t.id}`} className="underline text-brand hover:text-brand-light">
                              + Add City
                            </Link>
                          </div>
                        ) : (
                          tCities.map((c, cIdx) => {
                            const isLastC = cIdx === tCities.length - 1;
                            const cPrefix = isLastC ? "└── " : "├── ";
                            const cIndent = isLastC ? "    " : "│   ";
                            const cVenues = venues.filter((v) => v.cityId === c.id || v.territoryId === t.id);

                            return (
                              <div key={c.id} className="pl-12 space-y-1">
                                <div className="flex items-center gap-2 text-ink-sec">
                                  <span>{tIndent}{cPrefix}</span>
                                  <MapPin className="w-3.5 h-3.5 text-emerald-400" />
                                  <Link href={`/cities/${c.id}`} className="hover:text-ink-lum transition-colors">
                                    {c.name}
                                  </Link>
                                  <span className="text-[10px] text-ink-mut">({c.id})</span>
                                </div>

                                {cVenues.length === 0 ? (
                                  <div className="pl-20 text-ink-mut text-[11px]">
                                    {tIndent}{cIndent}└── <span className="italic text-amber-400/80">No venue created yet.</span>{" "}
                                    <Link href={`/locations/venues/new?cityId=${c.id}`} className="underline text-brand hover:text-brand-light">
                                      + Create Venue
                                    </Link>
                                  </div>
                                ) : (
                                  cVenues.map((v, vIdx) => {
                                    const isLastV = vIdx === cVenues.length - 1;
                                    const vPrefix = isLastV ? "└── " : "├── ";
                                    const vIndent = isLastV ? "    " : "│   ";
                                    const vAreas = playingAreas.filter((pa) => pa.venueId === v.id);

                                    return (
                                      <div key={v.id} className="pl-20 space-y-1">
                                        <div className="flex items-center gap-2 text-ink-sec">
                                          <span>{tIndent}{cIndent}{vPrefix}</span>
                                          <Building2 className="w-3.5 h-3.5 text-purple-400" />
                                          <Link href={`/locations/venues/${v.id}`} className="hover:text-ink-lum transition-colors font-medium">
                                            {v.name}
                                          </Link>
                                          <span className="text-[10px] text-ink-mut">({v.id})</span>
                                        </div>

                                        {vAreas.length === 0 ? (
                                          <div className="pl-28 text-ink-mut text-[11px]">
                                            {tIndent}{cIndent}{vIndent}└── <span className="italic text-amber-400/80">No playing area added yet.</span>{" "}
                                            <Link href={`/locations/playing-areas/new?venueId=${v.id}`} className="underline text-brand hover:text-brand-light">
                                              + Add Playing Area
                                            </Link>
                                          </div>
                                        ) : (
                                          vAreas.map((pa, paIdx) => {
                                            const isLastPA = paIdx === vAreas.length - 1;
                                            const paPrefix = isLastPA ? "└── " : "├── ";
                                            return (
                                              <div key={pa.id} className="pl-28 flex items-center gap-2 text-ink-mut text-[11px]">
                                                <span>{tIndent}{cIndent}{vIndent}{paPrefix}</span>
                                                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                                                <Link href={`/locations/playing-areas/${pa.id}`} className="text-emerald-300 hover:underline">
                                                  {pa.name}
                                                </Link>
                                                <span>({pa.maxCapacity} cap)</span>
                                              </div>
                                            );
                                          })
                                        )}
                                      </div>
                                    );
                                  })
                                )}
                              </div>
                            );
                          })
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* =================================================================
  7. SETUP HELP PANEL
================================================================= */
export function SetupHelpPanel() {
  return (
    <div className="glass p-5 rounded-2xl border border-white/5 space-y-4">
      <h3 className="text-sm font-semibold text-ink-lum flex items-center gap-2">
        <HelpCircle className="w-4 h-4 text-brand" />
        <span>Hierarchy Guide for Operators</span>
      </h3>
      <div className="space-y-3 text-xs text-ink-sec">
        <div>
          <strong className="text-ink-lum font-semibold">1. Franchise:</strong> The organization or regional operating head responsible for this area.
        </div>
        <div>
          <strong className="text-ink-lum font-semibold">2. Territory:</strong> A smaller operating area managed by a local operating team.
        </div>
        <div>
          <strong className="text-ink-lum font-semibold">3. City:</strong> The city where events will happen.
        </div>
        <div>
          <strong className="text-ink-lum font-semibold">4. Venue:</strong> The physical building or outdoor location where customers arrive.
        </div>
        <div>
          <strong className="text-ink-lum font-semibold">5. Playing Area:</strong> The exact court, field, room, hall, pool, or track space used by events.
        </div>
      </div>
    </div>
  );
}

/* =================================================================
  8. SETUP EMPTY STATE
================================================================= */
export function SetupEmptyState({
  title,
  message,
  actionLabel,
  actionHref,
}: {
  title: string;
  message: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <div className="glass p-8 rounded-2xl border border-white/5 text-center space-y-4">
      <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-ink-mut">
        <Layers className="w-6 h-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-ink-lum">{title}</h3>
        <p className="text-xs text-ink-sec max-w-md mx-auto">{message}</p>
      </div>
      {actionLabel && actionHref && (
        <div className="pt-2">
          <Link href={actionHref}>
            <Button variant="primary" className="font-bold">
              <Plus className="w-4 h-4 mr-1" />
              {actionLabel}
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}

/* =================================================================
  9. SETUP PRIMARY ACTION WITH ROLE TOOLTIP
================================================================= */
export function SetupPrimaryAction({
  label,
  href,
  onClick,
  allowedRoles = ["platform-owner", "super-admin", "regional-partner", "city-manager"],
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  allowedRoles?: string[];
}) {
  const { role } = useStore();
  const isAllowed = allowedRoles.includes(role.id);

  const btn = (
    <Button
      variant="primary"
      disabled={!isAllowed}
      onClick={onClick}
      className={cn("font-bold", !isAllowed && "opacity-50 cursor-not-allowed")}
      title={!isAllowed ? `Requires ${allowedRoles.join(" or ")} role` : undefined}
    >
      <Plus className="w-4 h-4 mr-1" />
      {label}
    </Button>
  );

  if (!isAllowed) {
    return (
      <div className="relative group inline-block">
        {btn}
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-900 text-xs text-white p-2 rounded-lg border border-white/10 whitespace-nowrap z-50 shadow-xl">
          Role restricted ({role.name}). Prototype simulation mode.
        </div>
      </div>
    );
  }

  if (href) {
    return <Link href={href}>{btn}</Link>;
  }

  return btn;
}
