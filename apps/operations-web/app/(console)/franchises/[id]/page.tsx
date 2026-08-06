"use client";

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { franchiseDetail } from "@/lib/prototype/repositories";
import { selectFranchiseSetupHealth } from "@/lib/prototype/selectors/setup";
import { PageFrame } from "@/components/geo/layout";
import { Tide } from "@/components/motion/Motion";
import { PermissionDenied } from "@/components/ui/panels";
import { Button } from "@/components/ui/primitives";
import { SetupBackNavigation, SetupStatusBadge } from "@/components/setup/shared";

export default function FranchiseDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { state, canAccess, hydrated } = useStore();

  const detail = useMemo(() => franchiseDetail(state, id), [state, id]);

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/franchises")) return <PageFrame><PermissionDenied module="Franchises" /></PageFrame>;

  if (!detail) {
    return (
      <PageFrame>
        <div className="solid rounded-panel p-10 text-center">
          <p className="text-sm font-medium text-ink-lum">Franchise not found</p>
          <p className="mt-1 text-sm text-ink-mut">This franchise doesn&apos;t exist or was removed.</p>
          <Button variant="secondary" className="mt-5" onClick={() => router.push("/franchises")}>
            Back to franchises
          </Button>
        </div>
      </PageFrame>
    );
  }

  const health = selectFranchiseSetupHealth(state, detail.id);
  
  const m = detail.metrics;
  const playingAreasCount = detail.venues.reduce((acc, v) => acc + (v.playingAreas || 0), 0);
  
  const getNextAction = () => {
    if (detail.territories.length === 0) {
      return { label: "Add First Territory", href: `/territories/new?franchiseId=${detail.id}` };
    }
    if (detail.cities.length === 0) {
      return { label: "Add City", href: `/cities/new?franchiseId=${detail.id}` };
    }
    if (detail.venues.length === 0) {
      return { label: "Create Venue", href: `/locations/venues/new?franchiseId=${detail.id}` };
    }
    if (playingAreasCount === 0) {
      return { label: "Add Playing Area", href: `/locations/playing-areas/new` }; 
    }
    return { label: "View Operations", href: `/franchises/${detail.id}` };
  };
  
  const nextAction = getNextAction();

  return (
    <PageFrame>
      <div className="max-w-7xl mx-auto space-y-6 pb-20">
        <SetupBackNavigation 
          breadcrumbs={[{ label: "Franchises", href: "/franchises" }]} 
          label="Back to Franchises" 
          href="/franchises" 
        />
        
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-ink-lum">{detail.name}</h1>
            <div className="text-sm text-ink-sec flex items-center gap-2">
              <span>Operating Head: <span className="text-ink-lum">{detail.franchiseHead}</span></span>
              <span>·</span>
              <span className="capitalize">{detail.isInternal ? 'Internal' : 'External'} {detail.type}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SetupStatusBadge status={health.status} />
            <Button variant="primary" className="font-bold text-xs" onClick={() => router.push(nextAction.href)}>
              {nextAction.label}
            </Button>
          </div>
        </div>

        {health.missingItems.length > 0 && (
          <div className="solid rounded-xl p-5 border border-warning/20 bg-warning/5">
            <h3 className="text-sm font-medium text-warning mb-2">Issues requiring attention</h3>
            <ul className="list-disc pl-5 space-y-1">
              {health.missingItems.map((issue, idx) => (
                <li key={idx} className="text-sm text-warning/80">{issue}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="solid rounded-panel p-4 flex flex-col">
            <span className="text-ink-mut text-xs uppercase tracking-wider">Territories</span>
            <span className="text-2xl font-semibold text-ink-lum mt-1">{m.territoryCount}</span>
          </div>
          <div className="solid rounded-panel p-4 flex flex-col">
            <span className="text-ink-mut text-xs uppercase tracking-wider">Cities</span>
            <span className="text-2xl font-semibold text-ink-lum mt-1">{m.cityCount}</span>
          </div>
          <div className="solid rounded-panel p-4 flex flex-col">
            <span className="text-ink-mut text-xs uppercase tracking-wider">Venues</span>
            <span className="text-2xl font-semibold text-ink-lum mt-1">{m.venueCount}</span>
          </div>
          <div className="solid rounded-panel p-4 flex flex-col">
            <span className="text-ink-mut text-xs uppercase tracking-wider">Playing Areas</span>
            <span className="text-2xl font-semibold text-ink-lum mt-1">{playingAreasCount}</span>
          </div>
          <div className="solid rounded-panel p-4 flex flex-col">
            <span className="text-ink-mut text-xs uppercase tracking-wider">Active Events</span>
            <span className="text-2xl font-semibold text-ink-lum mt-1">{m.activeSessions}</span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-ink-lum">Child Territories</h2>
            <Button variant="secondary" onClick={() => router.push(`/territories/new?franchiseId=${detail.id}`)}>
              Add Territory
            </Button>
          </div>
          
          {detail.territories.length === 0 ? (
            <div className="solid rounded-panel p-8 flex flex-col items-center justify-center text-center">
              <p className="text-sm font-medium text-ink-lum">No territories yet</p>
              <p className="text-sm text-ink-mut mt-1">Add a territory to start organizing this franchise&apos;s operations.</p>
              <Button variant="primary" className="mt-4" onClick={() => router.push(`/territories/new?franchiseId=${detail.id}`)}>
                Add First Territory
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {detail.territories.map((t) => (
                <div key={t.id} className="solid rounded-panel p-5 flex flex-col gap-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium text-ink-lum">{t.name}</h3>
                      <div className="text-xs text-ink-mut mt-0.5">
                        {t.cities} cities · {t.venues} venues
                      </div>
                    </div>
                    <SetupStatusBadge status={t.status === "active" ? "complete" : "needs-attention"} />
                  </div>
                  
                  <div className="pt-3 border-t border-white/10 flex justify-end">
                    <Button variant="secondary" onClick={() => router.push(`/territories/${t.id}`)}>
                      Manage Territory
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageFrame>
  );
}
