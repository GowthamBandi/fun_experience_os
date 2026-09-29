"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  IndianRupee,
  Plus,
  Scale,
  ShieldAlert,
  Timer,
  UserCheck,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { safetyCommandMetrics } from "@/lib/prototype/selectors/safety";
import { openDisputeCount } from "@/lib/prototype/selectors/disputes";
import {
  moderationCaseRows,
  refundExceptionRows,
} from "@/lib/prototype/selectors/moderation";
import { PageHeader } from "@/components/ui/PageHeader";
import { MetricTile, PermissionDenied } from "@/components/ui/panels";
import { cn } from "@/lib/format";
import { TabBar, GatedButton, useSafetyGate } from "@/components/safety/shared";
import { IncidentsTab } from "@/components/safety/IncidentsTab";
import { DisputesTab } from "@/components/safety/DisputesTab";
import { ModerationTab } from "@/components/safety/ModerationTab";
import { RefundExceptionsTab } from "@/components/safety/RefundExceptionsTab";
import {
  ReportIncidentDialog,
  LogDisputeDialog,
} from "@/components/safety/intake";

type Tab = "incidents" | "disputes" | "moderation" | "refunds";

export default function SafetyPage() {
  const { state, territory, canAccess } = useStore();
  const gate = useSafetyGate();
  const [tab, setTab] = useState<Tab>("incidents");
  const [scope, setScope] = useState<"territory" | "all">("territory");
  const [reporting, setReporting] = useState(false);
  const [logging, setLogging] = useState(false);

  const territoryId = scope === "territory" ? territory.id : undefined;
  const metrics = useMemo(
    () => safetyCommandMetrics(state, territoryId),
    [state, territoryId],
  );
  const disputes = useMemo(
    () => openDisputeCount(state, territoryId),
    [state, territoryId],
  );
  const cases = useMemo(
    () => moderationCaseRows(state).filter((c) => c.pending).length,
    [state],
  );
  const refunds = useMemo(
    () =>
      refundExceptionRows(state, territoryId).filter(
        (r) => r.status === "recommended" || r.status === "under-review",
      ).length,
    [state, territoryId],
  );

  if (!canAccess("/safety"))
    return <PermissionDenied module="Safety & Disputes" />;

  return (
    <>
      <div className="mx-auto w-full max-w-[1440px] space-y-6 px-5 py-7 lg:px-8">
        <PageHeader
          overline="Trust & Safety"
          title="Safety & disputes"
          sub="Respond to incidents within their deadlines, review disputes, decide moderation actions and route refund exceptions to Finance."
          right={
            <>
              <GatedButton
                gate={gate("dispute.submit")}
                variant="secondary"
                onClick={() => setLogging(true)}
              >
                <Scale className="h-4 w-4" /> Log dispute
              </GatedButton>
              <GatedButton
                gate={gate("incident.report")}
                variant="danger"
                onClick={() => setReporting(true)}
              >
                <Plus className="h-4 w-4" /> Report incident
              </GatedButton>
            </>
          }
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Open incidents"
            value={metrics.openIncidents}
            detail={`${metrics.awaitingTriage} waiting for triage`}
            icon={<ShieldAlert className="h-4 w-4" />}
            tone="violet"
            onClick={() => setTab("incidents")}
          />
          <MetricTile
            label="Past response deadline"
            value={metrics.slaBreaches}
            detail={
              metrics.slaBreaches
                ? "acknowledge or resolve now"
                : "all within target"
            }
            icon={<Timer className="h-4 w-4" />}
            tone={metrics.slaBreaches ? "rose" : "emerald"}
            onClick={() => setTab("incidents")}
          />
          <MetricTile
            label="High & critical open"
            value={metrics.criticalActive}
            detail="severity high or critical"
            icon={<AlertTriangle className="h-4 w-4" />}
            tone="amber"
            onClick={() => setTab("incidents")}
          />
          <MetricTile
            label="Decisions waiting"
            value={disputes + cases + refunds}
            detail={`${disputes} dispute${disputes === 1 ? "" : "s"} · ${cases} moderation · ${refunds} refund${refunds === 1 ? "" : "s"}`}
            icon={<Scale className="h-4 w-4" />}
            tone="sky"
            onClick={() =>
              setTab(disputes ? "disputes" : cases ? "moderation" : "refunds")
            }
          />
        </div>

        <div className="rounded-panel border border-edge bg-white shadow-panel">
          <div className="flex flex-col gap-2 border-b border-edge md:flex-row md:items-center md:justify-between md:pr-3">
            <div className="min-w-0 [&>div]:border-0">
              <TabBar<Tab>
                value={tab}
                onChange={setTab}
                tabs={[
                  {
                    id: "incidents",
                    label: "Incidents",
                    icon: ShieldAlert,
                    count: metrics.openIncidents,
                  },
                  {
                    id: "disputes",
                    label: "Disputes",
                    icon: Scale,
                    count: disputes,
                  },
                  {
                    id: "moderation",
                    label: "Moderation",
                    icon: UserCheck,
                    count: cases,
                  },
                  {
                    id: "refunds",
                    label: "Refund exceptions",
                    icon: IndianRupee,
                    count: refunds,
                  },
                ]}
              />
            </div>
            {tab !== "moderation" && (
              <div
                className="inline-flex self-start rounded-xl border border-edge bg-bg-sunken p-1 max-md:mx-3 max-md:mb-3 md:self-auto"
                role="group"
                aria-label="Territory scope"
              >
                {(["territory", "all"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setScope(s)}
                    className={cn(
                      "rounded-lg px-3 py-1.5 text-xs font-semibold",
                      scope === s
                        ? "bg-white text-brand-ink shadow-lift ring-1 ring-edge"
                        : "text-ink-mut hover:text-ink-lum",
                    )}
                  >
                    {s === "territory" ? territory.name : "All territories"}
                  </button>
                ))}
              </div>
            )}
          </div>
          {tab === "incidents" && <IncidentsTab territoryId={territoryId} />}
          {tab === "disputes" && <DisputesTab territoryId={territoryId} />}
          {tab === "moderation" && <ModerationTab />}
          {tab === "refunds" && (
            <RefundExceptionsTab territoryId={territoryId} />
          )}
        </div>
      </div>

      <ReportIncidentDialog
        open={reporting}
        onClose={() => setReporting(false)}
        defaultTerritoryId={territoryId}
      />
      <LogDisputeDialog
        open={logging}
        onClose={() => setLogging(false)}
        defaultTerritoryId={territoryId}
      />
    </>
  );
}
