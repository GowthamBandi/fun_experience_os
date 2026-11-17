"use client";

import { useEffect, useState } from "react";
import { Smartphone } from "lucide-react";
import { Badge, Button, Card, useToast } from "@/components/pulse";
import { setAppConfig } from "@/lib/governance-api";
import { useLiveDocument } from "@/lib/use-governance";

/**
 * Live switches for the PULSE app: a minimum build (older builds must update)
 * and a maintenance screen. Every change needs a reason and is audited.
 */
export function AppSwitchesCard() {
  const live = useLiveDocument("appConfig", "mobile");
  const toast = useToast();
  const [minBuild, setMinBuild] = useState("0");
  const [maintenance, setMaintenance] = useState(false);
  const [message, setMessage] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = live.data;
    if (!d) return;
    setMinBuild(String(typeof d.minBuild === "number" ? d.minBuild : 0));
    setMaintenance(d.maintenance === true);
    setMessage(typeof d.maintenanceMessage === "string" ? d.maintenanceMessage : "");
  }, [live.data]);

  const build = Number.parseInt(minBuild, 10);
  const valid = Number.isInteger(build) && build >= 0 && reason.trim().length >= 3 && (!maintenance || message.trim().length >= 5);

  const save = async () => {
    setSaving(true);
    try {
      await setAppConfig({ minBuild: build, maintenance, maintenanceMessage: maintenance ? message.trim() : null, reason: reason.trim() });
      toast.show({ tone: "ok", title: "App switches saved", body: maintenance ? "The app now shows the maintenance screen." : `Minimum build ${build}.` });
      setReason("");
    } catch (e) {
      toast.show({ tone: "err", title: "Couldn't save", body: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-5" data-testid="app-switches">
      <div className="mb-4 flex items-center gap-2">
        <Smartphone aria-hidden className="h-4 w-4 text-text-3" />
        <h2 className="mr-auto font-display text-[16px] font-bold text-text">App switches</h2>
        {live.data?.maintenance === true ? <Badge tone="err">Maintenance on</Badge> : <Badge tone="ok">Live</Badge>}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-[13px] text-text-2">
          Minimum app build
          <input
            inputMode="numeric"
            value={minBuild}
            onChange={(e) => setMinBuild(e.target.value.replace(/\D/g, ""))}
            className="rounded-control border border-line bg-transparent px-3 py-2 text-text"
            aria-describedby="minbuild-help"
          />
          <span id="minbuild-help" className="text-[12px] text-text-3">Builds below this number must update before using the app.</span>
        </label>
        <label className="flex items-center gap-2 self-start pt-6 text-[13px] text-text">
          <input type="checkbox" checked={maintenance} onChange={(e) => setMaintenance(e.target.checked)} />
          Maintenance screen (blocks the whole app)
        </label>
        {maintenance ? (
          <label className="flex flex-col gap-1.5 text-[13px] text-text-2 sm:col-span-2">
            Message people see
            <input value={message} onChange={(e) => setMessage(e.target.value)} maxLength={300} placeholder="PULSE is getting an upgrade. We'll be back by 6 pm." className="rounded-control border border-line bg-transparent px-3 py-2 text-text" />
          </label>
        ) : null}
        <label className="flex flex-col gap-1.5 text-[13px] text-text-2 sm:col-span-2">
          Reason (for the audit trail)
          <input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} className="rounded-control border border-line bg-transparent px-3 py-2 text-text" />
        </label>
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="volt" onClick={save} loading={saving} disabled={!valid}>Save switches</Button>
      </div>
    </Card>
  );
}
