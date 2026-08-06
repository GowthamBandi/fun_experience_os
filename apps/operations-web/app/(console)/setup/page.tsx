"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import {
  selectSetupHealth,
  selectNextSetupAction,
  selectSetupJourney,
} from "@/lib/prototype/selectors/setup";
import { PageHeader } from "@/components/ui/PageHeader";
import { PermissionDenied } from "@/components/ui/panels";
import { Stagger, Item } from "@/components/motion/Motion";
import {
  SetupProgress,
  SetupNextStep,
  SetupRelationshipTree,
  SetupStatusBadge,
  SetupHelpPanel,
} from "@/components/setup/shared";
import {
  Landmark,
  Globe,
  MapPin,
  Building2,
  CheckCircle2,
  AlertTriangle,
  Layers,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/primitives";

export default function SetupLandingPage() {
  const { territory, canAccess, state } = useStore();

  const health = useMemo(() => selectSetupHealth(state), [state]);
  const nextAction = useMemo(() => selectNextSetupAction(state), [state]);
  const journeySteps = useMemo(() => selectSetupJourney(state), [state]);

  if (!canAccess("/setup")) {
    return (
      <PageFrame>
        <PermissionDenied module="Setup" />
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <PageHeader
        overline={`Setup · ${territory.name}`}
        title="Set Up Your Operating Area"
        sub="Create where your company operates and where events will happen."
        right={
          <div className="flex items-center gap-3">
            <SetupStatusBadge status={health.status} />
            <Link href={nextAction.href}>
              <Button variant="primary" className="font-bold">
                {nextAction.label}
              </Button>
            </Link>
          </div>
        }
      />

      <Stagger className="mt-6 space-y-6">
        {/* Next Action Engine */}
        <Item>
          <SetupNextStep nextAction={nextAction} />
        </Item>

        {/* 5-Step Journey Progress */}
        <Item>
          <SetupProgress steps={journeySteps} />
        </Item>

        {/* Detailed 5-Step Cards */}
        <Item>
          <div className="space-y-4">
            <h2 className="text-base font-bold text-ink-lum flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-brand" />
              <span>What must be created first?</span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {journeySteps.map((s) => (
                <div
                  key={s.key}
                  className="glass p-5 rounded-2xl border border-white/5 flex flex-col justify-between space-y-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-ink-mut">STEP {s.step}</span>
                      <SetupStatusBadge status={s.status} size="sm" />
                    </div>
                    <h3 className="font-bold text-base text-ink-lum">{s.title.split(". ")[1]}</h3>
                    <p className="text-xs text-ink-sec leading-relaxed">{s.explanation}</p>
                  </div>

                  <div className="pt-2 space-y-3 border-t border-white/5">
                    <div className="flex justify-between items-center text-xs text-ink-mut">
                      <span>Registered:</span>
                      <span className="font-mono text-ink-lum font-semibold">{s.count}</span>
                    </div>
                    <Link href={s.actionHref} className="block">
                      <Button
                        variant={s.status === "complete" ? "ghost" : "primary"}
                        className="w-full justify-center h-8 text-xs font-bold"
                      >
                        {s.actionLabel}
                        <ArrowRight className="w-3.5 h-3.5 ml-1" />
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Item>

        {/* Setup Health & Issues Panel */}
        <Item>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Setup Health Overview */}
            <div className="glass p-6 rounded-2xl border border-white/5 space-y-4 lg:col-span-2">
              <div className="flex items-center justify-between border-b border-white/5 pb-4">
                <div>
                  <h3 className="text-sm font-semibold text-ink-lum flex items-center gap-2">
                    {health.status === "complete" ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    )}
                    <span>Setup Readiness & Health</span>
                  </h3>
                  <p className="text-xs text-ink-mut mt-0.5">{health.label}</p>
                </div>
                <SetupStatusBadge status={health.status} />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                  <p className="text-[10px] text-ink-mut uppercase">Franchises</p>
                  <p className="text-xl font-bold text-ink-lum mt-1">{health.franchiseCount}</p>
                </div>
                <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                  <p className="text-[10px] text-ink-mut uppercase">Territories</p>
                  <p className="text-xl font-bold text-ink-lum mt-1">{health.territoryCount}</p>
                </div>
                <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                  <p className="text-[10px] text-ink-mut uppercase">Cities</p>
                  <p className="text-xl font-bold text-ink-lum mt-1">{health.cityCount}</p>
                </div>
                <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                  <p className="text-[10px] text-ink-mut uppercase">Venues</p>
                  <p className="text-xl font-bold text-ink-lum mt-1">{health.venueCount}</p>
                </div>
                <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                  <p className="text-[10px] text-ink-mut uppercase">Playing Areas</p>
                  <p className="text-xl font-bold text-ink-lum mt-1">{health.playingAreaCount}</p>
                </div>
              </div>

              {health.missingItems.length > 0 ? (
                <div className="space-y-2 pt-2">
                  <p className="text-xs font-semibold text-amber-300">Items requiring attention before scheduling:</p>
                  <ul className="space-y-1 text-xs text-ink-sec list-disc list-inside">
                    {health.missingItems.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/40 text-emerald-300 text-xs flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                  <span>All operating areas are configured and ready for live session scheduling!</span>
                </div>
              )}
            </div>

            {/* Help Panel */}
            <div>
              <SetupHelpPanel />
            </div>
          </div>
        </Item>

        {/* Operating Structure Relationship Tree */}
        <Item>
          <SetupRelationshipTree state={state} />
        </Item>

        {/* Simple Example Section */}
        <Item>
          <div className="glass p-6 rounded-2xl border border-white/5 space-y-4">
            <h3 className="text-sm font-semibold text-ink-lum">Simple Setup Example</h3>
            <p className="text-xs text-ink-sec">
              Here is how a real operating region is structured from top to bottom:
            </p>
            <div className="bg-slate-950/60 p-4 rounded-xl border border-white/5 font-mono text-xs text-ink-sec space-y-1">
              <div className="text-amber-400 font-bold">Hyderabad Operations (Franchise)</div>
              <div>└── Madhapur Central (Territory)</div>
              <div>    └── Hyderabad (City)</div>
              <div>        └── Arena Sports Hub (Venue)</div>
              <div>            └── Badminton Court 1 (Playing Area)</div>
            </div>
          </div>
        </Item>
      </Stagger>
    </PageFrame>
  );
}

function PageFrame({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-7xl px-4 py-8 md:px-8">{children}</div>;
}
