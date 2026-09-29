"use client";

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRight, Building2, LayoutGrid, Plus, ShieldCheck, Wrench } from "lucide-react";
import { useStore } from "@/lib/store";
import { venueRows } from "@/lib/prototype/repositories";
import { geoCan } from "@/lib/geo/access";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { Crumbs, LinkButton, PageShell } from "@/components/setup/kit";

export default function LocationsPage() {
  const { state, canAccess, role } = useStore();
  const venues = useMemo(() => venueRows(state), [state]);
  if (!canAccess("/locations")) return <PermissionDenied module="Locations" />;
  const areas = state.playingAreas;
  const cards = [
    { href: "/locations/venues", title: "Venues", line: "Buildings and grounds: address, safe capacity, facilities, safety plan and verification.", count: venues.length, icon: Building2, add: geoCan(role.id, "create-venue") && state.cities.length ? "/locations/venues/new" : undefined },
    { href: "/locations/playing-areas", title: "Playing areas", line: "Courts, pitches, tables and rooms inside venues. Sessions are booked onto these.", count: areas.length, icon: LayoutGrid, add: geoCan(role.id, "create-playing-area") && venues.length ? "/locations/playing-areas/new" : undefined },
  ];
  return (
    <PageShell>
      <Crumbs items={[{ label: "Setup", href: "/setup" }, { label: "Locations" }]} />
      <PageHeader overline="Setup" title="Locations" sub="Where sessions physically happen." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile label="Venues" value={venues.length} detail={`${venues.filter((v) => v.status === "ready").length} open`} icon={<Building2 className="h-4 w-4" />} />
        <MetricTile label="Verified" value={venues.filter((v) => v.verificationStatus === "verified").length} detail={`${venues.filter((v) => v.verificationStatus !== "verified").length} pending or failed`} icon={<ShieldCheck className="h-4 w-4" />} tone="emerald" />
        <MetricTile label="Playing areas" value={areas.length} detail={`${areas.filter((a) => a.status === "active").length} active`} icon={<LayoutGrid className="h-4 w-4" />} tone="pink" />
        <MetricTile label="Out of service" value={venues.filter((v) => v.status !== "ready").length + areas.filter((a) => a.status !== "active").length} detail="venues and areas in maintenance or closed" icon={<Wrench className="h-4 w-4" />} tone="amber" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {cards.map((c) => (
          <div key={c.href} className="flex flex-col justify-between gap-5 rounded-panel border border-edge bg-white p-6 shadow-panel">
            <div className="flex items-start gap-4">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-subtle text-brand"><c.icon className="h-5 w-5" /></span>
              <div>
                <h2 className="font-display text-lg font-bold text-ink-lum">{c.title} <span className="ml-1 text-ink-mut tabular">{c.count}</span></h2>
                <p className="mt-1 text-sm leading-6 text-ink-mut">{c.line}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={c.href} className="inline-flex h-10 items-center gap-2 rounded-xl border border-edge-strong bg-white px-4 text-sm font-semibold text-ink-lum shadow-lift hover:bg-bg-sunken">
                Open {c.title.toLowerCase()} <ArrowRight className="h-4 w-4" />
              </Link>
              {c.add && <LinkButton href={c.add}><Plus className="h-4 w-4" /> Add</LinkButton>}
            </div>
          </div>
        ))}
      </div>
    </PageShell>
  );
}
