"use client";

import { useStore } from "@/lib/store";
import { territoryViews, venueViews } from "@/lib/prototype/repositories";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { StatusChip, Badge, Button } from "@/components/ui/primitives";
import { Stagger, Item } from "@/components/motion/Motion";
import Link from "next/link";
import { Plus, Building2 } from "lucide-react";

export default function LocationsPage() {
  const { operator, canAccess, state } = useStore();

  if (!canAccess("/locations")) return <PageFrame><PermissionDenied module="Locations" /></PageFrame>;

  const territories = territoryViews(state);

  return (
    <PageFrame>
      <PageHeader
        overline="Locations"
        title="The map"
        sub="Territories and their venues. Scope narrows to your territory; the map stays whole."
        right={
          canAccess("/locations/venues") ? (
            <Link href="/locations/venues">
              <Button variant="secondary">
                <Building2 className="h-4 w-4" />
                Manage venues
              </Button>
            </Link>
          ) : undefined
        }
      />

      <Stagger className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2">
        {territories.map((t) => {
          const venues = venueViews(state, t.id);
          const inScope = operator?.territoryId === t.id;
          return (
            <Item key={t.id}>
              <div className="glass rounded-panel p-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-ink-lum">{t.name}</h2>
                    {inScope ? <Badge className="border border-[#f7b955]/30 bg-[#f7b955]/10 text-[#ffd28a]">in scope</Badge> : <Badge className="border border-white/8 bg-white/4 text-ink-mut">other</Badge>}
                  </div>
                  <Badge className="border border-white/8 bg-white/4 text-ink-sec">{t.fill}% fill</Badge>
                </div>
                <p className="mt-1 text-xs text-ink-mut">{t.code} · {t.venuesCount} venues · {t.tonight} missions tonight</p>
                <div className="mt-4 space-y-1.5">
                  {venues.map((v) => (
                    <Link
                      key={v.id}
                      href={`/locations/venues/${v.id}`}
                      className="solid flex items-center justify-between rounded-xl px-3 py-2 transition-colors hover:bg-white/4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm text-ink-sec">{v.name}</p>
                        <p className="text-[11px] text-ink-mut">{v.areas.join(" · ")}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="text-[11px] tabular text-ink-mut">{v.utilization}% used</span>
                        <StatusChip value={v.status} />
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </Item>
          );
        })}
      </Stagger>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}
