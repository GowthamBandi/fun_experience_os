"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useStore } from "@/lib/store";
import { territoryDetail } from "@/lib/prototype/repositories";
import { selectTerritorySetupHealth } from "@/lib/prototype/selectors/setup";
import { PageFrame } from "@/components/geo/layout";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card, PanelHeader, PermissionDenied } from "@/components/ui/panels";
import { Button } from "@/components/ui/primitives";
import { Tide } from "@/components/motion/Motion";
import { ArrowLeft, Building2 } from "lucide-react";
import { SetupBackNavigation, SetupStatusBadge, SetupPrimaryAction, SetupEmptyState } from "@/components/setup/shared";

export default function TerritoryDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const { state, canAccess, hydrated } = useStore();

  const detail = useMemo(() => territoryDetail(state, id), [state, id]);

  if (!hydrated) return <PageFrame><Tide /></PageFrame>;
  if (!canAccess("/territories")) return <PageFrame><PermissionDenied module="Territories" /></PageFrame>;

  if (!detail) {
    return (
      <PageFrame>
        <div className="solid rounded-panel p-10 text-center">
          <p className="text-sm font-medium text-ink-lum">Territory not found</p>
          <Button variant="secondary" className="mt-5" onClick={() => router.push("/territories")}>
            <ArrowLeft className="h-4 w-4" />
            Back to Territories
          </Button>
        </div>
      </PageFrame>
    );
  }

  const health = selectTerritorySetupHealth(state, detail.id);

  return (
    <PageFrame>
      <div className="mb-6 space-y-4">
        <SetupBackNavigation 
          label="Back to Territories" 
          href="/territories"
          breadcrumbs={[
            { label: "Franchises", href: "/franchises" },
            { label: detail.franchise.name, href: `/franchises/${detail.franchise.id}` }
          ]} 
        />
        <PageHeader
          overline={`Setup · Territory`}
          title={detail.name}
          sub={`Territory under ${detail.franchise.name}`}
          right={
            <SetupPrimaryAction 
              label="Add City" 
              href={`/cities/new?territoryId=${detail.id}`} 
              allowedRoles={["platform-owner", "super-admin", "regional-partner", "city-manager"]} 
            />
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <PanelHeader title="Cities in this Territory" />
            <div className="mt-4 space-y-3">
              {detail.cities.length === 0 ? (
                <SetupEmptyState
                  title="No cities added yet"
                  message="Add a city to this territory to start defining venues."
                  actionLabel="Add City"
                  actionHref={`/cities/new?territoryId=${detail.id}`}
                />
              ) : (
                detail.cities.map((c) => (
                  <div key={c.id} className="solid rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <h4 className="font-bold text-ink-lum">{c.name}</h4>
                      <p className="text-xs text-ink-mut">{c.venues} venues</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link href={`/cities/${c.id}`}>
                        <Button variant="secondary" className="text-xs h-7 px-3">View City</Button>
                      </Link>
                      <Link href={`/locations/venues/new?cityId=${c.id}`}>
                        <Button variant="primary" className="text-xs h-7 px-3">Create Venue</Button>
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <PanelHeader title="Overview" />
            <div className="mt-4 space-y-3 text-sm">
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Parent Franchise</span>
                <Link href={`/franchises/${detail.franchise.id}`} className="text-brand hover:underline font-medium">
                  {detail.franchise.name}
                </Link>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Operating Manager</span>
                <span className="text-ink-lum">{detail.managerName}</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-2">
                <span className="text-ink-mut">Cities Count</span>
                <span className="text-ink-lum">{detail.cities.length}</span>
              </div>
              <div className="flex justify-between pb-2">
                <span className="text-ink-mut">Venues Count</span>
                <span className="text-ink-lum">{detail.venues.length}</span>
              </div>
            </div>
          </Card>

          <Card>
            <PanelHeader title="Setup Health" />
            <div className="mt-4 space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-ink-mut">Current Status</span>
                <SetupStatusBadge status={health.status} />
              </div>
              {health.missingItems.length > 0 && (
                <div className="bg-amber-950/20 border border-amber-800/40 rounded-lg p-3">
                  <p className="text-xs font-semibold text-amber-400 mb-2">Missing Setup Items:</p>
                  <ul className="text-xs text-amber-200/80 list-disc pl-4 space-y-1">
                    {health.missingItems.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </PageFrame>
  );
}
