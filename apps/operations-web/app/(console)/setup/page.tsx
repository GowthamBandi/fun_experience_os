"use client";

import { useMemo } from "react";
import { ArrowRight, Building2, Globe2, Landmark, LayoutGrid, ListChecks, MapPin, Network } from "lucide-react";
import { useStore } from "@/lib/store";
import { selectNextSetupAction, selectSetupHealth, selectSetupJourney } from "@/lib/prototype/selectors/setup";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { StatusChip } from "@/components/ui/primitives";
import { LinkButton, Notice, PageShell, Panel } from "@/components/setup/kit";
import { SetupJourney, SetupTree } from "@/components/setup/shared";

export default function SetupPage() {
  const { canAccess, state } = useStore();
  const health = useMemo(() => selectSetupHealth(state), [state]);
  const next = useMemo(() => selectNextSetupAction(state), [state]);
  const journey = useMemo(() => selectSetupJourney(state), [state]);

  if (!canAccess("/setup")) return <PermissionDenied module="Setup" />;

  const done = journey.filter((s) => s.status === "complete").length;
  const firstRun = health.franchiseCount === 0;

  return (
    <PageShell>
      <PageHeader
        overline="Operations"
        title="Setup"
        sub="Where your business operates: franchises, territories, cities, venues and the playing areas inside them. Work top to bottom — each level needs the one above it."
        right={
          <LinkButton href={next.href}>
            {next.label} <ArrowRight className="h-4 w-4" />
          </LinkButton>
        }
      />

      <section className="relative overflow-hidden rounded-panel border border-brand/20 bg-gradient-to-br from-white via-white to-brand-subtle p-5 shadow-panel sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="eyebrow text-brand">{firstRun ? "Get started" : `Next step · ${next.stepNumber} of ${journey.length}`}</p>
            <h2 className="mt-1.5 font-display text-xl font-bold text-ink-lum">{firstRun ? "Set up your first operating area" : next.label}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-mut">
              {firstRun
                ? "Your workspace is empty. Create a franchise, then a territory, city, venue and playing area. Add an activity category and an experience, and you can schedule your first session."
                : next.subtitle}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="text-right">
              <p className="font-display text-2xl font-bold text-ink-lum tabular">
                {done}/{journey.length}
              </p>
              <p className="text-xs text-ink-mut">steps complete</p>
            </div>
            <LinkButton href={next.href} size="lg">
              {next.label} <ArrowRight className="h-4 w-4" />
            </LinkButton>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white ring-1 ring-edge">
          <div className="h-full rounded-full bg-gradient-to-r from-brand to-fuchsia-500 transition-all duration-500" style={{ width: `${(done / journey.length) * 100}%` }} />
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricTile label="Franchises" value={health.franchiseCount} icon={<Landmark className="h-4 w-4" />} tone="violet" detail={health.franchiseCount ? "businesses operating" : "none yet"} />
        <MetricTile label="Territories" value={health.territoryCount} icon={<Globe2 className="h-4 w-4" />} tone="sky" detail={!health.territoryCount ? "none yet" : health.territoriesWithoutCitiesCount ? `${health.territoriesWithoutCitiesCount} without a city` : "all have a city"} />
        <MetricTile label="Cities" value={health.cityCount} icon={<MapPin className="h-4 w-4" />} tone="emerald" detail={!health.cityCount ? "none yet" : health.citiesWithoutVenuesCount ? `${health.citiesWithoutVenuesCount} without a venue` : "all have a venue"} />
        <MetricTile label="Venues" value={health.venueCount} icon={<Building2 className="h-4 w-4" />} tone="amber" detail={!health.venueCount ? "none yet" : health.venuesWithoutPlayingAreasCount ? `${health.venuesWithoutPlayingAreasCount} without a playing area` : "all have a playing area"} />
        <MetricTile label="Playing areas" value={health.playingAreaCount} icon={<LayoutGrid className="h-4 w-4" />} tone="pink" detail="courts, pitches, tables, rooms" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_1fr]">
        <Panel title="First-run checklist" sub="Eight steps from an empty workspace to a bookable session." icon={<ListChecks className="h-4 w-4" />} right={<StatusChip value={done === journey.length ? "complete" : `${done} of ${journey.length} done`} tone={done === journey.length ? "ok" : health.status === "needs-attention" ? "warn" : "info"} />}>
          <SetupJourney steps={journey} />
        </Panel>

        <div className="space-y-6">
          {health.missingItems.length > 0 && !firstRun && (
            <Notice tone="warn" title="Gaps to close before scheduling">
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {health.missingItems.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </Notice>
          )}
          <Panel title="Operating structure" sub="Select any level to open it. Collapse branches you are not working on." icon={<Network className="h-4 w-4" />}>
            <div className="max-h-[560px] overflow-y-auto">
              <SetupTree state={state} />
            </div>
          </Panel>
        </div>
      </div>
    </PageShell>
  );
}
